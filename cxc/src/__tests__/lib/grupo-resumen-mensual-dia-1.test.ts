/**
 * ─────────────────────────────────────────────────────────────────────────────
 * CANDADO — EL RESUMEN MENSUAL DEL GRUPO CORRE EL DÍA 1, CON GUARDIA DE CIERRE
 * (4-sep-2026).
 *
 * Era el día 3, y el motivo escrito («los syncs cubren el mes anterior durante
 * los días 1-5») resultó ser de OTRO sync: `mesesCronDiario` vive en
 * sync-utilidad.ts y es un margen de la UTILIDAD. Las ventas cierran la misma
 * noche: medido sobre los últimos 4 meses cerrados, la última factura de julio
 * entró el 31-jul 19:15 UTC y la de agosto el 31-ago 19:15 UTC — cero facturas
 * después. Daniel: *«sí, lo quiero lo antes posible»*.
 *
 * Adelantar dos días quita colchón, así que entra una guardia nueva: el
 * mensaje NO sale si el sync de facturas no corrió con status='success' para
 * las 8 empresas DESPUÉS de que terminó el mes. ⚠️ La señal es la CORRIDA del
 * sync, nunca la fecha de la última factura (Fashion Wear no facturó después
 * del 28-ago y Active Wear del 27-ago estando sanas — negocio, no avería).
 *
 * Mutaciones que este archivo caza: volver el cron al día 3 → rojo · quitar la
 * guardia del cierre → rojo · la recuperación vuelve a los días 3-4 → rojo.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";

// ─── el doble de la base: switch_sync_log + la RPC del resumen ───────────────

/** Empresas con sync de cierre exitoso en el doble. Se ajusta por test. */
let empresasConCierre: Set<string>;

vi.mock("@/lib/supabase-server", () => ({
  supabaseServer: {
    from(tabla: string) {
      const filtros: Record<string, unknown> = {};
      const builder = {
        select: () => builder,
        eq: (col: string, v: unknown) => {
          filtros[col] = v;
          return builder;
        },
        gte: (col: string, v: unknown) => {
          filtros[`gte:${col}`] = v;
          return builder;
        },
        limit: async () => {
          if (tabla !== "switch_sync_log") return { data: [], error: null };
          const ok =
            filtros["sync_type"] === "facturas" &&
            filtros["status"] === "success" &&
            typeof filtros["gte:finished_at"] === "string" &&
            empresasConCierre.has(String(filtros["empresa_key"]));
          return { data: ok ? [{ id: 1 }] : [], error: null };
        },
      };
      return builder;
    },
    rpc: async (_fn: string, args: { p_anio: number }) => ({
      // Un agosto con plata para el año pedido y su anterior: la guardia del
      // $0 no puede ser la que calle en estos tests.
      data: [
        { empresa: "vistana", mes: 8, total_subtotal: args.p_anio === 2026 ? 1000 : 900 },
      ],
      error: null,
    }),
  },
}));

import {
  calcularResumenMensual,
  empresasSinSyncDeCierre,
  finDeMesPanamaIso,
} from "@/lib/grupo-resumen-mensual";
import { ALL_EMPRESA_KEYS } from "@/lib/empresa-mapping";

beforeEach(() => {
  empresasConCierre = new Set(ALL_EMPRESA_KEYS);
});

/** Código SIN comentarios: en este repo un barrido ya se cumplió cuatro veces
 *  con el comentario que explicaba el cambio. */
function sinComentarios(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
}
const leer = (rel: string) => sinComentarios(fs.readFileSync(path.join(process.cwd(), rel), "utf8"));

// ─── el día 1 ────────────────────────────────────────────────────────────────

describe("🔴 el cron corre el DÍA 1 a las 13:00 UTC", () => {
  it("vercel.json lo dice — volver al día 3 pone esto en rojo", () => {
    const vercel = JSON.parse(fs.readFileSync(path.join(process.cwd(), "vercel.json"), "utf8")) as {
      crons: Array<{ path: string; schedule: string }>;
    };
    const entradas = vercel.crons.filter((c) => c.path === "/api/cron/grupo-resumen-mensual");
    expect(entradas).toHaveLength(1);
    expect(entradas[0].schedule).toBe("0 13 1 * *");
  });

  it("la recuperación de la reconciliación aplica los días 1-2, con su ventana desde el día 1", () => {
    const src = leer("src/app/api/cron/switch-reconciliacion/route.ts");
    const desde = src.indexOf('cronName: "grupo-resumen-mensual"');
    expect(desde).toBeGreaterThan(-1);
    const hasta = src.indexOf("cronName:", desde + 10);
    const bloque = src.slice(desde, hasta);
    expect(bloque).toMatch(/dia === 1 \|\| dia === 2/);
    expect(bloque).toContain("-01T00:00:00-05:00");
    expect(bloque).not.toMatch(/dia === 3/);
  });
});

// ─── la guardia del cierre ───────────────────────────────────────────────────

describe("🔴 sin el cierre sincronizado de las 8, el resumen NO sale", () => {
  it("una empresa sin sync de cierre → error que la nombra (cae en logCronError, no en Telegram del grupo)", async () => {
    empresasConCierre.delete("fashion_wear");
    await expect(calcularResumenMensual(2026, 8)).rejects.toThrow(/fashion_wear/);
  });

  it("varias sin cierre → el error las lista todas", async () => {
    empresasConCierre.delete("joystep");
    empresasConCierre.delete("active_wear");
    const faltan = await empresasSinSyncDeCierre(2026, 8);
    expect(faltan).toEqual(["active_wear", "joystep"]);
  });

  it("CONTROL — con las 8 en success, el resumen SALE (la guardia no calla de más)", async () => {
    const r = await calcularResumenMensual(2026, 8);
    expect(r.total).toBeGreaterThan(0);
    expect(r.empresas).toHaveLength(8);
  });

  it("la señal es la CORRIDA del sync: el doble solo acepta sync_type='facturas' + status='success' + finished_at ≥ fin del mes", async () => {
    // Si la consulta dejara de filtrar por esas tres cosas, el doble
    // devolvería vacío para TODAS y este test (y el CONTROL) se pondrían rojos.
    expect(await empresasSinSyncDeCierre(2026, 8)).toEqual([]);
  });
});

describe("finDeMesPanamaIso — el mes termina a medianoche de PANAMÁ", () => {
  it("agosto 2026 termina el 1-sep 00:00 Panamá = 05:00 UTC", () => {
    expect(finDeMesPanamaIso(2026, 8)).toBe("2026-09-01T05:00:00.000Z");
  });
  it("diciembre cruza el año", () => {
    expect(finDeMesPanamaIso(2026, 12)).toBe("2027-01-01T05:00:00.000Z");
  });
});

/**
 * Comisiones — paridad RESUMEN (comision_b2b_v6) vs DETALLE (comision_b2b_detalle v3).
 *
 * REGLA: el modal de detalle lista TODO lo que el resumen suma y su total cierra
 * EXACTAMENTE (al centavo) con la fila de la tabla. El bug original (jul-2026):
 * el detalle filtraba VENTAS por CARTERA mientras el resumen v5 atribuye por
 * VENDEDOR DE FACTURA → a DANIEL LEVY (vistana) le faltaban las 5 FA de City
 * Mall Paso Canoa + 4 NC (cartera EDWIN) y el modal cerraba en -468.00/2.66 en
 * vez de 43,796.50/223.98.
 *
 * NO corren en `npm test` por defecto: pegan contra la DB de producción
 * (read-only) y requieren la DDL 20260911120000 aplicada (v6 + detalle v3). Para correrlos:
 *   RUN_DB_TESTS=1 npx vitest run src/__tests__/integration/comisiones-detalle-rpc.test.ts
 *
 * Requiere NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY en .env.local.
 */
import { describe, it, expect, beforeAll, vi } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

// empresa-mapping importa supabase-server en el top-level (construye el cliente
// con env vars). En el test runner esas env no existen, así que lo mockeamos.
vi.mock("@/lib/supabase-server", () => ({ supabaseServer: { from: vi.fn() } }));

import { B2B_EMPRESA_KEYS } from "@/lib/empresa-mapping";

const RUN = !!process.env.RUN_DB_TESTS;

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

interface FilaResumen {
  vendedor: string;
  base: number;
  comision: number;
  base_cobro: number;
  comision_cobro: number;
  comision_total: number;
}
interface Detalle {
  ventas: Array<{ secuencial: string; tipo: string; subtotal: number }>;
  cobros: Array<{ monto: number }>;
  ventas_base: number;
  cobros_base: number;
  comision_venta: number;
  comision_cobro: number;
  comision_total: number;
}

function loadEnv(): Record<string, string> {
  try {
    const env: Record<string, string> = {};
    for (const line of readFileSync(".env.local", "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
    return env;
  } catch {
    return {};
  }
}

// Desde el 3-sep-2026 el resumen es comision_b2b_v6 (cobro a quien REGISTRÓ el
// recibo) y el detalle es la v3 de la misma DDL. La paridad se exige contra la
// versión VIGENTE: correr esto contra una base donde la DDL 20260911120000 no
// corrió falla en la primera RPC, y eso es lo correcto (no hay paridad que
// verificar entre un resumen viejo y un detalle nuevo).
describe.skipIf(!RUN)("comisiones detalle ≡ resumen v6 (al centavo)", () => {
  let sb: SupabaseClient;

  beforeAll(() => {
    const env = loadEnv();
    const url = env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error("Faltan credenciales Supabase para los tests de integración");
    sb = createClient(url, key, { auth: { persistSession: false } });
  });

  // Paridad TOTAL: para CADA vendedor del resumen, el detalle devuelve las mismas
  // bases y comisiones, y la suma de los documentos listados cierra con la base.
  async function paridadEmpresaMes(empresa: string, year: number, mes: number) {
    const { data: resumen, error: e1 } = await sb.rpc("comision_b2b_v6", {
      p_empresa_key: empresa, p_year: year, p_mes: mes,
    });
    expect(e1).toBeNull();
    const filas = (resumen?.vendedores ?? []) as FilaResumen[];

    for (const fila of filas) {
      const { data: det, error: e2 } = await sb.rpc("comision_b2b_detalle", {
        p_empresa_key: empresa, p_year: year, p_mes: mes, p_vendedor: fila.vendedor,
      });
      expect(e2).toBeNull();
      const d = det as Detalle;
      const ctx = `${empresa} ${year}-${mes} ${fila.vendedor}`;

      // Bases y comisiones idénticas a la tabla, al centavo.
      expect(d.ventas_base, `${ctx}: ventas_base`).toBe(fila.base);
      expect(d.cobros_base, `${ctx}: cobros_base`).toBe(fila.base_cobro);
      expect(d.comision_venta, `${ctx}: comision_venta`).toBe(fila.comision);
      expect(d.comision_cobro, `${ctx}: comision_cobro`).toBe(fila.comision_cobro);
      expect(round2(d.comision_total), `${ctx}: comision_total`).toBe(round2(fila.comision_total));

      // La lista de documentos SUMA la base (nada oculto fuera de la lista).
      const sumaVentas = round2(d.ventas.reduce((s, v) => s + Number(v.subtotal), 0));
      expect(sumaVentas, `${ctx}: Σ docs ventas`).toBe(fila.base);
      const sumaCobros = round2(d.cobros.reduce((s, c) => s + Number(c.monto), 0));
      expect(sumaCobros, `${ctx}: Σ cobros`).toBe(fila.base_cobro);
    }
  }

  it("paridad en TODAS las empresas B2B — julio 2026 (mes del bug)", async () => {
    for (const emp of B2B_EMPRESA_KEYS) await paridadEmpresaMes(emp, 2026, 7);
  }, 120_000);

  it("paridad mes anterior (bordes timestamptz distintos) — vistana + fashion_shoes jun-2026", async () => {
    await paridadEmpresaMes("vistana", 2026, 6);
    await paridadEmpresaMes("fashion_shoes", 2026, 6);
  }, 60_000);

  it("CASO CRUZADO real: DANIEL LEVY / vistana / jul-2026 lista los docs vendidos a carteras ajenas", async () => {
    const { data: det, error } = await sb.rpc("comision_b2b_detalle", {
      p_empresa_key: "vistana", p_year: 2026, p_mes: 7, p_vendedor: "DANIEL LEVY",
    });
    expect(error).toBeNull();
    const d = det as Detalle;
    const secuenciales = new Set(d.ventas.map((v) => v.secuencial));

    // Su cartera (Dana Mall) — ya salían antes del fix.
    expect(secuenciales).toContain("11-000002973");
    expect(secuenciales).toContain("13-000000793");
    // Vendidos a clientes de la cartera de EDWIN (City Mall) — los que faltaban.
    for (const s of ["11-000002990", "11-000002991", "11-000002992", "11-000002993", "11-000002994"]) {
      expect(secuenciales, `falta FA ${s} (City Mall, cartera EDWIN)`).toContain(s);
    }
    for (const s of ["13-000000800", "13-000000801", "13-000000802", "13-000000803"]) {
      expect(secuenciales, `falta NC ${s} (City Mall, cartera EDWIN)`).toContain(s);
    }
    // Factura con utilidad ≤20%: se lista con aporte 0 (no comisiona).
    expect(secuenciales).toContain("11-000002995");
    const rjasa = d.ventas.find((v) => v.secuencial === "11-000002995");
    expect(Number(rjasa?.subtotal)).toBe(0);
  }, 30_000);
});

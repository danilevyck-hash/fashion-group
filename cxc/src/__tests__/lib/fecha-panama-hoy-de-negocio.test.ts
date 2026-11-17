/**
 * 🔴 EL «HOY» QUE SE GUARDA ES EL DE PANAMÁ (17-nov-2026). Quedaban cuatro
 * lugares con `new Date().toISOString().slice(0, 10)` (UTC): de 7 p. m. en
 * adelante el período de Caja se abría y se cerraba con la fecha de MAÑANA, el
 * traslado de Despachos nacía con la de mañana y el «hasta» de los clientes
 * mayoristas de Multifashion pedía hasta mañana.
 *
 * Candado 1: a las 8 p. m. de Panamá el período abre con la fecha de Panamá.
 * Candado 2: barrido — esos cuatro archivos no vuelven a la UTC.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const insertados: Array<Record<string, unknown>> = [];

vi.mock("@/lib/log-activity", () => ({ logActivity: vi.fn(async () => {}) }));
vi.mock("@/lib/supabase-server", () => {
  const consulta = (resultado: unknown) => {
    const q: Record<string, unknown> = {};
    for (const m of ["select", "eq", "order", "limit"]) q[m] = () => q;
    q.maybeSingle = async () => ({ data: null, error: null });
    q.single = async () => ({ data: resultado, error: null });
    return q;
  };
  return {
    supabaseServer: {
      from: () => ({
        ...consulta({ numero: 7 }),
        insert: (fila: Record<string, unknown>) => {
          insertados.push(fila);
          return consulta({ id: "p-8", numero: 8, ...fila });
        },
      }),
    },
  };
});

describe("Caja abre el período con la fecha de Panamá", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    // 8 p. m. del 16 de noviembre en Panamá = 01:00Z del 17: en UTC ya es mañana.
    vi.setSystemTime(new Date("2026-11-17T01:00:00Z"));
    insertados.length = 0;
  });
  afterEach(() => vi.useRealTimers());

  it("a las 8 p. m. la apertura dice 2026-11-16, no 2026-11-17", async () => {
    const { abrirPeriodo } = await import("@/lib/caja/abrir-periodo");
    const r = await abrirPeriodo(200, "capturas");
    expect(r.motivo).toBeNull();
    expect(insertados[0]?.fecha_apertura).toBe("2026-11-16");
  });
});

describe("barrido: el «hoy» de negocio no vuelve a la UTC", () => {
  const RAIZ = join(__dirname, "..", "..");
  const UTC_HOY = /new Date\(\)\s*\.toISOString\(\)\s*\.\s*(slice\(0,\s*10\)|substring\(0,\s*10\)|split\(["']T["']\)\[0\])/;
  it.each([
    "app/api/caja/periodos/[id]/route.ts", // fecha_cierre
    "lib/caja/abrir-periodo.ts", // fecha_apertura
    "lib/guias/pedido-detalle-server.ts", // fecha del traslado
    "app/api/multifashion/clientes-wholesale/route.ts", // «hasta» por defecto
  ])("%s usa hoyPanama()", (rel) => {
    const src = readFileSync(join(RAIZ, rel), "utf8");
    expect(src).not.toMatch(UTC_HOY);
    expect(src).toMatch(/hoyPanama\(\)/);
  });
});

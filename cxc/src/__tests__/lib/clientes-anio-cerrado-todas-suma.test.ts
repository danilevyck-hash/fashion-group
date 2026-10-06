// ─────────────────────────────────────────────────────────────────────────────
// CANDADO — Ventas › Clientes, «Todas» + año CERRADO = la suma de las 6
// empresas filtradas por separado (5-oct-2026).
//
// 🩸 La RPC `clientes_anio(año, NULL)` filtraba la empresa principal en el
// WHERE, que Postgres evalúa ANTES de sus SUM() OVER: City Mall Paso Canoa
// (D-25), 2025, salía con $958.537,92 (solo Fashion Wear) y le compró
// $2.342.125,65 a las seis. El año en curso (vista agregada) sumaba bien.
// Hoy el servidor pide empresa por empresa y junta con `unaFilaPorCliente`.
// Este mock devuelve, para `p_empresa = NULL`, lo que devolvía la RPC rota:
// si alguien vuelve a pedir «Todas» de una, el test se pone rojo.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi } from "vitest";

const fila = (empresa: string, ytd: number, prev: number, ultima: string) => ({
  cliente_norm: "D-25", cliente_id: "u-25", cliente_nombre: "City Mall Paso Canoa",
  cliente_codigo: "D-25", empresa, compras_ytd: String(ytd), compras_anio_anterior: String(prev),
  delta_vs_2025: null, ultima_compra: ultima, whatsapp: null, empresas_count: 1, empresas_breakdown: null,
});
const POR_EMPRESA: Record<string, ReturnType<typeof fila>[]> = {
  fashion_wear: [fila("fashion_wear", 958537.92, 1000000, "2025-12-20")],
  fashion_shoes: [fila("fashion_shoes", 580914.43, 500000, "2025-12-29")],
  vistana: [fila("vistana", 559164.8, 0, "2025-11-02")],
};
const llamadas: (string | null)[] = [];

vi.mock("@/lib/supabase-server", () => ({
  HAS_SERVICE_ROLE: true,
  supabaseServer: {
    rpc: async (_fn: string, args: { p_empresa: string | null }) => {
      llamadas.push(args.p_empresa);
      // La RPC rota: una fila por cliente con SOLO la venta de su principal.
      if (args.p_empresa == null) return { data: [{ ...POR_EMPRESA.fashion_wear[0], empresas_count: 1 }], error: null };
      return { data: POR_EMPRESA[args.p_empresa] ?? [], error: null };
    },
  },
}));

import { fetchClientes } from "@/lib/ventas/queries";
import { B2B_EMPRESA_KEYS } from "@/lib/empresa-mapping";

describe("«Todas» en un año cerrado", () => {
  it("🔴 suma las empresas, con año anterior, Δ, última compra y desglose", async () => {
    llamadas.length = 0;
    const r = await fetchClientes({ year: 2025, empresaKey: null });
    expect(llamadas).not.toContain(null);
    expect([...llamadas].sort()).toEqual([...B2B_EMPRESA_KEYS].sort());
    expect(r.rows).toHaveLength(1);
    const c = r.rows[0];
    expect(c.ytd).toBeCloseTo(958537.92 + 580914.43 + 559164.8, 2);
    expect(c.prev).toBe(1500000);
    expect(c.delta).toBeCloseTo((2098617.15 - 1500000) / 1500000, 6);
    expect(c.ultimaIso).toBe("2025-12-29");
    expect(c.empresaKey).toBe("fashion_wear");
    expect(c.empresas_count).toBe(3);
    expect(c.empresas_breakdown?.map(b => b.monto)).toEqual([958537.92, 580914.43, 559164.8]);
  });

  it("una empresa sola sigue siendo una sola llamada con su empresa", async () => {
    llamadas.length = 0;
    const r = await fetchClientes({ year: 2025, empresaKey: "vistana" });
    expect(llamadas).toEqual(["vistana"]);
    expect(r.rows[0].ytd).toBe(559164.8);
    expect(r.rows[0].empresas_breakdown).toBeUndefined();
  });
});

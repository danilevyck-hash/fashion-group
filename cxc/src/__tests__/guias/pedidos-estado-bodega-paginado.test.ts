// 🩸 `db-max-rows` = 1000 corta EN SILENCIO: el estado de bodega se lee PAGINADO.
// Si vuelve el `.limit(5000)`, un pedido que cae pasada la fila 1000 pierde su
// estado y la lista lo muestra «Pendiente». El doble corta en 1000 como PostgREST.
import { describe, it, expect, vi } from "vitest";

const TOTAL = 1005;
const estados = Array.from({ length: TOTAL }, (_, i) => ({
  empresa_key: "vistana",
  pedido_switch_id: i + 1,
  estado: "preparado",
  bultos: 3,
}));

vi.mock("@/lib/requireRole", () => ({
  requireRole: () => ({ role: "admin", userId: "u1", userName: "Daniel" }),
}));

function doble(tabla: string) {
  let rango: [number, number] | null = null;
  const filas =
    tabla === "pedidos_bodega_estado"
      ? estados
      : tabla === "switch_pedidos"
        ? [{ empresa_key: "vistana", pedido_switch_id: TOTAL, secuencial: "1", fecha: "2026-11-01", cliente_codigo: "D-1", cliente_nombre: "X", vendedor_nombre: null, synced_at: "2026-11-01T00:00:00Z" }]
        : [];
  const c: Record<string, unknown> = {};
  for (const m of ["select", "eq", "in", "order", "is", "or", "gte", "lte", "not", "neq", "limit"]) c[m] = () => c;
  c.range = (a: number, b: number) => { rango = [a, b]; return c; };
  c.then = (ok: (v: unknown) => unknown) => {
    // Sin `.range()` PostgREST corta en 1000; con él, entrega la página pedida.
    const data = rango ? filas.slice(rango[0], rango[1] + 1) : filas.slice(0, 1000);
    return Promise.resolve({ data, error: null, count: filas.length }).then(ok);
  };
  return c;
}
vi.mock("@/lib/supabase-server", () => ({
  supabaseServer: { from: (t: string) => doble(t), rpc: async () => ({ data: [], error: null }) },
}));

describe("Despachos › Pedidos: el estado de bodega no se corta en 1000", () => {
  it("un pedido pasada la fila 1000 conserva su estado", async () => {
    const { GET } = await import("@/app/api/guias/pedidos/route");
    const res = await GET({ url: "http://x/api/guias/pedidos", nextUrl: new URL("http://x/api/guias/pedidos") } as never);
    const json = (await res.json()) as { pedidos?: { pedido_switch_id: number; estado: string; bultos: number | null }[] };
    expect(res.status).toBe(200);
    const p = json.pedidos?.find((x) => x.pedido_switch_id === TOTAL);
    expect(p?.estado).toBe("preparado");
    expect(p?.bultos).toBe(3);
  });
});

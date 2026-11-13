// 🔴 13-nov-2026 (Daniel): generar la etiqueta de una factura cuyo pedido está
// Preparado lo marca Recibido, en el servidor, con firma y rastro.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const updates: Array<{ fila: Record<string, unknown>; eqs: Array<[string, unknown]> }> = [];
const logs: unknown[] = [];
let estadoPedido = "preparado";

vi.mock("@/lib/log-activity", () => ({ logActivity: vi.fn(async (...a: unknown[]) => { logs.push(a); }) }));
vi.mock("@/lib/supabase-server", () => {
  const consulta = (tabla: string) => {
    const eqs: Array<[string, unknown]> = [];
    let fila: Record<string, unknown> | null = null;
    const q: Record<string, unknown> = {
      select: () => q,
      in: () => q,
      eq: (c: string, v: unknown) => { eqs.push([c, v]); return q; },
      update: (f: Record<string, unknown>) => { fila = f; return q; },
      then: (ok: (r: unknown) => unknown) => {
        if (fila) { updates.push({ fila, eqs }); return Promise.resolve({ error: null }).then(ok); }
        if (tabla === "switch_facturas") {
          return Promise.resolve({ data: [{ switch_factura_id: 9151, pedido_referencia: "16-000002463" }, { switch_factura_id: 1, pedido_referencia: null }], error: null }).then(ok);
        }
        const data = estadoPedido === "preparado" ? [{ empresa_key: "vistana", pedido_switch_id: 2463, estado: "preparado", bultos: 3 }] : [];
        return Promise.resolve({ data, error: null }).then(ok);
      },
    };
    return q;
  };
  return { supabaseServer: { from: consulta } };
});

import { recibirPedidosDeEtiquetas } from "@/lib/guias/pedido-recibido-por-etiqueta";

beforeEach(() => { updates.length = 0; logs.length = 0; estadoPedido = "preparado"; });

describe("pedido Recibido al generar la etiqueta", () => {
  it("el pedido Preparado de la factura pasa a Recibido con la firma de quien etiquetó", async () => {
    const r = await recibirPedidosDeEtiquetas("vistana", [9151, 1, null], "julio", "bodega", "julio");
    expect(r).toEqual(["16-000002463"]);
    expect(updates).toHaveLength(1);
    expect(updates[0].fila).toMatchObject({ estado: "recibido", recibido_por: "julio", cambiado_por: "julio" });
    // No pisa un pedido que otra persona movió.
    expect(updates[0].eqs).toContainEqual(["estado", "preparado"]);
    expect(updates[0].eqs).toContainEqual(["pedido_switch_id", 2463]);
    expect(logs).toHaveLength(1);
    expect(JSON.stringify(logs[0])).toContain("recibido_por_etiqueta");
  });

  it("sin pedido Preparado no escribe nada", async () => {
    estadoPedido = "recibido";
    expect(await recibirPedidosDeEtiquetas("vistana", [9151], "julio", "bodega")).toEqual([]);
    expect(updates).toHaveLength(0);
  });

  it("sin facturas (traslado) no consulta nada", async () => {
    expect(await recibirPedidosDeEtiquetas("vistana", [null], "julio", "bodega")).toEqual([]);
  });

  it("la ruta de Etiquetas lo llama en los dos caminos, después de guardar", () => {
    const ruta = readFileSync(join(process.cwd(), "src/app/api/guias/etiquetas/route.ts"), "utf8");
    expect(ruta.match(/await recibirPedidosDeEtiquetas\(/g)?.length).toBe(2);
  });
});

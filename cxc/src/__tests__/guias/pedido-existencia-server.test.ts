/**
 * 🔴 La existencia del pedido sale de la BASE (`switch_articulo_info`, empresa +
 * código), nunca de Switch al abrir; sin dato o con la lectura caída, `null`.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

let filtros: Record<string, unknown> = {};
let respuesta: { data: unknown; error: unknown } = { data: [], error: null };
const tablas: string[] = [];
vi.mock("@/lib/supabase-server", () => ({
  supabaseServer: {
    from: (t: string) => {
      tablas.push(t);
      const c: Record<string, unknown> = {};
      c.select = () => c;
      c.eq = (k: string, v: unknown) => { filtros[k] = v; return c; };
      c.in = (k: string, v: unknown) => { filtros[k] = v; return c; };
      c.then = (ok: (r: unknown) => unknown) => Promise.resolve(respuesta).then(ok);
      return c;
    },
  },
}));
vi.mock("@/lib/switch-api/client", () => ({ createSwitchClient: () => { throw new Error("no se llama a Switch"); } }));

import { conExistencia } from "@/lib/guias/pedido-detalle-server";

const linea = (codigo: string) => ({ codigo_barra_id: 1, codigo, descripcion: "x", talla: null, color: null, cantidad: 1, precio: null, total: null, bulto: null });

beforeEach(() => { filtros = {}; tablas.length = 0; respuesta = { data: [], error: null }; });

describe("conExistencia", () => {
  it("por empresa y código, de switch_articulo_info", async () => {
    respuesta = { data: [{ codigo: "A1", existencia: 14 }, { codigo: "B2", existencia: "0" }], error: null };
    const r = await conExistencia("fashion_shoes", [linea("A1"), linea("B2"), linea("C3")]);
    expect(tablas).toEqual(["switch_articulo_info"]);
    expect(filtros).toEqual({ empresa_key: "fashion_shoes", codigo: ["A1", "B2", "C3"] });
    expect(r.map((l) => l.existencia)).toEqual([14, 0, null]);
  });
  it("lectura caída: todas sin dato, nunca 0", async () => {
    respuesta = { data: null, error: { message: "x" } };
    const r = await conExistencia("vistana", [linea("A1")]);
    expect(r[0].existencia).toBeNull();
  });
});

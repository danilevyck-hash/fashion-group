/**
 * 🔴 25-nov-2026: la guía NO se completa con una factura sin amarre a Switch
 * (ni por el PUT del despacho ni por el PATCH rápido), y al completarse ata
 * sola las etiquetas de sus facturas. Se LLAMA a los handlers.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/require-auth", () => ({ getSession: () => ({ role: "bodega", userName: "Bodega" }) }));
vi.mock("@/lib/requireRole", () => ({ requireRole: () => ({ role: "bodega", userName: "Bodega" }) }));
vi.mock("@/lib/log-activity", () => ({ logActivity: async () => {} }));
vi.mock("@/lib/alertas/canal", () => ({ enviarNegocio: async () => {}, enviarNegocioPrivado: async () => {} }));

let faltan: string[] = [];
let atadas: string[] = [];
vi.mock("@/lib/guias/amarre-facturas-server", () => ({
  faltaAmarrarAlCompletar: async () => faltan,
  atarEtiquetasAlCompletar: async (id: string) => { atadas.push(id); return 1; },
}));

const GUIA_ID = "11111111-1111-4111-8111-111111111111";
let escrituras: Array<{ tabla: string; datos: unknown }>;

function tablaDoble(tabla: string) {
  const resultado = () => {
    if (tabla === "guia_transporte")
      return { data: { id: GUIA_ID, numero: 313, estado: "Pendiente Bodega", entregado_por: "Julio", placa: "", tipo_despacho: "directo", guia_items: [] }, error: null };
    if (tabla === "guia_items") return { data: [{ id: "i1", bultos: 22, empresa: "Fashion Shoes", facturas: "2943" }], error: null };
    return { data: [], error: null };
  };
  const cadena: Record<string, unknown> = {};
  for (const m of ["select", "eq", "neq", "in", "is", "gte", "lt", "order", "limit"]) cadena[m] = () => cadena;
  cadena.single = async () => resultado();
  cadena.maybeSingle = async () => resultado();
  cadena.update = (datos: unknown) => { escrituras.push({ tabla, datos }); return cadena; };
  cadena.then = (ok: (v: unknown) => unknown) => Promise.resolve(resultado()).then(ok);
  return cadena;
}
vi.mock("@/lib/supabase-server", () => ({ supabaseServer: { from: (t: string) => tablaDoble(t) } }));

beforeEach(() => { escrituras = []; atadas = []; faltan = []; });

const DESPACHO = {
  estado: "Completada", tipo_despacho: "directo", nombre_chofer: "Luis", entregado_por: "Julio",
  receptor_nombre: "Shti", cedula: "147", firma_base64: "a", firma_entregador_base64: "b",
};
const req = (body: unknown) => ({ json: async () => body }) as never;

describe("🔴 completar con una factura sin amarre", () => {
  it("PUT: 400 con el renglón señalado, y no se escribe la guía", async () => {
    faltan = ["Renglón 1: la factura 2943 no está en Fashion Shoes"];
    const { PUT } = await import("@/app/api/guias/[id]/route");
    const res = await PUT(req(DESPACHO), { params: { id: GUIA_ID } });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toMatch(/Falta amarrar 1 factura — Renglón 1: la factura 2943/);
    expect(escrituras.filter((e) => e.tabla === "guia_transporte")).toHaveLength(0);
    expect(atadas).toEqual([]);
  });

  it("PATCH: también 400", async () => {
    faltan = ["Renglón 1: la factura 2943 no está en Fashion Shoes"];
    const { PATCH } = await import("@/app/api/guias/[id]/route");
    const res = await PATCH(req({ estado: "Completada" }), { params: { id: GUIA_ID } });
    expect(res.status).toBe(400);
    expect(escrituras).toHaveLength(0);
  });
});

describe("🔴 completar con todo amarrado", () => {
  it("PUT: se completa y ata las etiquetas de sus facturas", async () => {
    const { PUT } = await import("@/app/api/guias/[id]/route");
    const res = await PUT(req(DESPACHO), { params: { id: GUIA_ID } });
    expect(res.status).toBe(200);
    expect(atadas).toEqual([GUIA_ID]);
  });

  it("PATCH: se completa y ata las etiquetas", async () => {
    const { PATCH } = await import("@/app/api/guias/[id]/route");
    const res = await PATCH(req({ estado: "Completada" }), { params: { id: GUIA_ID } });
    expect(res.status).toBe(200);
    expect(atadas).toEqual([GUIA_ID]);
  });

  it("guardar SIN completar no pregunta por el amarre", async () => {
    faltan = ["Renglón 1: la factura 2943 no está en Fashion Shoes"];
    const { PATCH } = await import("@/app/api/guias/[id]/route");
    const res = await PATCH(req({ observaciones: "x" }), { params: { id: GUIA_ID } });
    expect(res.status).toBe(200);
    expect(atadas).toEqual([]);
  });
});

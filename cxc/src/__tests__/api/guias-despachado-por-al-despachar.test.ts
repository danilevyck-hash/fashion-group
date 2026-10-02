/**
 * ─────────────────────────────────────────────────────────────────────────────
 * «DESPACHADO POR» SE PIDE AL COMPLETAR, NO AL CREAR (1-oct-2026, Daniel aprobó
 * el mockup). La validación se MUDA, no desaparece:
 *   · `POST /api/guias` crea la guía sin quien despacha (nunca lo exigió);
 *   · `PUT /api/guias/[id]` con `estado: "Completada"` lo exige — el que viene
 *     en el cuerpo o, si no viene, el que la guía ya tenía (guías viejas);
 *   · `PATCH /api/guias/[id]` al completar, igual.
 * El centinela «Otro…» (`__other__`) no cuenta como nombre.
 * Se LLAMA a los handlers y se mira qué contestan y qué se escribió.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/require-auth", () => ({
  getSession: () => ({ role: "bodega", userName: "Bodega" }),
}));
vi.mock("@/lib/requireRole", () => ({
  requireRole: () => ({ role: "bodega", userName: "Bodega" }),
}));
vi.mock("@/lib/log-activity", () => ({ logActivity: async () => {} }));
vi.mock("@/lib/alertas/canal", () => ({ enviarNegocio: async () => {} }));

const GUIA_ID = "11111111-1111-4111-8111-111111111111";

let guiaFila: Record<string, unknown>;
let escrituras: Array<{ tabla: string; datos: unknown }>;

function tablaDoble(tabla: string) {
  const resultado = () => {
    if (tabla === "guia_transporte") return { data: guiaFila, error: null };
    if (tabla === "guia_items") return { data: [{ id: "i1", bultos: 5 }], error: null };
    return { data: [], error: null };
  };
  const cadena: Record<string, unknown> = {};
  for (const m of ["select", "eq", "neq", "in", "gte", "lt", "order", "limit"]) cadena[m] = () => cadena;
  cadena.single = async () => resultado();
  cadena.maybeSingle = async () => resultado();
  cadena.update = (datos: unknown) => { escrituras.push({ tabla, datos }); return cadena; };
  cadena.insert = (datos: unknown) => { escrituras.push({ tabla, datos }); return cadena; };
  cadena.then = (ok: (v: unknown) => unknown) => Promise.resolve(resultado()).then(ok);
  return cadena;
}

vi.mock("@/lib/supabase-server", () => ({
  supabaseServer: { from: (tabla: string) => tablaDoble(tabla) },
}));

beforeEach(() => {
  escrituras = [];
  guiaFila = { id: GUIA_ID, numero: 272, estado: "Pendiente Bodega", entregado_por: null, placa: "", tipo_despacho: "externo", guia_items: [] };
});

const DESPACHO = {
  estado: "Completada",
  tipo_despacho: "externo",
  placa: "AB-1234",
  receptor_nombre: "Juan",
  cedula: "8-888-8888",
  firma_base64: "data:image/png;base64,AAA",
  firma_entregador_base64: "data:image/png;base64,BBB",
};

async function put(body: Record<string, unknown>) {
  const { PUT } = await import("@/app/api/guias/[id]/route");
  const res = await PUT({ json: async () => body } as never, { params: { id: GUIA_ID } });
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}
async function patch(body: Record<string, unknown>) {
  const { PATCH } = await import("@/app/api/guias/[id]/route");
  const res = await PATCH({ json: async () => body } as never, { params: { id: GUIA_ID } });
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

describe("🔴 PUT al completar: «Despachado por» es obligatorio", () => {
  it("sin quien despacha (ni en el cuerpo ni guardado) → 400 y no se escribe nada", async () => {
    const r = await put(DESPACHO);
    expect(r.status).toBe(400);
    expect(r.json.error).toBe("Despachado por requerido");
    expect(escrituras).toEqual([]);
  });

  it("con «Otro…» (el centinela) tampoco", async () => {
    const r = await put({ ...DESPACHO, entregado_por: "__other__" });
    expect(r.status).toBe(400);
  });

  it("con quien despacha → se completa y se GUARDA el nombre", async () => {
    const r = await put({ ...DESPACHO, entregado_por: "Jorman" });
    expect(r.status).toBe(200);
    const cabecera = escrituras.find((e) => e.tabla === "guia_transporte");
    expect(cabecera?.datos).toMatchObject({ estado: "Completada", entregado_por: "Jorman" });
  });

  it("una guía VIEJA que ya lo tenía guardado se completa sin mandarlo otra vez", async () => {
    guiaFila = { ...guiaFila, entregado_por: "Julio" };
    const r = await put(DESPACHO);
    expect(r.status).toBe(200);
  });

  it("editar una guía PENDIENTE (sin completar) no lo pide", async () => {
    const r = await put({ observaciones: "frágil" });
    expect(r.status).toBe(200);
  });
});

describe("🔴 PATCH al completar: la MISMA regla", () => {
  it("sin quien despacha → 400", async () => {
    const r = await patch({ estado: "Completada", placa: "AB-1234" });
    expect(r.status).toBe(400);
    expect(r.json.error).toBe("Despachado por requerido");
  });
  it("con quien despacha → pasa", async () => {
    const r = await patch({ estado: "Completada", placa: "AB-1234", entregado_por: "Jorman" });
    expect(r.status).toBe(200);
  });
});

describe("🔴 POST (crear la guía) ya no lo necesita — nunca lo exigió", () => {
  it("crea la guía sin `entregado_por`", async () => {
    const { POST } = await import("@/app/api/guias/route");
    const sesion = Buffer.from(JSON.stringify({ role: "admin", userId: "u1", userName: "Test" })).toString("base64url");
    const { NextRequest } = await import("next/server");
    const req = new NextRequest("http://localhost/api/guias", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        fecha: "2026-10-01",
        modo_entrega: "entrega_directa",
        items: [{ cliente: "Nova Lux", empresa: "Vistana International", facturas: "3099", bultos: 3, direccion: "Paso Canoas" }],
      }),
    });
    req.cookies.set("cxc_session", sesion);
    const res = await POST(req);
    expect(res.status).toBe(200);
    const cabecera = escrituras.find((e) => e.tabla === "guia_transporte");
    expect(cabecera?.datos).toMatchObject({ entregado_por: null });
  });
});

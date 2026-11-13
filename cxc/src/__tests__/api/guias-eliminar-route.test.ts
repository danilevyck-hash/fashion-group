/**
 * DELETE /api/guias/[id] — eliminar una guía (13-nov-2026).
 *
 * Daniel, textual: «que se pueda eliminar también las despachadas y que lo
 * puedan hacer todos, porque en el usuario de julio no me salía eliminarla».
 * Y al eliminar, las etiquetas atadas a sus renglones vuelven a quedar libres.
 *
 * Se LLAMA al handler y se mira QUÉ SE ESCRIBIÓ, en qué orden.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

let rol = "bodega";
vi.mock("@/lib/require-auth", () => ({ getSession: () => ({ role: rol, userName: "julio" }) }));
vi.mock("@/lib/requireRole", () => ({
  requireRole: (_req: unknown, roles: string[]) =>
    roles.includes(rol) ? { role: rol } : NextResponse.json({ error: "Sin permiso" }, { status: 403 }),
}));
const logueado: unknown[][] = [];
vi.mock("@/lib/log-activity", () => ({
  logActivity: async (...args: unknown[]) => { logueado.push(args); },
}));

const GUIA_ID = "9500cb99-5255-421f-9fcf-b56030c3d08a";
const ITEM_ID = "db8f8cf6-f5ac-4b7e-a9f1-1f82687247c5";
let escrituras: Array<{ tabla: string; datos: unknown; filtros: Record<string, unknown> }>;
let fallaEn: string | null;

function tablaDoble(tabla: string) {
  const filtros: Record<string, unknown> = {};
  let datos: unknown = null;
  const resultado = () => {
    if (datos !== null) escrituras.push({ tabla, datos, filtros });
    if (fallaEn === tabla && datos !== null) return { data: null, error: { message: "x" } };
    if (tabla === "guia_items" && datos === null) return { data: [{ id: ITEM_ID }], error: null };
    if (tabla === "guias_etiquetas") return { data: [{ id: 152 }, { id: 153 }, { id: 154 }], error: null };
    return { data: { numero: 306 }, error: null };
  };
  const cadena = {
    select: () => cadena,
    update: (d: unknown) => { datos = d; return cadena; },
    eq: (c: string, v: unknown) => { filtros[c] = v; return cadena; },
    in: (c: string, v: unknown) => { filtros[c] = v; return cadena; },
    maybeSingle: async () => resultado(),
    then: (ok: (r: unknown) => unknown) => Promise.resolve(resultado()).then(ok),
  };
  return cadena;
}
vi.mock("@/lib/supabase-server", () => ({ supabaseServer: { from: (t: string) => tablaDoble(t) } }));

beforeEach(() => { escrituras = []; logueado.length = 0; fallaEn = null; rol = "bodega"; });

async function eliminar() {
  const { DELETE } = await import("@/app/api/guias/[id]/route");
  const res = await DELETE({} as never, { params: { id: GUIA_ID } });
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

describe("🔴 eliminar guía: quién puede", () => {
  for (const r of ["admin", "secretaria", "bodega"]) {
    it(`${r} puede`, async () => {
      rol = r;
      expect((await eliminar()).status).toBe(200);
    });
  }
  it("vendedor NO puede y no se escribe nada", async () => {
    rol = "vendedor";
    expect((await eliminar()).status).toBe(403);
    expect(escrituras).toHaveLength(0);
  });
});

describe("🔴 eliminar guía: qué hace", () => {
  it("una guía Completada se elimina: el servidor no mira el estado", async () => {
    const r = await eliminar();
    expect(r.status).toBe(200);
    expect(escrituras.some((e) => "estado" in e.filtros)).toBe(false);
  });

  it("suelta las etiquetas → renglones → guía, en ese orden", async () => {
    const r = await eliminar();
    expect(escrituras.map((e) => e.tabla)).toEqual(["guias_etiquetas", "guia_items", "guia_transporte"]);
    expect(escrituras[0]).toMatchObject({ datos: { guia_item_id: null }, filtros: { guia_item_id: [ITEM_ID] } });
    expect(escrituras[1]).toMatchObject({ datos: { deleted: true }, filtros: { guia_id: GUIA_ID } });
    expect(escrituras[2]).toMatchObject({ datos: { deleted: true }, filtros: { id: GUIA_ID } });
    expect(r.json.etiquetasSueltas).toBe(3);
    expect(logueado[0]).toEqual([
      "bodega", "guia_delete", "guias",
      { guiaId: GUIA_ID, numero: 306, renglones: 1, etiquetasSueltas: 3 }, "julio",
    ]);
  });

  it("si soltar las etiquetas falla, la guía NO se elimina", async () => {
    fallaEn = "guias_etiquetas";
    expect((await eliminar()).status).toBe(500);
    expect(escrituras.map((e) => e.tabla)).toEqual(["guias_etiquetas"]);
    expect(logueado).toHaveLength(0);
  });
});

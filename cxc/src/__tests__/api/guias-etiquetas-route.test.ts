/**
 * ─────────────────────────────────────────────────────────────────────────────
 * /api/guias/etiquetas — LAS RUTAS, EJECUTADAS contra una base doblada
 * (18-sep-2026)
 *
 * Un barrido de texto vería el `.update(...)` y se daría por satisfecho aunque
 * el resultado se tirara (el agujero de /api/saldos-banco, ya pagado). Acá se
 * LLAMA al handler real y se mira QUÉ se escribió y con qué código contestó.
 *
 * Lo que este archivo fija:
 *   1. 🔴 EL ANTI-DUPLICADO LO DECIDE EL SERVIDOR: 409, y devuelve la etiqueta
 *      que ya existe para que la pantalla ofrezca Reimprimir.
 *   2. 🔴 IMPORTADA = BLOQUEADA en el SERVIDOR: corregir y borrar contestan 409
 *      aunque el botón se haya tocado igual.
 *   3. 🔴 BORRAR ES SOFT DELETE FIRMADO: se escribe deleted + quién + cuándo.
 *   4. 🔴 SI EL RENGLÓN SE BORRA, LA ETIQUETA VUELVE A «Pendiente» — y entonces
 *      se vuelve a poder corregir y borrar.
 *   5. 🔴 SIN LA TABLA NO SE ROMPE NADA: el GET contesta 200 con la lista vacía
 *      y el aviso de la migración.
 *   6. El vendedor no entra a ninguna de las tres rutas.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

// ── requireRole doblado FIEL: admin siempre pasa; el resto solo si está en la
// lista que la RUTA le pasa — así una mutación de esa lista cambia el resultado.
let rolActual = "admin";
vi.mock("@/lib/requireRole", () => ({
  requireRole: (_req: unknown, permitidos: string[]) => {
    if (rolActual === "admin" || permitidos.includes(rolActual)) {
      return { role: rolActual, userName: rolActual === "secretaria" ? "Angela" : rolActual };
    }
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  },
}));

vi.mock("@/lib/log-activity", () => ({ logActivity: async () => {} }));

// ── La base doblada ─────────────────────────────────────────────────────────
interface Escritura {
  tabla: string;
  op: "insert" | "update";
  datos: Record<string, unknown>;
  filtros: Record<string, unknown>;
}

let etiquetas: Array<Record<string, unknown>>;
let renglones: Array<Record<string, unknown>>;
let guias: Array<Record<string, unknown>>;
let escrituras: Escritura[];
/** Simula «la tabla guias_etiquetas todavía no existe». */
let sinTabla = false;
let proximoErrorInsert: { code?: string; message: string } | null = null;

const tablas = (t: string) => (t === "guias_etiquetas" ? etiquetas : t === "guia_items" ? renglones : guias);

function cadena(tabla: string) {
  const filtros: Record<string, unknown> = {};
  const dentro: Record<string, unknown[]> = {};
  const nulos: string[] = [];
  let op: "select" | "insert" | "update" = "select";
  let datos: Record<string, unknown> = {};
  let pidioCount = false;

  const casa = (f: Record<string, unknown>) =>
    Object.entries(filtros).every(([k, v]) => f[k] === v) &&
    Object.entries(dentro).every(([k, vs]) => vs.includes(f[k])) &&
    nulos.every((k) => f[k] === null || f[k] === undefined);

  const terminar = (single: boolean) => {
    if (sinTabla && tabla === "guias_etiquetas") {
      return {
        data: null,
        error: { code: "PGRST205", message: "Could not find the table 'public.guias_etiquetas' in the schema cache" },
        count: null,
      };
    }
    const filas = tablas(tabla);
    if (op === "insert") {
      if (proximoErrorInsert) {
        const e = proximoErrorInsert;
        proximoErrorInsert = null;
        escrituras.push({ tabla, op, datos, filtros });
        return { data: null, error: e, count: null };
      }
      const fila = { id: filas.length + 1, deleted: false, guia_item_id: null, creado_en: "2026-09-18T15:00:00-05:00", ...datos };
      filas.push(fila);
      escrituras.push({ tabla, op, datos, filtros });
      return { data: single ? fila : [fila], error: null, count: null };
    }
    if (op === "update") {
      escrituras.push({ tabla, op, datos, filtros: { ...filtros, ...(nulos.length ? { __nulos: nulos } : {}) } });
      const tocadas = filas.filter(casa);
      for (const f of tocadas) Object.assign(f, datos);
      return { data: tocadas.map((f) => ({ id: f.id })), error: null, count: null };
    }
    const vistas = filas.filter(casa);
    if (single) return { data: vistas[0] ?? null, error: null, count: null };
    return { data: vistas, error: null, count: pidioCount ? vistas.length : null };
  };

  const c = {
    select: (_cols?: string, opts?: { count?: string }) => {
      if (opts?.count === "exact") pidioCount = true;
      return c;
    },
    eq: (col: string, val: unknown) => { filtros[col] = val; return c; },
    in: (col: string, vals: unknown[]) => { dentro[col] = vals; return c; },
    is: (col: string, val: unknown) => { if (val === null) nulos.push(col); return c; },
    order: () => c,
    range: () => c,
    limit: () => c,
    insert: (d: Record<string, unknown>) => { op = "insert"; datos = d; return c; },
    update: (d: Record<string, unknown>) => { op = "update"; datos = d; return c; },
    single: async () => terminar(true),
    maybeSingle: async () => terminar(true),
    then: (res: (v: unknown) => unknown) => Promise.resolve(terminar(false)).then(res),
  };
  return c;
}

vi.mock("@/lib/supabase-server", () => ({
  supabaseServer: { from: (tabla: string) => cadena(tabla) },
}));

/** La etiqueta viva de Nova Lux, 14 cajas — el ejemplo real del 18-sep-2026. */
function fila(over: Record<string, unknown> = {}) {
  return {
    id: 1,
    empresa_key: "fashion_shoes",
    switch_factura_id: 52558,
    secuencial: "11-000002558",
    fecha_factura: "2026-09-18",
    cliente_codigo: "D-170",
    cliente_nombre: "Nova Lux, S.A.",
    destino: "Paso Canoas",
    cajas: 14,
    creado_en: "2026-09-18T14:41:00-05:00",
    guia_item_id: null,
    deleted: false,
    creado_por: "daniel",
    ...over,
  };
}

beforeEach(() => {
  rolActual = "admin";
  sinTabla = false;
  proximoErrorInsert = null;
  escrituras = [];
  etiquetas = [fila()];
  renglones = [
    { id: "aaaaaaaa-0000-4000-8000-000000000001", guia_id: "bbbbbbbb-0000-4000-8000-000000000001", cliente_codigo: "D-170", empresa: "Fashion Shoes", deleted: false },
  ];
  guias = [{ id: "bbbbbbbb-0000-4000-8000-000000000001", numero: 256, deleted: false }];
});

const req = (body?: unknown) =>
  ({ json: async () => body, nextUrl: { searchParams: new URLSearchParams() }, cookies: { get: () => undefined } }) as never;

const lista = () => import("@/app/api/guias/etiquetas/route");
const una = () => import("@/app/api/guias/etiquetas/[id]/route");
const importar = () => import("@/app/api/guias/etiquetas/importar/route");

const cuerpoNuevo = (over: Record<string, unknown> = {}) => ({
  empresa_key: "fashion_wear",
  switch_factura_id: 99001,
  secuencial: "11-000003260",
  fecha_factura: "2026-09-18",
  cliente_codigo: "D-108",
  cliente_nombre: "American Classics Store",
  destino: "David",
  cajas: 2,
  ...over,
});

// ─── 1 · el anti-duplicado lo decide el SERVIDOR ─────────────────────────────

describe("🔴 1. etiquetar la misma factura otra vez: 409 del SERVIDOR", () => {
  it("una factura nueva se etiqueta: 201 y la fila queda con su id de Switch", async () => {
    const { POST } = await lista();
    const res = await POST(req(cuerpoNuevo()));
    expect(res.status).toBe(201);
    const alta = escrituras.find((e) => e.op === "insert");
    expect(alta?.datos).toMatchObject({
      empresa_key: "fashion_wear",
      switch_factura_id: 99001,
      cajas: 2,
      destino: "David",
      creado_por: "admin",
    });
  });

  it("🔴 la MISMA factura otra vez: 409, y NO se escribe un segundo juego", async () => {
    const { POST } = await lista();
    const res = await POST(req(cuerpoNuevo({ empresa_key: "fashion_shoes", switch_factura_id: 52558, cajas: 30 })));
    expect(res.status).toBe(409);
    expect(escrituras.filter((e) => e.op === "insert")).toHaveLength(0);
    const json = (await res.json()) as { yaEtiquetada?: { cajas: number } };
    // Devuelve la que ya existe, para que la pantalla ofrezca Reimprimir.
    expect(json.yaEtiquetada?.cajas).toBe(14);
  });

  it("⚠️ y si dos toques llegan juntos, el único de la base también da 409", async () => {
    proximoErrorInsert = { code: "23505", message: "duplicate key" };
    const { POST } = await lista();
    const res = await POST(req(cuerpoNuevo()));
    expect(res.status).toBe(409);
  });

  it("🔴 borrada la etiqueta, esa MISMA factura se puede volver a etiquetar", async () => {
    etiquetas = [fila({ deleted: true, borrado_por: "daniel", borrado_en: "2026-09-18T16:00:00-05:00" })];
    const { POST } = await lista();
    const res = await POST(req(cuerpoNuevo({ empresa_key: "fashion_shoes", switch_factura_id: 52558 })));
    expect(res.status).toBe(201);
  });

  it("una empresa que no es del grupo se rechaza antes de tocar la base", async () => {
    const { POST } = await lista();
    const res = await POST(req(cuerpoNuevo({ empresa_key: "confecciones_boston" })));
    expect(res.status).toBe(400);
    expect(escrituras).toHaveLength(0);
  });
});

// ─── 2 y 3 · importada = bloqueada; borrar es soft delete firmado ────────────

describe("🔴 2. una etiqueta que ya salió en una guía no se corrige ni se borra", () => {
  beforeEach(() => {
    etiquetas = [fila({ guia_item_id: "aaaaaaaa-0000-4000-8000-000000000001" })];
  });

  it("PATCH → 409 y NO se escribe nada", async () => {
    const { PATCH } = await una();
    const res = await PATCH(req({ cajas: 20 }), { params: { id: "1" } });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain("GT-256");
    expect(escrituras.filter((e) => e.op === "update")).toHaveLength(0);
    expect(etiquetas[0].cajas).toBe(14);
  });

  it("DELETE → 409 y la fila sigue viva", async () => {
    const { DELETE } = await una();
    const res = await DELETE(req(), { params: { id: "1" } });
    expect(res.status).toBe(409);
    expect(escrituras.filter((e) => e.op === "update")).toHaveLength(0);
    expect(etiquetas[0].deleted).toBe(false);
  });
});

describe("🔴 3. pendiente: se corrige y se borra — el borrado es SOFT y FIRMADO", () => {
  it("PATCH corrige los bultos", async () => {
    const { PATCH } = await una();
    const res = await PATCH(req({ cajas: 16 }), { params: { id: "1" } });
    expect(res.status).toBe(200);
    expect(etiquetas[0].cajas).toBe(16);
  });

  it("PATCH con un número imposible: 400 y nada escrito", async () => {
    const { PATCH } = await una();
    expect((await PATCH(req({ cajas: 0 }), { params: { id: "1" } })).status).toBe(400);
    expect((await PATCH(req({ cajas: 301 }), { params: { id: "1" } })).status).toBe(400);
    expect(escrituras.filter((e) => e.op === "update")).toHaveLength(0);
  });

  it("🔴 DELETE escribe deleted + quién + cuándo, y NUNCA un DELETE de verdad", async () => {
    const { DELETE } = await una();
    const res = await DELETE(req(), { params: { id: "1" } });
    expect(res.status).toBe(200);
    const baja = escrituras.find((e) => e.op === "update");
    expect(baja?.datos.deleted).toBe(true);
    expect(baja?.datos.borrado_por).toBe("admin");
    expect(typeof baja?.datos.borrado_en).toBe("string");
    // La fila SIGUE en la tabla.
    expect(etiquetas).toHaveLength(1);
  });
});

// ─── 4 · el renglón borrado devuelve la etiqueta a «Pendiente» ───────────────

describe("🔴 4. si el renglón (o la guía) se borra, la etiqueta vuelve a Pendiente", () => {
  beforeEach(() => {
    etiquetas = [fila({ guia_item_id: "aaaaaaaa-0000-4000-8000-000000000001" })];
  });

  it("con el renglón vivo, la lista la muestra «En GT-256»", async () => {
    const { GET } = await lista();
    const json = (await (await GET(req())).json()) as { etiquetas: Array<{ guia_numero: number | null }> };
    expect(json.etiquetas[0].guia_numero).toBe(256);
  });

  it("🔴 renglón con deleted = true → guia_numero null, y se vuelve a poder borrar", async () => {
    renglones[0].deleted = true;
    const { GET } = await lista();
    const json = (await (await GET(req())).json()) as { etiquetas: Array<{ guia_numero: number | null }> };
    expect(json.etiquetas[0].guia_numero).toBeNull();

    const { DELETE } = await una();
    expect((await DELETE(req(), { params: { id: "1" } })).status).toBe(200);
  });

  it("🔴 guía con deleted = true → también vuelve a Pendiente", async () => {
    guias[0].deleted = true;
    const { GET } = await lista();
    const json = (await (await GET(req())).json()) as { etiquetas: Array<{ guia_numero: number | null }> };
    expect(json.etiquetas[0].guia_numero).toBeNull();
  });

  it("importar ata la etiqueta al renglón de SU cliente y SU empresa", async () => {
    etiquetas = [fila()];
    const { POST } = await importar();
    const res = await POST(req({ guia_id: "bbbbbbbb-0000-4000-8000-000000000001", ids: [1] }));
    expect(res.status).toBe(200);
    expect((await res.json()).atadas).toBe(1);
    expect(etiquetas[0].guia_item_id).toBe("aaaaaaaa-0000-4000-8000-000000000001");
  });

  it("⚠️ una etiqueta de OTRO cliente no se ata a un renglón que no es suyo", async () => {
    etiquetas = [fila({ cliente_codigo: "D-108" })];
    const { POST } = await importar();
    const res = await POST(req({ guia_id: "bbbbbbbb-0000-4000-8000-000000000001", ids: [1] }));
    expect((await res.json()).atadas).toBe(0);
    expect(etiquetas[0].guia_item_id).toBeNull();
  });

  it("⚠️ una que YA salió en una guía no se muda a otra", async () => {
    etiquetas = [fila({ guia_item_id: "aaaaaaaa-0000-4000-8000-000000000001" })];
    const { POST } = await importar();
    const res = await POST(req({ guia_id: "bbbbbbbb-0000-4000-8000-000000000001", ids: [1] }));
    expect((await res.json()).atadas).toBe(0);
  });
});

// ─── 5 · sin la tabla no se rompe nada ───────────────────────────────────────

describe("🔴 5. sin la migración corrida, la pantalla NO se rompe", () => {
  beforeEach(() => { sinTabla = true; });

  it("el GET contesta 200 con la lista vacía y el aviso de la migración", async () => {
    const { GET } = await lista();
    const res = await GET(req());
    expect(res.status).toBe(200);
    const json = (await res.json()) as { etiquetas: unknown[]; sinTabla: boolean; aviso: string };
    expect(json.etiquetas).toEqual([]);
    expect(json.sinTabla).toBe(true);
    expect(json.aviso).toContain("20261207120000");
  });

  it("el POST contesta 503 con el mismo aviso — se dice, no se finge que guardó", async () => {
    const { POST } = await lista();
    const res = await POST(req(cuerpoNuevo()));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toContain("20261207120000");
  });
});

// ─── 6 · quién entra ─────────────────────────────────────────────────────────

describe("🔴 6. admin · secretaria · bodega entran; el vendedor no", () => {
  it.each(["secretaria", "bodega"])("%s: puede listar y etiquetar", async (rol) => {
    rolActual = rol;
    const { GET, POST } = await lista();
    expect((await GET(req())).status).toBe(200);
    expect((await POST(req(cuerpoNuevo()))).status).toBe(201);
  });

  it("🔴 vendedor: 403 en las tres rutas, sin tocar la base", async () => {
    rolActual = "vendedor";
    const { GET, POST } = await lista();
    const { PATCH, DELETE } = await una();
    const { POST: IMPORTAR } = await importar();
    expect((await GET(req())).status).toBe(403);
    expect((await POST(req(cuerpoNuevo()))).status).toBe(403);
    expect((await PATCH(req({ cajas: 3 }), { params: { id: "1" } })).status).toBe(403);
    expect((await DELETE(req(), { params: { id: "1" } })).status).toBe(403);
    expect((await IMPORTAR(req({ guia_id: "bbbbbbbb-0000-4000-8000-000000000001", ids: [1] }))).status).toBe(403);
    expect(escrituras).toHaveLength(0);
  });
});

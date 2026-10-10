/**
 * ─────────────────────────────────────────────────────────────────────────────
 * 🔴 GUÍAS › ETIQUETAS POR ENVÍO — LAS RUTAS, EJECUTADAS (1-oct-2026)
 *
 * Se LLAMA al handler real contra una base doblada y se mira QUÉ se escribió.
 *
 * Lo que este archivo fija:
 *   1. 🔴 EL POST DE UN ENVÍO ES ATÓMICO: UN insert con todas sus facturas,
 *      numeradas en orden y con el MISMO envío; si una ya estaba etiquetada,
 *      409 que DICE cuál y no se escribe NADA.
 *   2. Sin la migración de envíos: varias facturas o con nota → 503 que lo
 *      dice; una sola sin nota se guarda como siempre (falla abierta).
 *   3. 🔴 ANULAR EL ENVÍO: borrado FIRMADO de TODAS sus filas; 409 si salió en
 *      una guía, y entonces no se toca ninguna.
 *   4. 🩸 EL BUG DEL PUT: guardar una guía con `items` borraba los renglones y
 *      las etiquetas se desataban en silencio (ON DELETE SET NULL). Ahora se
 *      mudan al renglón nuevo, y su renglón lleva el total de las etiquetas.
 *   5. 🔴 Bodega no corrige los bultos de un envío etiquetado (el servidor los
 *      ignora), y el GET marca esos renglones con `con_etiquetas`.
 *   6. Importar ata por cliente + empresa + DESTINO.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

vi.mock("@/lib/requireRole", () => ({
  requireRole: (_req: unknown, permitidos: string[]) =>
    permitidos.includes("bodega") || permitidos.includes("admin")
      ? { role: "bodega", userName: "Jorman" }
      : NextResponse.json({ error: "Sin permiso" }, { status: 403 }),
}));
vi.mock("@/lib/require-auth", () => ({ getSession: () => ({ role: "bodega", userName: "Jorman" }) }));
vi.mock("@/lib/log-activity", () => ({ logActivity: async () => {} }));
vi.mock("@/lib/alertas/canal", () => ({ enviarNegocio: async () => {} }));

// ── La base doblada ─────────────────────────────────────────────────────────
type Fila = Record<string, unknown>;
interface Escritura { tabla: string; op: string; datos: unknown; filtros: Record<string, unknown> }

let tablas: Record<string, Fila[]>;
let escrituras: Escritura[];
/** Simula que la migración `20261224120000` todavía no corrió. */
let sinColumnasDeEnvio = false;
let proximoErrorInsert: { code: string; message: string } | null = null;
let siguienteId = 100;

const COLUMNA_AUSENTE = { code: "42703", message: "column guias_etiquetas.envio_id does not exist" };

function cadena(tabla: string) {
  const eq: Record<string, unknown> = {};
  const dentro: Record<string, unknown[]> = {};
  const gte: Record<string, number> = {};
  const lt: Record<string, number> = {};
  let op: "select" | "insert" | "update" | "delete" = "select";
  let datos: unknown = null;
  let columnas = "";
  let pidioCount = false;

  const casa = (f: Fila) =>
    Object.entries(eq).every(([k, v]) => f[k] === v) &&
    Object.entries(dentro).every(([k, vs]) => vs.includes(f[k])) &&
    Object.entries(gte).every(([k, v]) => Number(f[k]) >= v) &&
    Object.entries(lt).every(([k, v]) => Number(f[k]) < v);

  const pideEnvio = () => /envio_id|orden_en_envio|nota/.test(columnas);

  const terminar = (single: boolean) => {
    const filas = (tablas[tabla] ??= []);
    if (op === "insert") {
      const lista = (Array.isArray(datos) ? datos : [datos]) as Fila[];
      escrituras.push({ tabla, op, datos, filtros: {} });
      if (tabla === "guias_etiquetas" && sinColumnasDeEnvio && lista.some((f) => "envio_id" in f)) {
        return { data: null, error: COLUMNA_AUSENTE, count: null };
      }
      if (proximoErrorInsert) {
        const e = proximoErrorInsert;
        proximoErrorInsert = null;
        return { data: null, error: e, count: null };
      }
      const nuevas = lista.map((f) => ({
        id: tabla === "guia_items" ? `nuevo-${siguienteId++}` : siguienteId++,
        deleted: false,
        guia_item_id: null,
        creado_en: "2026-10-01T10:00:00-05:00",
        ...f,
      }));
      filas.push(...nuevas);
      return { data: single ? nuevas[0] : nuevas, error: null, count: null };
    }
    if (op === "update") {
      escrituras.push({ tabla, op, datos, filtros: { ...eq, ...dentro } });
      const tocadas = filas.filter(casa);
      for (const f of tocadas) Object.assign(f, datos as Fila);
      return { data: tocadas.map((f) => ({ id: f.id })), error: null, count: null };
    }
    if (op === "delete") {
      escrituras.push({ tabla, op, datos: null, filtros: { ...eq, ...gte, ...lt } });
      const borradas = filas.filter(casa);
      tablas[tabla] = filas.filter((f) => !casa(f));
      // 🩸 EL ON DELETE SET NULL de `guias_etiquetas.guia_item_id`, tal cual.
      if (tabla === "guia_items") {
        const ids = new Set(borradas.map((b) => b.id));
        for (const e of tablas.guias_etiquetas ?? []) if (ids.has(e.guia_item_id)) e.guia_item_id = null;
      }
      return { data: null, error: null, count: null };
    }
    if (tabla === "guias_etiquetas" && sinColumnasDeEnvio && pideEnvio()) {
      return { data: null, error: COLUMNA_AUSENTE, count: null };
    }
    let vistas = filas.filter(casa);
    if (tabla === "guia_transporte" && columnas.includes("guia_items(")) {
      vistas = vistas.map((g) => ({ ...g, guia_items: (tablas.guia_items ?? []).filter((i) => i.guia_id === g.id).map((i) => ({ ...i })) }));
    }
    if (single) return { data: vistas[0] ?? null, error: null, count: null };
    return { data: vistas, error: null, count: pidioCount ? vistas.length : null };
  };

  const c = {
    select: (cols?: string, opts?: { count?: string }) => {
      if (op === "select") columnas = cols ?? "";
      else columnas = cols ?? columnas;
      if (opts?.count === "exact") pidioCount = true;
      return c;
    },
    eq: (k: string, v: unknown) => { eq[k] = v; return c; },
    neq: () => c,
    in: (k: string, vs: unknown[]) => { dentro[k] = vs; return c; },
    is: (k: string, v: unknown) => { if (v === null) eq[k] = null; return c; },
    gte: (k: string, v: number) => { gte[k] = v; return c; },
    lt: (k: string, v: number) => { lt[k] = v; return c; },
    order: () => c,
    range: () => c,
    limit: () => c,
    insert: (d: unknown) => { op = "insert"; datos = d; return c; },
    update: (d: unknown) => { op = "update"; datos = d; return c; },
    delete: () => { op = "delete"; return c; },
    single: async () => terminar(true),
    maybeSingle: async () => terminar(true),
    then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
      Promise.resolve().then(() => terminar(false)).then(res, rej),
  };
  return c;
}

vi.mock("@/lib/supabase-server", () => ({ supabaseServer: { from: (t: string) => cadena(t) } }));

const GUIA = "bbbbbbbb-0000-4000-8000-000000000001";
const R1 = "aaaaaaaa-0000-4000-8000-000000000001";
const R2 = "aaaaaaaa-0000-4000-8000-000000000002";

function etiqueta(over: Fila = {}): Fila {
  return {
    id: 1,
    empresa_key: "fashion_shoes",
    switch_factura_id: 1,
    secuencial: "11-000000001",
    fecha_factura: "2026-10-01",
    cliente_codigo: "D-170",
    cliente_nombre: "Nova Lux, S.A.",
    destino: "Paso Canoas",
    cajas: 10,
    creado_en: "2026-10-01T09:00:00-05:00",
    guia_item_id: null,
    deleted: false,
    creado_por: "Angela",
    envio_id: "e-1",
    orden_en_envio: 1,
    nota: null,
    ...over,
  };
}

beforeEach(() => {
  escrituras = [];
  sinColumnasDeEnvio = false;
  proximoErrorInsert = null;
  siguienteId = 100;
  tablas = {
    guias_etiquetas: [],
    guia_items: [],
    guia_transporte: [{ id: GUIA, numero: 256, estado: "Pendiente Bodega", deleted: false }],
  };
});

const req = (body?: unknown) =>
  ({ json: async () => body, nextUrl: { searchParams: new URLSearchParams() }, cookies: { get: () => undefined } }) as never;

const lista = () => import("@/app/api/guias/etiquetas/route");
const una = () => import("@/app/api/guias/etiquetas/[id]/route");
const importar = () => import("@/app/api/guias/etiquetas/importar/route");
const guia = () => import("@/app/api/guias/[id]/route");

const envio = (over: Record<string, unknown> = {}) => ({
  empresa_key: "fashion_shoes",
  cliente_codigo: "D-170",
  cliente_nombre: "Nova Lux, S.A.",
  destino: "Paso Canoas",
  facturas: [
    { switch_factura_id: 1, secuencial: "11-000000001", fecha_factura: "2026-10-01", cajas: 10, nota: "" },
    { switch_factura_id: 2, secuencial: "11-000000002", fecha_factura: "2026-10-01", cajas: 10, nota: "frágil" },
    { switch_factura_id: 3, secuencial: "11-000000003", fecha_factura: "2026-10-01", cajas: 10 },
  ],
  ...over,
});

// ─── 1 · el POST de un envío ─────────────────────────────────────────────────

describe("🔴 1. el POST de un envío: UN insert, todo o nada", () => {
  it("201: las tres facturas en UNA escritura, el mismo envío, orden 1-2-3 y la nota en mayúsculas", async () => {
    const { POST } = await lista();
    const res = await POST(req(envio()));
    expect(res.status).toBe(201);
    const altas = escrituras.filter((e) => e.op === "insert");
    expect(altas).toHaveLength(1);
    const filas = altas[0].datos as Fila[];
    expect(filas).toHaveLength(3);
    expect(new Set(filas.map((f) => f.envio_id)).size).toBe(1);
    expect(filas.map((f) => f.orden_en_envio)).toEqual([1, 2, 3]);
    expect(filas.map((f) => f.nota)).toEqual([null, "FRÁGIL", null]);
    expect(filas.every((f) => f.creado_por === "Jorman" && f.destino === "Paso Canoas")).toBe(true);
    const json = (await res.json()) as { etiquetas: Array<{ envio_id: string }>; envio_id: string };
    expect(json.etiquetas).toHaveLength(3);
    expect(json.envio_id).toBe(filas[0].envio_id);
  });

  it("🔴 una factura ya etiquetada: 409 que DICE cuál, y NO se escribe ninguna", async () => {
    tablas.guias_etiquetas = [etiqueta({ id: 1, switch_factura_id: 2, secuencial: "11-000000002" })];
    const { POST } = await lista();
    const res = await POST(req(envio()));
    expect(res.status).toBe(409);
    const json = (await res.json()) as { error: string; yaEtiquetadas: Array<{ secuencial: string }> };
    expect(json.error).toContain("11-000000002");
    expect(json.yaEtiquetadas.map((e) => e.secuencial)).toEqual(["11-000000002"]);
    expect(escrituras.filter((e) => e.op === "insert")).toHaveLength(0);
  });

  it("⚠️ dos toques a la vez: el único de la base da el mismo 409", async () => {
    proximoErrorInsert = { code: "23505", message: "duplicate key" };
    const { POST } = await lista();
    expect((await POST(req(envio()))).status).toBe(409);
  });

  it("una nota de 16 letras: 400 y nada escrito", async () => {
    const malo = envio();
    (malo.facturas as Array<Record<string, unknown>>)[1].nota = "X".repeat(16);
    const { POST } = await lista();
    expect((await POST(req(malo))).status).toBe(400);
    expect(escrituras).toHaveLength(0);
  });

  it("la forma vieja (una factura suelta) sigue entrando", async () => {
    const { POST } = await lista();
    const res = await POST(req({
      empresa_key: "fashion_shoes", switch_factura_id: 9, secuencial: "11-000000009", fecha_factura: "2026-10-01",
      cliente_codigo: "D-170", cliente_nombre: "Nova Lux, S.A.", destino: "Paso Canoas", cajas: 2,
    }));
    expect(res.status).toBe(201);
  });
});

// ─── 2 · sin la migración ────────────────────────────────────────────────────

describe("🔴 2. las columnas de envío existen: un error que las nombra NO se traga", () => {
  // Hasta el 9-oct-2026 este error se leía como «falta la migración»: el GET
  // releía sin las columnas (cada fila un envío suelto) y el POST de una sola
  // factura se guardaba SIN `envio_id`. Ahora falla con su error.
  beforeEach(() => { sinColumnasDeEnvio = true; });

  it("el GET falla en vez de releer con las columnas de siempre", async () => {
    tablas.guias_etiquetas = [etiqueta({ id: 4 })];
    const { GET } = await lista();
    expect((await GET(req())).status).toBeGreaterThanOrEqual(500);
  });

  it("el POST falla y no escribe nada — ni con varias facturas ni con una sola", async () => {
    const { POST } = await lista();
    const varias = await POST(req(envio()));
    const una = await POST(req(envio({ facturas: [{ switch_factura_id: 1, secuencial: "11-000000001", fecha_factura: "2026-10-01", cajas: 4 }] })));
    for (const res of [varias, una]) {
      expect(res.status).toBeGreaterThanOrEqual(500);
      expect(JSON.stringify(await res.json())).not.toContain("20261224120000");
    }
    expect(tablas.guias_etiquetas).toHaveLength(0);
  });
});

// ─── 3 · anular el envío ─────────────────────────────────────────────────────

describe("🔴 3. anular el envío: TODAS sus filas, firmado — y 409 si ya está en una guía", () => {
  beforeEach(() => {
    tablas.guias_etiquetas = [
      etiqueta({ id: 1, envio_id: "e-1", orden_en_envio: 1 }),
      etiqueta({ id: 2, envio_id: "e-1", orden_en_envio: 2, switch_factura_id: 2 }),
      etiqueta({ id: 3, envio_id: "e-2", orden_en_envio: 1, switch_factura_id: 3 }),
    ];
  });

  it("DELETE de una etiqueta anula su envío entero (las dos), firmado, y NO toca otro envío", async () => {
    const { DELETE } = await una();
    const res = await DELETE(req(), { params: { id: "2" } });
    expect(res.status).toBe(200);
    const [e1, e2, e3] = tablas.guias_etiquetas;
    expect([e1.deleted, e2.deleted, e3.deleted]).toEqual([true, true, false]);
    expect(e1.borrado_por).toBe("Jorman");
    expect(typeof e2.borrado_en).toBe("string");
    // Una sola escritura para el envío: entra entero o no entra.
    expect(escrituras.filter((e) => e.op === "update" && e.tabla === "guias_etiquetas")).toHaveLength(1);
    // Nunca un DELETE de verdad.
    expect(escrituras.some((e) => e.op === "delete")).toBe(false);
  });

  it("🔴 si una de sus filas salió en una guía: 409 con el número, y no se anula NINGUNA", async () => {
    tablas.guia_items = [{ id: R1, guia_id: GUIA, deleted: false }];
    tablas.guias_etiquetas[1].guia_item_id = R1;
    const { DELETE } = await una();
    const res = await DELETE(req(), { params: { id: "1" } });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain("GT-256");
    expect(tablas.guias_etiquetas.every((e) => e.deleted === false)).toBe(true);
  });

  it("🔴 «Corregir bultos» ya no existe: el PATCH contesta 409 y no escribe", async () => {
    const { PATCH } = await una();
    const res = await PATCH(req({ cajas: 12 }), { params: { id: "1" } });
    expect(res.status).toBe(409);
    expect(tablas.guias_etiquetas[0].cajas).toBe(10);
  });
});

// ─── 4 · el bug del PUT ──────────────────────────────────────────────────────

function guiaConEnvio() {
  tablas.guia_items = [
    { id: R1, guia_id: GUIA, orden: 1, cliente: "Nova Lux, S.A.", cliente_codigo: "D-170", empresa: "Fashion Shoes", direccion: "Paso Canoas", facturas: "11-000000001, 11-000000002", bultos: 20, numero_guia_transp: "", deleted: false },
    { id: R2, guia_id: GUIA, orden: 2, cliente: "Golden Mall", cliente_codigo: "D-55", empresa: "Vistana International", direccion: "David", facturas: "11-000003102", bultos: 7, numero_guia_transp: "", deleted: false },
  ];
  tablas.guias_etiquetas = [
    etiqueta({ id: 1, guia_item_id: R1 }),
    etiqueta({ id: 2, guia_item_id: R1, switch_factura_id: 2, secuencial: "11-000000002", orden_en_envio: 2 }),
  ];
}

const itemsEditados = (bultosDelEnvio: number) => [
  // El usuario editó la guía: cambió el orden y la secretaria tocó otro renglón.
  { cliente: "Golden Mall", cliente_codigo: "D-55", empresa: "Vistana International", direccion: "David", facturas: "11-000003102", bultos: 8, numero_guia_transp: "" },
  { cliente: "Nova Lux, S.A.", cliente_codigo: "D-170", empresa: "Fashion Shoes", direccion: "Paso Canoas", facturas: "11-000000001, 11-000000002", bultos: bultosDelEnvio, numero_guia_transp: "" },
];

describe("🩸 4. guardar la guía con `items` ya NO desata las etiquetas", () => {
  it("🔴 las dos etiquetas quedan atadas al renglón NUEVO del envío, y siguen «En GT-256»", async () => {
    guiaConEnvio();
    const { PUT } = await guia();
    const res = await PUT(req({ items: itemsEditados(20) }), { params: { id: GUIA } });
    expect(res.status).toBe(200);
    // Los renglones viejos ya no existen (el reemplazo los borró de verdad)…
    expect(tablas.guia_items.some((i) => i.id === R1)).toBe(false);
    // …y las etiquetas NO quedaron en null: apuntan al renglón nuevo de Nova Lux.
    const nuevoNova = tablas.guia_items.find((i) => i.cliente_codigo === "D-170")!;
    expect(tablas.guias_etiquetas.map((e) => e.guia_item_id)).toEqual([nuevoNova.id, nuevoNova.id]);

    const { GET } = await lista();
    const json = (await (await GET(req())).json()) as { etiquetas: Array<{ guia_numero: number | null }> };
    expect(json.etiquetas.map((e) => e.guia_numero)).toEqual([256, 256]);
  });

  it("🔴 el renglón del envío lleva el total de sus etiquetas aunque el cuerpo traiga otro número", async () => {
    guiaConEnvio();
    const { PUT } = await guia();
    await PUT(req({ items: itemsEditados(99) }), { params: { id: GUIA } });
    expect(tablas.guia_items.find((i) => i.cliente_codigo === "D-170")!.bultos).toBe(20);
    // El renglón a mano sigue con lo que se escribió.
    expect(tablas.guia_items.find((i) => i.cliente_codigo === "D-55")!.bultos).toBe(8);
  });

  it("⚠️ si el envío se QUITA de la guía, sus etiquetas vuelven a «Pendiente» (eso sí es correcto)", async () => {
    guiaConEnvio();
    const { PUT } = await guia();
    await PUT(req({ items: [itemsEditados(20)[0]] }), { params: { id: GUIA } });
    expect(tablas.guias_etiquetas.map((e) => e.guia_item_id)).toEqual([null, null]);
  });

  it("y la respuesta del PUT ya trae el renglón marcado con `con_etiquetas`", async () => {
    guiaConEnvio();
    const { PUT } = await guia();
    const res = await PUT(req({ items: itemsEditados(20) }), { params: { id: GUIA } });
    const json = (await res.json()) as { guia_items: Array<{ cliente_codigo: string; con_etiquetas?: boolean }> };
    expect(json.guia_items.find((i) => i.cliente_codigo === "D-170")?.con_etiquetas).toBe(true);
    expect(json.guia_items.find((i) => i.cliente_codigo === "D-55")?.con_etiquetas).toBeUndefined();
  });
});

// ─── 5 · bodega y el GET ─────────────────────────────────────────────────────

describe("🔴 5. bodega no corrige los bultos de un envío etiquetado", () => {
  it("el GET marca el renglón del envío con `con_etiquetas`; el escrito a mano, no", async () => {
    guiaConEnvio();
    const { GET } = await guia();
    const json = (await (await GET(req(), { params: { id: GUIA } })).json()) as {
      guia_items: Array<{ id: string; con_etiquetas?: boolean }>;
    };
    expect(json.guia_items.find((i) => i.id === R1)?.con_etiquetas).toBe(true);
    expect(json.guia_items.find((i) => i.id === R2)?.con_etiquetas).toBeUndefined();
  });

  it("🔴 `items_bultos` para el renglón del envío se IGNORA; el del renglón a mano se escribe", async () => {
    guiaConEnvio();
    const { PUT } = await guia();
    const res = await PUT(req({ items_bultos: [{ id: R1, bultos: 25 }, { id: R2, bultos: 9 }] }), { params: { id: GUIA } });
    expect(res.status).toBe(200);
    expect(tablas.guia_items.find((i) => i.id === R1)!.bultos).toBe(20);
    expect(tablas.guia_items.find((i) => i.id === R2)!.bultos).toBe(9);
  });
});

// ─── 6 · importar por destino ────────────────────────────────────────────────

describe("6. importar ata por cliente + empresa + DESTINO", () => {
  it("dos renglones del mismo cliente con destinos distintos: cada envío al suyo", async () => {
    tablas.guia_items = [
      { id: R1, guia_id: GUIA, cliente_codigo: "D-170", empresa: "Fashion Shoes", direccion: "Paso Canoas", deleted: false },
      { id: R2, guia_id: GUIA, cliente_codigo: "D-170", empresa: "Fashion Shoes", direccion: "David", deleted: false },
    ];
    tablas.guias_etiquetas = [
      etiqueta({ id: 1, destino: "Paso Canoas" }),
      etiqueta({ id: 2, envio_id: "e-2", switch_factura_id: 2, destino: "David" }),
    ];
    const { POST } = await importar();
    const res = await POST(req({ guia_id: GUIA, ids: [1, 2] }));
    expect((await res.json()).atadas).toBe(2);
    expect(tablas.guias_etiquetas.map((e) => e.guia_item_id)).toEqual([R1, R2]);
  });
});

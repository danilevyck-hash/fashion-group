/**
 * ─────────────────────────────────────────────────────────────────────────────
 * CAJA — LO QUE EL SERVIDOR DECIDE (7-sep-2026).
 *
 * Se LLAMA al handler y se mira QUÉ SE ESCRIBIÓ, no el texto del archivo.
 *
 *  1. 🔴 CERRAR NO ABRE OTRO A CIEGAS. El cierre encadenaba la apertura sin
 *     comprobar nada: con otro período ya abierto habría creado un tercero. La
 *     caja lleva UN ciclo a la vez, y cuando no se abre, se DICE por qué.
 *  2. 🔴 UN PERÍODO CON GASTOS NO SE ELIMINA. Daniel: «no se debería eliminar
 *     un período con gastos, no es normal». El aviso viejo prometía borrar «este
 *     período y todos sus gastos» y era mentira: solo marcaba el período.
 *  3. 🔴 EL GASTO NO LLEVA RESPONSABLE. Daniel: «no deberían de haber 2 nombres
 *     en un gasto, solo uno». Ni al crearlo ni al editarlo se escribe
 *     `responsable` ni `responsable_id`.
 *  4. 🔴 ABRIR UN PERÍODO DEJA RASTRO — hasta hoy no se anotaba en ningún lado.
 *  5. El saldo del cierre se guarda REDONDEADO a centavos.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/require-auth", () => ({
  getSession: () => ({ role: "secretaria", userName: "Angela", userId: "u-1" }),
}));
vi.mock("@/lib/requireRole", () => ({
  requireRole: () => ({ role: "admin", userName: "Angela", userId: "u-1" }),
}));

const logs: Array<{ accion: string; detalles: Record<string, unknown> }> = [];
vi.mock("@/lib/log-activity", () => ({
  logActivity: async (_rol: string, accion: string, _ent: string, detalles: Record<string, unknown>) => {
    logs.push({ accion, detalles });
  },
}));

const PERIODO_ID = "11111111-1111-4111-8111-111111111111";
const GASTO_ID = "22222222-2222-4222-8222-222222222222";

let periodoFila: Record<string, unknown> | null;
let gastosFilas: Array<{ total: number | null }>;
/** Períodos ABIERTOS que quedan en la base (además del que se está cerrando). */
let otroAbierto: Record<string, unknown> | null;
/** Cuántos gastos vivos tiene el período (lo que cuenta el DELETE). */
let cuentaGastos: number;
let ultimoNumero: number;
let escrituras: Array<{ tabla: string; op: string; datos: Record<string, unknown>; filtros: Record<string, unknown> }>;

function cadena(tabla: string) {
  const filtros: Record<string, unknown> = {};
  let op = "select";
  let cols = "";
  let datos: Record<string, unknown> = {};
  let headCount = false;

  function resolver(): { data: unknown; error: null; count?: number } {
    if (op === "update") {
      escrituras.push({ tabla, op, datos, filtros });
      return { data: { id: filtros.id, ...(periodoFila || {}), ...datos }, error: null };
    }
    if (op === "insert") {
      escrituras.push({ tabla, op, datos, filtros });
      return { data: { id: "nuevo-periodo", ...datos }, error: null };
    }
    if (tabla === "caja_gastos") {
      if (headCount) return { data: null, error: null, count: cuentaGastos };
      if (filtros.id) return { data: { id: GASTO_ID, caja_periodos: { estado: "abierto", deleted: false } }, error: null };
      return { data: gastosFilas, error: null };
    }
    // caja_periodos
    if (filtros.estado === "abierto") return { data: otroAbierto, error: null };
    if (cols === "numero") return { data: { numero: ultimoNumero }, error: null };
    return { data: periodoFila, error: null };
  }

  const c: Record<string, unknown> = {};
  Object.assign(c, {
    select: (s?: string, o?: { count?: string; head?: boolean }) => {
      if (op === "select") cols = s || "";
      if (o?.head) headCount = true;
      return c;
    },
    eq: (col: string, val: unknown) => { filtros[col] = val; return c; },
    in: () => c,
    order: () => c,
    limit: () => c,
    update: (d: Record<string, unknown>) => { op = "update"; datos = d; return c; },
    insert: (d: Record<string, unknown>) => { op = "insert"; datos = d; return c; },
    maybeSingle: async () => resolver(),
    single: async () => resolver(),
    then: (onOk: (v: unknown) => unknown) => Promise.resolve(resolver()).then(onOk),
  });
  return c;
}

vi.mock("@/lib/supabase-server", () => ({
  supabaseServer: { from: (tabla: string) => cadena(tabla) },
}));

beforeEach(() => {
  escrituras = [];
  logs.length = 0;
  ultimoNumero = 3;
  otroAbierto = null;
  cuentaGastos = 0;
  periodoFila = { fondo_inicial: 200, estado: "abierto", deleted: false };
  gastosFilas = [];
});

async function cerrar() {
  const { PATCH } = await import("@/app/api/caja/periodos/[id]/route");
  const req = { json: async () => ({}) } as never;
  const res = await PATCH(req, { params: { id: PERIODO_ID } });
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

async function borrar() {
  const { DELETE } = await import("@/app/api/caja/periodos/[id]/route");
  const res = await DELETE({} as never, { params: { id: PERIODO_ID } });
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

async function crearGasto(body: Record<string, unknown>) {
  const { POST } = await import("@/app/api/caja/gastos/route");
  const res = await POST({ json: async () => body } as never);
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

async function editarGasto(body: Record<string, unknown>) {
  const { PATCH } = await import("@/app/api/caja/gastos/[id]/route");
  const res = await PATCH({ json: async () => body } as never, { params: { id: GASTO_ID } });
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

// ── 1. Cerrar no abre otro a ciegas ─────────────────────────────────────────

describe("🔴 1. CERRAR NO ABRE OTRO PERÍODO SI YA HAY UNO ABIERTO", () => {
  it("con otro abierto: cierra, NO inserta nada y dice por qué", async () => {
    otroAbierto = { id: "otro", numero: 9 };
    const r = await cerrar();

    expect(r.status).toBe(200);
    expect(escrituras.filter((e) => e.op === "insert")).toHaveLength(0);
    expect(r.json.siguiente).toBeNull();
    expect(String(r.json.siguiente_motivo)).toContain("Nº 9");
    expect(String(r.json.siguiente_motivo)).toContain("un solo ciclo");
    // el cierre SÍ ocurrió: no se pierde la acción por el freno
    expect(escrituras.filter((e) => e.op === "update")[0].datos.estado).toBe("cerrado");
  });

  it("🔴 CONTROL: sin otro abierto, el siguiente abre como siempre", async () => {
    otroAbierto = null;
    const r = await cerrar();

    const ins = escrituras.filter((e) => e.op === "insert");
    expect(ins).toHaveLength(1);
    expect(ins[0].datos.numero).toBe(4);
    expect(ins[0].datos.fondo_inicial).toBe(200);
    expect(ins[0].datos.estado).toBe("abierto");
    expect(r.json.siguiente_motivo).toBeNull();
  });

  it("el cierre va ANTES que la apertura, siempre", async () => {
    await cerrar();
    expect(escrituras.map((e) => e.op)).toEqual(["update", "insert"]);
  });

  it("el saldo del cierre se guarda REDONDEADO a centavos", async () => {
    // Los 26 recibos reales del período Nº2: 200.00000000000003 sumados a pelo.
    gastosFilas = [6, 30, 20, 5, 5, 6, 4, 5, 6.2, 5, 1, 12.3, 10, 10.59, 10.59, 12.4,
      11.02, 5, 2.78, 5, 5, 5, 5, 7.49, 2.5, 2.13].map((total) => ({ total }));
    const r = await cerrar();
    expect(r.json.saldo_cierre).toBe(0);
    expect(escrituras[0].datos.saldo_cierre).toBe(0);
  });
});

// ── 2. Un período con gastos no se elimina ──────────────────────────────────

describe("🔴 2. UN PERÍODO CON GASTOS NO SE ELIMINA", () => {
  it("con 26 gastos: 400, dice cuántos, y CERO escrituras", async () => {
    cuentaGastos = 26;
    const r = await borrar();

    expect(r.status).toBe(400);
    expect(String(r.json.error)).toContain("26 gastos");
    expect(escrituras).toHaveLength(0);
  });

  it("con 1 gasto lo dice en singular", async () => {
    cuentaGastos = 1;
    const r = await borrar();
    expect(String(r.json.error)).toContain("1 gasto.");
  });

  it("🔴 CONTROL: un período VACÍO sí se elimina, con soft delete", async () => {
    cuentaGastos = 0;
    const r = await borrar();

    expect(r.status).toBe(200);
    expect(escrituras).toHaveLength(1);
    expect(escrituras[0].datos).toEqual({ deleted: true });
    expect(escrituras[0].filtros.id).toBe(PERIODO_ID);
    // Nada se borra de verdad: es un soft delete.
    expect(escrituras[0].op).toBe("update");
  });
});

// ── 3. El gasto no lleva responsable ────────────────────────────────────────

describe("🔴 3. EL GASTO NO LLEVA RESPONSABLE", () => {
  const gastoBase = {
    periodo_id: PERIODO_ID,
    fecha: "2026-09-03",
    descripcion: "Comida",
    proveedor: "Super 99",
    nro_factura: "196854200",
    categoria: "Alimentación",
    subtotal: 10.59,
    itbms: 0,
    total: 10.59,
  };

  it("se crea SIN responsable: ni se pide ni se escribe", async () => {
    const r = await crearGasto(gastoBase);
    expect(r.status).toBe(200);
    const ins = escrituras.find((e) => e.op === "insert" && e.tabla === "caja_gastos");
    expect(ins).toBeTruthy();
    expect(ins!.datos).not.toHaveProperty("responsable");
    expect(ins!.datos).not.toHaveProperty("responsable_id");
  });

  it("aunque lo manden, NO se escribe (ni al crear ni al editar)", async () => {
    await crearGasto({ ...gastoBase, responsable: "Angela garciia", responsable_id: "r-1" });
    const ins = escrituras.find((e) => e.op === "insert" && e.tabla === "caja_gastos")!;
    expect(ins.datos).not.toHaveProperty("responsable");
    expect(ins.datos).not.toHaveProperty("responsable_id");

    escrituras = [];
    await editarGasto({ descripcion: "Comida", responsable: "Angela garcia", responsable_id: "r-1" });
    const upd = escrituras.find((e) => e.op === "update" && e.tabla === "caja_gastos")!;
    expect(upd.datos).not.toHaveProperty("responsable");
    expect(upd.datos).not.toHaveProperty("responsable_id");
    expect(upd.datos.descripcion).toBe("Comida");
  });

  it("🔴 CONTROL: el proveedor SÍ sigue siendo obligatorio", async () => {
    const r = await crearGasto({ ...gastoBase, proveedor: "  " });
    expect(r.status).toBe(400);
    expect(String(r.json.error)).toContain("proveedor");
    expect(escrituras.filter((e) => e.op === "insert")).toHaveLength(0);
  });
});

// ── 4. Abrir un período deja rastro ─────────────────────────────────────────

describe("🔴 4. ABRIR UN PERÍODO SE ANOTA (quién y con qué fondo)", () => {
  it("el cierre encadenado anota la apertura, no solo el cierre", async () => {
    await cerrar();
    const apertura = logs.find((l) => l.accion === "caja_periodo_open");
    expect(apertura).toBeTruthy();
    expect(apertura!.detalles.numero).toBe(4);
    expect(apertura!.detalles.fondo_inicial).toBe(200);
    expect(logs.some((l) => l.accion === "caja_periodo_close")).toBe(true);
  });

  it("«+ Nuevo período» también lo anota, con la responsable elegida", async () => {
    const { POST } = await import("@/app/api/caja/periodos/route");
    const res = await POST({ json: async () => ({ fondo_inicial: 200, responsable_empleado_codigo: "7" }) } as never);
    expect(res.status).toBe(200);

    const apertura = logs.find((l) => l.accion === "caja_periodo_open")!;
    expect(apertura.detalles.responsable_empleado_codigo).toBe("7");
    // 🔴 Se guarda el CÓDIGO, nunca el nombre.
    const ins = escrituras.find((e) => e.op === "insert")!;
    expect(ins.datos.responsable_empleado_codigo).toBe("7");
    expect(ins.datos).not.toHaveProperty("responsable");
    expect(ins.datos).not.toHaveProperty("responsable_nombre");
  });

  it("🔴 CONTROL: «+ Nuevo período» tampoco abre uno si ya hay otro abierto", async () => {
    otroAbierto = { id: "otro", numero: 3 };
    const { POST } = await import("@/app/api/caja/periodos/route");
    const res = await POST({ json: async () => ({ fondo_inicial: 200 }) } as never);
    expect(res.status).toBe(400);
    expect(escrituras.filter((e) => e.op === "insert")).toHaveLength(0);
  });
});

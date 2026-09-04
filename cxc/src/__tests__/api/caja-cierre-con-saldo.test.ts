/**
 * ─────────────────────────────────────────────────────────────────────────────
 * PATCH /api/caja/periodos/[id] — EL CIERRE NO EXIGE SALDO 0 (4-sep-2026).
 *
 * Daniel, textual: *«cierro cuando queda poca plata (criterio de la secretaria)
 * y le doy la diferencia para llegar a los 200»*. La regla vieja rechazaba el
 * cierre si |fondo − gastos| > 0.005, y la evidencia de que se estaba forzando
 * quedó en producción: los dos períodos cerrados dan $200.00 clavados y hay
 * gastos de $0.05 (22-jul) y $0.87 (1-sep) creados y borrados el mismo día del
 * cierre — centavos inventados para cuadrar.
 *
 * Lo que este archivo vigila:
 *  - el período cierra con el saldo que tenga, y ese saldo SE GUARDA
 *    (`saldo_cierre`, DDL 20260920120000);
 *  - un saldo NEGATIVO tampoco bloquea — es un hecho, no un error;
 *  - al cerrar se abre el período siguiente con el mismo fondo ($200), por el
 *    MISMO camino que el botón «+ Nuevo período» (abrirPeriodo);
 *  - CONTROL: un período ya cerrado no se cierra dos veces.
 *
 * Se LLAMA al handler y se mira QUÉ SE ESCRIBIÓ, no el texto del archivo.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/require-auth", () => ({
  getSession: () => ({ role: "secretaria", userName: "Angela", userId: "u-1" }),
}));
vi.mock("@/lib/requireRole", () => ({
  requireRole: () => ({ role: "secretaria", userName: "Angela", userId: "u-1" }),
}));
vi.mock("@/lib/log-activity", () => ({
  logActivity: async () => undefined,
}));

const PERIODO_ID = "11111111-1111-4111-8111-111111111111";

let periodoFila: Record<string, unknown> | null;
let gastosFilas: Array<{ total: number | null }>;
let ultimoNumero: number;
let escrituras: Array<{ tabla: string; op: string; datos: Record<string, unknown>; filtros: Record<string, unknown> }>;

function cadena(tabla: string) {
  const filtros: Record<string, unknown> = {};
  let op = "select";
  let cols = "";
  let datos: Record<string, unknown> = {};

  function resolver(): { data: unknown; error: null } {
    if (op === "update") {
      escrituras.push({ tabla, op, datos, filtros });
      return { data: { id: filtros.id, ...(periodoFila || {}), ...datos }, error: null };
    }
    if (op === "insert") {
      escrituras.push({ tabla, op, datos, filtros });
      return { data: { id: "nuevo-periodo", ...datos }, error: null };
    }
    if (tabla === "caja_gastos") return { data: gastosFilas, error: null };
    if (cols === "numero") return { data: { numero: ultimoNumero }, error: null };
    return { data: periodoFila, error: null };
  }

  const c: Record<string, unknown> = {};
  Object.assign(c, {
    select: (s?: string) => { if (op === "select") cols = s || ""; return c; },
    eq: (col: string, val: unknown) => { filtros[col] = val; return c; },
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
  ultimoNumero = 3;
  periodoFila = { fondo_inicial: 200, estado: "abierto", deleted: false };
  gastosFilas = [];
});

async function cerrar() {
  const { PATCH } = await import("@/app/api/caja/periodos/[id]/route");
  const req = { json: async () => ({}) } as never;
  const res = await PATCH(req, { params: { id: PERIODO_ID } });
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

describe("🔴 el cierre NO exige saldo 0: cierra con el saldo que tenga y lo guarda", () => {
  it("cierra con saldo $36.72 y lo escribe en saldo_cierre", async () => {
    gastosFilas = [{ total: 100 }, { total: 63.28 }]; // fondo 200 → saldo 36.72
    const r = await cerrar();
    expect(r.status).toBe(200);
    expect(r.json.error).toBeUndefined();

    const upd = escrituras.filter((e) => e.op === "update" && e.tabla === "caja_periodos");
    expect(upd).toHaveLength(1);
    expect(upd[0].datos.estado).toBe("cerrado");
    expect(upd[0].datos.saldo_cierre).toBe(36.72);
    expect(upd[0].filtros.id).toBe(PERIODO_ID);
    expect(r.json.saldo_cierre).toBe(36.72);
  });

  it("cierra con saldo 0 (el caso que antes era el único permitido)", async () => {
    gastosFilas = [{ total: 200 }];
    const r = await cerrar();
    expect(r.status).toBe(200);
    const upd = escrituras.find((e) => e.op === "update");
    expect(upd?.datos.saldo_cierre).toBe(0);
  });

  it("cierra con saldo NEGATIVO, lo dice y NO bloquea", async () => {
    gastosFilas = [{ total: 236.5 }]; // saldo -36.50
    const r = await cerrar();
    expect(r.status).toBe(200);
    expect(r.json.error).toBeUndefined();
    // Lo dice: el saldo negativo viaja en la respuesta y queda escrito.
    expect(r.json.saldo_cierre).toBe(-36.5);
    const upd = escrituras.find((e) => e.op === "update");
    expect(upd?.datos.saldo_cierre).toBe(-36.5);
  });
});

describe("🔴 «Cerrar y abrir el N»: el período siguiente abre solo, en $200", () => {
  it("inserta el período siguiente con fondo $200, abierto y numero = último + 1", async () => {
    gastosFilas = [{ total: 163.28 }];
    ultimoNumero = 3;
    const r = await cerrar();
    expect(r.status).toBe(200);

    const ins = escrituras.filter((e) => e.op === "insert" && e.tabla === "caja_periodos");
    expect(ins).toHaveLength(1);
    expect(ins[0].datos.fondo_inicial).toBe(200);
    expect(ins[0].datos.estado).toBe("abierto");
    expect(ins[0].datos.numero).toBe(4);

    const siguiente = r.json.siguiente as Record<string, unknown>;
    expect(siguiente?.numero).toBe(4);
  });

  it("el cierre va ANTES que la apertura (nunca queda el nuevo abierto sin cerrar el viejo)", async () => {
    gastosFilas = [{ total: 50 }];
    await cerrar();
    const ops = escrituras.map((e) => e.op);
    expect(ops).toEqual(["update", "insert"]);
  });
});

describe("CONTROL: lo que sigue cerrado, cerrado está", () => {
  it("un período ya cerrado no se cierra dos veces (400, cero escrituras)", async () => {
    periodoFila = { fondo_inicial: 200, estado: "cerrado", deleted: false };
    const r = await cerrar();
    expect(r.status).toBe(400);
    expect(escrituras).toHaveLength(0);
  });

  it("un período borrado contesta 404 (y no abre ninguno nuevo)", async () => {
    periodoFila = { fondo_inicial: 200, estado: "abierto", deleted: true };
    const r = await cerrar();
    expect(r.status).toBe(404);
    expect(escrituras).toHaveLength(0);
  });
});

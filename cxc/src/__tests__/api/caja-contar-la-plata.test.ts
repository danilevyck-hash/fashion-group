/**
 * ─────────────────────────────────────────────────────────────────────────────
 * CAJA — CONTAR LA PLATA AL CERRAR (20-sep-2026).
 *
 * 🩸 El cierre sumaba los recibos, los restaba del fondo y escribía «Queda en
 * caja $36.72». NUNCA preguntaba cuánta plata hay de verdad. Medido contra
 * producción: los DOS cierres de toda la historia dieron exactamente $0.00, y
 * en los dos el último recibo cargado —7 y 10 segundos antes de cerrar— es
 * exactamente lo que faltaba para llegar a $200.
 *
 * Lo que este archivo vigila, del lado del servidor:
 *  - lo contado y la diferencia se GUARDAN con el período;
 *  - 🔴 un descuadre NO frena el cierre (200, se cierra y se abre el siguiente);
 *  - 🔴 FALLA ABIERTA: sin la DDL 20261211120000 el cierre reintenta sin las
 *    columnas nuevas y conserva `saldo_cierre`;
 *  - CONTROL: sin conteo se cierra como antes, sin tocar las columnas nuevas;
 *  - la cuenta de la diferencia (módulo puro).
 *
 * Se LLAMA al handler y se mira QUÉ SE ESCRIBIÓ, no el texto del archivo.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  diferenciaDeCaja,
  hayDescuadre,
  leerConteo,
  mensajeDeDiferencia,
} from "@/lib/caja/conteo-cierre";

vi.mock("@/lib/require-auth", () => ({
  getSession: () => ({ role: "secretaria", userName: "Angela", userId: "u-1" }),
}));
vi.mock("@/lib/requireRole", () => ({
  requireRole: () => ({ role: "secretaria", userName: "Angela", userId: "u-1" }),
}));
vi.mock("@/lib/log-activity", () => ({ logActivity: async () => undefined }));

const PERIODO_ID = "11111111-1111-4111-8111-111111111111";

let periodoFila: Record<string, unknown> | null;
let gastosFilas: Array<{ total: number | null }>;
/** Columnas que la base NO tiene todavía: un update que las toque revienta. */
let columnasQueFaltan: string[];
let escrituras: Array<{ tabla: string; op: string; datos: Record<string, unknown> }>;

function cadena(tabla: string) {
  const filtros: Record<string, unknown> = {};
  let op = "select";
  let cols = "";
  let datos: Record<string, unknown> = {};

  function resolver(): { data: unknown; error: unknown } {
    if (op === "update") {
      const faltante = columnasQueFaltan.find((c) => c in datos);
      if (faltante) {
        return { data: null, error: { message: `column "${faltante}" does not exist` } };
      }
      escrituras.push({ tabla, op, datos });
      return { data: { id: filtros.id, ...(periodoFila || {}), ...datos }, error: null };
    }
    if (op === "insert") {
      escrituras.push({ tabla, op, datos });
      return { data: { id: "nuevo-periodo", ...datos }, error: null };
    }
    if (tabla === "caja_gastos") return { data: gastosFilas, error: null };
    if (cols === "numero") return { data: { numero: 3 }, error: null };
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
  columnasQueFaltan = [];
  periodoFila = { fondo_inicial: 200, estado: "abierto", deleted: false };
  gastosFilas = [];
});

async function cerrar(cuerpo: Record<string, unknown>) {
  const { PATCH } = await import("@/app/api/caja/periodos/[id]/route");
  const req = { json: async () => cuerpo } as never;
  const res = await PATCH(req, { params: { id: PERIODO_ID } });
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

const cierrePeriodo = () => escrituras.filter((e) => e.op === "update" && e.tabla === "caja_periodos");

describe("🔴 LA PLATA CONTADA SE GUARDA CON EL PERÍODO", () => {
  it("cuadra: contado $36.72 contra un saldo de $36.72 → diferencia 0", async () => {
    gastosFilas = [{ total: 100 }, { total: 63.28 }]; // fondo 200 → saldo 36.72
    const r = await cerrar({ efectivo_contado: 36.72 });
    expect(r.status).toBe(200);
    const upd = cierrePeriodo();
    expect(upd).toHaveLength(1);
    expect(upd[0].datos.saldo_cierre).toBe(36.72);
    expect(upd[0].datos.efectivo_contado).toBe(36.72);
    expect(upd[0].datos.diferencia_cierre).toBe(0);
  });

  it("🔴 FALTAN $2.00: se anota la diferencia y el cierre NO se frena", async () => {
    gastosFilas = [{ total: 163.28 }]; // saldo 36.72
    const r = await cerrar({ efectivo_contado: 34.72 });
    expect(r.status).toBe(200);
    expect(r.json.error).toBeUndefined();
    const upd = cierrePeriodo();
    expect(upd[0].datos.efectivo_contado).toBe(34.72);
    expect(upd[0].datos.diferencia_cierre).toBe(-2);
    expect(r.json.diferencia_cierre).toBe(-2);
    // Y el período siguiente abre igual: un descuadre no corta el ciclo.
    expect(escrituras.some((e) => e.op === "insert" && e.tabla === "caja_periodos")).toBe(true);
  });

  it("SOBRAN $1.50: la diferencia positiva también se guarda", async () => {
    gastosFilas = [{ total: 163.28 }]; // saldo 36.72
    const r = await cerrar({ efectivo_contado: 38.22 });
    expect(r.status).toBe(200);
    expect(cierrePeriodo()[0].datos.diferencia_cierre).toBe(1.5);
  });

  it("contar $0.00 es un conteo válido: caja vacía, no «no se contó»", async () => {
    gastosFilas = [{ total: 163.28 }]; // saldo 36.72
    await cerrar({ efectivo_contado: 0 });
    const upd = cierrePeriodo();
    expect(upd[0].datos.efectivo_contado).toBe(0);
    expect(upd[0].datos.diferencia_cierre).toBe(-36.72);
  });
});

describe("🔴 FALLA ABIERTA: sin la DDL nueva, el cierre sigue siendo el de hoy", () => {
  it("sin las columnas nuevas se cierra igual y `saldo_cierre` se conserva", async () => {
    columnasQueFaltan = ["efectivo_contado", "diferencia_cierre"];
    gastosFilas = [{ total: 163.28 }];
    const r = await cerrar({ efectivo_contado: 30 });
    expect(r.status).toBe(200);
    const upd = cierrePeriodo();
    expect(upd).toHaveLength(1);
    expect(upd[0].datos.saldo_cierre).toBe(36.72);
    expect("efectivo_contado" in upd[0].datos).toBe(false);
  });

  it("sin NINGUNA de las dos DDL (tampoco `saldo_cierre`) se cierra como antes", async () => {
    columnasQueFaltan = ["efectivo_contado", "diferencia_cierre", "saldo_cierre"];
    gastosFilas = [{ total: 163.28 }];
    const r = await cerrar({ efectivo_contado: 30 });
    expect(r.status).toBe(200);
    const upd = cierrePeriodo();
    expect(upd).toHaveLength(1);
    expect(upd[0].datos.estado).toBe("cerrado");
    expect("saldo_cierre" in upd[0].datos).toBe(false);
  });
});

describe("CONTROL: lo que no cambió", () => {
  it("sin conteo (cuerpo vacío) se cierra con la foto de siempre y nada más", async () => {
    gastosFilas = [{ total: 163.28 }];
    const r = await cerrar({});
    expect(r.status).toBe(200);
    const upd = cierrePeriodo();
    expect(upd).toHaveLength(1);
    expect(upd[0].datos.saldo_cierre).toBe(36.72);
    expect("efectivo_contado" in upd[0].datos).toBe(false);
    expect(r.json.diferencia_cierre).toBeNull();
  });

  it("un conteo que no es un número no se inventa: se cierra sin conteo", async () => {
    gastosFilas = [{ total: 163.28 }];
    await cerrar({ efectivo_contado: "treinta" });
    expect("efectivo_contado" in cierrePeriodo()[0].datos).toBe(false);
  });

  it("un período ya cerrado sigue sin cerrarse dos veces, aunque venga con conteo", async () => {
    periodoFila = { fondo_inicial: 200, estado: "cerrado", deleted: false };
    const r = await cerrar({ efectivo_contado: 10 });
    expect(r.status).toBe(400);
    expect(escrituras).toHaveLength(0);
  });
});

describe("la cuenta de la diferencia (módulo puro)", () => {
  it("resta en centavos y no arrastra el residuo del punto flotante", () => {
    expect(diferenciaDeCaja(0.1 + 0.2, 0.3)).toBe(0);
    expect(diferenciaDeCaja(34.72, 36.72)).toBe(-2);
    expect(diferenciaDeCaja(38.22, 36.72)).toBe(1.5);
  });

  it("lo tecleado: vacío, letras y negativos no son un conteo; el cero sí", () => {
    expect(leerConteo("")).toBeNull();
    expect(leerConteo("   ")).toBeNull();
    expect(leerConteo(".")).toBeNull();
    expect(leerConteo("-5")).toBeNull();
    expect(leerConteo("abc")).toBeNull();
    expect(leerConteo("0")).toBe(0);
    expect(leerConteo("36.72")).toBe(36.72);
  });

  it("se lee en palabras: «Faltan», «Sobran», y cuadra", () => {
    expect(mensajeDeDiferencia(-2)).toBe("Faltan $2.00");
    expect(mensajeDeDiferencia(1.5)).toBe("Sobran $1.50");
    expect(mensajeDeDiferencia(0)).toBe("Cuadra con la cuenta del sistema.");
    expect(hayDescuadre(0)).toBe(false);
    expect(hayDescuadre(-0.01)).toBe(true);
  });
});

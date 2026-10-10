/* ─────────────────────────────────────────────────────────────────────────────
 * FERIADO O DÍA LIBRE — el candado (30-sep-2026).
 *
 * Daniel y la contable: las fiestas judías estaban cargadas como feriado y se
 * pagaban sin deuda. La regla de Daniel: *«es día libre pero los colaboradores
 * deben»* las horas. Se exige:
 *
 *   a. El TIPO viaja por la ruta de Feriados y la pantalla lo elige; sin la
 *      migración, un feriado se guarda como siempre y un día libre NO.
 *   b. El MOTOR: un día libre no es feriado — sin recargo 1.50 a quien trabajó,
 *      y sin ausencia a quien no (Multifashion incluida).
 *   c. La DEUDA SOLA: solo días que ya pasaron, nunca a Multifashion, nunca a
 *      quien marcó ese día (regla 8), y repetir no crea nada.
 *
 * Fechas fijas: el lunes 21-sep-2026 (Yom Kipur) y «hoy» = 30-sep-2026.
 * ─────────────────────────────────────────────────────────────────────────── */
import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";

import { REGLAS_DEFAULT } from "@/lib/asistencia/config";
import { armarReporte, type HorarioPersona, type Marcacion } from "@/lib/asistencia/reporte";
import { clasificarDia } from "@/lib/asistencia/planilla";
import { diasLaborablesDeEmpresa } from "@/lib/asistencia/horario-configurable";
import { esColumnaTipoFaltante, separarFeriados, tipoFeriado } from "@/lib/asistencia/feriados";

const RAIZ = path.resolve(__dirname, "../../..");
const puro = (p: string) =>
  fs.readFileSync(path.join(RAIZ, p), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const YK = "2026-09-21";
const HOY = "2026-09-30";
const MF = "american_classic";

// ── El doble de la base: una cadena que registra lo que se escribe ───────────
const db = {
  feriados: [] as { fecha: string; nombre: string; tipo: string }[],
  sinColumnaTipo: false,
  deudasExistentes: [] as { empleado_codigo: string; fecha: string }[],
  insertados: [] as Record<string, unknown>[],
  upserts: [] as Record<string, unknown>[],
};
function responder(tabla: string, op: string, cols: string, payload: unknown) {
  if (tabla === "asistencia_feriados") {
    if (op === "upsert") {
      const p = payload as Record<string, unknown>;
      if (db.sinColumnaTipo && "tipo" in p) {
        return { data: null, error: { code: "PGRST204", message: "Could not find the 'tipo' column of 'asistencia_feriados' in the schema cache" } };
      }
      db.upserts.push(p);
      return { data: null, error: null };
    }
    if (db.sinColumnaTipo && cols.includes("tipo")) {
      return { data: null, error: { code: "42703", message: "column asistencia_feriados.tipo does not exist" } };
    }
    return { data: db.feriados.map((f) => (db.sinColumnaTipo ? { fecha: f.fecha, nombre: f.nombre } : f)), error: null };
  }
  if (tabla === "asistencia_dia_libre_deuda") {
    if (op === "insert") { db.insertados.push(...(payload as Record<string, unknown>[])); return { error: null }; }
    return { data: db.deudasExistentes, error: null };
  }
  return { data: [], error: null };
}
function consulta(tabla: string) {
  let op = "select"; let cols = ""; let payload: unknown;
  const q: Record<string, unknown> = {};
  const self = () => q;
  Object.assign(q, {
    select: (c: string) => { cols = c; return q; },
    eq: self, in: self, gte: self, lte: self, order: self,
    insert: (f: unknown) => { op = "insert"; payload = f; return q; },
    upsert: (f: unknown) => { op = "upsert"; payload = f; return q; },
    then: (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) =>
      Promise.resolve(responder(tabla, op, cols, payload)).then(ok, ko),
  });
  return q;
}

vi.doMock("@/lib/requireRole", () => ({
  requireRole: () => ({ role: "admin", userName: "daniel", userId: "1", sessionToken: "t" }),
}));
vi.doMock("@/lib/supabase-server", () => ({
  HAS_SERVICE_ROLE: true,
  supabaseServer: { from: (t: string) => consulta(t) },
}));
const personas = [
  { empleado_codigo: "42", nombre: "SAMIR POLO", empresa: "confecciones_boston", salario_mensual: 550, jornada_semanal: 48, fecha_ingreso: "2024-01-08", fecha_salida: null },
  { empleado_codigo: "43", nombre: "MARCÓ ESE DÍA", empresa: "confecciones_boston", salario_mensual: 550, jornada_semanal: 48, fecha_ingreso: "2024-01-08", fecha_salida: null },
  { empleado_codigo: "60", nombre: "VISTANA UNO", empresa: "vistana", salario_mensual: 800, jornada_semanal: 40, fecha_ingreso: "2024-01-08", fecha_salida: null },
  { empleado_codigo: "301", nombre: "JENIFER MIRANDA", empresa: MF, salario_mensual: 750, jornada_semanal: 48, fecha_ingreso: "2018-09-16", fecha_salida: null },
];
vi.doMock("@/lib/asistencia/config-server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/asistencia/config-server")>()),
  leerReglas: async () => ({ reglas: REGLAS_DEFAULT, faltaMigracion: false }),
  leerPersonas: async () => ({ filas: personas, faltaMigracion: false }),
}));
vi.doMock("@/lib/asistencia/horarios-server", () => ({
  leerHorarios: async () => ({ horarios: [], faltaMigracion: false }),
}));
const marco = new Set<string>();
vi.doMock("@/lib/asistencia/quien-marco-server", () => ({ leerQuienMarco: async () => marco }));

beforeEach(() => {
  db.feriados = [
    { fecha: YK, nombre: "Yom Kipur", tipo: "dia_libre" },
    { fecha: "2026-09-25", nombre: "Feriado nacional de prueba", tipo: "feriado" },
    // Hoy: todavía no pasó, no se juzga.
    { fecha: HOY, nombre: "Día libre de hoy", tipo: "dia_libre" },
  ];
  db.sinColumnaTipo = false;
  db.deudasExistentes = [];
  db.insertados = [];
  db.upserts = [];
  marco.clear();
});

// ─────────────────────────────────────────────────────────────────────────────
describe("a. 🔴 EL TIPO: la ruta de Feriados y la pantalla", () => {
  const post = async (body: unknown) => {
    const { POST } = await import("@/app/api/asistencia/feriados/route");
    return POST({ json: async () => body } as never);
  };

  it("guarda el tipo con el MISMO upsert; sin tipo es feriado; un tipo raro es 400", async () => {
    expect((await post({ fecha: "2026-10-20", nombre: "Cierre", tipo: "dia_libre" })).status).toBe(200);
    expect((await post({ fecha: "2026-10-21", nombre: "Cierre" })).status).toBe(200);
    expect((await post({ fecha: "2026-10-22", nombre: "Cierre", tipo: "otro" })).status).toBe(400);
    expect(db.upserts).toEqual([
      { fecha: "2026-10-20", nombre: "Cierre", tipo: "dia_libre" },
      { fecha: "2026-10-21", nombre: "Cierre", tipo: "feriado" },
    ]);
    // Una fecha FUTURA no crea deuda al guardarse.
    expect(db.insertados).toEqual([]);
  });

  it("🔴 un error de escritura que nombra `tipo` NO se traga: ni feriado ni día libre se guardan sin su tipo", async () => {
    // La columna existe (9-oct-2026). Antes el feriado se reescribía SIN tipo.
    db.sinColumnaTipo = true;
    for (const tipo of ["feriado", "dia_libre"]) {
      const r = await post({ fecha: "2026-10-21", nombre: "Cierre", tipo });
      expect(r.status).toBe(500);
      expect((await r.json()).error).not.toMatch(/20261222120000_asistencia_feriados_tipo\.sql/);
    }
    expect(db.upserts).toHaveLength(0);
  });

  it("el GET devuelve el tipo; un error que nombra la columna ya no se lee como «todo es feriado»", async () => {
    const { GET } = await import("@/app/api/asistencia/feriados/route");
    const req = () => ({ nextUrl: new URL("http://x/api/asistencia/feriados?anio=2026") }) as never;
    const con = await (await GET(req())).json();
    expect(con.feriados.map((f: { tipo: string }) => f.tipo)).toEqual(["dia_libre", "feriado", "dia_libre"]);
    expect(con.faltaMigracionTipo).toBe(false);
    db.sinColumnaTipo = true;
    expect((await GET(req())).status).toBe(500);
  });

  it("la pantalla: el tipo se elige con ControlSegmentado, la lista dice «debe las horas» y cambiar es el mismo POST", () => {
    const s = puro("src/app/asistencia/FeriadosTab.tsx");
    expect(s).toMatch(/<ControlSegmentado[\s\S]*?options=\{TIPOS_FERIADO\.map/);
    // 1-oct-2026, Daniel: nombres normales de ERP («expect(s).toMatch(/debe las horas/);» → «expect(s).toMatch(/Horas por reponer/);»).
    expect(s).toMatch(/Horas por reponer/);
    expect(s).toMatch(/guardar\(\{ \.\.\.f, tipo: libre \? "feriado" : "dia_libre" \}\)/);
    expect((s.match(/fetch\("\/api\/asistencia\/feriados", \{/g) ?? []).length).toBe(1);
  });

  it("puros: tipo raro → feriado; la detección de la columna exige nombrarla", () => {
    expect(tipoFeriado("dia_libre")).toBe("dia_libre");
    for (const v of [undefined, null, "", "DIA_LIBRE", "otro"]) expect(tipoFeriado(v)).toBe("feriado");
    expect(esColumnaTipoFaltante({ code: "42703", message: "column asistencia_feriados.tipo does not exist" })).toBe(true);
    expect(esColumnaTipoFaltante({ code: "42703", message: "column asistencia_marcaciones.tipo does not exist" })).toBe(false);
    expect(esColumnaTipoFaltante({ code: "500", message: "timeout" })).toBe(false);
    const { feriados, diasLibres } = separarFeriados([
      { fecha: YK, nombre: "Yom Kipur", tipo: "dia_libre" }, { fecha: "2026-11-03", nombre: "Separación" },
    ]);
    expect([...diasLibres]).toEqual([[YK, "Yom Kipur"]]);
    expect([...feriados]).toEqual([["2026-11-03", "Separación"]]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("b. 🔴 EL MOTOR: un día libre NO es feriado", () => {
  const H = (cod: string): HorarioPersona => ({ empleado_codigo: cod, entrada: "08:00", salida: "17:00", almuerzo_minutos: 30 });
  const m = (cod: string, hhmm: string): Marcacion => ({
    empleado_codigo: cod, empleado_nombre: null, ocurrio_en: `${YK}T${hhmm}:00-05:00`, dispositivo: "reloj",
  });
  const trabajo = [m("1", "08:00"), m("1", "12:00"), m("1", "12:30"), m("1", "17:00")];
  // «2» trabaja otro día para que exista en el reporte; el 21 no marca.
  const otro = (cod: string): Marcacion => ({ empleado_codigo: cod, empleado_nombre: null, ocurrio_en: "2026-09-22T08:00:00-05:00", dispositivo: "reloj" });
  const correr = (mapa: { feriados?: Map<string, string>; diasLibres?: Map<string, string> }) => armarReporte({
    marcaciones: [...trabajo, otro("2"), otro("301")], horarios: [H("1"), H("2"), H("301")], justificaciones: [],
    feriados: mapa.feriados ?? new Map(), diasLibres: mapa.diasLibres,
    desde: YK, hasta: "2026-09-22", reglas: REGLAS_DEFAULT, incluirNoHabiles: true, diaEnCurso: HOY,
    diasLaborables: new Map([["301", diasLaborablesDeEmpresa(MF)]]),
  });
  const dia = (r: ReturnType<typeof correr>, cod: string) => r.find((p) => p.codigo === cod)!.dias.find((d) => d.fecha === YK)!;
  const libre = new Map([[YK, "Yom Kipur"]]);

  it("quien TRABAJÓ el día libre cobra normal: sin recargo de feriado (regla 8)", () => {
    const d = dia(correr({ diasLibres: libre }), "1");
    expect(d.feriado).toBeNull();
    expect(clasificarDia(d, REGLAS_DEFAULT).feriadoMin).toBe(0);
    // CONTROL: el mismo día como FERIADO va entero al recargo.
    const f = dia(correr({ feriados: libre }), "1");
    expect(clasificarDia(f, REGLAS_DEFAULT).feriadoMin).toBeGreaterThan(0);
  });

  it("quien NO trabajó: no es ausencia y no se descuenta — también Multifashion", () => {
    for (const cod of ["2", "301"]) {
      const d = dia(correr({ diasLibres: libre }), cod);
      expect(d.ausente, cod).toBe(false);
      expect(clasificarDia(d, REGLAS_DEFAULT).ausenciaMin, cod).toBe(0);
      // CONTROL: sin el día libre, ese lunes es una ausencia.
      expect(dia(correr({}), cod).ausente, cod).toBe(true);
    }
  });

  it("barrido: Reporte y Planilla leen feriados por `leerFeriados` y le pasan `diasLibres` al motor", () => {
    for (const r of ["src/app/api/asistencia/reporte/route.ts", "src/app/api/asistencia/planilla/route.ts"]) {
      const s = puro(r);
      expect(s, r).toMatch(/leerFeriados\(/);
      expect(s, r).toMatch(/diasLibres: fRes\.diasLibres/);
      expect(s, r).not.toMatch(/from\("asistencia_feriados"\)/);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("c. 🔴 LA DEUDA SOLA: idempotente, sin Multifashion y sin quien trabajó", () => {
  const asegurar = async (o: { soloPlan?: boolean; empresa?: string } = {}) => {
    const { asegurarDeudasDeDiasLibres } = await import("@/lib/asistencia/dia-libre-empresa-server");
    return asegurarDeudasDeDiasLibres({ desde: "2026-09-16", hasta: HOY, hoy: HOY, ...o });
  };

  it("solo días que YA pasaron; Multifashion y quien marcó ese día quedan afuera", async () => {
    marco.add(`43|${YK}`);
    const r = await asegurar();
    expect(r.fechas).toEqual([YK]);
    expect(r.creadas).toBe(2);
    expect(db.insertados.map((d) => d.empleado_codigo).sort()).toEqual(["42", "60"]);
    for (const d of db.insertados) {
      expect(d.fecha).toBe(YK);
      expect(d.nota).toBe("Yom Kipur");
      expect(d.creado_por).toBe("sistema · Feriados");
      expect(Number(d.monto)).toBeGreaterThan(0);
    }
  });

  it("🔴 lo ya cargado (a mano, el 21-sep) no se repite: 0 nuevas, y el plan no escribe", async () => {
    db.deudasExistentes = [{ empleado_codigo: "42", fecha: YK }, { empleado_codigo: "43", fecha: YK }, { empleado_codigo: "60", fecha: YK }];
    const plan = await asegurar({ soloPlan: true });
    expect(plan).toMatchObject({ creadas: 0, repetidas: 3 });
    const r = await asegurar();
    expect(r.creadas).toBe(0);
    expect(db.insertados).toEqual([]);
    // Con una que falta, el plan la cuenta pero no la escribe.
    db.deudasExistentes = [{ empleado_codigo: "42", fecha: YK }];
    expect((await asegurar({ soloPlan: true })).creadas).toBe(2);
    expect(db.insertados).toEqual([]);
  });

  it("Multifashion pedida sola: ni una deuda", async () => {
    const r = await asegurar({ empresa: MF });
    expect(r.creadas).toBe(0);
    expect(db.insertados).toEqual([]);
  });

  it("🔴 regla 8 en la carga a MANO también: quien marcó no recibe deuda ni justificación", async () => {
    marco.add(`43|${YK}`);
    const { planearCargaDiaLibre } = await import("@/lib/asistencia/dia-libre-empresa-server");
    const plan = await planearCargaDiaLibre({ empresa: "confecciones_boston", desde: YK, hasta: YK });
    expect(plan.codigos).toEqual(["42"]);
    expect(plan.deudas.map((d) => d.codigo)).toEqual(["42"]);
  });

  it("🔴 si la lectura de feriados falla, la deuda NO se calcula a ciegas: falla y no se escribe nada", async () => {
    // Antes un error que nombrara `tipo` se leía como «no hay días libres» y
    // la planilla seguía sin las deudas. Ahora falla con su error.
    db.sinColumnaTipo = true;
    await expect(asegurar()).rejects.toThrow(/tipo/);
    expect(db.insertados).toEqual([]);
  });

  it("barrido: la planilla asegura las deudas ANTES de leer los saldos; Feriados solo con fecha pasada", () => {
    const s = puro("src/app/api/asistencia/planilla/route.ts");
    const i = s.indexOf("await asegurarDeudasDeDiasLibres(");
    expect(i).toBeGreaterThan(0);
    expect(i).toBeLessThan(s.indexOf("await leerSaldosDiaLibre()"));
    expect(puro("src/app/api/asistencia/feriados/route.ts"))
      .toMatch(/tipo === "dia_libre" && fecha < hoyPanama\(\)\s*\?\s*await asegurarDeudasDeDiasLibres/);
  });
});

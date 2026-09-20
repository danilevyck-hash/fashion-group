/* ─────────────────────────────────────────────────────────────────────────────
 * TODO DE LUNES A SÁBADO EN MULTIFASHION, Y SIN DEUDA DE DÍA LIBRE (18-sep-2026)
 * — el candado.
 *
 * Daniel, textual:
 *  · *«obvio todo de lunes a sábado con multifashion»*
 *  · *«multifashion no se comporta igual, ese día se les regala, igual no van
 *    a marcar»* · *«te dije que no hay deuda del día libre a multifashion»*
 *
 * ── LO QUE SE EXIGE ──────────────────────────────────────────────────────────
 * 1. 🔴 UN SOLO CONTADOR de días hábiles (`diasLaborablesDelRango`), y las
 *    TRES cuentas que preguntaban «lunes a viernes» a secas pasan por él con
 *    los días de cada quien: «faltan N días hábiles» (`periodo.ts`), el
 *    prorrateo de quien entra o sale a mitad de quincena
 *    (`prorrateo-ingreso.ts`) y la deuda del día libre (`dia-libre-empresa.ts`).
 * 2. 🔴 EL SERVIDOR RECHAZA una deuda de día libre de Multifashion —por
 *    empresa, por persona y en la puerta que escribe— con un texto que lo
 *    explica; la pantalla no le ofrece el motivo.
 * 3. 🔴 EL DOMINGO SIGUE CON SU RECARGO: ningún contador lo cuenta y el motor
 *    lo sigue mandando a `domingoMin`.
 * 4. 🔴 LAS OTRAS TRES EMPRESAS NO SE MUEVEN: lunes a viernes da exactamente lo
 *    de siempre en las tres cuentas.
 *
 * Fechas fijas, nunca `new Date()`. Septiembre de 2026: el 5 y el 12 son
 * sábados, el 6 y el 13 domingos, el 7 y el 14 lunes. Julio de 2026: el 27 es
 * lunes (Yeritza, el caso de control de la contadora).
 * ─────────────────────────────────────────────────────────────────────────── */
import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";

import { EMPRESAS_ASISTENCIA, REGLAS_DEFAULT } from "@/lib/asistencia/config";
import {
  DIAS_ELEGIBLES,
  DIAS_LABORABLES_DEFAULT,
  diasLaborablesDeEmpresa,
  diasLaborablesDeEmpresas,
  diasLaborablesDelRango,
  esDiaLaborable,
} from "@/lib/asistencia/horario-configurable";
import { avisoPeriodoAbierto, diasHabilesPendientes } from "@/lib/asistencia/periodo";
import { DIAS_PAGADOS_POR_MES, diasHabilesEntre, prorrateoPorVigencia } from "@/lib/asistencia/prorrateo-ingreso";
import { diasHabilesDelRango, porQueNoLlevaDeuda } from "@/lib/asistencia/dia-libre-empresa";
import {
  EMPRESAS_SIN_DIA_LIBRE,
  MOTIVO_DIA_LIBRE_EMPRESA,
  MOTIVOS_JUSTIFICACION,
  motivosParaElegir,
  ofreceDiaLibreDeLaEmpresa,
  TEXTO_DIA_LIBRE_NO_APLICA,
} from "@/lib/asistencia/motivos";
import { armarReporte, esHabil, type HorarioPersona, type Marcacion } from "@/lib/asistencia/reporte";
import { clasificarDia } from "@/lib/asistencia/planilla";
import type { Vigencia } from "@/lib/asistencia/vigencia";

const RAIZ = path.resolve(__dirname, "../../..");
const leer = (p: string) => fs.readFileSync(path.join(RAIZ, p), "utf8");
const puro = (p: string) =>
  leer(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const MF = "american_classic";
const OTRAS = EMPRESAS_ASISTENCIA.filter((e) => e !== MF);
const L_A_S = diasLaborablesDeEmpresa(MF);
const SAB_5 = "2026-09-05", DOM_6 = "2026-09-06", LUN_7 = "2026-09-07", SAB_12 = "2026-09-12", DOM_13 = "2026-09-13";

const vig = (ingreso: string | null, salida: string | null = null): Vigencia =>
  ({ fechaIngreso: ingreso, fechaSalida: salida, motivoSalida: salida ? "renuncia" : null }) as Vigencia;

// ─────────────────────────────────────────────────────────────────────────────
describe("1. 🔴 UN SOLO CONTADOR: `diasLaborablesDelRango`, con los días de cada quien", () => {
  it("Multifashion es lunes a sábado; las otras tres, lunes a viernes", () => {
    expect([...L_A_S]).toEqual([1, 2, 3, 4, 5, 6]);
    for (const e of OTRAS) expect(diasLaborablesDeEmpresa(e), e).toBe(DIAS_LABORABLES_DEFAULT);
  });

  it("con los días de Multifashion el sábado 12 cuenta; sin lista, no; el domingo nunca", () => {
    expect(diasLaborablesDelRango("2026-09-11", "2026-09-14", L_A_S))
      .toEqual(["2026-09-11", SAB_12, "2026-09-14"]);
    expect(diasLaborablesDelRango("2026-09-11", "2026-09-14"))
      .toEqual(["2026-09-11", "2026-09-14"]);
    expect(diasLaborablesDelRango(DOM_6, DOM_6, L_A_S)).toEqual([]);
    expect(diasLaborablesDelRango(DOM_6, DOM_6, [0, 1, 2, 3, 4, 5, 6])).toEqual([]);
  });

  it("un rango al revés, una fecha que no es fecha o un tope de cero no dan días", () => {
    expect(diasLaborablesDelRango("2026-09-10", "2026-09-01", L_A_S)).toEqual([]);
    expect(diasLaborablesDelRango("no-es", "2026-09-01", L_A_S)).toEqual([]);
    expect(diasLaborablesDelRango("2026-09-01", "2026-09-30", L_A_S, 0)).toEqual([]);
    expect(diasLaborablesDelRango("2026-09-01", "2026-09-30", L_A_S, 3)).toHaveLength(3);
  });

  it("la unión de empresas: las cuatro juntas son lunes a sábado; solo las otras tres, lunes a viernes", () => {
    expect([...diasLaborablesDeEmpresas(EMPRESAS_ASISTENCIA)]).toEqual([1, 2, 3, 4, 5, 6]);
    expect([...diasLaborablesDeEmpresas(OTRAS)]).toEqual([1, 2, 3, 4, 5]);
    expect([...diasLaborablesDeEmpresas([MF])]).toEqual([1, 2, 3, 4, 5, 6]);
    expect(diasLaborablesDeEmpresas([])).toBe(DIAS_LABORABLES_DEFAULT);
  });

  it("🔴 «faltan N días hábiles»: quincena 16–30 sep, hoy viernes 18 → 9 de lunes a viernes, 11 con el sábado", () => {
    expect(diasHabilesPendientes("2026-09-16", "2026-09-30", "2026-09-18")).toBe(9);
    expect(diasHabilesPendientes("2026-09-16", "2026-09-30", "2026-09-18", L_A_S)).toBe(11);
    const aviso = avisoPeriodoAbierto("2026-09-16", "2026-09-30", "2026-09-18", true, L_A_S)!;
    expect(aviso.diasHabiles).toBe(11);
    expect(aviso.texto).toContain("faltan 11 días hábiles");
    // Cerrado el período, nada que aclarar — con o sin lista.
    expect(avisoPeriodoAbierto("2026-09-01", "2026-09-15", "2026-09-18", true, L_A_S)).toBeNull();
  });

  it("🔴 el prorrateo: quien entra en Multifashion el lunes 7 cobra 8 días (con el sábado 12), no 7", () => {
    const con = prorrateoPorVigencia(vig(LUN_7), "2026-09-01", "2026-09-15", L_A_S)!;
    const sin = prorrateoPorVigencia(vig(LUN_7), "2026-09-01", "2026-09-15")!;
    expect(con.habilesTrabajados).toBe(8);
    expect(sin.habilesTrabajados).toBe(7);
    expect(con.factor).toBeCloseTo(8 * 2 / DIAS_PAGADOS_POR_MES, 10);
    expect(con.habilesPeriodo).toBe(13);
    expect(sin.habilesPeriodo).toBe(11);
    expect(con.texto).toContain("8 días hábiles");
    expect(diasHabilesEntre(LUN_7, "2026-09-15", L_A_S)).toBe(8);
    expect(diasHabilesEntre(LUN_7, "2026-09-15")).toBe(7);
  });

  it("🔴 la deuda del día libre: un sábado regalado a quien trabaja el sábado se debe; a quien no, no", () => {
    expect(diasHabilesDelRango("2026-09-11", "2026-09-14", L_A_S)).toEqual(["2026-09-11", SAB_12, "2026-09-14"]);
    expect(diasHabilesDelRango("2026-09-11", "2026-09-14")).toEqual(["2026-09-11", "2026-09-14"]);
    expect(diasHabilesDelRango(DOM_13, DOM_13, L_A_S)).toEqual([]);
    // El tope de tipeo sigue: más de 32 días no se recorren.
    expect(diasHabilesDelRango("2026-09-01", "2026-12-31", L_A_S).length).toBeLessThanOrEqual(32);
  });

  it("barrido: `periodo.ts`, `prorrateo-ingreso.ts` y `dia-libre-empresa.ts` ya no importan `esHabil`, y nadie más escribe «1..5» a mano", () => {
    for (const f of ["src/lib/asistencia/periodo.ts", "src/lib/asistencia/prorrateo-ingreso.ts", "src/lib/asistencia/dia-libre-empresa.ts"]) {
      const src = puro(f);
      expect(src, f).not.toMatch(/\besHabil\b/);
      expect(src, f).toMatch(/diasLaborablesDelRango/);
    }
    // El único «lunes a viernes» escrito a mano es `esHabil`, el respaldo del
    // motor para un día viejo sin `habil`.
    const lib = fs.readdirSync(path.join(RAIZ, "src/lib/asistencia")).filter((f) => f.endsWith(".ts"));
    for (const f of lib) {
      const src = puro(`src/lib/asistencia/${f}`);
      const veces = (src.match(/dow >= 1 && dow <= 5/g) ?? []).length;
      expect(veces, f).toBe(f === "reporte.ts" ? 1 : 0);
    }
    for (const f of fs.readdirSync(path.join(RAIZ, "src/app/api/asistencia"), { recursive: true }) as string[]) {
      if (!f.endsWith("route.ts")) continue;
      expect(puro(`src/app/api/asistencia/${f}`), f).not.toMatch(/getUTCDay\(\)\s*(>=|<=|===)\s*[1-5]\b/);
    }
  });

  it("barrido: la ruta de planilla pasa los días de cada quien al prorrateo y los de la empresa al aviso", () => {
    const r = puro("src/app/api/asistencia/planilla/route.ts");
    expect(r).toMatch(/prorrateoPorVigencia\(v, q\.desde, q\.hasta, diasLaborables\.get\(codigo\)\)/);
    expect(r).toMatch(/diasLaborablesDeEmpresas\(empresa \? \[empresa\] : EMPRESAS_ASISTENCIA\)/);
    expect((r.match(/avisoPeriodoAbierto\(q\.desde, finMedicion, hoy, q\.esQuincena, diasDelAviso\)/g) ?? []).length).toBe(2);
    // Y el instrumento de medición hace lo mismo que la ruta.
    expect(puro("scripts/_medir-vs-yulissa.ts")).toMatch(/prorrateoPorVigencia\(v, q\.desde, q\.hasta, diasLaborables\?\.get\(codigo\)\)/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("2. 🔴 MULTIFASHION NUNCA LLEVA DEUDA DE DÍA LIBRE — la regla pura y la pantalla", () => {
  it("la lista es Multifashion y nada más; sin empresa se ofrece (el servidor decide con la ficha)", () => {
    expect([...EMPRESAS_SIN_DIA_LIBRE]).toEqual([MF]);
    expect(ofreceDiaLibreDeLaEmpresa(MF)).toBe(false);
    expect(ofreceDiaLibreDeLaEmpresa(" american_classic ")).toBe(false);
    for (const e of OTRAS) expect(ofreceDiaLibreDeLaEmpresa(e), e).toBe(true);
    expect(ofreceDiaLibreDeLaEmpresa(null)).toBe(true);
    expect(ofreceDiaLibreDeLaEmpresa("")).toBe(true);
    expect(porQueNoLlevaDeuda(MF)).toBe(TEXTO_DIA_LIBRE_NO_APLICA);
    for (const e of OTRAS) expect(porQueNoLlevaDeuda(e), e).toBeNull();
  });

  it("la pantalla: a Multifashion se le ofrecen SEIS motivos, sin el día libre; a las otras, los siete", () => {
    const mf = motivosParaElegir(MF);
    expect(mf).toHaveLength(MOTIVOS_JUSTIFICACION.length - 1);
    expect(mf).not.toContain(MOTIVO_DIA_LIBRE_EMPRESA);
    expect(mf).toEqual(MOTIVOS_JUSTIFICACION.filter((m) => m !== MOTIVO_DIA_LIBRE_EMPRESA));
    for (const e of [...OTRAS, null, undefined]) expect(motivosParaElegir(e), String(e)).toEqual(MOTIVOS_JUSTIFICACION);
  });

  it("el texto explica que se regala, no manda a ninguna pestaña vieja y no tiene voseo", () => {
    expect(TEXTO_DIA_LIBRE_NO_APLICA).toMatch(/se le regala/);
    expect(TEXTO_DIA_LIBRE_NO_APLICA).toMatch(/no queda debiendo/);
    expect(TEXTO_DIA_LIBRE_NO_APLICA).not.toMatch(/en Configuración|Personas/);
    expect(TEXTO_DIA_LIBRE_NO_APLICA).not.toMatch(/\b(cargá|elegí|revisá|tenés|podés|vos)\b/i);
  });

  it("barrido: el formulario filtra por empresa, y las DOS pantallas que lo montan se la pasan", () => {
    const form = puro("src/app/asistencia/JustificarForm.tsx");
    // 🔄 19-sep-2026 — CAMBIÓ DE FORMA, NO DE CONDUCTA. El formulario también
    // justifica a VARIOS (el día de lluvia del 17-ago: 13 justificaciones
    // cargadas una por una), y con varios los motivos son la INTERSECCIÓN de
    // los suyos (`motivosParaVarios`, que se DERIVA de `motivosParaElegir`).
    // Con una sola persona —la ficha y la fila del día— sigue siendo
    // exactamente `motivosParaElegir(empresa)`, y a Multifashion se le siguen
    // ofreciendo SEIS. La lista sigue sin salir de `MOTIVOS_JUSTIFICACION`.
    expect(form).toMatch(/motivosParaElegir\(empresa\)/);
    expect(form).toMatch(/motivosParaVarios\(empresas \?\? \[\]\)/);
    expect(form).not.toMatch(/MOTIVOS_JUSTIFICACION/);
    expect(puro("src/app/asistencia/colaboradores/SeccionJustificaciones.tsx")).toMatch(/<JustificarForm[\s\S]*?empresa=\{empresa\}/);
    expect(puro("src/app/asistencia/colaboradores/PersonaPagina.tsx")).toMatch(/<SeccionJustificaciones codigo=\{codigo\} empresa=\{persona\.empresa\}/);
    expect(puro("src/app/asistencia/JustificarDiaModal.tsx")).toMatch(/<JustificarForm[\s\S]*?empresa=\{dia\.empresa \?\? null\}/);
    expect(puro("src/app/asistencia/ReporteTab.tsx")).toMatch(/onJustificar\(\{ codigo, persona, empresa, fecha: d\.fecha \}\)/);
  });

  it("barrido: el servidor pregunta en el plan Y en la puerta que escribe", () => {
    const s = puro("src/lib/asistencia/dia-libre-empresa-server.ts");
    const plan = s.slice(s.indexOf("export async function planearCargaDiaLibre"));
    const registrar = s.slice(s.indexOf("export async function registrarDeudasDiaLibre"), s.indexOf("export async function quitarDeudaDiaLibre"));
    expect((plan.match(/porQueNoLlevaDeuda\(/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(registrar).toMatch(/porQueNoLlevaDeuda\(d\.empresaKey\)/);
    expect(registrar).toMatch(/throw new Error\(porQueNoLlevaDeuda\(/);
    // Y la deuda se arma con los días de CADA persona, no con una lista global.
    expect(plan).toMatch(/diasHabilesDelRango\(opts\.desde, opts\.hasta, diasLaborables\.get\(cod\)\)/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("3. 🔴 EL SERVIDOR RECHAZA la deuda de Multifashion, y a Boston le cobra solo SUS días", () => {
  const insertados: Array<Record<string, unknown>[]> = [];
  const personas = [
    { empleado_codigo: "301", nombre: "JENIFER MIRANDA", empresa: MF, salario_mensual: 750, jornada_semanal: 48, fecha_ingreso: "2018-09-16", fecha_salida: null },
    { empleado_codigo: "42", nombre: "SAMIR POLO", empresa: "confecciones_boston", salario_mensual: 550, jornada_semanal: 48, fecha_ingreso: "2024-01-08", fecha_salida: null },
    { empleado_codigo: "77", nombre: "CON SÁBADO", empresa: "confecciones_boston", salario_mensual: 550, jornada_semanal: 48, fecha_ingreso: "2024-01-08", fecha_salida: null },
  ];
  vi.doMock("@/lib/requireRole", () => ({
    requireRole: () => ({ role: "admin", userName: "Daniel", userId: "1", sessionToken: "t" }),
  }));
  vi.doMock("@/lib/supabase-server", () => ({
    HAS_SERVICE_ROLE: true,
    supabaseServer: {
      from: () => ({
        insert: (filas: Record<string, unknown>[]) => { insertados.push(Array.isArray(filas) ? filas : [filas]); return Promise.resolve({ error: null }); },
        select: () => ({ eq: () => ({ in: async () => ({ data: [], error: null }) }) }),
      }),
    },
  }));
  /** Cuántas veces se leyeron las fichas: por EMPRESA se rechaza ANTES de leer. */
  let lecturas = 0;
  vi.doMock("@/lib/asistencia/config-server", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/asistencia/config-server")>()),
    leerReglas: async () => ({ reglas: REGLAS_DEFAULT, faltaMigracion: false }),
    leerPersonas: async () => { lecturas += 1; return { filas: personas, faltaMigracion: false }; },
    leerPersonasDelModulo: async () => ({ filas: personas, faltaMigracion: false }),
  }));
  vi.doMock("@/lib/asistencia/horarios-server", () => ({
    leerHorarios: async () => ({
      horarios: [{ empleado_codigo: "77", entrada: "08:00", salida: "17:00", almuerzo_minutos: 30, dias_laborables: [1, 2, 3, 4, 5, 6] }],
      faltaMigracion: false,
    }),
  }));
  beforeEach(() => { insertados.length = 0; lecturas = 0; });
  const rango = { desde: "2026-09-11", hasta: "2026-09-14" }; // vie · SÁB · dom · lun

  it("🔴 por EMPRESA: se rechaza con el texto ANTES de leer las fichas, y no se escribe nada", async () => {
    const { planearCargaDiaLibre, cargarDeudasDiaLibre } = await import("@/lib/asistencia/dia-libre-empresa-server");
    const plan = await planearCargaDiaLibre({ empresa: MF, ...rango });
    expect(plan.error).toBe(TEXTO_DIA_LIBRE_NO_APLICA);
    expect(plan.deudas).toEqual([]);
    const carga = await cargarDeudasDiaLibre({ empresa: MF, ...rango, nota: null, usuario: "Daniel" });
    expect(carga.error).toBe(TEXTO_DIA_LIBRE_NO_APLICA);
    expect(carga.creadas).toBe(0);
    expect(insertados).toEqual([]);
    // 🔴 Ni una lectura: la empresa se conoce por el cuerpo y se rechaza en seco.
    expect(lecturas).toBe(0);
  });

  it("🔴 por PERSONA (la empresa sale de la ficha, no del cuerpo): también se rechaza", async () => {
    const { planearCargaDiaLibre } = await import("@/lib/asistencia/dia-libre-empresa-server");
    const plan = await planearCargaDiaLibre({ codigo: "301", ...rango });
    expect(plan.error).toBe(TEXTO_DIA_LIBRE_NO_APLICA);
    expect(plan.deudas).toEqual([]);
    expect(insertados).toEqual([]);
  });

  it("🔴 la puerta que escribe se corta sola si alguien le manda una deuda de Multifashion", async () => {
    const { registrarDeudasDiaLibre } = await import("@/lib/asistencia/dia-libre-empresa-server");
    await expect(registrarDeudasDiaLibre(
      [{ codigo: "301", empresaKey: MF, fecha: "2026-09-11", monto: 28.88, rataHora: 3.61 }], "Daniel",
    )).rejects.toThrow(TEXTO_DIA_LIBRE_NO_APLICA);
    expect(insertados).toEqual([]);
  });

  it("CONTROL: Boston sigue igual — debe viernes y lunes, no el sábado; y quien tiene el sábado configurado, también el sábado", async () => {
    const { planearCargaDiaLibre } = await import("@/lib/asistencia/dia-libre-empresa-server");
    const plan = await planearCargaDiaLibre({ empresa: "confecciones_boston", ...rango });
    expect(plan.error).toBeNull();
    const de = (cod: string) => plan.deudas.filter((d) => d.codigo === cod).map((d) => d.fecha);
    expect(de("42")).toEqual(["2026-09-11", "2026-09-14"]);
    expect(de("77")).toEqual(["2026-09-11", SAB_12, "2026-09-14"]);
    expect(plan.codigos.sort()).toEqual(["42", "77"]);
    expect(plan.dias).toEqual(["2026-09-11", SAB_12, "2026-09-14"]);
  });

  it("🔴 la ruta de Justificaciones: el motivo «Día libre de la empresa» para alguien de Multifashion contesta 400 con el texto y NO guarda", async () => {
    const { POST } = await import("@/app/api/asistencia/justificaciones/route");
    const res = await POST({ json: async () => ({ codigo: "301", desde: "2026-09-11", hasta: "2026-09-11", motivo: MOTIVO_DIA_LIBRE_EMPRESA }) } as never);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe(TEXTO_DIA_LIBRE_NO_APLICA);
    expect(insertados).toEqual([]);
    // Cualquier otro motivo le entra a Multifashion como siempre.
    const ok = await POST({ json: async () => ({ codigo: "301", desde: "2026-09-11", hasta: "2026-09-11", motivo: "Escolares" }) } as never);
    expect(ok.status).toBe(200);
    expect(insertados).toHaveLength(1);
  });

  it("🔴 la ruta del día libre por empresa: Multifashion contesta 400 con el texto y NO guarda", async () => {
    const { POST } = await import("@/app/api/asistencia/dia-libre/route");
    const res = await POST({ json: async () => ({ empresa: MF, ...rango }) } as never);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe(TEXTO_DIA_LIBRE_NO_APLICA);
    expect(insertados).toEqual([]);
    // Boston entra: la deuda y la justificación.
    const ok = await POST({ json: async () => ({ empresa: "confecciones_boston", ...rango }) } as never);
    expect(ok.status).toBe(200);
    expect(insertados.length).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("4. 🔴 EL DOMINGO SIGUE CON SU RECARGO", () => {
  const HORARIO: HorarioPersona = { empleado_codigo: "301", entrada: "10:00", salida: "18:30", almuerzo_minutos: 60 };
  const marca = (fecha: string, hhmm: string): Marcacion => ({
    empleado_codigo: "301", empleado_nombre: null, ocurrio_en: `${fecha}T${hhmm}:00-05:00`, dispositivo: "reloj acs",
  });
  const dia = (fecha: string) => [marca(fecha, "10:00"), marca(fecha, "13:00"), marca(fecha, "14:00"), marca(fecha, "18:30")];

  it("ningún contador lo cuenta, ni con una lista que lo traiga", () => {
    for (const dias of [L_A_S, [0, 1, 2, 3, 4, 5, 6], DIAS_ELEGIBLES, undefined]) {
      expect(esDiaLaborable(DOM_6, dias)).toBe(false);
      expect(diasLaborablesDelRango(DOM_6, DOM_6, dias)).toEqual([]);
      expect(diasHabilesPendientes(DOM_6, DOM_6, "2026-09-01", dias)).toBe(0);
      expect(diasHabilesEntre(DOM_6, DOM_6, dias)).toBe(0);
      expect(diasHabilesDelRango(DOM_6, DOM_6, dias)).toEqual([]);
    }
  });

  it("el motor: el domingo trabajado de Multifashion va a `domingoMin`, y el sin marca no es ausencia", () => {
    const p = armarReporte({
      marcaciones: [...dia(SAB_5), ...dia(DOM_6), ...dia(LUN_7)], horarios: [HORARIO], justificaciones: [],
      feriados: new Map(), desde: SAB_5, hasta: LUN_7, reglas: REGLAS_DEFAULT, incluirNoHabiles: true,
      diaEnCurso: "2026-09-30", diasLaborables: new Map([["301", L_A_S]]),
    });
    const dom = p[0].dias.find((d) => d.fecha === DOM_6)!;
    expect(dom.habil).toBe(false);
    expect(clasificarDia(dom, REGLAS_DEFAULT).domingoMin).toBeGreaterThan(0);
    expect(clasificarDia(dom, REGLAS_DEFAULT).sabadoMin).toBe(0);
    // El sábado, en cambio, es un día normal para ellos: sin recargo.
    const sab = p[0].dias.find((d) => d.fecha === SAB_5)!;
    expect(sab.habil).toBe(true);
    expect(clasificarDia(sab, REGLAS_DEFAULT).sabadoMin).toBe(0);
    expect(clasificarDia(sab, REGLAS_DEFAULT).domingoMin).toBe(0);
    const sinMarca = armarReporte({
      marcaciones: dia(LUN_7), horarios: [HORARIO], justificaciones: [], feriados: new Map(),
      desde: DOM_6, hasta: LUN_7, reglas: REGLAS_DEFAULT, incluirNoHabiles: true, diaEnCurso: "2026-09-30",
      diasLaborables: new Map([["301", L_A_S]]),
    });
    expect(sinMarca[0].dias.find((d) => d.fecha === DOM_6)!.ausente).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("5. 🔴 LAS OTRAS TRES EMPRESAS NO SE MUEVEN", () => {
  it("lunes a viernes es idéntico a lo de siempre en las tres cuentas", () => {
    for (const e of OTRAS) {
      const d = diasLaborablesDeEmpresa(e);
      // Yeritza (51): entró el lunes 27-jul-2026, 5 días → factor 5/13.
      const pr = prorrateoPorVigencia(vig("2026-07-27"), "2026-07-16", "2026-07-31", d)!;
      expect(pr.habilesTrabajados, e).toBe(5);
      expect(pr.factor, e).toBeCloseTo(5 / 13, 10);
      expect(pr).toEqual(prorrateoPorVigencia(vig("2026-07-27"), "2026-07-16", "2026-07-31"));
      expect(diasHabilesPendientes("2026-09-16", "2026-09-30", "2026-09-18", d), e).toBe(9);
      expect(diasHabilesDelRango("2026-09-11", "2026-09-14", d), e).toEqual(["2026-09-11", "2026-09-14"]);
      for (const f of [SAB_5, DOM_6, LUN_7, SAB_12]) expect(esDiaLaborable(f, d), `${e} ${f}`).toBe(esHabil(f));
    }
  });
});

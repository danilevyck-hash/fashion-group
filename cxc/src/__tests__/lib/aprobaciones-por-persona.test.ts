/* ─────────────────────────────────────────────────────────────────────────────
 * APROBACIONES POR PERSONA — SÍ · NO · PENDIENTE, y «cobra horas extra» (10-sep-2026)
 *
 * Daniel, textual: *«Aprobaciones es una sola lista de decisiones. Cada renglón
 * es una persona en la quincena, con sus horas extra sumadas. Dos botones: Sí y
 * No. Se decide, y el renglón se va»* · *«Cobra horas extra por default a todos
 * sí»* · *«con un tab arriba que diga colaborador / día»*.
 *
 * 🔴 LO QUE SE PRUEBA, CON EL MOTOR REAL (`armarPlanilla`, sin mocks):
 *
 *   a. la DECISIÓN: 'si' paga (= aprobado), 'no' NO paga y NO es pendiente
 *      (ni aviso ámbar, ni freno del cierre), pendiente NO paga y SÍ avisa.
 *   b. «cobra horas extra» en `false`: cero extra/excedente/domingo/feriado,
 *      sin aviso, sin freno, fuera de Aprobaciones; tardanza, ausencia y salida
 *      temprana INTACTAS y la persona sigue en planilla con su neto.
 *      CONTROL: en `true` (o ausente) la línea es IDÉNTICA a la de hoy.
 *   c. las dos vistas salen de la MISMA fuente: por colaborador (suma, orden,
 *      por decidir / decididas) y por día (solo lo pendiente).
 *   d. la migración es aditiva y acotada; el servidor escribe `aprobado`
 *      DERIVADO de `decision`.
 *
 * Fechas fijas (agosto 2026): nunca `new Date()`.
 * ─────────────────────────────────────────────────────────────────────────── */
import { describe, it, expect, vi } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

import { REGLAS_DEFAULT } from "@/lib/asistencia/config";
import {
  armarPlanilla, centavos, type FichaPlanilla, type LineaPlanilla,
} from "@/lib/asistencia/planilla";
import type { PersonaReporte, DiaReporte } from "@/lib/asistencia/reporte";
import {
  armarDiasAprobacion, claveDia, decisionDe, estaAprobado, estaRechazado, extrasNoAprobadas,
  indexarAprobaciones, resumenPendientes, textoDecision, aplicarAprobacionLocal, previoDe,
  revertirAprobacionLocal, primerDiaPendienteDe, type Aprobacion, type DiaAprobacion,
} from "@/lib/asistencia/aprobaciones";
import {
  agruparPorColaborador, agruparPorDia, separarPorDecidir, resumenPorDecidir, resumenDecision,
  textoDiasYHoras, textoPorDecidir, hm, vistaElegida, toquesDePersona, toquesDeDia,
  toquesPendientes, VISTAS, PARAM_VISTA,
} from "@/lib/asistencia/aprobaciones-vistas";
import { frenosParaCerrar } from "@/lib/asistencia/planilla-guardada";
import {
  cobraHorasExtra, validarCobraHorasExtra, COLUMNA_COBRA_HORAS_EXTRA, MIGRACION_COBRA_HORAS_EXTRA,
} from "@/lib/asistencia/cobra-horas-extra";
import { excepcionesDeLaFicha, type PersonaFicha } from "@/lib/asistencia/ficha-persona";

// ── Andamiaje: días con marcas reales ────────────────────────────────────────
function dia(fecha: string, salida: string, extraMin: number, over: Partial<DiaReporte> = {}): DiaReporte {
  return {
    fecha,
    marcas: ["08:00:00", "12:00:00", "12:30:00", `${salida}:00`],
    marcasIds: ["a", "b", "c", "d"],
    entrada: "08:00:00",
    salida: `${salida}:00`,
    tardeMin: 0, excesoAlmuerzoMin: 0, salidaTempranaMin: 0,
    extraMin, trabajadoMin: 480, revisar: false,
    ...over,
  } as unknown as DiaReporte;
}
function persona(codigo: string, dias: DiaReporte[]): PersonaReporte {
  return {
    codigo, nombre: `P${codigo}`, salida: "17:00", almuerzoMin: 30, dias,
    resumen: { diasTrabajados: dias.length, ausenciasSinJustificar: 0 },
  } as unknown as PersonaReporte;
}

const R = REGLAS_DEFAULT;
const COD = "1";
const MARTES = "2026-08-25";
const MIERCOLES = "2026-08-26";
const FICHA: FichaPlanilla = {
  codigo: COD, nombre: "KEVIN LUBO", salarioMensual: 1000, jornadaSemanal: 40, empresa: "fashion_wear",
};
/** Martes 22 min diurnos; miércoles 74 min (60 diurnos + 14 nocturnos) y 12 de tardanza. */
const P = persona(COD, [
  dia(MARTES, "17:22", 22),
  dia(MIERCOLES, "18:14", 74, { tardeMin: 12, entrada: "08:12:00" }),
]);

function planilla(opts: {
  si?: string[]; no?: string[]; ficha?: Partial<FichaPlanilla>; exigir?: boolean;
} = {}): LineaPlanilla[] {
  return armarPlanilla({
    personas: [P],
    fichas: new Map([[COD, { ...FICHA, ...(opts.ficha ?? {}) }]]),
    jornadaDiariaMin: () => 480,
    reglas: R,
    empresa: null,
    exigirAprobacionExtra: opts.exigir ?? true,
    diasExtraAprobados: new Set((opts.si ?? []).map((f) => claveDia(COD, f))),
    diasExtraNo: new Set((opts.no ?? []).map((f) => claveDia(COD, f))),
  });
}
const pagado = (l: LineaPlanilla) =>
  centavos((l.dinero?.extraDiurno ?? 0) + (l.dinero?.extraNocturno ?? 0) + (l.dinero?.domingos ?? 0) + (l.dinero?.feriados ?? 0));

const apr = (fecha: string, decision: "si" | "no" | null, over: Partial<Aprobacion> = {}): Aprobacion => ({
  codigo: COD, fecha, aprobado: decision === "si", decision, minutosVistos: 0, por: decision ? "Julio" : null, cuando: null, ...over,
});
const diasDe = (aprobaciones: Aprobacion[], lineas = planilla()) =>
  armarDiasAprobacion({ lineas, personas: [P], reglas: R, aprobaciones: indexarAprobaciones(aprobaciones) });

// ═════════════════════════════════════════════════════════════════════════════
describe("a. 🔴 la DECISIÓN en el motor: sí paga, no no paga y no es pendiente", () => {
  it("'si' paga — es exactamente `aprobado = true`", () => {
    const [l] = planilla({ si: [MARTES, MIERCOLES] });
    expect(pagado(l)).toBeGreaterThan(0);
    expect(l.extraNoAprobada).toBeNull();
    expect(extrasNoAprobadas([l])).toEqual([]);
  });

  it("pendiente: NO paga, y SÍ sale en el aviso y frena el cierre", () => {
    const lineas = planilla();
    const [l] = lineas;
    expect(pagado(l)).toBe(0);
    expect(l.extraNoAprobada!.minutos).toBeCloseTo(96, 6);
    expect(frenosParaCerrar(lineas).some((f) => f.tipo === "horas-extra")).toBe(true);
  });

  it("🔴 'no': NO paga (igual que pendiente) y NO es pendiente: sin aviso, sin freno", () => {
    const lineas = planilla({ no: [MARTES, MIERCOLES] });
    const [l] = lineas;
    expect(pagado(l)).toBe(0);
    expect(l.extraNoAprobada).toBeNull();
    expect(extrasNoAprobadas(lineas)).toEqual([]);
    expect(frenosParaCerrar(lineas).some((f) => f.tipo === "horas-extra")).toBe(false);
  });

  it("mezcla: martes 'no', miércoles pendiente → el aviso dice SOLO el miércoles (74 min)", () => {
    const [l] = planilla({ no: [MARTES] });
    expect(pagado(l)).toBe(0);
    expect(l.extraNoAprobada!.minutos).toBeCloseTo(74, 6);
  });

  it("CONTROL: martes 'si', miércoles 'no' → se paga el martes y nada queda pendiente", () => {
    const [l] = planilla({ si: [MARTES], no: [MIERCOLES] });
    expect(l.horas.extraDiurnoMin).toBeCloseTo(22, 6);
    expect(l.extraNoAprobada).toBeNull();
  });

  it("`decisionDe` lee `decision` primero y cae a `aprobado`; `textoDecision` dice Sí/No/Pendiente", () => {
    expect(decisionDe({ decision: "no", aprobado: false })).toBe("no");
    expect(decisionDe({ aprobado: true })).toBe("si");
    expect(decisionDe({ aprobado: false })).toBeNull();
    expect(decisionDe(null)).toBeNull();
    expect(estaAprobado(apr(MARTES, "si"))).toBe(true);
    expect(estaRechazado(apr(MARTES, "no"))).toBe(true);
    expect(estaAprobado(apr(MARTES, "no"))).toBe(false);
    expect([textoDecision("si"), textoDecision("no"), textoDecision(null)]).toEqual(["Sí", "No", "Pendiente"]);
  });

  it("`resumenPendientes` y `primerDiaPendienteDe` no cuentan un 'no'", () => {
    const dias = diasDe([apr(MARTES, "no")]);
    expect(resumenPendientes(dias).pendientes).toBe(1);
    expect(primerDiaPendienteDe(dias, COD)).toBe(MIERCOLES);
  });

  it("lo local: aplicar 'no', revertir a lo previo, y el booleano viejo sigue valiendo", () => {
    const dias = diasDe([]);
    const items = [{ codigo: COD, fecha: MARTES, minutos: 22 }];
    const previo = previoDe(dias, items);
    const conNo = aplicarAprobacionLocal(dias, items, "no");
    expect(conNo[0].gente[0].decision).toBe("no");
    expect(conNo[0].gente[0].aprobado).toBe(false);
    expect(revertirAprobacionLocal(conNo, previo)[0].gente[0].decision).toBeNull();
    expect(aplicarAprobacionLocal(dias, items, false)[0].gente[0].decision).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("b. 🔴 «cobra horas extra» en la ficha", () => {
  it("solo un `false` explícito apaga; todo lo demás es SÍ (Daniel: «por default a todos sí»)", () => {
    expect(cobraHorasExtra(undefined)).toBe(true);
    expect(cobraHorasExtra(null)).toBe(true);
    expect(cobraHorasExtra(true)).toBe(true);
    expect(cobraHorasExtra(false)).toBe(false);
    expect(cobraHorasExtra("false")).toBe(false);
    expect(validarCobraHorasExtra({})).toEqual({ ok: true, valor: true });
    expect(validarCobraHorasExtra({ cobraHorasExtra: false })).toEqual({ ok: true, valor: false });
    expect(validarCobraHorasExtra({ cobraHorasExtra: "x" }).ok).toBe(false);
  });

  it("🔴 apagada: cero recargo aunque esté todo aprobado, sin aviso, sin freno — y SIGUE en planilla", () => {
    const lineas = planilla({ si: [MARTES, MIERCOLES], ficha: { cobraHorasExtra: false } });
    const [l] = lineas;
    expect(pagado(l)).toBe(0);
    expect(l.horas.extraDiurnoMin + l.horas.extraNocturnoMin + l.horas.excedenteMin + l.horas.domingoMin + l.horas.feriadoMin).toBe(0);
    expect(l.extraMedido).toBeNull();
    expect(l.extraNoAprobada).toBeNull();
    expect(extrasNoAprobadas(lineas)).toEqual([]);
    expect(frenosParaCerrar(lineas).some((f) => f.tipo === "horas-extra")).toBe(false);
    expect(l.cobraHorasExtra).toBe(false);
    // Sigue en planilla, con su quincenal y su neto: no es servicio profesional.
    expect(l.fueraDePlanilla).toBe(false);
    expect(l.dinero).not.toBeNull();
    expect(l.dinero!.salarioQuincenal).toBe(500);
  });

  it("🔴 apagada y con extras PENDIENTES: tampoco avisa ni frena (no hay nada que decidir)", () => {
    const lineas = planilla({ ficha: { cobraHorasExtra: false } });
    expect(extrasNoAprobadas(lineas)).toEqual([]);
    expect(frenosParaCerrar(lineas).some((f) => f.tipo === "horas-extra")).toBe(false);
  });

  it("🔴 la tardanza y la ausencia se siguen contando igual", () => {
    const [con] = planilla({ ficha: { cobraHorasExtra: true } });
    const [sin] = planilla({ ficha: { cobraHorasExtra: false } });
    expect(sin.horas.tardanzaMin).toBeCloseTo(con.horas.tardanzaMin, 6);
    expect(sin.horas.tardanzaMin).toBeGreaterThan(0);
    expect(sin.horas.ausenciaMin).toBeCloseTo(con.horas.ausenciaMin, 6);
    expect(sin.horas.salidaTempranaMin).toBeCloseTo(con.horas.salidaTempranaMin, 6);
    expect(sin.dinero!.tardanzas).toBeCloseTo(con.dinero!.tardanzas, 2);
  });

  it("🔴 no se ofrece en Aprobaciones", () => {
    const lineas = planilla({ ficha: { cobraHorasExtra: false } });
    expect(diasDe([], lineas)).toEqual([]);
    // CONTROL: con la casilla prendida sí se ofrece, con sus dos días.
    expect(diasDe([], planilla({ ficha: { cobraHorasExtra: true } }))).toHaveLength(2);
  });

  it("CONTROL: en `true` o ausente, la línea es IDÉNTICA a la de hoy, centavo por centavo", () => {
    const [hoy] = planilla({ si: [MARTES] });
    const [conTrue] = planilla({ si: [MARTES], ficha: { cobraHorasExtra: true } });
    expect(conTrue.dinero).toEqual(hoy.dinero);
    expect(conTrue.horas).toEqual(hoy.horas);
    expect(hoy.cobraHorasExtra).toBe(true);
  });

  it("la ficha lo marca como excepción (ámbar), y solo cuando está apagada", () => {
    const NORMAL: PersonaFicha = {
      codigo: "6", nombre: "KEVIN LUBO", empresa: "fashion_wear", salarioMensual: 1000, jornadaSemanal: 40,
      fechaIngreso: null, noMarcaReloj: false, pagaSeguros: true, baseSeguros: null, servicioProfesional: false,
    };
    expect(excepcionesDeLaFicha(NORMAL)).toEqual([]);
    expect(excepcionesDeLaFicha({ ...NORMAL, cobraHorasExtra: true })).toEqual([]);
    const ex = excepcionesDeLaFicha({ ...NORMAL, cobraHorasExtra: false });
    expect(ex.map((e) => e.clave)).toEqual(["sin-horas-extra"]);
    expect(ex[0].ojo).toBe(true);
    expect(ex[0].texto).toBe("No cobra horas extra");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("c. 🔴 las dos vistas, de la MISMA fuente", () => {
  const G = (codigo: string, etiqueta: string, minutos: number, decision: "si" | "no" | null, tipo: "extra" | "domingo" = "extra") => ({
    codigo, etiqueta, empresa: "vistana", empresaEtiqueta: "Vistana", salida: "18:11", minutos,
    diurnoMin: minutos, nocturnoMin: 0, domFerMin: tipo === "domingo" ? minutos : 0, tipo,
    aprobado: decision === "si", decision, por: decision ? "Julio" : null, cuando: null, minutosVistos: null, cambio: false,
  });
  const DIAS: DiaAprobacion[] = [
    { fecha: "2026-08-24", etiqueta: "lun 24 ago", semana: "2026-08-24", minutos: 178,
      gente: [G("11", "JULIO GARAY", 107, null), G("6", "KEVIN LUBO", 71, "si")] },
    { fecha: "2026-08-23", etiqueta: "dom 23 ago", semana: "2026-08-17", minutos: 55,
      gente: [G("6", "KEVIN LUBO", 55, null, "domingo")] },
    { fecha: "2026-08-25", etiqueta: "mar 25 ago", semana: "2026-08-24", minutos: 40,
      gente: [G("9", "LUIS ARROYO", 40, "no")] },
  ];

  it("por colaborador: un renglón por persona, sus días en orden de calendario, y los pendientes sumados", () => {
    const ps = agruparPorColaborador(DIAS);
    expect(ps.map((p) => p.codigo)).toEqual(["11", "6", "9"]); // más minutos pendientes arriba
    const kevin = ps.find((p) => p.codigo === "6")!;
    expect(kevin.dias.map((d) => d.fecha)).toEqual(["2026-08-23", "2026-08-24"]);
    expect(kevin.dias[0].tipo).toBe("domingo");
    expect(kevin.diasPendientes).toBe(1);
    expect(kevin.minutosPendientes).toBe(55);
    expect(kevin.minutos).toBe(126);
  });

  it("🔴 por decidir arriba, ya decididas abajo: un 'no' es decidido", () => {
    const { porDecidir, decididas } = separarPorDecidir(agruparPorColaborador(DIAS));
    expect(porDecidir.map((p) => p.codigo)).toEqual(["11", "6"]);
    expect(decididas.map((p) => p.codigo)).toEqual(["9"]);
    expect(resumenDecision(decididas[0].dias)).toBe("No");
    expect(resumenDecision(agruparPorColaborador(DIAS)[1].dias)).toBe("Pendiente");
    expect(resumenDecision([{ decision: "si" }, { decision: "no" }])).toBe("Sí y No");
  });

  it("«N por decidir · H:MM h» cuenta RENGLONES", () => {
    expect(resumenPorDecidir(DIAS)).toEqual({ renglones: 2, minutos: 162 });
    expect(textoPorDecidir(2, 162)).toBe("2 por decidir · 2:42 h");
    expect(textoPorDecidir(0, 0)).toBe("Todo decidido");
    expect(textoDiasYHoras(1, 15)).toBe("1 día · 0:15 h");
    expect(textoDiasYHoras(4, 145)).toBe("4 días · 2:25 h");
    expect(hm(0)).toBe("0:00");
  });

  it("por día: solo lo pendiente, en orden, y el día sin nadie pendiente no se dibuja", () => {
    const ds = agruparPorDia(DIAS);
    expect(ds.map((d) => d.fecha)).toEqual(["2026-08-23", "2026-08-24"]);
    expect(ds[1].gente.map((g) => g.codigo)).toEqual(["11"]); // Kevin ya tiene Sí
    expect(ds[1].minutos).toBe(107);
  });

  it("los toques: la persona manda SOLO sus días pendientes; el día, toda su gente; todo, lo pendiente", () => {
    const ps = agruparPorColaborador(DIAS);
    const kevin = ps.find((p) => p.codigo === "6")!;
    expect(toquesDePersona(kevin, true)).toEqual([{ codigo: "6", fecha: "2026-08-23", minutos: 55 }]);
    expect(toquesDePersona(kevin, false)).toHaveLength(2);
    expect(toquesDeDia(agruparPorDia(DIAS)[1])).toEqual([{ codigo: "11", fecha: "2026-08-24", minutos: 107 }]);
    expect(toquesPendientes(DIAS)).toHaveLength(2);
  });

  it("la vista: colaborador por defecto, «dia» a pedido, basura → colaborador; el parámetro es `vista`", () => {
    expect(vistaElegida("")).toBe("colaborador");
    expect(vistaElegida("dia")).toBe("dia");
    expect(vistaElegida("semana")).toBe("colaborador");
    expect(VISTAS.map((v) => v.etiqueta)).toEqual(["Colaborador", "Día"]);
    expect(PARAM_VISTA).toBe("vista");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("d. la migración y el servidor", () => {
  const RAIZ = path.resolve(__dirname, "../../..");
  const sql = readFileSync(path.join(RAIZ, "supabase/migrations", MIGRACION_COBRA_HORAS_EXTRA), "utf8");

  it("existe, es aditiva y acotada: decision con CHECK, cobra_horas_extra DEFAULT true, backfill solo de lo aprobado", () => {
    expect(existsSync(path.join(RAIZ, "supabase/migrations", MIGRACION_COBRA_HORAS_EXTRA))).toBe(true);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS decision text/);
    expect(sql).toMatch(/CHECK \(decision IS NULL OR decision IN \('si', 'no'\)\)/);
    expect(sql).toMatch(new RegExp(`ADD COLUMN IF NOT EXISTS ${COLUMNA_COBRA_HORAS_EXTRA} boolean NOT NULL DEFAULT true`));
    expect(sql).toMatch(/SET decision = 'si'\s+WHERE aprobado = true\s+AND decision IS NULL/);
    expect(sql).not.toMatch(/DROP|DELETE|LIKE/i);
    // `aprobado` se conserva: el motor paga con él.
    expect(sql).not.toMatch(/DROP COLUMN aprobado/);
  });

  it("🔴 `leerAprobaciones`: la decisión manda, `aprobado` se deriva, y una fila vieja sin decisión cae a `aprobado`", async () => {
    const filasDb = [
      { empleado_codigo: "6", fecha: "2026-08-24", aprobado: false, decision: "no", minutos_vistos: 71, marcado_por: "Julio", marcado_en: null },
      { empleado_codigo: "6", fecha: "2026-08-25", aprobado: true, decision: null, minutos_vistos: 20, marcado_por: "Julio", marcado_en: null },
      { empleado_codigo: "6", fecha: "2026-08-26", aprobado: false, decision: null, minutos_vistos: 0, marcado_por: null, marcado_en: null },
    ];
    const lte = vi.fn(async () => ({ data: filasDb, error: null }));
    const cadena = { select: () => cadena, gte: () => cadena, lte };
    vi.resetModules();
    vi.doMock("@/lib/supabase-server", () => ({ supabaseServer: { from: () => cadena } }));
    const { leerAprobaciones } = await import("@/lib/asistencia/aprobaciones-server");
    const r = await leerAprobaciones("2026-08-01", "2026-08-31");
    expect(r.filas.map((f) => [f.decision, f.aprobado])).toEqual([["no", false], ["si", true], [null, false]]);
    vi.doUnmock("@/lib/supabase-server");
  });

  it("🔴 `guardarAprobaciones` escribe `decision` y `aprobado` DERIVADO — el motor no cambia", async () => {
    const upsert = vi.fn(async () => ({ error: null }));
    vi.resetModules();
    vi.doMock("@/lib/supabase-server", () => ({ supabaseServer: { from: () => ({ upsert }) } }));
    const { guardarAprobaciones } = await import("@/lib/asistencia/aprobaciones-server");
    const dias = [{ codigo: "6", fecha: "2026-08-24", minutos: 71 }];
    await guardarAprobaciones({ dias, decision: "no", por: "Julio", cuando: "2026-09-10T20:00:00.000Z" });
    await guardarAprobaciones({ dias, decision: "si", por: "Julio", cuando: "2026-09-10T20:00:00.000Z" });
    await guardarAprobaciones({ dias, decision: null, por: "Julio", cuando: "2026-09-10T20:00:00.000Z" });
    await guardarAprobaciones({ dias, aprobado: true, por: "Julio", cuando: "2026-09-10T20:00:00.000Z" });
    const filas = upsert.mock.calls.map((c) => (c as unknown as [Array<Record<string, unknown>>])[0][0]);
    expect(filas.map((f) => [f.decision, f.aprobado])).toEqual([["no", false], ["si", true], [null, false], ["si", true]]);
    vi.doUnmock("@/lib/supabase-server");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("e. la pantalla, por barrido", () => {
  const RAIZ = path.resolve(__dirname, "../../..");
  const leer = (p: string) => readFileSync(path.join(RAIZ, p), "utf8");

  it("la pestaña no tiene casillas, usa los dos botones y no pasa de 800 líneas", () => {
    const tab = leer("src/app/asistencia/AprobacionesTab.tsx");
    expect(tab).not.toContain('type="checkbox"');
    expect(tab).toContain("PorColaborador");
    expect(tab).toContain("PorDia");
    expect(tab).toContain("YaDecididas");
    expect(tab.split("\n").length).toBeLessThanOrEqual(800);
    for (const f of ["PorColaborador", "PorDia", "BotonesSiNo"]) {
      expect(leer(`src/app/asistencia/aprobaciones/${f}.tsx`)).toContain("BotonesSiNo");
    }
    // «Ya decididas» reusa los MISMOS días desplegados (con sus botones) de la vista.
    expect(leer("src/app/asistencia/aprobaciones/YaDecididas.tsx")).toContain("DiasDePersona");
  });

  it("⛔ no existe «No a todo» en ninguna pieza de la pestaña", () => {
    const todo = ["AprobacionesTab.tsx", "aprobaciones/PorColaborador.tsx", "aprobaciones/PorDia.tsx", "aprobaciones/YaDecididas.tsx"]
      .map((f) => leer(`src/app/asistencia/${f}`)).join("\n");
    expect(todo).not.toMatch(/No a todo/i);
    expect(todo).toContain("Sí a todo lo pendiente");
  });

  it("la ficha ofrece la casilla y el PUT la escribe", () => {
    expect(leer("src/app/asistencia/colaboradores/FichaEditar.tsx")).toContain("PREGUNTA_COBRA_HORAS_EXTRA");
    expect(leer("src/app/asistencia/colaboradores/PersonaPagina.tsx")).toContain("cobraHorasExtra: b.cobraHorasExtra");
    const ruta = leer("src/app/api/asistencia/configuracion/route.ts");
    expect(ruta).toContain("validarCobraHorasExtra");
    expect(ruta).toContain("[COLUMNA_COBRA_HORAS_EXTRA]: cobraHorasExtraValor");
    // Y el motor la recibe desde la ruta de la planilla.
    expect(leer("src/app/api/asistencia/planilla/route.ts")).toContain("cobraHorasExtra: cobraHorasExtraDeFila(f)");
    expect(leer("src/app/api/asistencia/planilla/route.ts")).toContain("diasExtraNo");
  });
});

/* ─────────────────────────────────────────────────────────────────────────────
 * EL SÁBADO TRABAJADO SE APRUEBA Y SE PAGA COMO EL DOMINGO (11-nov-2026) — el candado
 *
 * Daniel, textual: *«1. A»* (el sábado de quien no trabaja los sábados va
 * EXACTAMENTE como el domingo) y *«a veces mando a Rodrigo a trabajar los
 * sábados, él debería poder marcar y editar»*.
 *
 * ── LO QUE SE EXIGE ──────────────────────────────────────────────────────────
 * 1. 🔴 El motor manda el sábado no laborable a `domingoMin`: la MISMA columna,
 *    el mismo recargo y la misma aprobación que el domingo. Un sábado y un
 *    domingo idénticos pagan el MISMO número.
 * 2. 🔴 Aprobaciones lo OFRECE, con su chip «sábado». Sin aprobar: $0 y aviso;
 *    aprobado: minutos × 1.50 × rata.
 * 3. 🔴 El Reporte muestra el día no laborable CON marcas (para arreglarlas),
 *    sin tardanza ni hora extra; el que no tiene nada sigue escondido.
 * 4. 🔴 Multifashion (lunes a sábado) no se mueve: su sábado es un día normal.
 * 5. 🔴 Con el interruptor en `false`, exactamente lo de antes.
 * 6. 🔴 La columna se rotula desde UN lugar y el dinero no cambia de campo.
 *
 * Fechas fijas: noviembre de 2026 — el 13 es viernes, el 14 sábado, el 15
 * domingo, el 16 lunes.
 * ─────────────────────────────────────────────────────────────────────────── */
import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { REGLAS_DEFAULT } from "@/lib/asistencia/config";
import {
  HORAS_CERO, armarLinea, centavos, clasificarDia, medirHoras, type FichaPlanilla,
} from "@/lib/asistencia/planilla";
import { armarReporte, type DiaReporte, type HorarioPersona, type Marcacion, type PersonaReporte } from "@/lib/asistencia/reporte";
import { armarDiasAprobacion, diasConExtra } from "@/lib/asistencia/aprobaciones";
import { diasLaborablesDeEmpresa } from "@/lib/asistencia/horario-configurable";
import { ROTULO_DEL_RELOJ } from "@/lib/asistencia/corte-quincena";
import { COLUMNAS_DINERO_PLANILLA, ROTULOS_DINERO_PLANILLA } from "@/lib/asistencia/columnas-dinero-planilla";
import { COLUMNAS_DINERO, COLUMNAS_HORAS } from "@/lib/asistencia/planilla-guardada";
import {
  ROTULO_DOMINGOS, ROTULO_DOMINGOS_CORTO, SABADO_TRABAJADO_COMO_DOMINGO,
  esDescansoTrabajado, noLaborableVaComoDomingo, tipoDeDiaNoLaborable, textoTipoDia,
} from "@/lib/asistencia/sabado-trabajado";

const RAIZ = join(__dirname, "..", "..", "..");
const leer = (rel: string) => readFileSync(join(RAIZ, rel), "utf8");
const puro = (rel: string) =>
  leer(rel).replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const R = REGLAS_DEFAULT;
const VIE_13 = "2026-11-13", SAB_14 = "2026-11-14", DOM_15 = "2026-11-15", LUN_16 = "2026-11-16";

/** Un día del reporte como lo entrega el motor para alguien de lunes a viernes. */
function dia(over: Partial<DiaReporte> & { fecha: string }): DiaReporte {
  return {
    marcas: ["10:00:00", "13:00:00", "14:00:00", "16:00:00"], marcasIds: [null, null, null, null],
    entrada: "10:00:00", salida: "16:00:00", tardeMin: 0, excesoAlmuerzoMin: 0, salidaTempranaMin: 0,
    extraMin: 0, trabajadoMin: 300, revisar: false, enCurso: false, ausente: false,
    vacacion: null, justificado: null, permiso: null, permisoPerdonaMin: 0, feriado: null, habil: false,
    ...over,
  } as unknown as DiaReporte;
}
function persona(codigo: string, dias: DiaReporte[]): PersonaReporte {
  return { codigo, nombre: `P${codigo}`, dias, resumen: {} } as unknown as PersonaReporte;
}
/** Rodrigo (13), Vistana, lunes a viernes. */
const RODRIGO: FichaPlanilla = {
  codigo: "13", nombre: "RODRIGO", salarioMensual: 600, jornadaSemanal: 48, empresa: "vistana",
};
const MANUALES = { isr: 0, prestamo: 0, terceros: 0, mercancia: 0, otrosServicios: 0 };
const SABADO = dia({ fecha: SAB_14 });
const DOMINGO = dia({ fecha: DOM_15 });

// Lo que de verdad marca el reloj: cuatro marcas, 10:00 a 16:00 con una hora de almuerzo.
const HORARIO: HorarioPersona = { empleado_codigo: "13", entrada: "08:00", salida: "17:00", almuerzo_minutos: 60 };
const marca = (fecha: string, hhmm: string): Marcacion => ({
  empleado_codigo: "13", empleado_nombre: null, ocurrio_en: `${fecha}T${hhmm}:00-05:00`, dispositivo: "reloj",
});
const cuatro = (fecha: string) => [marca(fecha, "10:00"), marca(fecha, "13:00"), marca(fecha, "14:00"), marca(fecha, "16:00")];
const reporte = (marcaciones: Marcacion[], extra: Partial<Parameters<typeof armarReporte>[0]> = {}) =>
  armarReporte({
    marcaciones, horarios: [HORARIO], justificaciones: [], feriados: new Map(),
    desde: VIE_13, hasta: LUN_16, reglas: R, diaEnCurso: "2026-11-30", ...extra,
  });

// ── 1 ─────────────────────────────────────────────────────────────────────────
describe("1. 🔴 el motor manda el sábado no laborable a la columna del domingo", () => {
  it("el interruptor está prendido", () => {
    expect(SABADO_TRABAJADO_COMO_DOMINGO).toBe(true);
    expect(noLaborableVaComoDomingo(SAB_14)).toBe(true);
    expect(noLaborableVaComoDomingo(DOM_15)).toBe(true);
    expect(noLaborableVaComoDomingo(LUN_16)).toBe(false);
  });

  it("clasificarDia: el sábado a `domingoMin`, nada a `sabadoMin`, y es IDÉNTICO al domingo", () => {
    const sab = clasificarDia(SABADO, R);
    expect(sab.domingoMin).toBe(300);
    expect(sab.sabadoMin).toBe(0);
    expect(sab.extraDiurnoMin + sab.extraNocturnoMin + sab.tardanzaMin).toBe(0);
    expect(sab).toEqual(clasificarDia(DOMINGO, R));
  });
});

// ── 2 ─────────────────────────────────────────────────────────────────────────
describe("2. 🔴 Aprobaciones lo ofrece como «sábado»; sin aprobar $0 con aviso, aprobado × 1.50", () => {
  const p = persona("13", [SABADO]);

  it("diasConExtra lo trae con tipo «sabado»; el domingo sigue siendo «domingo»", () => {
    const d = diasConExtra(p, R);
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ fecha: SAB_14, minutos: 300, domFerMin: 300, tipo: "sabado" });
    expect(diasConExtra(persona("13", [DOMINGO]), R)[0].tipo).toBe("domingo");
    expect(textoTipoDia("sabado")).toBe("sábado");
    expect(tipoDeDiaNoLaborable(SAB_14)).toBe("sabado");
    expect(tipoDeDiaNoLaborable(DOM_15)).toBe("domingo");
  });

  it("la pantalla de Aprobaciones lo lista, pendiente", () => {
    const lineas = [armarLinea(RODRIGO, { ...HORAS_CERO }, MANUALES, R)];
    const cuadro = armarDiasAprobacion({ lineas, personas: [p], reglas: R, aprobaciones: new Map() });
    expect(cuadro).toHaveLength(1);
    expect(cuadro[0].gente[0]).toMatchObject({ codigo: "13", tipo: "sabado", domFerMin: 300, aprobado: false });
  });

  it("SIN aprobar: $0 en la columna, y queda en el aviso valuado al recargo", () => {
    const h = medirHoras(p, R, 480, { exigir: true, claves: new Set(), codigo: "13" });
    expect(h.domingoMin).toBe(0);
    expect(h.sabadoMin).toBe(0);
    expect(h.extraNoAprobadaDomFerMin).toBe(300);
    const l = armarLinea(RODRIGO, h, MANUALES, R, 1, null, { exigirAprobacion: true, aprobada: false });
    expect(l.dinero!.domingos).toBe(0);
    expect(l.extraNoAprobada).toMatchObject({ minutos: 300, domFerMin: 300 });
    expect(l.extraNoAprobada!.monto).toBeGreaterThan(0);
  });

  it("APROBADO: minutos × 1.50 × rata, el MISMO número que un domingo igual", () => {
    const aprobSab = { exigir: true, claves: new Set([`13|${SAB_14}`]), codigo: "13" };
    const h = medirHoras(p, R, 480, aprobSab);
    expect(h.domingoMin).toBe(300);
    expect(h.extraNoAprobadaMin).toBe(0);
    const l = armarLinea(RODRIGO, h, MANUALES, R, 1, null, { exigirAprobacion: true, aprobada: true });
    const esperado = centavos(5 * R.recargoDomingoFeriado * l.dinero!.rataHora);
    expect(l.dinero!.domingos).toBe(esperado);
    expect(l.dinero!.domingos).toBeGreaterThan(0);
    expect(l.extraNoAprobada).toBeNull();

    const hDom = medirHoras(persona("13", [DOMINGO]), R, 480, { ...aprobSab, claves: new Set([`13|${DOM_15}`]) });
    const lDom = armarLinea(RODRIGO, hDom, MANUALES, R, 1, null, { exigirAprobacion: true, aprobada: true });
    expect(lDom.dinero).toEqual(l.dinero);
  });
});

// ── 3 ─────────────────────────────────────────────────────────────────────────
describe("3. 🔴 el Reporte muestra el día no laborable CON marcas, sin horario que cumplir", () => {
  it("el sábado y el domingo con 4 marcas salen como fila: habil=false, trabajado>0, sin tardanza ni extra", () => {
    const [p] = reporte([...cuatro(VIE_13), ...cuatro(SAB_14), ...cuatro(DOM_15), ...cuatro(LUN_16)]);
    expect(p.dias.map((d) => d.fecha)).toEqual([VIE_13, SAB_14, DOM_15, LUN_16]);
    for (const f of [SAB_14, DOM_15]) {
      const d = p.dias.find((x) => x.fecha === f)!;
      expect(d.habil).toBe(false);
      expect(d.marcas).toHaveLength(4);
      expect(d.trabajadoMin).toBe(300);
      expect(d.tardeMin).toBe(0);
      expect(d.extraMin).toBe(0);
      expect(d.salidaTempranaMin).toBe(0);
      expect(d.revisar).toBe(false);
      expect(d.ausente).toBe(false);
    }
    // El viernes, con las mismas marcas, SÍ es un día de horario: 2 h tarde.
    expect(p.dias[0].tardeMin).toBe(120);
    // Y el total de tardanza de la persona no suma los dos días de descanso.
    expect(p.resumen.minutosTarde).toBe(240);
  });

  it("un sábado de 2 marcas sale «a revisar», como cualquier día; el sin nada sigue escondido", () => {
    const [p] = reporte([...cuatro(VIE_13), marca(SAB_14, "10:00"), marca(SAB_14, "14:00"), ...cuatro(LUN_16)]);
    expect(p.dias.map((d) => d.fecha)).toEqual([VIE_13, SAB_14, LUN_16]);
    expect(p.dias[1].revisar).toBe(true);
  });

  it("la planilla sigue pidiendo TODOS los días (`incluirNoHabiles`) y nada cambia ahí", () => {
    const [p] = reporte([...cuatro(VIE_13), ...cuatro(LUN_16)], { incluirNoHabiles: true });
    expect(p.dias.map((d) => d.fecha)).toEqual([VIE_13, SAB_14, DOM_15, LUN_16]);
    expect(p.dias[1].ausente).toBe(false);
  });

  it("esDescansoTrabajado: no laborable y no feriado; un feriado conserva su renglón", () => {
    expect(esDescansoTrabajado(false, null)).toBe(true);
    expect(esDescansoTrabajado(true, null)).toBe(false);
    expect(esDescansoTrabajado(false, "Independencia")).toBe(false);
  });
});

// ── 4 ─────────────────────────────────────────────────────────────────────────
describe("4. 🔴 Multifashion no se mueve: su sábado es un día normal", () => {
  it("con lunes a sábado el 14 es hábil: tardanza como un lunes, nada al recargo", () => {
    const LAS = diasLaborablesDeEmpresa("american_classic");
    const [p] = reporte([...cuatro(SAB_14), ...cuatro(LUN_16)], { diasLaborables: new Map([["13", LAS]]) });
    const sab = p.dias.find((d) => d.fecha === SAB_14)!;
    expect(sab.habil).toBe(true);
    expect(sab.tardeMin).toBe(120);
    const c = clasificarDia(sab, R);
    expect(c.domingoMin).toBe(0);
    expect(c.sabadoMin).toBe(0);
    expect(c.tardanzaMin).toBe(120);
    expect(diasConExtra(p, R).filter((d) => d.fecha === SAB_14)).toEqual([]);
  });
});

// ── 5 ─────────────────────────────────────────────────────────────────────────
describe("5. 🔴 con el interruptor apagado, exactamente lo de antes", () => {
  afterEach(() => { vi.doUnmock("@/lib/asistencia/sabado-trabajado"); vi.resetModules(); });

  it("el sábado vuelve a `sabadoMin` y el Reporte lo esconde", async () => {
    vi.resetModules();
    vi.doMock("@/lib/asistencia/sabado-trabajado", async (orig) => {
      const real = await orig<typeof import("@/lib/asistencia/sabado-trabajado")>();
      return {
        ...real,
        SABADO_TRABAJADO_COMO_DOMINGO: false,
        noLaborableVaComoDomingo: (f: string) => real.tipoDeDiaNoLaborable(f) === "domingo",
        esDescansoTrabajado: () => false,
      };
    });
    const { clasificarDia: clasificar } = await import("@/lib/asistencia/planilla");
    const { armarReporte: armar } = await import("@/lib/asistencia/reporte");
    const { diasConExtra: conExtra } = await import("@/lib/asistencia/aprobaciones");

    const c = clasificar(SABADO, R);
    expect(c.sabadoMin).toBe(300);
    expect(c.domingoMin).toBe(0);
    expect(clasificar(DOMINGO, R).domingoMin).toBe(300);
    expect(conExtra(persona("13", [SABADO]), R)).toEqual([]);

    const [p] = armar({
      marcaciones: [...cuatro(VIE_13), ...cuatro(SAB_14), ...cuatro(LUN_16)], horarios: [HORARIO],
      justificaciones: [], feriados: new Map(), desde: VIE_13, hasta: LUN_16, reglas: R, diaEnCurso: "2026-11-30",
    });
    expect(p.dias.map((d) => d.fecha)).toEqual([VIE_13, LUN_16]);
  });
});

// ── 6 ─────────────────────────────────────────────────────────────────────────
describe("6. 🔴 la columna se rotula desde UN lugar y el dinero no cambia de campo", () => {
  it("«Descanso» en el corte, la tabla, el Excel y el PDF; el campo sigue siendo `domingos`", () => {
    expect(ROTULO_DOMINGOS).toBe("Descanso");
    expect(ROTULO_DEL_RELOJ.domingos).toBe(ROTULO_DOMINGOS);
    expect(COLUMNAS_DINERO_PLANILLA.find((c) => c.campo === "domingos")!.rotulo).toBe(ROTULO_DOMINGOS_CORTO);
    expect(ROTULOS_DINERO_PLANILLA).toContain(ROTULO_DOMINGOS_CORTO);
    // La base no se tocó: la quincena cerrada sigue leyendo las mismas columnas.
    expect(COLUMNAS_DINERO.domingos).toBe("domingos");
    expect(COLUMNAS_HORAS.domingoMin).toBe("domingo_min");
    for (const f of ["src/lib/asistencia/planilla-exportar.ts", "src/lib/asistencia/comprobante.ts", "src/app/asistencia/PlanillaTab.tsx"]) {
      expect(puro(f), f).not.toMatch(/"Domingos"|"Domingo \(h\)"|"DOMINGO"|`Domingos \(/);
    }
  });

  it("candado de fuente: el motor, Aprobaciones y el Reporte pasan por `sabado-trabajado.ts`", () => {
    expect(puro("src/lib/asistencia/planilla.ts")).toContain("noLaborableVaComoDomingo(d.fecha)");
    expect(puro("src/lib/asistencia/aprobaciones.ts")).toContain("tipoDeDiaNoLaborable(d.fecha)");
    expect(puro("src/lib/asistencia/reporte.ts")).toContain("SABADO_TRABAJADO_COMO_DOMINGO && p.dias.has(f)");
    expect(puro("src/lib/asistencia/reporte.ts")).toContain("esDescansoTrabajado(habil, feriado)");
  });
});

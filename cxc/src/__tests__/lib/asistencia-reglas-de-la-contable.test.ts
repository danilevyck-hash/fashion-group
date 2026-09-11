// ─────────────────────────────────────────────────────────────────────────────
// 🔴 LO QUE EL BACKTEST CONTRA LOS EXCEL DE LA CONTABLE DEJÓ DEFINIDO (10-sep-2026)
//
// Daniel, textual: *«a, sí. b, se descuenta obvio. c, se paga días trabajados.
// kener 40h, reloj»* — y corrigiendo el punto a: *«domingo también necesita
// aprobación»*.
//
//   1. El DOMINGO y el FERIADO trabajados se OFRECEN en Aprobaciones (antes no:
//      la lista solo traía la hora extra de lunes a viernes, así que un domingo
//      nunca se podía aprobar y se perdía en silencio — 7 personas el domingo
//      23-ago-2026). Aprobado → se paga con `recargoDomingoFeriado`; no
//      aprobado → no se paga, pero SE VE en el aviso ámbar.
//   2. Salir ANTES de la hora se descuenta desde el MINUTO UNO: minutos × valor
//      del minuto, SIN tolerancia (Daniel: *«si salió 20 minutos antes no
//      debería de haber tolerancia»*; los 10 min de gracia son solo de la
//      entrada). Columna propia.
//   3. Quien entra (o sale) a mitad de la quincena cobra los DÍAS TRABAJADOS:
//      quincenal ÷ hábiles de la quincena × hábiles trabajados. Reemplaza al
//      «Tú decides» del 25-ago. Caso real: Yeritza (51), entró el 27-jul-2026.
//   4. Las horas extra son EXACTAS del reloj: nada se redondea a cuartos.
//   5. Aprobadores por empresa: daniel y Contabilidad en las cuatro, david solo
//      Boston, Bodega en Fashion Wear y Vistana (migración 20261103120000).
//   7. El ISR sigue a mano.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { REGLAS_DEFAULT } from "@/lib/asistencia/config";
import {
  HORAS_CERO, armarLinea, armarPlanilla, clasificarDia, medirHoras, resumenExtra, totalizar,
  type FichaPlanilla,
} from "@/lib/asistencia/planilla";
import { armarReporte, type DiaReporte, type Marcacion, type PersonaReporte } from "@/lib/asistencia/reporte";
import { armarDiasAprobacion, diasConExtra, textoExtraNoAprobada, extrasNoAprobadas } from "@/lib/asistencia/aprobaciones";
import { diasHabilesEntre, prorrateoPorVigencia } from "@/lib/asistencia/prorrateo-ingreso";
import { COLUMNAS_DINERO, COLUMNAS_HORAS } from "@/lib/asistencia/planilla-guardada";
import { CLAVES_RENGLON } from "@/lib/asistencia/comprobante";

const RAIZ = join(__dirname, "..", "..", "..");
const leer = (rel: string) => readFileSync(join(RAIZ, rel), "utf8");
const puro = (rel: string) =>
  leer(rel).replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const R = REGLAS_DEFAULT;

function dia(over: Partial<DiaReporte> & { fecha: string }): DiaReporte {
  return {
    marcas: ["08:00", "12:00", "12:30", "17:00"], marcasIds: [null, null, null, null],
    entrada: "08:00", salida: "17:00", tardeMin: 0, excesoAlmuerzoMin: 0, salidaTempranaMin: 0,
    extraMin: 0, trabajadoMin: 510, revisar: false, enCurso: false, ausente: false,
    vacacion: null, justificado: null, permiso: null, permisoPerdonaMin: 0, feriado: null,
    ...over,
  } as unknown as DiaReporte;
}
function persona(codigo: string, dias: DiaReporte[]): PersonaReporte {
  return { codigo, nombre: `P${codigo}`, dias, resumen: {} } as unknown as PersonaReporte;
}
const FICHA: FichaPlanilla = {
  codigo: "11", nombre: "JULIO GARAY", salarioMensual: 600, jornadaSemanal: 48, empresa: "fashion_wear",
};
const MANUALES = { isr: 0, prestamo: 0, terceros: 0, mercancia: 0, otrosServicios: 0 };

// ── 1 ─────────────────────────────────────────────────────────────────────────
describe("1. 🔴 el domingo 23-ago-2026 trabajado se OFRECE, se DICE y se paga solo si se aprueba", () => {
  // El domingo 23-ago-2026, 8:19 a 11:25 a.m.: 186 minutos trabajados.
  const DOMINGO = dia({ fecha: "2026-08-23", marcas: ["08:19", "11:25"], marcasIds: [null, null], entrada: "08:19", salida: "11:25", trabajadoMin: 186, extraMin: 0 });
  const p = persona("11", [DOMINGO]);

  it("clasificarDia lo manda a `domingoMin`, no a la hora extra", () => {
    const c = clasificarDia(DOMINGO, R);
    expect(c.domingoMin).toBe(186);
    expect(c.extraDiurnoMin + c.extraNocturnoMin).toBe(0);
  });

  it("🔴 Aprobaciones lo OFRECE, con su tipo, en la lista de días", () => {
    const d = diasConExtra(p, R);
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ fecha: "2026-08-23", minutos: 186, domFerMin: 186, tipo: "domingo" });
    const lineas = [armarLinea(FICHA, { ...HORAS_CERO }, MANUALES, R)];
    const cuadro = armarDiasAprobacion({ lineas, personas: [p], reglas: R, aprobaciones: new Map() });
    expect(cuadro).toHaveLength(1);
    expect(cuadro[0].gente[0]).toMatchObject({ codigo: "11", tipo: "domingo", domFerMin: 186, aprobado: false });
  });

  it("🔴 SIN aprobar: no se paga, pero queda en `extraNoAprobada` valuado al recargo de domingo", () => {
    const h = medirHoras(p, R, 480, { exigir: true, claves: new Set(), codigo: "11" });
    expect(h.domingoMin).toBe(0);
    expect(h.extraNoAprobadaDomFerMin).toBe(186);
    expect(h.extraNoAprobadaMin).toBe(186);
    const l = armarLinea(FICHA, h, MANUALES, R, 1, null, { exigirAprobacion: true, aprobada: false });
    expect(l.dinero!.domingos).toBe(0);
    // 186 min = 3,1 h × 1,50 × $2,88 = $13,39
    expect(l.extraNoAprobada).toMatchObject({ minutos: 186, domFerMin: 186 });
    expect(l.extraNoAprobada!.monto).toBeCloseTo(13.39, 2);
    const aviso = textoExtraNoAprobada(extrasNoAprobadas([l]) as never);
    expect(aviso).toContain("1 colaborador tiene horas extra sin aprobar");
  });

  it("🔴 APROBADO: se paga con `recargoDomingoFeriado`, y ya no se avisa", () => {
    const h = medirHoras(p, R, 480, { exigir: true, claves: new Set(["11|2026-08-23"]), codigo: "11" });
    expect(h.domingoMin).toBe(186);
    expect(h.extraNoAprobadaMin).toBe(0);
    const l = armarLinea(FICHA, h, MANUALES, R, 1, null, { exigirAprobacion: true, aprobada: true });
    expect(l.dinero!.domingos).toBeCloseTo(13.39, 2);
    expect(l.extraNoAprobada).toBeNull();
  });

  it("el feriado trabajado recibe el MISMO trato", () => {
    const FERIADO = dia({ fecha: "2026-11-03", feriado: "Separación de Colombia", trabajadoMin: 120 } as never);
    const q = persona("11", [FERIADO]);
    expect(diasConExtra(q, R)[0]).toMatchObject({ tipo: "feriado", domFerMin: 120 });
    const sin = medirHoras(q, R, 480, { exigir: true, claves: new Set(), codigo: "11" });
    expect(sin.feriadoMin).toBe(0);
    expect(sin.extraNoAprobadaDomFerMin).toBe(120);
    const con = medirHoras(q, R, 480, { exigir: true, claves: new Set(["11|2026-11-03"]), codigo: "11" });
    expect(con.feriadoMin).toBe(120);
  });

  it("resumenExtra valúa cada minuto con SU recargo (1,25 · 1,50 · domingo 1,50)", () => {
    const r = resumenExtra(60, 60, 4, R, 60)!;
    expect(r.minutos).toBe(180);
    expect(r.monto).toBeCloseTo(5 + 6 + 6, 2);
  });
});

// ── 2 ─────────────────────────────────────────────────────────────────────────
describe("2. 🔴 salir antes de la hora se descuenta desde el minuto uno, sin tolerancia", () => {
  it("20 minutos antes son 20 descontables (Daniel: «no debería de haber tolerancia»); 1 es 1; 0 es 0", () => {
    expect(clasificarDia(dia({ fecha: "2026-08-21", salidaTempranaMin: 20 }), R).salidaTempranaMin).toBe(20);
    expect(clasificarDia(dia({ fecha: "2026-08-21", salidaTempranaMin: 1 }), R).salidaTempranaMin).toBe(1);
    expect(clasificarDia(dia({ fecha: "2026-08-21", salidaTempranaMin: 0 }), R).salidaTempranaMin).toBe(0);
    // La tolerancia de 10 sigue existiendo, pero es de la ENTRADA.
    expect(R.toleranciaTardanzaMin).toBe(10);
    expect(puro("src/lib/asistencia/planilla.ts")).toMatch(/const salidaTempranaMin = Math\.max\(0, d\.salidaTempranaMin \|\| 0\);/);
  });

  it("María B. el 21-ago-2026: 5,75 h (345 min) × valor del minuto, en columna propia y restando del bruto", () => {
    const p = persona("49", [dia({ fecha: "2026-08-21", salida: "12:04", salidaTempranaMin: 345, trabajadoMin: 214 })]);
    const h = medirHoras(p, R, 480, { exigir: true, claves: new Set(), codigo: "49" });
    expect(h.salidaTempranaMin).toBe(345);
    const l = armarLinea({ ...FICHA, codigo: "49", salarioMensual: 600 }, h, MANUALES, R);
    const d = l.dinero!;
    // rata 600 ÷ 208 = 2,88 → minuto 0,048 → 345 min = $16,56
    expect(d.salidaTemprana).toBeCloseTo(16.56, 2);
    expect(d.totalBruto).toBeCloseTo(300 - 16.56, 2);
    expect(totalizar([l]).salidaTemprana).toBeCloseTo(16.56, 2);
  });

  it("la columna existe en el cierre, el Excel, el PDF, el comprobante y la pantalla", () => {
    expect(COLUMNAS_DINERO.salidaTemprana).toBe("salida_temprana");
    expect(COLUMNAS_HORAS.salidaTempranaMin).toBe("salida_temprana_min");
    expect([...CLAVES_RENGLON]).toContain("salidaTemprana");
    expect(puro("src/lib/asistencia/comprobante.ts")).toMatch(/"SALIDA TEMPRANA"/);
    const ex = puro("src/lib/asistencia/planilla-exportar.ts");
    expect(ex).toMatch(/header: "Salida temprana"/);
    expect(ex).toMatch(/"Salida\\ntemprana"/);
    // ⚠️ CAMBIÓ DE DIRECCIÓN EL 11-SEP-2026, NO SE BORRÓ: el encabezado ya no
    // está escrito a mano en la pantalla. Vive en `columnas-dinero-planilla.ts`
    // —UNA lista para el grupo y para Boston— y la pantalla la lee.
    expect(puro("src/lib/asistencia/columnas-dinero-planilla.ts")).toMatch(/"Salida\\ntemprana"/);
    expect(puro("src/app/asistencia/PlanillaTab.tsx")).toContain("ROTULOS_DINERO_PLANILLA.map(");
    // ⚠️ 11-sep-2026: la celda ganó la nota del ajuste (`conAjuste`): la salida
    // temprana también entra al ajuste del corte (Daniel: «la salida temprana
    // incluirla»). La columna sigue ahí, en rojo.
    expect(puro("src/app/asistencia/PlanillaTab.tsx")).toMatch(/num\(d\.salidaTemprana \?\? 0, "text-red-700", conAjuste\("salidaTemprana"\)\)/);
  });
});

// ── 3 ─────────────────────────────────────────────────────────────────────────
describe("3. 🔴 quien entra a mitad de la quincena cobra los días trabajados", () => {
  it("Yeritza (51): entró el 27-jul-2026 → 5 días hábiles × (600 ÷ 26) = $115,38", () => {
    // 🔴 CAMBIÓ DE DIRECCIÓN esa misma noche (10-sep-2026): la primera versión
    // dividía el quincenal entre los hábiles de la quincena ($125,00). Daniel
    // eligió «a»: el día vale sueldo mensual ÷ 26, la costumbre de Panamá y lo
    // que la contable ya paga. El caso de control es el suyo: 5 × $23,08.
    expect(diasHabilesEntre("2026-07-16", "2026-07-31")).toBe(12);
    expect(diasHabilesEntre("2026-07-27", "2026-07-31")).toBe(5);
    const pr = prorrateoPorVigencia({ fechaIngreso: "2026-07-27", fechaSalida: null, motivoSalida: null } as never, "2026-07-16", "2026-07-31")!;
    expect(pr).toMatchObject({ habilesPeriodo: 12, habilesTrabajados: 5 });
    expect(pr.factor).toBeCloseTo(5 / 13, 6);
    expect(pr.texto).toBe("entró el 27 de julio de 2026: 5 días hábiles (sueldo ÷ 26 por día)");
    const lineas = armarPlanilla({
      personas: [persona("51", [])], fichas: new Map([["51", { ...FICHA, codigo: "51", salarioMensual: 600 }]]),
      jornadaDiariaMin: () => 480, reglas: R, empresa: null, factorBase: 1,
      prorrateo: new Map([["51", { factor: pr.factor, texto: pr.texto }]]),
    });
    const l = lineas.find((x) => x.codigo === "51")!;
    expect(l.decidirAMano).toBeNull();
    expect(l.prorrateo).toBe(pr.texto);
    expect(l.dinero!.salarioQuincenal).toBe(115.38);
    expect(5 * (600 / 26)).toBeCloseTo(115.38, 2);
  });

  it("quien sale a mitad: hasta la fecha de salida; el período entero → null", () => {
    const pr = prorrateoPorVigencia({ fechaIngreso: "2024-01-08", fechaSalida: "2026-08-20", motivoSalida: "renuncia" } as never, "2026-08-16", "2026-08-31")!;
    // 16–31 ago 2026: el 16 es domingo → 11 hábiles (17-21, 24-28, 31); salió el 20 → 4.
    expect(pr).toMatchObject({ habilesPeriodo: 11, habilesTrabajados: 4 });
    expect(prorrateoPorVigencia({ fechaIngreso: "2024-01-08", fechaSalida: null, motivoSalida: null } as never, "2026-08-16", "2026-08-31")).toBeNull();
    expect(prorrateoPorVigencia(null, "2026-08-16", "2026-08-31")).toBeNull();
  });

  it("🔴 la ruta ya no manda a «Tú decides» por entrar o salir: usa el prorrateo", () => {
    const r = puro("src/app/api/asistencia/planilla/route.ts");
    expect(r).toMatch(/prorrateoPorVigencia\(v, q\.desde, q\.hasta\)/);
    expect(r).not.toMatch(/motivoPeriodoParcial\(v, q\.desde, q\.hasta\)/);
    expect(r).toMatch(/prorrateo,\n\s+justificados,/);
    expect(puro("src/lib/asistencia/planilla-guardada.ts")).toMatch(/prorrateo: l\.prorrateo/);
    expect(puro("src/app/asistencia/PlanillaTab.tsx")).toMatch(/\{l\.prorrateo\}/);
  });
});

// ── 4 ─────────────────────────────────────────────────────────────────────────
describe("4. las horas extra son EXACTAS del reloj (Daniel: «reloj»)", () => {
  it("el motor no redondea a cuartos: 17 min de quedada pagan 17, no 15 ni 30", () => {
    const marca = (hhmm: string): Marcacion => ({ empleado_codigo: "6", empleado_nombre: null, ocurrio_en: `2026-08-17T${hhmm}:00-05:00` });
    const [p] = armarReporte({
      marcaciones: [marca("08:00"), marca("12:00"), marca("12:30"), marca("17:17")],
      horarios: [{ empleado_codigo: "6", entrada: "08:00", salida: "17:00", almuerzo_minutos: 30 }] as never,
      justificaciones: [], feriados: new Map(), desde: "2026-08-17", hasta: "2026-08-17",
    });
    expect(p.dias[0].extraMin).toBe(17);
    expect(puro("src/lib/asistencia/reporte.ts")).toMatch(/const extraMin = brutoSeg < extraMinimoSeg \? 0 : brutoSeg \/ 60;/);
  });
});

// ── 5 · 7 ─────────────────────────────────────────────────────────────────────
describe("5 y 7. aprobadores por empresa e ISR a mano", () => {
  it("la migración agrega a daniel en las cuatro y a Contabilidad en Multifashion, y NO borra a nadie", () => {
    const m = leer("supabase/migrations/20261103120000_aprobadores_por_empresa.sql");
    for (const e of ["vistana", "fashion_wear", "confecciones_boston", "american_classic"]) {
      expect(m).toContain(`('daniel',       '${e}')`);
    }
    expect(m).toContain("('Contabilidad', 'american_classic')");
    expect(m).toMatch(/ON CONFLICT \(usuario, empresa\) DO NOTHING/);
    expect(m).not.toMatch(/DELETE FROM/);
  });
  it("el ISR sigue siendo un monto a mano de la planilla", () => {
    expect(puro("src/app/asistencia/PlanillaTab.tsx")).toMatch(/\["isr", "ISR", "−"\]/);
  });
});

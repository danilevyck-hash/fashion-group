// ─────────────────────────────────────────────────────────────────────────────
// 🔴 EL DÍA 31 NO SE PAGA, PERO SÍ SE DESCUENTA (15-sep-2026)
//
// Daniel, textual: *«Que el 31 no se pague nunca»* y, aclarando la regla
// entera: *«el día 31 no se paga, pero si no viene o llega tarde se
// descuenta»*. Sobre las horas extra de un 31 eligió la opción a: *«el día no
// suma sueldo, pero las horas extra son horas trabajadas»*.
//
// La segunda quincena se paga **del 16 al 30**, comprobado en los tres Excel
// reales de la contadora: los de agosto —que tiene 31 días— dicen todos «DEL 16
// AL 30 DE AGOSTO».
//
// ⚠️ LA ASIMETRÍA ES A PROPÓSITO: no suma, pero sí resta. Los casos de abajo la
// prueban EN LAS DOS DIRECCIONES para que nadie la "arregle" el año que viene.
//
// 🩸 Y el CONTROL más importante es el de la trampa: recortar la quincena a
// 16–30 sin recortar también la quincena que `factorBaseDeRango` mira daría
// factor 15/16 = 0,9375 y **le quitaría un 6,25 % a todo el mundo**. Medido
// contra producción el 15-sep-2026 (quincena 16–31 ago, cuatro empresas): el
// neto pasaría de $10.421,28 a $9.641,04, −$780,24. Por eso el caso «el factor
// sigue siendo 1» está acá y no es opcional.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ULTIMO_DIA_QUE_SE_PAGA, finDeLaMedicion, mideUnDiaDeMas, textoDelDia31,
  ultimoDiaDelMes, ultimoDiaQueSePaga,
} from "@/lib/asistencia/dia-31";
import {
  HORAS_CERO, armarLinea, centavos, factorBaseDeRango, medirHoras, periodoDeQuincena, quincena,
  quincenaAnterior, quincenaDesdeClave, type FichaPlanilla,
} from "@/lib/asistencia/planilla";
import { corteSugerido, corteValido, diasSinMedir, textoCorte } from "@/lib/asistencia/corte-quincena";
import { fraseCorte, rotuloQuincena } from "@/lib/asistencia/elegir-quincena";
import { REGLAS_DEFAULT } from "@/lib/asistencia/config";
import { prorrateoPorVigencia } from "@/lib/asistencia/prorrateo-ingreso";
import type { DiaReporte, PersonaReporte } from "@/lib/asistencia/reporte";

const RAIZ = join(__dirname, "..", "..", "..");
const leer = (rel: string) => readFileSync(join(RAIZ, rel), "utf8");

const MESES_DE_31 = [1, 3, 5, 7, 8, 10, 12];
const MESES_DE_30 = [4, 6, 9, 11];

// ── 1. LA QUINCENA QUE SE PROPONE TERMINA EL 30 ──────────────────────────────

describe("1. 🔴 la segunda quincena se paga del 16 al 30, nunca al 31", () => {
  it("agosto de 2026 —el caso de los Excel de la contadora— va del 16 al 30", () => {
    const q = quincena(2026, 8, 2);
    expect(q.desde).toBe("2026-08-16");
    expect(q.hasta).toBe("2026-08-30");
    expect(q.etiqueta).toBe("16 al 30 de agosto de 2026");
    expect(rotuloQuincena(q)).toBe("16 – 30 ago");
  });

  it("🔴 NINGUNA quincena de NINGÚN mes de 31 días termina el 31", () => {
    for (const mes of MESES_DE_31) {
      expect(ultimoDiaDelMes(2026, mes)).toBe(31);
      const q = quincena(2026, mes, 2);
      expect(q.hasta.slice(8, 10)).toBe("30");
      expect(rotuloQuincena(q)).not.toContain("31");
      expect(q.etiqueta).not.toContain("al 31");
    }
  });

  it("⚠️ EL RECORTE ES SOLO DEL 31: los meses de 30 no se tocan", () => {
    for (const mes of MESES_DE_30) {
      const q = quincena(2026, mes, 2);
      expect(q.hasta.slice(8, 10)).toBe("30");
      expect(ultimoDiaQueSePaga(2026, mes)).toBe(30);
    }
  });

  it("⚠️ FEBRERO SIGUE TERMINANDO EL 28, Y EL 29 EN BISIESTO", () => {
    expect(quincena(2026, 2, 2).hasta).toBe("2026-02-28");
    expect(quincena(2026, 2, 2).etiqueta).toBe("16 al 28 de febrero de 2026");
    expect(quincena(2024, 2, 2).hasta).toBe("2024-02-29");
    expect(ultimoDiaQueSePaga(2024, 2)).toBe(29);
    expect(ultimoDiaQueSePaga(2026, 2)).toBe(28);
  });

  it("la primera quincena no cambió: siempre del 1 al 15", () => {
    for (let mes = 1; mes <= 12; mes++) {
      expect(quincena(2026, mes, 1).desde).toBe(`2026-${String(mes).padStart(2, "0")}-01`);
      expect(quincena(2026, mes, 1).hasta).toBe(`2026-${String(mes).padStart(2, "0")}-15`);
    }
  });

  it("la clave, el año, el mes y el número de quincena no se movieron", () => {
    const q = quincena(2026, 8, 2);
    expect(q.clave).toBe("2026-08-2");
    expect(quincenaDesdeClave("2026-08-2")).toEqual(q);
    expect(quincenaAnterior(quincena(2026, 9, 1))).toEqual(q);
  });

  it("el tope es 30, y está escrito una sola vez", () => {
    expect(ULTIMO_DIA_QUE_SE_PAGA).toBe(30);
  });
});

// ── 2. 🩸 EL SUELDO NO SE MUEVE — LA TRAMPA DEL 6,25 % ───────────────────────

describe("2. 🩸 el quincenal sigue siendo salario ÷ 2: el factor es 1, no 0,9375", () => {
  it("🔴 las 24 quincenas de 2026 pagan una quincena ENTERA (factor 1)", () => {
    for (let mes = 1; mes <= 12; mes++) {
      for (const n of [1, 2] as const) {
        const q = quincena(2026, mes, n);
        expect(factorBaseDeRango(q.desde, q.hasta)).toBe(1);
        expect(periodoDeQuincena(q).factorBase).toBe(1);
      }
    }
  });

  it("🩸 CONTROL DE LA TRAMPA: 15/16 = 0,9375 es lo que NO puede pasar", () => {
    // Si `quincena()` no se hubiera recortado, la quincena de agosto seguiría
    // midiendo 16 días y pedir 16–30 daría este factor: un 6,25 % menos para
    // todo el mundo ($10.421,28 → $9.641,04 medido contra producción).
    expect(15 / 16).toBeCloseTo(0.9375, 10);
    expect(factorBaseDeRango("2026-08-16", "2026-08-30")).not.toBeCloseTo(0.9375, 6);
    expect(factorBaseDeRango("2026-08-16", "2026-08-30")).toBe(1);
  });

  it("⚠️ y quien teclee el 31 a mano TAMPOCO cobra de más: el 31 no paga sueldo", () => {
    expect(factorBaseDeRango("2026-08-16", "2026-08-31")).toBe(1);
  });

  it("un rango libre de verdad sigue prorrateando como siempre", () => {
    // 5 días de la 2ª quincena de agosto (16–20) sobre sus 15 días.
    expect(factorBaseDeRango("2026-08-16", "2026-08-20")).toBeCloseTo(5 / 15, 10);
    // 1–15 entera + 16–20: una quincena más un pedazo.
    expect(factorBaseDeRango("2026-08-01", "2026-08-20")).toBeCloseTo(1 + 5 / 15, 10);
  });
});

// ── 3. EL 31 IGUAL SE MIDE ───────────────────────────────────────────────────

describe("3. 🔴 el 31 se MIDE aunque no se pague", () => {
  it("finDeLaMedicion estira un día SOLO en los meses de 31", () => {
    expect(finDeLaMedicion("2026-08-30")).toBe("2026-08-31");
    for (const mes of MESES_DE_31) {
      const q = quincena(2026, mes, 2);
      expect(finDeLaMedicion(q.hasta).slice(8, 10)).toBe("31");
    }
  });

  it("y NO estira nada en los meses de 30, en febrero ni a mitad de mes", () => {
    for (const mes of MESES_DE_30) {
      const q = quincena(2026, mes, 2);
      expect(finDeLaMedicion(q.hasta)).toBe(q.hasta);
    }
    expect(finDeLaMedicion("2026-02-28")).toBe("2026-02-28");
    expect(finDeLaMedicion("2024-02-29")).toBe("2024-02-29");
    expect(finDeLaMedicion("2026-08-15")).toBe("2026-08-15");
    expect(finDeLaMedicion("2026-08-31")).toBe("2026-08-31");
    expect(finDeLaMedicion("")).toBe("");
    expect(finDeLaMedicion("no es fecha")).toBe("no es fecha");
  });

  it("mideUnDiaDeMas contesta en las dos direcciones", () => {
    expect(mideUnDiaDeMas("2026-08-30")).toBe(true);
    expect(mideUnDiaDeMas("2026-09-30")).toBe(false);
    expect(mideUnDiaDeMas("2026-02-28")).toBe(false);
    expect(mideUnDiaDeMas("2026-08-31")).toBe(false);
    expect(mideUnDiaDeMas("2026-13-30")).toBe(false);
  });

  it("🔴 la RUTA lee el reloj hasta ahí, y solo en una quincena", () => {
    const ruta = leer("src/app/api/asistencia/planilla/route.ts");
    expect(ruta).toContain('import { finDeLaMedicion } from "@/lib/asistencia/dia-31"');
    expect(ruta).toContain("const finMedicion = q.esQuincena ? finDeLaMedicion(q.hasta) : q.hasta;");
    expect(ruta).toContain("const hastaReloj = corte ?? finMedicion;");
    // 🩸 El `corte ?? q.hasta` viejo dejaría el 31 sin medir.
    expect(ruta).not.toContain("const hastaReloj = corte ?? q.hasta;");
  });

  it("y el período no se da por terminado mientras el reloj siga corriendo", () => {
    const ruta = leer("src/app/api/asistencia/planilla/route.ts");
    // 🔑 LAS DOS SALIDAS, contadas. La ruta arma `avisos` dos veces —el cuadro
    // completo y el recortado de quien solo aprueba— y con un `toContain`
    // pelado una de las dos podía volver a `q.hasta` sin que nadie lo viera.
    // ⚠️ 18-sep-2026: el aviso ganó un quinto argumento, los días laborables que
    // cuenta (`diasDelAviso`: Multifashion, lunes a sábado). Sigue midiendo
    // hasta `finMedicion` en las DOS salidas.
    const conFin = ruta.split("avisoPeriodoAbierto(q.desde, finMedicion, hoy, q.esQuincena, diasDelAviso)").length - 1;
    expect(conFin).toBe(2);
    expect(ruta).not.toContain("avisoPeriodoAbierto(q.desde, q.hasta,");
  });
});

// ── 4. LA ASIMETRÍA, SOBRE EL MOTOR ──────────────────────────────────────────

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
function persona(dias: DiaReporte[]): PersonaReporte {
  return { codigo: "9", nombre: "P9", dias, resumen: {} } as unknown as PersonaReporte;
}
const FICHA: FichaPlanilla = {
  codigo: "9", nombre: "PRUEBA", salarioMensual: 600, jornadaSemanal: 48, empresa: "vistana",
};
const MANUALES = { isr: 0, prestamo: 0, terceros: 0, mercancia: 0, otrosServicios: 0 };
const Q = quincena(2026, 8, 2);
const FACTOR = factorBaseDeRango(Q.desde, Q.hasta);
const NORMAL = dia({ fecha: "2026-08-17" });
// 🔑 El 31 de agosto de 2026 cae LUNES: es un día hábil de verdad.
const EL_31 = "2026-08-31";

const linea = (dias: DiaReporte[]) =>
  armarLinea(FICHA, medirHoras(persona(dias), R, 480), MANUALES, R, FACTOR);
const FACTOR_JUL = factorBaseDeRango(quincena(2026, 7, 2).desde, quincena(2026, 7, 2).hasta);

describe("4. 🔴 el 31 NO suma sueldo", () => {
  it("el quincenal es salario ÷ 2, con el 31 adentro o afuera", () => {
    const sinEl31 = linea([NORMAL]);
    const conEl31 = linea([NORMAL, dia({ fecha: EL_31 })]);
    expect(sinEl31.dinero!.salarioQuincenal).toBe(300);
    expect(conEl31.dinero!.salarioQuincenal).toBe(300);
    // Un día normal de más no mueve un centavo del bruto ni del neto.
    expect(conEl31.dinero!.totalBruto).toBe(sinEl31.dinero!.totalBruto);
    expect(conEl31.dinero!.netoPagar).toBe(sinEl31.dinero!.netoPagar);
  });
});

describe("5. 🔴 …PERO EL 31 SÍ RESTA (y sí paga sus horas extra)", () => {
  const base = linea([NORMAL]);

  it("una AUSENCIA del 31 se descuenta", () => {
    const l = linea([NORMAL, dia({ fecha: EL_31, ausente: true, marcas: [], marcasIds: [], trabajadoMin: 0 })]);
    expect(l.dinero!.ausencias).toBeGreaterThan(0);
    expect(l.dinero!.netoPagar).toBeLessThan(base.dinero!.netoPagar);
  });

  it("una TARDANZA del 31 se descuenta", () => {
    const l = linea([NORMAL, dia({ fecha: EL_31, tardeMin: 20, entrada: "08:20" })]);
    expect(l.dinero!.tardanzas).toBeGreaterThan(0);
    expect(l.dinero!.netoPagar).toBeLessThan(base.dinero!.netoPagar);
  });

  it("una SALIDA TEMPRANA del 31 se descuenta", () => {
    const l = linea([NORMAL, dia({ fecha: EL_31, salidaTempranaMin: 20, salida: "16:40", trabajadoMin: 490 })]);
    expect(l.dinero!.salidaTemprana).toBeGreaterThan(0);
    expect(l.dinero!.netoPagar).toBeLessThan(base.dinero!.netoPagar);
  });

  it("🔴 y las HORAS EXTRA del 31 SE PAGAN — Daniel: «las horas extra son horas trabajadas»", () => {
    const l = linea([NORMAL, dia({ fecha: EL_31, extraMin: 60, salida: "18:00", trabajadoMin: 570 })]);
    expect(l.dinero!.extraDiurno + l.dinero!.extraNocturno).toBeGreaterThan(0);
    expect(l.dinero!.netoPagar).toBeGreaterThan(base.dinero!.netoPagar);
    // …y el sueldo del día sigue sin sumarse: lo único que subió es la extra.
    expect(l.dinero!.salarioQuincenal).toBe(base.dinero!.salarioQuincenal);
  });

  it("CONTROL: un DOMINGO trabajado el 31 también se paga", () => {
    // 31 de mayo de 2026 es domingo.
    const dom = dia({ fecha: "2026-05-31", marcas: ["08:00", "12:00"], marcasIds: [null, null], entrada: "08:00", salida: "12:00", trabajadoMin: 240, extraMin: 0 });
    const l = linea([NORMAL, dom]);
    expect(l.dinero!.domingos).toBeGreaterThan(0);
  });
});

// ── 5b. QUIEN ENTRA A MITAD DE QUINCENA TAMPOCO COBRA EL 31 ──────────────────

describe("5b. 🔴 el prorrateo de quien entra a mitad tampoco paga el 31", () => {
  // 🩸 ES LA ÚNICA LÍNEA QUE SE MOVIÓ EN TODA LA HISTORIA MEDIDA (15-sep-2026):
  // YERITZA SOLIS (51, Boston), que entró el 27-jul-2026, en la 2ª quincena de
  // julio pasa de $115,38 a $92,31 — un día hábil menos, el viernes 31. Es la
  // regla aplicada a todos por igual: si el 31 no paga sueldo a nadie, tampoco
  // se lo paga a quien recién entra. Y es lo que paga la contadora, cuyo Excel
  // dice «DEL 16 AL 30». En agosto NADIE se mueve (0 líneas, $10.421,28).
  const Q_JUL = quincena(2026, 7, 2);
  const VIG = { fechaIngreso: "2026-07-27", fechaSalida: null, motivoSalida: null } as never;

  it("en la quincena que el sistema PROPONE son 4 días hábiles, no 5", () => {
    const pr = prorrateoPorVigencia(VIG, Q_JUL.desde, Q_JUL.hasta)!;
    expect(pr.habilesTrabajados).toBe(4);
    expect(pr.texto).toBe("entró el 27 de julio de 2026: 4 días hábiles (sueldo ÷ 26 por día)");
    const l = armarLinea(
      { ...FICHA, codigo: "51", salarioMensual: 600 }, { ...HORAS_CERO },
      MANUALES, R, FACTOR_JUL * pr.factor, null, {}, null, pr.texto,
    );
    expect(l.dinero!.salarioQuincenal).toBe(92.31);
    expect(4 * (600 / 26)).toBeCloseTo(92.31, 2);
  });

  it("⚠️ CONTROL: con el 31 adentro serían 5 días y $115,38 — lo que se dejó de pagar", () => {
    const pr = prorrateoPorVigencia(VIG, "2026-07-16", "2026-07-31")!;
    expect(pr.habilesTrabajados).toBe(5);
    const conEl31 = armarLinea(
      { ...FICHA, codigo: "51", salarioMensual: 600 }, { ...HORAS_CERO },
      MANUALES, R, pr.factor, null, {}, null, pr.texto,
    );
    // El quincenal redondeado a centavos, que es la plata que de verdad se paga.
    expect(conEl31.dinero!.salarioQuincenal).toBe(115.38);
    expect(centavos(115.38 - 92.31)).toBe(23.07);
  });
});

// ── 6. EL CRUCE CON EL CORTE DEL RELOJ ───────────────────────────────────────

describe("6. 🔴 el corte y el ajuste alcanzan al 31", () => {
  it("los días sin medir de agosto con corte el 28 son 29, 30 Y 31", () => {
    expect(diasSinMedir("2026-08-16", "2026-08-30", "2026-08-28")).toEqual({
      desde: "2026-08-29", hasta: "2026-08-31",
    });
  });

  it("en un mes de 30 días llegan hasta el 30, como siempre", () => {
    expect(diasSinMedir("2026-09-16", "2026-09-30", "2026-09-28")).toEqual({
      desde: "2026-09-29", hasta: "2026-09-30",
    });
  });

  it("en la primera quincena nada cambió", () => {
    expect(diasSinMedir("2026-08-01", "2026-08-15", "2026-08-13")).toEqual({
      desde: "2026-08-14", hasta: "2026-08-15",
    });
  });

  it("🔑 cortar el 30 de agosto SIGUE siendo un corte: deja el 31 sin medir", () => {
    expect(corteValido("2026-08-16", "2026-08-30", "2026-08-30")).toBe(true);
    expect(diasSinMedir("2026-08-16", "2026-08-30", "2026-08-30")).toEqual({
      desde: "2026-08-31", hasta: "2026-08-31",
    });
  });

  it("CONTROL: cortar el 30 de SEPTIEMBRE no sirve — no queda nada afuera", () => {
    expect(corteValido("2026-09-16", "2026-09-30", "2026-09-30")).toBe(false);
    expect(diasSinMedir("2026-09-16", "2026-09-30", "2026-09-30")).toBeNull();
  });

  it("el corte PROPUESTO no se movió: 13 y 28, y febrero corto sin corte", () => {
    expect(corteSugerido(quincena(2026, 8, 1))).toBe("2026-08-13");
    expect(corteSugerido(quincena(2026, 8, 2))).toBe("2026-08-28");
    expect(corteSugerido(quincena(2026, 9, 2))).toBe("2026-09-28");
    expect(corteSugerido(quincena(2026, 2, 2))).toBeNull();
    expect(corteSugerido(quincena(2024, 2, 2))).toBe("2024-02-28");
  });

  it("y lo que la pantalla DICE nombra el 31, no el 30", () => {
    expect(fraseCorte("2026-08-28", "2026-08-30")).toBe("Del 29 al 31 se paga normal y se ajusta en la siguiente.");
    expect(fraseCorte("2026-08-30", "2026-08-30")).toBe("El 31 se paga normal y se ajusta en la siguiente.");
    expect(fraseCorte("2026-09-28", "2026-09-30")).toBe("Del 29 al 30 se paga normal y se ajusta en la siguiente.");
    expect(textoCorte("2026-08-30", "2026-08-28", 3)).toContain("2026-08-31");
  });
});

// ── 7. LO QUE LA PANTALLA DICE ───────────────────────────────────────────────

describe("7. la pantalla lo dice, y solo donde hace falta", () => {
  it("🔴 en un mes de 31 la Planilla avisa que el 31 no paga sueldo pero sí resta", () => {
    const t = textoDelDia31("2026-08-30");
    expect(t).toBe("El 31 no paga sueldo, pero sus ausencias, tardanzas, salidas tempranas y horas extra sí entran.");
    const tab = leer("src/app/asistencia/PlanillaTab.tsx");
    // La condición ENTERA: con un `toContain("textoDelDia31(hasta)")` pelado,
    // apagar el aviso con un `false &&` pasaba desapercibido. La CONDUCTA está
    // en `asistencia-planilla-cerrar-quincena` (agosto: sale) y en
    // `planilla-elegir-quincena` (septiembre: no sale).
    expect(tab).toContain("{elegido && textoDelDia31(hasta) && (");
  });

  it("⚠️ y NO sale en los meses de 30 ni en febrero — un aviso que sale siempre deja de avisar", () => {
    expect(textoDelDia31("2026-09-30")).toBeNull();
    expect(textoDelDia31("2026-02-28")).toBeNull();
    expect(textoDelDia31("2026-08-15")).toBeNull();
  });
});

// ── 8. LA REGLA VIVE EN UN SOLO MÓDULO ───────────────────────────────────────

describe("8. 🔴 la regla vive en UN módulo puro, leído por la pantalla y por el motor", () => {
  const fuente = leer("src/lib/asistencia/dia-31.ts");

  it("es puro: sin base, sin red y sin `new Date()` del reloj de la máquina", () => {
    // Sin los comentarios: el encabezado del archivo NOMBRA `new Date()` para
    // decir que no lo usa, y eso no es usarlo.
    const codigo = fuente
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(codigo).not.toContain("supabase");
    expect(codigo).not.toContain("fetch(");
    expect(codigo).not.toMatch(/new Date\(\s*\)/);
  });

  it("lleva la cita de Daniel y la tabla de la asimetría", () => {
    expect(fuente).toContain("Que el 31 no se pague nunca");
    expect(fuente).toContain("el día 31 no se paga, pero si no viene o llega tarde se");
    expect(fuente).toContain("ES ASIMÉTRICA A PROPÓSITO");
  });

  it("nadie más define la regla: una sola declaración de cada pieza", () => {
    const archivos = [
      "src/lib/asistencia/dia-31.ts", "src/lib/asistencia/planilla.ts",
      "src/lib/asistencia/corte-quincena.ts", "src/lib/asistencia/elegir-quincena.ts",
      "src/app/api/asistencia/planilla/route.ts", "src/app/asistencia/PlanillaTab.tsx",
    ].map(leer).join("\n");
    for (const pieza of ["finDeLaMedicion", "ultimoDiaQueSePaga", "mideUnDiaDeMas", "textoDelDia31", "ultimoDiaDelMes"]) {
      const veces = archivos.split(`export function ${pieza}(`).length - 1;
      expect({ pieza, veces }).toEqual({ pieza, veces: 1 });
    }
  });

  it("y `planilla.ts` arma la quincena con él, no con su propia cuenta", () => {
    const p = leer("src/lib/asistencia/planilla.ts");
    expect(p).toContain("const fin = n === 1 ? 15 : ultimoDiaQueSePaga(anio, mes);");
    expect(p).toContain('export { ultimoDiaDelMes } from "./dia-31";');
    expect(p).not.toContain("const fin = n === 1 ? 15 : ultimoDiaDelMes(anio, mes);");
  });
});

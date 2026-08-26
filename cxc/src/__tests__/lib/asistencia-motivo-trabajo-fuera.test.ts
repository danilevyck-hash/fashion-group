// ─────────────────────────────────────────────────────────────────────────────
// «TRABAJO FUERA DE LA OFICINA» — el motivo que NO es una ausencia.
//
// 🔴 TODOS LOS CANDADOS EJECUTAN LA CONDUCTA. Ninguno busca texto en un archivo:
// en este repo ya fallaron tres candados por leer sus propios comentarios y
// darse por satisfechos. Acá se corre el motor del reporte, se corre la
// planilla, se arma el Excel de verdad y se leen las celdas.
//
// Lo que estos tests sostienen, y por qué cada uno:
//
//   1. EL PAGO ES EL MISMO QUE CON UNA JUSTIFICACIÓN DE HOY. Es la regla dura:
//      el motivo nuevo no puede mover un centavo respecto de «Vacaciones». Se
//      prueba comparando las DOS planillas campo por campo, no leyendo un `if`.
//
//   2. CERO HORAS EXTRA. Sin marcaciones no hay horas que medir: ni se le
//      inventan 8, ni se le quitan.
//
//   3. EL REPORTE LOS DISTINGUE. Un día de trabajo fuera no se cuenta como
//      ausencia justificada, y el renglón no puede decir la palabra "ausencia".
//      Es el punto entero de haber agregado el motivo.
//
// Fechas FIJAS, nunca `new Date()`.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx-js-style";
import {
  MOTIVOS_JUSTIFICACION, MOTIVOS_RETIRADOS, MOTIVO_TRABAJO_VENDEDOR,
  MOTIVO_TRABAJO_FUERA_ANTES, esTrabajoDeVendedor, textoDiaJustificado, motivoConocido,
} from "@/lib/asistencia/motivos";
import {
  armarReporte, type Marcacion, type HorarioPersona, type Justificacion,
} from "@/lib/asistencia/reporte";
import {
  armarPlanilla, jornadaDiariaMin, FALTA, type FichaPlanilla,
} from "@/lib/asistencia/planilla";
import { REGLAS_DEFAULT } from "@/lib/asistencia/config";
import { construirExcel, construirPdf } from "@/lib/asistencia/exportar";

const R = REGLAS_DEFAULT;

// ── El escenario, y es el de Rodrigo en chico ────────────────────────────────
// Una semana hábil (lun 3 → vie 7 de agosto de 2026). La persona marca los tres
// primeros días completos y no marca jue 6 ni vie 7.
const DESDE = "2026-08-03";
const HASTA = "2026-08-07";
const DIAS_CON_MARCAS = ["2026-08-03", "2026-08-04", "2026-08-05"];
const DIA_SIN_MARCAS = "2026-08-06";

const CODIGO = "13";

/** Panamá es UTC−5 fijo. Una hora local del día, como instante ISO. */
const enPanama = (dia: string, hhmm: string) =>
  new Date(Date.parse(`${dia}T${hhmm}:00-05:00`)).toISOString();

const marcaciones: Marcacion[] = DIAS_CON_MARCAS.flatMap((d) =>
  ["08:00", "12:00", "12:30", "17:00"].map((h) => ({
    empleado_codigo: CODIGO, empleado_nombre: null, ocurrio_en: enPanama(d, h),
  })),
);

const horarios: HorarioPersona[] = [
  { empleado_codigo: CODIGO, entrada: "08:00", salida: "17:00", almuerzo_minutos: 30 },
];

const ficha: FichaPlanilla = {
  codigo: CODIGO, nombre: "RODRIGO MIRANDA",
  salarioMensual: 800, jornadaSemanal: 40, empresa: "vistana",
};

/** El reporte con las justificaciones que se le pasen. */
function reporte(justificaciones: Justificacion[]) {
  return armarReporte({
    marcaciones, horarios, justificaciones,
    feriados: new Map(), desde: DESDE, hasta: HASTA, reglas: R,
    nombres: new Map([[CODIGO, "RODRIGO MIRANDA"]]),
    incluirNoHabiles: true,
  });
}

/** La planilla que sale de ese reporte. */
function planilla(justificaciones: Justificacion[]) {
  const personas = reporte(justificaciones);
  const horarioDe = new Map(horarios.map((h) => [h.empleado_codigo, h]));
  return armarPlanilla({
    personas,
    fichas: new Map([[CODIGO, ficha]]),
    jornadaDiariaMin: (c) => jornadaDiariaMin(horarioDe.get(c)),
    reglas: R, empresa: "vistana",
  });
}

const conMotivo = (motivo: string): Justificacion[] => [
  { empleado_codigo: CODIGO, desde: DIA_SIN_MARCAS, hasta: DIA_SIN_MARCAS, motivo },
];

const lineaDe = (justis: Justificacion[]) => planilla(justis).find((l) => l.codigo === CODIGO)!;

// ═════════════════════════════════════════════════════════════════════════════
describe("🔴 EL PAGO — el motivo nuevo tiene que pagar EXACTAMENTE igual que uno de hoy", () => {
  it("«Vacaciones» y «Trabajo fuera de la oficina» dan el MISMO dinero, campo por campo", () => {
    const vac = lineaDe(conMotivo("Vacaciones"));
    const fuera = lineaDe(conMotivo(MOTIVO_TRABAJO_VENDEDOR));

    expect(vac.dinero).not.toBeNull();
    expect(fuera.dinero).not.toBeNull();
    // Campo por campo y no `toEqual` del objeto entero: si algún día se agrega
    // una columna de dinero, este test la compara sola, sin que nadie lo toque.
    for (const k of Object.keys(vac.dinero!) as Array<keyof typeof vac.dinero>) {
      expect(`${String(k)}=${fuera.dinero![k]}`).toBe(`${String(k)}=${vac.dinero![k]}`);
    }
    expect(fuera.horas).toEqual(vac.horas);
  });

  it("los otros tres motivos también pagan igual — la paridad no es solo con vacaciones", () => {
    const fuera = lineaDe(conMotivo(MOTIVO_TRABAJO_VENDEDOR));
    for (const m of ["Incapacidad", "Permiso", "Luto", "Otro"]) {
      expect(lineaDe(conMotivo(m)).dinero).toEqual(fuera.dinero);
    }
  });

  it("NO SE DESCUENTA: el día justificado deja de valer una ausencia, y se nota en el neto", () => {
    const sin = lineaDe([]);
    const fuera = lineaDe(conMotivo(MOTIVO_TRABAJO_VENDEDOR));

    // Sin justificación, ese día se descuenta como ausencia.
    expect(sin.horas.ausenciaMin).toBeGreaterThan(0);
    // Con el motivo nuevo, no.
    expect(fuera.horas.ausenciaMin).toBe(sin.horas.ausenciaMin - 510);
    expect(fuera.dinero!.ausencias).toBeLessThan(sin.dinero!.ausencias);
    expect(fuera.dinero!.netoPagar).toBeGreaterThan(sin.dinero!.netoPagar);
  });

  it("las personas AJENAS no se mueven: justificarle un día a uno no toca al otro", () => {
    const otroCodigo = "99";
    const marcs = [
      ...marcaciones,
      ...DIAS_CON_MARCAS.flatMap((d) =>
        ["08:05", "12:00", "12:30", "17:10"].map((h) => ({
          empleado_codigo: otroCodigo, empleado_nombre: null, ocurrio_en: enPanama(d, h),
        }))),
    ];
    const fichas = new Map<string, FichaPlanilla>([
      [CODIGO, ficha],
      [otroCodigo, { ...ficha, codigo: otroCodigo, nombre: "OTRA PERSONA" }],
    ]);
    const horas2 = [...horarios, { empleado_codigo: otroCodigo, entrada: "08:00", salida: "17:00", almuerzo_minutos: 30 }];
    const horarioDe = new Map(horas2.map((h) => [h.empleado_codigo, h]));
    const arma = (justis: Justificacion[]) => armarPlanilla({
      personas: armarReporte({
        marcaciones: marcs, horarios: horas2, justificaciones: justis, feriados: new Map(),
        desde: DESDE, hasta: HASTA, reglas: R, incluirNoHabiles: true,
      }),
      fichas, jornadaDiariaMin: (c) => jornadaDiariaMin(horarioDe.get(c)), reglas: R, empresa: "vistana",
    });

    const antes = arma([]).find((l) => l.codigo === otroCodigo)!;
    const despues = arma(conMotivo(MOTIVO_TRABAJO_VENDEDOR)).find((l) => l.codigo === otroCodigo)!;
    expect(despues.dinero).toEqual(antes.dinero);
    expect(despues.horas).toEqual(antes.horas);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("⚠️ CERO HORAS EXTRA — sin marcas no hay horas que medir", () => {
  it("un día de trabajo fuera no inventa 8 horas ni genera un minuto de extra", () => {
    const p = reporte(conMotivo(MOTIVO_TRABAJO_VENDEDOR)).find((x) => x.codigo === CODIGO)!;
    const d = p.dias.find((x) => x.fecha === DIA_SIN_MARCAS)!;

    expect(d.justificado).toBe(MOTIVO_TRABAJO_VENDEDOR);
    expect(d.ausente).toBe(false);
    expect(d.marcas).toEqual([]);
    expect(d.trabajadoMin).toBe(0);
    expect(d.extraMin).toBe(0);
    expect(d.tardeMin).toBe(0);
    expect(d.salidaTempranaMin).toBe(0);
  });

  it("tampoco le QUITA extras a los días que sí trabajó", () => {
    const conExtra = DIAS_CON_MARCAS.flatMap((d) =>
      ["08:00", "12:00", "12:30", "18:00"].map((h) => ({
        empleado_codigo: CODIGO, empleado_nombre: null, ocurrio_en: enPanama(d, h),
      })));
    const arma = (justis: Justificacion[]) => armarReporte({
      marcaciones: conExtra, horarios, justificaciones: justis, feriados: new Map(),
      desde: DESDE, hasta: HASTA, reglas: R, incluirNoHabiles: true,
    }).find((x) => x.codigo === CODIGO)!;

    expect(arma([]).resumen.extraMin).toBeGreaterThan(0);
    expect(arma(conMotivo(MOTIVO_TRABAJO_VENDEDOR)).resumen.extraMin)
      .toBe(arma([]).resumen.extraMin);
  });

  it("la planilla tampoco le suma extras, domingos ni feriados por estar afuera", () => {
    const l = lineaDe(conMotivo(MOTIVO_TRABAJO_VENDEDOR));
    expect(l.horas.extraDiurnoMin).toBe(0);
    expect(l.horas.extraNocturnoMin).toBe(0);
    expect(l.horas.domingoMin).toBe(0);
    expect(l.horas.feriadoMin).toBe(0);
    expect(l.dinero!.extraDiurno).toBe(0);
    expect(l.dinero!.extraNocturno).toBe(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("🔴 EL REPORTE LOS DISTINGUE — es el punto de haber agregado el motivo", () => {
  it("un día de trabajo fuera NO se cuenta como ausencia justificada", () => {
    const fuera = reporte(conMotivo(MOTIVO_TRABAJO_VENDEDOR)).find((x) => x.codigo === CODIGO)!.resumen;
    expect(fuera.ausenciasJustificadas).toBe(0);
    expect(fuera.diasTrabajandoFuera).toBe(1);
    expect(fuera.ausenciasSinJustificar).toBe(1); // el viernes, que sigue sin justificar
  });

  it("y al revés: unas vacaciones NO se cuentan como trabajo fuera", () => {
    const vac = reporte(conMotivo("Vacaciones")).find((x) => x.codigo === CODIGO)!.resumen;
    expect(vac.ausenciasJustificadas).toBe(1);
    expect(vac.diasTrabajandoFuera).toBe(0);
  });

  it("los dos conjuntos son DISJUNTOS: ningún día se cuenta dos veces", () => {
    const justis: Justificacion[] = [
      { empleado_codigo: CODIGO, desde: DIA_SIN_MARCAS, hasta: DIA_SIN_MARCAS, motivo: MOTIVO_TRABAJO_VENDEDOR },
      { empleado_codigo: CODIGO, desde: "2026-08-07", hasta: "2026-08-07", motivo: "Vacaciones" },
    ];
    const r = reporte(justis).find((x) => x.codigo === CODIGO)!.resumen;
    expect(r.diasTrabajandoFuera).toBe(1);
    expect(r.ausenciasJustificadas).toBe(1);
    expect(r.ausenciasSinJustificar).toBe(0);
  });

  it("el renglón NO puede decir «ausencia» cuando la persona estuvo trabajando", () => {
    const t = textoDiaJustificado(MOTIVO_TRABAJO_VENDEDOR);
    expect(t.toLowerCase()).not.toContain("ausen");
    expect(t).toBe("Trabajando fuera de la oficina (vendedor)");
  });

  it("los otros motivos SÍ siguen diciendo que fue una ausencia justificada", () => {
    for (const m of ["Vacaciones", "Incapacidad", "Permiso", "Luto", "Otro"]) {
      expect(textoDiaJustificado(m)).toBe(`Ausencia justificada — ${m}`);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("El motivo, la lista y el reconocedor", () => {
  // ⚠️ 25-ago-2026: Daniel cambió la lista. Son CUATRO —Incapacidad,
  // Catástrofe, Escolares y Trabajo de vendedor— y se fueron «Vacaciones»
  // (a su propia pestaña), «Permiso», «Luto» y «Otro».
  it("la lista que ofrece la pantalla son EXACTAMENTE los cuatro de Daniel", () => {
    expect([...MOTIVOS_JUSTIFICACION]).toEqual([
      "Incapacidad", "Catástrofe", "Escolares", MOTIVO_TRABAJO_VENDEDOR,
    ]);
  });

  it("🔴 los retirados NO se ofrecen pero SIGUEN reconociéndose", () => {
    // 🩸 Quedan 4 justificaciones vivas en producción (3 de Incapacidad y la de
    // trabajo fuera, la de Rodrigo). Si el módulo dejara de reconocer un motivo
    // retirado, esa fila se volvería una ausencia sin justificar y costaría una
    // quincena. Sacarlo de la lista OFRECIDA no borra la fila.
    for (const m of ["Permiso", "Luto", "Otro", MOTIVO_TRABAJO_FUERA_ANTES]) {
      expect(MOTIVOS_JUSTIFICACION as readonly string[]).not.toContain(m);
      expect(MOTIVOS_RETIRADOS as readonly string[]).toContain(m);
    }
  });

  // ⚠️ ESTE CANDADO CAMBIÓ DE DIRECCIÓN el 25-ago-2026, y estaba FIJANDO EL
  // MUNDO VIEJO: exigía que «Vacaciones» siguiera en `MOTIVOS_RETIRADOS`, o
  // sea que el módulo la siguiera leyendo como un motivo de justificación.
  // Hoy exige lo contrario, y por eso vale la pena que sea un caso propio.
  it("⛔ «Vacaciones» NO está en NINGUNA de las dos listas: se mudó a su pestaña", () => {
    expect(MOTIVOS_JUSTIFICACION as readonly string[]).not.toContain("Vacaciones");
    // 🔴 Volver a ponerla en los retirados haría que el desplegable la ofrezca
    // por la puerta de atrás (`motivoConocido`) y que el mismo día pueda existir
    // dos veces —como vacación y como «Ausencia justificada — Vacaciones»—, con
    // dos etiquetas contradictorias en el renglón que decide un pago.
    expect(MOTIVOS_RETIRADOS as readonly string[]).not.toContain("Vacaciones");
    expect(motivoConocido("Vacaciones")).toBe(false);
  });

  it("🔴 EL NOMBRE VIEJO SIGUE VALIENDO — es la fila de Rodrigo en producción", () => {
    // Su justificación (código 13, 1 al 13 de agosto) dice «Trabajo fuera de la
    // oficina» y nadie la va a reescribir. Un `===` contra el nombre nuevo la
    // habría convertido en una ausencia común el día del merge.
    expect(esTrabajoDeVendedor(MOTIVO_TRABAJO_FUERA_ANTES)).toBe(true);
    expect(esTrabajoDeVendedor(MOTIVO_TRABAJO_VENDEDOR)).toBe(true);
    expect(textoDiaJustificado(MOTIVO_TRABAJO_FUERA_ANTES))
      .toBe(textoDiaJustificado(MOTIVO_TRABAJO_VENDEDOR));
  });

  it("se reconoce por IGUALDAD, no por parecido: un motivo escrito a mano no cuenta", () => {
    expect(esTrabajoDeVendedor(MOTIVO_TRABAJO_VENDEDOR)).toBe(true);
    expect(esTrabajoDeVendedor(`  ${MOTIVO_TRABAJO_VENDEDOR}  `)).toBe(true); // espacios de más
    for (const casi of [
      "Permiso para trabajar afuera",
      "Trabajo fuera",
      "trabajo de vendedor",           // otra caja: NO es el valor guardado
      "Trabajo fuera de la empresa",
      "Vendedor",
      "Vacaciones", "", null, undefined,
    ]) {
      expect(esTrabajoDeVendedor(casi as string)).toBe(false);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("El EXCEL dice lo mismo que la pantalla", () => {
  const excel = (justis: Justificacion[]) =>
    construirExcel({ personas: reporte(justis), desde: DESDE, hasta: HASTA, reglas: R });

  const filas = (wb: XLSX.WorkBook, hoja: string) =>
    XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[hoja], { header: 1 }) as unknown[][];

  it("la hoja Detalle dice «Trabajando fuera de la oficina», no «Ausencia»", () => {
    const f = filas(excel(conMotivo(MOTIVO_TRABAJO_VENDEDOR)), "Detalle");
    const col = (f[0] as string[]).indexOf("Ausencia / justificación");
    expect(col).toBeGreaterThan(-1);
    const celdas = f.slice(1).map((r) => String(r[col] ?? ""));
    expect(celdas).toContain("Trabajando fuera de la oficina (vendedor)");
    for (const c of celdas) expect(c.toLowerCase()).not.toContain("justificada — trabajo");
  });

  it("y con vacaciones sigue diciendo lo de siempre", () => {
    const f = filas(excel(conMotivo("Vacaciones")), "Detalle");
    const col = (f[0] as string[]).indexOf("Ausencia / justificación");
    expect(f.slice(1).map((r) => String(r[col] ?? ""))).toContain("Ausencia justificada — Vacaciones");
  });

  it("el Resumen trae la columna propia, y NO suma el día a las ausencias justificadas", () => {
    const f = filas(excel(conMotivo(MOTIVO_TRABAJO_VENDEDOR)), "Resumen");
    const head = f[0] as string[];
    const cFuera = head.indexOf("Días trabajando fuera");
    const cAusJ = head.indexOf("Ausencias justificadas");
    expect(cFuera).toBeGreaterThan(-1);
    expect(cAusJ).toBeGreaterThan(-1);
    const fila = f.find((r) => String(r[0] ?? "").includes("RODRIGO"))!;
    expect(fila[cFuera]).toBe(1);
    expect(fila[cAusJ] ?? "").not.toBe(1);
  });

  it("la CELDA que se pinta en rojo sigue siendo «…de días a revisar», no la de al lado", () => {
    // 🩸 Al insertar la columna nueva, el índice de la roja se corrió una a la
    // derecha. Pintar la de al lado teñiría de rojo los minutos tarde, que no
    // son una advertencia.
    //
    // 🔑 Se mira EL ESTILO DE LA CELDA, no el orden del encabezado: la mutación
    // que hay que cazar cambia dónde se pinta, no cómo se rotula. Y hace falta
    // un día con tardanza EN un día mal marcado, porque el rojo solo se aplica
    // cuando la celda trae un valor.
    const marcs: Marcacion[] = [
      // lun 3: dos marcas nada más (no son 4 → «revisar») y entrando tarde.
      { empleado_codigo: CODIGO, empleado_nombre: null, ocurrio_en: enPanama("2026-08-03", "08:30") },
      { empleado_codigo: CODIGO, empleado_nombre: null, ocurrio_en: enPanama("2026-08-03", "17:00") },
    ];
    const personas = armarReporte({
      marcaciones: marcs, horarios, justificaciones: conMotivo(MOTIVO_TRABAJO_VENDEDOR),
      feriados: new Map(), desde: DESDE, hasta: HASTA, reglas: R,
      nombres: new Map([[CODIGO, "RODRIGO MIRANDA"]]), incluirNoHabiles: true,
    });
    expect(personas[0].resumen.minutosTardeDeDiasARevisar).toBeGreaterThan(0);

    const wb = construirExcel({ personas, desde: DESDE, hasta: HASTA, reglas: R });
    const hoja = wb.Sheets["Resumen"];
    const head = (filas(wb, "Resumen")[0] as string[]);
    const cRevisar = head.indexOf("…de días a revisar");
    const cTarde = head.indexOf("Minutos tarde");
    // El rojo del módulo (`ALERTA` en exportar.ts). Se busca ESE color y no
    // "tiene estilo": así el test dice qué se pintó, no que se pintó algo.
    const rojo = (c: number) =>
      JSON.stringify(hoja[XLSX.utils.encode_cell({ r: 1, c })]?.s ?? {}).includes("A3352A");
    expect(rojo(cRevisar)).toBe(true);   // la advertencia va pintada
    expect(rojo(cTarde)).toBe(false);    // y su vecina NO
  });

  it("el TOTAL del pie tiene tantas celdas como columnas el encabezado", () => {
    // Si el total se desalinea, cada número queda debajo de la columna de al
    // lado: el peor error posible en la hoja que se mira.
    const f = filas(excel(conMotivo(MOTIVO_TRABAJO_VENDEDOR)), "Resumen");
    const total = f[f.length - 1] as unknown[];
    expect(String(total[0])).toBe("TOTAL");
    expect(total.length).toBe((f[0] as unknown[]).length);
  });

  it("🔴 el PDF QUE SE FIRMA lo dice: en el papel la persona sale con «Días 0»", () => {
    // Sin esta línea, ese cero en el papel que llega a planilla se lee como que
    // no vino a trabajar. Se lee el PDF generado, no el archivo fuente.
    // ⚠️ `output("string")` devuelve null bajo jsdom; el arraybuffer sí trae los
    // bytes del PDF, y el texto va sin comprimir.
    const texto = (justis: Justificacion[]) =>
      Buffer.from(
        construirPdf({ personas: reporte(justis), desde: DESDE, hasta: HASTA, reglas: R })
          .output("arraybuffer") as ArrayBuffer,
      ).toString("latin1");

    expect(texto(conMotivo(MOTIVO_TRABAJO_VENDEDOR))).toContain("trabajo fuera de la oficina");
    // Y sin días de trabajo fuera, la línea NO aparece: no es un texto fijo.
    expect(texto([])).not.toContain("trabajo fuera de la oficina");
  });

  it("la hoja «Cómo se calcula» explica que NO es una ausencia", () => {
    const f = filas(excel(conMotivo(MOTIVO_TRABAJO_VENDEDOR)), "Cómo se calcula");
    const fila = f.find((r) => String(r[0] ?? "") === "Trabajo de vendedor");
    expect(fila).toBeDefined();
    expect(String(fila![1])).toContain("NO es una ausencia");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("Lo que NO cambia", () => {
  it("sin ninguna justificación del motivo nuevo, el reporte cuenta igual que siempre", () => {
    const r = reporte(conMotivo("Vacaciones")).find((x) => x.codigo === CODIGO)!.resumen;
    expect(r.diasTrabajandoFuera).toBe(0);
    expect(r.ausenciasJustificadas).toBe(1);
    expect(r.diasTrabajados).toBe(3);
  });

  it("quien NO marcó ni un día sigue quedando a decisión de una persona, igual que con vacaciones", () => {
    // 🔴 Es el caso REAL de Rodrigo: cero marcas en toda la quincena. El motor
    // NO le inventa una quincena pagada ni se la descuenta entera — lo lista.
    // Es EXACTAMENTE lo que hace hoy una justificación de «Vacaciones» que cubre
    // el período completo (ELOYN MENDOZA, medido en producción), así que el
    // motivo nuevo no estrena un comportamiento: hereda el que ya había.
    const sinMarcas = (motivo: string) => armarPlanilla({
      personas: armarReporte({
        marcaciones: [], horarios,
        justificaciones: [{ empleado_codigo: CODIGO, desde: DESDE, hasta: HASTA, motivo }],
        feriados: new Map(), desde: DESDE, hasta: HASTA, reglas: R, incluirNoHabiles: true,
      }),
      fichas: new Map([[CODIGO, ficha]]),
      jornadaDiariaMin: () => 510, reglas: R, empresa: "vistana",
    }).find((l) => l.codigo === CODIGO)!;

    const fuera = sinMarcas(MOTIVO_TRABAJO_VENDEDOR);
    const vac = sinMarcas("Vacaciones");
    expect(fuera.faltaConfigurar).toEqual([FALTA.sinMarcaciones]);
    expect(fuera.faltaConfigurar).toEqual(vac.faltaConfigurar);
    expect(fuera.dinero).toBeNull();
    expect(fuera.dinero).toEqual(vac.dinero);
  });
});

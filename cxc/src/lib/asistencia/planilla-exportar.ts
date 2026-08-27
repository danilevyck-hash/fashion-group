/* ─────────────────────────────────────────────────────────────────────────────
 * Exportar la PLANILLA quincenal: Excel y PDF.
 *
 * ── QUÉ VA EN CADA UNO ───────────────────────────────────────────────────────
 * El EXCEL trae tres hojas: Planilla (las 19 columnas del cuadro de la
 * contable, una línea por persona), Horas (de dónde salió cada hora: es la hoja
 * que se abre cuando alguien reclama) y Cómo se calcula.
 *
 * El PDF trae el cuadro completo en horizontal. Es lo que se firma.
 *
 * ── 🔴 LAS DOS COSAS QUE NO SE NEGOCIAN EN LOS ARCHIVOS ──────────────────────
 *
 * 1. QUIEN NO SE PUDO CALCULAR SALE EN EL ARCHIVO, con el motivo escrito en su
 *    fila y SIN ceros en las columnas de dinero. Un archivo que omite a alguien
 *    es peor que la pantalla: se manda por correo y sobrevive a la discusión.
 * 2. LA FÓRMULA DEL NETO VA IMPRESA. Si algún día "otros servicios" resulta que
 *    suma en vez de restar, tiene que saltar a la vista de quien lo lea, no
 *    quedar enterrado en el código.
 * ────────────────────────────────────────────────────────────────────────── */

import type * as XLSX from "xlsx-js-style";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { FG_LOGO_BASE64, FG_LOGO_WIDTH, FG_LOGO_HEIGHT } from "@/lib/pdf-logo";
import {
  buildReportSheet,
  workbookFromSheets,
  MONEY_FMT,
  type ReportCell,
  type ReportColumn,
} from "@/lib/excel-export";
import { MINUTOS_TARDE_QUE_SON_AUSENCIA } from "./config";
import type { ReglasAsistencia } from "./config";
import {
  EXPLICACION_SERVICIO_PROFESIONAL,
  MOTIVO_FUERA_DE_PLANILLA,
} from "./participacion";
import {
  aHoras,
  FORMULA_NETO,
  grupoDeLinea,
  minutosTardanzaMostrados,
  type LineaPlanilla,
  type Periodo,
  type Quincena,
  type TotalesPlanilla,
} from "./planilla";
import type { AvisoPeriodoAbierto } from "./periodo";

export interface DatosPlanillaExport {
  lineas: readonly LineaPlanilla[];
  totales: TotalesPlanilla;
  quincena: Quincena;
  /** El período pedido. Ausente = es la quincena de siempre. */
  periodo?: Periodo;
  empresaEtiqueta: string | null;
  reglas: ReglasAsistencia;
  /**
   * El período todavía no terminó. 🔴 VA IMPRESO: si el archivo se manda por
   * correo, quien lo abra tiene que saber que faltan días y que los que no
   * pasaron no se contaron. Ausente = ya cerró, o no se supo.
   */
  periodoAbierto?: AvisoPeriodoAbierto | null;
  /** Los códigos que marcaron y no tienen ficha, dicho una sola vez. */
  avisoSinFicha?: string | null;
  /**
   * Lo que la planilla DEJÓ DE PAGAR por vacaciones marcadas «ya se le pagó».
   *
   * 🔴 VA IMPRESO. Es la regla de Daniel —nada se descarta en silencio— y el
   * papel es el que se firma: quien lo revise dentro de seis meses tiene que
   * poder ver de dónde salió ese descuento, con nombre, rango y monto.
   */
  avisoVacacionesNoPagadas?: string | null;
  /**
   * Las horas extra que el cuadro NO pagó porque nadie las autorizó.
   *
   * 🔴 VA IMPRESO, por el mismo motivo que el de arriba. El papel es el que se
   * firma, y una columna de extras en cero para alguien que sí se quedó tarde
   * es exactamente el número que nadie va a poder explicar dentro de seis meses
   * si el archivo no lo dice.
   */
  avisoExtraSinAprobar?: string | null;
  /**
   * Los descuentos de préstamo que el cuadro NO hizo porque nadie los aprobó.
   *
   * 🔴 VA IMPRESO, por el mismo motivo que los dos de arriba. Contadora,
   * textual: *«El préstamo si debe ser por aprobarlo»*. Una casilla de préstamo
   * en cero para alguien que sí debe plata es exactamente el número que nadie
   * va a poder explicar dentro de seis meses si el archivo no lo dice.
   */
  avisoPrestamoSinAprobar?: string | null;
  /**
   * Préstamos CON SALDO que no están atados a nadie de la planilla, o sea que
   * no se le están descontando a ninguna persona. También va impreso: es la
   * forma en que se perdieron $700 durante 22 días (ver #651).
   */
  avisoPrestamoSinAtar?: string | null;
}

/** El subtítulo que llevan los dos archivos. */
function subtitulo(d: DatosPlanillaExport): string {
  const emp = d.empresaEtiqueta ?? "Todas las empresas";
  // 🔴 UN RANGO LIBRE SE ANUNCIA EN EL PAPEL, no solo en la pantalla: el archivo
  // se manda por correo y sobrevive a la conversación en la que se explicó.
  if (d.periodo && !d.periodo.esQuincena) {
    return `${emp} · del ${d.periodo.etiqueta} · NO es una quincena: `
      + `sueldo base al ${(d.periodo.factorBase * 100).toFixed(1)} % y SIN los montos escritos a mano`;
  }
  return `${emp} · quincena del ${d.quincena.etiqueta}`;
}

/** 0 se muestra vacío: una columna de ceros esconde lo que sí importa. */
const c0 = (v: number): number | null => (v === 0 ? null : v);

/** El nombre del archivo. Kebab-case con la quincena, como el resto del sistema. */
export function nombreArchivo(d: DatosPlanillaExport, ext: "xlsx" | "pdf"): string {
  // El rango libre lleva las fechas en el nombre: dos archivos del mismo mes no
  // pueden llamarse igual y tapar uno al otro en la carpeta de descargas.
  const emp = (d.empresaEtiqueta ?? "todas")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const periodo = d.periodo && !d.periodo.esQuincena
    ? `${d.periodo.desde}_${d.periodo.hasta}`
    : d.quincena.clave;
  return `planilla-${emp}-${periodo}.${ext}`;
}

// ── Las 19 columnas del cuadro, en el orden de la contable ───────────────────

const COLUMNAS: ReportColumn[] = [
  { header: "Persona", wch: 28 },
  { header: "Código", wch: 8, align: "center" },
  { header: "Salario quincenal", wch: 15, align: "right", fmt: MONEY_FMT },
  { header: "Horas extra 1.25", wch: 14, align: "right", fmt: MONEY_FMT },
  { header: "Ausencias", wch: 12, align: "right", fmt: MONEY_FMT },
  { header: "Tardanzas", wch: 12, align: "right", fmt: MONEY_FMT },
  { header: "Horas extra 1.50", wch: 14, align: "right", fmt: MONEY_FMT },
  { header: "Excedente", wch: 14, align: "right", fmt: MONEY_FMT },
  { header: "Domingos", wch: 12, align: "right", fmt: MONEY_FMT },
  { header: "Feriados", wch: 12, align: "right", fmt: MONEY_FMT },
  { header: "Total bruto", wch: 13, align: "right", fmt: MONEY_FMT },
  { header: "Seguro social", wch: 13, align: "right", fmt: MONEY_FMT },
  { header: "Seguro educativo", wch: 14, align: "right", fmt: MONEY_FMT },
  { header: "ISR", wch: 10, align: "right", fmt: MONEY_FMT },
  { header: "Préstamo", wch: 11, align: "right", fmt: MONEY_FMT },
  { header: "Terceros", wch: 11, align: "right", fmt: MONEY_FMT },
  { header: "Mercancía", wch: 11, align: "right", fmt: MONEY_FMT },
  { header: "Total deducciones", wch: 15, align: "right", fmt: MONEY_FMT },
  // 🔴 El «(+)» va en el encabezado a propósito: es la única señal, para quien
  // reciba el archivo por correo, de que esta columna SUMA al neto mientras las
  // cuatro de al lado restan.
  { header: "Otros servicios (+)", wch: 15, align: "right", fmt: MONEY_FMT },
  { header: "Neto a pagar", wch: 14, align: "right", fmt: MONEY_FMT },
];

/** El motivo, en la columna del salario, en rojo. Nunca un cero. */
const PENDIENTE = { fg: "A3352A", bold: true } as const;
/**
 * Quien no va en planilla, en GRIS y sin el «⚠».
 * 🔴 El color es la mitad del mensaje: en rojo se leería como un error que hay
 * que corregir, y es una decisión ya tomada.
 */
const FUERA = { fg: "6B7280" } as const;

/** El motivo tal como se lee, con el quincenal que le tocaría al lado. */
function textoDecidir(l: LineaPlanilla): string {
  const base = l.decidirAMano ?? "lo decide una persona";
  return l.quincenalReferencia === null
    ? base
    : `${base} — la quincena completa le daría ${l.quincenalReferencia.toFixed(2)}`;
}

function filaPlanilla(l: LineaPlanilla): ReportCell[] {
  // 🔴 En GRIS y sin el «⚠»: no es un pendiente, es una decisión. En rojo se
  // leería como un error que hay que corregir en Configuración, que es
  // exactamente lo que este cambio vino a dejar de decir.
  if (grupoDeLinea(l) === "decidir") {
    return [
      { v: l.etiqueta, ...FUERA },
      l.codigo,
      { v: textoDecidir(l), ...FUERA },
      ...Array<ReportCell>(17).fill(null),
    ];
  }
  if (l.fueraDePlanilla) {
    // Sale en el archivo —omitirla sería peor: el papel sobrevive a la
    // discusión— con el motivo escrito y las 18 columnas de dinero vacías.
    return [
      { v: l.etiqueta, ...FUERA },
      l.codigo,
      { v: MOTIVO_FUERA_DE_PLANILLA, ...FUERA },
      ...Array<ReportCell>(17).fill(null),
    ];
  }
  if (!l.dinero) {
    // 🔴 Se lista, se dice POR QUÉ, y las 18 columnas de dinero quedan vacías.
    return [
      { v: l.etiqueta, ...PENDIENTE },
      l.codigo,
      { v: `⚠ ${l.faltaConfigurar.join(" · ")}`, ...PENDIENTE },
      ...Array<ReportCell>(17).fill(null),
    ];
  }
  const d = l.dinero;
  return [
    l.etiqueta, l.codigo,
    d.salarioQuincenal, c0(d.extraDiurno), c0(d.ausencias), c0(d.tardanzas),
    c0(d.extraNocturno), c0(d.excedente), c0(d.domingos), c0(d.feriados),
    d.totalBruto, d.seguroSocial, d.seguroEducativo,
    c0(d.isr), c0(d.prestamo), c0(d.terceros), c0(d.mercancia),
    d.totalDeducciones, c0(d.otrosServicios), d.netoPagar,
  ];
}

function filaTotales(t: TotalesPlanilla): ReportCell[] {
  return [
    `TOTAL — ${t.personas} ${t.personas === 1 ? "persona" : "personas"}`, "",
    t.salarioQuincenal, t.extraDiurno, t.ausencias, t.tardanzas,
    t.extraNocturno, t.excedente, t.domingos, t.feriados,
    t.totalBruto, t.seguroSocial, t.seguroEducativo,
    t.isr, t.prestamo, t.terceros, t.mercancia,
    t.totalDeducciones, t.otrosServicios, t.netoPagar,
  ];
}

// ── EXCEL ────────────────────────────────────────────────────────────────────

export function construirExcelPlanilla(d: DatosPlanillaExport): XLSX.WorkBook {
  const hojaPlanilla = buildReportSheet({
    title: "FASHION GROUP — Planilla quincenal",
    subtitle: subtitulo(d),
    columns: COLUMNAS,
    rows: d.lineas.map(filaPlanilla),
    totals: filaTotales(d.totales),
  });

  // Hoja 2 — de dónde salió cada hora. Es la que se abre cuando alguien
  // reclama: sin ella el cuadro es una lista de dólares sin respaldo.
  const colsHoras: ReportColumn[] = [
    { header: "Persona", wch: 28 },
    { header: "Código", wch: 8, align: "center" },
    { header: "Empresa", wch: 20 },
    { header: "Salario mensual", wch: 14, align: "right", fmt: MONEY_FMT },
    { header: "Jornada", wch: 9, align: "center" },
    { header: "Rata por hora", wch: 12, align: "right", fmt: MONEY_FMT },
    { header: "Días trabajados", wch: 13, align: "right" },
    { header: "Extra 1.25 (h)", wch: 12, align: "right" },
    { header: "Extra 1.50 (h)", wch: 12, align: "right" },
    { header: "Excedente (h)", wch: 12, align: "right" },
    { header: "Domingo (h)", wch: 11, align: "right" },
    { header: "Feriado (h)", wch: 11, align: "right" },
    { header: "Tardanza (min)", wch: 13, align: "right" },
    // 🔴 Los minutos de más de 30 tarde van APARTE. Sumados a la tardanza, la
    // columna no cuadraría con el monto de la hoja del cuadro, que ya los
    // muestra del lado de la ausencia.
    { header: "Tarde >30 min (min)", wch: 17, align: "right" },
    { header: "Tarde >30 min (días)", wch: 18, align: "right" },
    { header: "…de días a revisar", wch: 16, align: "right" },
    { header: "Ausencias (días)", wch: 14, align: "right" },
    { header: "Ausencias (h)", wch: 12, align: "right" },
    { header: "Sábado (h) sin pagar", wch: 17, align: "right" },
    { header: "Días a revisar", wch: 12, align: "right" },
    { header: "Falta configurar", wch: 34 },
  ];
  const hojaHoras = buildReportSheet({
    title: "FASHION GROUP — Planilla: de dónde salen las horas",
    subtitle: subtitulo(d),
    columns: colsHoras,
    rows: d.lineas.map((l) => {
      const h = l.horas;
      return [
        l.etiqueta, l.codigo, l.empresaEtiqueta ?? "—",
        l.salarioMensual ?? null,
        l.jornadaSemanal ? `${l.jornadaSemanal} h` : "—",
        l.dinero?.rataHora ?? null,
        h.diasTrabajados,
        c0(aHoras(h.extraDiurnoMin)), c0(aHoras(h.extraNocturnoMin)), c0(aHoras(h.excedenteMin)),
        c0(aHoras(h.domingoMin)), c0(aHoras(h.feriadoMin)),
        // Minutos AL SEGUNDO: se redondean a 2 decimales solo para la celda.
        // 🔑 `minutosTardanzaMostrados` y no `h.tardanzaMin`: es el mismo número
        // que la pantalla, y el que de verdad valúa la columna «Tardanzas».
        c0(Math.round(minutosTardanzaMostrados(h) * 100) / 100),
        c0(Math.round((h.tardanzaGraveMin || 0) * 100) / 100),
        c0(h.tardanzaGraveDias || 0),
        c0(Math.round(h.tardanzaDeDiasARevisarMin * 100) / 100),
        c0(h.ausenciaDias), c0(aHoras(h.ausenciaMin)),
        c0(aHoras(h.sabadoMin)), c0(h.diasARevisar),
        l.fueraDePlanilla
          ? { v: MOTIVO_FUERA_DE_PLANILLA, ...FUERA }
          : grupoDeLinea(l) === "decidir"
            ? { v: textoDecidir(l), ...FUERA }
            : l.faltaConfigurar.length
              ? { v: l.faltaConfigurar.join(" · "), ...PENDIENTE }
              : "",
      ] as ReportCell[];
    }),
  });

  // Hoja 3 — las reglas con las que se calculó ESTE archivo. Va adentro a
  // propósito: quien lo reciba dentro de seis meses tiene que poder saber con
  // qué números salió, aunque para entonces la configuración haya cambiado.
  const r = d.reglas;
  const colsReglas: ReportColumn[] = [
    { header: "Concepto", wch: 42 },
    { header: "Con qué se calculó esta planilla", wch: 78 },
  ];
  const hojaReglas = buildReportSheet({
    title: "FASHION GROUP — Cómo se calcula la planilla",
    subtitle: subtitulo(d),
    columns: colsReglas,
    rows: [
      ["Rata por hora", `Salario mensual ÷ ${r.divisor40} si trabaja 40 h por semana, ÷ ${r.divisor48} si trabaja 48. Redondeada a centavos.`],
      ["Valor del minuto", "Rata por hora ÷ 60."],
      ["Salario quincenal", "Salario mensual ÷ 2. El día 31 no paga base, pero si se falta ese día sí se descuenta."],
      ["Tardanza", `Tolerancia de ${r.toleranciaTardanzaMin} minutos. Pasada la tolerancia se cuenta desde la hora de entrada, y se descuenta minutos × valor del minuto.`],
      ["Hora extra", `Mínimo ${r.extraMinimoMin} minutos y menos el atraso del mismo día. Hasta las ${r.horaCorteNocturno} × ${r.recargoExtraDiurno}; desde el minuto siguiente × ${r.recargoExtraNocturno}.`],
      ["Excedente", `NO SE USA: esos minutos se pagan × ${r.recargoExtraNocturno} junto con el resto de la hora extra de noche. La columna queda en $0.00, igual que en el cuadro de la contadora.`],
      ["Domingos y feriados", `Horas trabajadas × ${r.recargoDomingoFeriado}.`],
      ["Ausencias", "8 horas × rata por hora, sin recargo, por cada día completo sin marcar. Son 8 fijas para todos: no las mueve el horario de cada quien."],
      ["Vacaciones «ya se le pagó»", "Se muestran en la columna «Ausencias» pero NO son una ausencia: la persona no faltó. Son días de vacaciones que ya había cobrado en dinero antes, así que no se le pagan otra vez y se le descuentan como un día no trabajado. Una vacación SIN marcar se paga normal y no aparece en ninguna columna."],
      ["Llegar más de 30 minutos tarde", "Se muestra en la columna «Ausencias», no en «Tardanzas» — pero SE DESCUENTAN LOS MINUTOS, exactamente igual que una tardanza. La columna solo cambia de nombre: el total bruto y el neto son los mismos. Hasta 30 minutos va en «Tardanzas»."],
      ["Seguro social", `${r.seguroSocialPct} % del total bruto.`],
      ["Seguro educativo", `${r.seguroEducativoPct} % del total bruto.`],
      ["ISR, préstamo, terceros, mercancía y otros servicios", "No salen de ningún sistema: los escribe la contable a mano."],
      ["Otros servicios", "SE SUMA al neto: es un pago extra, no un descuento. Los otros cuatro se restan."],
      [""],
      ["Total bruto", "Quincenal + extras + domingos + feriados − ausencias − tardanzas. ⚠ Que unos minutos se muestren en «Ausencias» en vez de en «Tardanzas» NO cambia este número: se resta lo mismo de los dos lados."],
      ["Neto a pagar", "Total bruto − total deducciones + otros servicios."],
      [""],
      ["⚠ Quien aparece en rojo", "No tiene todo lo que hace falta para calcularle un número. NO vale $0: quedó fuera del total y hay que configurarlo en la pestaña Configuración."],
      ["Quien aparece en gris", `No va en planilla (${EXPLICACION_SERVICIO_PROFESIONAL} No es un pendiente: es como se le paga), o lo decide una persona: está justificada, o entró o salió a mitad del período. En ese caso el motivo va escrito en su fila, junto con lo que le daría la quincena completa; para pagarle lo suyo se usa el rango de fechas.`],
      ["Quien entró o salió a mitad del período", "NO se le calcula pago, ni completo ni prorrateado. Pagarle la quincena entera sería regalarle los días en que no trabajaba acá; descontársela entera, inventarle una renuncia. Lo decide una persona y se saca con el rango de fechas."],
      ["Días que todavía no pasaron", d.periodoAbierto
        ? `${d.periodoAbierto.texto} Un día que no pasó no cuenta como falta ni como presente: todavía no existe.`
        : "Este período ya terminó: todos sus días se contaron."],
      ...(d.avisoSinFicha ? [["Códigos sin ficha", d.avisoSinFicha]] : []),
      ...(d.avisoVacacionesNoPagadas
        ? [["Vacaciones que no se pagaron", d.avisoVacacionesNoPagadas]]
        : []),
      ...(d.avisoExtraSinAprobar
        ? [["Horas extra que no se pagaron", d.avisoExtraSinAprobar]]
        : []),
      ...(d.avisoPrestamoSinAprobar
        ? [["Préstamos que no se descontaron", d.avisoPrestamoSinAprobar]]
        : []),
      ...(d.avisoPrestamoSinAtar
        ? [["Préstamos sin persona", d.avisoPrestamoSinAtar]]
        : []),
      ["Período", d.periodo && !d.periodo.esQuincena
        ? `Del ${d.periodo.desde} al ${d.periodo.hasta} (${d.periodo.diasCalendario} días). NO es una quincena: el salario base se pagó al ${(d.periodo.factorBase * 100).toFixed(1)} % —la parte de quincena que cubren estas fechas— y los montos escritos a mano (ISR, préstamo, terceros, mercancía, otros servicios) NO se aplicaron, porque se cargan por quincena: para llenarlos hay que pedir el cuadro con las fechas exactas de una quincena.`
        : `Quincena del ${d.quincena.etiqueta}. Salario base completo (salario mensual ÷ 2).`],
      ["⚠ Sábados", "Si alguien trabajó un sábado, las horas se muestran en la hoja de horas pero NO se pagan en ninguna columna: el cuadro no tiene una para el sábado."],
    ] as ReportCell[][],
  });

  return workbookFromSheets([
    { name: "Planilla", ws: hojaPlanilla },
    { name: "Horas", ws: hojaHoras },
    { name: "Cómo se calcula", ws: hojaReglas },
  ]);
}

// ── PDF ──────────────────────────────────────────────────────────────────────

const m2 = (v: number | null): string => (v === null || v === 0 ? "" : v.toFixed(2));

export function construirPdfPlanilla(d: DatosPlanillaExport): jsPDF {
  // 19 columnas de dinero no caben en carta ni acostada: legal apaisada es lo
  // mínimo para que no haya que leerlo con lupa.
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "legal" });
  const w = doc.internal.pageSize.getWidth();

  try {
    doc.addImage(FG_LOGO_BASE64, "JPEG", 10, 8, FG_LOGO_WIDTH, FG_LOGO_HEIGHT);
  } catch { /* sin logo si falla */ }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(17, 24, 39);
  doc.text("FASHION GROUP", 10 + FG_LOGO_WIDTH + 3, 15);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(107, 114, 128);
  doc.text(`Planilla — ${subtitulo(d)}`, w - 10, 15, { align: "right" });

  const t = d.totales;
  autoTable(doc, {
    startY: 24,
    head: [[
      "Persona", "Salario\nquincenal", "Extra\n1.25", "Ausen-\ncias", "Tar-\ndanzas",
      "Extra\n1.50", "Exce-\ndente", "Domin-\ngos", "Feria-\ndos", "Total\nbruto",
      "Seguro\nsocial", "Seguro\neducativo", "ISR", "Prés-\ntamo", "Ter-\nceros",
      "Mercan-\ncía", "Total\ndeducc.", "Otros\nserv. (+)", "Neto a\npagar",
    ]],
    body: d.lineas.map((l) => {
      if (grupoDeLinea(l) === "decidir") {
        return [
          `${l.etiqueta} (${l.codigo})`,
          textoDecidir(l),
          ...Array<string>(17).fill(""),
        ];
      }
      if (l.fueraDePlanilla) {
        return [
          `${l.etiqueta} (${l.codigo})`,
          MOTIVO_FUERA_DE_PLANILLA,
          ...Array<string>(17).fill(""),
        ];
      }
      if (!l.dinero) {
        // 🔑 SIN el «⚠» del Excel: la fuente base del PDF no tiene ese glifo y
        // lo imprimía como un «&». La fila igual se distingue —va en rojo— y
        // acá lo que importa es que el motivo se lea.
        return [
          `${l.etiqueta} (${l.codigo})`,
          `falta configurar: ${l.faltaConfigurar.join(" · ")}`,
          ...Array<string>(17).fill(""),
        ];
      }
      const x = l.dinero;
      return [
        l.etiqueta,
        m2(x.salarioQuincenal), m2(c0(x.extraDiurno)), m2(c0(x.ausencias)), m2(c0(x.tardanzas)),
        m2(c0(x.extraNocturno)), m2(c0(x.excedente)), m2(c0(x.domingos)), m2(c0(x.feriados)),
        m2(x.totalBruto), m2(x.seguroSocial), m2(x.seguroEducativo),
        m2(c0(x.isr)), m2(c0(x.prestamo)), m2(c0(x.terceros)), m2(c0(x.mercancia)),
        m2(x.totalDeducciones), m2(c0(x.otrosServicios)), m2(x.netoPagar),
      ];
    }),
    foot: [[
      `TOTAL — ${t.personas} ${t.personas === 1 ? "persona" : "personas"}`,
      m2(t.salarioQuincenal), m2(t.extraDiurno), m2(t.ausencias), m2(t.tardanzas),
      m2(t.extraNocturno), m2(t.excedente), m2(t.domingos), m2(t.feriados),
      m2(t.totalBruto), m2(t.seguroSocial), m2(t.seguroEducativo),
      m2(t.isr), m2(t.prestamo), m2(t.terceros), m2(t.mercancia),
      m2(t.totalDeducciones), m2(t.otrosServicios), m2(t.netoPagar),
    ]],
    theme: "plain",
    styles: { fontSize: 6.6, cellPadding: 1.2, textColor: [31, 41, 55], lineColor: [229, 231, 235], lineWidth: 0.1 },
    headStyles: { fontStyle: "bold", fontSize: 6, textColor: [107, 114, 128], lineWidth: { bottom: 0.3 }, valign: "bottom", halign: "right" },
    footStyles: { fontStyle: "bold", fontSize: 6.6, textColor: [17, 24, 39], lineWidth: { top: 0.3 }, halign: "right" },
    columnStyles: {
      0: { cellWidth: 42, halign: "left" },
      ...Object.fromEntries(
        Array.from({ length: 18 }, (_, i) => [i + 1, { halign: "right" as const }]),
      ),
      9: { halign: "right", fontStyle: "bold" },
      18: { halign: "right", fontStyle: "bold" },
    },
    // La fila de quien no se pudo calcular, en rojo y con el motivo legible.
    didParseCell: (data) => {
      if (data.section !== "body") return;
      const l = d.lineas[data.row.index];
      if (!l || l.dinero) return;
      // Gris para quien no va en planilla y para lo que decide una persona;
      // rojo SOLO para el pendiente de verdad. El color es la mitad del mensaje.
      const g = grupoDeLinea(l);
      data.cell.styles.textColor =
        g === "fuera" || g === "decidir" ? [107, 114, 128] : [163, 53, 42];
      if (data.column.index === 1) data.cell.styles.halign = "left";
    },
    margin: { left: 10, right: 10 },
    didDrawPage: () => {
      const h = doc.internal.pageSize.getHeight();
      doc.setFontSize(6.5);
      doc.setTextColor(156, 163, 175);
      // 🔴 Lo que no puede perderse al mandar el papel por correo. Va arriba de
      // la fórmula porque es lo que cambia la lectura del cuadro entero.
      // 🔴 EL PAPEL ES EL QUE SE FIRMA, y en él la columna «Ausencias» puede
      // traer minutos de alguien que vino todos los días. Sin esta línea, quien
      // lo revise dentro de seis meses no tiene forma de saberlo — y el aviso
      // solo aparece cuando hay algo que avisar, que es lo que hace que se lea.
      const conAusenciaPorTardanza = d.lineas.some((l) => (l.dinero?.ausenciaPorTardanza ?? 0) > 0);
      const avisos = [
        d.periodoAbierto?.texto,
        d.avisoSinFicha,
        d.avisoVacacionesNoPagadas,
        d.avisoExtraSinAprobar,
        d.avisoPrestamoSinAprobar,
        d.avisoPrestamoSinAtar,
        conAusenciaPorTardanza
          ? `Llegar más de ${MINUTOS_TARDE_QUE_SON_AUSENCIA} minutos tarde se muestra en «Ausencias», no en «Tardanzas»: se descuentan los minutos igual que una tardanza y el total bruto no cambia.`
          : null,
      ].filter(Boolean).join("  ");
      if (avisos) doc.text(avisos, 10, h - 11);
      doc.text(FORMULA_NETO, 10, h - 8);
      doc.text(
        "En rojo: falta configurar a esa persona — no vale $0 y NO entra al total.  "
        + "En gris: no se le calcula pago — o no va en planilla (servicio profesional), "
        + "o lo decide una persona (justificada, o entró o salió a mitad del período).",
        10, h - 5,
      );
      doc.text(`Página ${doc.getNumberOfPages()}`, w - 10, h - 8, { align: "right" });
    },
  });

  return doc;
}

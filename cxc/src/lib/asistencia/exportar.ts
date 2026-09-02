// ─────────────────────────────────────────────────────────────────────────────
// Exportar el reporte de asistencia: Excel (2 hojas) y PDF (el resumen).
//
// ── QUÉ VA EN CADA UNO, y por qué ────────────────────────────────────────────
// El EXCEL trae las dos hojas: Detalle (una línea por persona por día, con las
// 4 marcas) y Resumen (una línea por persona). Es el archivo de trabajo.
//
// El PDF trae SOLO el resumen. Es lo que se firma y se entrega a planilla: si
// llevara las 340 líneas del detalle nadie lo leería y nadie lo firmaría.
//
// ⚠️ TODO EN MINUTOS, nunca en horas decimales. "295 minutos" se le discute a
// una persona; "4,92 horas" no le dice nada a nadie. Fue decisión de Daniel y
// se respeta en los dos archivos.
// ─────────────────────────────────────────────────────────────────────────────

import * as XLSX from "xlsx-js-style";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { FG_LOGO_BASE64, FG_LOGO_WIDTH, FG_LOGO_HEIGHT } from "@/lib/pdf-logo";
import { TOLERANCIA_MIN, EXTRA_MINIMO_MIN, type DiaReporte, type PersonaReporte, type ReglasReporte } from "./reporte";
import { ALMUERZO_FIJO_MIN } from "./config";
import { etiquetaPersona } from "./directorio";
import { MOTIVO_TRABAJO_VENDEDOR, textoDiaJustificado } from "./motivos";
import { textoDiaVacaciones } from "./vacaciones";

const MESES = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
const DIAS = ["dom","lun","mar","mié","jue","vie","sáb"];

/** "2026-07-13" → "lun 13 jul". Se parte el string: `new Date` lo corre un día. */
function fecha(iso: string): string {
  const [a, m, d] = iso.split("-").map(Number);
  const dow = new Date(Date.UTC(a, m - 1, d)).getUTCDay();
  return `${DIAS[dow]} ${d} ${MESES[m - 1]}`;
}
function rango(desde: string, hasta: string): string {
  const f = (iso: string) => { const [a,m,d] = iso.split("-").map(Number); return `${d} ${MESES[m-1]} ${a}`; };
  return `${f(desde)} — ${f(hasta)}`;
}
/** 0 se muestra vacío, no como "0": una columna de ceros esconde lo que importa. */
/**
 * Un número de celda: el 0 se deja VACÍO —una columna de ceros esconde lo que sí
 * importa— y lo demás va con 2 decimales como mucho.
 *
 * 🔑 Los minutos se calculan AL SEGUNDO desde el 13-ago-2026, así que traen
 * fracción. Se redondea a 2 decimales SOLO para escribir la celda (0,6 s de
 * resolución): dejar el número largo llenaría el Excel de 30,483333333333.
 */
const n0 = (v: number) => (v === 0 ? "" : Math.round(v * 100) / 100);

/**
 * La columna «Persona» de los dos archivos.
 *
 * 🩸 Pasa por `etiquetaPersona` —la MISMA función que usa la pantalla— y no por
 * un `?? p.codigo` escrito acá. Un Excel que dice «BRICEIDA MONTERO» y una
 * pantalla que dice «8» son dos verdades para la misma persona, y el archivo es
 * justo el que se manda por correo y sobrevive a la discusión.
 */
const quien = (p: PersonaReporte) => etiquetaPersona(p.codigo, p.nombre);

/**
 * Lo que se tocó a mano ese día, en una celda.
 *
 * 🔴 SE ESCRIBE LA HORA DEL RELOJ TAMBIÉN. Poner solo la corregida haría que el
 * Excel enseñara una hora escrita por una persona como si la hubiera registrado
 * el reloj — y este archivo es el que se manda por correo y sobrevive a la
 * conversación donde se explicó.
 */
function textoCorrecciones(d: { correcciones: DiaReporte["correcciones"] }): string {
  if (!d.correcciones.length) return "";
  return d.correcciones
    .map((c) =>
      c.agregada
        ? `AGREGADA ${c.hora} (el reloj no registró nada) — "${c.motivo}" — ${c.creadaPor}`
        : `Reloj ${c.relojHora} → ${c.hora} — "${c.motivo}" — ${c.creadaPor}`,
    )
    .join(" · ");
}

const HEAD = { font: { bold: true, sz: 9, color: { rgb: "6B7280" } }, alignment: { horizontal: "left" } };
const HEAD_R = { ...HEAD, alignment: { horizontal: "right" } };
const NUM = { alignment: { horizontal: "right" } };
const ALERTA = { font: { color: { rgb: "A3352A" }, bold: true }, alignment: { horizontal: "right" } };

export interface DatosExport {
  personas: readonly PersonaReporte[];
  desde: string;
  hasta: string;
  /**
   * Los números con los que el servidor CALCULÓ este reporte. Van al archivo
   * porque los archivos sobreviven a la configuración: si dentro de seis meses
   * alguien sube la tolerancia, el Excel de hoy tiene que seguir diciendo con
   * cuánta se hizo. Sin esto, el pie del PDF sería una frase escrita a mano que
   * envejece mal y contradice al motor.
   */
  reglas?: Partial<ReglasReporte>;
}

/** Los números del reporte, con los valores por defecto si no llegaron. */
function conDefaults(r: Partial<ReglasReporte> | undefined): ReglasReporte {
  const n = (v: number | undefined, def: number) =>
    typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : def;
  return {
    toleranciaTardanzaMin: n(r?.toleranciaTardanzaMin, TOLERANCIA_MIN),
    extraMinimoMin: n(r?.extraMinimoMin, EXTRA_MINIMO_MIN),
  };
}

// ── EXCEL ────────────────────────────────────────────────────────────────────

export function construirExcel({ personas, desde, hasta, reglas }: DatosExport): XLSX.WorkBook {
  const g = conDefaults(reglas);
  const wb = XLSX.utils.book_new();

  // Hoja 1 — Detalle. Solo días CON marcas o con ausencia: los feriados y los
  // días justificados sin marca llenarían la hoja de renglones vacíos.
  const detalle: unknown[][] = [[
    "Persona","Código","Día","Entrada","Sale almuerzo","Vuelve","Salida",
    "Tarde (min)","Exceso almuerzo (min)","Salida temprana (min)","Extra (min)",
    // 🔑 «Ausencia» a secas ya no alcanza: un día de trabajo fuera de la
    // oficina cae en esta misma columna y NO es una ausencia.
    "Trabajado (min)","Revisar","Ausencia / justificación","Corregido a mano",
  ]];
  for (const p of personas) {
    for (const d of p.dias) {
      // 🔑 Un día con PERMISO de horas también entra: la persona vino, y sin
      // esta condición un día en que se le perdonaron 120 minutos saldría del
      // Excel sin explicación de por qué la tardanza no cuadra con el reloj.
      // 🔑 Un día de VACACIONES entra aunque no tenga marcas ni justificación:
      // el Excel es lo que se manda por correo, y una fila que falta se lee
      // como un día que nadie miró.
      if (!d.marcas.length && !d.ausente && !d.justificado && !d.permiso && !d.vacacion) continue;
      detalle.push([
        quien(p), p.codigo, fecha(d.fecha),
        d.marcas[0] ?? "", d.marcas[1] ?? "", d.marcas[2] ?? "",
        d.marcas.length > 3 ? d.marcas[d.marcas.length - 1] : (d.marcas.length === 2 ? d.marcas[1] : ""),
        n0(d.tardeMin), n0(d.excesoAlmuerzoMin), n0(d.salidaTempranaMin), n0(d.extraMin),
        n0(d.trabajadoMin),
        d.revisar ? "Revisar" : "",
        // El MISMO texto que la pantalla (`textoDiaJustificado`): el Excel es lo
        // que se manda por correo, y no puede decir "ausencia" donde la
        // pantalla dice "trabajando fuera".
        // 🔴 VACACIONES PRIMERO, y con las mismas palabras que la pantalla
        // (`textoDiaVacaciones`): el papel no puede decir «ausencia» donde la
        // pantalla dice «Vacaciones».
        d.vacacion ? textoDiaVacaciones(d.vacacion.yaPagadas)
          : d.ausente ? "Sin justificar"
          : d.justificado ? textoDiaJustificado(d.justificado)
          // 🔴 El permiso de HORAS es OTRA cosa que una justificación de día
          // entero, y el papel lo dice: perdonó N minutos y nada más.
          : d.permiso ? `${d.permiso} · perdona ${n0(d.permisoPerdonaMin)} min`
          : d.feriado ? `Feriado — ${d.feriado}` : "",
        // 🔴 El archivo es el que se manda por correo y sobrevive a la
        // discusión: si la pantalla avisa que una hora se tocó a mano y el
        // Excel no, el Excel es el que va a decidir un pago con menos
        // información que la pantalla.
        textoCorrecciones(d),
      ]);
    }
  }
  const h1 = XLSX.utils.aoa_to_sheet(detalle);
  h1["!cols"] = [{wch:24},{wch:8},{wch:12},{wch:9},{wch:13},{wch:9},{wch:9},
                 {wch:11},{wch:19},{wch:19},{wch:11},{wch:14},{wch:9},{wch:24},{wch:52}];
  h1["!freeze"] = { xSplit: 0, ySplit: 1 };
  for (let c = 0; c < detalle[0].length; c++) {
    const ref = XLSX.utils.encode_cell({ r: 0, c });
    if (h1[ref]) h1[ref].s = c >= 3 && c <= 11 ? HEAD_R : HEAD;
  }
  XLSX.utils.book_append_sheet(wb, h1, "Detalle");

  // Hoja 2 — Resumen. Es la que se mira.
  const resumen: unknown[][] = [[
    "Persona","Código","Sale","Días trabajados","Ausencias sin justificar",
    // 🔑 Columna propia, no sumada a las ausencias justificadas: son días
    // TRABAJADOS y meterlos en la misma cifra es lo que este motivo eliminó.
    "Ausencias justificadas","Días trabajando fuera","Veces tarde","Minutos tarde","…de días a revisar",
    "Exceso almuerzo (min)","Salida temprana (min)","Tiempo no trabajado (min)",
    "Extras (min)","Días a revisar","Días corregidos a mano",
    // 🔴 AL FINAL, no intercaladas: la columna «…de días a revisar» se pinta
    // en rojo por POSICIÓN (índice 9) y meter algo en el medio teñiría los
    // minutos tarde, que no son una advertencia. Ya pasó una vez.
    "Días de vacaciones","…ya pagadas (no se pagan)",
  ]];
  for (const p of personas) {
    const r = p.resumen;
    resumen.push([
      quien(p), p.codigo, p.salida,
      r.diasTrabajados, n0(r.ausenciasSinJustificar), n0(r.ausenciasJustificadas),
      n0(r.diasTrabajandoFuera),
      n0(r.vecesTarde), n0(r.minutosTarde), n0(r.minutosTardeDeDiasARevisar),
      n0(r.excesoAlmuerzoMin), n0(r.salidaTempranaMin), n0(r.tiempoNoTrabajadoMin),
      n0(r.extraMin), n0(r.diasARevisar), n0(r.diasCorregidos),
      n0(r.diasVacaciones), n0(r.diasVacacionesYaPagadas),
    ]);
  }
  const t = personas.reduce((a, p) => ({
    dias: a.dias + p.resumen.diasTrabajados,
    aus: a.aus + p.resumen.ausenciasSinJustificar,
    ausJ: a.ausJ + p.resumen.ausenciasJustificadas,
    fuera: a.fuera + p.resumen.diasTrabajandoFuera,
    veces: a.veces + p.resumen.vecesTarde,
    tarde: a.tarde + p.resumen.minutosTarde,
    tardeRev: a.tardeRev + p.resumen.minutosTardeDeDiasARevisar,
    almz: a.almz + p.resumen.excesoAlmuerzoMin,
    temp: a.temp + p.resumen.salidaTempranaMin,
    noTrab: a.noTrab + p.resumen.tiempoNoTrabajadoMin,
    extra: a.extra + p.resumen.extraMin,
    rev: a.rev + p.resumen.diasARevisar,
    corr: a.corr + p.resumen.diasCorregidos,
    vac: a.vac + p.resumen.diasVacaciones,
    vacPag: a.vacPag + p.resumen.diasVacacionesYaPagadas,
  }), { dias:0,aus:0,ausJ:0,fuera:0,veces:0,tarde:0,tardeRev:0,almz:0,temp:0,noTrab:0,extra:0,rev:0,corr:0,vac:0,vacPag:0 });
  resumen.push([]);
  resumen.push(["TOTAL", "", "", t.dias, t.aus, t.ausJ, t.fuera, t.veces, t.tarde, t.tardeRev,
                t.almz, t.temp, t.noTrab, t.extra, t.rev, t.corr, t.vac, t.vacPag]);

  const h2 = XLSX.utils.aoa_to_sheet(resumen);
  h2["!cols"] = [{wch:24},{wch:8},{wch:7},{wch:16},{wch:23},{wch:22},{wch:21},{wch:12},
                 {wch:14},{wch:18},{wch:20},{wch:21},{wch:24},{wch:13},{wch:15},{wch:22},
                 {wch:19},{wch:26}];
  h2["!freeze"] = { xSplit: 0, ySplit: 1 };
  for (let c = 0; c < resumen[0].length; c++) {
    const ref = XLSX.utils.encode_cell({ r: 0, c });
    if (h2[ref]) h2[ref].s = c >= 3 ? HEAD_R : HEAD;
  }
  // El total en negrita: es la línea que se mira primero.
  const filaTotal = resumen.length - 1;
  for (let c = 0; c < resumen[0].length; c++) {
    const ref = XLSX.utils.encode_cell({ r: filaTotal, c });
    if (h2[ref]) h2[ref].s = { font: { bold: true }, alignment: { horizontal: c >= 3 ? "right" : "left" } };
  }
  // La columna "…de días a revisar" en rojo: es la advertencia.
  // ⚠️ El 9 sigue a la posición de ESA columna: al insertar "Días trabajando
  // fuera" en la 6 se corrió una a la derecha. Pintar la 8 teñiría de rojo los
  // minutos tarde, que no son una advertencia.
  for (let r = 1; r <= personas.length; r++) {
    const ref = XLSX.utils.encode_cell({ r, c: 9 });
    if (h2[ref] && h2[ref].v) h2[ref].s = ALERTA;
  }
  XLSX.utils.book_append_sheet(wb, h2, "Resumen");

  // Hoja 3 — las reglas. Va DENTRO del archivo a propósito: quien lo reciba por
  // correo dentro de seis meses tiene que poder saber cómo se calculó.
  const filasReglas: unknown[][] = [
    ["Reporte de asistencia", rango(desde, hasta)],
    [],
    ["Cómo se calcula"],
    ["Entrada", `8:00 a.m. con ${g.toleranciaTardanzaMin} minutos de tolerancia. Pasados los ${g.toleranciaTardanzaMin}, se cuenta desde las 8:00.`],
    // El almuerzo NO sale de `reglas`: es fijo para todos (ver ALMUERZO_FIJO_MIN).
    ["Almuerzo", `${ALMUERZO_FIJO_MIN} minutos, igual para todos. Se mide entre la 2ª y la 3ª marca del día.`],
    // 🔴 1-sep-2026: acá decía "y se le resta el atraso del mismo día". Ya no:
    // *"No, van separadas"*. El mínimo es una PUERTA, no un descuento —pasada,
    // se paga TODO desde el primer minuto— y el atraso se cobra por su lado.
    // Este papel viaja por correo: si miente, la contadora paga otra cosa.
    ["Horas extra", `Desde ${g.extraMinimoMin} minutos se pagan completas, desde el primer minuto. Menos de eso no cuenta. El atraso del mismo día se descuenta aparte: no se le resta a la hora extra.`],
    ["Ausencia", "Día hábil sin ninguna marca, que no sea feriado ni tenga justificación."],
    ["Trabajo de vendedor", `"${MOTIVO_TRABAJO_VENDEDOR}" NO es una ausencia: la persona trabajó, solo que en otro lado y sin un reloj donde marcar. No se le descuenta nada, no le consume vacaciones y no genera horas extra (sin marcas no hay horas que medir). Va en columna propia, aparte de las ausencias justificadas.`],
    ["Permiso de horas", "Una justificación puede traer un rango de HORAS (de X a X). Cuando lo trae, NO justifica el día entero: solo perdona los minutos de tardanza que caen adentro de esa ventana, y un día sin ninguna marca sigue contando como ausencia completa."],
    ["Días a revisar", "El día no tiene las 4 marcas. Los minutos SÍ cuentan; la marca es para corregirlo."],
    ["Corregido a mano", "La hora que marcó el reloj NUNCA se borra: la corrección va encima y es la que cuenta. La columna dice la hora del reloj, la corregida, por qué y quién la puso."],
    [],
    ["Todo en MINUTOS, no en horas decimales."],
  ];
  const h3 = XLSX.utils.aoa_to_sheet(filasReglas);
  h3["!cols"] = [{ wch: 18 }, { wch: 86 }];
  if (h3["A1"]) h3["A1"].s = { font: { bold: true, sz: 12 } };
  if (h3["A3"]) h3["A3"].s = { font: { bold: true } };
  XLSX.utils.book_append_sheet(wb, h3, "Cómo se calcula");

  return wb;
}

// ── PDF ──────────────────────────────────────────────────────────────────────

export function construirPdf({ personas, desde, hasta, reglas }: DatosExport): jsPDF {
  const g = conDefaults(reglas);
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "letter" });
  const w = doc.internal.pageSize.getWidth();

  try {
    doc.addImage(FG_LOGO_BASE64, "JPEG", 14, 10, FG_LOGO_WIDTH, FG_LOGO_HEIGHT);
  } catch { /* sin logo si falla */ }

  doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.setTextColor(17, 24, 39);
  doc.text("FASHION GROUP", 14 + FG_LOGO_WIDTH + 3, 17);
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(107, 114, 128);
  doc.text(`Asistencia — ${rango(desde, hasta)}`, w - 14, 17, { align: "right" });

  const t = personas.reduce((a, p) => ({
    aus: a.aus + p.resumen.ausenciasSinJustificar,
    tarde: a.tarde + p.resumen.minutosTarde,
    noTrab: a.noTrab + p.resumen.tiempoNoTrabajadoMin,
    extra: a.extra + p.resumen.extraMin,
    rev: a.rev + p.resumen.diasARevisar,
    corr: a.corr + p.resumen.diasCorregidos,
    fuera: a.fuera + p.resumen.diasTrabajandoFuera,
  }), { aus: 0, tarde: 0, noTrab: 0, extra: 0, rev: 0, corr: 0, fuera: 0 });

  autoTable(doc, {
    startY: 27,
    // 🔴 «Corregidos» va en el papel QUE SE FIRMA. Este PDF es el que llega a
    // planilla: un total que se lee sin saber que hay horas escritas a mano es
    // exactamente lo que no puede pasar.
    head: [["Persona", "Sale", "Días", "Ausen.", "Veces\ntarde", "Min\ntarde",
            "Exceso\nalmuerzo", "Salida\ntemprana", "No trabajado\n(min)", "Extras\n(min)", "A\nrevisar", "Días\ncorreg."]],
    body: personas.map((p) => {
      const r = p.resumen;
      return [
        quien(p), p.salida, r.diasTrabajados,
        r.ausenciasSinJustificar || "", r.vecesTarde || "", n0(r.minutosTarde),
        n0(r.excesoAlmuerzoMin), n0(r.salidaTempranaMin),
        n0(r.tiempoNoTrabajadoMin), n0(r.extraMin), r.diasARevisar || "",
        r.diasCorregidos || "",
      ];
    }),
    foot: [["TOTAL", "", "", t.aus || "", "", n0(t.tarde), "", "", n0(t.noTrab), n0(t.extra), t.rev || "", t.corr || ""]],
    theme: "plain",
    styles: { fontSize: 7.5, cellPadding: 1.6, textColor: [31, 41, 55], lineColor: [229, 231, 235], lineWidth: 0.1 },
    headStyles: { fontStyle: "bold", fontSize: 6.8, textColor: [107, 114, 128], lineWidth: { bottom: 0.3 }, valign: "bottom" },
    footStyles: { fontStyle: "bold", fontSize: 7.5, textColor: [17, 24, 39], lineWidth: { top: 0.3 } },
    columnStyles: {
      0: { cellWidth: 46 }, 1: { halign: "center", cellWidth: 13 },
      2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" },
      5: { halign: "right" }, 6: { halign: "right" }, 7: { halign: "right" },
      8: { halign: "right", fontStyle: "bold" }, 9: { halign: "right" }, 10: { halign: "right" },
      11: { halign: "right" },
    },
    margin: { left: 14, right: 14 },
    didDrawPage: () => {
      const h = doc.internal.pageSize.getHeight();
      doc.setFontSize(7); doc.setTextColor(156, 163, 175);
      doc.text(
        `Entrada 8:00 (${g.toleranciaTardanzaMin} min de tolerancia) · almuerzo ${ALMUERZO_FIJO_MIN} min · ` +
        // 🔴 Misma corrección que la hoja «Cómo se calcula»: la extra se paga
        // completa y el atraso va aparte (1-sep-2026). El pie del papel firmado
        // no puede decir una regla distinta de la que hizo los números.
        `extras desde ${g.extraMinimoMin} min y se pagan completas (el atraso se descuenta aparte) · ` +
        "\"A revisar\" = el día no tiene las 4 marcas (los minutos igual cuentan)" +
        (t.corr > 0
          ? ` · ${t.corr} ${t.corr === 1 ? "día tiene" : "días tienen"} una hora corregida a mano (la del reloj se conserva; el detalle está en el Excel)`
          : "") +
        // 🔴 Este papel es el que se firma, y en él la persona que trabajó
        // afuera aparece con "Días 0". Sin esta línea, ese cero se lee como
        // que no vino a trabajar.
        (t.fuera > 0
          ? ` · ${t.fuera} ${t.fuera === 1 ? "día es" : "días son"} de trabajo fuera de la oficina: la persona trabajó (no marcó porque no estaba acá), no se descuenta y no genera extras`
          : ""),
        14, h - 8,
      );
      doc.text(`Página ${doc.getNumberOfPages()}`, w - 14, h - 8, { align: "right" });
    },
  });

  return doc;
}

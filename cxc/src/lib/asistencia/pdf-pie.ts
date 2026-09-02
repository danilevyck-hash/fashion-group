/* ─────────────────────────────────────────────────────────────────────────────
 * El PIE de los dos papeles que se firman: el Reporte de asistencia y la
 * Planilla. Una sola fuente para los dos.
 *
 * ── 🩸 POR QUÉ EXISTE ESTE ARCHIVO ───────────────────────────────────────────
 * `doc.text` de jsPDF NO envuelve solo: dibuja el string en una recta y lo que
 * pasa del borde de la hoja simplemente no se ve. No avisa, no corta, no falla.
 *
 * Medido el 1-sep-2026 sobre el PDF de verdad (los bytes, no el código):
 *   · Reporte, ancho útil 251,4 mm — el pie del caso base medía 218,3 mm (ya al
 *     límite) y con días corregidos + «trabajo fuera de la oficina» llegaba a
 *     464,6 mm. Se perdían 213 mm de texto: la mitad del aviso.
 *   · Planilla, ancho útil 335,6 mm — la línea de avisos llegaba a 491,4 mm.
 *
 * Lo que se perdía no era decoración. En el Reporte era justo el renglón que
 * explica que hay horas escritas a mano; en la Planilla, el que dice que a
 * alguien no se le pagaron sus horas extra. El papel se firma y se manda por
 * correo: un aviso cortado por la mitad es peor que no tenerlo, porque quien lo
 * lee cree que lo leyó entero.
 *
 * ── 🔴 LO QUE NO SE PUEDE ROMPER ─────────────────────────────────────────────
 * 1. NINGUNA línea del pie puede pasar del borde derecho de la hoja. Se parte
 *    con `splitTextToSize` —el mismo criterio que las guías, los reclamos y las
 *    notas de mobiliario— y se dibuja línea por línea.
 * 2. El pie CRECE HACIA ARRIBA, y lo que crece hay que reservarlo: `reservaMm`
 *    es lo que autoTable tiene que dejar libre abajo. Sin eso, un pie de tres
 *    líneas se mete adentro de la última fila de la tabla.
 * 3. El número de página se queda SOLO en el renglón de más abajo, a la
 *    derecha. Por eso el texto del pie se parte contra un ancho más corto
 *    (`ZONA_PAGINA_MM`): así ninguna línea puede pisarlo, mida lo que mida.
 *
 * Candado: `src/__tests__/lib/asistencia-pdf-pie-cabe-en-la-hoja.test.ts`, que
 * genera los dos PDF de verdad y mide cada string dibujado contra la hoja.
 * ────────────────────────────────────────────────────────────────────────── */

import type jsPDF from "jspdf";

/**
 * El alto de un renglón del pie. A 6,5–7 pt una línea mide ~2,5 mm de alto;
 * 2,8 deja el aire justo para que dos renglones seguidos se lean como dos.
 */
export const PIE_ALTO_LINEA_MM = 2.8;

/** El renglón de más abajo del pie, medido desde el borde inferior de la hoja. */
export const PIE_BASE_MM = 8;

/**
 * El ancho que se le guarda al «Página N» del extremo derecho.
 *
 * 🔴 El texto del pie se parte contra el ancho útil MENOS esto. «Página 12»
 * mide ~11 mm a 7 pt; 22 dan margen de sobra y, sobre todo, garantizan que el
 * número nunca quede debajo de una letra.
 */
const ZONA_PAGINA_MM = 22;

/** Un respiro entre la última fila de la tabla y el renglón más alto del pie. */
const RESPIRO_MM = 2;

/**
 * Lo que jspdf-autotable reserva abajo cuando nadie le dice nada: `40` dividido
 * por el factor de escala del documento (~14,1 mm). Se usa como PISO —y se
 * calcula, no se copia con un número redondo— para que un pie de una sola
 * línea, el caso de todos los días, pagine EXACTAMENTE igual que siempre.
 */
function reservaPorDefectoMm(doc: jsPDF): number {
  return 40 / doc.internal.scaleFactor;
}

export interface PieDePagina {
  /** Las líneas ya partidas, de arriba hacia abajo. Ninguna pasa del borde. */
  readonly lineas: readonly string[];
  /** Lo que autoTable tiene que dejar libre abajo para que quepan. */
  readonly reservaMm: number;
}

/**
 * Parte los párrafos del pie contra el ancho real de ESTA hoja.
 *
 * ⚠️ Hay que llamarla ANTES de `autoTable`: su `reservaMm` es lo que se le pasa
 * a la tabla como margen de abajo, y una tabla ya dibujada no se puede correr.
 *
 * @param parrafos Los avisos, en orden. Lo vacío o `null` se cae solo: un aviso
 *   que no aplica no deja un renglón en blanco en el papel.
 */
export function armarPie(
  doc: jsPDF,
  parrafos: readonly (string | null | undefined)[],
  fontSize: number,
  margen: number,
): PieDePagina {
  // El ancho se mide con la MISMA fuente con la que se va a dibujar: partir a
  // 7 pt lo que después se imprime a 9 devuelve líneas que igual se salen.
  doc.setFont("helvetica", "normal");
  doc.setFontSize(fontSize);
  const util = doc.internal.pageSize.getWidth() - margen * 2 - ZONA_PAGINA_MM;

  const lineas = parrafos
    .filter((p): p is string => typeof p === "string" && p.trim().length > 0)
    .flatMap((p) => doc.splitTextToSize(p, util) as string[]);

  return {
    lineas,
    reservaMm: Math.max(
      reservaPorDefectoMm(doc),
      PIE_BASE_MM + lineas.length * PIE_ALTO_LINEA_MM + RESPIRO_MM,
    ),
  };
}

/**
 * Dibuja el pie y el número de página. Va adentro del `didDrawPage` de la
 * tabla: se repite en TODAS las hojas, no solo en la última.
 *
 * El bloque se apoya en el renglón de abajo y crece hacia arriba, así que el
 * pie queda siempre pegado al borde inferior tenga una línea o tenga cuatro.
 */
export function dibujarPie(doc: jsPDF, pie: PieDePagina, fontSize: number, margen: number): void {
  const h = doc.internal.pageSize.getHeight();
  const w = doc.internal.pageSize.getWidth();
  doc.setFont("helvetica", "normal");
  doc.setFontSize(fontSize);
  doc.setTextColor(156, 163, 175);

  const abajo = h - PIE_BASE_MM;
  pie.lineas.forEach((linea, i) => {
    doc.text(linea, margen, abajo - (pie.lineas.length - 1 - i) * PIE_ALTO_LINEA_MM);
  });
  doc.text(`Página ${doc.getNumberOfPages()}`, w - margen, abajo, { align: "right" });
}

// ─────────────────────────────────────────────────────────────────────────────
// QUÉ DICE EL PAPEL DEL MES Y EL DEL AÑO — la matriz de Comisiones. (PURO)
//
// Daniel, 9-sep-2026: *«Los paso a PDF también, para que todo el módulo se
// comporte igual»*. Los dos botones de arriba —«Descargar el mes» y «Descargar
// el año»— bajaban por el DIÁLOGO de imprimir del navegador; ahora bajan un PDF
// armado por el sistema, igual que el reporte de un vendedor.
//
// 🔴 ACÁ NO SE SUMA NADA. Este módulo describe la FORMA del papel —qué es una
// columna, qué es una fila, cómo se titula, si va parado o acostado— y nada
// más. Las filas y los totales llegan **ya calculados por la vista**, que es la
// dueña del cálculo: son las MISMAS que están en pantalla y el MISMO pie
// (`sumarPagable`). Ni una operación aritmética en todo el archivo — poner una
// acá sería la segunda cuenta del mismo número.
//
// 🔑 Es el mismo reparto que ya usa el reporte de un vendedor:
// `reporte-comision.ts` decide y `pdf-comision.ts` dibuja. Acá,
// `tabla-papel.ts` decide y `pdf-tabla-comisiones.ts` dibuja.
// ─────────────────────────────────────────────────────────────────────────────

/** Una columna del papel. Los números van a la derecha; los nombres, a la izquierda. */
export interface ColumnaPapel {
  header: string;
  numerica?: boolean;
}

/** Un renglón, ya formateado por la vista (`fmtMoney`, `—`…). */
export interface FilaPapel {
  celdas: string[];
  /** Se pinta en gris: los que se calculan y NO se pagan (Oficina y Daniel Levy). */
  apagada?: boolean;
}

/** El papel completo: lo que la vista le entrega al dibujante. */
export interface TablaPapel {
  /** `Comisiones — Fashion Group` · `Comisiones — Vistana`. */
  titulo: string;
  /** `Agosto 2026` · `Todo 2026` — sale de `etiquetaPeriodo`, nunca se escribe. */
  subtitulo: string;
  columnas: ColumnaPapel[];
  filas: FilaPapel[];
  /** La línea de abajo, tal cual el pie de la tabla en pantalla. */
  totales: string[];
}

/**
 * El título del papel de la matriz completa.
 *
 * 🔴 Dice «Fashion Group» y NO «Todas las empresas»: son las 6 del grupo, y
 * Multifashion nunca entra —se calcula distinto y no se suma jamás—. Es el
 * mismo rótulo que el selector de arriba (Daniel: *«en todas pon fashion group
 * para no confundir»*).
 */
export const TITULO_PAPEL_GRUPO = "Comisiones — Fashion Group";

/** El título del papel de UNA empresa, con su nombre CORTO (diccionario § 0). */
export function tituloPapelEmpresa(empresaNombre: string): string {
  return `Comisiones — ${empresaNombre}`;
}

/**
 * ¿El papel va parado o acostado? Se DERIVA de cuántas columnas lleva, nunca se
 * escribe a mano por pantalla.
 *
 * La matriz del grupo son 8 columnas (vendedor + las 6 + Total) y no entra
 * parada; la de una empresa son 6 y entra de sobra. El día que nazca la séptima
 * empresa el papel se acuesta solo — que es justo lo que una bandera escrita a
 * mano no haría.
 */
export const MAX_COLUMNAS_PARADO = 6;

export function orientacionPapel(cuantasColumnas: number): "portrait" | "landscape" {
  return cuantasColumnas > MAX_COLUMNAS_PARADO ? "landscape" : "portrait";
}

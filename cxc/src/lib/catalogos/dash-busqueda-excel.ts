// ─────────────────────────────────────────────────────────────────────────────
// Hoja "DASHBOARD DE BUSQUEDA" — réplica de la plantilla del banco de fotos B2B
// (`Dash Search Template.xlsx`, la que mandó Daniel el 28-jul-2026).
//
// PARA QUÉ: el botón "Excel sin foto" del admin de catálogos tiene que producir
// un archivo que se pueda usar DIRECTO en el portal B2B, sin copiar y pegar los
// códigos a mano en la plantilla del proveedor. Daniel, textual:
//   "quiero que al descargar los codigos de fotos sin excel, se me ponga en
//    orden de a-z en la columna b, para que asi se me descargue automatico
//    (los numeros que aparecen en el excel no deberian de estar ahi, es solo
//    la muestra)".
//
// ESTRUCTURA DE LA PLANTILLA (medida sobre el archivo real, no supuesta):
//   · Hoja "DASHBOARD DE BUSQUEDA".
//   · B1 = "INSERTE ARTICLE NUMBER AQUÍ (máximo 200)", fondo naranja FFC000.
//   · D1 = "COPIAR ", fondo naranja, combinada D1:K1.
//   · A2:A201 = contador 1..200.  B2:B201 = los códigos (200 filas).
//   · D2 = la expresión de búsqueda `"cod" OR "cod" OR …`, combinada D2:K17.
//     En la plantilla es una fórmula que apunta a una hoja auxiliar "DATA "
//     (A='"', B=código, C='"', D=" OR ", E=CONCAT acumulado). Acá se escribe
//     YA RESUELTA como texto: el archivo sirve recién abierto, sin recalcular
//     y sin arrastrar la hoja auxiliar.
//   · Anchos: A=4, B=52.78, C=8.89, D=85.11.
// Los ART Number de muestra de la plantilla NO se copian (son la muestra).
//
// Módulo PURO (solo xlsx-js-style): testeable sin browser.
// ─────────────────────────────────────────────────────────────────────────────

import type XLSX from "xlsx-js-style";
import { ordenarCodigosAZ } from "./fotos-faltantes";

export { ordenarCodigosAZ };

/** Nombre de la hoja principal — igual que en la plantilla del proveedor. */
export const HOJA_DASH = "DASHBOARD DE BUSQUEDA";

/** Tope de códigos por búsqueda que impone el portal (dice "máximo 200" en la
 *  plantilla). Con más códigos se reparten en hojas de 200. */
export const MAX_POR_HOJA = 200;

const NARANJA = "FFC000";
const ENCABEZADO_B = "INSERTE ARTICLE NUMBER AQUÍ (máximo 200)";
const ENCABEZADO_D = "COPIAR ";

/** `"A" OR "B" OR "C"` — lo que se pega en la barra de búsqueda del portal. */
export function expresionOr(codigos: readonly string[]): string {
  return codigos.map((c) => `"${c}"`).join(" OR ");
}

/** Reparte los códigos en bloques del tope del portal (200). */
export function bloquesDeCodigos(codigos: readonly string[], max: number = MAX_POR_HOJA): string[][] {
  if (codigos.length === 0) return [[]];
  const out: string[][] = [];
  for (let i = 0; i < codigos.length; i += max) out.push(codigos.slice(i, i + max));
  return out;
}

/** Nombre de la hoja del bloque `i` (0-based). El primero conserva el nombre
 *  exacto de la plantilla; los siguientes van numerados. */
export function nombreHoja(i: number): string {
  return i === 0 ? HOJA_DASH : `${HOJA_DASH} ${i + 1}`;
}

const enc = (v: string): XLSX.CellObject => ({
  v,
  t: "s",
  s: { font: { bold: true, sz: 11 }, fill: { fgColor: { rgb: NARANJA } }, alignment: { vertical: "center" } },
});

/**
 * Construye UNA hoja con la forma de la plantilla para un bloque de códigos.
 * Los códigos van como TEXTO a propósito: hay SKU con ceros a la izquierda y
 * con guiones (Tommy), y convertirlos a número los rompería.
 */
export function buildDashBusquedaSheet(codigos: readonly string[]): XLSX.WorkSheet {
  const ws: XLSX.WorkSheet = {};

  ws.B1 = enc(ENCABEZADO_B);
  ws.D1 = enc(ENCABEZADO_D);

  codigos.forEach((codigo, i) => {
    const fila = i + 2; // los códigos arrancan en la fila 2 (fila 1 = encabezado)
    ws[`A${fila}`] = { v: i + 1, t: "n" };
    ws[`B${fila}`] = { v: codigo, t: "s" };
  });

  // La expresión resuelta, en la misma celda combinada que la plantilla.
  ws.D2 = {
    v: expresionOr(codigos),
    t: "s",
    s: { alignment: { vertical: "top", wrapText: true } },
  };

  const ultimaFila = Math.max(2, codigos.length + 1);
  ws["!ref"] = `A1:K${Math.max(ultimaFila, 17)}`;
  ws["!merges"] = [
    { s: { r: 0, c: 3 }, e: { r: 0, c: 10 } },  // D1:K1
    { s: { r: 1, c: 3 }, e: { r: 16, c: 10 } }, // D2:K17
  ];
  ws["!cols"] = [{ wch: 4 }, { wch: 52.78 }, { wch: 8.89 }, { wch: 85.11 }];
  return ws;
}

/**
 * Hojas listas para `workbookFromSheets`: los códigos ya ordenados A-Z y
 * repartidos en bloques de 200. Siempre devuelve al menos una hoja (aunque no
 * haya códigos) para que el archivo nunca salga sin la hoja de la plantilla.
 */
export function buildDashBusquedaSheets(
  codigos: readonly (string | null | undefined)[],
): { name: string; ws: XLSX.WorkSheet }[] {
  const ordenados = ordenarCodigosAZ(codigos);
  return bloquesDeCodigos(ordenados).map((bloque, i) => ({
    name: nombreHoja(i),
    ws: buildDashBusquedaSheet(bloque),
  }));
}

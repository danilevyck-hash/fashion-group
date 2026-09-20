// ─────────────────────────────────────────────────────────────────────────────
// EL PAPEL DE LA GUÍA — UNA CASILLA VACÍA SALE CON RAYA PARA ESCRIBIRLA A MANO.
// (módulo PURO: sin React, sin jsPDF, sin fetch)
//
// 🩸 Daniel, 19-sep-2026: la casilla **PLACA / VEHÍCULO** salía en blanco
// cuando la guía todavía no tenía placa —que es el caso normal: el papel se
// imprime ANTES de que llegue el camión— y el renglón se leía como un hueco,
// no como algo que hay que llenar. En el resto del papel esa diferencia ya
// existía: las casillas de NOMBRE, CÉDULA y FIRMA vacías ya salen con una raya
// más marcada, porque son las que alguien completa con un bolígrafo.
//
// 🔴 LA REGLA, y vale para los DOS papeles: si la casilla del encabezado no
// trae valor, su raya sale MARCADA (la de escribir a mano); si trae valor, la
// raya sigue siendo la fina de siempre. **Nada se esconde y nada se inventa**:
// la casilla se dibuja igual, cambia solo el grosor de la línea.
//
// ⚠️ Vive en `lib/` y no junto al papel porque los DOS lo necesitan
// (`PrintDocument.tsx` y `pdf-guia.ts`), y `lib/` no puede importar de `app/`.
// Una sola función para que las dos hojas no se puedan separar.
// ─────────────────────────────────────────────────────────────────────────────

/** El gris de una raya con valor escrito arriba (la fina de siempre). */
export const RAYA_CON_VALOR = "border-gray-300";

/** El gris de una raya PARA ESCRIBIR A MANO — el mismo de las firmas. */
export const RAYA_A_MANO = "border-gray-400";

/** El mismo par, en el gris de jsPDF (0-255): cuanto más chico, más oscuro. */
export const TINTA_RAYA_CON_VALOR = 200;
export const TINTA_RAYA_A_MANO = 150;

/** ¿Esta casilla del encabezado sale vacía y hay que escribirla a mano? */
export function casillaEnBlanco(valor: string | null | undefined): boolean {
  return String(valor ?? "").trim() === "";
}

/** La clase de la raya de una casilla del encabezado (la hoja que se imprime). */
export function rayaDeLaCasilla(valor: string | null | undefined): string {
  return casillaEnBlanco(valor) ? RAYA_A_MANO : RAYA_CON_VALOR;
}

/** El gris de la raya de una casilla del encabezado (el PDF que se comparte). */
export function tintaDeLaCasilla(valor: string | null | undefined): number {
  return casillaEnBlanco(valor) ? TINTA_RAYA_A_MANO : TINTA_RAYA_CON_VALOR;
}

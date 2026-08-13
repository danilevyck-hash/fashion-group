/**
 * Lo que TODO CSV contable de Switch comparte: montos, textos y códigos de cuenta.
 *
 * 🩸 POR QUÉ VIVE ACÁ Y NO EN `lib/mayor/`. Estos tres helpers nunca fueron "del
 * mayor": son del formato en que Switch exporta contabilidad, y estaban en la
 * carpeta del mayor solo porque el mayor llegó primero. Cuando el mayor se
 * retiró (13-ago-2026), **Egresos Varios seguía dependiendo de ellos** —
 * `egresos/parser.ts` y `egresos/leer.ts`— así que borrar esa carpeta sin
 * mudarlos habría roto la única fuente de gasto que queda.
 *
 * ⚠️ NO SE REESCRIBIERON: son EXACTAMENTE los mismos cuerpos, movidos. Volver a
 * escribir `montoACentavos` habría sido estrenar una segunda forma de leer un
 * monto — y su modo de fallo es un gasto perdido en silencio.
 */

/** Colapsa espacios repetidos y recorta. `" ASIENTO  VENTA "` → `"ASIENTO VENTA"`. */
export function normalizarTexto(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/** Un código de cuenta válido de Switch: 5 segmentos numéricos. */
export const CUENTA_RE = /^\d+(?:\.\d+){4}$/;

/**
 * Convierte un monto del CSV a CENTAVOS enteros.
 *
 * Acepta `"1695.86"`, `"1,695.86"` (miles con coma), `"(69.30)"` (paréntesis =
 * negativo, convención contable) y vacío = 0. Devuelve `null` si no lo entiende
 * — y entonces la línea se REPORTA como error en vez de contarse como 0, que
 * sería un gasto perdido en silencio.
 */
export function montoACentavos(raw: string): number | null {
  let s = normalizarTexto(raw);
  if (s === "" || s === "-") return 0;

  let negativo = false;
  const paren = s.match(/^\((.*)\)$/);
  if (paren) {
    negativo = true;
    s = paren[1].trim();
  }
  if (s.startsWith("-")) {
    negativo = !negativo;
    s = s.slice(1).trim();
  }
  s = s.replace(/^\$/, "").trim();

  // Miles con coma y decimales con punto: 1,695.86 / 12,345,678.90
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, "");
  // Una sola coma decimal (por si alguna empresa exporta en formato europeo).
  else if (/^\d+,\d{1,2}$/.test(s)) s = s.replace(",", ".");
  // Cualquier otra coma es ambigua → no adivinar.
  else if (s.includes(",")) return null;

  if (!/^\d+(\.\d+)?$/.test(s)) return null;

  // A centavos SIN pasar por float: parte entera y decimales por separado.
  const [ent, dec = ""] = s.split(".");
  const centStr = (dec + "00").slice(0, 2);
  const cent = Number(ent) * 100 + Number(centStr);
  if (!Number.isSafeInteger(cent)) return null;
  return negativo ? -cent : cent;
}

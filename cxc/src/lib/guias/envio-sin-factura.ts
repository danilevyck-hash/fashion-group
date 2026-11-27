// ─────────────────────────────────────────────────────────────────────────────
// NUEVA GUÍA › «ENVÍO SIN FACTURA» (26-nov-2026, `GUIA_ENVIO_SIN_FACTURA_2026_11`).
//
// Medido 26-ago → 26-nov-2026: 22 renglones sin factura; 20 con «0000» tecleado
// en «Escribir a mano» (el sistema lo tomaba como factura y en el papel salía
// en blanco) y 2 con «+ Agregar traslado». Lo que iba solo se decía en
// Observaciones, texto libre.
//
// Daniel definió:
//   · UN botón «Envío sin factura» junto a «+ Agregar factura» (reemplaza
//     «+ Agregar traslado»).
//   · «Qué lleva»: texto abierto y obligatorio; debajo, sugerencias que se
//     TOCAN (nunca se aplican solas).
//   · Empresa OBLIGATORIA (de quién es la mercancía, Boston incluida); «Ninguna»
//     solo para documentos o sobres.
//   · «0000» deja de valer como factura: «Usa Envío sin factura». Lo viejo no
//     se toca.
//   · En el papel: «Sin factura · <qué lleva>». El Telegram no cambia (no lee
//     las facturas).
//
// 🔴 SIN MIGRACIÓN: se guarda en el MISMO campo `facturas`, como `Traslado`, así
// que sale tal cual en el papel, el PDF y el Excel.
//
// 🔴 `false` = Nueva guía como estaba el 25-nov-2026.
// ─────────────────────────────────────────────────────────────────────────────

/** 🔴 PRENDIDO el 26-nov-2026: Daniel aprobó las capturas (HOY vs RECOMENDACIÓN).
 *  ⚠️ El chip «Traslado» de Etiquetas NO cuelga de aquí (ver postmortem de guías). */
export const GUIA_ENVIO_SIN_FACTURA_2026_11 = true;

export const BOTON_ENVIO_SIN_FACTURA = "Envío sin factura";
export const CHIP_SIN_FACTURA = "Sin factura";
export const AVISO_USA_SIN_FACTURA = "«0000» no es una factura: usa «Envío sin factura»";
export const MAX_QUE_LLEVA = 60;

/** Los ejemplos que dio Daniel; se tocan, nunca se aplican solos. */
export const SUGERENCIAS_QUE_LLEVA = [
  "Traslado a American Classics",
  "Mobiliario",
  "Material POP",
  "Muestras",
  "Mercancía de Boston",
  "Documentos",
] as const;

const PREFIJO = "Sin factura";
const SEPARADOR = " · ";

/** Lo escrito, limpio: bordes, espacios juntos y sin comas (la coma separa facturas). */
export function limpiarQueLleva(v: string): string {
  return v.replace(/,/g, " /").replace(/\s+/g, " ").trim().slice(0, MAX_QUE_LLEVA);
}

/** El valor del campo `facturas` del renglón: «Sin factura · Mobiliario Tommy». */
export function facturasSinFactura(queLleva: string): string {
  const t = limpiarQueLleva(queLleva);
  return t ? `${PREFIJO}${SEPARADOR}${t}` : PREFIJO;
}

/** ¿El campo `facturas` es un envío sin factura? Por el prefijo exacto, nunca por parecido. */
export function esSinFactura(v: string | null | undefined): boolean {
  const t = (v ?? "").trim();
  return t === PREFIJO || t.startsWith(`${PREFIJO}${SEPARADOR}`);
}

/** «Sin factura · Mobiliario» → «Mobiliario». */
export function queLlevaDe(v: string | null | undefined): string {
  return esSinFactura(v) ? (v ?? "").trim().slice(PREFIJO.length + SEPARADOR.length).trim() : "";
}

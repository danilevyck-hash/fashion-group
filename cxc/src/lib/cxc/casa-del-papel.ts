// ─────────────────────────────────────────────────────────────────────────────
// QUIÉN FIRMA LO QUE RECIBE EL CLIENTE (9-sep-2026).
//
// Daniel, textual, al decidir prender el correo de Confecciones Boston:
// *«Firma Confecciones Boston»*.
//
// 🔴 LA FIRMA NO SE ELIGE EN CADA LLAMADA: SE DERIVA DE LA EMPRESA ACREEDORA.
// El papel y el correo del grupo llevan el logo de Fashion Group, el pie
// «Confidencial · fashiongr.com» y la firma «Fashion Group Panamá». Ese mismo
// papel mandado a un cliente de Boston le diría que le cobra una empresa que no
// le vendió nada. Un parámetro `casa` con valor por defecto arregla hoy y deja
// el defecto para mañana: el día que alguien arme un papel sin pasarlo, sale
// firmado por Fashion Group. Por eso la casa se PREGUNTA por `empresa_key`, que
// es un dato que el papel ya tiene en la mano.
//
// 🔴 LO QUE NO SE SABE NO SE INVENTA NI SE PRESTA. Confecciones Boston no tiene
// logo cargado en el sistema, así que su papel sale SIN logo — nunca con el de
// otra casa. Es la misma regla de `empresa-fiscal.ts`.
//
// ⚠️ El correo sale igual por Resend, que solo tiene verificado el dominio
// `fashiongr.com`: lo que cambia es el NOMBRE que se lee («Confecciones
// Boston»), no la dirección técnica. Verificar un dominio propio de Boston es
// una decisión pendiente de Daniel.
// ─────────────────────────────────────────────────────────────────────────────

import { FG_LOGO_BASE64, FG_LOGO_WIDTH, FG_LOGO_HEIGHT } from "@/lib/pdf-logo";

export interface LogoDelPapel {
  base64: string;
  width: number;
  height: number;
}

export interface CasaDelPapel {
  /** Nombre corto de la casa, como se lee. */
  nombre: string;
  /** Logo del encabezado. `null` = esta casa no tiene, y sale sin ninguno. */
  logo: LogoDelPapel | null;
  /** El renglón gris del pie de cada hoja, después de la fecha. */
  pie: string;
  /** El `from` del correo: nombre visible + dirección verificada en Resend. */
  remitente: string;
  /** La segunda línea de la firma, debajo del nombre de quien manda. */
  firma: string;
  /** El rótulo del encabezado del correo (la banda negra de arriba). */
  membrete: string;
}

export const CASA_GRUPO: CasaDelPapel = Object.freeze({
  nombre: "Fashion Group",
  logo: { base64: FG_LOGO_BASE64, width: FG_LOGO_WIDTH, height: FG_LOGO_HEIGHT },
  pie: "Confidencial · fashiongr.com",
  remitente: "Fashion Group <cobros@fashiongr.com>",
  firma: "Fashion Group Panamá",
  membrete: "FASHION GROUP",
});

export const CASA_BOSTON: CasaDelPapel = Object.freeze({
  nombre: "Confecciones Boston",
  // Sin logo: el sistema no tiene el de Boston, y el de Fashion Group no es suyo.
  logo: null,
  // Sin el dominio del grupo: el cliente de Boston no le compra a fashiongr.com.
  pie: "Confidencial",
  remitente: "Confecciones Boston <cobros@fashiongr.com>",
  firma: "Confecciones Boston",
  membrete: "CONFECCIONES BOSTON",
});

/**
 * Las empresas que NO firman como Fashion Group, una por una y escritas.
 *
 * 🔴 La lista es EXPLÍCITA a propósito. Derivarla de `empresasCarteraAparte()`
 * (hoy, solo Boston) haría que una empresa nueva de cartera aparte heredara el
 * membrete de Boston sin que nadie lo decida. Hay candado que exige que toda
 * empresa de cartera aparte esté nombrada acá.
 */
const CASA_POR_EMPRESA: Readonly<Record<string, CasaDelPapel>> = Object.freeze({
  confecciones_boston: CASA_BOSTON,
});

/** Quién firma el papel de ESTA empresa. Lo que no está en la lista es del grupo. */
export function casaDeEmpresa(empresaKey: string): CasaDelPapel {
  return CASA_POR_EMPRESA[empresaKey] ?? CASA_GRUPO;
}

/**
 * Quién firma un papel que abarca varias empresas.
 *
 * 🔴 Con UNA sola casa que no sea la del grupo, manda ésa. Boston nunca convive
 * con el grupo en el mismo papel —hay candados en las dos direcciones—, así que
 * una mezcla sería un defecto; y ante un defecto se elige el lado que NO estampa
 * Fashion Group encima de la plata de otro.
 */
export function casaDeEmpresas(empresaKeys: readonly string[]): CasaDelPapel {
  for (const key of empresaKeys) {
    const casa = CASA_POR_EMPRESA[key];
    if (casa) return casa;
  }
  return CASA_GRUPO;
}

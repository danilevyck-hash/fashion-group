// ============================================================================
// Marketing — EL INTERRUPTOR de la pieza (D) del rediseño (22-sep-2026).
//
// Tres cosas cuelgan de acá, y las tres se apagan juntas poniéndolo en `false`:
//
//   1. IMPULSADORAS — la tarjeta lista TODOS los meses sin pagar desde el
//      primer pago, el más viejo arriba. Apagado: los DOS chips de siempre
//      (mes anterior · mes actual), que es lo que esconde un mes viejo.
//   2. EL EXCEL QUE LEE LA MARCA — sin la nota interna, sin el nombre de las
//      empresas del grupo en el concepto y con UNA sola grafía por proveedor;
//      y solo lo que `se_reporta`. Apagado: el archivo de hoy, tal cual.
//   3. LOS LINKS FIRMADOS del ZIP — 30 días (Daniel, 22-sep-2026). Apagado:
//      el año de siempre.
//
// 🔴 ES UN INTERRUPTOR DE PANTALLA Y DE PAPEL, NO DE DATOS. Nada de lo que se
// GUARDA cambia de forma en ninguno de los dos estados: los montos, los
// conceptos y los proveedores siguen en la base exactamente como se
// escribieron. La limpieza ocurre al ARMAR el papel que sale de la casa — que
// es, además, lo que Daniel pidió: *«no elimines ni modifiques nada, deja que
// secretaria lo haga cuando rediseñemos»*.
// ============================================================================

/** El interruptor de la pieza (D). Hoy `true`. */
export const ZIP_E_IMPULSADORAS_NUEVO = true;

/** Lo que Daniel pidió el 22-sep-2026: 30 días. */
export const TTL_LINK_ZIP_SEGUNDOS = 60 * 60 * 24 * 30;

/** Lo de antes: un año. Solo se usa con el interruptor apagado. */
export const TTL_LINK_ZIP_VIEJO_SEGUNDOS = 60 * 60 * 24 * 365;

/** Cuánto dura un link firmado del ZIP, según el interruptor. */
export function ttlDeLinkDelZip(): number {
  return ZIP_E_IMPULSADORAS_NUEVO
    ? TTL_LINK_ZIP_SEGUNDOS
    : TTL_LINK_ZIP_VIEJO_SEGUNDOS;
}

/** Dónde se guarda el ZIP que se bajó, dentro del bucket privado `marketing`. */
export function pathDelZipGuardado(periodoId: string, fechaISO: string): string {
  return `periodos/${String(periodoId).trim()}/${String(fechaISO).slice(0, 10)}.zip`;
}

/**
 * ¿Es un path del bucket `marketing` que se puede volver a firmar?
 *
 * 🔴 SOLO ADENTRO DEL BUCKET. Se rechaza lo vacío, lo absoluto, lo que trae
 * `..` y lo que trae `://`: firmar lo que llegue convertiría la puerta de
 * «volver a firmar» en una llave maestra de Storage.
 */
export function esPathFirmable(valor: unknown): boolean {
  const p = String(valor ?? "").trim();
  if (p.length === 0 || p.length > 500) return false;
  if (p.startsWith("/") || p.includes("..") || p.includes("://")) return false;
  return true;
}

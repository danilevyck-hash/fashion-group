// ─────────────────────────────────────────────────────────────────────────────
// RECLAMOS — cómo se LEEN dos textos que se GUARDAN de otra forma (puro).
//
// · El motivo se tecleó de 14 formas para 5 problemas («sobrante», «FALTANTE»,
//   «Mercancía manchada»). En pantalla se capitaliza; lo guardado no se toca.
// · La nota automática del correo dice «Correo con Excel adjunto enviado a
//   iamar@aswgr.com (16 reclamos)» con autor «Sistema». En pantalla se lee
//   «Correo enviado a iamar@aswgr.com» (mockup del 11-sep-2026); la fecha y la
//   hora las pone el seguimiento al lado. Las notas nuevas ya nacen cortas.
// ─────────────────────────────────────────────────────────────────────────────

/** «sobrante» → «Sobrante»; «FALTANTE» → «Faltante»; «Mercancía manchada» se queda. */
export function motivoEnPantalla(motivo: string | null | undefined): string {
  const m = (motivo ?? "").trim();
  if (!m) return "";
  const cuerpo = m === m.toUpperCase() ? m.toLowerCase() : m;
  return cuerpo.charAt(0).toUpperCase() + cuerpo.slice(1);
}

const NOTA_CORREO_VIEJA = /^Correo con .+? adjunto enviado a (.+?)(?: · CC: (.+?))? \(\d+ reclamos?\)$/;

/** La nota de seguimiento como se lee: la automática del correo, acortada. */
export function notaEnPantalla(nota: string, autor: string): { texto: string; autor: string | null } {
  const m = nota.match(NOTA_CORREO_VIEJA);
  if (m) return { texto: `Correo enviado a ${m[1]}${m[2] ? ` (copia a ${m[2]})` : ""}`, autor: null };
  if (/^Correo enviado a /.test(nota)) return { texto: nota, autor: null };
  return { texto: nota, autor: autor || null };
}

/** La nota que el sistema escribe al mandar el correo (corta desde el 11-sep-2026). */
export function notaCorreoEnviado(destinatarios: readonly string[], cc: readonly string[]): string {
  return `Correo enviado a ${destinatarios.join(", ")}${cc.length ? ` (copia a ${cc.join(", ")})` : ""}`;
}

/**
 * 🔴 «CREADO EL» SOLO SI APORTA ALGO (20-sep-2026).
 *
 * 🩸 La cabecera del reclamo imprimía la MISMA fecha dos veces —«26 ago 2026 ·
 * American Fashion Wear · 25 días · creado el 26 ago 2026»— en **14 de los 33
 * reclamos vivos**. No es casualidad: la migración `20261114120000` les puso a
 * los 29 viejos `fecha_factura` = su `fecha_reclamo`, y a un reclamo que se
 * carga el mismo día de la factura le pasa igual.
 *
 * El mockup del 11-sep ya decía que la OC y «creado el» van *«solo si aportan»*.
 * Una fecha repetida no aporta: hace leer dos veces para descubrir que dicen lo
 * mismo.
 *
 * ⚠️ Cuando las fechas SÍ son distintas, «creado el» se queda: ahí sí dice algo
 * (cuánto tardó en cargarse el reclamo). Y sin fecha de factura también se
 * queda: es la única fecha que hay.
 */
export function seDiceCreadoEl(
  fechaFactura: string | null | undefined,
  createdAt: string | null | undefined,
): boolean {
  const creado = (createdAt ?? "").slice(0, 10);
  if (!creado) return false;
  return creado !== (fechaFactura ?? "").slice(0, 10);
}

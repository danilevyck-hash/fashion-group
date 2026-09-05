// ─────────────────────────────────────────────────────────────────────────────
// «LE ENVIASTE EL ESTADO DE CUENTA HACE N DÍAS» — el rastro de lo que se mandó.
// Módulo PURO: los textos y la ventana, sin base de datos.
//
// 🩸 QUÉ HABÍA. Solo el CORREO dejaba rastro (`cxc_emails_enviados`), y medido
// el 5-sep-2026 son **19 correos en toda la historia del sistema, todos entre
// el 9 y el 14 de julio de 2026**. WhatsApp y «copiar el mensaje» —que es como
// se cobra de verdad— no dejaban ninguno, así que la pantalla no podía decir
// si a ese cliente ya le habían escrito ayer.
//
// 🔴 LAS PALABRAS NO SON LAS MISMAS PARA LOS TRES. Daniel fue explícito: si lo
// último fue un COPIAR, no se puede decir «le enviaste» — copiar el mensaje no
// se lo manda a nadie. Por eso `textoUltimoEnvio` mira el canal.
// ─────────────────────────────────────────────────────────────────────────────

/** Los tres canales que dejan rastro. Lista cerrada. */
export const CANALES_ENVIO = ["correo", "whatsapp", "copia"] as const;
export type CanalEnvio = (typeof CANALES_ENVIO)[number];

/** Cuántos días se muestra la marca antes de apagarse sola. */
export const VENTANA_MARCA_DIAS = 7;

export function esCanalEnvio(v: unknown): v is CanalEnvio {
  return typeof v === "string" && (CANALES_ENVIO as readonly string[]).includes(v);
}

/** «hace 3 días» / «ayer» / «hoy» — la forma que ya usa el resto del módulo. */
function haceCuanto(dias: number): string {
  if (dias <= 0) return "hoy";
  if (dias === 1) return "ayer";
  return `hace ${dias} días`;
}

/**
 * La marca gris de la fila. `null` = no se dibuja nada: no hay envío, o el que
 * hay ya pasó la ventana de 7 días.
 *
 * 🔴 «Copiaste el mensaje» y «Le enviaste el estado de cuenta» son frases
 * distintas a propósito: copiar no le llegó a nadie.
 */
export function textoUltimoEnvio(canal: CanalEnvio | null, dias: number | null): string | null {
  if (!canal || dias === null || dias < 0 || dias > VENTANA_MARCA_DIAS) return null;
  const cuando = haceCuanto(dias);
  if (canal === "copia") return `Copiaste el mensaje ${cuando}`;
  return `Le enviaste el estado de cuenta ${cuando}`;
}

/** Días entre el envío y hoy (los dos `YYYY-MM-DD`). `null` si no hay fecha. */
export function diasDesdeEnvio(fechaEnvio: string | null | undefined, hoy: string): number | null {
  if (!fechaEnvio) return null;
  const a = Date.parse(`${fechaEnvio.slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${hoy.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

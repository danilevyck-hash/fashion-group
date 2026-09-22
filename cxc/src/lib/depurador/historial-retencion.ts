// ─────────────────────────────────────────────────────────────────────────────
// Cuánto dura el Excel del Historial, y cómo se dice. Módulo PURO (22-sep-2026).
//
// 🩸 Nació de un error: `textoRetencion` vivía junto al cliente de Storage, en
// `historial-archivos.ts`, que importa `supabase-server`. La PANTALLA lo
// importó para no volver a escribir el plazo a mano y se arrastró el cliente
// de servidor al navegador — cinco pruebas de componentes se cayeron de una.
//
// Por eso el número y su rótulo viven APARTE, sin una sola importación: los
// leen la pantalla, la ruta y el cron, y ninguno paga por el otro.
// ─────────────────────────────────────────────────────────────────────────────

/** Cuántos días se puede volver a bajar el Excel. Daniel dijo «que el archivo
 *  dure 90 días» el 4-sep-2026 y «sí» a subirlo a un año el 22-sep-2026, una
 *  vez medido que son ~21 MB al año y que no tocan la base. */
export const RETENCION_ARCHIVO_DIAS = 365;

/** Cómo se dice la retención en pantalla. 🔴 El rótulo se DERIVA del número:
 *  estaba escrito a mano («por 90 días») y el día que el número se movió a un
 *  año la pantalla siguió prometiendo 90. Un solo lugar, y no vuelve a mentir. */
export function textoRetencion(dias: number = RETENCION_ARCHIVO_DIAS): string {
  if (dias === 365) return "un año";
  if (dias % 365 === 0) return `${dias / 365} años`;
  return `${dias} días`;
}

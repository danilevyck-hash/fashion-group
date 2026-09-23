// ─────────────────────────────────────────────────────────────────────────────
// EL RASTRO DE LA CONFIGURACIÓN DE COMISIONES — lo escribe el SERVIDOR.
//
// Cada ruta que cambia una tasa, un cliente que no comisiona, un descuento o el
// interruptor mensual de un descuento anota QUIÉN, QUÉ y CUÁNDO en
// `activity_logs`, DESPUÉS de que la base confirmó la escritura. Ver `rastro.ts`
// para el porqué (medido: 0 filas de Comisiones en 90 días).
//
// ⚠️ Anotar NUNCA tira la ruta: si el registro falla, `logActivity` lo dice en
// el log del servidor y la respuesta sale igual.
// ─────────────────────────────────────────────────────────────────────────────

import { logActivity } from "@/lib/log-activity";
import type { SessionPayload } from "@/lib/requireRole";
import { MODULO_ACTIVIDAD_COMISIONES } from "./rastro";

/**
 * Anota un cambio de configuración. `detalle` dice qué cambió (vendedor,
 * empresa, monto…); el nombre de quien lo hizo va aparte.
 */
export async function anotarConfigComision(
  auth: Pick<SessionPayload, "role" | "userName">,
  accion: string,
  detalle: Record<string, unknown>,
): Promise<void> {
  try {
    await logActivity(auth.role, accion, MODULO_ACTIVIDAD_COMISIONES, detalle, auth.userName);
  } catch {
    // `logActivity` ya dice el error; acá solo se garantiza que no se propague.
  }
}

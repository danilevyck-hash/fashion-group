// Lógica core del cron cheques-alert, extraída del route para poder llamarla
// IN-PROCESS desde la reconciliación (recuperación sin self-fetch), igual que
// sync-clientes-master. NO registra heartbeat ni logCronError: eso es del
// caller (route u orquestador). Es READ-ONLY (query + Telegram) — no muta data.
//
// Acá vive SOLO el I/O. Las fechas y la redacción del mensaje viven en
// `cheques-aviso-ventana.ts`, que es puro: ahí está explicada la regla del
// "día hábil anterior" (el viernes cubre sábado, domingo y lunes) y la
// limitación conocida de los feriados de Panamá.

import { supabaseServer } from "@/lib/supabase-server";
import { enviarNegocio } from "@/lib/alertas/canal";
import {
  fechaPanama,
  ventanaAviso,
  construirMensaje,
  inicioDiaPanamaIso,
  type ChequePorVencer,
} from "@/lib/cheques-aviso-ventana";

/** Nombre del heartbeat — el mismo que registra el route. Es la llave del
 *  candado anti-duplicado. */
export const CHEQUES_ALERT_CRON = "cheques-alert";

/**
 * ¿Ya salió el aviso de hoy? El candado anti-duplicado.
 *
 * El cron puede correr más de una vez el mismo día: un reintento de Vercel, o
 * la recuperación de `switch-reconciliacion` (que lo re-ejecuta si no ve un
 * success). Daniel no puede recibir el mismo aviso dos veces, así que la fuente
 * de verdad es el heartbeat que el route ya escribía: si hay un success
 * posterior al inicio del día PANAMÁ, esta corrida no manda nada.
 *
 * **Fail-OPEN a propósito**: si la lectura falla, devuelve `false` y el aviso
 * sale igual. Un aviso repetido es molesto; un cheque que se pasa sin avisar
 * cuesta plata. Es la misma postura de `cronSuccessHoyUtc`.
 */
async function yaAvisoHoy(hoy: string): Promise<boolean> {
  try {
    const { data, error } = await supabaseServer
      .from("cron_heartbeats")
      .select("last_success_at")
      .eq("cron_name", CHEQUES_ALERT_CRON)
      .maybeSingle();
    if (error || !data?.last_success_at) return false;
    return data.last_success_at >= inicioDiaPanamaIso(hoy);
  } catch {
    return false;
  }
}

export interface ChequesAlertResult {
  ok: boolean; // false solo si la query falla (el caller NO registra heartbeat)
  detail: string;
  count: number;
  sent: boolean; // si el Telegram salió
}

/**
 * Avisa por Telegram (canal de NEGOCIO) de los cheques PENDIENTES que vencen
 * dentro de la ventana de hoy. Un solo mensaje compacto por corrida, o ninguno.
 * Sin escrituras.
 */
export async function runChequesAlert(ahora: Date = new Date()): Promise<ChequesAlertResult> {
  const hoy = fechaPanama(ahora);

  const { habil, fechas } = ventanaAviso(hoy);
  if (!habil) {
    return { ok: true, detail: "fin de semana — no se avisa", count: 0, sent: false };
  }

  if (await yaAvisoHoy(hoy)) {
    return { ok: true, detail: "ya se avisó hoy", count: 0, sent: false };
  }

  const desde = fechas[0];
  const hasta = fechas[fechas.length - 1];

  const { data: cheques, error } = await supabaseServer
    .from("cheques")
    .select("cliente, empresa, monto, fecha_deposito, vendedor")
    .eq("estado", "pendiente") // un cheque ya depositado (o rebotado/vencido) no avisa
    .eq("deleted", false) // soft-delete: un cheque borrado no avisa
    .gte("fecha_deposito", desde)
    .lte("fecha_deposito", hasta)
    .order("fecha_deposito");

  if (error) {
    return { ok: false, detail: error.message, count: 0, sent: false };
  }

  // Sin nada por vencer NO se manda mensaje: un "hoy no hay nada" diario es ruido.
  if (!cheques || cheques.length === 0) {
    return { ok: true, detail: "sin cheques por vencer", count: 0, sent: false };
  }

  const sent = await enviarNegocio(construirMensaje(cheques as ChequePorVencer[], hoy));
  return { ok: true, detail: `${cheques.length} por vencer`, count: cheques.length, sent };
}

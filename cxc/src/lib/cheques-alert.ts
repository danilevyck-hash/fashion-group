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
import {
  construirAvisoRecordatorios,
  ocurrenciasEnFechas,
  unirAviso,
  type Ocurrencia,
} from "@/lib/recordatorios/recordatorio";
import { leerRecordatorios } from "@/lib/recordatorios/server";

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
  ok: boolean; // false solo si la query de CHEQUES falla (el caller NO registra heartbeat)
  detail: string;
  count: number; // cheques por vencer
  /** Ocurrencias de recordatorios que caen en la ventana de hoy. */
  recordatorios: number;
  sent: boolean; // si el Telegram salió
}

/**
 * Avisa por Telegram (canal de NEGOCIO) de los cheques PENDIENTES que vencen
 * dentro de la ventana de hoy **y de los recordatorios que tocan en esa misma
 * ventana**. UN solo mensaje compacto por corrida, o ninguno. Sin escrituras.
 *
 * 🔴 **Los recordatorios entran por ACÁ y no por un cron nuevo**, y no es
 * economía de archivos: este cron ya tiene resuelto lo difícil —la ventana del
 * día hábil anterior, el anti-duplicado por heartbeat (`yaAvisoHoy`) y el
 * fail-open— y todo eso vale igual para un recordatorio. Un cron nuevo habría
 * estrenado una segunda ventana, un segundo candado anti-duplicado y una
 * segunda entrada que mantener sincronizada con ésta en `vercel.json`.
 *
 * ⚠️ **Un fallo de los recordatorios NO se lleva puesto el aviso de los
 * cheques.** Los cheques son la plata: si su consulta falla la corrida queda
 * `ok:false` (igual que siempre), pero si la que falla es la de recordatorios se
 * anota en `detail` y el mensaje de cheques sale igual. Al revés sería perder un
 * aviso de dinero por uno de agenda.
 */
export async function runChequesAlert(ahora: Date = new Date()): Promise<ChequesAlertResult> {
  const hoy = fechaPanama(ahora);
  const vacio = { count: 0, recordatorios: 0, sent: false };

  const { habil, fechas } = ventanaAviso(hoy);
  if (!habil) {
    return { ok: true, detail: "fin de semana — no se avisa", ...vacio };
  }

  if (await yaAvisoHoy(hoy)) {
    return { ok: true, detail: "ya se avisó hoy", ...vacio };
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
    return { ok: false, detail: error.message, ...vacio };
  }

  // Los recordatorios que tocan en la MISMA ventana. Sin la migración corrida
  // esto devuelve una lista vacía y el aviso de cheques sale igual que siempre.
  let ocurrencias: Ocurrencia[] = [];
  let notaRecordatorios = "";
  try {
    const { recordatorios, faltaMigracion } = await leerRecordatorios();
    if (faltaMigracion) notaRecordatorios = " (recordatorios: falta el DDL)";
    else ocurrencias = ocurrenciasEnFechas(recordatorios, fechas);
  } catch (e) {
    notaRecordatorios = ` (recordatorios fallaron: ${e instanceof Error ? e.message : String(e)})`;
  }

  const bloqueCheques =
    cheques && cheques.length > 0 ? construirMensaje(cheques as ChequePorVencer[], hoy) : "";
  const mensaje = unirAviso(bloqueCheques, construirAvisoRecordatorios(ocurrencias, hoy));

  // Sin nada por vencer y sin ningún recordatorio NO se manda mensaje: un "hoy
  // no hay nada" diario es ruido.
  //
  // ⚠️ El texto de este `detail` es el MISMO de siempre cuando no hay nada de
  // recordatorios que contar. No es estética: lo lee la recuperación de
  // `switch-reconciliacion` y hay candados que lo esperan tal cual.
  if (!mensaje) {
    return { ok: true, detail: `sin cheques por vencer${notaRecordatorios}`, ...vacio };
  }

  const sent = await enviarNegocio(mensaje);
  const n = cheques?.length ?? 0;
  const partes: string[] = [];
  if (n > 0) partes.push(`${n} por vencer`);
  if (ocurrencias.length > 0) {
    partes.push(`${ocurrencias.length} recordatorio${ocurrencias.length > 1 ? "s" : ""}`);
  }
  return {
    ok: true,
    detail: `${partes.join(" · ")}${notaRecordatorios}`,
    count: n,
    recordatorios: ocurrencias.length,
    sent,
  };
}

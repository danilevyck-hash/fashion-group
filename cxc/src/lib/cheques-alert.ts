// Lógica core del cron cheques-alert, extraída del route para poder llamarla
// IN-PROCESS desde la reconciliación (recuperación sin self-fetch), igual que
// sync-clientes-master. NO registra heartbeat ni logCronError: eso es del
// caller (route u orquestador).
//
// Acá vive SOLO el I/O. Las fechas y la redacción viven en módulos PUROS:
//   · `cheques-aviso-ventana.ts`  → la ventana del día hábil y el texto de
//                                   "por vencer" (ahí está explicado por qué el
//                                   viernes cubre sábado, domingo y lunes).
//   · `cheques-vencidos-aviso.ts` → el aviso ÚNICO de "venció y sigue sin
//                                   depositar" (5-sep-2026).
//   · `cheques-retencion.ts`      → los 365 días del cheque depositado.
//   · `recordatorios/recordatorio.ts` → qué recordatorio toca y a quién le llega.
//
// ── 🔴 DEJÓ DE SER READ-ONLY (5-sep-2026) ────────────────────────────────────
//
// Hasta hoy este cron solo leía y mandaba Telegram. Ahora ESCRIBE dos cosas
// sobre `cheques`, las dos idempotentes y las dos soft:
//
//   1. `aviso_vencido_en` — la memoria de que el aviso único ya salió. Se marca
//      DESPUÉS de que Telegram confirme: marcarlo antes y que el envío falle
//      quemaría el único aviso que ese cheque va a tener.
//   2. `deleted = true` — la retención de 365 días de los depositados. SOFT
//      delete, nunca un DELETE; la fila queda y el respaldo se la lleva igual.
//
// Ninguna de las dos toca un cheque pendiente, vencido ni rebotado: eso es plata
// que todavía no entró.
//
// ── 🔴 DOS MENSAJES, NO UNO (5-sep-2026) ─────────────────────────────────────
//
//   📊 AL GRUPO (`enviarNegocio`): los cheques por vencer + los cheques
//      VENCIDOS + los recordatorios del EQUIPO.
//   🔒 AL PRIVADO (`enviarNegocioPrivado`): los recordatorios que Daniel marcó
//      «solo a mí». Mismo patrón que el resumen diario de ACS — destino de
//      sistema, trato de negocio, SIN el prefijo "🔧 SISTEMA ·", porque un
//      recordatorio no es una avería.
//
// Si no hay nada que decir, no se manda ningún mensaje.

import { supabaseServer } from "@/lib/supabase-server";
import { enviarNegocio, enviarNegocioPrivado } from "@/lib/alertas/canal";
import {
  fechaPanama,
  ventanaAviso,
  construirMensaje,
  inicioDiaPanamaIso,
  type ChequePorVencer,
} from "@/lib/cheques-aviso-ventana";
import {
  construirAvisoVencidos,
  mereceAvisoVencido,
  type ChequeVencido,
} from "@/lib/cheques-vencidos-aviso";
import { chequesARetirar, corteRetencion, type ChequeRetencion } from "@/lib/cheques-retencion";
import {
  construirAvisoRecordatorios,
  ocurrenciasEnFechas,
  partirPorDestino,
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

/**
 * LA RETENCIÓN: los depositados de más de 365 días se retiran solos.
 *
 * 🔴 Corre ANTES de cualquier `return` temprano (fin de semana, «ya se avisó
 * hoy») y en su propio `try`: es limpieza, no aviso, y un fallo suyo no puede
 * llevarse por delante el mensaje de los cheques, que es la plata.
 *
 * Es idempotente: lo ya retirado no vuelve a salir de la consulta (`deleted =
 * false`), así que correrla dos veces el mismo día no hace nada la segunda.
 */
async function retirarDepositadosViejos(hoy: string): Promise<number> {
  const corte = corteRetencion(hoy);
  // La consulta ya acota por el corte; `chequesARetirar` vuelve a decidir sobre
  // lo leído. No es redundancia: un filtro de base que se afloje no se nota, y
  // el módulo puro es el que está bajo candado.
  const { data, error } = await supabaseServer
    .from("cheques")
    .select("id, estado, deleted, fecha_deposito, fecha_depositado")
    .eq("deleted", false)
    .eq("estado", "depositado")
    .lte("fecha_deposito", corte);
  if (error || !data) return 0;

  const ids = chequesARetirar(data as ChequeRetencion[], hoy);
  if (ids.length === 0) return 0;

  const { error: errUpd } = await supabaseServer
    .from("cheques")
    .update({ deleted: true, deleted_at: new Date().toISOString() })
    .in("id", ids);
  return errUpd ? 0 : ids.length;
}

export interface ChequesAlertResult {
  ok: boolean; // false solo si la query de CHEQUES falla (el caller NO registra heartbeat)
  detail: string;
  count: number; // cheques por vencer
  /** Cheques que vencieron y recibieron su aviso ÚNICO en esta corrida. */
  vencidos: number;
  /** Ocurrencias de recordatorios que caen en la ventana de hoy. */
  recordatorios: number;
  /** Depositados retirados por los 365 días. */
  retirados: number;
  sent: boolean; // si salió al menos un Telegram
}

/**
 * El mensaje de las 9:00. Ver el encabezado del archivo.
 *
 * ⚠️ **Un fallo de los recordatorios NO se lleva puesto el aviso de los
 * cheques.** Los cheques son la plata: si su consulta falla la corrida queda
 * `ok:false` (igual que siempre), pero si la que falla es la de recordatorios se
 * anota en `detail` y el mensaje de cheques sale igual. Al revés sería perder un
 * aviso de dinero por uno de agenda.
 */
export async function runChequesAlert(ahora: Date = new Date()): Promise<ChequesAlertResult> {
  const hoy = fechaPanama(ahora);
  const vacio = { count: 0, vencidos: 0, recordatorios: 0, retirados: 0, sent: false };

  // Limpieza primero, y aparte de todo lo demás.
  let retirados = 0;
  try {
    retirados = await retirarDepositadosViejos(hoy);
  } catch {
    retirados = 0; // la limpieza puede esperar a mañana; el aviso no.
  }
  const notaRetiro = retirados > 0 ? ` · ${retirados} depositado(s) retirado(s) por antigüedad` : "";

  const { habil, fechas } = ventanaAviso(hoy);
  if (!habil) {
    return { ok: true, detail: `fin de semana — no se avisa${notaRetiro}`, ...vacio, retirados };
  }

  if (await yaAvisoHoy(hoy)) {
    return { ok: true, detail: `ya se avisó hoy${notaRetiro}`, ...vacio, retirados };
  }

  const desde = fechas[0];
  const hasta = fechas[fechas.length - 1];

  const { data: cheques, error } = await supabaseServer
    .from("cheques")
    .select("cliente, empresa, monto, fecha_deposito, vendedor")
    .eq("estado", "pendiente") // un cheque ya depositado (o rebotado) no avisa
    .eq("deleted", false) // soft-delete: un cheque borrado no avisa
    .gte("fecha_deposito", desde)
    .lte("fecha_deposito", hasta)
    .order("fecha_deposito");

  if (error) {
    return { ok: false, detail: error.message, ...vacio, retirados };
  }

  // ── Los VENCIDOS que todavía no tuvieron su aviso único ───────────────────
  // La consulta pide `aviso_vencido_en IS NULL` y el módulo puro vuelve a
  // decidir sobre lo leído (`mereceAvisoVencido`): es el aviso que se gasta, y
  // un filtro de base que se afloje no se nota.
  let vencidos: Array<ChequeVencido & { id: string }> = [];
  let notaVencidos = "";
  try {
    const { data, error: errVenc } = await supabaseServer
      .from("cheques")
      .select("id, cliente, empresa, monto, fecha_deposito, vendedor, estado, deleted, aviso_vencido_en")
      .eq("estado", "pendiente")
      .eq("deleted", false)
      .is("aviso_vencido_en", null)
      .lt("fecha_deposito", hoy)
      .order("fecha_deposito");
    if (errVenc) notaVencidos = ` (vencidos fallaron: ${errVenc.message})`;
    else {
      vencidos = ((data ?? []) as Array<ChequeVencido & { id: string; estado: string; deleted: boolean | null; aviso_vencido_en: string | null }>)
        .filter((c) => mereceAvisoVencido(c, hoy));
    }
  } catch (e) {
    notaVencidos = ` (vencidos fallaron: ${e instanceof Error ? e.message : String(e)})`;
  }

  // ── Los recordatorios que tocan en la MISMA ventana ────────────────────────
  let ocurrencias: Ocurrencia[] = [];
  let notaRecordatorios = "";
  try {
    const { recordatorios, faltaMigracion } = await leerRecordatorios();
    if (faltaMigracion) notaRecordatorios = " (recordatorios: falta el DDL)";
    else ocurrencias = ocurrenciasEnFechas(recordatorios, fechas);
  } catch (e) {
    notaRecordatorios = ` (recordatorios fallaron: ${e instanceof Error ? e.message : String(e)})`;
  }
  const { equipo, privado } = partirPorDestino(ocurrencias);

  // ── Los DOS mensajes ──────────────────────────────────────────────────────
  const bloqueCheques =
    cheques && cheques.length > 0 ? construirMensaje(cheques as ChequePorVencer[], hoy) : "";
  const bloqueVencidos = construirAvisoVencidos(vencidos, hoy);
  const mensajeGrupo = unirAviso(
    bloqueCheques,
    bloqueVencidos,
    construirAvisoRecordatorios(equipo, hoy),
  );
  const mensajePrivado = construirAvisoRecordatorios(privado, hoy);

  // Sin nada que decir NO se manda mensaje: un "hoy no hay nada" diario es ruido.
  //
  // ⚠️ El texto de este `detail` empieza IGUAL que siempre cuando no hay nada
  // más que contar. No es estética: lo lee la recuperación de
  // `switch-reconciliacion` y hay candados que lo esperan tal cual.
  if (!mensajeGrupo && !mensajePrivado) {
    return {
      ok: true,
      detail: `sin cheques por vencer${notaVencidos}${notaRecordatorios}${notaRetiro}`,
      ...vacio,
      retirados,
    };
  }

  const enviadoGrupo = mensajeGrupo ? await enviarNegocio(mensajeGrupo) : false;
  const enviadoPrivado = mensajePrivado ? await enviarNegocioPrivado(mensajePrivado) : false;

  // 🔴 El aviso único se marca SOLO si el mensaje del grupo salió. Si Telegram
  // falló, mañana se vuelve a intentar: mejor avisar tarde que no avisar nunca.
  let avisados = 0;
  if (enviadoGrupo && vencidos.length > 0) {
    const { error: errMarca } = await supabaseServer
      .from("cheques")
      .update({ aviso_vencido_en: new Date().toISOString() })
      .in("id", vencidos.map((c) => c.id));
    if (!errMarca) avisados = vencidos.length;
  }

  const n = cheques?.length ?? 0;
  const partes: string[] = [];
  if (n > 0) partes.push(`${n} por vencer`);
  if (vencidos.length > 0) partes.push(`${vencidos.length} vencido(s) avisado(s)`);
  if (equipo.length > 0) partes.push(`${equipo.length} al equipo`);
  if (privado.length > 0) partes.push(`${privado.length} en privado`);
  return {
    ok: true,
    detail: `${partes.join(" · ")}${notaVencidos}${notaRecordatorios}${notaRetiro}`,
    count: n,
    vencidos: avisados,
    recordatorios: ocurrencias.length,
    retirados,
    sent: enviadoGrupo || enviadoPrivado,
  };
}

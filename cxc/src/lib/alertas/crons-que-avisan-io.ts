// ═══════════════════════════════════════════════════════════════════════════
//   El lado que toca la base y Telegram de «hay tareas cuyo producto es el
//   mensaje». Toda la DECISIÓN vive en `crons-que-avisan.ts`, que es PURO.
//
//   Mismo reparto que el silencio de datos y que el guard de montos: la
//   redacción y los umbrales se pueden revisar en un test sin base ni Telegram,
//   que es la única forma de mirar de verdad un aviso que ojalá casi nunca salga.
// ═══════════════════════════════════════════════════════════════════════════

import { supabaseServer } from "@/lib/supabase-server";
import { enviarSistema } from "@/lib/alertas/canal";
import { logCronError, type HeartbeatRow } from "@/lib/cron-telemetry";
import {
  DIAS_ENTRE_AVISOS_CRON,
  cronsQueAvisanCaidos,
  mensajeCronsSinCorrer,
  tipoDeCron,
  type CronCaido,
} from "./crons-que-avisan";

/**
 * ¿Ya se avisó por este cron en los últimos `DIAS_ENTRE_AVISOS_CRON` días?
 *
 * **Fail-OPEN**: si no se puede leer el registro, se avisa igual. Perder el aviso
 * de una tarea que dejó de correr cuesta más que repetirlo — es el mismo criterio
 * de `datos-frescos.ts`, del silencio de datos y de `db-salud`.
 */
export async function yaAvisadoPorCron(
  cronName: string,
  ahoraMs: number = Date.now(),
): Promise<boolean> {
  try {
    const desde = new Date(ahoraMs - DIAS_ENTRE_AVISOS_CRON * 86_400_000).toISOString();
    const { data, error } = await supabaseServer
      .from("cron_email_errors")
      .select("id")
      .eq("tipo", tipoDeCron(cronName))
      .gte("created_at", desde)
      .limit(1);
    if (error) return false;
    return (data ?? []).length > 0;
  } catch {
    return false;
  }
}

/**
 * De punta a punta. Devuelve las etiquetas de lo que encontró (avise o no) para
 * que entre en el JSON de la reconciliación y se pueda auditar después.
 *
 * 🔴 LA LLAVE DEL DEDUP SE ESCRIBE **DESPUÉS** DE QUE TELEGRAM CONFIRME.
 * Escribirla antes es lo que hace que un envío fallido queme los siete días de
 * silencio de ese cron: la fila queda puesta, el mensaje nunca llegó y nadie se
 * entera hasta la semana siguiente. Es el mismo orden que ya usa
 * `cheques.aviso_vencido_en` con el aviso de cheque vencido, y por el mismo
 * motivo: marcar antes de saber que salió quema el único aviso.
 *
 * Un mensaje POR CRON, no uno con todos adentro: cada uno se arregla por su
 * lado, y su anti-loop es independiente.
 *
 * No lanza: un fallo mirando los heartbeats no puede tumbar la reconciliación.
 */
export async function revisarCronsQueAvisan(ahoraMs: number = Date.now()): Promise<string[]> {
  let caidos: CronCaido[] = [];
  try {
    const { data, error } = await supabaseServer
      .from("cron_heartbeats")
      .select("cron_name, last_success_at");
    if (error) throw new Error(error.message);
    caidos = cronsQueAvisanCaidos((data ?? []) as HeartbeatRow[], ahoraMs);
  } catch (err) {
    console.error(
      `[crons-que-avisan] no pude leer los heartbeats: ${err instanceof Error ? err.message : String(err)}`,
    );
    return [];
  }
  if (caidos.length === 0) return [];

  const etiquetas: string[] = [];
  for (const c of caidos) {
    etiquetas.push(`${c.cronName}:${c.horas ?? "nunca"}h`);
    if (await yaAvisadoPorCron(c.cronName, ahoraMs)) {
      console.error(
        `[crons-que-avisan] ya avisado hace <${DIAS_ENTRE_AVISOS_CRON}d, no repito: ${c.cronName}`,
      );
      continue;
    }
    const enviado = await enviarSistema(mensajeCronsSinCorrer([c]));
    if (!enviado) {
      console.error(`[crons-que-avisan] Telegram no confirmó, no marco el dedup: ${c.cronName}`);
      continue;
    }
    await logCronError(tipoDeCron(c.cronName), `${c.cronName}: ${c.horas ?? "nunca"}h`, null, {
      telegram: false,
    });
  }
  return etiquetas;
}

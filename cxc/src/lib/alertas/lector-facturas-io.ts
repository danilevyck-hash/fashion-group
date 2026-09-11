// ═══════════════════════════════════════════════════════════════════════════
//   El lado que toca la base y Telegram del aviso «el lector de facturas dejó
//   de leer». Toda la DECISIÓN vive en `lector-facturas.ts`, que es PURO; acá
//   solo está el I/O, una vez, compartido por los dos lectores.
//
//   Mismo reparto que `silencio-de-datos` / `cuadre-costo` / `monto-guard`.
// ═══════════════════════════════════════════════════════════════════════════

import { enviarSistema } from "@/lib/alertas/canal";
import { logCronError } from "@/lib/cron-telemetry";
import {
  DIAS_ENTRE_AVISOS,
  mensajeLectorFacturas,
  tipoDeCausa,
  type CausaLector,
  type OrigenLector,
} from "./lector-facturas";

/**
 * Supabase se carga PEREZOSO, no al importar el módulo — el mismo motivo que
 * en `monto-guard-io.ts`: `supabase-server` crea el cliente en el import y
 * revienta sin las env vars, y este archivo lo importan dos rutas de API que
 * tienen que poder montarse igual.
 */
async function db() {
  const { supabaseServer } = await import("@/lib/supabase-server");
  return supabaseServer;
}

/**
 * ¿Ya se avisó por esta CAUSA en los últimos `DIAS_ENTRE_AVISOS` días?
 *
 * **Fail-OPEN**: si no se puede leer el registro, se avisa igual. Es el criterio
 * de toda la casa (`silencio-de-datos`, `cuadre-costo`, `datos-frescos`):
 * repetir un aviso cuesta un mensaje, perderlo cuesta la avería entera.
 */
export async function yaAvisadoLector(
  causa: CausaLector,
  ahoraMs: number = Date.now(),
): Promise<boolean> {
  try {
    const supabase = await db();
    const desde = new Date(ahoraMs - DIAS_ENTRE_AVISOS * 86_400_000).toISOString();
    const { data, error } = await supabase
      .from("cron_email_errors")
      .select("id")
      .eq("tipo", tipoDeCausa(causa))
      .gte("created_at", desde)
      .limit(1);
    if (error) return false;
    return (data ?? []).length > 0;
  } catch {
    return false;
  }
}

/**
 * Avisa por 🔧 SISTEMA que el lector de facturas dejó de leer. Devuelve `true`
 * si el mensaje salió de verdad.
 *
 * 🩸 EL DEDUP SE MARCA **DESPUÉS** DE QUE TELEGRAM CONFIRME — la misma lección
 * que `silencio-de-datos-io` y que `cheques.aviso_vencido_en`: marcar antes y
 * que el envío falle quema los SIETE DÍAS de silencio de esa causa, o sea el
 * único aviso que iba a haber.
 *
 * 🔴 NUNCA LANZA. Esto cuelga del camino de una persona que está subiendo un
 * PDF: si el aviso falla, el error de la factura tiene que seguir su curso tal
 * cual. El aviso es un colateral, no el trabajo.
 */
export async function avisarLectorCaido(
  causa: CausaLector,
  origen: OrigenLector,
  ahoraMs: number = Date.now(),
): Promise<boolean> {
  try {
    if (await yaAvisadoLector(causa, ahoraMs)) {
      console.error(
        `[lector-facturas] ya avisado hace <${DIAS_ENTRE_AVISOS}d, no repito: ${causa} (lo vio ${origen})`,
      );
      return false;
    }
    const enviado = await enviarSistema(mensajeLectorFacturas(causa));
    if (!enviado) {
      console.error(`[lector-facturas] Telegram no confirmó, no marco el dedup: ${causa}`);
      return false;
    }
    await logCronError(tipoDeCausa(causa), `lector de facturas caído (${causa}), visto en ${origen}`, null, {
      telegram: false,
    });
    return true;
  } catch (err) {
    console.error(
      `[lector-facturas] no pude avisar: ${err instanceof Error ? err.message : String(err)}`,
    );
    return false;
  }
}

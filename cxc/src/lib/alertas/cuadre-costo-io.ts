// ═══════════════════════════════════════════════════════════════════════════
//   El lado que toca la base y Telegram del cuadre de costo. Toda la DECISIÓN
//   vive en `cuadre-costo.ts`, que es PURO; acá solo está el I/O.
//
//   Mismo reparto que `silencio-de-datos` / `silencio-de-datos-io`: el umbral y
//   la redacción se revisan en un test sin base ni Telegram.
// ═══════════════════════════════════════════════════════════════════════════

import { supabaseServer } from "@/lib/supabase-server";
import { enviarSistema } from "@/lib/alertas/canal";
import { logCronError } from "@/lib/cron-telemetry";
import { hoyPanama } from "@/lib/fecha-panama";
import { esFuncionInexistente } from "@/lib/ventas/rpc-version";
import {
  DIAS_ENTRE_AVISOS,
  evaluarCuadre,
  mensajeCuadre,
  tipoDeCuadre,
  ventanaMesesCerrados,
  type Descuadre,
  type FilaCuadre,
} from "./cuadre-costo";

/** La RPC que suma los días comparables (migración 20260915120000). */
export const RPC_CUADRE_COSTO = "cuadre_costo_mensual_v1";

/**
 * Mide los meses cerrados de la ventana. Devuelve los descuadres, sin avisar.
 *
 * Si la RPC todavía no existe (la migración no corrió), devuelve `[]` y lo
 * dice en el log: el cuadre se OMITE, no inventa un resultado. Cualquier otro
 * error se lanza; quien llama decide (la reconciliación lo anota y sigue).
 */
export async function medirCuadreCosto(hoy: string = hoyPanama()): Promise<Descuadre[]> {
  const { desde, hasta } = ventanaMesesCerrados(hoy);
  if (desde >= hasta) return [];

  const { data, error } = await supabaseServer.rpc(RPC_CUADRE_COSTO, {
    p_desde: desde,
    p_hasta: hasta,
  });
  if (error) {
    if (esFuncionInexistente(error)) {
      console.warn(`[cuadre-costo] ${RPC_CUADRE_COSTO} todavía no existe — cuadre omitido`);
      return [];
    }
    throw new Error(`${RPC_CUADRE_COSTO}(${desde}, ${hasta}): ${error.message}`);
  }

  const out: Descuadre[] = [];
  for (const fila of (data ?? []) as FilaCuadre[]) {
    const d = evaluarCuadre(fila);
    if (d) out.push(d);
  }
  return out;
}

/**
 * ¿Ya se avisó por este (empresa, mes) en los últimos `DIAS_ENTRE_AVISOS` días?
 *
 * **Fail-OPEN**: si no se puede leer el registro, se avisa igual — el mismo
 * criterio del silencio de datos y de `datos-frescos.ts`.
 */
export async function yaAvisadoCuadre(
  empresaKey: string,
  mes: string,
  ahoraMs: number = Date.now(),
): Promise<boolean> {
  try {
    const desde = new Date(ahoraMs - DIAS_ENTRE_AVISOS * 86_400_000).toISOString();
    const { data, error } = await supabaseServer
      .from("cron_email_errors")
      .select("id")
      .eq("tipo", tipoDeCuadre(empresaKey, mes))
      .gte("created_at", desde)
      .limit(1);
    if (error) return false;
    return (data ?? []).length > 0;
  } catch {
    return false;
  }
}

/**
 * El cuadre de punta a punta. Devuelve las etiquetas de lo que encontró (avise
 * o no) para el JSON de la reconciliación.
 *
 * UN mensaje por pasada con todos los pares nuevos. El registro en
 * `cron_email_errors` va ANTES del envío —es la llave del dedup—, uno por par,
 * así el anti-loop es por (empresa, mes) aunque el Telegram sea uno solo.
 */
export async function revisarCuadreCosto(
  hoy: string = hoyPanama(),
  ahoraMs: number = Date.now(),
): Promise<string[]> {
  const descuadres = await medirCuadreCosto(hoy);
  if (descuadres.length === 0) return [];

  const etiquetas = descuadres.map((d) => `${d.empresaKey}/${d.mes.slice(0, 7)}:${(d.pct * 100).toFixed(1)}%`);

  const nuevos: Descuadre[] = [];
  for (const d of descuadres) {
    if (await yaAvisadoCuadre(d.empresaKey, d.mes, ahoraMs)) {
      console.error(`[cuadre-costo] ya avisado hace <${DIAS_ENTRE_AVISOS}d, no repito: ${d.empresaKey}/${d.mes}`);
      continue;
    }
    nuevos.push(d);
  }
  if (nuevos.length === 0) return etiquetas;

  for (const d of nuevos) {
    await logCronError(
      tipoDeCuadre(d.empresaKey, d.mes),
      `resumen ${d.costoResumen.toFixed(2)} vs diario ${d.costoDiario.toFixed(2)} (${d.diasComparados} días)`,
      null,
      { telegram: false },
    );
  }
  await enviarSistema(mensajeCuadre(nuevos));
  return etiquetas;
}

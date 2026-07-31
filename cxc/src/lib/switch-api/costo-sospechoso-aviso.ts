// ─────────────────────────────────────────────────────────────────────────────
// El aviso de COSTO SOSPECHOSO en artículos: canal 🔧 SISTEMA y anti-loop.
//
// ── 🩸 POR QUÉ SE MOVIÓ DE CANAL (31-jul-2026) ──────────────────────────────
//
// Daniel, mostrando el mensaje que le llegó al chat de negocio: *"me llego esto
// a fashion gr negocio, deberia de llegar solo a alertas"*.
//
// Cumple la regla de tres de 🔧 SISTEMA: **(1)** es real —el costo está mal
// cargado EN Switch—, **(2)** no se arregla solo —ninguna corrida siguiente lo
// corrige, el dato malo vive en el origen— y **(3)** alguien tiene que hacer
// algo: el propio texto pide corregir el artículo en Switch y relanzar el sync
// de ese día.
//
// ── 🔴 EL ANTI-LOOP NO EXISTÍA, Y SIN ÉL ESTO SUENA TODOS LOS DÍAS ─────────
//
// Mientras vivía en 📊 NEGOCIO, `alertarCostosSospechosos` mandaba UN mensaje
// por corrida sin memoria ninguna: mientras el artículo siguiera mal en Switch,
// avisaba en cada sync. Eso en NEGOCIO ya molestaba; en SISTEMA lo convertiría
// en la alerta-que-suena-para-siempre, que es justo de lo que Daniel se quejó
// cuando fijó la lista cerrada de alertas.
//
// Así que se le agrega el MISMO freno que ya tiene el guard de montos
// imposibles (`monto-guard-io.ts`): **anti-loop de 7 días por fila**, leyendo
// `switch_sync_log.skip_details` de las corridas anteriores del mismo par
// (empresa, sync_type). La clave de una fila es `fecha|codigo|tipo`.
//
// ⚠️ **No se tocó el guard de montos imposibles.** Es otra cosa y corre al lado
// en el mismo sync: aquél RECHAZA la fila por una cifra imposible, éste la
// GUARDA con costo $0 porque el costo unitario está mal cargado. Se replica el
// patrón, no se comparte el código, para no arrastrar una familia de guard que
// no le corresponde.
//
// FAIL-OPEN a propósito: si no se puede leer el historial, se avisa igual.
// Perder un aviso es peor que repetirlo.
// ─────────────────────────────────────────────────────────────────────────────

/** Días que un mismo artículo deja de avisar después del primer mensaje. */
export const COSTO_DIAS_ENTRE_AVISOS = 7;

/** Marca con la que estas filas viajan en `switch_sync_log.skip_details`. */
export const CAMPO_SKIP_COSTO = "costo_sospechoso";

/** Máximo de filas listadas en el mensaje (el resto va como "…y N más"). */
export const MAX_EN_MENSAJE = 5;

export interface CostoSospechoso {
  fecha: string;
  codigo: string | null;
  descripcion: string | null;
  tipo: string;
  cantidad: number;
  costo: number;
}

/** Identidad estable de una fila para el anti-loop. */
export function claveDeCosto(f: CostoSospechoso): string {
  return `${f.fecha}|${f.codigo ?? "?"}|${f.tipo}`;
}

/** Lo que se guarda en `switch_sync_log.skip_details` para recordar el aviso. */
export function detallesDeCostoSospechoso(
  filas: readonly CostoSospechoso[]
): Array<{ campo: string; secuencial: string }> {
  return filas.map((f) => ({ campo: CAMPO_SKIP_COSTO, secuencial: claveDeCosto(f) }));
}

/** Quita las claves ya avisadas en la ventana reciente. */
export function clavesPorAvisar(
  claves: readonly string[],
  yaAvisadas: readonly string[]
): string[] {
  const vistas = new Set(yaAvisadas);
  return [...new Set(claves)].filter((c) => !vistas.has(c));
}

/**
 * Claves ya avisadas en los últimos `COSTO_DIAS_ENTRE_AVISOS` días, leídas de
 * las corridas anteriores del mismo par (empresa, sync_type).
 *
 * Fail-open: ante cualquier error devuelve `[]` (se avisa).
 */
export async function clavesYaAvisadas(
  empresaKey: string,
  syncType: string,
  logIdActual: string | null
): Promise<string[]> {
  const desde = new Date(Date.now() - COSTO_DIAS_ENTRE_AVISOS * 86_400_000).toISOString();
  const claves: string[] = [];
  try {
    const { supabaseServer } = await import("@/lib/supabase-server");
    const { data, error } = await supabaseServer
      .from("switch_sync_log")
      .select("id,skip_details")
      .eq("empresa_key", empresaKey)
      .eq("sync_type", syncType)
      .gte("started_at", desde);
    if (error || !Array.isArray(data)) return [];
    for (const fila of data as unknown as Array<{ id: string; skip_details: unknown }>) {
      if (logIdActual && fila.id === logIdActual) continue;
      if (!Array.isArray(fila.skip_details)) continue;
      for (const d of fila.skip_details as Array<{ campo?: unknown; secuencial?: unknown }>) {
        if (d?.campo === CAMPO_SKIP_COSTO && typeof d.secuencial === "string") {
          claves.push(d.secuencial);
        }
      }
    }
  } catch {
    return [];
  }
  return claves;
}

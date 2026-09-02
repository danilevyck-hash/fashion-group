// ═══════════════════════════════════════════════════════════════════════════
//   El lado que toca la base y Telegram de «el silencio no cuenta como que
//   está bien». Toda la DECISIÓN vive en `silencio-de-datos.ts`, que es PURO;
//   acá solo está el I/O, una vez, compartido por las dos alertas.
//
//   Mismo reparto que el guard de montos imposibles (`monto-guard.ts` /
//   `monto-guard-io.ts`): la redacción y los umbrales se pueden revisar en un
//   test sin base ni Telegram, que es la única forma de mirar de verdad un
//   mensaje que ojalá casi nunca salga.
// ═══════════════════════════════════════════════════════════════════════════

import { supabaseServer } from "@/lib/supabase-server";
import { leerTodoPaginado } from "@/lib/supabase-paginado";
import { enviarSistema } from "@/lib/alertas/canal";
import { logCronError } from "@/lib/cron-telemetry";
import { ALL_EMPRESA_KEYS } from "@/lib/empresa-mapping";
import {
  A_DIAS_DE_LOG,
  A_VENTANA,
  DIAS_ENTRE_AVISOS,
  SYNCS_DE_UNIVERSO_COMPLETO,
  TABLAS_VIGILADAS,
  agruparPorModulo,
  evaluarSyncEnCero,
  evaluarTablaQuieta,
  mensajeSilencio,
  tipoDeModulo,
  type CorridaDeSync,
  type Hallazgo,
} from "./silencio-de-datos";

interface FilaLog {
  id: string;
  empresa_key: string;
  sync_type: string;
  started_at: string;
  records_inserted: number | null;
  records_updated: number | null;
}

/**
 * ALERTA A — lee las corridas EXITOSAS de los últimos `A_DIAS_DE_LOG` días de
 * los syncs de universo completo y evalúa par por par.
 *
 * 🩸 VA PAGINADO Y NO CON UN `.limit()`. Medido el 2-sep-2026 sobre producción:
 * estos mismos `sync_type` dan **1.003 filas en 14 días** — ya por encima del
 * `db-max-rows` = 1000 que PostgREST aplica EN SILENCIO. Una lectura plana
 * habría devuelto 1.000 filas y habría dejado pares enteros sin evaluar sin que
 * nadie se enterara, que es exactamente el modo de fallo que esta alerta viene a
 * cerrar. El orden de paginación es `started_at` con `id` de desempate: `id` es
 * único, así que ninguna fila se repite ni se saltea entre páginas.
 */
export async function medirSyncsEnCero(ahoraMs: number = Date.now()): Promise<Hallazgo[]> {
  const desde = new Date(ahoraMs - A_DIAS_DE_LOG * 86_400_000).toISOString();
  const tipos = Object.keys(SYNCS_DE_UNIVERSO_COMPLETO);

  const filas = await leerTodoPaginado<FilaLog>(
    "switch_sync_log (silencio de datos)",
    (pedirCount, inicio, fin) =>
      supabaseServer
        .from("switch_sync_log")
        .select(
          "id,empresa_key,sync_type,started_at,records_inserted,records_updated",
          pedirCount ? { count: "exact" } : {},
        )
        .gte("started_at", desde)
        .eq("status", "success")
        .in("sync_type", tipos)
        .order("started_at", { ascending: false })
        .order("id", { ascending: false })
        .range(inicio, fin),
  );

  // Agrupar por par, conservando el orden de más nueva a más vieja.
  const porPar = new Map<string, CorridaDeSync[]>();
  for (const f of filas) {
    const k = `${f.empresa_key}|${f.sync_type}`;
    const l = porPar.get(k) ?? [];
    if (l.length < A_VENTANA + 1) {
      l.push({
        cuando: f.started_at,
        // Insertadas + actualizadas. Las SALTEADAS no cuentan: no entraron, y de
        // ellas ya avisan el guard de montos y el de renglones ilegibles.
        volumen: (f.records_inserted ?? 0) + (f.records_updated ?? 0),
      });
    }
    porPar.set(k, l);
  }

  const out: Hallazgo[] = [];
  for (const [par, corridas] of porPar) {
    const [empresaKey, syncType] = par.split("|");
    const h = evaluarSyncEnCero(empresaKey, syncType, corridas);
    if (h) out.push(h);
  }
  return out;
}

/**
 * Última vez que ESCRIBIMOS esa tabla para esa empresa. `null` = nunca hubo una
 * fila, que NO es un problema (ver `evaluarTablaQuieta`).
 *
 * Consulta PUNTUAL con `limit(1)` — nada de barridos: la base ya se cayó una vez
 * por saturación, y esto corre 3 veces al día.
 */
async function ultimaEscritura(
  tabla: string,
  columna: string,
  empresaKey: string,
): Promise<string | null> {
  const { data, error } = await supabaseServer
    .from(tabla)
    .select(columna)
    .eq("empresa_key", empresaKey)
    .order(columna, { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`${tabla}/${empresaKey}: ${error.message}`);
  return (data as Record<string, string> | null)?.[columna] ?? null;
}

/** ALERTA B — recorre las tablas vigiladas, empresa por empresa. */
export async function medirTablasQuietas(ahoraMs: number = Date.now()): Promise<Hallazgo[]> {
  const out: Hallazgo[] = [];
  for (const cfg of TABLAS_VIGILADAS) {
    for (const empresaKey of ALL_EMPRESA_KEYS) {
      const ultima = await ultimaEscritura(cfg.tabla, cfg.columna, empresaKey);
      const h = evaluarTablaQuieta(cfg, empresaKey, ultima, ahoraMs);
      if (h) out.push(h);
    }
  }
  return out;
}

/**
 * ¿Ya se avisó por este módulo en los últimos `DIAS_ENTRE_AVISOS` días?
 *
 * **Fail-OPEN**: si no se puede leer el registro, se avisa igual. Perder el
 * aviso de un módulo que dejó de recibir datos cuesta más que repetirlo — es el
 * mismo criterio de `datos-frescos.ts`, `cheques-alert` y `db-salud`.
 */
export async function yaAvisadoPorModulo(
  modulo: string,
  ahoraMs: number = Date.now(),
): Promise<boolean> {
  try {
    const desde = new Date(ahoraMs - DIAS_ENTRE_AVISOS * 86_400_000).toISOString();
    const { data, error } = await supabaseServer
      .from("cron_email_errors")
      .select("id")
      .eq("tipo", tipoDeModulo(modulo))
      .gte("created_at", desde)
      .limit(1);
    if (error) return false;
    return (data ?? []).length > 0;
  } catch {
    return false;
  }
}

/**
 * Las dos alertas, de punta a punta. Devuelve las etiquetas de lo que encontró
 * (avise o no) para que entre en el JSON de la reconciliación y se pueda
 * auditar después.
 *
 * 🔴 UN MENSAJE POR MÓDULO. Los hallazgos de A y los de B se juntan ANTES de
 * mirar el anti-loop, así que el caso real —el sync de Gastos que deja de traer
 * y dispara las dos— manda un solo Telegram con las dos mitades adentro.
 *
 * El registro en `cron_email_errors` va ANTES del envío, y es a propósito: es la
 * llave del dedup, y dejarla después haría que un fallo de Telegram provocara un
 * segundo intento en la pasada siguiente.
 */
export async function revisarSilencioDeDatos(ahoraMs: number = Date.now()): Promise<string[]> {
  const hallazgos: Hallazgo[] = [];

  // Las dos mitades por separado: que una no pueda leer no puede callar a la
  // otra. Es el mismo motivo por el que son dos alertas y no una.
  try {
    hallazgos.push(...(await medirSyncsEnCero(ahoraMs)));
  } catch (err) {
    console.error(
      `[silencio-de-datos] no pude revisar las corridas: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  try {
    hallazgos.push(...(await medirTablasQuietas(ahoraMs)));
  } catch (err) {
    console.error(
      `[silencio-de-datos] no pude revisar las tablas: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (hallazgos.length === 0) return [];

  const etiquetas: string[] = [];
  for (const [modulo, items] of agruparPorModulo(hallazgos)) {
    etiquetas.push(
      ...items.map((h) =>
        h.clase === "sync-en-cero"
          ? `${modulo}/${h.empresaKey}:cero`
          : `${modulo}/${h.empresaKey}:quieta`,
      ),
    );
    if (await yaAvisadoPorModulo(modulo, ahoraMs)) {
      console.error(`[silencio-de-datos] ya avisado hace <${DIAS_ENTRE_AVISOS}d, no repito: ${modulo}`);
      continue;
    }
    await logCronError(
      tipoDeModulo(modulo),
      items
        .map((h) => (h.clase === "sync-en-cero" ? `${h.empresaKey}/${h.syncType}:cero` : `${h.empresaKey}/${h.tabla}:quieta`))
        .join(", "),
      null,
      { telegram: false },
    );
    await enviarSistema(mensajeSilencio(modulo, items));
  }
  return etiquetas;
}

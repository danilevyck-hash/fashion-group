// ─────────────────────────────────────────────────────────────────────────────
// Sync de la cartera de Confecciones Boston desde el REPORTE WEB del panel.
//
// Reemplaza, SOLO para Boston, el recorrido cliente-por-cliente de
// `syncEmpresaEstadoCuenta`: 4.912 llamadas HTTP / 54 min medidos contra un
// techo de función de 800 s → moría siempre. El reporte de antigüedad trae los
// mismos documentos en 2 llamadas (~3 s medidos el 30-jul-2026).
//
// Escribe la MISMA tabla, con la MISMA forma de fila: `switch_estadocuenta`.
// Ni la pestaña de Boston ni `switch_estadocuenta_aging_boston` se enteran.
//
// ═══ POR QUÉ EL RECONCILE YA NO ES PELIGROSO ═════════════════════════════════
//
// El reconcile de la cartera pone `saldo = 0` a todo documento de la empresa que
// esta corrida NO tocó (`synced_at < runStamp`). Es lo que hace que un documento
// pagado deje de figurar. Con el sync viejo eso obligaba a recorrer los 4.912
// clientes SIEMPRE: cualquier intento de partirlo en tandas terminaba con cada
// tanda poniendo en cero lo que había cargado la anterior, porque el reconcile
// no distingue "no lo miré" de "ya no debe".
//
// Acá el universo llega COMPLETO en una sola respuesta, así que "no vino en el
// reporte" sí significa "ya no debe". No hay tandas, no hay clientes sin
// consultar, y por eso el reconcile puede volver a ser lo que siempre quiso ser:
// una sola pasada sobre todo lo que no se escribió.
//
// Eso se sostiene sobre UNA condición, y por eso está blindada abajo: el reporte
// tiene que haber venido completo. Un reporte vacío se ve EXACTAMENTE igual que
// "todos los clientes pagaron", y el endpoint devuelve cero sin dar error si un
// filtro va mal (ver el aviso de `pais: "null"` en web-client.ts). De ahí las
// tres guardas:
//
//   1. **Reporte vacío ⇒ no se escribe NI se reconcilia.** Cero documentos no se
//      trata como "la cartera quedó en cero": se corta con error y la cartera
//      anterior queda intacta. Es el guard anti-catástrofe que ya usan el
//      housekeeping de fotos y el marcado de clientes ausentes.
//   2. **Cuadre contra el propio Switch ANTES de escribir.** Los totales que
//      calculamos documento por documento se comparan con `saldosTotales`, que
//      es el número que el reporte publica por su cuenta. Si no coinciden al
//      centavo, no se escribe nada. Esto es lo que atrapa un cambio de formato o
//      de signo en el origen — en particular el error del "doble" descrito en
//      estadocuenta-web.ts.
//   3. **Todo se arma en memoria antes del primer INSERT.** Si el parseo falla a
//      la mitad (colisión de ccte_id, por ejemplo), no quedó nada a medio
//      escribir.
//
// Y el reconcile se ejecuta en la MISMA corrida que los upserts, nunca suelto:
// no existe un camino en el que se ponga en cero sin haber cargado antes.
// ─────────────────────────────────────────────────────────────────────────────

import { supabaseServer } from "@/lib/supabase-server";
import type { EmpresaKey } from "@/lib/empresa-mapping";
import {
  loginSwitchWeb,
  fetchCarteraAntiguedad,
  cerrarSesionWeb,
  type CarteraAntiguedad,
} from "./web-client";
import {
  construirFilas,
  tramosPublicadosPorSwitch,
  CarteraWebError,
  type ClienteReporteWeb,
  type FilaEstadoCuentaWeb,
  type ResumenCartera,
} from "./estadocuenta-web";
import type { SkipDetail } from "./sync-empresa";
import { createSwitchSyncLog, finishSwitchSyncLog, type SwitchSyncTriggeredBy } from "./sync-log";

/** La única empresa que hoy usa este camino. */
export const EMPRESA_CARTERA_WEB: EmpresaKey = "confecciones_boston";

/** Filas por UPSERT. Mismo tamaño que el sync del API. */
const UPSERT_BATCH = 100;

/** Tolerancia del cuadre contra `saldosTotales`. Un centavo: los montos son
 *  `numeric(12,4)` y los dos lados suman los mismos números, así que cualquier
 *  diferencia real es un error de interpretación, no de redondeo. */
const TOLERANCIA = 0.01;

export interface SyncCarteraWebResult {
  ok: boolean;
  empresaKey: EmpresaKey;
  syncType: "estadocuenta";
  logId: string | null;
  documentos: number;
  clientes: number;
  cerrados: number;
  resumen: ResumenCartera | null;
  publicadoPorSwitch: ReturnType<typeof tramosPublicadosPorSwitch> | null;
  durationMs: number;
  rondas: number;
  skipped: number;
  error?: string;
}

/** Compara lo que calculamos contra lo que publica Switch. Pura, para testear
 *  las dos direcciones (cuadra / no cuadra) sin tocar la red ni la base. */
export function cuadraConSwitch(
  resumen: ResumenCartera,
  publicado: ReturnType<typeof tramosPublicadosPorSwitch>,
): { ok: true } | { ok: false; detalle: string } {
  const difs: string[] = [];
  const cmp = (nombre: string, a: number, b: number) => {
    if (Math.abs(a - b) > TOLERANCIA) difs.push(`${nombre}: nosotros ${a} vs Switch ${b}`);
  };
  cmp("total", resumen.total, publicado.total);
  cmp("0-90", resumen.d0_90, publicado.d0_90);
  cmp("91-120", resumen.d91_120, publicado.d91_120);
  cmp("121+", resumen.d121_plus, publicado.d121_plus);
  return difs.length === 0 ? { ok: true } : { ok: false, detalle: difs.join(" | ") };
}

async function upsertFilas(
  filas: readonly FilaEstadoCuentaWeb[],
  runStamp: string,
): Promise<void> {
  for (let i = 0; i < filas.length; i += UPSERT_BATCH) {
    const lote = filas.slice(i, i + UPSERT_BATCH).map((f) => ({
      ...f,
      synced_at: runStamp,
      updated_at: runStamp,
    }));
    const { error } = await supabaseServer
      .from("switch_estadocuenta")
      .upsert(lote, { onConflict: "empresa_key,ccte_id", ignoreDuplicates: false });
    if (error) throw new Error(`UPSERT estadocuenta falló: ${error.message}`);
  }
}

/**
 * Pone en 0 todo documento de la empresa que esta corrida no escribió.
 *
 * ⚠️ `neq("saldo", 0)` y NO `gt("saldo", 0)` como el sync del API. El del API
 * puede permitirse mirar solo los positivos porque guarda MAGNITUDES; acá el
 * saldo guardado puede quedar negativo si Switch manda un signo inesperado (ver
 * `saldoParaGuardar`), y un documento cerrado con saldo negativo que no se
 * limpiara se quedaría restando de la cartera para siempre.
 *
 * Devuelve cuántas filas se cerraron — el número que hay que mirar para saber si
 * un día este reconcile se volvió loco.
 */
async function reconciliar(empresaKey: string, runStamp: string): Promise<number> {
  const { data, error } = await supabaseServer
    .from("switch_estadocuenta")
    .update({ saldo: 0, updated_at: new Date().toISOString() })
    .eq("empresa_key", empresaKey)
    .lt("synced_at", runStamp)
    .neq("saldo", 0)
    .select("ccte_id");
  if (error) throw new Error(`reconcile falló: ${error.message}`);
  return (data ?? []).length;
}

/**
 * Sincroniza la cartera de una empresa desde el reporte web.
 *
 * `reporte` permite inyectar una respuesta ya obtenida (lo usan los tests y el
 * script de verificación) en vez de volver a golpear el panel.
 */
export async function syncCarteraWeb(opts: {
  empresaKey?: EmpresaKey;
  triggeredBy?: SwitchSyncTriggeredBy;
  reporte?: CarteraAntiguedad;
  /** Solo calcula y cuadra; no escribe ni reconcilia. */
  dryRun?: boolean;
}): Promise<SyncCarteraWebResult> {
  const empresaKey = opts.empresaKey ?? EMPRESA_CARTERA_WEB;
  const startedAt = Date.now();
  const runStamp = new Date(startedAt).toISOString();
  const base = {
    empresaKey,
    syncType: "estadocuenta" as const,
    documentos: 0,
    clientes: 0,
    cerrados: 0,
    resumen: null,
    publicadoPorSwitch: null,
    rondas: 0,
    skipped: 0,
  };

  let logId: string | null = null;
  try {
    if (!opts.dryRun) {
      logId = await createSwitchSyncLog({
        empresaKey,
        syncType: "estadocuenta",
        triggeredBy: opts.triggeredBy ?? "cron",
      });
    }
  } catch (err) {
    // Conflicto del candado: ya hay otra corrida viva de este par. Abortar limpio
    // es lo correcto — dos sesiones web de la misma empresa se expulsan entre sí.
    const message = err instanceof Error ? err.message : String(err);
    return { ...base, ok: false, logId: null, durationMs: Date.now() - startedAt, error: message };
  }

  try {
    // ─── 1. Traer el reporte COMPLETO ────────────────────────────────────────
    let reporte = opts.reporte;
    let sesion: Awaited<ReturnType<typeof loginSwitchWeb>> | null = null;
    if (!reporte) {
      sesion = await loginSwitchWeb(empresaKey);
      try {
        reporte = await fetchCarteraAntiguedad(sesion);
      } finally {
        // ⛔ Sesión única: el login expulsó a quien estuviera en el panel. Se
        // cierra apenas se tiene el dato, pase lo que pase.
        await cerrarSesionWeb(sesion);
      }
    }

    // ─── 2. Guard anti-catástrofe: un reporte vacío NO es "todos pagaron" ────
    const clientesReporte = reporte.clientes as unknown as ClienteReporteWeb[];
    const documentosReporte = clientesReporte.reduce((n, c) => n + (c.elements?.length ?? 0), 0);
    if (clientesReporte.length === 0 || documentosReporte === 0) {
      throw new Error(
        `el reporte de antigüedad vino vacío (${clientesReporte.length} clientes, ${documentosReporte} documentos). ` +
          `No se escribe ni se reconcilia: la cartera anterior queda intacta.`,
      );
    }

    // ─── 3. Armar TODO en memoria antes de escribir nada ─────────────────────
    const { filas, skips, resumen } = construirFilas(empresaKey, clientesReporte);

    // ─── 4. Cuadrar contra lo que publica el propio Switch ───────────────────
    const publicado = tramosPublicadosPorSwitch(reporte.saldosTotales);
    const cuadre = cuadraConSwitch(resumen, publicado);
    if (!cuadre.ok) {
      throw new Error(
        `la cartera calculada NO cuadra con la que publica Switch → ${cuadre.detalle}. ` +
          `No se escribe nada (¿cambió el signo o el formato del reporte?).`,
      );
    }

    const conCifras = {
      ...base,
      logId,
      documentos: filas.length,
      clientes: resumen.clientes,
      resumen,
      publicadoPorSwitch: publicado,
      rondas: reporte.rondas,
      skipped: skips.length,
    };

    if (opts.dryRun) {
      return { ...conCifras, ok: true, durationMs: Date.now() - startedAt };
    }

    // ─── 5. Escribir y reconciliar, en la misma corrida ──────────────────────
    await upsertFilas(filas, runStamp);
    const cerrados = await reconciliar(empresaKey, runStamp);

    console.error(
      `[cartera-web ${empresaKey}] ${filas.length} documentos de ${resumen.clientes} clientes ` +
        `= ${resumen.total} (0-90 ${resumen.d0_90} · 91-120 ${resumen.d91_120} · 121+ ${resumen.d121_plus}); ` +
        `${cerrados} documentos cerrados; ${skips.length} omitidos; ${reporte.rondas} rondas`,
    );

    await finishSwitchSyncLog(logId, "success", {
      inserted: filas.length,
      updated: cerrados,
      skipped: skips.length,
    });
    return { ...conCifras, ok: true, cerrados, durationMs: Date.now() - startedAt };
  } catch (err) {
    const message =
      err instanceof CarteraWebError || err instanceof Error ? err.message : String(err);
    console.error(`[cartera-web ${empresaKey}] ERROR: ${message}`);
    await finishSwitchSyncLog(logId, "error", { errorMessage: message });
    return { ...base, ok: false, logId, durationMs: Date.now() - startedAt, error: message };
  }
}

export type { SkipDetail };

// ─────────────────────────────────────────────────────────────────────────────
// Sync de la cartera de Confecciones Boston desde el REPORTE WEB del panel.
//
// Reemplaza, SOLO para Boston, el recorrido cliente-por-cliente de
// `syncEmpresaEstadoCuenta`: 4.912 llamadas HTTP / 54 min medidos contra un
// techo de función de 800 s → moría siempre. El reporte de antigüedad trae los
// mismos documentos en pocas llamadas (~4 s medidos el 24-ago-2026).
//
// ⚠️ El TRANSPORTE cambió el 24-ago-2026 (Switch retiró `/estadodecuenta/obtener`
// el 19-ago): hoy es el motor de reportes por uuid. Eso vive entero en
// `web-client.ts` + el adaptador de `estadocuenta-web.ts`; de este archivo hacia
// abajo no cambió nada.
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
// CUATRO guardas:
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
//   4. **Reporte CORTO ⇒ tampoco se escribe** (24-ago-2026). El guard 1 solo
//      atrapa el cero absoluto y el guard 2 no puede ver esto: el cuadre compara
//      nuestros totales contra los totales DEL MISMO reporte, así que un reporte
//      a medias cuadra al centavo consigo mismo. Si los clientes con saldo caen
//      por debajo del 70% de los que la tabla ya conoce, la corrida termina en
//      `error` sin tocar una fila. Ver `PISO_CLIENTES_REPORTE`.
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
import { particionarFilas } from "./monto-guard";
import { calibrarUmbral, detallesDeRechazo, avisarMontosImposibles } from "./monto-guard-io";
import { createSwitchSyncLog, finishSwitchSyncLog, type SwitchSyncTriggeredBy } from "./sync-log";

/** La única empresa que hoy usa este camino. */
export const EMPRESA_CARTERA_WEB: EmpresaKey = "confecciones_boston";

/** Filas por UPSERT. Mismo tamaño que el sync del API. */
const UPSERT_BATCH = 100;

/**
 * Capacidad de `switch_estadocuenta.plazo_credito`, que es `numeric(8,2)`:
 * 8 dígitos con 2 decimales → 6 enteros → |x| < 10^6.
 *
 * NO es un umbral de plata (eso lo decide `monto-guard`, y solo él): es el
 * borde físico de la columna, derivado de su precisión en vez de escrito a
 * mano — por eso se calcula y no se teclea la constante.
 */
const PLAZO_CREDITO_LIMITE = 10 ** 6;

/** Tolerancia del cuadre contra `saldosTotales`. Un centavo: los montos son
 *  `numeric(12,4)` y los dos lados suman los mismos números, así que cualquier
 *  diferencia real es un error de interpretación, no de redondeo. */
const TOLERANCIA = 0.01;

/**
 * Piso de "el reporte vino COMPLETO", como fracción de los clientes con saldo
 * que la tabla YA conoce para esta empresa.
 *
 * 🩸 POR QUÉ ES OBLIGATORIO, y por qué no alcanza con el guard de reporte vacío.
 * El reconcile pone `saldo = 0` a TODO documento de la empresa que esta corrida
 * no reescribió (`synced_at < runStamp`). Eso es correcto cuando el universo
 * llegó entero —"no vino en el reporte" = "ya no debe"— y es una CATÁSTROFE
 * cuando llegó a medias: cada cliente que faltara quedaría con la deuda en cero,
 * en silencio y con la corrida anotada `success`. El guard de vacío solo atrapa
 * el caso extremo (0 clientes); un reporte que trae la mitad se ve perfectamente
 * sano y es igual de destructivo.
 *
 * ⚠️ Y el cuadre contra Switch NO cubre esto: compara nuestros totales contra los
 * `totales` DEL MISMO reporte. Si el reporte viene corto, los dos lados vienen
 * cortos y cuadran al centavo. Son guardas de cosas distintas: el cuadre dice
 * "leí bien lo que me mandaron", éste dice "me mandaron todo".
 *
 * El 70% es holgado a propósito —es el mismo piso que usa el guard de barrido
 * corto de `sync-articulo-marca`, por el mismo motivo—: la cartera se mueve sola
 * todos los días (clientes que terminan de pagar salen del reporte), así que un
 * piso ajustado sería la alerta que suena por un martes tranquilo. Que los
 * clientes con deuda caigan a menos de dos tercios de un día para el otro no es
 * un movimiento de negocio plausible; media descarga sí. Medido el 24-ago-2026:
 * la tabla conoce 383 clientes con saldo y el reporte trae 386.
 */
export const PISO_CLIENTES_REPORTE = 0.7;

/**
 * Cuántos clientes DISTINTOS con saldo distinto de cero tiene hoy la tabla para
 * esta empresa. Es la vara del guard: exactamente los clientes a los que el
 * reconcile les pondría la deuda en cero si el reporte viniera corto.
 *
 * Se leen solo las filas con saldo != 0 (888 de 2.129 en Boston) y solo la
 * columna del cliente: es la consulta más chica que contesta la pregunta.
 */
export async function clientesConSaldoConocidos(empresaKey: string): Promise<number> {
  const vistos = new Set<number>();
  const PAGINA = 1000;
  for (let desde = 0; desde < 100_000; desde += PAGINA) {
    const { data, error } = await supabaseServer
      .from("switch_estadocuenta")
      .select("cliente_switch_id")
      .eq("empresa_key", empresaKey)
      .neq("saldo", 0)
      .range(desde, desde + PAGINA - 1);
    if (error) throw new Error(`no pude medir la cartera conocida: ${error.message}`);
    if (!data?.length) break;
    for (const f of data) {
      const id = (f as { cliente_switch_id: number | null }).cliente_switch_id;
      if (id !== null && id !== undefined) vistos.add(id);
    }
    if (data.length < PAGINA) break;
  }
  return vistos.size;
}

/**
 * ¿El reporte trae bastantes clientes como para dejar reconciliar? PURA, para
 * poder probar las dos direcciones sin tocar la base.
 *
 * Con la tabla vacía (`conocidos === 0`) no hay vara y se deja pasar: es la
 * primera carga, y exigirle un piso a la nada bloquearía el arranque para
 * siempre. Mismo criterio que `filasPrevias > 0` en `sync-articulo-marca`.
 */
export function reporteVieneCompleto(
  clientesEnReporte: number,
  conocidos: number,
  piso: number = PISO_CLIENTES_REPORTE,
): boolean {
  if (conocidos === 0) return true;
  return clientesEnReporte >= conocidos * piso;
}

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
async function reconciliar(
  empresaKey: string,
  runStamp: string,
  protegidos: readonly number[] = [],
): Promise<number> {
  let q = supabaseServer
    .from("switch_estadocuenta")
    .update({ saldo: 0, updated_at: new Date().toISOString() })
    .eq("empresa_key", empresaKey)
    .lt("synced_at", runStamp)
    .neq("saldo", 0);
  // 🩸 Una fila rechazada por el guard NO se reescribe, así que su `synced_at`
  // queda viejo y este reconcile la leería como "documento cerrado" → le pondría
  // saldo 0, que es EXACTAMENTE el último valor bueno que el guard existe para
  // conservar. Se excluyen sus ccte_id (mismo remedio que el sync del API).
  if (protegidos.length > 0) q = q.not("ccte_id", "in", `(${protegidos.join(",")})`);
  const { data, error } = await q.select("ccte_id");
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

    // ─── 4b. Guard de montos imposibles ─────────────────────────────────────
    //
    // 🩸 Este camino (el ÚNICO por el que pasa confecciones_boston) no tenía el
    // guard que el sync del API sí aplica desde el #345, y una sola cifra
    // corrupta de Switch reventaba el UPSERT ENTERO con `numeric field overflow`
    // — `total`/`saldo` son numeric(12,4), o sea que topan en $99.999.999,9999.
    // Boston quedó 3 días sin actualizar la cartera por eso (1, 2 y 3-ago-2026).
    // El cuadre de arriba se hace ANTES a propósito: sigue comparando contra lo
    // que publica Switch usando TODAS las filas, así que el guard no puede
    // enmascarar un error de lectura nuestro.
    const umbralCxc = await calibrarUmbral("cxc", empresaKey);
    const part = particionarFilas(
      "cxc",
      filas,
      umbralCxc,
      (f) => `${f.secuencial ?? f.ccte_id} · ${f.cliente_nombre ?? ""}`.trim(),
    );
    // `plazo_credito` es numeric(8,2) → topa en 999.999,99, MUY por debajo de
    // las columnas de plata, y el guard de montos no lo mira (no es plata). Un
    // valor corrupto ahí desbordaría igual y tumbaría el lote entero. Es un
    // plazo, no un saldo: se anula la celda y se anota, en vez de descartar el
    // documento — perder el plazo no cuesta nada, perder la deuda sí.
    const filasBuenas = part.buenas.map((f) => {
      const p = f.plazo_credito;
      if (p === null || Math.abs(p) < PLAZO_CREDITO_LIMITE) return f;
      skips.push({
        facturaId: f.cliente_switch_id,
        secuencial: f.secuencial,
        campo: "plazo_credito_fuera_de_rango",
        valorCrudo: String(p),
      });
      return { ...f, plazo_credito: null };
    });
    const protegidos = part.rechazadas.map((r) => r.fila.ccte_id);
    if (part.rechazadas.length > 0) {
      skips.push(...detallesDeRechazo("cxc", part.rechazadas, umbralCxc));
      console.error(
        `[cartera-web ${empresaKey}] MONTO IMPOSIBLE en ${part.rechazadas.length} documento(s) ` +
          `(umbral ${umbralCxc}) — se conserva el último valor bueno`,
        part.rechazadas[0].columnas,
      );
    }

    const conCifras = {
      ...base,
      logId,
      documentos: filasBuenas.length,
      clientes: resumen.clientes,
      resumen,
      publicadoPorSwitch: publicado,
      rondas: reporte.rondas,
      skipped: skips.length,
    };

    // ─── 4c. 🔴 GUARD DEL REPORTE INCOMPLETO ────────────────────────────────
    //
    // Va ANTES del upsert Y antes del corte del dry-run, a propósito: un dry-run
    // existe justamente para saber si esta corrida se puede escribir, así que
    // tiene que fallar por lo mismo que fallaría la de verdad.
    const conocidos = await clientesConSaldoConocidos(empresaKey);
    if (!reporteVieneCompleto(resumen.clientes, conocidos)) {
      throw new Error(
        `el reporte trajo ${resumen.clientes} clientes con saldo contra ${conocidos} que ya conoce la tabla ` +
          `(menos del ${Math.round(PISO_CLIENTES_REPORTE * 100)}%) — vino incompleto. No se escribe ni se reconcilia: ` +
          `el reconcile les pondría la deuda en CERO a los que faltan.`,
      );
    }

    if (opts.dryRun) {
      return { ...conCifras, ok: true, durationMs: Date.now() - startedAt };
    }

    // ─── 5. Escribir y reconciliar, en la misma corrida ──────────────────────
    await upsertFilas(filasBuenas, runStamp);
    const cerrados = await reconciliar(empresaKey, runStamp, protegidos);

    console.error(
      `[cartera-web ${empresaKey}] ${filasBuenas.length} documentos de ${resumen.clientes} clientes ` +
        `= ${resumen.total} (0-90 ${resumen.d0_90} · 91-120 ${resumen.d91_120} · 121+ ${resumen.d121_plus}); ` +
        `${cerrados} documentos cerrados; ${skips.length} omitidos; ${reporte.rondas} rondas`,
    );

    // Aviso DESPUÉS de escribir; nunca tumba la corrida.
    if (part.rechazadas.length > 0) {
      try {
        await avisarMontosImposibles({
          familia: "cxc",
          empresaKey,
          syncType: "estadocuenta",
          rechazadas: part.rechazadas,
          umbral: umbralCxc,
          logId,
        });
      } catch (e) {
        console.error(`[cartera-web ${empresaKey}] aviso de monto imposible falló: ${String(e)}`);
      }
    }

    // 🩸 `skipDetails` FALTABA acá, y era el único camino de confecciones_boston:
    // el log salía con `records_skipped: 1` y `skip_details: null`, o sea que se
    // sabía que ALGO se había rechazado pero nunca cuál ni de cuánto. Medido el
    // 25-ago-2026 en producción: 6 de 6 corridas de `confecciones_boston/
    // estadocuenta` con rechazo y detalle en blanco, contra 5 de 5 CON detalle
    // en los demás syncs. Sin esto, la línea en pantalla no tiene qué decir.
    await finishSwitchSyncLog(logId, "success", {
      inserted: filasBuenas.length,
      updated: cerrados,
      skipped: skips.length,
      skipDetails: skips.length > 0 ? skips : undefined,
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

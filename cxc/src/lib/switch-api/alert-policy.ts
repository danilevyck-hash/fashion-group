/**
 * Política de alertas Telegram para errores de sync Switch (anti-ruido).
 *
 * ── LA REGLA, EN UNA LÍNEA: NO SE AVISA AL PRIMER FALLO ──────────────────────
 * 28-jul-2026. Pedido de Daniel, textual: *"quiero q un error de crones me avise
 * si no paso de 2 en adelante, no cada vez porq aveces se recupera y es en
 * vano"*. Es exactamente la condición (2) de la regla de tres del canal de
 * sistema, escrita en `src/lib/alertas/canal.ts`: *"No se arregla solo — si la
 * reconciliación, una 2ª oportunidad o el propio cron lo recupera en horas, NO
 * se avisa: que el sistema se repare es el sistema funcionando bien, no un
 * incidente"*. Este archivo la tenía a medias y ahora la aplica entera.
 *
 * 🩸 **Lo que la tenía a medias:** el streak solo cubría los errores
 * SILENCIABLES (401 de sesión única, red/timeout/5xx, la página de excepción de
 * Switch). Todo lo demás —un `statement timeout`, un UPSERT fallido, un
 * "No pude crear switch_sync_log"— caía en la rama `inmediatos` y sonaba al
 * primer fallo. Caso medido que disparó el cambio: **27-jul 23:11 UTC** llegó
 * *"3 sync(s) fallaron — american_classic/facturas, vistana/facturas,
 * fashion_wear/facturas: No pude crear switch_sync_log: vacío"* (la base estaba
 * bajo presión de memoria; `db-salud` ya había avisado eso mismo a las 22:45,
 * que SÍ era la alerta correcta) y **a las 00:11 las 8 empresas corrieron bien
 * solas**. Ese aviso no debió salir: no había nada que hacer.
 *
 * ── LA UNIDAD DE "SEGUIDAS" ES EL PAR (empresa, sync_type) ───────────────────
 * `vistana/facturas` y `joystep/facturas` son sesiones de Switch distintas sobre
 * datos distintos: que fallen una vez cada uno NO es un problema repitiéndose,
 * es un chispazo que la corrida siguiente arregla. Lo que merece un aviso es el
 * MISMO trabajo fallando otra vez sin haber vuelto a funcionar en el medio.
 * Es la unidad que ya usaba el streak de 401 y la misma con la que la
 * reconciliación recupera; no se inventa ninguna agrupación nueva.
 *
 * ── LOS CINCO DESENLACES (`evaluateSwitchEscalation`) ────────────────────────
 *   racha        streak ≥ 2  → AVISA, y el texto dice cuántas van y desde cuándo.
 *   primer-fallo streak = 1  → calla. La corrida anterior del par fue bien; la
 *                              siguiente decide.
 *   no-medible   streak = 0 CON historia del par → calla. La corrida que acaba de
 *                              fallar no llegó a registrarse (su propio INSERT en
 *                              switch_sync_log falló). No es evidencia de nada;
 *                              la corrida siguiente vuelve a medir. ESTE es el
 *                              caso de las 23:11.
 *   sin-historia streak = 0 SIN una sola fila del par → AVISA igual (fail-open).
 *                              Si el par nunca deja rastro, el streak no va a
 *                              poder medir NUNCA y callarlo sería silencio
 *                              permanente. Caso real: `american_classic/articulos`
 *                              falló 5, 8 y 10-jul sin una fila previa en el log.
 *   lectura-fallo la consulta al log falló → AVISA igual (fail-open). No se puede
 *                              descartar nada.
 *   licencia     "LICENCIA NO ACTIVA" → AVISA al primer fallo, sin mirar racha.
 *                              Es la única excepción y no es nueva: el repo ya la
 *                              excluye a mano en `isSwitch401` y en
 *                              `isSwitchTransitorio`. Un servicio cortado por el
 *                              proveedor no se arregla con otra corrida.
 *
 * ── EL FALLO QUE NUNCA VUELVE A CORRER NO QUEDA EN SILENCIO ──────────────────
 * Es el riesgo obvio de esperar un segundo fallo: si el cron queda trabado o
 * retirado, ese segundo fallo no llega nunca. **No hace falta un mecanismo
 * nuevo: los 11 routes que llaman acá registran el heartbeat SOLO cuando no hubo
 * ningún error** (`if (errors.length === 0) recordCronHeartbeat(...)`). O sea que
 * un fallo callado deja el heartbeat sin refrescar, y a las 26h
 * `cronsStaleParaAlerta` (watchdog Telegram de la reconciliación) y health-crons
 * lo levantan igual que siempre. Para las entradas intradía la red llega antes:
 * `clasificarSlots` re-ejecuta el slot desatendido en la pasada siguiente de la
 * reconciliación (10/14/18 UTC) y, si vuelve a fallar, eso YA es el segundo
 * fallo del par → avisa. Candado: `alerta-cron-dos-fallos.test.ts`.
 *
 * ── MEDICIÓN SOBRE 4 SEMANAS (29-jun → 28-jul-2026, producción) ──────────────
 * 22 alertas llegaron a Telegram; 12 eran de sync. Con esta regla se habrían
 * ahorrado **7** y habrían seguido saliendo **5** (3 de `sin-historia`, 1 racha
 * real de 2-3 corridas del 19-jul, 1 LICENCIA). De las 7 calladas, **ninguna
 * quedó rota**: las 7 tenían un `success` del mismo par en las horas siguientes.
 * La que más se acerca a "problema real" es `joystep/utilidad: faltan env vars`
 * del 27-jul 18:19 — se arregló sola porque alguien estaba trabajando ahí en ese
 * momento; de no ser así, la corrida siguiente la habría avisado como racha.
 *
 * ── CONTEXTO DE SWITCH (lo de antes, sigue vigente) ──────────────────────────
 * Switch es sesión única por empresa (un login concurrente mata el token del
 * otro → 401 transitorio) y además su red se cae a ratos (ECONNREFUSED /
 * CONNECT_TIMEOUT / 5xx, incidente 17-jul-2026: ~10 alertas de red que la
 * reconciliación de 10:00/14:00/18:00 recuperó sola a las 14:18).
 * `isSwitchSilenciable` sigue existiendo porque lo usan otros archivos
 * (outage-resumen, la clasificación de slots), pero **ya no decide si se avisa**:
 * eso lo decide la racha, para todos los errores por igual.
 *
 * Los routes que usan esto: switch-sync (facturas/estadocuenta/costo),
 * sync-recibos, sync-utilidad, sync-proveedores y —vía sync-log.ts—
 * switch-articulos (articulos) y los catálogos (catalogo_reebok /
 * catalogo_joybees / catalogo_tommy). Todos registran cada corrida por
 * empresa_key+sync_type en switch_sync_log; ese log es la fuente del streak.
 */

import { supabaseServer } from "@/lib/supabase-server";
import { shortError } from "@/lib/telegram";
import { enviarSistema } from "@/lib/alertas/canal";
import { logCronError } from "@/lib/cron-telemetry";
import { mapEmpresaName } from "@/lib/empresa-mapping";
import { esRunAtascado } from "./sync-log";

/** Qué le pasa AL NEGOCIO si este sync se queda atrás. Traduce el `sync_type`
 *  interno a la consecuencia que Daniel puede ver en la app. */
export function consecuenciaDeSyncType(syncType: string): string {
  switch (syncType) {
    case "facturas":
      return "las ventas que ves en la app pueden estar viejas.";
    case "estadocuenta":
      return "los saldos de Cuentas por Cobrar pueden estar viejos.";
    case "recibos":
      return "los pagos de clientes pueden no estar reflejados todavía.";
    case "costo":
    case "utilidad":
    case "articulos":
      return "los costos y la utilidad que ves en los reportes pueden estar viejos.";
    case "articulo_marca":
      return "en Multifashion, lo más vendido por marca puede mostrar productos como \"Sin marca\".";
    case "articulo_info":
      return "en el tab Referencia de Ventas, la existencia y el precio de etiqueta pueden estar viejos.";
    case "proveedores":
      return "lo que debemos a proveedores puede estar viejo.";
    // 🩸 FALTABA, y el default mandaba a Daniel a ninguna parte. El 1-sep-2026
    // Switch cambió el formato del reporte y este sync falló cinco días seguidos
    // en las cinco empresas que tienen gastos; el aviso decía "puede haber datos
    // sin actualizar en la app", que no nombra una sola pantalla. Un aviso que no
    // dice dónde mirar cuesta el mismo susto y no compra la acción.
    case "egresos_varios":
      return "en el módulo Gastos, lo que salió de caja y del banco puede estar viejo o incompleto.";
    case "ventas_tipos":
      return "hay ventas que el tablero está contando como CERO: Switch estrenó un tipo de comprobante que el sistema todavía no sabe leer.";
    case "catalogo_reebok":
    case "catalogo_joybees":
    case "catalogo_tommy":
      return "el catálogo que ven los clientes sigue con los precios e inventario anteriores.";
    default:
      return "puede haber datos sin actualizar en la app.";
  }
}

/**
 * ¿El mensaje corresponde a un 401/token de Switch (transitorio de sesión
 * única)? Calibrado contra switch_sync_log de producción (jul-2026):
 *   - token muerto a media paginación → "… → HTTP 401: TOKEN INVALIDO"
 *   - auth rechazada                  → "Auth fallo: HTTP 401 — …"
 * "LICENCIA NO SE ENCUENTRA ACTIVA" llega con HTTP 400 (no matchea), pero se
 * excluye explícito por si Switch algún día la devuelve como 401: esa alerta
 * SIEMPRE debe salir de inmediato.
 */
export function isSwitch401(message: string | null | undefined): boolean {
  if (!message) return false;
  if (/LICENCIA/i.test(message)) return false;
  return /HTTP 40[13]|TOKEN INVALIDO|TOKEN EXPIRADO/i.test(message);
}

/**
 * ¿Error transitorio de red/servidor de Switch? Calibrado contra los mensajes
 * que arma client.ts (rawCall) y switch_sync_log de producción (17-jul-2026):
 *   - "Error de red en /autenticacion: fetch failed (ECONNREFUSED)"
 *   - "Error de red en …: fetch failed (UND_ERR_CONNECT_TIMEOUT)"
 *   - "Timeout >30000ms en /apifactura"
 *   - "… → HTTP 502: Bad Gateway"
 *
 * ── Ampliado 27-jul-2026: la página de excepción de Switch ────────────────────
 * Faltaba la forma MÁS RUIDOSA de que Switch se caiga: responder HTTP 200 con su
 * página de excepción HTML en vez del token (client.ts:295 →
 * "Auth respondió 200 pero sin token: <!DOCTYPE html><title>Exception - SWITCH
 * SOFT</title>…"), o soltarla a media llamada ("update products sku=…:
 * <!DOCTYPE html>…", reebok-catalogo 24-jul).
 *
 * Es exactamente lo mismo que un 502 —Switch no está sirviendo— pero como el
 * código HTTP es 200 no matcheaba ningún patrón y alertaba de INMEDIATO, con
 * 200 caracteres de HTML crudo al celular de Daniel.
 *
 * Y el sistema YA SABÍA que eso es una caída: `esErrorDeCaidaSwitch` en
 * outage-resumen.ts lo clasificaba como "Switch estuvo caído… sin impacto"
 * desde jul-2026. O sea que un archivo lo llamaba caída informativa y el otro
 * emergencia. Ahora el predicado vive UNA sola vez —acá— y outage-resumen lo
 * reusa; el test `alertas-canal.test.ts` falla si vuelven a divergir.
 *
 * Evidencia de que es transitorio (switch_sync_log, 30 días a 26-jul-2026):
 * 5 ocurrencias, 5 recuperadas por sí solas en ≤12h, 0 sostenidas.
 *
 * LICENCIA se excluye explícito: esa alerta SIEMPRE sale de inmediato (aunque
 * venga envuelta en la página HTML).
 */
export function isSwitchTransitorio(message: string | null | undefined): boolean {
  if (!message) return false;
  if (/LICENCIA/i.test(message)) return false;
  if (/Error de red en |Timeout >\d+ms|HTTP 5\d\d/i.test(message)) return true;
  // Switch sirviendo su página de excepción en vez de datos = Switch caído.
  return /<!DOCTYPE\s+html|Auth respondió \d+ pero sin token/i.test(message);
}

/** Silenciable = transitorio esperado (sesión única 401 o red/5xx) que la
 *  reconciliación casi siempre recupera sola.
 *
 *  ⚠️ Desde el 28-jul-2026 esto YA NO decide si se avisa — la racha decide, para
 *  todos los errores por igual (ver el encabezado). Sigue exportada porque la
 *  usan `outage-resumen.ts` (¿fue una caída de Switch?) y la clasificación de
 *  slots de la reconciliación. */
export function isSwitchSilenciable(message: string | null | undefined): boolean {
  return isSwitch401(message) || isSwitchTransitorio(message);
}

/**
 * ¿Este error tiene que avisar al PRIMER fallo, sin esperar una racha?
 *
 * Una sola cosa entra acá: **LICENCIA NO SE ENCUENTRA ACTIVA**. El proveedor nos
 * cortó el servicio, y eso ninguna corrida siguiente lo arregla: se arregla
 * llamando a Switch. No es una excepción nueva — `isSwitch401` e
 * `isSwitchTransitorio` ya la excluían a mano de todo silenciamiento desde
 * jul-2026, con el comentario "esa alerta SIEMPRE debe salir de inmediato";
 * acá esa decisión queda escrita UNA vez y con nombre.
 *
 * La lista se mantiene deliberadamente CORTA. Cada entrada nueva es un aviso que
 * vuelve a sonar al primer chispazo, que es justo lo que Daniel pidió cortar.
 * Un error de configuración ("faltan env vars") tampoco se arregla solo, pero es
 * una clase abierta e imposible de reconocer por texto: se avisa igual, una
 * corrida después, como racha.
 */
export function alertaInmediataSiempre(message: string | null | undefined): boolean {
  return !!message && /LICENCIA/i.test(message);
}

interface SyncLogStreakRow {
  status: string;
  started_at: string;
  error_message: string | null;
}

/** Por qué se decidió avisar (o callar). Se persiste en cron_email_errors para
 *  poder auditar después por qué Daniel recibió —o no— un mensaje. */
export type MotivoEscalacion =
  | "racha" // 2+ corridas seguidas fallando → avisa
  | "primer-fallo" // la anterior fue bien → calla
  | "no-medible" // esta corrida no se registró, pero el par tiene historia → calla
  | "sin-historia" // el par nunca dejó una fila → fail-open, avisa
  | "lectura-fallo" // no se pudo consultar el log → fail-open, avisa
  | "licencia"; // el proveedor nos cortó el servicio → avisa al primer fallo

export interface EscalationSwitch {
  /** true si hay que mandar la alerta Telegram. */
  escalate: boolean;
  /** Corridas consecutivas fallidas del par (incluida la actual). 0 = no medible. */
  streak: number;
  /** started_at de la PRIMERA corrida de la racha (desde cuándo falla). */
  sinceIso: string | null;
  motivo: MotivoEscalacion;
}

/**
 * Corridas consecutivas FALLIDAS (desde la más reciente hacia atrás) del par.
 * `rows` viene ordenado descendente por started_at y sin 'running'. Pura para
 * poder testearla sin DB.
 *
 * ── Cuenta CUALQUIER error, no solo los "silenciables" (28-jul-2026) ─────────
 * Hasta hoy solo sumaban los errores silenciables y **un error de otra clase
 * CORTABA la racha**. Eso hacía dos cosas malas a la vez: los errores no
 * silenciables no tenían racha ninguna (sonaban al primer fallo, que es lo que
 * Daniel pidió cortar), y un par que alterna 401 → timeout de base → 401 se leía
 * como tres "primeros fallos" seguidos. Para la pregunta que importa —"¿esto se
 * está recuperando solo?"— el motivo de cada fallo es irrelevante: lo que cuenta
 * es que entre uno y otro **no hubo un success**. Un `success` sigue siendo lo
 * único que reinicia la racha.
 *
 * ── Las filas cerradas por ATASCO no cuentan, ni a favor ni en contra ────────
 * 🩸 27-jul-2026. Una fila que el candado cerró por atasco (`esRunAtascado`)
 * lleva `status='error'`, pero no es un error de Switch: es un proceso que
 * Vercel mató al agotar su `maxDuration` y que nunca llegó a escribir su
 * desenlace. No dice NADA sobre el proveedor. Contarla como fallo real era
 * mentir en las DOS direcciones:
 *   - hacia arriba: sumaba a la racha y podía disparar una alerta escalada
 *     ("falla desde las HH:MM") por un timeout NUESTRO;
 *   - hacia abajo, y peor: como el texto del atasco NO era silenciable, la fila
 *     CORTABA la racha. Un 401 real de Switch con una corrida atascada en el
 *     medio se leía como "primer fallo" y se callaba, corrida tras corrida.
 * Se SALTEA (`continue`), no se corta: una racha legítima que la atraviesa
 * queda intacta. Hay 17 filas así en producción, así que el predicado también
 * reconoce las redacciones históricas. (Con el cambio de hoy la mitad "hacia
 * abajo" del daño ya no aplica —ningún error corta la racha—, pero el skip
 * sigue haciendo falta para la mitad "hacia arriba": un atasco nuestro no puede
 * ser una de las dos corridas que despiertan a Daniel.)
 */
export function computeStreakFallos(rows: SyncLogStreakRow[]): { streak: number; sinceIso: string | null } {
  let streak = 0;
  let sinceIso: string | null = null;
  for (const row of rows) {
    if (esRunAtascado(row.error_message)) continue; // ni fallo ni éxito: no es evidencia
    if (row.status !== "error") break; // un success reinicia la racha
    streak++;
    sinceIso = row.started_at;
  }
  return { streak, sinceIso };
}

/**
 * ¿La corrida que ACABA de fallar es la 2da (o más) consecutiva del par
 * (empresa, sync_type)? Cuando esto corre, el sync ya finalizó su fila de
 * switch_sync_log como 'error' (los syncs finalizan el log antes de rethrow),
 * así que la corrida actual es la primera fila del resultado.
 *
 * Los cinco desenlaces están explicados en el encabezado del archivo. Los dos
 * fail-open —`sin-historia` y `lectura-fallo`— son lo que impide que esta regla
 * abra un agujero de silencio: si el par NUNCA deja rastro (p. ej. el CHECK de
 * `sync_type` no admite el tipo nuevo y el INSERT degrada, ver sync-log.ts), la
 * racha jamás va a poder medir y callarlo sería callarlo para siempre.
 *
 * La distinción fina que hace todo el trabajo: **"no hay fila de ESTA corrida"
 * no es lo mismo que "no hay NINGUNA fila del par"**. Lo primero es un tropiezo
 * puntual de nuestra telemetría (la base tosió justo en ese INSERT) y la corrida
 * siguiente vuelve a medir; lo segundo es telemetría rota de raíz. Sin separar
 * los dos casos había que elegir entre el ruido de las 23:11 y el silencio
 * permanente de `american_classic/articulos`.
 */
export async function evaluateSwitchEscalation(
  empresaKey: string,
  syncType: string,
): Promise<EscalationSwitch> {
  try {
    const { data, error } = await supabaseServer
      .from("switch_sync_log")
      .select("status, started_at, error_message")
      .eq("empresa_key", empresaKey)
      .eq("sync_type", syncType)
      .neq("status", "running")
      .order("started_at", { ascending: false })
      .limit(10);
    if (error || !data) {
      console.error(`[alert-policy] no pude leer switch_sync_log (${empresaKey}/${syncType}): ${error?.message ?? "vacío"}`);
      return { escalate: true, streak: 0, sinceIso: null, motivo: "lectura-fallo" };
    }
    const rows = data as SyncLogStreakRow[];
    if (rows.length === 0) {
      // El par no tiene UNA sola corrida registrada: su logging está roto de
      // raíz y la racha nunca va a poder medir. Fail-open, o el silencio sería
      // permanente.
      return { escalate: true, streak: 0, sinceIso: null, motivo: "sin-historia" };
    }
    const { streak, sinceIso } = computeStreakFallos(rows);
    if (streak >= 2) return { escalate: true, streak, sinceIso, motivo: "racha" };
    if (streak === 1) return { escalate: false, streak, sinceIso, motivo: "primer-fallo" };
    // streak = 0 con historia: la corrida que acaba de fallar no llegó a
    // registrarse. No es evidencia de nada — la siguiente vuelve a medir, y si
    // no hay siguiente, el heartbeat sin refrescar lo levanta el watchdog.
    return { escalate: false, streak: 0, sinceIso: null, motivo: "no-medible" };
  } catch (err) {
    console.error(`[alert-policy] evaluateSwitchEscalation threw: ${err instanceof Error ? err.message : String(err)}`);
    return { escalate: true, streak: 0, sinceIso: null, motivo: "lectura-fallo" };
  }
}

/** "9 jul 2026, 02:50" en hora Panamá, para el "desde cuándo" de la alerta. */
function fmtPanama(iso: string): string {
  return new Intl.DateTimeFormat("es-PA", {
    timeZone: "America/Panama",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

export interface CronSwitchError {
  empresaKey: string;
  /** sync_type de switch_sync_log (facturas|estadocuenta|costo|recibos|utilidad|
   *  articulos|multifashion|catalogo_reebok|catalogo_joybees). */
  syncType: string;
  error: string;
}

/** Un error ya evaluado: el fallo más el veredicto de la racha. */
export interface ErrorEscalado extends CronSwitchError {
  escalacion: EscalationSwitch;
}

/**
 * El texto que va al celular. PURA (sin I/O) para poder testear la redacción sin
 * base ni Telegram — que es la única forma de revisar cómo se lee un mensaje que
 * ojalá casi nunca salga.
 *
 * Manda UN mensaje aunque escalen varios pares a la vez: la noche del 27-jul
 * fueron 3 de un saque, y tres notificaciones seguidas en el iPhone diciendo lo
 * mismo son peores que una con tres renglones.
 *
 * Lo que Daniel tiene que poder leer sin abrir la app: **que ya van dos o más**.
 * "Falló" y "falló dos veces seguidas y no se recuperó" son cosas distintas, y
 * la segunda es la que pide que haga algo. Por eso el conteo va en el renglón de
 * cada par, no escondido en un detalle técnico.
 */
export function construirMensajeEscalado(items: ErrorEscalado[], nota = ""): string {
  const lineas = items.map((e) => {
    const empresa = mapEmpresaName(e.empresaKey);
    if (e.escalacion.motivo === "racha" && e.escalacion.sinceIso) {
      return `· ${empresa}: van ${e.escalacion.streak} corridas seguidas fallando desde ${fmtPanama(e.escalacion.sinceIso)}.`;
    }
    if (e.escalacion.motivo === "licencia") {
      return `· ${empresa}: Switch dice que la licencia no está activa. Esto no se arregla solo.`;
    }
    // sin-historia / lectura-fallo: no se pudo contar. Se dice tal cual en vez de
    // inventar un número — un "van 0" sería mentira y un "van 1" también.
    return `· ${empresa}: falló y no pude confirmar si ya venía fallando, así que aviso por las dudas.`;
  });

  // Consecuencias sin repetir: si los 3 pares son de ventas, va una sola frase.
  const consecuencias = [...new Set(items.map((e) => consecuenciaDeSyncType(e.syncType)))];
  const detalle = [...new Set(items.map((e) => shortError(e.error)))].join(" · ");
  const encabezado =
    items.length === 1
      ? "Una sincronización con Switch no se está recuperando sola."
      : `${items.length} sincronizaciones con Switch no se están recuperando solas.`;

  return (
    `${encabezado}\n${lineas.join("\n")}\n` +
    `Qué significa: ${consecuencias.join(" ")}\n` +
    `Qué hacer: avisame para revisarlo.\n` +
    `Detalle: ${detalle}${nota}`
  );
}

/**
 * Punto único de alerta para los crons de sync Switch (11 call sites).
 *
 * TODOS los errores pasan por la misma pregunta —"¿este par ya falló la corrida
 * anterior?"— y solo avisan si la respuesta es sí. La única excepción es
 * LICENCIA (ver `alertaInmediataSiempre`). Los cinco desenlaces posibles y por
 * qué cada uno avisa o calla están en el encabezado del archivo.
 *
 * Lo que se calla NO se pierde: se persiste igual en cron_email_errors con
 * `telegram:false` y con el motivo escrito, así que después se puede auditar por
 * qué no sonó. Nunca lanza.
 *
 * `opts.nota`: contexto extra que se anexa al mensaje de Telegram (ej. los
 * catálogos agregan "Su catálogo NO se modificó (fail-safe)").
 */
export async function alertSwitchCronErrors(
  cronName: string,
  errores: CronSwitchError[],
  opts?: { nota?: string },
): Promise<void> {
  const nota = opts?.nota ? `\n${opts.nota}` : "";

  const evaluados: ErrorEscalado[] = [];
  for (const e of errores) {
    // LICENCIA no espera una segunda corrida: el proveedor nos cortó el
    // servicio y ninguna corrida siguiente lo va a arreglar.
    const escalacion: EscalationSwitch = alertaInmediataSiempre(e.error)
      ? { escalate: true, streak: 1, sinceIso: null, motivo: "licencia" }
      : await evaluateSwitchEscalation(e.empresaKey, e.syncType);
    evaluados.push({ ...e, escalacion });
  }

  const escalan = evaluados.filter((e) => e.escalacion.escalate);
  if (escalan.length > 0) {
    await enviarSistema(construirMensajeEscalado(escalan, nota));
  }

  // El rastro completo, avise o no. El motivo va en el texto para que
  // cron_email_errors se pueda auditar sin adivinar.
  for (const e of evaluados) {
    const m = e.escalacion.motivo;
    const prefijo = e.escalacion.escalate
      ? `fallo repetido (${e.escalacion.streak || "?"} corridas, ${m})`
      : `fallo sin alerta (${m})`;
    await logCronError(cronName, `${prefijo} — ${e.empresaKey}/${e.syncType}: ${e.error}`, null, {
      telegram: false,
    });
  }
}

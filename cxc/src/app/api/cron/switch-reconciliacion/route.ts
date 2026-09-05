// ─────────────────────────────────────────────────────────────────────────────
// GET /api/cron/switch-reconciliacion
//
// Red de seguridad del ciclo diario de syncs Switch. Corre DESPUÉS de toda la
// cadena (switch-sync 05:30-06:30, clientes-master 07:00, utilidad 08:00, recibos
// 08:30, articulos 09:00). Detecta qué quedó SIN success de HOY (fecha Panamá) y
// lo RE-EJECUTA IN-PROCESS —llamando las funciones de sync directamente, NO por
// self-fetch HTTP.
//
// POR QUÉ IN-PROCESS (incidente 7-jun-2026): el scheduler de Vercel pierde
// invocaciones de cron (3 de 4 switch-sync + utilidad + clientes-master murieron
// sin dejar ni fila `running`). La versión vieja recuperaba por
// `fetch(${origin}/api/cron/switch-sync?...)` en lotes de 2 con maxDuration=300:
// 6 empresas × ~200s excedían el límite → la mataban a media recuperación y los
// switch-sync self-fetched no sobrevivían a la muerte del caller → recuperó 0/16.
// Ahora ejecuta el trabajo dentro de ESTA invocación (maxDuration=800, techo del
// plan Pro desde el 25-jul-2026; bajo Hobby eran 300), serial por empresa
// (token único de Switch), idempotente
// (upserts), acotado por un presupuesto de tiempo. Lo que no entre en una pasada
// lo toma la siguiente: corre 3×/día (10:00, 14:00, 18:00 UTC), todas
// idempotentes.
//
// COBERTURA: switch-sync (facturas/estadocuenta/costo, por par vía
// switch_sync_log) + los crons colaterales de COLATERAL_CRONS (clientes-master,
// utilidad, recibos, articulos, proveedores, catálogos,
// alertas y resúmenes — detectados por cron_heartbeats sin success hoy). NO
// cubre backup ni acs-fidelizacion (pesados / sesión propia): esos tienen su
// propia 2ª entrada del día en vercel.json como segunda oportunidad.
//
// Telegram (Opción A, jun-2026 — SOLO fallos reales):
//   - Algo sigue sin success / sin tiempo → ALERTA (qué falló + último error;
//     las recuperaciones van como contexto dentro de la alerta).
//   - Ciclo 100% exitoso (con o SIN recuperaciones) → NO envía nada. Recuperar
//     es el sistema funcionando bien, no un fallo → silencio.
//
// SLOTS HUÉRFANOS (jul-2026): además de recuperar pares, cada pasada barre los
// heartbeats por-slot de switch-sync ("switch-sync:<tipo>-<hhmm>"). Un slot cuya
// invocación se perdió pero cuyos pares SÍ quedaron al día (por esta
// recuperación o por otra entrada que cubre los mismos pares) recibe la marca
// "switch-sync:<slot>#recuperado" — nunca su heartbeat propio, que sigue siendo
// la verdad de "la entrada se invocó y salió OK". Sin esto el watchdog reportaba
// slots stale con los datos perfectamente al día (25-jul-2026: facturas-2315,
// facturas-0015 y all-0535). Ver slotsHuerfanos en cron-telemetry.ts.
//
// Auth: Bearer con CRON_SECRET (igual que el resto de crons).
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { logoutAllSwitchSessions } from "@/lib/switch-api/client";
import { supabaseServer } from "@/lib/supabase-server";
import {
  syncEmpresaFacturas,
  syncEmpresaEstadoCuenta,
  syncCostoDiario,
} from "@/lib/switch-api/sync-empresa";
import { syncAllUtilidad, mesesCronDiario } from "@/lib/switch-api/sync-utilidad";
import { syncAllRecibos, mesesCronRecibos } from "@/lib/switch-api/sync-recibos";
import { syncArticulosDiario } from "@/lib/switch-api/sync-articulos";
import { syncClientesMaster } from "@/lib/switch-api/sync-clientes-master";
import { syncAllProveedores } from "@/lib/switch-api/sync-proveedores";
import { syncCatalogoJoybees } from "@/lib/switch-api/sync-catalogo-joybees";
import { syncCatalogoTommy } from "@/lib/switch-api/sync-catalogo-tommy";
import { syncCatalogoCalvin } from "@/lib/switch-api/sync-catalogo-calvin";
import { syncCatalogoReebok } from "@/lib/switch-api/sync-catalogo-reebok";
import { avisarNuevosSinFoto } from "@/lib/catalogos/fotos-nuevos";
import { runIntegrityCheck } from "@/lib/integrity-check-run";
import { runCleanupPackingLists } from "@/lib/cleanup-packing-lists";
import { runChequesAlert } from "@/lib/cheques-alert";
import { calcularResumenDiario, buildMensajeHtml } from "@/lib/acs-resumen-diario";
import {
  calcularResumenMensual,
  buildMensajeMensual,
  mesAnterior,
  fmtMesLabel,
} from "@/lib/grupo-resumen-mensual";
import { calcularFotosResumen } from "@/lib/catalogos/fotos-resumen";
import { empresasConFacturas, empresasConEstadoCuentaEnCron } from "@/lib/switch-api/empresas";
import { enviarNegocio, enviarNegocioPrivado, enviarSistema } from "@/lib/alertas/canal";
import {
  recordCronHeartbeat,
  cronsStaleParaAlerta,
  logCronError,
  reconciliarSlotsSwitchSync,
  COLATERAL_RECOVER_AFTER_HOUR_UTC,
  COLATERALES_LOGIN_WEB,
  pasadaPuedeUsarLoginWeb,
  catalogoCicloSinceIso,
  type HeartbeatRow,
  type SlotDesatendido,
} from "@/lib/cron-telemetry";
import { alertSwitchCronErrors } from "@/lib/switch-api/alert-policy";
import {
  medirFrescura,
  clasificarDatosViejos,
  mensajeDatosViejos,
  yaAvisoReciente,
  TIPO_DATO_VIEJO,
} from "@/lib/datos-frescos";
import { revisarSilencioDeDatos } from "@/lib/alertas/silencio-de-datos-io";
import { revisarCuadreCosto } from "@/lib/alertas/cuadre-costo-io";
import { barrerRunningAtascados } from "@/lib/switch-api/sync-log";
import { colateralDayStartIso, hoyPanama } from "@/lib/fecha-panama";
import { enviarResumenCaidaSiAplica } from "@/lib/switch-api/outage-resumen";
import type { EmpresaKey } from "@/lib/empresa-mapping";

const CRON_NAME = "switch-reconciliacion";
// Watchdog: alerta si algún cron excede su umbral stale. El umbral (26h por
// defecto, propio para crons no diarios como grupo-resumen-mensual) vive en
// cron-telemetry.ts y lo comparte con health-crons — así los dos vigías nunca
// vuelven a divergir (antes este tenía 26h plano y alertaba falsamente que el
// resumen mensual estaba caído entre corridas). Lo mismo aplica a la metadata
// de recuperación (RECONCILIACION_PASS_HOURS + COLATERAL_RECOVER_AFTER_HOUR_UTC
// + staleEsPendingRecovery): fuente única en cron-telemetry.ts.

export const dynamic = "force-dynamic";
// El App Router cachea fetch() por defecto (Data Cache) — incluye los fetch
// internos de supabase-js. Sin esto, la re-consulta del log devuelve datos stale.
export const fetchCache = "force-no-store";
// Recuperación in-process: una corrida puede re-ejecutar varios syncs pesados en
// serie (estadocuenta ~85-120s/empresa). 800s es el TECHO del plan (Pro con
// Fluid Compute; ver docs/cron-reliability-recovery.md). Lo que no entre en una
// pasada lo toma la siguiente (10:00/14:00/18:00) — todas idempotentes.
export const maxDuration = 800;
// Dejar de ARRANCAR trabajo nuevo pasado este umbral (headroom antes del kill a
// 800s). El trabajo ya iniciado termina; lo no arrancado lo toma la otra pasada.
// El margen (60s) es mayor que el viejo de 30s a propósito: con más presupuesto
// caben unidades de trabajo más grandes — un catálogo entero, no media empresa —
// y el margen tiene que cubrir a la más lenta que ya haya arrancado.
const RECOVERY_BUDGET_MS = 740_000;

// sync_type que el cron switch-sync (tipo=all) escribe a switch_sync_log.
const DAILY_SYNC_TYPES = ["facturas", "estadocuenta", "costo"] as const;
type DailySyncType = (typeof DAILY_SYNC_TYPES)[number];

interface SyncLogRow {
  empresa_key: string;
  sync_type: string;
  status: string;
  started_at: string;
  error_message: string | null;
}

interface Pair {
  empresa: EmpresaKey;
  syncType: DailySyncType;
}

const key = (empresa: string, syncType: string) => `${empresa}|${syncType}`;

/** Fecha de HOY en Panamá (YYYY-MM-DD). Panamá es UTC-5 fijo (sin DST). */
function panamaToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Panama" }).format(new Date());
}

/** Inicio del día de Panamá (medianoche) en ISO UTC, para filtrar started_at. */
function panamaDayStartIso(): string {
  return new Date(`${panamaToday()}T00:00:00-05:00`).toISOString();
}

/** Fecha Panamá con offset de días (YYYY-MM-DD) — replica switch-sync/articulos. */
function panamaDate(offsetDays = 0): string {
  const now = new Date();
  const panama = new Date(now.toLocaleString("en-US", { timeZone: "America/Panama" }));
  panama.setDate(panama.getDate() + offsetDays);
  return panama.toISOString().slice(0, 10);
}

/**
 * Pares (empresa, sync_type) que DEBEN tener un success hoy:
 *   - facturas y costo → todas las empresas con facturas (8).
 *   - estadocuenta     → solo las empresas con CXC (6).
 */
function expectedPairs(): Pair[] {
  const pairs: Pair[] = [];
  for (const e of empresasConFacturas()) {
    pairs.push({ empresa: e, syncType: "facturas" });
    pairs.push({ empresa: e, syncType: "costo" });
  }
  // Las que TRAEN saldos, no las que son cartera del grupo: una empresa puede
  // sincronizar estadocuenta (para su pestaña aparte) con `cxc:false`, y si no
  // estuviera acá su sync no tendría quién lo recupere cuando falle.
  //
  // ...EnCron excluye las que NO caben en el techo de la función (hoy:
  // confecciones_boston). Recuperar un par que muere siempre no es recuperación:
  // hasta el 30-jul-2026 esta reconciliación reintentaba boston/estadocuenta a
  // las 10:00, 14:00 y 18:00 y las tres corridas se morían igual, dejando las
  // filas en 'running' hasta que el run siguiente las cerraba con #atascado.
  for (const e of empresasConEstadoCuentaEnCron()) {
    pairs.push({ empresa: e, syncType: "estadocuenta" });
  }
  return pairs;
}

async function fetchTodayLog(sinceIso: string): Promise<SyncLogRow[]> {
  const { data, error } = await supabaseServer
    .from("switch_sync_log")
    .select("empresa_key,sync_type,status,started_at,error_message")
    .gte("started_at", sinceIso)
    .in("sync_type", DAILY_SYNC_TYPES as unknown as string[])
    .order("started_at", { ascending: false });

  if (error) {
    throw new Error(`No pude consultar switch_sync_log: ${error.message}`);
  }
  return (data ?? []) as SyncLogRow[];
}

/** Pares esperados que NO tienen ningún success hoy. */
function findMissing(expected: Pair[], rows: SyncLogRow[]): Pair[] {
  const successSet = new Set(
    rows.filter((r) => r.status === "success").map((r) => key(r.empresa_key, r.sync_type)),
  );
  return expected.filter((p) => !successSet.has(key(p.empresa, p.syncType)));
}

/** Último mensaje de error registrado hoy para un par (o null si no corrió). */
function lastErrorFor(pair: Pair, rows: SyncLogRow[]): string | null {
  const row = rows.find((r) => r.empresa_key === pair.empresa && r.sync_type === pair.syncType);
  if (!row) return "sin corrida hoy";
  return row.error_message ?? `status=${row.status}`;
}

/**
 * Error legible para Telegram: solo el primer renglón útil, truncado a ~200
 * chars. Switch a veces devuelve una página HTML de excepción completa como
 * error_message — sin esto la alerta queda ilegible.
 */
function shortError(msg: string | null, max = 200): string {
  if (!msg) return "—";
  const firstLine = msg.split(/\r?\n/)[0].trim();
  return firstLine.length > max ? `${firstLine.slice(0, max)}…` : firstLine;
}

// ─── Crons "de una sola unidad" recuperables in-process ──────────────────────
// Detección por heartbeat (success hoy o no). Recuperación llamando su función
// de sync directamente; si recupera OK, registramos su heartbeat (las funciones
// lib NO lo hacen — eso es del route/orquestador).
interface ColateralCron {
  cronName: string;
  label: string;
  recover: () => Promise<{ ok: boolean; detail: string }>;
  // La hora UTC mínima para recuperar cada colateral (idempotencia de crons que
  // corren TARDE en el día y/o disparan una alerta única) vive en
  // COLATERAL_RECOVER_AFTER_HOUR_UTC (cron-telemetry.ts) — fuente única
  // compartida con health-crons. 0 = recuperable en cualquier pasada.
  // Cron programado entre 00:00 y 05:00 UTC (ANTES de la medianoche Panamá). Su
  // "success de hoy" se mide contra el inicio del día UTC, no del día Panamá —
  // si no, su heartbeat (p.ej. 01:01 UTC) siempre cae antes del umbral de 05:00
  // UTC y la primera pasada del día lo re-corre aunque sí corrió (incidente
  // 17-jul-2026: "(recuperado)" duplicado del resumen ACS). Ver
  // colateralDayStartIso en fecha-panama.ts.
  earlyUtcRun?: boolean;
  // Solo intentar recuperar si esta condición se cumple (default: siempre).
  // Caso grupo-resumen-mensual: corre el día 1 del mes → solo recuperable los
  // días 1-2; el resto del mes ni siquiera cuenta como "faltante".
  recoverOnlyIf?: () => boolean;
  // Ventana propia de "ya corrió" (ISO). Default: inicio del día Panamá (o UTC
  // si earlyUtcRun). Dos casos:
  //   - grupo-resumen-mensual: inicio del día 1 del mes — su heartbeat del día 1
  //     debe contar como success también el día 2 (con la ventana diaria, el día
  //     2 lo re-enviaría duplicado).
  //   - catálogos: ventana RODANTE del ciclo de su propio horario
  //     (cicloCatalogo, ver CATALOGO_CRON_SLOTS_UTC en cron-telemetry.ts).
  successSinceIso?: () => string;
}

/** Ventana "ya está al día" de un catálogo: su ciclo (hueco más largo entre sus
 *  dos corridas diarias). Fallback defensivo al inicio del día Panamá si el
 *  cron no está en CATALOGO_CRON_SLOTS_UTC — nunca deja la ventana indefinida. */
function cicloCatalogo(cronName: string): () => string {
  return () => catalogoCicloSinceIso(cronName) ?? colateralDayStartIso(false);
}

const COLATERAL_CRONS: ColateralCron[] = [
  {
    cronName: "sync-clientes-master",
    label: "clientes-master",
    recover: async () => {
      const r = await syncClientesMaster();
      return { ok: r.ok, detail: r.ok ? `${r.upserted} upserted` : r.error ?? "error" };
    },
  },
  {
    // ⚠️ ÚNICO colateral que abre el LOGIN WEB de Switch (`changesession=SI`),
    // que EXPULSA a quien esté trabajando en el panel de esa empresa — y el
    // usuario de las env vars es el de Daniel. Por eso está en
    // COLATERALES_LOGIN_WEB y `findMissingColaterales` lo deja pasar en las
    // pasadas de las 14:00 y 18:00 UTC (9 a.m. y 1 p.m. de Panamá). Su ventana
    // de recuperación es la pasada de las 10:00 UTC (5 a.m.).
    cronName: "sync-utilidad",
    label: "utilidad",
    recover: async () => {
      // Misma ventana que el cron diario (mes en curso + anterior los días 1-5):
      // si el recovery corre el 1-5, no debe re-abrir el gap del último día del mes.
      const rs = await syncAllUtilidad(mesesCronDiario());
      const bad = rs.filter((r) => !r.ok);
      return {
        ok: bad.length === 0,
        detail: bad.length === 0 ? `${rs.length} empresas` : `falló: ${bad.map((b) => b.empresaKey).join(",")}`,
      };
    },
  },
  {
    cronName: "sync-recibos",
    label: "recibos",
    recover: async () => {
      // Misma ventana rodante de 3 meses que el cron diario (mesesCronRecibos):
      // la recuperación repara también anulados/retro-cargas de la ventana.
      const rs = await syncAllRecibos(mesesCronRecibos());
      const bad = rs.filter((r) => !r.ok);
      return {
        ok: bad.length === 0,
        detail: bad.length === 0 ? `${rs.length} empresas` : `falló: ${bad.map((b) => b.empresaKey).join(",")}`,
      };
    },
  },
  {
    cronName: "switch-articulos",
    label: "articulos",
    recover: async () => {
      const desde = panamaDate(-3);
      const hasta = panamaDate(0);
      const bad: string[] = [];
      for (const empresaKey of empresasConFacturas()) {
        try {
          await syncArticulosDiario(empresaKey, desde, hasta);
        } catch (err) {
          bad.push(empresaKey);
          console.error(`[reconciliacion] articulos ${empresaKey}: ${err instanceof Error ? err.message : err}`);
        }
      }
      return { ok: bad.length === 0, detail: bad.length === 0 ? "ok" : `falló: ${bad.join(",")}` };
    },
  },
  // multifashion_tickets — RETIRADO el 26-jul-2026. La tabla está CONGELADA (los
  // datos quedan, nadie los lee; el módulo Multifashion vive de switch_facturas
  // vía _multifashion_sf_vw). Su cron y este colateral se eliminaron juntos: si
  // el colateral hubiera quedado, la reconciliación lo vería sin heartbeat en
  // CADA pasada (3×/día) y volvería a escribir la tabla — peor que antes. Para
  // reencenderlo: revertir el PR "retirar multifashion_tickets".
  {
    // Cuentas por Pagar (proveedores). Itera /apiproveedor/info por las 6 B2B y
    // upserta switch_proveedor_estadocuenta. Igual que los demás colaterales: si
    // su cron diario (09:30) se pierde, la reconciliación lo detecta y re-ejecuta.
    cronName: "sync-proveedores",
    label: "proveedores",
    recover: async () => {
      const rs = await syncAllProveedores();
      const bad = rs.filter((r) => !r.ok);
      return {
        ok: bad.length === 0,
        detail: bad.length === 0 ? `${rs.length} empresas` : `falló: ${bad.map((b) => b.empresaKey).join(",")}`,
      };
    },
  },
  {
    // Alerta de cheques por vencer (Telegram). NO toca data (query + Telegram).
    // Su cron corre 13:00 UTC → hora mínima 14 (en el mapa compartido) para NO
    // recuperarlo antes de su hora normal (si no, la pasada de las 10:00 mandaría
    // la alerta y luego el run de las 13:00 la duplicaría). Idempotente: solo se
    // re-ejecuta si NO hubo success hoy → manda la alerta perdida UNA vez (las
    // pasadas siguientes ven el heartbeat de hoy y lo saltan).
    cronName: "cheques-alert",
    label: "cheques-alert",
    recover: async () => {
      const r = await runChequesAlert();
      // `detail` ya viene armado por `runChequesAlert` y desde ago-2026 cuenta
      // también los RECORDATORIOS que van en el mismo mensaje. Rearmarlo acá con
      // `r.count` haría que una corrida que solo mandó recordatorios se
      // reportara como "sin cheques por vencer" — o sea, mintiendo.
      return { ok: r.ok, detail: r.detail };
    },
  },
  {
    // Checks de integridad (Telegram SOLO si hay críticos). Su cron corre 12:00
    // UTC → hora mínima 13 (mapa compartido) para NO adelantarse a su run
    // normal: sin el guard, la pasada de las 10:00 lo correría y mandaría la
    // alerta crítica antes de tiempo, y el run de las 12:00 la duplicaría. El
    // persist es append (igual que el botón "Correr ahora" del dashboard) →
    // re-correr no corrompe data, solo agrega un snapshot del día. Lo recuperan
    // las pasadas 14:00/18:00.
    cronName: "integrity-check",
    label: "integrity-check",
    recover: async () => {
      const r = await runIntegrityCheck();
      return { ok: r.ok, detail: r.ok ? (r.criticalCount > 0 ? `${r.criticalCount} críticos` : "ok") : r.detail };
    },
  },
  {
    // Refresh de las 3 MVs del cron: clientes_empresa_12m_vw (tab Clientes) +
    // ventas_rollup_mensual_mv (rollup mensual del dashboard) +
    // switch_estadocuenta_aging_mv (aging de CXC — antes faltaba aquí y una
    // recuperación dejaba el aging del día sin refrescar). Idempotente:
    // REFRESH ... CONCURRENTLY recomputa las mismas vistas, no duplica nada. No
    // dispara alerta y corre temprano (07:35 UTC) → sin guard de hora. Las 3 RPC
    // ligeras; falla si cualquiera falla.
    cronName: "refresh-clientes-views",
    label: "refresh-clientes-views",
    recover: async () => {
      const { error: e1 } = await supabaseServer.rpc("refresh_clientes_empresa_12m_vw");
      if (e1) return { ok: false, detail: `clientes_12m: ${e1.message}` };
      const { error: e2 } = await supabaseServer.rpc("refresh_ventas_rollup_mensual_mv");
      if (e2) return { ok: false, detail: `ventas_rollup: ${e2.message}` };
      const { error: e3 } = await supabaseServer.rpc("refresh_switch_estadocuenta_aging_mv");
      if (e3) return { ok: false, detail: `cxc_aging: ${e3.message}` };
      return { ok: true, detail: "vistas refrescadas (clientes_12m + ventas_rollup + cxc_aging)" };
    },
  },
  {
    // Purga física de packing lists soft-deleted con retención vencida (90d),
    // con snapshot previo a activity_logs. Idempotente: re-correr ya no encuentra
    // candidatos (los purgados se fueron) → deleted=0, sin snapshot nuevo. No
    // alerta y corre temprano (03:00 UTC) → sin guard de hora.
    cronName: "cleanup-packing-lists",
    label: "cleanup-packing-lists",
    earlyUtcRun: true, // corre 03:00 UTC, antes de la medianoche Panamá
    recover: async () => {
      const r = await runCleanupPackingLists();
      return { ok: r.ok, detail: r.detail };
    },
  },
  {
    // Resumen mensual del grupo a Telegram (corre el día 1 a las 13:00 UTC —
    // era el día 3 hasta el 4-sep-2026; el porqué del cambio vive en
    // src/lib/grupo-resumen-mensual.ts). Su recuperación aplica los días 1-2
    // del mes (recoverOnlyIf) y su ventana de "ya corrió" es el inicio del
    // día 1 (successSinceIso) — así el día 2 NO re-envía un resumen que sí
    // salió el 1. Ésta es la «segunda oportunidad» del resumen: si la guardia
    // del cierre (o el propio cron) falló el día 1, las pasadas de 14:00 y
    // 18:00 y las tres del día 2 lo reintentan. Hora mínima 14 en el mapa
    // compartido (su run normal es 13:00 → patrón cheques-alert, no
    // adelantarse). Prefijo "(recuperado)" como el resumen ACS. Solo lee la
    // DB (RPC sobre la MV), no toca Switch.
    //
    // 🔒 `enviarNegocioPrivado` (4-sep-2026), IGUAL que su route. Daniel:
    // «este mensaje también lo quiero en alertas de Telegram, no en negocio.»
    // Si esta línea se queda en `enviarNegocio`, el resumen RECUPERADO sería
    // el único que se filtra al grupo de tres. Candado que exige que este
    // envío y el del route apunten al mismo destino:
    // src/__tests__/lib/acs-resumen-canal-privado.test.ts.
    cronName: "grupo-resumen-mensual",
    label: "grupo-resumen-mensual",
    recoverOnlyIf: () => {
      const dia = Number(hoyPanama().slice(8, 10));
      return dia === 1 || dia === 2;
    },
    successSinceIso: () => new Date(`${hoyPanama().slice(0, 7)}-01T00:00:00-05:00`).toISOString(),
    recover: async () => {
      const { anio, mes } = mesAnterior(hoyPanama());
      // calcularResumenMensual trae sus DOS guardias adentro (cierre
      // sincronizado de las 8 + total $0): si el mes no está entero, LANZA y
      // esta pasada lo anota como fallo — la siguiente vuelve a intentar.
      const resumen = await calcularResumenMensual(anio, mes);
      if (resumen.total === 0) {
        return { ok: false, detail: `sin data para ${fmtMesLabel(anio, mes)} — ¿ventas_rollup_mensual_mv sin refrescar?` };
      }
      const sent = await enviarNegocioPrivado(`(recuperado) ${buildMensajeMensual(resumen)}`);
      return { ok: sent, detail: sent ? `resumen ${fmtMesLabel(anio, mes)} reenviado` : "Telegram no aceptó el mensaje" };
    },
  },
  {
    // Resumen diario ACS a Telegram (incidente 11-jul-2026: la invocación de la
    // 01:00 UTC se perdió tras una promoción de deploy, cero rastro). Recupera
    // reportando AYER Panamá, NO hoyPanama(): las pasadas de reconciliación
    // (10:00/14:00/18:00 UTC = madrugada/mañana Panamá) caen en el día Panamá
    // SIGUIENTE al que quedó sin reportar — ayer es ese día, ya completo en DB
    // (syncFresco=true por ser pasado). Prefijo "(recuperado)" para distinguirlo
    // del run normal de la 01:00. Solo lee la DB, no toca Switch. Su cron corre
    // 01:00 UTC, muy antes de la primera pasada (10:00) → sin guard de hora.
    cronName: "acs-resumen-diario",
    label: "acs-resumen",
    earlyUtcRun: true, // corre 01:00 UTC, antes de la medianoche Panamá
    recover: async () => {
      const ayer = panamaDate(-1);
      const resumen = await calcularResumenDiario(ayer, true);
      // El prefijo va DENTRO del <pre> (buildMensajeHtml lo antepone al título)
      // y el envío en "HTML", igual que el run normal: concatenar por fuera
      // dejaría las etiquetas <pre> visibles como texto.
      //
      // 🔴 `enviarNegocioPrivado`, IGUAL que el run normal (2-sep-2026): la
      // venta del día va al chat privado de Daniel, no al grupo de 📊 NEGOCIO
      // donde está el celular de la empresa. Si esta línea se queda en
      // `enviarNegocio`, el resumen RECUPERADO —el que sale justo cuando algo
      // falló— sería el único que se filtra al grupo. Desde el 4-sep-2026 el
      // resumen MENSUAL del grupo también va al privado (lo pidió Daniel);
      // catalogos-fotos-resumen es el único resumen de este archivo que sigue
      // en `enviarNegocio`. Candado que exige
      // que este envío y el del route apunten al mismo destino:
      // src/__tests__/lib/acs-resumen-canal-privado.test.ts
      const sent = await enviarNegocioPrivado(buildMensajeHtml(resumen, "(recuperado) "), "HTML");
      return { ok: sent, detail: sent ? `resumen ${ayer} reenviado` : "Telegram no aceptó el mensaje" };
    },
  },
  {
    // Resumen SEMANAL de fotos faltantes de los catálogos (lunes 13:30 UTC).
    // Solo lee las DBs de los catálogos (sin Switch). Único cron SEMANAL: su
    // recuperación solo aplica los LUNES (recoverOnlyIf, patrón día 1-2 del
    // grupo-resumen-mensual) y su hora mínima es 14 en el mapa compartido (su
    // run normal es 13:30 → no adelantarse, patrón cheques-alert). Ventana de
    // "ya corrió" = día Panamá (default): el run normal cae el mismo lunes
    // Panamá (08:30). Tommy pendiente de DDL se reporta sin fallar. Prefijo
    // "(recuperado)" como los otros resúmenes.
    cronName: "catalogos-fotos-resumen",
    label: "catalogos-fotos-resumen",
    recoverOnlyIf: () => new Date(`${hoyPanama()}T00:00:00Z`).getUTCDay() === 1, // lunes
    recover: async () => {
      const r = await calcularFotosResumen();
      // Sin fotos faltantes no se manda nada (ver buildResumenSemanalMsg). La
      // recuperación se da por CUMPLIDA: el resumen se calculó y no había nada
      // que avisar — devolver ok:false lo haría reintentar en cada pasada.
      if (!r.mensaje) return { ok: true, detail: "sin fotos faltantes — nada que avisar" };
      const sent = await enviarNegocio(`(recuperado) ${r.mensaje}`);
      return {
        ok: sent,
        detail: sent
          ? `resumen semanal reenviado (${r.totalSinFoto} sin foto)`
          : "Telegram no aceptó el mensaje",
      };
    },
  },
  // ⚠️ Los catálogos van AL FINAL a propósito: cada run hace 1 llamada /stock
  // por artículo en Switch (puede tomar varios minutos) y no debe comerse el
  // RECOVERY_BUDGET_MS de los colaterales anteriores. Lo que no entre en una
  // pasada lo toma la siguiente.
  //
  // Los 3 llevan `successSinceIso: cicloCatalogo(...)`: su ventana de "ya está
  // al día" es el CICLO de su propio horario (hueco más largo entre sus dos
  // corridas), no el inicio del día Panamá. Ver CATALOGO_CRON_SLOTS_UTC en
  // cron-telemetry.ts — ahí está el porqué (incidente 25-jul-2026: el success de
  // siembra de tommy-catalogo a las 04:52 UTC caía 8 min ANTES del corte de las
  // 05:00, así que cada pasada desde las 13:00 re-corría los ~490 /stock del
  // catálogo y tumbaba la pasada por FUNCTION_INVOCATION_TIMEOUT).
  {
    // Catálogo Joybees (joystep). CUATRO slots diarios (14:45/17:15/19:55/22:10)
    // desde el 13-ago-2026 → hora mínima 15 en el mapa compartido, o sea que la
    // ÚNICA pasada que lo recupera es la de las 18:00 (su primer slot del día,
    // 14:45, cae después de la pasada de las 14:00). Idempotente y fail-safe: un
    // fallo de Switch NO modifica el catálogo (incidente 4-jul-2026: una ráfaga
    // de deploys en su ventana le comió la invocación y nadie lo reintentaba).
    cronName: "joybees-catalogo",
    label: "joybees-catalogo",
    successSinceIso: cicloCatalogo("joybees-catalogo"), // ciclo 16:35h (14:45/17:15/19:55/22:10)
    recover: async () => {
      const r = await syncCatalogoJoybees();
      // Mismo aviso de "nuevos sin foto" que el cron: la recuperación puede ser
      // la corrida que meta los productos, así que no puede quedarse muda
      // (best-effort, delta de estado — ver lib/catalogos/fotos-nuevos.ts).
      await avisarNuevosSinFoto("joybees");
      const bad = r.empresas.filter((e) => e.error);
      return {
        ok: !r.hadError,
        detail: !r.hadError
          ? `${r.empresas.length} empresa(s), catálogo actualizado`
          : `falló: ${bad.map((e) => `${e.empresaKey}: ${e.error}`).join("; ")}`,
      };
    },
  },
  {
    // Catálogo Reebok (active_shoes). CUATRO slots diarios
    // (14:40/17:10/19:50/22:05) pero el heartbeat es de granularidad diaria → la
    // reconciliación detecta "catálogo fuera de su ciclo" (>16:35h sin success),
    // no cada slot por separado. Hora mínima en el mapa compartido (patrón
    // cheques-alert): solo recuperar cuando el primer slot ya debió correr.
    //
    // ⚠️ QUÉ SIGNIFICA ESO CON EL HORARIO NUEVO, dicho de frente: la última
    // pasada de este cron es a las 18:00, así que **los slots de las 19:5x y
    // 22:0x NO se recuperan el mismo día si fallan**. No es un descuido: con 4
    // pases la pérdida de uno la tapa el siguiente (si falla el de las 19:50, el
    // de las 22:05 refresca igual; si falla ése, el de las 14:40 de mañana), y el
    // ciclo de 16h35 sigue por debajo del hueco "última corrida de ayer → pasada
    // de las 18:00" (20h05), así que perder los DOS de la mañana SÍ se detecta.
    // Idempotente y fail-safe igual que Joybees.
    cronName: "reebok-catalogo",
    label: "reebok-catalogo",
    successSinceIso: cicloCatalogo("reebok-catalogo"), // ciclo 16:35h (14:40/17:10/19:50/22:05)
    recover: async () => {
      const r = await syncCatalogoReebok();
      // Mismo aviso de "nuevos sin foto" que el cron: la recuperación puede ser
      // la corrida que meta los productos, así que no puede quedarse muda
      // (best-effort, delta de estado — ver lib/catalogos/fotos-nuevos.ts).
      await avisarNuevosSinFoto("reebok");
      const bad = r.empresas.filter((e) => e.error);
      return {
        ok: !r.hadError,
        detail: !r.hadError
          ? `${r.empresas.length} empresa(s), catálogo actualizado`
          : `falló: ${bad.map((e) => `${e.empresaKey}: ${e.error}`).join("; ")}`,
      };
    },
  },
  {
    // Catálogo Tommy Hilfiger (fashion_shoes). CUATRO slots diarios
    // (14:30/17:00/19:40/21:55), mismas reglas que reebok-catalogo (hora mínima
    // 15 en el mapa compartido, ciclo de 16:35h). Es el más caro de los cuatro
    // (156 s medidos el 12-ago-2026), y por eso va PRIMERO de cada banda: se
    // lleva el mayor margen contra el vecino largo del tramo. Su ventana de ciclo
    // es la que evita el re-sync inútil.
    // PRE-DDL (migración 20260724150000 pendiente): syncCatalogoTommy se omite
    // limpio SIN tocar Switch (ddlPendiente) → se reporta ok con detalle para
    // NO alertar a diario por una migración que ya se sabe pendiente (el
    // heartbeat sembrado se vuelve real apenas la DDL corra).
    cronName: "tommy-catalogo",
    label: "tommy-catalogo",
    successSinceIso: cicloCatalogo("tommy-catalogo"), // ciclo 16:35h (14:30/17:00/19:40/21:55)
    recover: async () => {
      const r = await syncCatalogoTommy();
      if (r.ddlPendiente) {
        return { ok: true, detail: "DDL 20260724150000 pendiente — sync omitido (sin tocar Switch)" };
      }
      // Mismo aviso de "nuevos sin foto" que el cron: la recuperación puede ser
      // la corrida que meta los productos, así que no puede quedarse muda
      // (best-effort, delta de estado — ver lib/catalogos/fotos-nuevos.ts).
      await avisarNuevosSinFoto("tommy");
      const bad = r.empresas.filter((e) => e.error);
      return {
        ok: !r.hadError,
        detail: !r.hadError
          ? `${r.empresas.length} empresa(s), catálogo actualizado`
          : `falló: ${bad.map((e) => `${e.empresaKey}: ${e.error}`).join("; ")}`,
      };
    },
  },
  {
    // Catálogo Calvin Klein (vistana, marcaId 8). CUATRO slots diarios
    // (14:35/17:05/19:45/22:00), mismas reglas que tommy-catalogo (hora mínima 15
    // en el mapa compartido, ciclo por CATALOGO_CRON_SLOTS_UTC). PRE-DDL (migración
    // 20260812150000 pendiente): syncCatalogoCalvin se omite limpio SIN tocar
    // Switch (ddlPendiente) → se reporta ok con detalle para NO alertar a
    // diario por una migración que ya se sabe pendiente (el heartbeat sembrado
    // se vuelve real apenas la DDL corra).
    cronName: "calvin-catalogo",
    label: "calvin-catalogo",
    successSinceIso: cicloCatalogo("calvin-catalogo"), // ciclo 16:35h (14:35/17:05/19:45/22:00)
    recover: async () => {
      const r = await syncCatalogoCalvin();
      if (r.ddlPendiente) {
        return { ok: true, detail: "DDL 20260812150000 pendiente — sync omitido (sin tocar Switch)" };
      }
      // Mismo aviso de "nuevos sin foto" que el cron: la recuperación puede ser
      // la corrida que meta los productos, así que no puede quedarse muda
      // (best-effort, delta de estado — ver lib/catalogos/fotos-nuevos.ts).
      await avisarNuevosSinFoto("calvin");
      const bad = r.empresas.filter((e) => e.error);
      return {
        ok: !r.hadError,
        detail: !r.hadError
          ? `${r.empresas.length} empresa(s), catálogo actualizado`
          : `falló: ${bad.map((e) => `${e.empresaKey}: ${e.error}`).join("; ")}`,
      };
    },
  },
];

/** Lo que devuelve `findMissingColaterales`: los que se recuperan en esta pasada
 *  y los que se dejan pasar porque su recuperación abriría el login web de
 *  Switch en horario de oficina (ver COLATERALES_LOGIN_WEB). */
interface ColateralesFaltantes {
  recuperables: ColateralCron[];
  /** Nombres omitidos por login web en oficina — se reportan, no se esconden. */
  omitidosLoginWeb: string[];
}

/** Heartbeats de los colaterales que NO tienen success de hoy (= se perdieron). */
async function findMissingColaterales(dayStartIso: string): Promise<ColateralesFaltantes> {
  const names = COLATERAL_CRONS.map((c) => c.cronName);
  const { data, error } = await supabaseServer
    .from("cron_heartbeats")
    .select("cron_name, last_success_at")
    .in("cron_name", names);
  if (error) {
    console.error(`[reconciliacion] no pude leer cron_heartbeats: ${error.message}`);
    // sin señal fiable → no recuperar a ciegas (evita trabajo innecesario)
    return { recuperables: [], omitidosLoginWeb: [] };
  }
  // Umbral por-cron: ventana propia (successSinceIso) si el colateral la define
  // —los 3 catálogos usan el ciclo de su horario, grupo-resumen-mensual el día 1
  // del mes—; los earlyUtcRun (00:00-05:00 UTC) contra el inicio del día UTC; el
  // resto contra el inicio del día Panamá (dayStartIso).
  const earlyStartIso = colateralDayStartIso(true);
  const successHoy = new Set(
    (data ?? [])
      .filter((h) => {
        if (!h.last_success_at) return false;
        const col = COLATERAL_CRONS.find((c) => c.cronName === h.cron_name);
        const since = col?.successSinceIso
          ? col.successSinceIso()
          : col?.earlyUtcRun
            ? earlyStartIso
            : dayStartIso;
        return h.last_success_at >= since;
      })
      .map((h) => h.cron_name),
  );
  // No recuperar un colateral antes de su hora programada (mapa compartido
  // COLATERAL_RECOVER_AFTER_HOUR_UTC): su run normal aún puede correr;
  // recuperarlo antes duplicaría su alerta.
  const nowHourUtc = new Date().getUTCHours();
  const faltantes = COLATERAL_CRONS.filter(
    (c) =>
      (c.recoverOnlyIf?.() ?? true) &&
      !successHoy.has(c.cronName) &&
      nowHourUtc >= (COLATERAL_RECOVER_AFTER_HOUR_UTC[c.cronName] ?? 0),
  );

  // 🔴 El login WEB de Switch (`changesession=SI`) EXPULSA a quien esté adentro
  // del panel, y el usuario configurado es el de Daniel. Las pasadas de las
  // 14:00 y 18:00 UTC caen 9:00 a.m. y 1:00 p.m. de Panamá: recuperar ahí
  // significaba sacarlo de Switch en plena jornada. Se dejan pasar; su ventana
  // es la pasada de las 10:00 UTC (5:00 a.m.), y perder una recuperación NO
  // pierde datos (utilidad re-lee el mes entero y upserta). Ver
  // COLATERALES_LOGIN_WEB en cron-telemetry.ts.
  const puedeLoginWeb = pasadaPuedeUsarLoginWeb(nowHourUtc);
  const omitidosLoginWeb = puedeLoginWeb
    ? []
    : faltantes.filter((c) => COLATERALES_LOGIN_WEB.has(c.cronName)).map((c) => c.cronName);
  if (omitidosLoginWeb.length > 0) {
    console.log(
      `[reconciliacion] omito ${omitidosLoginWeb.join(", ")}: su recuperación abre el login web de Switch y estamos en horario de oficina de Panamá (${nowHourUtc}:00 UTC). Se recupera en la pasada de las 10:00 UTC.`,
    );
  }
  return {
    recuperables: faltantes.filter((c) => !omitidosLoginWeb.includes(c.cronName)),
    omitidosLoginWeb,
  };
}

/**
 * Watchdog de heartbeats: revisa cron_heartbeats y alerta por Telegram si algún
 * cron lleva más de su umbral stale sin un success. No lanza.
 *
 * TODA la decisión ("¿a quién se vigila?" y "¿quién está caído?") vive en
 * `cronsStaleParaAlerta` (cron-telemetry.ts), pura y testeable en las dos
 * direcciones. Acá solo queda el I/O: leer las filas y mandar el Telegram.
 *
 * Anti alerta-fantasma: un cron stale cuya recuperación AÚN viene hoy (pasada
 * de reconciliación posterior, o la 2ª entrada del día de backup/
 * acs-fidelizacion) NO alerta — la lógica (staleEsPendingRecovery, con tope
 * duro de 30h) es compartida con health-crons. Estricto con la pasada en curso:
 * esta pasada NO cuenta como "por venir" — si su recuperación falla, el alert de
 * failedColaterales/skipped lo reporta con mensaje preciso (caso real
 * 4-jul-2026: sync-clientes-master stale silenciado para siempre por contarse la
 * pasada a sí misma).
 *
 * Crons RETIRADOS: este watchdog recorre TODAS las filas de cron_heartbeats, así
 * que la fila huérfana de un cron que ya no existe le alertaba todos los días
 * para siempre (27-jul-2026: `multifashion-sync`, retirado en el #316, con su
 * fila viva desde el 26-jul 05:00). `esHeartbeatNoVigilable` los descarta contra
 * el registro de crons conocidos — ver esCronRetirado en cron-telemetry.ts.
 */
async function checkStaleCrons(): Promise<string[]> {
  const { data, error } = await supabaseServer
    .from("cron_heartbeats")
    .select("cron_name, last_success_at");
  if (error) {
    console.error(`[watchdog] no pude leer cron_heartbeats: ${error.message}`);
    return [];
  }
  const stale = cronsStaleParaAlerta((data ?? []) as HeartbeatRow[], Date.now());

  // ⛔ NO SE MANDA TELEGRAM POR UN CRON STALE (30-jul-2026, regla de Daniel).
  //
  // Este watchdog avisaba "Una tarea automática lleva más de un día sin
  // completarse. Detalle: switch-sync:all-0630". Medía el MECANISMO, no el
  // resultado, y se equivocaba en las dos direcciones: mandó ese mismo mensaje el
  // 27, 28 y 29 de julio mientras las ventas de american_classic de ese run
  // entraban bien (06:31:23), y al revés, un sync que corre y no trae nada deja el
  // heartbeat fresco y el dato viejo pasa inadvertido.
  //
  // Lo reemplaza `checkDatosViejos()` (regla 1): pregunta si la CARTERA o las
  // VENTAS llevan más de 24 h sin actualizarse, que es lo que Daniel realmente
  // mira. Un cron caído cuyo trabajo igual se hizo ya no molesta a nadie: queda
  // en el cuerpo de /api/health-crons y en el log, para quien lo vaya a buscar.
  //
  // El valor se sigue devolviendo (entra en el JSON de la respuesta y en los
  // logs) — lo único que se quitó es el sendTelegram.
  if (stale.length > 0) {
    console.error(`[watchdog] crons stale (informativo, sin alerta): ${stale.join(", ")}`);
  }
  return stale;
}

/**
 * REGLA 1 — "Un dato que mirás está viejo". La única alerta de datos.
 *
 * Avisa si la cartera o las ventas llevan más de 24 h sin actualizarse, con
 * dedup de 20 h para no repetirlo en cada pasada. Toda la decisión vive en
 * `src/lib/datos-frescos.ts` (pura y testeable); acá queda el I/O. No lanza: un
 * fallo midiendo frescura no puede tumbar la reconciliación.
 */
async function checkDatosViejos(): Promise<string[]> {
  try {
    const estados = await medirFrescura();
    const viejos = clasificarDatosViejos(estados);
    if (viejos.length === 0) return [];
    const etiquetas = viejos.map((v) => `${v.dato}:${v.empresa}`);
    if (await yaAvisoReciente()) {
      console.error(`[datos-viejos] ya avisado hace <20h, no repito: ${etiquetas.join(", ")}`);
      return etiquetas;
    }
    // Se registra en cron_email_errors ANTES de mandar: es la llave del dedup, y
    // dejarla después haría que un fallo de Telegram provocara un segundo intento
    // inmediato en la pasada siguiente.
    await logCronError(TIPO_DATO_VIEJO, etiquetas.join(", "), null, { telegram: false });
    await enviarSistema(mensajeDatosViejos(viejos));
    return etiquetas;
  } catch (err) {
    console.error(
      `[datos-viejos] no pude medir la frescura: ${err instanceof Error ? err.message : String(err)}`,
    );
    return [];
  }
}

/**
 * 🩸 EL SILENCIO NO CUENTA COMO QUE ESTÁ BIEN (2-sep-2026) — las dos alertas
 * hermanas de `src/lib/alertas/silencio-de-datos.ts`:
 *
 *   A · un sync que venía trayendo cientos trajo CERO, con `status = success`.
 *   B · una tabla de negocio dejó de recibir escrituras.
 *
 * ── POR QUÉ CUELGAN DE ACÁ Y NO DE UN CRON NUEVO ────────────────────────────
 * Tres motivos, y los tres son de este archivo:
 *
 *   1. **Es el vigía que ya existe.** La regla 1 («un dato que mirás está
 *      viejo») vive dos funciones más arriba, en esta misma pasada. Las tres
 *      alertas de datos preguntan lo mismo con distinta lente y tienen que
 *      mirar el mundo en el mismo instante; separarlas en dos crons sería
 *      garantizar que algún día se contradigan.
 *
 *   2. **El ritmo de esta pasada ES el filtro de «se arregla solo».** Corre
 *      10/14/18 UTC, y entre una pasada y la siguiente el sistema tuvo todas sus
 *      segundas oportunidades. Mirar desde acá «la última corrida exitosa del
 *      par» deja afuera, gratis y sin una sola condición, al catálogo que trajo
 *      0 a las 14:30 y 127 a las 17:00.
 *
 *      Va junto a la regla 1 y ANTES de la recuperación de esta pasada, y es
 *      indistinto: la reconciliación solo re-ejecuta pares SIN success del día,
 *      así que un `success` que trajo cero no lo recupera nunca; y las dos
 *      tablas que vigila B (`egresos_varios`, `switch_articulo_info`) no están
 *      en `COLATERAL_CRONS`. Lo que sí importa es que las tres alertas de datos
 *      midan el mismo instante.
 *
 *   3. **Cero entradas nuevas en vercel.json.** El proyecto tiene 79 de 100
 *      cron jobs del plan Pro, y «una entrada = una ocurrencia al día» hace que
 *      cualquier alerta nueva con cron propio cueste 3 slots. Este no cuesta
 *      ninguno.
 *
 * No lanza: un fallo midiendo el silencio no puede tumbar la reconciliación.
 */
async function checkSilencioDeDatos(): Promise<string[]> {
  try {
    return await revisarSilencioDeDatos();
  } catch (err) {
    console.error(
      `[silencio-de-datos] no pude revisarlo: ${err instanceof Error ? err.message : String(err)}`,
    );
    return [];
  }
}

/**
 * 🩸 EL CUADRE DE COSTO (3-sep-2026) — `src/lib/alertas/cuadre-costo.ts`.
 *
 * Por (empresa, mes cerrado), lo que el Resumen muestra de costo contra lo que
 * dice `switch_costo_diario` (el reporte «Total de ventas» de Switch, que sí
 * trae notas de débito y que durante tres meses nadie leyó). Más de 2 % y más
 * de $100 → 🔧 SISTEMA, con anti-loop de 7 días por (empresa, mes).
 *
 * Cuelga de acá por los mismos tres motivos que el silencio de datos: es el
 * vigía que ya existe, el ritmo de esta pasada ya filtra lo que se arregla solo
 * (la ND que entra al día siguiente la trae `sync-utilidad` a las 07:00 y esta
 * pasada la ve a las 10:00), y no cuesta una entrada de cron.
 *
 * No lanza: un fallo midiendo el cuadre no puede tumbar la reconciliación. Si
 * la migración de la RPC no corrió, se omite y lo dice en el log.
 */
async function checkCuadreCosto(): Promise<string[]> {
  try {
    return await revisarCuadreCosto();
  } catch (err) {
    console.error(
      `[cuadre-costo] no pude revisarlo: ${err instanceof Error ? err.message : String(err)}`,
    );
    return [];
  }
}

/** Nombre del cron que alerta switch-sync (dedup contra cron_email_errors). */
const SWITCH_SYNC_CRON_NAME = "switch-sync";

/**
 * ¿Esta ocurrencia de slot YA quedó reportada en cron_email_errors? Dedup del
 * reporte de slots fallados, mirando DOS tipos desde la ocurrencia:
 *   - "switch-sync"        → el route alcanzó a alertar él mismo (caso normal:
 *     el 24-jul-2026 dejó su fila a las 06:06 por el fallo de joystep). Solo hay
 *     que cubrir el caso en que la invocación MUERE sin poder reportar.
 *   - "switch-sync:<slot>" → lo reportó una pasada ANTERIOR de esta misma
 *     reconciliación; no repetir en cada pasada mientras el fallo persista.
 * El filtro es POR SLOT a propósito: con un filtro genérico, el reporte del
 * slot 1605 taparía al del 1610 dentro de la misma pasada.
 *
 * Fail-CERRADO a "no reportado" (=> reportamos) si la consulta falla: mejor un
 * aviso de más que un fallo intradía en silencio.
 */
async function slotFalladoYaReportado(slot: string, desdeIso: string): Promise<boolean> {
  try {
    const { data, error } = await supabaseServer
      .from("cron_email_errors")
      .select("id")
      .in("tipo", [SWITCH_SYNC_CRON_NAME, `${SWITCH_SYNC_CRON_NAME}:${slot}`])
      .gte("created_at", desdeIso)
      .limit(1);
    if (error) return false;
    return (data ?? []).length > 0;
  } catch {
    return false;
  }
}

/**
 * Reporta las ocurrencias de slot que CORRIERON Y FALLARON (defecto 2). Las que
 * ni se invocaron NO se reportan aquí: no hay error que clasificar y la
 * recuperación de esta misma pasada las cubre; si tras recuperar siguen mal,
 * entran en la alerta 🚨 final como `slotsSinAtender`.
 *
 * Delega en alertSwitchCronErrors para heredar la política anti-ruido 401: los
 * transitorios (401 / red / 5xx) no alertan a la primera y escalan a las 2
 * corridas consecutivas; los demás —un `statement timeout` de la DB, un run
 * colgado en 'running'— alertan de inmediato y quedan en cron_email_errors.
 * Best-effort: no lanza.
 */
async function reportarSlotsFallados(desatendidos: SlotDesatendido[]): Promise<void> {
  const fallados = desatendidos.filter((d) => d.motivo === "corrio-y-fallo");
  if (fallados.length === 0) return;
  try {
    for (const d of fallados) {
      if (await slotFalladoYaReportado(d.slot, d.ocurrencia)) continue;
      await alertSwitchCronErrors(
        `${SWITCH_SYNC_CRON_NAME}:${d.slot}`,
        d.paresPendientes.map((p) => ({
          empresaKey: p.empresa,
          syncType: p.syncType,
          error:
            p.ultimoIntento?.error_message ??
            (p.ultimoIntento
              ? `la corrida quedó en '${p.ultimoIntento.status}' (invocación muerta a media corrida)`
              : "la entrada se invocó pero este par no dejó corrida"),
        })),
        {
          nota:
            `Ocurrencia ${d.ocurrencia} sin refrescar. El par puede tener un success ` +
            `ANTERIOR del mismo día: eso NO cubre esta corrida intradía.`,
        },
      );
    }
  } catch (err) {
    console.error(
      `[reconciliacion] reportarSlotsFallados threw: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

async function handleCron(req: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, error: "CRON_SECRET no configurado" }, { status: 500 });
  }
  if ((req.headers.get("authorization") ?? "") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const startedMs = Date.now();
  const elapsed = () => Date.now() - startedMs;
  const budgetLeft = () => elapsed() < RECOVERY_BUDGET_MS;

  const fecha = panamaToday();
  const sinceIso = panamaDayStartIso();
  const expected = expectedPairs();

  // 0−. BARRIDO DEL CANDADO: cerrar las filas 'running' vencidas de CUALQUIER
  //     (empresa, sync_type). Va PRIMERO, antes de que nada más mire el log.
  //
  //     🩸 27-jul-2026. Hasta hoy una fila 'running' huérfana solo la cerraba la
  //     corrida SIGUIENTE DEL MISMO PAR. Para los pares que corren pocas veces al
  //     día eso es una eternidad: `catalogo_tommy` corría entonces 12:40 y 17:40
  //     UTC (hoy son cuatro pases, ver CATALOGO_CRON_SLOTS_UTC), así
  //     que la fila que quedó abierta a las 18:52 iba a mantener el candado
  //     puesto hasta las 12:40 del día siguiente (17 h 48 min), bloqueando
  //     "Actualizar ahora" mientras tanto. Ahora cualquier pasada de este cron
  //     (10/14/18 UTC) lo suelta, sea del par que sea.
  //
  //     NO afloja la sesión única: el corte es RUNNING_STALE_MIN (30 min), más
  //     del doble del `maxDuration` de 800 s, o sea que la fila es de un proceso
  //     que demostrablemente ya no existe. Paso NO FATAL — nunca lanza.
  const candadosSoltados = await barrerRunningAtascados();
  if (candadosSoltados) {
    console.warn(`[cron/switch-reconciliacion] candados atascados liberados: ${candadosSoltados}`);
  }

  // 0. Barrido de SLOTS de switch-sync, anclado en la OCURRENCIA de cada slot
  //    (no en el día). Devuelve:
  //      - cubiertos:    ocurrencia perdida pero trabajo al día → marca
  //                      "#recuperado" (ya escrita) para que el watchdog calle.
  //      - desatendidos: ocurrencia cuyo trabajo NO está hecho → hay que
  //                      re-ejecutar sus pares AUNQUE tengan un success previo
  //                      del día (defectos 1 y 2, ver clasificarSlots).
  //    Va ANTES del watchdog para que este ya no reporte los cubiertos.
  const slots0 = await reconciliarSlotsSwitchSync();
  const slotsCubiertos = slots0.cubiertos;
  const slotsDesatendidos = slots0.desatendidos;

  // 0b. Watchdog de heartbeats (INFORMATIVO, ya no alerta) + registrar el propio.
  const staleCrons = await checkStaleCrons();
  // 0b-bis. REGLA 1: la única alerta de datos — cartera/ventas con más de 24 h.
  const datosViejos = await checkDatosViejos();
  // 0b-ter. Las dos alertas del SILENCIO: un sync que trajo cero donde siempre
  //         trae cientos (A) y una tabla de negocio que dejó de recibir
  //         escrituras (B). Van juntas y mandan UN mensaje por módulo.
  const silencioDeDatos = await checkSilencioDeDatos();
  // 0b-quater. El cuadre de costo: lo que el Resumen muestra por mes cerrado
  //            contra el total de ventas por día de Switch (que trae las ND).
  const cuadreCosto = await checkCuadreCosto();
  await recordCronHeartbeat(CRON_NAME);

  // 0c. Reporte de las ocurrencias que CORRIERON Y FALLARON (defecto 2). El
  //     route de switch-sync ya alerta cuando puede, pero si la invocación MUERE
  //     a media corrida (25-jul-2026: fashion_shoes/estadocuenta con "statement
  //     timeout" y fashion_wear/active_wear colgados en 'running') nunca llega a
  //     hacerlo: no queda ni fila en cron_email_errors ni Telegram. Aquí se
  //     cierra ese hueco, con dos guardas anti-ruido:
  //       - dedup: si YA hay un registro de switch-sync en cron_email_errors
  //         posterior a la ocurrencia, el route sí alertó → no duplicar.
  //       - política 401: se delega en alertSwitchCronErrors, que silencia el
  //         1er fallo transitorio (401/red/5xx) y escala a las 2 corridas
  //         consecutivas. Un statement timeout NO es silenciable → alerta ya.
  await reportarSlotsFallados(slotsDesatendidos);

  // 1. Detección inicial (switch-sync por par + colaterales por heartbeat).
  const logBefore = await fetchTodayLog(sinceIso);
  const missingPairs = findMissing(expected, logBefore);
  const { recuperables: missingColaterales, omitidosLoginWeb } =
    await findMissingColaterales(sinceIso);

  // Nada que recuperar en esta pasada → cero ruido de alertas. Único envío
  // posible: el resumen post-recuperación de una caída de Switch que ya sanó SIN
  // esta pasada (ej. el propio slot siguiente del cron recuperó el par) y aún no
  // se reportó (dedup por watermark en cron_email_errors). Best-effort, no lanza.
  //
  // `allHealthy` es false si algo quedó omitido por login web: NO está todo bien
  // —falta la corrida de utilidad—, lo que pasa es que su recuperación espera a
  // la pasada de las 10:00 UTC para no expulsar a nadie de Switch. Decir "todo
  // sano" acá escondería justo el estado que hay que poder auditar después.
  if (missingPairs.length === 0 && missingColaterales.length === 0 && slotsDesatendidos.length === 0) {
    const outage = await enviarResumenCaidaSiAplica();
    return NextResponse.json({
      ok: true,
      fecha,
      allHealthy: omitidosLoginWeb.length === 0,
      omitidosLoginWeb,
      reconciled: [],
      stillFailing: [],
      telegram: "none",
      outageResumen: outage.resumen,
      staleCrons,
      datosViejos,
      silencioDeDatos,
      cuadreCosto,
      slotsCubiertos,
      slotsDesatendidos,
    });
  }

  // 2. RECUPERACIÓN IN-PROCESS, serial, en orden de dependencia/prioridad, acotada
  //    por presupuesto de tiempo. Lo que no entre lo toma la próxima pasada.
  const win = { desde: panamaDate(-7), hasta: panamaDate(0), triggeredBy: "cron" as const };
  const skipped: string[] = [];

  // 2a. switch-sync: agrupar pares faltantes por empresa y correr SOLO los tipos
  //     faltantes de esa empresa, en orden canónico (reusa el token: facturas →
  //     estadocuenta → costo). Las funciones escriben switch_sync_log (fuente de
  //     verdad del re-chequeo); si lanzan, lo capturamos y seguimos.
  const empresasConPares = new Map<EmpresaKey, Set<DailySyncType>>();
  const addPar = (empresa: EmpresaKey, syncType: DailySyncType) => {
    if (!empresasConPares.has(empresa)) empresasConPares.set(empresa, new Set());
    empresasConPares.get(empresa)!.add(syncType);
  };
  for (const p of missingPairs) addPar(p.empresa, p.syncType);
  // Pares de las ocurrencias de slot desatendidas (defectos 1 y 2). Se suman al
  // MISMO mapa por empresa: la recuperación sigue siendo serial y reusa un solo
  // token de Switch por empresa (sesión única). Un par que ya venía de
  // missingPairs no se duplica — el Set lo absorbe.
  for (const d of slotsDesatendidos) {
    for (const par of d.paresPendientes) addPar(par.empresa as EmpresaKey, par.syncType);
  }
  let switchSyncRecoveryRan = false;
  for (const [empresaKey, tipos] of empresasConPares) {
    if (!budgetLeft()) {
      skipped.push(`switch-sync/${empresaKey}`);
      continue;
    }
    switchSyncRecoveryRan = true;
    for (const tipo of DAILY_SYNC_TYPES) {
      if (!tipos.has(tipo)) continue;
      try {
        if (tipo === "facturas") await syncEmpresaFacturas(empresaKey, win);
        else if (tipo === "estadocuenta") await syncEmpresaEstadoCuenta(empresaKey, win);
        else await syncCostoDiario(empresaKey, win.triggeredBy);
      } catch (err) {
        console.error(`[reconciliacion] ${empresaKey}/${tipo}: ${err instanceof Error ? err.message : err}`);
      }
    }
  }

  // 2b. colaterales (orden: clientes-master primero — lee switch_clientes que
  //     facturas acaba de refrescar; luego utilidad/recibos/articulos).
  const colateralResults: Array<{ cronName: string; label: string; ok: boolean; detail: string }> = [];
  for (const c of missingColaterales) {
    if (!budgetLeft()) {
      skipped.push(c.cronName);
      continue;
    }
    try {
      const r = await c.recover();
      if (r.ok) await recordCronHeartbeat(c.cronName);
      colateralResults.push({ cronName: c.cronName, label: c.label, ...r });
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      console.error(`[reconciliacion] ${c.cronName}: ${detail}`);
      colateralResults.push({ cronName: c.cronName, label: c.label, ok: false, detail });
    }
  }
  // Si switch-sync recuperó algo OK, refrescar su heartbeat (el watchdog usa el
  // heartbeat 'switch-sync'; las funciones lib no lo tocan).
  if (switchSyncRecoveryRan) await recordCronHeartbeat("switch-sync");
  // Segunda pasada de slots: los pares que se acaban de recuperar ya tienen su
  // success en switch_sync_log → los slots que perdieron su invocación y esta
  // recuperación compensó quedan certificados YA, sin esperar a la pasada
  // siguiente (la de las 18:00 no tendría otra hasta las 10:00 del día próximo).
  // Además re-clasifica los desatendidos: los que la recuperación arregló
  // desaparecen; los que quedan son fallo real y entran en `hayProblemas`.
  let slotsSinAtender: SlotDesatendido[] = slotsDesatendidos;
  if (switchSyncRecoveryRan) {
    const slots1 = await reconciliarSlotsSwitchSync();
    slotsCubiertos.push(...slots1.cubiertos);
    slotsSinAtender = slots1.desatendidos;
  }

  // 3. Re-consultar: fuente de verdad del estado final.
  const logAfter = await fetchTodayLog(sinceIso);
  const stillMissingPairs = findMissing(expected, logAfter);
  const recoveredPairs = missingPairs.filter(
    (p) => !stillMissingPairs.some((m) => m.empresa === p.empresa && m.syncType === p.syncType),
  );
  const failedColaterales = colateralResults.filter((c) => !c.ok);
  const recoveredColaterales = colateralResults.filter((c) => c.ok);

  // 4. Telegram — SOLO si algo quedó realmente caído tras el ciclo (Opción A,
  //    jun-2026). Recuperar NO es un fallo: un ciclo 100% exitoso —con o sin
  //    recuperaciones— NO manda nada (cero ruido). El mensaje sale únicamente
  //    cuando hay un fallo real: colateral irrecuperable, sync que quedó sin
  //    success, o trabajo que no entró por tiempo (skipped). Las recuperaciones
  //    se siguen reportando como CONTEXTO dentro de esa alerta de fallo, y en el
  //    JSON de respuesta (reconciled[]) para auditoría.
  const hayProblemas =
    stillMissingPairs.length > 0 ||
    failedColaterales.length > 0 ||
    skipped.length > 0 ||
    slotsSinAtender.length > 0;
  let telegram: "alert" | "none" = "none";

  // Pasada 100% verde tras recuperar → si lo recuperado fue una CAÍDA de
  // Switch (HTML-auth / red / 5xx), mandar EL resumen informativo único
  // post-recuperación (ventana + syncs afectados). Con problemas pendientes NO
  // se manda nada: la caída sigue activa y la alerta de abajo ya la cubre.
  let outageResumen = "sin_caida";
  if (!hayProblemas) {
    outageResumen = (await enviarResumenCaidaSiAplica()).resumen;
  }

  if (hayProblemas) {
    telegram = "alert";
    const lineasPares = stillMissingPairs.map(
      (p) => `• ${p.empresa}/${p.syncType}: ${shortError(lastErrorFor(p, logAfter))}`,
    );
    const lineasCol = failedColaterales.map((c) => `• ${c.label}: ${shortError(c.detail)}`);
    // Ocurrencias de slot que siguen sin su trabajo hecho tras recuperar. Se
    // nombra el slot (no solo el par) para que se vea QUÉ corrida se perdió:
    // el par puede tener un success previo del día y aun así estar atrasado.
    const lineasSlots = slotsSinAtender.map(
      (d) =>
        `• slot ${d.slot} (${d.ocurrencia.slice(11, 16)} UTC, ${
          d.motivo === "sin-invocacion" ? "no se invocó" : "corrió y falló"
        }): ${d.paresPendientes.map((p) => `${p.empresa}/${p.syncType}`).join(", ")}`,
    );
    const lineasSkip = skipped.length ? [`• sin tiempo (próxima pasada): ${skipped.join(", ")}`] : [];
    const recuperadas =
      recoveredPairs.length || recoveredColaterales.length
        ? `\n\nRecuperadas: ${[
            ...recoveredPairs.map((p) => `${p.empresa}/${p.syncType}`),
            ...recoveredColaterales.map((c) => c.label),
          ].join(", ")}`
        : "";
    // Este mensaje sale DESPUÉS de que la reconciliación ya intentó reparar y
    // no pudo: acá el "se arregla solo" ya se agotó. Por eso sí suena.
    await enviarSistema(
      `Hay datos de Switch que no se pudieron actualizar hoy (${fecha}), ni siquiera ` +
        `reintentando.\n` +
        `Qué significa: las ventas, los saldos o los pagos que ves en la app pueden estar ` +
        `viejos en algunas empresas.\n` +
        `Qué hacer: avísame para revisarlo.\n` +
        `Detalle:\n${[...lineasPares, ...lineasCol, ...lineasSlots, ...lineasSkip].join("\n")}${recuperadas}`,
    );
  }

  return NextResponse.json(
    {
      ok: !hayProblemas,
      fecha,
      allHealthy: false,
      // Colaterales que esta pasada dejó pasar a propósito porque su
      // recuperación abre el login web de Switch y estamos en horario de
      // oficina. No son un fallo: su ventana es la pasada de las 10:00 UTC.
      omitidosLoginWeb,
      elapsedMs: elapsed(),
      reconciled: [
        ...recoveredPairs.map((p) => ({ empresa: p.empresa, syncType: p.syncType })),
        ...recoveredColaterales.map((c) => ({ cron: c.cronName })),
      ],
      stillFailing: [
        ...stillMissingPairs.map((p) => ({
          empresa: p.empresa,
          syncType: p.syncType,
          lastError: lastErrorFor(p, logAfter),
        })),
        ...failedColaterales.map((c) => ({ cron: c.cronName, detail: c.detail })),
        ...slotsSinAtender.map((d) => ({
          slot: d.slot,
          ocurrencia: d.ocurrencia,
          motivo: d.motivo,
          pares: d.paresPendientes.map((p) => `${p.empresa}/${p.syncType}`),
        })),
      ],
      skipped,
      telegram,
      outageResumen,
      staleCrons,
      datosViejos,
      silencioDeDatos,
      cuadreCosto,
      slotsCubiertos,
      slotsDesatendidos,
      slotsSinAtender,
    },
    { status: hayProblemas ? 207 : 200 },
  );
}

// Higiene de sesión única (4-jul-2026): al terminar el cron —éxito o fallo—
// se cierran las sesiones de Switch abiertas por este proceso (POST
// /cierresesion, best-effort). Sin esto el token queda vivo ~60min y mata el
// login del siguiente cron que toque la misma empresa (colisión code 0006).
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    return await handleCron(req);
  } finally {
    await logoutAllSwitchSessions();
  }
}

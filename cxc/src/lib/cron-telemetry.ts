/**
 * Telemetría compartida para crons: heartbeat de éxito + alerta de error.
 *
 * - recordCronHeartbeat(name): registra que el cron terminó OK hoy. El watchdog
 *   (dentro de switch-reconciliacion, 10/14/18 UTC) revisa estos heartbeats y
 *   alerta si alguno excede su umbral stale (cronStaleThresholdHours: 26h por
 *   defecto, propio para crons no diarios como grupo-resumen-mensual).
 * - logCronError(tipo, message, context?, opts?): persiste el error en
 *   cron_email_errors (igual que antes) Y dispara una alerta Telegram con el
 *   error truncado a 200 chars (shortError). Si el caller ya mandó su propia
 *   alerta Telegram con más detalle, pasar { telegram: false } para persistir
 *   sin duplicar el aviso. Tolerante a fallos: nunca lanza, así un fallo de
 *   logging no tumba al cron que lo llama.
 *
 * Requiere la tabla cron_heartbeats (ver migración
 * supabase/migrations/*_cron_heartbeats.sql) — aplicar manualmente.
 */

import { supabaseServer } from "@/lib/supabase-server";
import { empresasConCxc } from "@/lib/switch-api/empresas";
import { RUNNING_STALE_MIN } from "@/lib/switch-api/sync-log";
import { sendTelegramAlert, shortError } from "@/lib/telegram";

// ─── Umbrales de "staleness" del watchdog (fuente ÚNICA para AMBOS watchdogs) ──
// Hay dos vigías de crons: health-crons (monitor externo, responde 200/503) y el
// watchdog Telegram dentro de switch-reconciliacion. Antes cada uno tenía su
// propia copia del umbral; el de switch-reconciliacion se quedó sin el mapa
// mensual y alertaba falsamente que grupo-resumen-mensual (mensual, día 3)
// estaba caído. Ambos importan estas constantes/helpers para no volver a divergir.

/** Umbral por defecto (horas) sin success antes de marcar un cron como stale.
 *  26h da margen sobre el ciclo diario (1×/día) sin tragarse un día entero. */
export const CRON_STALE_HOURS_DEFAULT = 26;

/** Umbrales propios por cron NO diario. El default de 26h marcaría un cron
 *  mensual como caído ~29 días/mes; grupo-resumen-mensual corre el día 3 → 33
 *  días cubren el gap más largo entre corridas aun con jitter. El resumen
 *  semanal de fotos corre los lunes → 8 días cubren el ciclo con margen. */
export const CRON_STALE_HOURS_POR_CRON: Record<string, number> = {
  "grupo-resumen-mensual": 33 * 24,
  "catalogos-fotos-resumen": 8 * 24,
};

/** Horas de umbral stale para un cron (su override propio o el default). */
export function cronStaleThresholdHours(cronName: string): number {
  return CRON_STALE_HOURS_POR_CRON[cronName] ?? CRON_STALE_HOURS_DEFAULT;
}

/** ¿Un cron está stale? true si nunca registró success (fecha inválida/ausente)
 *  o si su último success es anterior al umbral (propio o default). Lógica ÚNICA
 *  usada por health-crons y por el watchdog de switch-reconciliacion. */
export function cronIsStale(
  cronName: string,
  lastSuccessAt: string | null | undefined,
  now: number = Date.now(),
): boolean {
  const t = lastSuccessAt ? new Date(lastSuccessAt).getTime() : NaN;
  if (!Number.isFinite(t)) return true;
  return t < now - cronStaleThresholdHours(cronName) * 3600 * 1000;
}

// ─── Metadata de recuperación (fuente ÚNICA para AMBOS watchdogs) ─────────────
// Un cron stale NO amerita alerta si su recuperación AÚN viene hoy: la
// reconciliación (para los colaterales) o su propia 2ª entrada del día en
// vercel.json (backup / acs-fidelizacion). Antes esta metadata vivía duplicada
// (recoverAfterHourUtc inline en COLATERAL_CRONS de switch-reconciliacion y
// nada en health-crons, que alertaba 503 aunque la recuperación estuviera a
// horas de distancia). Ahora ambos leen de aquí.

/** Horas UTC de las pasadas de switch-reconciliacion (espejo de vercel.json). */
export const RECONCILIACION_PASS_HOURS = [10, 14, 18];

/**
 * Crons cuya recuperación es una pasada de reconciliación, con su hora UTC
 * mínima de recuperación (0 = recuperable en cualquier pasada). Debe reflejar
 * COLATERAL_CRONS de switch-reconciliacion (que lee de aquí, no al revés) más
 * "switch-sync", cuyos pares faltantes la reconciliación también recupera
 * (detección por switch_sync_log, no por heartbeat).
 *
 * Hora mínima > 0 = crons que corren TARDE y/o disparan una alerta única:
 * recuperarlos antes de su hora normal duplicaría la alerta (ver comentarios
 * por-colateral en switch-reconciliacion).
 */
export const COLATERAL_RECOVER_AFTER_HOUR_UTC: Record<string, number> = {
  "switch-sync": 0,
  "sync-clientes-master": 0,
  "sync-utilidad": 0,
  "sync-recibos": 0,
  "switch-articulos": 0,
  "sync-proveedores": 0,
  "refresh-clientes-views": 0,
  "cleanup-packing-lists": 0,
  "acs-resumen-diario": 0,
  "integrity-check": 13, // su cron corre 12:00 UTC
  "cheques-alert": 14, // su cron corre 13:00 UTC
  // grupo-resumen-mensual: su run normal es el día 3 a las 13:00 UTC y su
  // recuperación solo aplica los días 3-4 (recoverOnlyIf en la reconciliación).
  // Sigue en NUNCA_SILENCIAR: los watchdogs jamás lo silencian por "recuperación
  // en camino" (demasiado esporádico para asumirla).
  "grupo-resumen-mensual": 14,
  "joybees-catalogo": 12, // su cron corre 11:00 UTC
  "reebok-catalogo": 13, // slot temprano 12:10 + ~1h (no adelantarse a su run normal)
  "tommy-catalogo": 13, // slot temprano 12:40 (no adelantarse a su run normal)
  // catalogos-fotos-resumen: run normal lunes 13:30 UTC → hora mínima 14
  // (patrón cheques-alert, no adelantarse) y su recuperación solo aplica los
  // lunes (recoverOnlyIf en la reconciliación). Sigue en NUNCA_SILENCIAR:
  // semanal = demasiado esporádico para asumir "recuperación en camino hoy".
  "catalogos-fotos-resumen": 14,
};

// ─── Ciclo de los catálogos (ventana de "ya está al día") ────────────────────
// Los 3 catálogos (Reebok/Joybees/Tommy) son los colaterales CAROS: cada corrida
// hace 1 llamada /stock por artículo en Switch (Tommy son ~490 → minutos). Que
// la reconciliación los re-corra sin necesidad se come el RECOVERY_BUDGET_MS y
// puede tumbar la pasada entera por FUNCTION_INVOCATION_TIMEOUT (incidente
// 25-jul-2026: tommy-catalogo re-sincronizado en cada pasada desde las 13:00).
//
// CAUSA: la ventana de "ya corrió" era el inicio del día PANAMÁ (05:00 UTC), un
// corte que no tiene NADA que ver con el horario del catálogo (12:40/17:40). El
// success de siembra de las 04:52 UTC quedó 8 min del lado de "ayer" → cada
// pasada lo veía como perdido y lo re-corría, aunque el catálogo tenía 9 horas
// de frescura. El mismo corte falla al revés: un sync manual a las 06:00 UTC
// contaba como "ya corrió hoy" y SILENCIABA la pérdida real del slot de 12:40.
//
// REGLA (jul-2026): para los catálogos la pregunta correcta no es "¿corrió en
// el día calendario?" sino "¿está fresco para su propio ritmo?". Un catálogo
// está al día si tuvo un success dentro de su CICLO = el intervalo más largo
// entre dos corridas consecutivas de su horario (dando la vuelta al día).
// Pasado ese tiempo perdió al menos una corrida completa → recuperar. La hora
// mínima de COLATERAL_RECOVER_AFTER_HOUR_UTC sigue mandando: nunca se recupera
// antes de su primer slot del día.

/** Horarios UTC (HH:MM) de los crons de catálogo — espejo de vercel.json (2
 *  entradas cada uno). Un test compara ambos para que no diverjan. */
export const CATALOGO_CRON_SLOTS_UTC: Record<string, readonly string[]> = {
  "joybees-catalogo": ["11:00", "17:05"],
  "reebok-catalogo": ["12:10", "17:00"],
  "tommy-catalogo": ["12:40", "17:40"],
};

/** Ciclo del catálogo en horas: el hueco MÁS LARGO entre dos corridas
 *  consecutivas de su horario, dando la vuelta al día (Tommy 12:40/17:40 → 19h,
 *  el salto de la tarde a la mañana siguiente). null si el cron no es un
 *  catálogo con horario declarado. */
export function catalogoCicloHoras(cronName: string): number | null {
  const slots = CATALOGO_CRON_SLOTS_UTC[cronName];
  if (!slots || slots.length === 0) return null;
  const minutos = slots
    .map((s) => {
      const [h, m] = s.split(":").map(Number);
      return h * 60 + m;
    })
    .sort((a, b) => a - b);
  let maxGap = 0;
  for (let i = 0; i < minutos.length; i++) {
    const siguiente = i + 1 < minutos.length ? minutos[i + 1] : minutos[0] + 24 * 60;
    maxGap = Math.max(maxGap, siguiente - minutos[i]);
  }
  return maxGap / 60;
}

/**
 * Inicio de la ventana "el catálogo ya está al día" (ISO) — lo consume
 * `successSinceIso` de COLATERAL_CRONS en switch-reconciliacion. Un
 * last_success_at anterior a este instante = perdió al menos una corrida
 * completa de su horario → la reconciliación lo recupera.
 *
 * Es una ventana RODANTE (ahora − ciclo), no un corte de día: así ningún
 * success queda del lado equivocado de una medianoche que el cron ni siquiera
 * usa. Devuelve null si el cron no tiene horario de catálogo declarado (el
 * caller cae a su ventana por defecto).
 */
export function catalogoCicloSinceIso(cronName: string, now: Date = new Date()): string | null {
  const horas = catalogoCicloHoras(cronName);
  if (horas === null) return null;
  return new Date(now.getTime() - horas * 3600 * 1000).toISOString();
}

/**
 * Crons con entradas EXTRA del día en vercel.json (horas UTC fraccionales, ej.
 * 18.5 = 18:30; espejo de vercel.json, en orden). No los recupera la
 * reconciliación (pesados / sesión Switch propia): su "recuperación que viene"
 * es su propia siguiente corrida, que solo trabaja si una anterior no registró
 * success hoy (guard no-op en el route).
 *
 * El backup pasó de 2 a 3 entradas (jul-2026, incidente del 25-jul): Vercel
 * re-registra los crons contra el deployment de producción más nuevo y las
 * invocaciones que caen en esa ventana se pierden — ese día se perdieron la de
 * 00:15, la de 01:00 y la de backup 06:00, todas a 2-9 min de un deploy. Con
 * solo dos entradas (06:00/18:30) la exposición era de 12.5h; la entrada del
 * medio la baja a ~4.5h. La recuperación in-process desde la reconciliación NO
 * era viable bajo Hobby: la corrida core midió 248s de los 300s disponibles el
 * 25-jul. Con Pro (800s) vuelve a ser evaluable — pendiente en el plan Pro.
 */
export const EXTRA_ENTRY_HOURS_UTC: Record<string, number[]> = {
  backup: [10.5, 18.5],
  // backup-switch: 06:45 / 11:15 / 23:30. La 3ª estaba a las 19:15 UTC = 14:15
  // Panamá, en plena tarde de oficina, y es el ÚNICO grupo de backup que barre
  // las tablas grandes (SWITCH_DATASETS: switch_articulo_diario 197k filas +
  // switch_facturas 52k; el grupo core no las incluye). Se movió (26-jul-2026) a
  // 23:30 UTC (18:30 Panamá): después del cierre, dentro del MISMO día UTC (el
  // guard no-op de la 2ª oportunidad compara contra el día UTC, así que mover la
  // entrada al otro lado de la medianoche la convertiría en la corrida primaria
  // del día siguiente) y con margen antes de la ventana de deploy 23:50-00:20.
  //
  // Es HIGIENE, no el arreglo de los picos de /ventas: se probó que este scan
  // los disparara y 3 ensayos controlados NO lo reprodujeron (una observación
  // suelta lo había sugerido). Los picos eran el seq scan de las RPC no
  // sargables — arreglado en 20260726190000.
  "backup-switch": [11.25, 23.5],
  "backup-storage": [15.5],
  "acs-fidelizacion": [16.5],
};

/** Crons que JAMÁS se silencian por "recuperación en camino": la reconciliación
 *  es el propio recuperador (si está caída no hay red de seguridad) y los
 *  resúmenes mensual/semanal son demasiado esporádicos para asumir
 *  auto-recuperación (su recovery solo aplica el día 3-4 / los lunes). */
export const NUNCA_SILENCIAR = new Set([
  "switch-reconciliacion",
  "grupo-resumen-mensual",
  "catalogos-fotos-resumen",
]);

/**
 * ¿La recuperación de este cron AÚN viene hoy? (nowHourUtc puede ser
 * fraccional: 14.5 = 14:30 UTC.)
 *   - Entradas extra propias: viene si aún queda alguna por delante.
 *   - Colateral: viene si queda una pasada de reconciliación POSTERIOR a ahora
 *     entre las elegibles (hora >= su recoverAfterHourUtc). Estricto (>): la
 *     pasada en curso no cuenta como "por venir" — si su recuperación falla, la
 *     propia reconciliación alerta con mensaje preciso (failedColaterales).
 */
export function recoveryStillComingToday(cronName: string, nowHourUtc: number): boolean {
  if (NUNCA_SILENCIAR.has(cronName)) return false;
  const extras = EXTRA_ENTRY_HOURS_UTC[cronName];
  if (extras !== undefined) return extras.some((h) => h > nowHourUtc);
  const after = COLATERAL_RECOVER_AFTER_HOUR_UTC[cronName];
  if (after === undefined) return false; // sin recuperación conocida → alertar normal
  const eligible = RECONCILIACION_PASS_HOURS.filter((p) => p >= after);
  if (eligible.length === 0) return false;
  return Math.max(...eligible) > nowHourUtc;
}

/** Tope duro de silenciamiento: pasado esto, stale alerta SIEMPRE aunque la
 *  metadata prometa recuperación (protege contra recuperaciones que fallan día
 *  tras día o metadata desactualizada). */
export const PENDING_RECOVERY_MAX_HOURS = 30;

// ─── Heartbeats por-slot de switch-sync ──────────────────────────────────────
// El heartbeat base "switch-sync" lo refresca CUALQUIERA de las ~17 entradas
// diarias del path → una entrada intradía perdida (ej. estadocuenta de las
// 21:10) era invisible para health-crons. Cada entrada de vercel.json lleva
// ahora `&slot=<tipo>-<hhmm>` (hhmm = hora UTC de SU schedule, ej.
// estadocuenta-2110) y el route registra, ADEMÁS del heartbeat base, uno
// granular "switch-sync:<slot>". La lista (SWITCH_SYNC_SLOTS /
// SWITCH_SYNC_SLOT_HEARTBEATS) se DERIVA de SWITCH_CRON_ENTRADAS más abajo —
// fuente ÚNICA, espejo de vercel.json: al agregar/mover una entrada de
// switch-sync basta actualizar SWITCH_CRON_ENTRADAS (y vercel.json).
//
// Regla de vigilancia en health-crons (distinta del fail-closed de los 18
// nombres base): si la fila del slot NO existe todavía → NO es stale (el cron
// la siembra solo en <24h tras el deploy; sin esto, el primer día daría un 503
// falso con los slots "ausentes"). Solo alerta si la fila EXISTE y está
// vieja (umbral 26h).
/**
 * Crons NUEVOS con vigilancia seed-tolerante (misma regla que los slots de
 * switch-sync): fila de heartbeat ausente = aún no sembrada (el cron la crea
 * solo en <24h tras el deploy) → NO es stale; solo alerta si la fila EXISTE y
 * está vieja. Evita el 503 falso el día del deploy. Cuando el cron ya lleve
 * días sembrado se puede promover a EXPECTED_CRONS (fail-closed) en
 * health-crons si se quiere la garantía dura.
 */
export const SEED_TOLERANT_CRONS = [
  "backup-switch", // backup de tablas switch_* (3 entradas: 06:45 / 11:15 / 19:15 UTC)
  // Réplica off-site de los buckets de Storage a R2 (2 entradas: 04:00 / 15:30
  // UTC). Seed-tolerante hasta que lleve días sembrado; después se puede
  // promover a EXPECTED_CRONS en health-crons.
  "backup-storage",
  // NOTA: tommy-catalogo se PROMOVIÓ a EXPECTED_CRONS (health-crons, vigilancia
  // fail-closed 26h como reebok/joybees-catalogo) en el PR "encender Tommy":
  // la DDL 20260724150000 ya corrió y el heartbeat lleva días sembrado.
  // Resumen semanal de fotos faltantes (lunes 13:30 UTC). Seed-tolerante para
  // NO disparar un 503 falso antes de su primera corrida (puede tardar hasta
  // una semana en sembrar la fila). Umbral propio semanal de 8 días en
  // CRON_STALE_HOURS_POR_CRON. Promover a EXPECTED_CRONS con semanas de siembra.
  "catalogos-fotos-resumen",
  // Vigía de recursos de la base (11 entradas, 01:45→22:45 UTC). Desplegado el
  // 27-jul-2026: seed-tolerante hasta que lleve días sembrado. Promover a
  // CRONS_FAIL_CLOSED después (corre 11×/día: nunca debería estar stale).
  "db-salud",
];

// ─── Cronograma empresa→horas de los crons que tocan Switch ──────────────────
// Espejo de vercel.json (SOLO las entradas que abren sesión en el Switch de
// alguna empresa — sesión ÚNICA por empresa: un 2º login mata el token del 1º).
// Fuente única para el candado del sync manual (/api/admin/sync-now): si el
// próximo cron que toca una empresa está a <40 min, el manual se rechaza con
// 409 para no matarle la sesión. Al agregar/mover una entrada en vercel.json
// que toque Switch, actualizar AQUÍ también.

const CRON_EMPRESAS_B2B5 = [
  "vistana",
  "fashion_wear",
  "fashion_shoes",
  "active_shoes",
  "active_wear",
] as const;
const CRON_EMPRESAS_RECIBOS = [...CRON_EMPRESAS_B2B5, "american_classic"] as const;
const CRON_EMPRESAS_CXP = [...CRON_EMPRESAS_B2B5, "joystep", "american_classic"] as const;
const CRON_EMPRESAS_TODAS = [
  ...CRON_EMPRESAS_B2B5,
  "joystep",
  "confecciones_boston",
  "american_classic",
] as const;
/**
 * Empresas del sync de VENTAS intradía (tipo=facturas) — las 8 con facturas, o
 * sea `empresasConFacturas()`: american_classic (ACS/Multifashion, retail) + las
 * 7 B2B (las 5 con CXC + joystep + confecciones_boston). Un test lo verifica
 * contra `empresasConFacturas()` para que no se desincronice.
 *
 * Horarios: 11:50 (06:50 Panamá — la corrida temprana, para que quien entra a
 * las 8 a.m. no vea el dato de la madrugada) y 15/19/23 UTC (10:00/14:00/18:00
 * Panamá).
 *
 * Por qué ACS y B2B viajan en la MISMA entrada a esas horas: el slot de
 * heartbeat es `<tipo>-<hhmm>` y se deriva del horario, así que dos entradas de
 * `tipo=facturas` a la misma hora colisionarían en el mismo nombre de slot
 * (`facturas-1500`) y el detector de ocurrencias perdidas dejaría de saber cuál
 * de las dos se perdió. Una entrada = una ocurrencia = un slot. Las empresas se
 * procesan SERIALMENTE dentro del route (sesión única de Switch), y american_
 * classic va primero: es el dato con el ritmo más exigente (cada 2h).
 */
const CRON_EMPRESAS_VENTAS = [
  "american_classic",
  ...CRON_EMPRESAS_B2B5,
  "joystep",
  "confecciones_boston",
] as const;

export interface SwitchCronEntrada {
  /** Nombre legible del cron (para logs/mensajes). */
  cron: string;
  /** Hora UTC "hhmm" del schedule en vercel.json. */
  hhmmUtc: string;
  /** Empresas cuyo Switch toca esa entrada. */
  empresas: readonly string[];
}

/** Espejo de vercel.json — entradas que tocan Switch, con sus empresas. */
export const SWITCH_CRON_ENTRADAS: SwitchCronEntrada[] = [
  // multifashion-sync (05:00, american_classic) se RETIRÓ el 26-jul-2026 junto
  // con la escritura de multifashion_tickets (tabla congelada, ver CLAUDE.md).
  // Era la única entrada de la madrugada que tocaba american_classic antes del
  // bloque `all` de las 06:30; su baja libera esa sesión de Switch.
  { cron: "switch-sync all", hhmmUtc: "0530", empresas: ["vistana", "active_wear"] },
  { cron: "switch-sync all", hhmmUtc: "0535", empresas: ["fashion_shoes", "fashion_wear"] },
  { cron: "switch-sync all", hhmmUtc: "0540", empresas: ["active_shoes", "joystep"] },
  { cron: "switch-sync all", hhmmUtc: "0630", empresas: ["american_classic", "confecciones_boston"] },
  { cron: "sync-utilidad", hhmmUtc: "0700", empresas: CRON_EMPRESAS_B2B5 },
  { cron: "sync-recibos", hhmmUtc: "0750", empresas: CRON_EMPRESAS_RECIBOS },
  { cron: "switch-articulos", hhmmUtc: "0840", empresas: CRON_EMPRESAS_TODAS },
  { cron: "sync-proveedores", hhmmUtc: "0930", empresas: CRON_EMPRESAS_CXP },
  // La reconciliación puede recuperar pares faltantes de CUALQUIER empresa.
  { cron: "switch-reconciliacion", hhmmUtc: "1000", empresas: CRON_EMPRESAS_TODAS },
  { cron: "joybees-catalogo", hhmmUtc: "1100", empresas: ["joystep"] },
  { cron: "acs-fidelizacion", hhmmUtc: "1130", empresas: ["american_classic"] },
  // Ventas de la mañana temprana (06:50 Panamá): quien entra a trabajar a las
  // 8 a.m. ya no ve el dato de la madrugada. Ver CRON_EMPRESAS_VENTAS.
  { cron: "switch-sync facturas", hhmmUtc: "1150", empresas: CRON_EMPRESAS_VENTAS },
  { cron: "reebok-catalogo", hhmmUtc: "1210", empresas: ["active_shoes"] },
  { cron: "tommy-catalogo", hhmmUtc: "1240", empresas: ["fashion_shoes"] },
  { cron: "switch-sync facturas", hhmmUtc: "1300", empresas: ["american_classic"] },
  { cron: "switch-reconciliacion", hhmmUtc: "1400", empresas: CRON_EMPRESAS_TODAS },
  { cron: "switch-sync facturas", hhmmUtc: "1500", empresas: CRON_EMPRESAS_VENTAS },
  { cron: "sync-recibos", hhmmUtc: "1515", empresas: CRON_EMPRESAS_RECIBOS },
  { cron: "switch-sync estadocuenta", hhmmUtc: "1600", empresas: ["active_shoes", "joystep"] },
  { cron: "switch-sync estadocuenta", hhmmUtc: "1605", empresas: ["fashion_shoes", "fashion_wear"] },
  { cron: "switch-sync estadocuenta", hhmmUtc: "1610", empresas: ["vistana", "active_wear"] },
  { cron: "acs-fidelizacion", hhmmUtc: "1630", empresas: ["american_classic"] },
  { cron: "reebok-catalogo", hhmmUtc: "1700", empresas: ["active_shoes"] },
  { cron: "switch-sync facturas", hhmmUtc: "1700", empresas: ["american_classic"] },
  { cron: "joybees-catalogo", hhmmUtc: "1705", empresas: ["joystep"] },
  { cron: "tommy-catalogo", hhmmUtc: "1740", empresas: ["fashion_shoes"] },
  { cron: "switch-reconciliacion", hhmmUtc: "1800", empresas: CRON_EMPRESAS_TODAS },
  { cron: "switch-sync facturas", hhmmUtc: "1900", empresas: CRON_EMPRESAS_VENTAS },
  { cron: "sync-recibos", hhmmUtc: "1915", empresas: CRON_EMPRESAS_RECIBOS },
  { cron: "switch-sync facturas", hhmmUtc: "2100", empresas: ["american_classic"] },
  { cron: "switch-sync estadocuenta", hhmmUtc: "2110", empresas: ["vistana", "active_wear"] },
  { cron: "switch-sync estadocuenta", hhmmUtc: "2115", empresas: ["fashion_shoes", "fashion_wear"] },
  { cron: "switch-sync estadocuenta", hhmmUtc: "2120", empresas: ["active_shoes", "joystep"] },
  { cron: "switch-sync facturas", hhmmUtc: "2300", empresas: CRON_EMPRESAS_VENTAS },
  { cron: "sync-recibos", hhmmUtc: "2315", empresas: CRON_EMPRESAS_RECIBOS },
  { cron: "switch-sync facturas", hhmmUtc: "0015", empresas: ["american_classic"] },
];

/**
 * Separación MÍNIMA (minutos) entre dos entradas del cronograma que tocan la
 * MISMA empresa en Switch. Switch es sesión única por empresa: un 2º login mata
 * el token del 1º (code 0006). Un test recorre SWITCH_CRON_ENTRADAS y falla si
 * alguien mete un choque — es la red que impide que un horario nuevo rompa las
 * sesiones en producción.
 *
 * 50 → 15 (26-jul-2026, cuenta en Vercel Pro). El 50 venía de cuando el bloque
 * `tipo=all` (facturas+estadocuenta+costo de 2 empresas, ~2-5 min) era la única
 * referencia de duración. Con las duraciones medidas en 7 días —facturas 4-8 s
 * por empresa, costo 1-2 s, estadocuenta 101/121/152 s (p50/p90/máx)— una
 * corrida de `tipo=facturas` de las 8 empresas termina en ~1 min y cierra sus
 * sesiones (logoutAllSwitchSessions en el finally del route). 15 min deja más
 * de 10× de margen sobre el peor caso medido de una entrada de ventas.
 *
 * OJO: el test mide inicio-contra-inicio. Para los crons LARGOS (estadocuenta
 * ~152 s/empresa, catálogos hasta 433 s de Tommy, reconciliación hasta
 * RECOVERY_BUDGET_MS = 740 s) el margen real es menor que el número que ve el
 * test; esas parejas se dejaron con ≥50 min a propósito.
 */
export const SEPARACION_MINIMA_MIN = 15;

/** Minutos desde medianoche UTC de un "hhmm" del cronograma. */
export function hhmmAMinutos(hhmm: string): number {
  return Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(2, 4));
}

/**
 * Distancia en minutos entre dos horas del día, dando la vuelta al reloj (la
 * más corta de las dos direcciones). Dos entradas a la misma hora → 0.
 */
export function distanciaCircularMin(hhmmA: string, hhmmB: string): number {
  const d = Math.abs(hhmmAMinutos(hhmmA) - hhmmAMinutos(hhmmB));
  return Math.min(d, 24 * 60 - d);
}

// ─── Slots de switch-sync (derivados de SWITCH_CRON_ENTRADAS) ────────────────
// Cada entrada de switch-sync en vercel.json lleva `&slot=<tipo>-<hhmm>`; el
// route registra el heartbeat granular "switch-sync:<slot>". El cronograma de
// arriba ya tiene tipo (en `cron`), hora y empresas de cada entrada → los slots
// se derivan de ahí en vez de repetir la lista (una sola fuente que actualizar).

export type SwitchSyncSlotTipo = "all" | "facturas" | "estadocuenta";
/** sync_type que switch-sync escribe a switch_sync_log. */
export type SwitchSyncTipo = "facturas" | "estadocuenta" | "costo";

export interface SwitchSyncSlot {
  /** Valor de ?slot= y sufijo del heartbeat: "<tipo>-<hhmm>". */
  slot: string;
  tipo: SwitchSyncSlotTipo;
  hhmmUtc: string;
  empresas: readonly string[];
}

const SWITCH_SYNC_CRON_PREFIX = "switch-sync ";

/** Las entradas de switch-sync de vercel.json, con su tipo y sus empresas. */
export const SWITCH_SYNC_SLOTS: SwitchSyncSlot[] = SWITCH_CRON_ENTRADAS.filter((e) =>
  e.cron.startsWith(SWITCH_SYNC_CRON_PREFIX),
).map((e) => {
  const tipo = e.cron.slice(SWITCH_SYNC_CRON_PREFIX.length) as SwitchSyncSlotTipo;
  return { slot: `${tipo}-${e.hhmmUtc}`, tipo, hhmmUtc: e.hhmmUtc, empresas: e.empresas };
});

export const SWITCH_SYNC_SLOT_PREFIX = "switch-sync:";
/** Sufijo de la marca que escribe la reconciliación (NO la entrada del cron). */
export const SLOT_RECUPERADO_SUFFIX = "#recuperado";
/**
 * Sufijo de la marca "primera vez que la reconciliación VIO este slot" — la
 * escribe la reconciliación una sola vez (insert-if-absent) y nunca la pisa.
 *
 * Existe para acotar la tolerancia de siembra de health-crons. La regla
 * seed-tolerante ("fila de slot ausente = aún no sembrada → NO alertar") no
 * tenía vencimiento: un slot que NUNCA logró un success propio quedaba INVISIBLE
 * para siempre, para health-crons Y para el watchdog Telegram (que solo recorre
 * las filas existentes). Caso medido el 25-jul-2026: `switch-sync:all-0540`
 * (05:40 UTC, active_shoes+joystep) no tenía fila propia — solo su marca
 * #recuperado — desde que los slots se introdujeron (#239, 23-jul 14:08 UTC):
 * el 24-jul su entrada corrió y FALLÓ (joystep, auth devolvió HTML) y el 25-jul
 * Vercel perdió la invocación. Dos oportunidades, dos malas, cero alertas por la
 * ausencia. Con la marca #visto la tolerancia caduca a las
 * SLOT_SEED_GRACE_HOURS y el slot pasa a reportarse como caído.
 */
export const SLOT_VISTO_SUFFIX = "#visto";

/** Heartbeat que registra la PROPIA entrada del cron (verdad de terreno). */
export const slotHeartbeatName = (slot: string) => `${SWITCH_SYNC_SLOT_PREFIX}${slot}`;
/** Marca que registra la reconciliación cuando compensa una ocurrencia perdida. */
export const slotRecuperadoName = (slot: string) =>
  `${SWITCH_SYNC_SLOT_PREFIX}${slot}${SLOT_RECUPERADO_SUFFIX}`;
/** Marca "slot visto por primera vez" (se escribe una vez y no se pisa). */
export const slotVistoName = (slot: string) =>
  `${SWITCH_SYNC_SLOT_PREFIX}${slot}${SLOT_VISTO_SUFFIX}`;

/** Sufijos de MARCAS (las escribe la reconciliación, no son crons vigilables). */
export const SLOT_MARCA_SUFFIXES = [SLOT_RECUPERADO_SUFFIX, SLOT_VISTO_SUFFIX] as const;

/** ¿`cronName` es una marca de la reconciliación (no un cron de verdad)? */
export function esMarcaDeSlot(cronName: string): boolean {
  return SLOT_MARCA_SUFFIXES.some((suf) => cronName.endsWith(suf));
}

/**
 * Horas de gracia de siembra de un slot: pasado esto desde que la reconciliación
 * lo vio por primera vez (marca #visto), la AUSENCIA de su heartbeat propio deja
 * de ser "todavía no sembrado" y pasa a ser "nunca logró un success". 50h = dos
 * ocurrencias diarias + jitter (mismo criterio que SLOT_ENTRY_DEAD_HOURS, que
 * cubre el caso simétrico: la fila existe pero envejeció).
 */
export const SLOT_SEED_GRACE_HOURS = 50;

/**
 * ¿Un slot SIN heartbeat propio ya debe reportarse como caído? true solo si su
 * marca #visto existe y ya venció la gracia. Fail-SAFE al silencio mientras no
 * haya marca: un slot recién desplegado (o una reconciliación que aún no corrió)
 * no dispara un 503 falso.
 */
export function slotNuncaSembradoVencido(
  vistoAt: string | null | undefined,
  now: number = Date.now(),
): boolean {
  const v = vistoAt ? Date.parse(vistoAt) : NaN;
  if (!Number.isFinite(v)) return false;
  return now - v >= SLOT_SEED_GRACE_HOURS * 3600 * 1000;
}

/** Nombres de heartbeat de los slots (los que vigila health-crons). */
export const SWITCH_SYNC_SLOT_HEARTBEATS = SWITCH_SYNC_SLOTS.map((s) => slotHeartbeatName(s.slot));

/**
 * ¿`cronName` es el heartbeat de un slot de switch-sync que YA NO EXISTE en el
 * calendario? (fila vieja en cron_heartbeats de una entrada que se movió o se
 * quitó de vercel.json).
 *
 * POR QUÉ: health-crons vigila la lista DERIVADA (SWITCH_SYNC_SLOTS), así que un
 * slot retirado le es invisible — pero el watchdog Telegram de
 * switch-reconciliacion recorre TODAS las filas de cron_heartbeats. Sin este
 * filtro, mover una entrada (ej. `facturas-2315` → `facturas-2300` el
 * 26-jul-2026) deja su fila vieja envejeciendo para siempre → alerta diaria
 * eterna por un cron que ya no existe. Es código, no limpieza manual de datos: la
 * próxima vez que se mueva un horario no hay que acordarse de borrar filas.
 *
 * Las marcas (#recuperado / #visto) NO entran acá: ya las filtra esMarcaDeSlot.
 */
export function esSlotRetirado(cronName: string): boolean {
  if (!cronName.startsWith(SWITCH_SYNC_SLOT_PREFIX)) return false;
  if (esMarcaDeSlot(cronName)) return false;
  return !SWITCH_SYNC_SLOT_HEARTBEATS.includes(cronName);
}

// ─── Registro de crons vigilados (fuente ÚNICA para AMBOS vigías) ────────────
// GENERALIZACIÓN de esSlotRetirado (26-jul-2026 → 27-jul-2026). Aquel filtro
// resolvía el caso de un SLOT de switch-sync retirado, porque los slots se
// derivan de una lista (SWITCH_SYNC_SLOTS) y "no está en la lista" era
// computable. Un cron de nombre PLANO no tenía lista equivalente: el watchdog
// Telegram recorre TODAS las filas de cron_heartbeats y no tenía forma de saber
// si `multifashion-sync` seguía existiendo.
//
// INCIDENTE 27-jul-2026: el PR #316 retiró `multifashion-sync` (entrada de
// vercel.json, route, colateral de la reconciliación y sus filas en las listas
// de vigilancia) pero su fila quedó en cron_heartbeats con
// last_success_at = 2026-07-26T05:00:34. A las 26h pasó a stale y el watchdog
// empezó a mandar "⏰ Watchdog crons — 1 sin success reciente: multifashion-sync"
// TODOS LOS DÍAS, para siempre, por un cron que ya no existe.
//
// La solución es un REGISTRO explícito de los nombres de heartbeat que el
// sistema conoce hoy. Un nombre fuera del registro no se vigila.

/**
 * Crons con vigilancia fail-CLOSED: si su fila NO existe en cron_heartbeats se
 * reportan como caídos (nunca registraron un success). Vivía como
 * `EXPECTED_CRONS` dentro de health-crons; se mudó acá para que los DOS vigías
 * lean la MISMA lista — health-crons la recorre para decidir el 503 y el
 * watchdog Telegram la usa (vía `esCronRetirado`) para decidir a quién ignorar.
 * Con la lista duplicada podían divergir, y de hecho divergían: `db-salud`
 * (desplegado el 27-jul-2026) estaba vigilado por el watchdog Telegram —que
 * recorre todas las filas— y era INVISIBLE para health-crons.
 */
export const CRONS_FAIL_CLOSED = [
  "acs-fidelizacion",
  "acs-resumen-diario",
  "backup",
  "cheques-alert",
  "cleanup-packing-lists",
  "cleanup-sessions",
  "grupo-resumen-mensual",
  "integrity-check",
  "joybees-catalogo",
  // "multifashion-sync" — RETIRADO 26-jul-2026 (tabla multifashion_tickets
  // congelada, ver CLAUDE.md). Sin cron no hay heartbeat: dejarlo acá haría que
  // health-crons devolviera 503 todos los días por un cron que ya no existe.
  "reebok-catalogo",
  "refresh-clientes-views",
  "switch-articulos",
  "switch-reconciliacion",
  "switch-sync",
  "sync-clientes-master",
  "sync-proveedores",
  "sync-recibos",
  "sync-utilidad",
  "tommy-catalogo",
] as const;

/**
 * Heartbeats que NO son crons de vercel.json: los escribe una acción MANUAL del
 * usuario. `sync-now-refresh-vistas` lo registra el botón "Actualizar ahora" de
 * Ventas (ver src/lib/refresh-vistas.ts) y solo sirve de cooldown de 10 min.
 *
 * Nadie los programa → que lleven 26h sin escribirse es lo NORMAL. El
 * encabezado de refresh-vistas.ts ya decía "IGNORADA por health-crons/watchdog",
 * y era verdad a medias: health-crons recorre listas (nunca la vio), pero el
 * watchdog Telegram recorre TODAS las filas y sí habría alertado por ella el día
 * después de que alguien usara el botón. Bug latente, nunca disparado porque la
 * fila no existe todavía en producción.
 */
export const HEARTBEATS_NO_CRON = ["sync-now-refresh-vistas"] as const;

/** Todo nombre de heartbeat de cron que el sistema conoce hoy (fail-closed +
 *  seed-tolerantes). NO incluye slots ni marcas: esos se derivan del calendario
 *  y tienen su propio camino en `esCronRetirado`. */
export const CRONS_CONOCIDOS: ReadonlySet<string> = new Set<string>([
  ...CRONS_FAIL_CLOSED,
  ...SEED_TOLERANT_CRONS,
]);

/**
 * ¿`cronName` es un cron RETIRADO — una fila de cron_heartbeats que ya no
 * corresponde a ningún cron vivo? Generaliza `esSlotRetirado` a los heartbeats
 * de nombre plano.
 *
 * FAIL-OPEN CONTROLADO, y la tensión se resuelve FUERA del runtime:
 *
 * La regla ingenua sería "si no está en vercel.json, no alerto" — y sería
 * PEOR que el bug: quien borrara una entrada de vercel.json por accidente
 * apagaría la alerta del cron junto con el cron, en silencio. Por eso el
 * criterio NO mira vercel.json en tiempo de ejecución: mira este registro, que
 * es una constante de CÓDIGO. Borrar una entrada de vercel.json no encoge el
 * registro → el cron sigue vigilado → su heartbeat envejece → los DOS vigías
 * alertan, exactamente como hoy. El fail-closed queda intacto.
 *
 * Retirar un cron a propósito son DOS ediciones deliberadas (vercel.json + este
 * registro), y `src/__tests__/lib/cron-registro.test.ts` exige la biyección
 * entre ambos: si alguien toca uno solo, el build se pone ROJO. O sea que el
 * accidente se atrapa en CI, no en silencio en producción.
 *
 * Las marcas (#recuperado / #visto) NO son crons retirados: son datos que
 * escribe la reconciliación y se filtran aparte con `esMarcaDeSlot`.
 */
export function esCronRetirado(cronName: string): boolean {
  if (esMarcaDeSlot(cronName)) return false;
  if (cronName.startsWith(SWITCH_SYNC_SLOT_PREFIX)) return esSlotRetirado(cronName);
  if ((HEARTBEATS_NO_CRON as readonly string[]).includes(cronName)) return false;
  return !CRONS_CONOCIDOS.has(cronName);
}

/**
 * ¿Esta fila de cron_heartbeats NO se vigila? Tres razones, todas computables
 * en código — es el filtro ÚNICO que aplica el watchdog Telegram antes de mirar
 * la antigüedad:
 *   (a) es una MARCA de la reconciliación (#recuperado / #visto), no un cron;
 *   (b) es un heartbeat de acción MANUAL (HEARTBEATS_NO_CRON), que nadie
 *       programa y por tanto siempre acaba "stale";
 *   (c) es un cron RETIRADO (ver esCronRetirado).
 */
export function esHeartbeatNoVigilable(cronName: string): boolean {
  return (
    esMarcaDeSlot(cronName) ||
    (HEARTBEATS_NO_CRON as readonly string[]).includes(cronName) ||
    esCronRetirado(cronName)
  );
}

/**
 * Minutos tras la hora programada dentro de los cuales se considera que la
 * ENTRADA sí se invocó. Se usa para dos cosas:
 *   (a) decidir si la entrada llegó (`corrioEnVentana`): si llegó, el slot no se
 *       "cubre" nunca y un fallo suyo se reporta como `corrio-y-fallo`;
 *   (b) esperar antes de declarar `sin-invocacion` — re-ejecutar es caro (toca
 *       Switch, sesión única por empresa), no vale adelantarse a una entrada que
 *       todavía puede llegar tarde.
 *
 * 120 → 30 (26-jul-2026, cuenta en Vercel PRO).
 *
 * El 120 venía del jitter del plan Hobby, donde Vercel disparaba con hasta una
 * hora de retraso. Medido en switch_sync_log del 20-24 jul (Hobby), retraso del
 * PRIMER run de cada slot respecto de su hora: p50 28.7 min, p90 55 min, máx
 * 58.4 min. Con Pro el disparo es puntual: en las ocurrencias del 25/26-jul ya
 * bajo Pro el primer run arrancó a +1s (estadocuenta-2110 21:10:01), +13s
 * (2115), +22s (2120), +32s (facturas-2315 23:15:32) y +40s (facturas-0015
 * 00:15:40); la deriva que se ve en el heartbeat (23:15:39, 00:15:47) es la
 * DURACIÓN del sync, no retraso de disparo. El slot más largo termina entero en
 * ~4 min (21:10:01 → 21:13:57 con dos empresas).
 *
 * Por qué 30 y no 20: los slots `all` (05:30/05:35/05:40/06:30) hacen
 * facturas+estadocuenta+costo de dos empresas y son los únicos sin muestra bajo
 * Pro todavía; bajo Hobby su duración medida fue de 2 a 5 min. 30 min deja ~5×
 * de margen sobre el peor caso observado y coincide con RUNNING_STALE_MIN (una
 * corrida más vieja que eso ya se considera muerta en el resto del sistema).
 *
 * Por qué no dejarlo en 120: la ventana de 2h TAPA pérdidas reales. La ronda de
 * las 16:0x solo tiene UNA pasada de reconciliación después (18:00): con 120 min
 * las ocurrencias de 16:05 y 16:10 vencían recién 18:05/18:10, o sea nunca se
 * re-ejecutaban ese día. Con 30 vencen 16:35/16:40 y la pasada de las 18:00 sí
 * las atiende. (El caso `corrio-y-fallo` no espera ventana y no cambia: sigue
 * reportándose de una — ver clasificarSlots.)
 */
export const SLOT_RUN_WINDOW_MIN = 30;

/**
 * Tope duro anti-enmascaramiento: por muchas marcas #recuperado que haya, si la
 * ENTRADA propia del slot lleva más de esto sin un success, el slot vuelve a
 * contar como caído. 50h = dos ocurrencias diarias + margen de jitter → una
 * entrada que Vercel dejó de invocar del todo se reporta al segundo día, en vez
 * de quedar tapada para siempre por la recuperación diaria de la reconciliación.
 */
export const SLOT_ENTRY_DEAD_HOURS = 50;

/** ¿Un slot de tipo `slotTipo` es responsable del sync_type `syncType`? */
export function slotCubreTipo(slotTipo: SwitchSyncSlotTipo, syncType: SwitchSyncTipo): boolean {
  // tipo=all corre facturas → estadocuenta (solo empresas con CXC) → costo.
  return slotTipo === "all" ? true : slotTipo === syncType;
}

/** Ocurrencia programada más reciente del slot (siempre <= now), en UTC. */
export function ultimaOcurrenciaUtc(hhmmUtc: string, now: Date): Date {
  const h = Number(hhmmUtc.slice(0, 2));
  const m = Number(hhmmUtc.slice(2, 4));
  const d = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), h, m, 0, 0),
  );
  if (d.getTime() > now.getTime()) d.setUTCDate(d.getUTCDate() - 1); // aún no llega hoy → ayer
  return d;
}

/**
 * Instante (ms) desde el cual CONSTA que la entrada del slot existía — el más
 * antiguo de los dos rastros que deja: su heartbeat propio (corrió y salió OK) y
 * su marca #visto (la reconciliación la vio en el calendario). NaN si no hay
 * ninguno de los dos.
 *
 * POR QUÉ (incidente 26-jul-2026): `ultimaOcurrenciaUtc` ancla la evaluación en
 * la ocurrencia programada más reciente, que para un slot cuya hora aún no llegó
 * hoy cae AYER. Para una entrada creada HOY —el calendario pasó de 47 a 52
 * entradas a las 06:14 UTC— eso es una ocurrencia en la que la entrada NO
 * EXISTÍA. La pasada de las 10:02 evaluó así `facturas-1300/1700/1900/2100`
 * contra las 13:00/17:00/19:00/21:00 de AYER y, como american_classic/facturas
 * tenía corridas posteriores (23:15, 00:15, 06:30), les escribió la marca
 * `#recuperado`: una certificación de algo que nunca pasó.
 *
 * El daño no es solo cosmético. La rama simétrica es peor: si esos pares NO
 * hubieran estado frescos, los mismos slots habrían salido `sin-invocacion` →
 * re-sync contra Switch (sesión única, caro) y alerta 🚨 de Telegram, todo por
 * ocurrencias anteriores a que la entrada existiera.
 *
 * La marca #visto ya existía (acota la gracia de siembra, ver SLOT_VISTO_SUFFIX)
 * pero `clasificarSlots` no la miraba. Ahora es el PISO: ninguna ocurrencia
 * anterior a este instante se clasifica —ni como cubierta ni como desatendida—.
 * Fail-abierto si no hay rastro (NaN): sin evidencia se evalúa como antes, para
 * no volver ciego al clasificador si la escritura de la marca falla.
 */
export function slotConocidoDesdeMs(
  slot: string,
  heartbeats: Map<string, string | null | undefined>,
): number {
  const marcas = [heartbeats.get(slotHeartbeatName(slot)), heartbeats.get(slotVistoName(slot))]
    .map((v) => (v ? Date.parse(v) : NaN))
    .filter((t) => Number.isFinite(t));
  return marcas.length > 0 ? Math.min(...marcas) : NaN;
}

/** Pares (empresa, sync_type) de los que responde una ocurrencia del slot. */
export function paresDelSlot(
  slot: SwitchSyncSlot,
  empresasConCxc: readonly string[],
): Array<{ empresa: string; syncType: SwitchSyncTipo }> {
  const cxc = new Set(empresasConCxc);
  const pares: Array<{ empresa: string; syncType: SwitchSyncTipo }> = [];
  for (const empresa of slot.empresas) {
    if (slot.tipo === "all") {
      pares.push({ empresa, syncType: "facturas" });
      if (cxc.has(empresa)) pares.push({ empresa, syncType: "estadocuenta" });
      pares.push({ empresa, syncType: "costo" });
    } else {
      pares.push({ empresa, syncType: slot.tipo });
    }
  }
  return pares;
}

export interface SyncLogRowMin {
  empresa_key: string;
  sync_type: string;
  status: string;
  started_at: string;
  /** Último error registrado (opcional: solo lo usa el reporte de fallos). */
  error_message?: string | null;
}

export interface SlotHuerfano {
  /** "<tipo>-<hhmm>". */
  slot: string;
  /** Nombre del heartbeat a escribir (la marca #recuperado). */
  heartbeat: string;
  /** ISO de la ocurrencia cuyo trabajo quedó hecho por otro. */
  ocurrencia: string;
  /** Pares que sí quedaron al día después de esa ocurrencia. */
  pares: string[];
  /**
   * ¿La entrada SÍ se invocó en la ventana de la ocurrencia? false = Vercel
   * perdió la invocación (el huérfano clásico); true = la entrada llegó, no
   * registró su heartbeat propio (falló a medias) y el trabajo lo completó otra
   * corrida posterior. Los dos casos se cubren igual —el criterio es el TRABAJO,
   * no quién lo hizo— pero se distinguen para auditoría.
   */
  entradaCorrio: boolean;
}

/** Por qué la ocurrencia de un slot quedó sin atender. */
export type SlotDesatendidoMotivo = "sin-invocacion" | "corrio-y-fallo";

export interface ParPendiente {
  empresa: string;
  syncType: SwitchSyncTipo;
  /** Última corrida de ese par DENTRO de la ocurrencia (null si no hubo). */
  ultimoIntento: { status: string; started_at: string; error_message?: string | null } | null;
}

export interface SlotDesatendido {
  /** "<tipo>-<hhmm>". */
  slot: string;
  tipo: SwitchSyncSlotTipo;
  /** ISO de la ocurrencia cuyo trabajo NO quedó hecho. */
  ocurrencia: string;
  motivo: SlotDesatendidoMotivo;
  /** Pares sin success POSTERIOR a la ocurrencia → hay que re-ejecutarlos. */
  paresPendientes: ParPendiente[];
}

export interface SlotsClasificados {
  /** Ocurrencia perdida PERO trabajo al día → marca #recuperado. */
  cubiertos: SlotHuerfano[];
  /** Ocurrencia cuyo trabajo NO está hecho → re-ejecutar (y reportar). */
  desatendidos: SlotDesatendido[];
}

/**
 * Slots HUÉRFANOS: su ocurrencia programada más reciente NO se invocó (ninguna
 * corrida en switch_sync_log dentro de su ventana) PERO el trabajo del que eran
 * responsables sí quedó hecho después (por la recuperación de la reconciliación
 * o por otra entrada que cubre los mismos pares). Su heartbeat propio quedó
 * congelado en la última vez que la entrada sí corrió → el watchdog los reporta
 * stale con los datos perfectamente al día (falso positivo medido el 25-jul-2026
 * con facturas-2315 39.7h, facturas-0015 38.9h y all-0535 33.5h).
 *
 * Reglas — pensadas para NO tapar un fallo real:
 *  0. Solo ocurrencias POSTERIORES a que conste que la entrada existía
 *     (slotConocidoDesdeMs): una entrada nueva no responde por el ayer en que no
 *     estaba en el calendario.
 *  1. Solo la ocurrencia YA VENCIDA (ultimaOcurrenciaUtc): un slot cuya hora de
 *     hoy aún no llega se evalúa contra la de ayer, que si corrió bien lo saca.
 *  2. Si la entrada YA registró su heartbeat propio en/después de la ocurrencia
 *     → corrió, no hay nada que cubrir.
 *  3. Solo se cubre si TODOS sus pares tienen un success posterior a la
 *     ocurrencia. Cubrir con el trabajo a medias sería tapar datos atrasados —
 *     mientras algo quede pendiente el slot sale como `desatendido` y se reporta.
 *  4. Si hubo CUALQUIER corrida (success o error) en la ventana de la ocurrencia,
 *     la entrada SÍ se invocó: eso decide el `motivo` de un desatendido
 *     (corrio-y-fallo vs sin-invocacion), NO si se cubre.
 * Y aun cubierto, el tope duro SLOT_ENTRY_DEAD_HOURS lo devuelve a "caído" si su
 * entrada propia lleva 2 días sin invocarse (ver slotCubiertoPorRecuperacion).
 */
export function slotsHuerfanos(args: {
  now: Date;
  rows: SyncLogRowMin[];
  heartbeats: Map<string, string | null | undefined>;
  empresasConCxc: readonly string[];
  slots?: SwitchSyncSlot[];
}): SlotHuerfano[] {
  return clasificarSlots(args).cubiertos;
}

/**
 * Clasificador de ocurrencias de slot — el ANCLA es la ocurrencia del slot, NO
 * el día calendario (fix jul-2026, defectos 1 y 2).
 *
 * POR QUÉ: la reconciliación razona por PAR (empresa, sync_type) contra el día
 * Panamá: "¿este par tuvo un success hoy?". Para un cron DIARIO eso es correcto.
 * Para un cron INTRADÍA cuyo trabajo es "refrescar OTRA VEZ lo mismo", no dice
 * nada: el par ya tiene el success de la mañana, así que
 *   - una ocurrencia intradía PERDIDA quedaba sin recuperar (25-jul-2026:
 *     facturas-1500 de american_classic murió en el deploy de las 15:00 y las
 *     ventas de ACS no se refrescaron entre las 06:52 y las 23:15 — 16.4h—
 *     porque el par "american_classic/facturas" tenía success de las 06:52), y
 *   - una ocurrencia intradía que CORRIÓ Y FALLÓ quedaba tapada (25-jul-2026:
 *     fashion_shoes/estadocuenta 16:20 "canceling statement due to statement
 *     timeout" + fashion_wear y active_wear colgados en 'running'; la
 *     invocación murió sin poder alertar y la reconciliación de las 18:00 vio
 *     los pares sanos por el success de las 10:30).
 *
 * La pregunta correcta es "¿hay un success POSTERIOR a MI ocurrencia?". Con esa
 * ancla las tres situaciones caen solas:
 *   - cubierto      → la entrada no se invocó pero el trabajo sí quedó hecho
 *                     después (otra entrada o la recuperación) → marca
 *                     #recuperado, sin alarma. Es el slot huérfano de siempre.
 *   - desatendido   → el trabajo de esa ocurrencia NO está hecho → re-ejecutar
 *                     sus pares (aunque tengan un success previo del día) y
 *                     reportar. `motivo` distingue "Vercel perdió la
 *                     invocación" de "corrió y falló".
 *   - (nada)        → la entrada dejó todo al día, o su ventana de jitter aún
 *                     no venció (todavía puede llegar tarde).
 *
 * Reglas comunes con la versión anterior (para NO tapar fallos reales):
 *   0. Ocurrencia posterior a `slotConocidoDesdeMs` (la entrada ya existía).
 *   1. Solo la ocurrencia YA VENCIDA (ultimaOcurrenciaUtc).
 *   2. Heartbeat propio en/después de la ocurrencia → la entrada corrió OK.
 *   3. "Cubierto" exige que TODOS los pares tengan success posterior.
 *   4. Corrida (success o error) dentro de la ventana → la entrada SÍ se invocó
 *      → fija el `motivo` del desatendido; ya NO impide cubrir (ver el bloque de
 *      `cubiertos` más abajo, incidente 26-jul-2026).
 * Regla NUEVA, solo para `desatendidos`: la ventana de jitter
 * (SLOT_RUN_WINDOW_MIN) tiene que haber vencido. Re-ejecutar es CARO (toca
 * Switch, sesión única por empresa) → no adelantarse a una entrada que todavía
 * puede llegar tarde. Los `cubiertos` conservan su semántica exacta.
 */
export function clasificarSlots(args: {
  now: Date;
  rows: SyncLogRowMin[];
  heartbeats: Map<string, string | null | undefined>;
  empresasConCxc: readonly string[];
  slots?: SwitchSyncSlot[];
}): SlotsClasificados {
  const { now, rows, heartbeats, empresasConCxc } = args;
  const slots = args.slots ?? SWITCH_SYNC_SLOTS;
  const cubiertos: SlotHuerfano[] = [];
  const desatendidos: SlotDesatendido[] = [];

  for (const s of slots) {
    const occ = ultimaOcurrenciaUtc(s.hhmmUtc, now);
    const occMs = occ.getTime();
    const finVentanaMs = occMs + SLOT_RUN_WINDOW_MIN * 60_000;

    // (0) la ocurrencia es ANTERIOR a que conste que la entrada existía → no se
    // clasifica de ninguna forma. Una entrada creada hoy no es responsable de la
    // ocurrencia de ayer, ni para bien (marca #recuperado falsa) ni para mal
    // (re-sync + alerta por una corrida que nunca estuvo programada). Ver
    // slotConocidoDesdeMs — incidente 26-jul-2026.
    const conocidoDesdeMs = slotConocidoDesdeMs(s.slot, heartbeats);
    if (Number.isFinite(conocidoDesdeMs) && occMs < conocidoDesdeMs) continue;

    // (2) la entrada ya registró success en/después de su ocurrencia.
    const hb = heartbeats.get(slotHeartbeatName(s.slot));
    const hbMs = hb ? Date.parse(hb) : NaN;
    if (Number.isFinite(hbMs) && hbMs >= occMs) continue;

    const pares = paresDelSlot(s, empresasConCxc);
    const relevantes = rows.filter((r) =>
      pares.some((p) => p.empresa === r.empresa_key && p.syncType === r.sync_type),
    );
    const ts = (r: SyncLogRowMin) => Date.parse(r.started_at);

    // (3) alguien corrió en la ventana → la entrada se invocó (aunque fallara).
    const enVentana = relevantes.filter((r) => {
      const t = ts(r);
      return Number.isFinite(t) && t >= occMs && t <= finVentanaMs;
    });
    const corrioEnVentana = enVentana.length > 0;
    // ¿La entrada dejó TODOS sus pares OK dentro de su propia ventana? Si sí, la
    // ocurrencia se atendió sola: no hay recuperación que certificar (y si aun
    // así le falta el heartbeat propio, el problema es la telemetría del route,
    // no un slot huérfano — taparlo con una marca sería el error opuesto).
    const entradaHizoTodo =
      corrioEnVentana &&
      pares.every((par) =>
        enVentana.some(
          (r) => r.empresa_key === par.empresa && r.sync_type === par.syncType && r.status === "success",
        ),
      );

    // (4) pares SIN success posterior a la ocurrencia = trabajo pendiente.
    const pendientes: ParPendiente[] = [];
    for (const par of pares) {
      const delPar = relevantes.filter(
        (r) => r.empresa_key === par.empresa && r.sync_type === par.syncType,
      );
      const fresco = delPar.some((r) => {
        if (r.status !== "success") return false;
        const t = ts(r);
        return Number.isFinite(t) && t >= occMs;
      });
      if (fresco) continue;
      // Último intento DENTRO de la ocurrencia (para el mensaje del reporte).
      const intentos = delPar
        .filter((r) => Number.isFinite(ts(r)) && ts(r) >= occMs)
        .sort((a, b) => ts(b) - ts(a));
      const ultimo = intentos[0];
      pendientes.push({
        empresa: par.empresa,
        syncType: par.syncType,
        ultimoIntento: ultimo
          ? { status: ultimo.status, started_at: ultimo.started_at, error_message: ultimo.error_message ?? null }
          : null,
      });
    }

    if (pendientes.length > 0) {
      // Un run del mismo par TODAVÍA en curso (fila 'running' más joven que
      // RUNNING_STALE_MIN) → no tocar: Switch es sesión única por empresa y el
      // índice de 'running' es un mutex; re-ejecutar encima chocaría con la
      // corrida viva. Se evalúa en la pasada siguiente. Pasado ese umbral la
      // fila es un run MUERTO (el 25-jul fashion_wear quedó 'running' de 16:22 a
      // 21:16) y sí cuenta como fallo.
      const hayRunVivo = pendientes.some((p) => {
        if (p.ultimoIntento?.status !== "running") return false;
        const t = Date.parse(p.ultimoIntento.started_at);
        return Number.isFinite(t) && now.getTime() - t < RUNNING_STALE_MIN * 60_000;
      });
      if (hayRunVivo) continue;
    }

    if (pendientes.length === 0) {
      // Trabajo de la ocurrencia HECHO y sin heartbeat propio (regla 2 ya sacó a
      // las entradas que salieron OK) → certificarlo para que el watchdog deje
      // de reportar un slot stale con los datos al día. Se cubre por igual haya
      // corrido o no la entrada: el criterio es el TRABAJO, no quién lo hizo.
      //
      // ANTES exigía `!corrioEnVentana` ("un slot que corrió y falló no se
      // cubre"). El fallo en sí ya se reporta —en la pasada en que el trabajo
      // seguía pendiente sale como `desatendido`/`corrio-y-fallo` y va por
      // alertSwitchCronErrors—, así que la condición no protegía nada; solo
      // dejaba un hueco: una vez compensado el trabajo, el slot no recibía marca
      // NI volvía a reportarse como fallo, y su heartbeat congelado disparaba
      // "sin success reciente" en el watchdog día tras día con los datos
      // perfectamente frescos. Medido el 26-jul-2026: `facturas-1500` (invocación
      // perdida) quedó certificado y `estadocuenta-1605`/`1610` (corrieron 25-jul
      // 16:20/16:22, fallaron, y la ronda de las 21:1x reparó los pares) no —dos
      // slots en el mismo estado observable, trato distinto—.
      //
      // El anti-enmascaramiento NO depende de esta condición sino de
      // SLOT_ENTRY_DEAD_HOURS: la marca jamás pisa el heartbeat propio, así que
      // una entrada que falla todos los días vuelve a alertar a las 50h.
      //
      // Lo único que sigue vedado es certificar una ocurrencia que la propia
      // entrada resolvió entera dentro de su ventana (entradaHizoTodo): ahí no
      // hubo recuperación de nadie y un día sano debe seguir siendo cero marcas.
      if (!entradaHizoTodo) {
        cubiertos.push({
          slot: s.slot,
          heartbeat: slotRecuperadoName(s.slot),
          ocurrencia: occ.toISOString(),
          pares: pares.map((p) => `${p.empresa}/${p.syncType}`),
          entradaCorrio: corrioEnVentana,
        });
      }
      continue;
    }

    // Trabajo pendiente. La espera por la ventana de jitter aplica SOLO cuando
    // no corrió nada: es la que evita adelantarse a una entrada que Vercel puede
    // estar por invocar tarde. Si la entrada YA llegó y dejó el trabajo a medias
    // no hay a quién esperar — y esperar sería fatal para la ronda de las 16:0x,
    // cuya única pasada de reconciliación (18:00) cae DENTRO de su ventana de
    // 120 min: el fallo del 25-jul quedaría otra vez sin reportar.
    if (!corrioEnVentana && now.getTime() < finVentanaMs) continue;
    desatendidos.push({
      slot: s.slot,
      tipo: s.tipo,
      ocurrencia: occ.toISOString(),
      motivo: corrioEnVentana ? "corrio-y-fallo" : "sin-invocacion",
      paresPendientes: pendientes,
    });
  }
  return { cubiertos, desatendidos };
}

/**
 * ¿Un slot stale está CUBIERTO por una recuperación de la reconciliación (y por
 * tanto no debe alertar)? Exige las dos cosas:
 *   (a) marca #recuperado fresca (dentro del umbral diario normal), y
 *   (b) que su ENTRADA propia haya corrido hace menos de SLOT_ENTRY_DEAD_HOURS.
 * (b) es el anti-enmascaramiento: la marca nunca pisa el heartbeat real, así que
 * una entrada que dejó de invocarse envejece igual y vuelve a alertar al 2º día.
 */
export function slotCubiertoPorRecuperacion(
  entryLastSuccessAt: string | null | undefined,
  recuperadoAt: string | null | undefined,
  now: number = Date.now(),
): boolean {
  const e = entryLastSuccessAt ? Date.parse(entryLastSuccessAt) : NaN;
  if (!Number.isFinite(e)) return false; // sin heartbeat propio nunca → no cubrir
  if (now - e >= SLOT_ENTRY_DEAD_HOURS * 3600 * 1000) return false;
  const c = recuperadoAt ? Date.parse(recuperadoAt) : NaN;
  if (!Number.isFinite(c)) return false;
  return now - c < CRON_STALE_HOURS_DEFAULT * 3600 * 1000;
}

export interface ProximoCron {
  cron: string;
  hhmmUtc: string;
  /** Hora local Panamá "H:MM" (UTC-5 fijo, sin DST) para mensajes al usuario. */
  horaPanama: string;
  /** Minutos (redondeo arriba) desde `ahora` hasta esa corrida. */
  enMinutos: number;
}

function hhmmToUtcDate(hhmm: string, ahora: Date): Date {
  const h = Number(hhmm.slice(0, 2));
  const m = Number(hhmm.slice(2, 4));
  const d = new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), ahora.getUTCDate(), h, m, 0, 0));
  if (d.getTime() <= ahora.getTime()) d.setUTCDate(d.getUTCDate() + 1); // ya pasó hoy → mañana
  return d;
}

function hhmmUtcAPanama(hhmm: string): string {
  const h = (Number(hhmm.slice(0, 2)) - 5 + 24) % 24;
  return `${h}:${hhmm.slice(2, 4)}`;
}

/**
 * Próxima corrida de cron que toca el Switch de `empresaKey` (la más cercana
 * en el futuro, mirando hoy y mañana en UTC). null si ninguna entrada del
 * cronograma toca esa empresa (no debería pasar con las keys canónicas).
 */
export function proximoCronParaEmpresa(empresaKey: string, ahora: Date = new Date()): ProximoCron | null {
  let best: { entrada: SwitchCronEntrada; date: Date } | null = null;
  for (const entrada of SWITCH_CRON_ENTRADAS) {
    if (!entrada.empresas.includes(empresaKey)) continue;
    const date = hhmmToUtcDate(entrada.hhmmUtc, ahora);
    if (!best || date.getTime() < best.date.getTime()) best = { entrada, date };
  }
  if (!best) return null;
  return {
    cron: best.entrada.cron,
    hhmmUtc: best.entrada.hhmmUtc,
    horaPanama: hhmmUtcAPanama(best.entrada.hhmmUtc),
    enMinutos: Math.ceil((best.date.getTime() - ahora.getTime()) / 60_000),
  };
}

/**
 * ¿Un cron stale califica como "pendingRecovery" (recuperación en camino) en
 * vez de contar como caído? Requiere: (a) recuperación conocida que AÚN viene
 * hoy, y (b) stale hace MENOS de PENDING_RECOVERY_MAX_HOURS. Un cron sin
 * heartbeat jamás (fecha ausente/ inválida = fail-closed → caído). Compartida:
 * health-crons (no cuenta para el 503) y watchdog Telegram de la reconciliación
 * (no manda alerta fantasma).
 */
export function staleEsPendingRecovery(
  cronName: string,
  lastSuccessAt: string | null | undefined,
  now: number = Date.now(),
): boolean {
  const t = lastSuccessAt ? new Date(lastSuccessAt).getTime() : NaN;
  if (!Number.isFinite(t)) return false;
  if (now - t >= PENDING_RECOVERY_MAX_HOURS * 3600 * 1000) return false;
  const d = new Date(now);
  const nowHourUtc = d.getUTCHours() + d.getUTCMinutes() / 60;
  return recoveryStillComingToday(cronName, nowHourUtc);
}

/** Fila mínima de cron_heartbeats que necesita el watchdog. */
export interface HeartbeatRow {
  cron_name: string;
  last_success_at: string | null;
}

/**
 * Lista de crons a reportar como caídos, a partir de las filas de
 * cron_heartbeats. PURA (sin I/O) para poder testear las DOS direcciones: que un
 * cron retirado NO aparezca y que un cron VIVO sí aparezca.
 *
 * La usa el watchdog Telegram de switch-reconciliacion. health-crons recorre
 * `CRONS_FAIL_CLOSED` + slots + seed-tolerantes (necesita distinguir fresh /
 * pendingRecovery / slotsCubiertos para su JSON), pero comparte con esta función
 * el MISMO registro y los MISMOS helpers — que es lo que impide que vuelvan a
 * divergir.
 *
 * Orden de los filtros (cada uno documentado en su helper):
 *   1. `esHeartbeatNoVigilable` — marcas, heartbeats manuales y crons RETIRADOS.
 *   2. `cronIsStale` — umbral propio por cron (mensual = 33 días, no 26h).
 *   3. slot cubierto por una recuperación certificada (#recuperado).
 *   4. recuperación que aún viene hoy (anti alerta-fantasma).
 * Y al final se agregan los slots que NUNCA registraron un heartbeat propio y a
 * los que ya se les venció la gracia de siembra — no tienen fila que recorrer.
 */
export function cronsStaleParaAlerta(rows: HeartbeatRow[], now: number = Date.now()): string[] {
  const beats = new Map<string, string | null>(rows.map((h) => [h.cron_name, h.last_success_at]));
  const esSlot = (n: string) => n.startsWith(SWITCH_SYNC_SLOT_PREFIX) && !esMarcaDeSlot(n);

  const stale = rows
    .filter((h) => !esHeartbeatNoVigilable(h.cron_name))
    .filter((h) => cronIsStale(h.cron_name, h.last_success_at, now))
    .filter(
      (h) =>
        !esSlot(h.cron_name) ||
        !slotCubiertoPorRecuperacion(
          h.last_success_at,
          beats.get(slotRecuperadoName(h.cron_name.slice(SWITCH_SYNC_SLOT_PREFIX.length))),
          now,
        ),
    )
    .filter(
      (h) =>
        !staleEsPendingRecovery(
          esSlot(h.cron_name) ? "switch-sync" : h.cron_name,
          h.last_success_at,
          now,
        ),
    )
    .map((h) => `${h.cron_name} (último: ${h.last_success_at})`);

  // Slots que NUNCA registraron un heartbeat propio. Sin esto quedaban
  // invisibles PARA SIEMPRE en los dos vigías: health-crons los trata como "aún
  // no sembrados" y este watchdog solo recorre las filas que EXISTEN. Caso
  // medido: switch-sync:all-0540 sin fila propia desde que se introdujeron los
  // slots (#239). La marca #visto fecha cuándo la reconciliación lo vio por
  // primera vez; pasada la gracia, se reporta como caído.
  for (const s of SWITCH_SYNC_SLOTS) {
    if (beats.get(slotHeartbeatName(s.slot))) continue;
    if (!slotNuncaSembradoVencido(beats.get(slotVistoName(s.slot)), now)) continue;
    stale.push(
      `${slotHeartbeatName(s.slot)} (nunca registró un success propio; visto desde ${beats.get(slotVistoName(s.slot))})`,
    );
  }
  return stale;
}

/**
 * ¿El cron ya registró un success HOY (día UTC)? Guard de las 2ª entradas del
 * día (backup 18:30, acs-fidelizacion 16:30): si la 1ª corrida ya fue exitosa,
 * la 2ª responde no-op sin trabajar. Fail-open: si la lectura falla, devuelve
 * false → el cron trabaja (mejor un run de más que un día sin backup). No lanza.
 */
export async function cronSuccessHoyUtc(cronName: string): Promise<boolean> {
  try {
    const { data, error } = await supabaseServer
      .from("cron_heartbeats")
      .select("last_success_at")
      .eq("cron_name", cronName)
      .maybeSingle();
    if (error || !data?.last_success_at) return false;
    return data.last_success_at >= `${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`;
  } catch {
    return false;
  }
}

/** Marca al cron como exitoso ahora (upsert por cron_name). No lanza. */
export async function recordCronHeartbeat(cronName: string): Promise<void> {
  try {
    const { error } = await supabaseServer
      .from("cron_heartbeats")
      .upsert(
        { cron_name: cronName, last_success_at: new Date().toISOString() },
        { onConflict: "cron_name" },
      );
    if (error) {
      console.error(`[cron-telemetry] heartbeat ${cronName} falló: ${error.message}`);
    }
  } catch (err) {
    console.error(
      `[cron-telemetry] heartbeat ${cronName} threw: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * Marca al cron como exitoso SOLO si no tiene fila todavía (insert-if-absent):
 * nunca pisa un timestamp existente. Lo usa la marca #visto, que debe conservar
 * la PRIMERA vez que se vio el slot para poder medir la gracia de siembra. No
 * lanza.
 */
export async function recordCronHeartbeatSiFalta(cronName: string): Promise<void> {
  try {
    const { error } = await supabaseServer
      .from("cron_heartbeats")
      .upsert(
        { cron_name: cronName, last_success_at: new Date().toISOString() },
        { onConflict: "cron_name", ignoreDuplicates: true },
      );
    if (error) {
      console.error(`[cron-telemetry] marca ${cronName} falló: ${error.message}`);
    }
  } catch (err) {
    console.error(
      `[cron-telemetry] marca ${cronName} threw: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/** Horas de switch_sync_log que necesita la reconciliación de slots: la
 *  ocurrencia más vieja que evalúa está a <24h + su ventana + margen. */
const SLOT_LOG_LOOKBACK_HOURS = 30;

/**
 * Reconciliación de los heartbeats por-slot de switch-sync (fix jul-2026 de los
 * slots huérfanos). Detecta los slots cuya ocurrencia se perdió pero cuyo
 * trabajo sí quedó al día (ver slotsHuerfanos) y les escribe la marca
 * "switch-sync:<slot>#recuperado" — NUNCA el heartbeat propio del slot, que
 * sigue siendo la verdad de terreno de "la entrada se invocó y salió OK".
 *
 * La llama switch-reconciliacion en TODAS sus salidas (incluida la pasada
 * "allHealthy"): el caso medido —facturas-2315 / facturas-0015 de
 * american_classic— no genera pares faltantes, porque la entrada de las 06:30
 * ya dejó el par al día antes de la primera pasada. Best-effort: no lanza.
 */
export async function reconciliarSlotsSwitchSync(
  now: Date = new Date(),
): Promise<SlotsClasificados> {
  const vacio: SlotsClasificados = { cubiertos: [], desatendidos: [] };
  try {
    const desdeIso = new Date(now.getTime() - SLOT_LOG_LOOKBACK_HOURS * 3600 * 1000).toISOString();
    const [logRes, hbRes] = await Promise.all([
      supabaseServer
        .from("switch_sync_log")
        .select("empresa_key,sync_type,status,started_at,error_message")
        .gte("started_at", desdeIso)
        .in("sync_type", ["facturas", "estadocuenta", "costo"]),
      supabaseServer
        .from("cron_heartbeats")
        .select("cron_name,last_success_at")
        .in("cron_name", [...SWITCH_SYNC_SLOT_HEARTBEATS, ...SWITCH_SYNC_SLOTS.map((s) => slotVistoName(s.slot))]),
    ]);
    if (logRes.error || hbRes.error) {
      console.error(
        `[cron-telemetry] slots huérfanos: ${logRes.error?.message ?? ""} ${hbRes.error?.message ?? ""}`.trim(),
      );
      return vacio; // sin señal fiable → no cubrir a ciegas
    }
    const heartbeats = new Map<string, string | null | undefined>(
      (hbRes.data ?? []).map((h) => [h.cron_name as string, h.last_success_at as string | null]),
    );
    // Marca #visto de los slots que aún NO tienen heartbeat propio: arranca el
    // reloj de la gracia de siembra para que su ausencia no sea eterna (ver
    // SLOT_VISTO_SUFFIX) Y fija el PISO de ocurrencias del slot (ver
    // slotConocidoDesdeMs). insert-if-absent → nunca pisa la primera vez.
    //
    // La marca recién escrita se agrega al mapa para que el piso valga en ESTA
    // misma pasada: si no, la primera pasada tras desplegar una entrada nueva
    // seguiría evaluando su "ocurrencia de ayer" —justo el caso del 26-jul-2026,
    // en el que las 5 entradas nacidas a las 06:14 recibieron marcas por las
    // 13:00-23:00 del día anterior—. Si la escritura falla, el mapa igual queda
    // con el valor: el piso es una cota superior de "cuándo la vimos", nunca
    // certifica un success.
    const nowIso = now.toISOString();
    for (const s of SWITCH_SYNC_SLOTS) {
      if (heartbeats.get(slotHeartbeatName(s.slot))) continue;
      if (heartbeats.get(slotVistoName(s.slot))) continue;
      await recordCronHeartbeatSiFalta(slotVistoName(s.slot));
      heartbeats.set(slotVistoName(s.slot), nowIso);
    }
    const clasificados = clasificarSlots({
      now,
      rows: (logRes.data ?? []) as SyncLogRowMin[],
      heartbeats,
      empresasConCxc: empresasConCxc(),
    });
    for (const h of clasificados.cubiertos) await recordCronHeartbeat(h.heartbeat);
    return clasificados;
  } catch (err) {
    console.error(
      `[cron-telemetry] slots huérfanos threw: ${err instanceof Error ? err.message : String(err)}`,
    );
    return vacio;
  }
}

/**
 * Registra un error de cron en cron_email_errors y dispara alerta Telegram.
 * No lanza. `context` es opcional (se guarda en cheque_context por compat con
 * el esquema existente de la tabla). `opts.telegram` (default true) permite
 * persistir sin mandar Telegram cuando el caller ya envió una alerta propia
 * más específica (evita el doble aviso).
 */
export async function logCronError(
  tipo: string,
  message: string,
  context?: string | null,
  opts?: { telegram?: boolean },
): Promise<void> {
  // 1. Persistir en cron_email_errors (best-effort).
  try {
    const { error } = await supabaseServer.from("cron_email_errors").insert({
      tipo,
      cheque_context: context ?? null,
      error_message: message,
    });
    if (error) {
      console.error(`[cron-telemetry] insert cron_email_errors falló: ${error.message}`);
    }
  } catch (err) {
    console.error(
      `[cron-telemetry] insert cron_email_errors threw: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // 2. Alerta Telegram con el error truncado (best-effort; sendTelegramAlert no
  // lanza). Se omite si el caller ya mandó su propia alerta específica.
  if (opts?.telegram !== false) {
    await sendTelegramAlert(`🚨 Cron error — ${tipo}\n${shortError(message)}`);
  }
}

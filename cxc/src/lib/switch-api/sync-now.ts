/**
 * Candado del sync manual on-demand ("Actualizar ahora", /api/admin/sync-now).
 *
 * Dos capas, evaluadas ANTES de disparar el sync (y en este orden):
 *   a) running  — ya hay una corrida fresca (<30 min) de esa EMPRESA en
 *                 switch_sync_log: del mismo (empresa, tipo) O de cualquier
 *                 otro sync_type de la misma empresa (un cron corriendo YA).
 *                 El lock REAL es el índice único parcial
 *                 switch_sync_log_running_lock (DDL 20260723150000, manual):
 *                 si dos disparos pasan el pre-check a la vez, el 2º insert de
 *                 fila 'running' falla (23505) y también responde 409. Mientras
 *                 la DDL no corra, queda solo el pre-check (tolerante).
 *                 El CLIENTE (SyncNowButton) NO muestra este 409: se engancha
 *                 al sync en curso (spinner + re-intento cada ~5s) y refresca
 *                 la vista cuando termina, como si el clic lo hubiera lanzado.
 *   b) cooldown — el último success del (módulo, empresa) fue hace <10 min.
 *                 Datos recién frescos: no tiene sentido re-pegarle a Switch.
 *
 * La ventana "cron-proximo" (rechazar si el próximo cron de la empresa corría
 * en <=40 min) SE ELIMINÓ (jul-2026, decisión de Daniel): el clic siempre
 * actualiza. Trade-off aceptado y documentado: un sync manual pegado a la
 * ventana de un cron de la MISMA empresa puede matarle el token al otro
 * (sesión única Switch, code 0006) — el que pierda falla limpio y la
 * reconciliación (cron switch-reconciliacion) lo recupera; ambos flujos son
 * fail-safe. proximoCronParaEmpresa sigue en cron-telemetry para telemetría.
 *
 * La lógica de decisión es PURA (precheckSyncNow) — el route hace las queries
 * y ejecuta; los tests cubren los motivos de 409 sin tocar DB.
 */

import {
  CXC_GRUPO_EMPRESA_KEYS,
  EMPRESA_KEY_TO_NAME,
} from "@/lib/empresa-mapping";
import { RECIBOS_EMPRESA_KEYS } from "./sync-recibos";
import { empresasConFacturas, empresasConCxp } from "./empresas";
import { RUNNING_STALE_MIN } from "./sync-log";
import {
  REFRESH_VISTAS_HEARTBEAT,
  REFRESH_VISTAS_CRON_HEARTBEAT,
} from "@/lib/refresh-vistas";

export const SYNC_NOW_MODULOS = [
  "estadocuenta",
  "facturas",
  "recibos",
  "clientes-master",
  "catalogo-reebok",
  "catalogo-joybees",
  "catalogo-tommy",
  "catalogo-calvin",
  "proveedores",
  "refresh-vistas",
] as const;

export type SyncNowModulo = (typeof SYNC_NOW_MODULOS)[number];

export function isSyncNowModulo(s: string): s is SyncNowModulo {
  return (SYNC_NOW_MODULOS as readonly string[]).includes(s);
}

/** Roles que pueden disparar cada módulo (el permiso de SERVER; el gate de UI
 *  de cada botón se parametriza aparte en SyncNowButton):
 *   - vendedor: catálogos (arma pedidos) + los 4 módulos de la ficha de
 *     cliente (estadocuenta/recibos/facturas/clientes-master — arma cobranza
 *     y pedido con esos datos). NO proveedores ni refresh-vistas.
 *   - contabilidad SOLO proveedores (es quien vive en /proveedores);
 *   - el resto (refresh-vistas) queda admin+secretaria.
 *  El gate de UI decide DÓNDE ve cada rol su botón: vendedor solo lo ve en
 *  catálogos y en la ficha de cliente (los botones de Ventas/CXC/Clientes
 *  lista siguen admin+secretaria). */
export function rolesSyncNow(modulo: SyncNowModulo): string[] {
  if (modulo === "proveedores") return ["admin", "secretaria", "contabilidad"];
  if (modulo === "refresh-vistas") return ["admin", "secretaria"];
  return ["admin", "secretaria", "vendedor"];
}

/** Minutos de cooldown tras un success del mismo (módulo, empresa). */
export const SYNC_NOW_COOLDOWN_MIN = 10;

interface ModuloConfig {
  /** Empresas válidas para el módulo; null = el módulo no lleva empresa. */
  empresas: readonly string[] | null;
  /** sync_type del lock/cooldown en switch_sync_log; null = sin log (clientes-master). */
  syncType: string | null;
  /** Empresa fija del lock cuando el módulo no lleva empresa en el body. */
  empresaFija?: string;
  /** ¿Toca Switch? (false = exento de la ventana de cronograma). */
  tocaSwitch: boolean;
  /** Módulos SIN switch_sync_log: cron_name(s) de cron_heartbeats cuyo
   *  last_success_at más reciente alimenta el cooldown de 10 min. */
  cooldownHeartbeats?: readonly string[];
}

/** Config por módulo. Los catálogos fijan su empresa (active_shoes / joystep). */
export function moduloConfig(modulo: SyncNowModulo): ModuloConfig {
  switch (modulo) {
    case "estadocuenta":
      return { empresas: CXC_GRUPO_EMPRESA_KEYS, syncType: "estadocuenta", tocaSwitch: true };
    case "facturas":
      return { empresas: empresasConFacturas(), syncType: "facturas", tocaSwitch: true };
    case "recibos":
      return { empresas: RECIBOS_EMPRESA_KEYS, syncType: "recibos", tocaSwitch: true };
    case "clientes-master":
      return {
        empresas: null,
        syncType: null,
        tocaSwitch: false,
        cooldownHeartbeats: ["sync-clientes-master"],
      };
    case "catalogo-reebok":
      return { empresas: null, syncType: "catalogo_reebok", empresaFija: "active_shoes", tocaSwitch: true };
    case "catalogo-joybees":
      return { empresas: null, syncType: "catalogo_joybees", empresaFija: "joystep", tocaSwitch: true };
    case "catalogo-tommy":
      return { empresas: null, syncType: "catalogo_tommy", empresaFija: "fashion_shoes", tocaSwitch: true };
    case "catalogo-calvin":
      return { empresas: null, syncType: "catalogo_calvin", empresaFija: "vistana", tocaSwitch: true };
    case "proveedores":
      // CxP por empresa: 6 B2B + Multifashion (empresasConCxp; Boston no tiene).
      return { empresas: empresasConCxp(), syncType: "proveedores", tocaSwitch: true };
    case "refresh-vistas":
      // DB-only (RPCs de MVs de Ventas): sin empresa, sin Switch, sin lock de
      // switch_sync_log (CONCURRENTLY tolera corridas simultáneas). El cooldown
      // mira el heartbeat manual Y el del cron de las 07:35.
      return {
        empresas: null,
        syncType: null,
        tocaSwitch: false,
        cooldownHeartbeats: [REFRESH_VISTAS_HEARTBEAT, REFRESH_VISTAS_CRON_HEARTBEAT],
      };
  }
}

/** Llave (empresa_key, sync_type) del lock en switch_sync_log; null si el
 *  módulo no escribe log (clientes-master). */
export function lockKeyDe(
  modulo: SyncNowModulo,
  empresa: string | null,
): { empresaKey: string; syncType: string } | null {
  const cfg = moduloConfig(modulo);
  if (!cfg.syncType) return null;
  const empresaKey = cfg.empresaFija ?? empresa;
  if (!empresaKey) return null;
  return { empresaKey, syncType: cfg.syncType };
}

export type SyncNowMotivo = "running" | "cooldown";

export interface SyncNow409 {
  motivo: SyncNowMotivo;
  detalle: string;
}

function minutosDesde(iso: string, ahora: Date): number {
  return Math.max(0, Math.floor((ahora.getTime() - new Date(iso).getTime()) / 60_000));
}

/**
 * Evalúa el candado con los datos ya consultados. Devuelve null si se puede
 * disparar, o el 409 con motivo + detalle legible en español.
 *
 *  - runningStartedAt: started_at de la fila 'running' más reciente del
 *    (empresa, tipo), o null si no hay. Las filas huérfanas (>30 min) NO
 *    cuentan (el route ya las limpió / el insert las limpia).
 *  - runningOtroStartedAt: started_at de la fila 'running' más reciente de la
 *    MISMA empresa con OTRO sync_type (ej. un cron tipo=all corriendo YA).
 *    También bloquea (sesión única Switch por empresa) — cubre el hueco que
 *    antes tapaba la ventana cron-proximo.
 *  - lastSuccessFinishedAt: finished_at del último success del (módulo, empresa).
 *
 * OJO: el detalle del motivo "running" casi nunca se ve — SyncNowButton lo
 * trata como éxito-en-progreso (se engancha al sync en curso). No poner acá
 * instrucciones tipo "espera al sync de las HH:MM".
 */
export function precheckSyncNow(input: {
  ahora: Date;
  runningStartedAt: string | null;
  runningOtroStartedAt?: string | null;
  lastSuccessFinishedAt: string | null;
}): SyncNow409 | null {
  const { ahora, runningStartedAt, runningOtroStartedAt, lastSuccessFinishedAt } = input;

  // a) corrida en curso de la empresa (fresca <30 min; las más viejas son
  //    huérfanas). Mismo tipo primero; luego cualquier otro sync_type.
  for (const startedAt of [runningStartedAt, runningOtroStartedAt ?? null]) {
    if (!startedAt) continue;
    const min = minutosDesde(startedAt, ahora);
    if (min < RUNNING_STALE_MIN) {
      const hace = min <= 0 ? "hace menos de 1 min" : `hace ${min} min`;
      return {
        motivo: "running",
        detalle: `Ya hay una actualización en curso (empezó ${hace}).`,
      };
    }
  }

  // b) cooldown 10 min tras el último success.
  if (lastSuccessFinishedAt) {
    const min = minutosDesde(lastSuccessFinishedAt, ahora);
    if (min < SYNC_NOW_COOLDOWN_MIN) {
      const hace = min <= 0 ? "hace menos de 1 min" : `hace ${min} min`;
      return {
        motivo: "cooldown",
        detalle: `Ya se actualizó ${hace}. Los datos están frescos.`,
      };
    }
  }

  return null;
}

/** Nombre legible de la empresa para mensajes ("Active Shoes"). */
export function nombreEmpresa(empresaKey: string): string {
  return EMPRESA_KEY_TO_NAME[empresaKey] ?? empresaKey;
}

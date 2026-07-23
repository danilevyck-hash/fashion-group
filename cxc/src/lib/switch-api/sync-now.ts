/**
 * Candado del sync manual on-demand ("Actualizar ahora", /api/admin/sync-now).
 *
 * Tres capas, evaluadas ANTES de disparar el sync (y en este orden):
 *   a) running  — ya hay una corrida fresca (<30 min) del mismo (empresa, tipo)
 *                 en switch_sync_log. El lock REAL es el índice único parcial
 *                 switch_sync_log_running_lock (DDL 20260723150000, manual):
 *                 si dos disparos pasan el pre-check a la vez, el 2º insert de
 *                 fila 'running' falla (23505) y también responde 409. Mientras
 *                 la DDL no corra, queda solo el pre-check (tolerante).
 *   b) cron-proximo — el próximo cron que toca el Switch de esa empresa corre
 *                 en <= 40 min (SWITCH_CRON_ENTRADAS, espejo de vercel.json).
 *                 Sesión ÚNICA por empresa: un sync manual pegado al cron le
 *                 mataría el token (code 0006). clientes-master está EXENTO
 *                 (solo lee nuestra DB, jamás toca Switch).
 *   c) cooldown — el último success del (módulo, empresa) fue hace <10 min.
 *                 Datos recién frescos: no tiene sentido re-pegarle a Switch.
 *
 * La lógica de decisión es PURA (precheckSyncNow) — el route hace las queries
 * y ejecuta; los tests cubren los 3 motivos de 409 sin tocar DB.
 */

import { proximoCronParaEmpresa, type ProximoCron } from "@/lib/cron-telemetry";
import {
  SWITCH_ESTADOCUENTA_EMPRESA_KEYS,
  EMPRESA_KEY_TO_NAME,
} from "@/lib/empresa-mapping";
import { RECIBOS_EMPRESA_KEYS } from "./sync-recibos";
import { empresasConFacturas } from "./empresas";
import { RUNNING_STALE_MIN } from "./sync-log";

export const SYNC_NOW_MODULOS = [
  "estadocuenta",
  "facturas",
  "recibos",
  "clientes-master",
  "catalogo-reebok",
  "catalogo-joybees",
] as const;

export type SyncNowModulo = (typeof SYNC_NOW_MODULOS)[number];

export function isSyncNowModulo(s: string): s is SyncNowModulo {
  return (SYNC_NOW_MODULOS as readonly string[]).includes(s);
}

/** Minutos de cooldown tras un success del mismo (módulo, empresa). */
export const SYNC_NOW_COOLDOWN_MIN = 10;

/** Ventana (min) antes del próximo cron de la empresa en la que el manual se rechaza. */
export const SYNC_NOW_VENTANA_CRON_MIN = 40;

interface ModuloConfig {
  /** Empresas válidas para el módulo; null = el módulo no lleva empresa. */
  empresas: readonly string[] | null;
  /** sync_type del lock/cooldown en switch_sync_log; null = sin log (clientes-master). */
  syncType: string | null;
  /** Empresa fija del lock cuando el módulo no lleva empresa en el body. */
  empresaFija?: string;
  /** ¿Toca Switch? (false = exento de la ventana de cronograma). */
  tocaSwitch: boolean;
}

/** Config por módulo. Los catálogos fijan su empresa (active_shoes / joystep). */
export function moduloConfig(modulo: SyncNowModulo): ModuloConfig {
  switch (modulo) {
    case "estadocuenta":
      return { empresas: SWITCH_ESTADOCUENTA_EMPRESA_KEYS, syncType: "estadocuenta", tocaSwitch: true };
    case "facturas":
      return { empresas: empresasConFacturas(), syncType: "facturas", tocaSwitch: true };
    case "recibos":
      return { empresas: RECIBOS_EMPRESA_KEYS, syncType: "recibos", tocaSwitch: true };
    case "clientes-master":
      return { empresas: null, syncType: null, tocaSwitch: false };
    case "catalogo-reebok":
      return { empresas: null, syncType: "catalogo_reebok", empresaFija: "active_shoes", tocaSwitch: true };
    case "catalogo-joybees":
      return { empresas: null, syncType: "catalogo_joybees", empresaFija: "joystep", tocaSwitch: true };
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

export type SyncNowMotivo = "running" | "cron-proximo" | "cooldown";

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
 *  - lastSuccessFinishedAt: finished_at del último success del (módulo, empresa).
 *  - proximo: resultado de proximoCronParaEmpresa (null = sin cron que toque
 *    la empresa o módulo exento).
 */
export function precheckSyncNow(input: {
  ahora: Date;
  runningStartedAt: string | null;
  lastSuccessFinishedAt: string | null;
  proximo: ProximoCron | null;
}): SyncNow409 | null {
  const { ahora, runningStartedAt, lastSuccessFinishedAt, proximo } = input;

  // a) corrida en curso (fresca <30 min; las más viejas son huérfanas).
  if (runningStartedAt) {
    const min = minutosDesde(runningStartedAt, ahora);
    if (min < RUNNING_STALE_MIN) {
      const hace = min <= 0 ? "hace menos de 1 min" : `hace ${min} min`;
      return {
        motivo: "running",
        detalle: `Ya hay una actualización en curso (empezó ${hace}). Espera a que termine.`,
      };
    }
  }

  // b) cron a la vuelta de la esquina.
  if (proximo && proximo.enMinutos <= SYNC_NOW_VENTANA_CRON_MIN) {
    return {
      motivo: "cron-proximo",
      detalle: `El sync automático corre a las ${proximo.horaPanama} (hora Panamá) — espera unos minutos y los datos se actualizan solos.`,
    };
  }

  // c) cooldown 10 min tras el último success.
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

/** Próximo cron relevante para el candado (null si el módulo no toca Switch). */
export function proximoCronDe(
  modulo: SyncNowModulo,
  empresa: string | null,
  ahora: Date,
): ProximoCron | null {
  const cfg = moduloConfig(modulo);
  if (!cfg.tocaSwitch) return null;
  const empresaKey = cfg.empresaFija ?? empresa;
  if (!empresaKey) return null;
  return proximoCronParaEmpresa(empresaKey, ahora);
}

/** Nombre legible de la empresa para mensajes ("Active Shoes"). */
export function nombreEmpresa(empresaKey: string): string {
  return EMPRESA_KEY_TO_NAME[empresaKey] ?? empresaKey;
}

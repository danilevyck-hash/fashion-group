/**
 * El sync manual on-demand («Actualizar», /api/admin/sync-now).
 *
 * 🔴 EN VIVO (26-nov-2026, Daniel: «si pongo Actualizar, lo quiero en vivo, en
 * todas las pestañas que tengan esa opción»). El toque SIEMPRE lee de Switch en
 * ese momento: se retiró el freno de 10 min tras un éxito (`cooldown`), que
 * hacía salir «0 actualizadas · 6 omitidas» y dejaba la línea en «hace 8 min».
 *
 * Lo único que se conserva es la sesión única de Switch por empresa: si ya hay
 * una corrida viva de esa empresa (cron u otro toque, cualquier sync_type), el
 * servidor ESPERA a que termine (`esperarCorridaEnCurso`) — y si era del mismo
 * tipo y salió bien, se UNE a ella — en vez de omitirla o abrir otra sesión
 * encima. El lock REAL sigue siendo el índice único parcial
 * switch_sync_log_running_lock. Los crons no cambian.
 */

import {
  CXC_GRUPO_EMPRESA_KEYS,
  EMPRESA_KEY_TO_NAME,
} from "@/lib/empresa-mapping";
import { RECIBOS_EMPRESA_KEYS } from "./sync-recibos";
import { empresasConFacturas, empresasConCxp } from "./empresas";
import { PEDIDOS_BODEGA_ROLES } from "@/lib/guias/pedidos-bodega";
import { B2B_EMPRESA_KEYS as EMPRESAS_PEDIDOS } from "@/lib/empresa-mapping";

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
  "pedidos",
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
  // Guías › Pedidos: los que ven la pestaña (admin · bodega) más secretaria,
  // que está en TODOS los módulos (candado `sync-now-candado`).
  if (modulo === "pedidos") return ["secretaria", ...PEDIDOS_BODEGA_ROLES];
  return ["admin", "secretaria", "vendedor"];
}

interface ModuloConfig {
  /** Empresas válidas para el módulo; null = el módulo no lleva empresa. */
  empresas: readonly string[] | null;
  /** sync_type del lock en switch_sync_log; null = sin log (clientes-master). */
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
      return { empresas: CXC_GRUPO_EMPRESA_KEYS, syncType: "estadocuenta", tocaSwitch: true };
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
    case "catalogo-tommy":
      return { empresas: null, syncType: "catalogo_tommy", empresaFija: "fashion_shoes", tocaSwitch: true };
    case "catalogo-calvin":
      return { empresas: null, syncType: "catalogo_calvin", empresaFija: "vistana", tocaSwitch: true };
    case "proveedores":
      // CxP por empresa: 6 B2B + Multifashion (empresasConCxp; Boston no tiene).
      return { empresas: empresasConCxp(), syncType: "proveedores", tocaSwitch: true };
    case "pedidos":
      return { empresas: EMPRESAS_PEDIDOS, syncType: "pedidos", tocaSwitch: true };
    case "refresh-vistas":
      // DB-only (RPCs de MVs de Ventas): sin empresa, sin Switch, sin lock de
      // switch_sync_log (CONCURRENTLY tolera corridas simultáneas).
      return { empresas: null, syncType: null, tocaSwitch: false };
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

/** Nombre legible de la empresa para mensajes ("Active Shoes"). */
export function nombreEmpresa(empresaKey: string): string {
  return EMPRESA_KEY_TO_NAME[empresaKey] ?? empresaKey;
}

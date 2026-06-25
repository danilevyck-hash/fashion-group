/**
 * Configuración multi-empresa del sync Switch.
 *
 * Dos cosas:
 *   1. SWITCH_EMPRESA_ENV_MAP — empresa_key canónica (empresa-mapping.ts) →
 *      namespace de env vars SWITCH_<X>_API_*. Preserva los nombres que armó
 *      Daniel (Vistana queda VISTANA_INTERNATIONAL; Multifashion queda
 *      MULTIFASHION aunque su empresa_key sea american_classic). El cliente
 *      resuelve vía esta tabla en vez de derivar el env key del empresa_key.
 *   2. EMPRESA_SYNC_CAPABILITIES — qué sincroniza cada empresa:
 *      - facturas → switch_facturas. Multifashion=true: alimenta switch_facturas
 *        (base del tab Multifashion desde fase 2.1b) además de su tabla legacy
 *        multifashion_tickets (que su cron propio sigue manteniendo). Vive en ambas
 *        a propósito (invariante 🟡-14: nunca sumar las dos fuentes → doble conteo).
 *      - cxc → switch_estadocuenta. Boston=false (su CXC se maneja por otro lado,
 *        probablemente Brand It).
 */

import type { EmpresaKey } from "@/lib/empresa-mapping";

export const SWITCH_EMPRESA_ENV_MAP: Record<EmpresaKey, string> = {
  american_classic: "MULTIFASHION",
  vistana: "VISTANA_INTERNATIONAL",
  fashion_wear: "FASHION_WEAR",
  fashion_shoes: "FASHION_SHOES",
  active_shoes: "ACTIVE_SHOES",
  active_wear: "ACTIVE_WEAR",
  joystep: "JOYSTEP",
  confecciones_boston: "CONFECCIONES_BOSTON",
};

export interface EmpresaSyncCapability {
  /** Sincroniza facturas a switch_facturas. */
  facturas: boolean;
  /** Sincroniza estado de cuenta (CXC) a switch_estadocuenta. */
  cxc: boolean;
  /** Sincroniza CxP (proveedores + estado de cuenta) a switch_proveedor_estadocuenta.
   *  SEPARADO de cxc: Multifashion paga proveedores en Switch (cxp:true) pero es
   *  retail sin CXC central (cxc:false); Boston no tiene ninguno de los dos. */
  cxp: boolean;
}

export const EMPRESA_SYNC_CAPABILITIES: Record<EmpresaKey, EmpresaSyncCapability> = {
  // facturas:true → switch_facturas recibe facturas+NCs+NDs de Multifashion para
  // que switch_ventas_netas_vw cubra las 8 empresas (fase 2). El sync legacy
  // multifashion_tickets + su cron + el tab actual quedan INTACTOS (MF queda
  // duplicada entre ambas tablas a propósito). cxc:false (retail, sin CXC central).
  // ⚠️ INVARIANTE (🟡-14): MF vive en switch_facturas Y multifashion_tickets a la
  // vez. NUNCA sumar ambas fuentes en un total → doble conteo. Ver el comentario
  // en src/lib/ventas/queries.ts (RETAIL_KEYS).
  // MF: retail sin CXC central (cxc:false) PERO sí paga proveedores en Switch
  // (cxp:true, verificado: 13 proveedores / $77K en /apiproveedor) → su CxP entra a
  // switch_proveedor_estadocuenta como las B2B.
  american_classic: { facturas: true, cxc: false, cxp: true },
  vistana: { facturas: true, cxc: true, cxp: true },
  fashion_wear: { facturas: true, cxc: true, cxp: true },
  fashion_shoes: { facturas: true, cxc: true, cxp: true },
  active_shoes: { facturas: true, cxc: true, cxp: true },
  active_wear: { facturas: true, cxc: true, cxp: true },
  joystep: { facturas: true, cxc: true, cxp: true },
  // Boston: solo ventas. CXC por otro lado (Brand It) y su CxP NO se quiere (cxp:false).
  confecciones_boston: { facturas: true, cxc: false, cxp: false },
};

const ALL_KEYS = Object.keys(EMPRESA_SYNC_CAPABILITIES) as EmpresaKey[];

/** Empresas cuyas facturas van a switch_facturas (incluye Multifashion/american_classic). */
export function empresasConFacturas(): EmpresaKey[] {
  return ALL_KEYS.filter((k) => EMPRESA_SYNC_CAPABILITIES[k].facturas);
}

/** Empresas cuyo estado de cuenta va a switch_estadocuenta (excluye Boston y MF). */
export function empresasConCxc(): EmpresaKey[] {
  return ALL_KEYS.filter((k) => EMPRESA_SYNC_CAPABILITIES[k].cxc);
}

/** Empresas cuyo CxP (proveedores) va a switch_proveedor_estadocuenta: las 6 B2B
 *  + Multifashion (american_classic). Excluye Boston. */
export function empresasConCxp(): EmpresaKey[] {
  return ALL_KEYS.filter((k) => EMPRESA_SYNC_CAPABILITIES[k].cxp);
}

export function isEmpresaKey(s: string): s is EmpresaKey {
  return Object.prototype.hasOwnProperty.call(EMPRESA_SYNC_CAPABILITIES, s);
}

/**
 * Resuelve el namespace de env vars para una empresa.
 * Acepta tanto la empresa_key canónica ("american_classic", "vistana") como
 * un env key directo ("multifashion") por compatibilidad con llamadas viejas.
 */
export function resolveSwitchEnvKey(empresaKey: string): string {
  if (isEmpresaKey(empresaKey)) return SWITCH_EMPRESA_ENV_MAP[empresaKey];
  return empresaKey.toUpperCase().replace(/-/g, "_");
}

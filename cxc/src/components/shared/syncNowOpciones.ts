// Opciones compartidas del botón "Actualizar ahora" (SyncNowButton) para las
// vistas que muestran TODAS las empresas (el endpoint /api/admin/sync-now
// dispara UNA empresa por vez — sesión única de Switch). Ventas las consume
// con `secuencial` (un clic = todas en secuencia); Comisiones abre menú.
//
// Las listas son espejo de las del server (empresasConFacturas /
// RECIBOS_EMPRESA_KEYS): se duplican acá como arrays planos para que el bundle
// cliente no arrastre imports server-only. El endpoint valida contra la lista
// real, así que un desfase solo produciría un 400 visible, nunca un sync mal
// dirigido.

import type { SyncNowOpcion } from "./SyncNowButton";
import { EMPRESA_KEY_TO_NAME } from "@/lib/empresa-mapping";

/** Ventas (facturas): las 8 empresas del grupo sincronizan facturas. */
const FACTURAS_KEYS = [
  "vistana",
  "fashion_wear",
  "fashion_shoes",
  "active_shoes",
  "active_wear",
  "joystep",
  "confecciones_boston",
  "american_classic",
] as const;

/** Recibos (cobros): 5 B2B + Multifashion (american_classic). */
const RECIBOS_KEYS = [
  "vistana",
  "fashion_wear",
  "fashion_shoes",
  "active_shoes",
  "active_wear",
  "american_classic",
] as const;

export const SYNC_NOW_FACTURAS_OPCIONES: SyncNowOpcion[] = FACTURAS_KEYS.map((k) => ({
  modulo: "facturas",
  empresa: k,
  label: EMPRESA_KEY_TO_NAME[k] ?? k,
}));

export const SYNC_NOW_RECIBOS_OPCIONES: SyncNowOpcion[] = RECIBOS_KEYS.map((k) => ({
  modulo: "recibos",
  empresa: k,
  label: EMPRESA_KEY_TO_NAME[k] ?? k,
}));

/** Gate de UI de los botones de CxP (/proveedores): espejo de
 *  rolesSyncNow("proveedores") — contabilidad SOLO ve el botón acá. */
export const ROLES_SYNC_PROVEEDORES = ["admin", "secretaria", "contabilidad"];

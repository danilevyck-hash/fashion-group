// Opciones compartidas del botón "Actualizar ahora" (SyncNowButton) para las
// vistas que muestran TODAS las empresas (el endpoint /api/admin/sync-now
// dispara UNA empresa por vez — sesión única de Switch). Ventas las consume
// con `secuencial` (un clic = todas en secuencia); Comisiones abre menú.
//
// Las listas se DERIVAN de EMPRESA_SYNC_CAPABILITIES, igual que las del server.
//
// Antes se copiaban acá como arrays planos "para que el bundle cliente no
// arrastre imports server-only", y el comentario se consolaba con que un desfase
// solo daría un 400 visible. No fue así: `RECIBOS_KEYS` omitía `joystep` como
// las listas del server, así que el menú de "Actualizar ahora" ni siquiera
// OFRECÍA la empresa — no hay 400 que ver cuando la opción no existe. Era la
// cuarta copia de la misma lista y la única sin ningún test encima.
//
// La premisa tampoco se sostenía: `switch-api/empresas` no tiene un solo import
// en runtime (el único es `import type`, que se borra al compilar), así que
// importarlo desde el cliente no arrastra nada del server.

import type { SyncNowOpcion } from "./SyncNowButton";
import { EMPRESA_KEY_TO_NAME } from "@/lib/empresa-mapping";
import { empresasConFacturas, empresasConRecibos } from "@/lib/switch-api/empresas";

/** Ventas (facturas): las 8 empresas del grupo sincronizan facturas. */
const FACTURAS_KEYS = empresasConFacturas();

/** Recibos (cobros): las 6 B2B + Multifashion (american_classic). */
const RECIBOS_KEYS = empresasConRecibos();

export const SYNC_NOW_FACTURAS_OPCIONES: SyncNowOpcion[] = FACTURAS_KEYS.map((k) => ({
  modulo: "facturas",
  empresa: k,
  label: EMPRESA_KEY_TO_NAME[k] ?? k,
}));

/** Secuencia 1-clic de Ventas: facturas de las 8 empresas + refresh-vistas
 *  como PASO FINAL (DB-only: rollup mensual + vw de clientes) — así el tab
 *  Clientes y los meses cerrados quedan al día y el botón es honesto. */
export const SYNC_NOW_VENTAS_SECUENCIA: SyncNowOpcion[] = [
  ...SYNC_NOW_FACTURAS_OPCIONES,
  { modulo: "refresh-vistas", label: "Vistas de ventas" },
];

export const SYNC_NOW_RECIBOS_OPCIONES: SyncNowOpcion[] = RECIBOS_KEYS.map((k) => ({
  modulo: "recibos",
  empresa: k,
  label: EMPRESA_KEY_TO_NAME[k] ?? k,
}));

/** Gate de UI de los botones de CxP (/proveedores): espejo de
 *  rolesSyncNow("proveedores") — contabilidad SOLO ve el botón acá. */
export const ROLES_SYNC_PROVEEDORES = ["admin", "secretaria", "contabilidad"];

/** Gate de UI del botón de la ficha de cliente (/clientes/[codigo]): vendedor
 *  SÍ (arma cobranza/pedido con estos datos); bodega ve la ficha pero NO el
 *  botón. */
export const ROLES_SYNC_FICHA_CLIENTE = ["admin", "secretaria", "vendedor"];

/** Estado de cuenta (CXC): las 6 empresas del GRUPO (espejo de
 *  CXC_GRUPO_EMPRESA_KEYS; lo fija `empresa-capabilities.test.ts`).
 *
 *  ⚠️ `confecciones_boston` también sincroniza estado de cuenta desde el
 *  27-jul-2026, y aun así NO va acá — a propósito, por dos razones:
 *   1. Su cartera no es la del grupo: este botón vive en el CXC consolidado.
 *   2. Cuesta ~20 min. El sync recorre cliente por cliente y Boston tiene 1.951
 *      (contra 127 de las 6 juntas), a ~604 ms cada uno: medido, 1.951 × 604 ms
 *      ≈ 20 min contra los 800 s de techo de la función. Un botón "Actualizar
 *      ahora" que se muere a la mitad es peor que no tenerlo. Boston se refresca
 *      por su cron, en tandas. */
const ESTADOCUENTA_KEYS = [
  "vistana",
  "fashion_wear",
  "fashion_shoes",
  "active_shoes",
  "active_wear",
  "joystep",
] as const;

/**
 * Secuencia de la ficha de cliente: para las empresas donde el cliente tiene
 * actividad, estadocuenta → recibos → facturas (cada módulo solo en las
 * empresas de su universo — ej. joystep no tiene recibos) y clientes-master
 * como paso final (datos fiscales/contacto). Sin empresas activas queda solo
 * clientes-master. Se consume con `secuencial` + `engancharRunning`.
 */
export function opcionesFichaCliente(empresasActivas: string[]): SyncNowOpcion[] {
  const en = (universo: readonly string[]) => empresasActivas.filter((k) => universo.includes(k));
  const con = (modulo: string, keys: string[]): SyncNowOpcion[] =>
    keys.map((k) => ({ modulo, empresa: k, label: EMPRESA_KEY_TO_NAME[k] ?? k }));
  return [
    ...con("estadocuenta", en(ESTADOCUENTA_KEYS)),
    ...con("recibos", en(RECIBOS_KEYS)),
    ...con("facturas", en(FACTURAS_KEYS)),
    { modulo: "clientes-master", label: "Datos del cliente" },
  ];
}

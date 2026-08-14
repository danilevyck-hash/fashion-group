// Qué empresas aparecen en Comisiones — UNA sola vez.
//
// Estaba escrito idéntico en `ComisionesConsolidadoView` y en
// `ComisionesPorEmpresaView`, y ahora lo necesita también el endpoint
// consolidado: tres copias de la misma lista es la forma de que un día se
// contradigan (la misma lección de `EMPRESA_SYNC_CAPABILITIES`).
//
// Se DERIVA de `B2B_EMPRESA_KEYS`, nunca se escribe a mano.

import { B2B_EMPRESA_KEYS } from "@/lib/empresa-mapping";

/**
 * Las 6 empresas con CXC comisionan — TODAS, sin excepciones.
 *
 * Hasta el 14-ago-2026 esta lista restaba `joystep`, documentando que tenía
 * CXC pero quedaba fuera de la matriz. Ya no: Daniel decidió que
 * *"joystep sí debe de tener comisiones al 0.5%"*, y la medición contra
 * producción mostró que sus insumos estaban completos desde siempre —
 * `switch_factura_utilidad` y `switch_recibos` con datos, la RPC
 * `comision_b2b_v5('joystep', …)` devolviendo cifras correctas. Lo único que
 * faltaba era dibujar la empresa: julio-2026 daba $56,33 que nadie veía.
 *
 * ⚠️ El % se aplica sobre la VENTA (`subtotal_con_descuento`), no sobre la
 * utilidad: la utilidad es el CRITERIO de entrada (`pct_utilidad > 20`) y las
 * notas de crédito restan. Decirlo al revés es el enredo que hay que evitar.
 *
 * El 0,5% NO se escribe en ningún lado: es el default que ya aplica
 * `comision_b2b_v5` (`COALESCE(t.tasa_venta, 0.0050)`) a todo vendedor sin
 * fila propia en `comision_vendedor_tasa`. Quien tenga fila propia manda —
 * así conviven Edwin al 0,5% y Reinaldo al 1%, y así se respeta que la tasa
 * es GLOBAL por vendedor (tocarla movería también a las otras empresas donde
 * ese vendedor trabaja).
 *
 * La igualdad con `B2B_EMPRESA_KEYS` la sostiene un candado en
 * `__tests__/lib/comisiones-joystep-entra.test.ts`.
 */
export const EMPRESAS_COMISIONAN = B2B_EMPRESA_KEYS;

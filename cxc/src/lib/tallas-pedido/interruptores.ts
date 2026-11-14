// Plantilla Switch › Tallas por bulto — «Excel de tallas por pedido» (13-nov-2026).

/**
 * `true` = arriba de «Tallas por bulto» va Empresa + N.° de pedido y la descarga
 * del Excel de tallas; la ruta contesta. `false` = la pantalla de antes (solo el
 * recuadro de subir el Excel) y la ruta contesta 404.
 * Prendido el 13-nov-2026: Daniel aprobó el mockup («sí»).
 */
export const TALLAS_POR_PEDIDO_2026_11 = true;

/**
 * `true` = el cron `despachos-correo` lee el buzón por Microsoft Graph y guarda
 * las tallas de los despachos nuevos. Prendido el 13-nov-2026: Daniel creó la
 * app «Fashion Group correo» en Microsoft Entra (Mail.Read de aplicación) y las
 * credenciales están en Vercel: `GRAPH_TENANT_ID`, `GRAPH_CLIENT_ID`,
 * `GRAPH_CLIENT_SECRET`. 🔴 El secreto VENCE en nov-2028: renovarlo antes.
 */
export const DESPACHOS_CORREO_AUTOMATICO = true;

/** Quién usa la pantalla: los mismos de Plantilla Switch. Admin pasa siempre. */
export const ROLES_TALLAS_PEDIDO = ["admin", "secretaria"] as const;

/** El buzón donde llegan los despachos. */
export const BUZON_DESPACHOS = "daniel@fashiongr.com";

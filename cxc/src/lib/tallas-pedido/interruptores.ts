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
 * las tallas de los despachos nuevos. APAGADO hasta que Daniel autorice la app
 * en Microsoft Entra (Mail.Read) y estén las credenciales en Vercel:
 * `GRAPH_TENANT_ID`, `GRAPH_CLIENT_ID`, `GRAPH_CLIENT_SECRET`.
 */
export const DESPACHOS_CORREO_AUTOMATICO = false;

/** Quién usa la pantalla: los mismos de Plantilla Switch. Admin pasa siempre. */
export const ROLES_TALLAS_PEDIDO = ["admin", "secretaria"] as const;

/** El buzón donde llegan los despachos. */
export const BUZON_DESPACHOS = "daniel@fashiongr.com";

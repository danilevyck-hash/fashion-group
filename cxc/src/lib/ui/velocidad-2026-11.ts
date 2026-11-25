// ─────────────────────────────────────────────────────────────────────────────
// Velocidad (15-nov-2026). Lo que salió de la auditoría de velocidad, aprobado
// por Daniel entero. Ningún número cambia: solo CUÁNTO se espera. Cada punto
// con su interruptor; `false` = como estaba antes.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Despachos › Pedidos › «Actualizar»: las 6 empresas A LA VEZ, no en fila
 * (~18 s → lo que tarde la más lenta). Seguro porque cada empresa es su propio
 * Switch con su propio usuario: la sesión única es por USUARIO de UNA
 * instancia, y `client.ts` ya deduplica los logins por empresa.
 */
export const PEDIDOS_ACTUALIZAR_EN_PARALELO = true;

/** Nueva guía / Etiquetas › «Actualizar» facturas de hoy: igual, en el servidor. */
export const FACTURAS_HOY_EN_PARALELO = true;

/**
 * Catálogo › Confirmar pedido: el pedido se guarda y se contesta al instante;
 * el envío a Switch sigue en segundo plano (`waitUntil`) con el MISMO motor
 * at-most-once. Si falla, queda anotado como error (Reintentar) y avisa.
 */
export const PEDIDO_A_SWITCH_EN_SEGUNDO_PLANO = true;

/** Catálogo público: los productos llegan puestos desde el servidor. */
export const CATALOGO_PUBLICO_DESDE_EL_SERVIDOR = true;

/** Inicio de sesión: busca primero quién tiene esa contraseña probando UNA vez por usuario. */
export const LOGIN_UNA_PASADA = true;

/** Ventas › Resumen: la proyección se guarda hasta la próxima carga de facturas. */
export const PROYECCION_EN_CACHE = true;

/**
 * Ventas › Resumen (25-nov-2026): el año anterior a los mismos días y el
 * resumen de Multifashion se guardan 5 min, o hasta la próxima carga de Switch
 * (`lib/ventas/guardado-hasta-carga.ts`). Ningún número cambia.
 */
export const VENTAS_LECTURAS_EN_CACHE = true;

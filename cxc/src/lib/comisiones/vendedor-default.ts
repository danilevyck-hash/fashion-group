// El usuario `DEFAULT` de Switch y cómo se nombra en pantalla — módulo PURO.
//
// Vive aparte de `descuentos.ts` a propósito: ese archivo importa
// `supabaseServer` (lee la tabla de descuentos) y las vistas del navegador
// necesitan estas dos constantes sin arrastrar el cliente de servidor.

/** El usuario `DEFAULT` de Switch: el #1 de cada empresa, la OFICINA. NO es una
 *  persona a la que se le paga, así que no se le resta ningún descuento — pero
 *  su plata SÍ se calcula y se muestra (ver ETIQUETA_DEFAULT y sin-pago.ts). */
export const DEFAULT_VENDEDOR = "DEFAULT";

/**
 * Cómo se dibuja la fila `DEFAULT` en pantalla y en el Excel.
 *
 * Hasta el 3-sep-2026 decía «Sin asignar», que valía cuando lo único que caía
 * ahí eran ventas de clientes sin dueño. Desde que el COBRO se paga a QUIEN
 * REGISTRÓ el recibo (comision_b2b_v6) esa fila junta los recibos que registró
 * la oficina con el usuario DEFAULT — ~2.869 USD en 2026 — y «sin asignar» ya
 * es falso: sí está asignado, a la oficina. Daniel la llama por su nombre de
 * Switch («Daniel o DEFAULT cobrar esa plata»), así que el nombre va entre
 * paréntesis para que se reconozca. La plata NO se esconde ni se reparte.
 */
export const ETIQUETA_DEFAULT = "Oficina (DEFAULT)";

/** Nombre para pantalla: DEFAULT se dice «Oficina (DEFAULT)», el resto tal cual. */
export const etiquetaVendedor = (vendedor: string): string =>
  vendedor === DEFAULT_VENDEDOR ? ETIQUETA_DEFAULT : vendedor;

// ─────────────────────────────────────────────────────────────────────────────
// Revisión 110 (14-nov-2026) — Despachos, Catálogos y Plantilla Switch.
// Solo pantalla: ningún dato que se guarda, ninguna llamada a Switch y ninguna
// regla de plata cambia. Cada punto con su interruptor; `false` = la pantalla
// de antes. Los números son los de ~/Desktop/revision-por-modulo.
// ─────────────────────────────────────────────────────────────────────────────

/** 58 · Pedidos: la línea de arriba habla de la pestaña abierta («En preparación · el más viejo, 17 d»). */
export const PEDIDOS_LINEA_DE_LA_PESTANA = true;

/** 59 · Pedidos: el chip de empresa sin el prefijo «Empresa:». */
export const PEDIDOS_EMPRESA_SIN_PREFIJO = true;

/** 60 · Pedidos (celular): la impresora (ícono de línea) en la barra del título, sin el «···». */
export const PEDIDOS_IMPRESORA_EN_EL_TITULO = true;

/** 62 · Pedidos: quien marcó, con mayúscula y en UNA línea («Preparado · Julio · 4:00 p. m.»). */
export const PEDIDOS_FIRMA_EN_UNA_LINEA = true;

/** 63 · Pedido abierto (celular): un solo regreso, en el título «‹ Pedidos». */
export const PEDIDO_REGRESO_EN_EL_TITULO = true;

/** 64 · Pedidos (celular): los botones de la fila a 44 puntos de alto. */
export const PEDIDOS_BOTONES_44 = true;

/** 65 · Pedidos: la lista se vuelve a leer sola cada 5 minutos (solo la BASE, nunca Switch). */
export const PEDIDOS_REFRESCO_AUTOMATICO = true;
export const PEDIDOS_REFRESCO_MS = 5 * 60 * 1000;

/** 66 · Guías (celular): en la fila solo el «···», con Imprimir · Compartir · Editar · Eliminar. */
export const GUIAS_FILA_SOLO_MENU = true;

/** 67 · Guías (celular): sin la pastilla «Pendiente» en la tarjeta (el encabezado ya lo dice). */
export const GUIAS_SIN_PASTILLA_PENDIENTE = true;

/** 68 · Guías: el período con el mes entero («Noviembre 2026»). */
export const GUIAS_MES_ENTERO = true;

/** 69 · Guía abierta (celular): el título dice a dónde vuelves, «‹ Guías de despacho». */
export const GUIA_REGRESO_EN_EL_TITULO = true;

/** 70 · Etiquetas: lupa en el buscador; en el celular sin «Pendiente de guía» y la factura entera. */
export const ETIQUETAS_FILA_LIMPIA = true;

/** 71 · Configuración: título en una línea sin ⓘ, la frase una sola vez y el buscador sin «…». */
export const CONFIG_DESTINOS_LIMPIA = true;

/** 72 · Guías (computadora): la guía pendiente con las mismas columnas que el resto. */
export const GUIAS_PENDIENTE_EN_SU_COLUMNA = true;

/** Nuevo · Guías: tocar «N pendiente(s) de despacho» abre la guía (o baja a las pendientes). */
export const GUIAS_PENDIENTE_ABRE_LA_GUIA = true;

/** 57 · Catálogos › Comprobantes: sin la columna «Origen» cuando todos dicen lo mismo. */
export const COMPROBANTES_ORIGEN_SOLO_SI_VARIA = true;

/** 87 · Plantilla Switch (celular): «Toca para elegir el archivo». */
export const PLANTILLA_TOCA_PARA_ELEGIR = true;

/** 88 · Plantilla Switch › Configuración (celular): el buscador dice «Buscar», sin cortarse. */
export const PLANTILLA_BUSCAR_CORTO = true;

/** «Julio» y «Ana María», no «julio»: cada palabra con mayúscula, el resto como viene. */
export function nombreConMayuscula(n: string): string {
  return n.replace(/(^|\s)(\p{Ll})/gu, (_, sep: string, l: string) => sep + l.toUpperCase());
}

/** «4:00 p. m.» no se parte en dos líneas: los espacios de adentro pasan a no separables. */
export function horaSinPartir(t: string): string {
  return t.replace(/(\d) ([ap]\.) (m\.)/g, "$1 $2 $3");
}

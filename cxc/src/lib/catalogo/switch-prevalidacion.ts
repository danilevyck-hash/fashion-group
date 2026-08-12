// ─────────────────────────────────────────────────────────────────────────────
// ¿La pre-validación de un envío a Switch DEJA PASAR o hay que PARAR y mostrar?
// Módulo PURO — sin red, sin base. Lo usan el motor (switch-envio) para armar
// los avisos y la pantalla del pedido para decidir si el toque sigue de largo.
//
// 🩸 POR QUÉ EXISTE (12-ago-2026). Enviar a Switch eran DOS toques: el botón
// verde abría un modal con la lista completa de SKU/piezas/precio y recién ahí
// se creaba el pedido. Daniel: *"porque doble? se puede hacer en un solo
// paso?"* — y cazó él mismo por qué el modal se sentía redundante: *"si esta en
// el catalogo obvio estan en switch no? porque me saldria dos precios distintos
// si esta siendo alimentado por switch"*. Tiene razón: el catálogo se alimenta
// de Switch, así que en el caso normal el preview no dice nada que él no sepa.
//
// Ahora el toque hace el camino completo y SOLO se detiene cuando hay algo que
// decidir. La pregunta "¿esto amerita detenerse?" vive acá, en un solo lugar.
//
// 🔴 LA SEVERIDAD VA POR CÓDIGO, NO POR TEXTO. Los avisos llevan un `codigo`
// del union `WarningCodigo` y `WARNING_SEVERIDAD` es un `Record` EXHAUSTIVO:
// agregar un aviso nuevo sin clasificarlo no compila. Matchear por texto habría
// sido un colador —los mensajes llevan SKU y montos adentro— y el modo de fallo
// sería el peor posible: un aviso nuevo que nadie clasificó dejaría pasar de
// largo la creación de un pedido REAL en el ERP.
// ─────────────────────────────────────────────────────────────────────────────

/** Avisos que el motor sabe producir. Uno nuevo obliga a clasificarlo abajo. */
export type WarningCodigo =
  | "precio_distinto"
  | "variantes_talla_color"
  | "tallas_no_verificadas"
  | "permiso_no_verificado";

export type Severidad = "informativo" | "bloqueante";

/**
 * Qué hace cada aviso con el toque único.
 *
 * 🔴 Los cuatro son INFORMATIVOS a propósito, y cada uno tiene su razón:
 *  · `precio_distinto` — editar el precio de una línea es una función LEGÍTIMA
 *    que Daniel usa todos los días; Switch respeta el precio enviado (verificado
 *    en vivo, 16-000000492: $30 sobre lista $35). Frenar acá sería frenarle el
 *    trabajo. Y desde este mismo cambio la diferencia se ve INLINE al editar,
 *    o sea que cuando llega el toque ya la vio.
 *  · `variantes_talla_color` / `tallas_no_verificadas` — informativos desde
 *    siempre; los catálogos no manejan tallas y se manda el código de barra
 *    principal.
 *  · `permiso_no_verificado` — fail-open explícito: si la consulta del permiso
 *    falla, se intenta el envío igual (Switch decide). Ese era el
 *    comportamiento previo y no se endurece de contrabando.
 *
 * Lo que SÍ detiene el toque son los `errores[]` (SKU que no cruza, precio 0 en
 * Switch, permiso 0001 NEGADO): esos no son avisos, son puertas cerradas.
 */
export const WARNING_SEVERIDAD: Record<WarningCodigo, Severidad> = {
  precio_distinto: "informativo",
  variantes_talla_color: "informativo",
  tallas_no_verificadas: "informativo",
  permiso_no_verificado: "informativo",
};

export interface AvisoEnvio {
  codigo: WarningCodigo;
  texto: string;
}

/** Los avisos que obligan a parar y mostrar la pantalla de detalle. */
export function avisosBloqueantes(avisos: readonly AvisoEnvio[] | null | undefined): AvisoEnvio[] {
  return (avisos ?? []).filter((a) => WARNING_SEVERIDAD[a.codigo] === "bloqueante");
}

export interface ResultadoPrevalidacion {
  errores?: readonly string[] | null;
  avisos?: readonly AvisoEnvio[] | null;
}

/**
 * ¿Hay que detenerse y enseñarle el problema al usuario?
 *
 * Un `errores[]` con algo adentro SIEMPRE detiene. Los avisos detienen solo si
 * alguno es bloqueante. Sin errores y sin avisos bloqueantes, el toque sigue
 * de largo y crea el pedido.
 */
export function hayQueDetenerse(r: ResultadoPrevalidacion): boolean {
  return (r.errores ?? []).length > 0 || avisosBloqueantes(r.avisos).length > 0;
}

/** Textos de los avisos que viajan al cliente (compatibilidad: `warnings[]`). */
export function textosDeAvisos(avisos: readonly AvisoEnvio[] | null | undefined): string[] {
  return (avisos ?? []).map((a) => a.texto);
}

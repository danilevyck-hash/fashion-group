// ─────────────────────────────────────────────────────────────────────────────
// CATÁLOGOS EN EL CELULAR — «lo mismo, ordenado» (24-sep-2026).
//
// Daniel aprobó los nueve cambios del mockup `cel-catalogos-orden.html` con un
// «todo sí», y fue explícito en lo que NO es esto:
//
//   🔴 **No es un rediseño.** Catálogos se queda como está: mismo estilo, mismos
//   colores, mismos rótulos, las mismas tarjetas de producto, y **el precio del
//   pedido se queda exactamente como hoy**.
//
// Son nueve acomodos de LUGAR, todos **solo hasta `sm`** (en la computadora no
// cambia ni un píxel), salvo los dos que arreglan un defecto que también está
// en pantalla ancha (7 y 8, ver abajo).
//
// LOS NUEVE, CON LO QUE SE MIDIÓ:
//   1. **Hub de marcas** — los cuatro botones de cada tarjeta en una rejilla de
//      2×2, los cuatro del mismo ancho. Hoy miden 133 · 140 · 127 · 105 px y la
//      fila de abajo termina 40 px antes que la de arriba.
//   2. **Link para clientes** — de caja de tres renglones (119 px) a una sola
//      línea con «Copiar» al lado (68 px).
//   3. **Catálogo del cliente** — Género · Categoría · precio desde/hasta ·
//      Ordenar recogidos en una fila «Filtros ›» que se abre. El buscador se
//      queda arriba y los tres botones chicos pasan a una línea gris. 224 px de
//      filtros → 76 px; la primera foto sube del píxel 461 al 313.
//   4. **Tarjeta del producto** — «Bulto de 12 · Disponibilidad 1 · Existencia
//      1» en UNA línea gris bajo el precio (hoy tres renglones, 41 px → 8 px).
//      🔴 No se quita ningún dato, y el precio, el código y el nombre no cambian.
//   5. **Carrito / pedido** — el aviso «Falta: elegir el cliente» pegado a la
//      caja del CLIENTE, no 301 px más abajo del total.
//   6. **Comprobantes** — cada grupo de chips en UNA fila que se desliza, con
//      el rótulo a la izquierda (180 px → 100 px). 🔴 Los dos grupos NO se
//      juntan en una sola fila: no caben (piden 404 px y hay 358). Y las
//      casillas, que hoy miden 16 px, pasan a un blanco de 44.
//   7. **Administrar** — el defecto real: **15 pares de textos encimados** por
//      pantalla, en las 220 filas de Reebok y las 81 de Joybees. Una fila por
//      producto: foto · código · nombre · precio arriba, «Disponible N · En
//      bodega N» en una línea y los dos botones abajo.
//   8. **Comprobante abierto** — se va el deslizamiento adentro del
//      deslizamiento: la tabla vivía en una caja de 591 px con 1.092 px de
//      contenido.
//   9. **Compartir** — el menú deja de taparle a la lista el rótulo de sección
//      y los primeros 54 px de las dos fotos: se abre debajo del botón y empuja
//      el contenido.
//
// 🔴 **NINGÚN PRECIO, NINGÚN NÚMERO Y NADA DE LO QUE SE GUARDA CAMBIA.** Este
// módulo no calcula plata: arma textos de presentación y devuelve clases. El
// payload del pedido y de la cotización, esconder un producto y subir una foto
// viajan byte por byte igual con el interruptor prendido y apagado — hay
// candado que lo compara (`catalogo-orden-celular.test.tsx`).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * El interruptor. `false` = Catálogos exactamente como estaba: los cuatro
 * botones sueltos en el hub, la caja del link de tres renglones, los filtros
 * abiertos, los tres renglones de la tarjeta, el aviso bajo el total, los dos
 * rótulos de chips con renglón propio y el menú de Compartir flotando.
 */
export const CATALOGO_ORDEN_CELULAR = true;

// ── 1 · Hub de marcas ────────────────────────────────────────────────────────

/**
 * Los cuatro botones de la tarjeta de marca (Ver catálogo · Copiar enlace ·
 * Comprobantes · Administrar).
 *
 * Hasta `sm` van en una rejilla de dos columnas: los cuatro del mismo ancho y
 * las dos filas terminando en el mismo borde. De `sm` para arriba se queda el
 * `flex-wrap` de siempre, que es lo que la computadora ya hacía bien.
 *
 * ⚠️ A quien no ve «Comprobantes» o «Administrar» le quedan dos o tres botones:
 * la rejilla los reparte igual, sin estirar ninguno a lo ancho de la tarjeta.
 */
export function clasesBotonesDeLaMarca(): string {
  return CATALOGO_ORDEN_CELULAR
    ? "mt-5 grid grid-cols-2 gap-2.5 sm:flex sm:flex-wrap"
    : "mt-5 flex flex-wrap gap-2.5";
}

// ── 3 · El catálogo del cliente ──────────────────────────────────────────────

/** El rótulo de la fila que recoge Género · Categoría · precio · (Tommy: bultos). */
export const ROTULO_FILTROS = "Filtros";

/**
 * Cuántos filtros están puestos, para que la fila «Filtros ›» lo diga sin que
 * haya que abrirla. Cero = la fila dice solo «Filtros ›».
 *
 * 🔑 Cuenta lo que el cliente ELIGIÓ, no los controles que existen: un «Todos»
 * no es un filtro puesto. La búsqueda no entra —su campo se queda arriba, a la
 * vista— ni el orden, que tiene su propio botón al lado.
 */
export function cuantosFiltrosPuestos(f: {
  genero?: string | null;
  categoria?: string | null;
  precioMin?: string | number | null;
  precioMax?: string | number | null;
  soloVariosBultos?: boolean | null;
}): number {
  let n = 0;
  if (f.genero && f.genero !== "todos" && f.genero !== "") n += 1;
  if (f.categoria && f.categoria !== "todos" && f.categoria !== "") n += 1;
  if (f.precioMin !== null && f.precioMin !== undefined && `${f.precioMin}` !== "") n += 1;
  if (f.precioMax !== null && f.precioMax !== undefined && `${f.precioMax}` !== "") n += 1;
  if (f.soloVariosBultos) n += 1;
  return n;
}

/** «Filtros ›» a secas, o «Filtros · 2» cuando hay filtros puestos. */
export function textoBotonFiltros(puestos: number): string {
  return puestos > 0 ? `${ROTULO_FILTROS} · ${puestos}` : ROTULO_FILTROS;
}

// ── 4 · La tarjeta del producto ──────────────────────────────────────────────

/**
 * Los tres datos de abajo del precio en UNA línea, con punto medio.
 *
 * 🔴 No se quita ninguno ni se cambia un número: es el MISMO texto de los tres
 * renglones de hoy, seguido. Lo que no viene no se inventa —si una marca no
 * manda «Existencia», la línea queda con los dos que sí—, y si no viene nada,
 * devuelve cadena vacía y no se dibuja una línea en blanco.
 */
export function lineaDelStock(partes: ReadonlyArray<string | null | undefined>): string {
  return partes.map((p) => (p ?? "").trim()).filter((p) => p !== "").join(" · ");
}

// ── 6 · Comprobantes ─────────────────────────────────────────────────────────

/**
 * El blanco de una casilla de Comprobantes.
 *
 * 🩸 Medido: hoy son **16 × 16 px**, «Seleccionar todos» incluida — **27
 * controles** de esa pantalla por debajo del mínimo de 44 de la casa. La caja
 * que se ve sigue siendo chica (no se agranda un cuadradito hasta los 44 px):
 * lo que mide 44 es el blanco que se toca, que envuelve al `input`.
 */
export const BLANCO_CASILLA = "inline-flex min-h-[44px] min-w-[44px] items-center justify-center";

// ── 7 · Administrar ──────────────────────────────────────────────────────────

/**
 * «Disponible 14 · En bodega 14» — los dos números de la fila de Administrar en
 * una línea, con los mismos valores de hoy.
 *
 * 🩸 Hoy «En bodega: 14» cae encima de «Subir otra» (34 × 37 px) y de
 * «Esconder» (9 × 37 px), y «Disponible: 14» tapa «Subir otra» 42 × 28 px.
 */
export function lineaDeExistencias(
  disponible: number | null | undefined,
  enBodega: number | null | undefined,
): string {
  const partes: string[] = [];
  if (disponible !== null && disponible !== undefined) partes.push(`Disponible ${disponible}`);
  if (enBodega !== null && enBodega !== undefined) partes.push(`En bodega ${enBodega}`);
  return partes.join(" · ");
}

/**
 * Una fila de chips que se desliza de lado en vez de partirse en dos renglones.
 * Es la misma regla que Administrar ya usaba para su desplegable de género.
 */
export const FILA_QUE_SE_DESLIZA =
  "flex gap-2 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

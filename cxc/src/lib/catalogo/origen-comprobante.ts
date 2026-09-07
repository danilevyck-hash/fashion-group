// ─────────────────────────────────────────────────────────────────────────────
// 🔴 «DEL CLIENTE» Y «DEL VENDEDOR» — LOS DOS NOMBRES DEL ORIGEN (6-sep-2026)
//
// Daniel, textual: *«no me gusta la palabra del link y míos, no suena
// profesional»*.
//
// 🔑 ANTES DE PONERLE NOMBRE SE VERIFICÓ QUÉ FILTRA CADA UNO. «Míos» NO era del
// usuario que entró: el origen se decide en `fila-comprobante.ts` con una sola
// línea —`o.del_link === true || fuente === "publicos" ? "link" : "mio"`— y ahí
// no aparece la sesión por ningún lado. O sea que «Míos» quería decir «los que
// armó alguien de la casa», y con Angela mirando la pantalla le decía «míos» a
// los pedidos de Reinaldo. Medido el 7-sep-2026 en Tommy: las 32 filas son
// «Míos» y las armaron TRES personas distintas (REINALDO ESPINOSA 28 · daniel 2
// · rey 2). El rótulo mentía.
//
// Por eso los nombres aprobados son los que describen de dónde vino el pedido,
// no de quién es:
//   · «Del cliente»  — lo armó el cliente desde el link público.
//   · «Del vendedor» — lo armó alguien de la casa, adentro del sistema.
//
// ⚠️ Lo que NO cambió: la llave del filtro (`link` / `mio`), el dato de la base
// (`del_link`), ni el Excel de la pantalla, que sigue escribiendo «Del link» /
// «Mío» en su columna Origen — ese archivo tiene su propio candado y su propia
// decisión.
//
// Módulo PURO: los textos viven en UN lugar porque los leen el chip del filtro
// Y la etiqueta de la fila. Dos copias es como nace una pantalla que se llama a
// sí misma de dos formas.
// ─────────────────────────────────────────────────────────────────────────────

/** De dónde vino el pedido. Es la llave de siempre: no se toca. */
export type OrigenComprobante = "mio" | "link";

/** La llave del filtro por origen. `todos` es la salida de emergencia. */
export type FiltroOrigen = "todos" | OrigenComprobante;

/** El rótulo chico del grupo de chips. */
export const ROTULO_GRUPO_ORIGEN = "Quién lo armó";

/** 🔴 Los nombres aprobados. `link` = lo armó el cliente; `mio` = la casa. */
export const ORIGEN_LABEL: Record<OrigenComprobante, string> = {
  link: "Del cliente",
  mio: "Del vendedor",
};

/** Los tres filtros por origen, en el orden en que se leen. */
export const FILTROS_ORIGEN: readonly { clave: FiltroOrigen; label: string }[] = [
  { clave: "todos", label: "Todos" },
  { clave: "link", label: ORIGEN_LABEL.link },
  { clave: "mio", label: ORIGEN_LABEL.mio },
];

/** ¿Esta fila pasa el filtro de origen? `todos` deja pasar todo. */
export function pasaFiltroOrigen(origen: OrigenComprobante, filtro: FiltroOrigen): boolean {
  return filtro === "todos" || origen === filtro;
}

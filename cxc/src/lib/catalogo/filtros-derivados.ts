/**
 * Las píldoras de GÉNERO y CATEGORÍA se derivan de los productos que hay.
 *
 * Daniel, con captura del catálogo Calvin (12-ago-2026), textual: *"en los
 * catalogos, si alguna no tiene una categoria como genero o categoria, no tiene
 * que estar, como calvin veo que hay filtro de boots, pero no veo ninguna con
 * boots. cuando se agregue boots ahi que salga el filtro automatico"*.
 *
 * Hasta ahora las listas de `MARCA_THEME.filtros` se pintaban enteras, hubiera
 * o no productos detrás: un filtro que siempre devuelve cero no es un filtro,
 * es una promesa incumplida — y encima ocupa lugar en la fila que este módulo
 * ya peleó dos veces por hacer entrar sin arrastre.
 *
 * 🔑 LA LISTA CONFIGURADA SIGUE MANDANDO EL ORDEN Y EL VOCABULARIO; lo único
 * que deciden los datos es la PRESENCIA. Nada de ordenar alfabético ni por
 * cantidad: el orden de `MARCA_THEME` es una decisión de marca (en Tommy
 * "Sneakers" va antes que "Boots" porque es lo que más se vende, no por la S).
 * Por eso esto FILTRA una lista existente y nunca la construye desde el dato.
 *
 * Consecuencia buscada: cuando entre el primer par de Boots —por el cron o por
 * "Actualizar ahora"— la píldora aparece sola, sin tocar código ni desplegar.
 *
 * 🔴 FAIL-OPEN, y no es decorativo: mientras el catálogo no cargó, `productos`
 * está vacío y "no hay ninguno de esta categoría" es indistinguible de "todavía
 * no sé". Con la lista vacía se devuelve lo CONFIGURADO, tal cual hoy. Una
 * pantalla sin filtros por un cálculo que no pudo hacerse es peor que una
 * píldora de más.
 */

export interface OpcionFiltro {
  value: string;
  label: string;
}

interface Args {
  /** La lista de `MARCA_THEME.filtros` — manda el orden y las etiquetas. */
  opciones: OpcionFiltro[];
  /** Lo que hay elegido hoy (de la URL o del estado). */
  valorElegido: string;
  /** ¿Ya se sabe qué productos hay? Con `false` se devuelve lo configurado. */
  hayProductos: boolean;
  /** ¿Algún producto cae bajo esta opción? La decide el llamador, que es quien
   *  conoce el pipeline de SU marca (plano vs agrupado por modelo). */
  tieneAlguno: (value: string) => boolean;
}

export function opcionesConDatos({
  opciones,
  valorElegido,
  hayProductos,
  tieneAlguno,
}: Args): OpcionFiltro[] {
  if (!hayProductos) return opciones;
  return opciones.filter(
    (o) =>
      // "Todos" nunca se va: es el reset del grupo.
      o.value === "" ||
      // 🩸 Lo ELEGIDO tampoco, aunque hoy no tenga productos. Un link viejo
      // (`?category=boots`) o un producto que se agotó dejarían el filtro
      // ACTIVO y su píldora invisible: la grilla saldría vacía y no habría con
      // qué apagarlo salvo "Limpiar filtros", que ni siquiera se ve si no se
      // entiende qué está filtrando.
      o.value === valorElegido ||
      tieneAlguno(o.value),
  );
}

/**
 * ¿Vale la pena dibujar el grupo? Con una sola opción ya no hay nada que
 * elegir: quedaría una píldora "Todos" suelta que no filtra nada (y en celular,
 * un desplegable de un solo renglón).
 */
export function grupoTieneOpciones(opciones: OpcionFiltro[]): boolean {
  return opciones.length > 1;
}

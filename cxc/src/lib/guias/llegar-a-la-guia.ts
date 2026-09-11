// ─────────────────────────────────────────────────────────────────────────────
// EL AVISO DE ARRIBA LLEVA A LA GUÍA, ESTÉ DIBUJADA O NO (11-sep-2026).
// Módulo PURO: decide, no toca la pantalla.
//
// 🩸 «1 guía sin despachar — hace 5 días» se calcula sobre TODAS las guías,
// pero la lista dibuja el último mes y lo que pasa el buscador. Dos maneras de
// que el aviso no llevara a ningún lado:
//   · con algo escrito en el buscador («zzz»), tocarlo marcaba `expandedId` de
//     una fila que no existe y no pasaba NADA;
//   · con una pendiente de más de 30 días, la fila se esconde detrás de «Ver
//     guías más viejas» — contra el invariante «la pendiente sube arriba, con
//     Despachar a la vista».
//
// 🔴 EL AVISO NO MIENTE NUNCA MÁS: primero se abre el camino (se limpia el
// buscador y/o se abren las viejas) y recién ahí se expande la fila. Si la guía
// NO está en la lista cargada, se NAVEGA a su página — una guía que el aviso
// nombra tiene que poder abrirse.
// ─────────────────────────────────────────────────────────────────────────────

/** Qué hay que hacer para que la fila de esa guía se pueda tocar. */
export interface PlanParaLlegar {
  /** Borrar lo escrito en el buscador (la guía no pasa ese filtro). */
  limpiarBusqueda: boolean;
  /** Abrir «Ver guías más viejas» (la guía quedó fuera de la ventana). */
  abrirViejas: boolean;
  /** La fila no se va a dibujar: ir a `/guias/<id>`. */
  navegar: boolean;
}

export interface DondeEstaLaGuia {
  /** ¿Está en la lista que el navegador tiene cargada? */
  existe: boolean;
  /** ¿La deja pasar lo escrito en el buscador? */
  pasaElBuscador: boolean;
  /** ¿Cae dentro de la ventana del último mes? */
  esReciente: boolean;
  /** ¿Las viejas ya están abiertas? */
  viejasAbiertas: boolean;
}

/**
 * Sin la guía en la lista, se navega y no se toca ningún filtro: cambiar la
 * pantalla de alguien y encima no llevarlo a ningún lado sería lo peor de los
 * dos mundos.
 */
export function planParaLlegar(donde: DondeEstaLaGuia): PlanParaLlegar {
  if (!donde.existe) {
    return { limpiarBusqueda: false, abrirViejas: false, navegar: true };
  }
  return {
    limpiarBusqueda: !donde.pasaElBuscador,
    abrirViejas: !donde.esReciente && !donde.viejasAbiertas,
    navegar: false,
  };
}

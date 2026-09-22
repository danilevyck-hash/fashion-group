// ─────────────────────────────────────────────────────────────────────────────
// EL PIE DE UNA LISTA — CUÁNTAS SE VEN, DE CUÁNTAS HAY. UNA SOLA REGLA.
//
// Nació en Guías el 19-sep-2026: el pie decía «236 GUÍAS» en una pantalla donde
// había 47 delante, porque la lista abre con el último mes y el resto espera
// detrás de un botón. Daniel aprobó **«47 guías de 236»**. Tres días después
// pasó lo mismo con los bultos (8.433 sobre 30 guías que suman 1.629), y la
// regla de la casa quedó escrita: *«o el total sigue al filtro, o no hay
// buscador»*.
//
// 🔴 El 22-sep-2026 el MISMO defecto apareció en Comprobantes de los catálogos:
// los chips decían 13 y 15, el «Ver más» decía 5, y el Excel del día siguiente
// bajaba 20 filas. Así que la regla no se volvió a escribir: se mudó acá, y
// Guías y Comprobantes la LEEN. Dos copias de esta cuenta es exactamente cómo
// se llega a que una siga al filtro y la otra no.
//
// 🔴 Con todo a la vista vuelve a ser UN número («236 guías»): el «de N» solo
// aparece cuando de verdad hay algo escondido, para no gastar palabras cuando
// no hay nada que aclarar.
//
// Módulo PURO: dos números y dos palabras entran, un texto sale.
// ─────────────────────────────────────────────────────────────────────────────

/** Cómo se nombra lo que la lista cuenta. Una en singular, otra en plural. */
export interface PalabrasDeLaLista {
  singular: string;
  plural: string;
}

/**
 * `mostradas` = las que están delante de la persona ahora mismo.
 * `total` = todas las vivas, antes de cualquier filtro, ventana o pliegue.
 *
 * Un `mostradas` mayor que el total no se dibuja como «5 de 3»: se dice el
 * total, que es lo único que no puede ser mentira.
 */
export function textoDelPie(mostradas: number, total: number, palabras: PalabrasDeLaLista): string {
  const conPalabra = (n: number) => `${n} ${n === 1 ? palabras.singular : palabras.plural}`;
  if (mostradas >= total) return conPalabra(total);
  return `${conPalabra(mostradas)} de ${total}`;
}

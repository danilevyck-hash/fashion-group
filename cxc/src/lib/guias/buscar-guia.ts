// ─────────────────────────────────────────────────────────────────────────────
// EL BUSCADOR DE GUÍAS — UNA SOLA DEFINICIÓN DE "ESTA GUÍA COINCIDE".
//
// 🩸 DOS DEFECTOS, Y LOS DOS VENÍAN DE QUE LA REGLA ESTABA ESCRITA TRES VECES.
//
// 1. **La pantalla decía un nombre y el buscador matcheaba otro.** Desde #638 la
//    columna CLIENTE del acordeón muestra el nombre del cliente ATADO (el del
//    directorio), pero el filtro solo miraba `guia_items.cliente`, el texto que
//    tecleó bodega. Medido contra producción el 26-ago-2026:
//
//        "Sporting Shoes N4"   (el tipeo GUARDADO)   → 15 guías
//        "Sporting Shoes N 4"  (lo que SE VE)        → 13 guías, y NINGUNA de
//                                                      las 21 líneas escritas
//                                                      "N4" estaba entre ellas
//        "D-142"               (el código del chip)  →  0 guías
//
//    O sea: quien leía la pantalla y escribía lo que veía NO encontraba la
//    guía. El arreglo no es "normalizar los textos guardados" —eso reescribiría
//    el historial de lo que se anotó a mano, que el papel imprime— sino que el
//    buscador mire LOS TRES: el texto escrito, el nombre atado y el código.
//
// 2. **Las tres copias no decían lo mismo.** La lista matcheaba número, GT-###,
//    transportista, N° del transportista por línea, facturas y cliente; el
//    Excel y el "seleccionar todas" solo transportista, facturas y cliente. O
//    sea que exportar "lo filtrado" exportaba OTRA cosa que la que estaba en
//    pantalla, y "seleccionar todas" marcaba guías que el usuario no veía.
//    Acá hay UNA función y las tres la llaman.
//
// 🔑 POR QUÉ SE COMPARA NORMALIZADO, y qué arregla solo. `normalizarBusqueda`
// —el mismo de Clientes y Cheques— baja a minúsculas, saca acentos y saca TODO
// lo que no sea letra o número. Con eso:
//
//        "Sporting Shoes N 4" → "sportingshoesn4"
//        "Sporting Shoes N4"  → "sportingshoesn4"   ← el MISMO texto
//        "D-142" · "d142" · "d 142" → "d142"
//        "GT-045" → "gt045"
//
// …así que los 31 renglones que difieren solo por un espacio o un signo dejan
// de ser dos cosas distintas para el buscador, sin tocar un solo dato.
//
// ⚠️ **SUBSTRING SIEMPRE, TAMBIÉN CON 1 Y 2 LETRAS.** Acá NO se usa
// `coincideBusqueda`, que exige prefijo por debajo de 3 caracteres: esa regla
// está medida sobre el directorio de clientes, y en guías rompería algo que hoy
// funciona — teclear "45" encuentra la guía 145 porque matchea el NÚMERO por
// substring. Se usa el normalizador, no la política.
//
// ⚠️ **EL TEXTO ESCRITO NO SE VA.** Se le SUMAN dos campos; el tipeo guardado
// sigue encontrando la guía igual que siempre. Un buscador que dejara de
// encontrar por lo que alguien escribió a mano sería peor que el defecto.
// ─────────────────────────────────────────────────────────────────────────────

import { normalizarBusqueda } from "@/lib/buscar-normalizado";
import { numerosTranspDeLaGuia } from "@/lib/guias/modo-despacho";

/** Lo mínimo de un renglón que el buscador necesita mirar. */
export interface RenglonBuscable {
  facturas?: string | null;
  /** El texto que tecleó bodega. Es la prueba de lo que se anotó ese día. */
  cliente?: string | null;
  /** `D-XXX` del cliente atado, si la línea está amarrada a Switch. */
  cliente_codigo?: string | null;
  numero_guia_transp?: string | null;
}

/** Lo mínimo de una guía que el buscador necesita mirar. */
export interface GuiaBuscable {
  numero: number;
  transportista?: string | null;
  numero_guia_transp?: string | null;
  guia_items?: RenglonBuscable[] | null;
}

/**
 * TODOS los textos contra los que se compara una búsqueda, ya normalizados.
 *
 * Es la lista ÚNICA: si mañana la fila muestra un dato nuevo, se agrega acá y
 * las tres pantallas lo encuentran a la vez. Exportada para que el candado
 * pueda leerla sin montar la lista entera.
 */
export function camposBuscablesDeGuia(
  g: GuiaBuscable,
  nombresPorCodigo?: ReadonlyMap<string, string>,
): string[] {
  const campos: (string | null | undefined)[] = [
    // El número interno, en las dos formas en que la gente lo escribe.
    String(g.numero),
    `gt-${String(g.numero).padStart(3, "0")}`,
    g.transportista,
    // 🔴 Los N° del transportista de LAS LÍNEAS, no solo el de la cabecera: el
    // que se anota tarde escribe UNA columna de UNA línea y no toca la
    // cabecera, así que esa guía no se podría encontrar nunca más.
    ...numerosTranspDeLaGuia(g),
  ];

  for (const item of g.guia_items ?? []) {
    campos.push(item.facturas);
    // 1 · lo que se escribió a mano (lo que imprime el papel).
    campos.push(item.cliente);
    const cod = (item.cliente_codigo ?? "").trim();
    if (cod) {
      // 2 · el código del chip verde.
      campos.push(cod);
      // 3 · el nombre del cliente ATADO — el que se VE en pantalla desde #638.
      //     Si el directorio no cargó, este campo simplemente no existe y la
      //     búsqueda degrada a lo de antes. Nunca inventa un nombre.
      const nombre = nombresPorCodigo?.get(cod.toUpperCase());
      if (nombre) campos.push(nombre);
    }
  }

  return campos.map(normalizarBusqueda).filter(Boolean);
}

/**
 * ¿Esta guía entra en la búsqueda?
 *
 * Consulta vacía → `true` (no filtra nada), igual que antes.
 */
export function coincideGuiaConBusqueda(
  g: GuiaBuscable,
  consulta: string | null | undefined,
  nombresPorCodigo?: ReadonlyMap<string, string>,
): boolean {
  const q = normalizarBusqueda(consulta);
  if (!q) return true;
  return camposBuscablesDeGuia(g, nombresPorCodigo).some((c) => c.includes(q));
}

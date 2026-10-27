// La marca de Tommy y Calvin se reconoce por su NOMBRE, no por un solo número.
//
// 🩸 Medido el 27-oct-2026: «Importar artículos» de Switch crea una marca NUEVA
// con el mismo nombre en cada carga. Fashion Shoes tiene siete «TH FOOTWEAR»
// (3, 26, 27, 28, 29, 30, 31) y Vistana dos «CK FOOTWEAR» (8 y 69). El filtro
// por id dejaba afuera 22 artículos de Tommy (en 26 y 31) y 32 de Calvin (en 69).
//
// `/apiarticulos/lista` trae solo `marcaId`; el nombre sale de la ficha
// (`/apiarticulos/info`), de a UN artículo. Mismo patrón que el diccionario de
// Multifashion (`sync-articulo-marca.ts`): un artículo representante por cada
// marcaId de la lista y UNA ficha por marcaId, en la misma corrida y la misma
// sesión. Sin tabla nueva: se resuelve en cada corrida.
//
// 🔴 Igualdad EXACTA tras `trim()` —sin mayúsculas/minúsculas, sin `includes`—:
// «TH KIDS», «TH OTHER» y «TH DISPLAY & PROMO» siguen afuera.
// 🔴 Falla ABIERTA a lo de antes: el id de siempre (3 / 8) entra sin preguntar,
// y un marcaId cuya ficha falla o viene sin nombre queda afuera como hoy. El
// catálogo nunca encoge porque una consulta falló.

import type { SwitchArticulo, SwitchClient } from "./client";
import { enParalelo } from "./en-paralelo";

/** Interruptor. `false` = el filtro por un solo id, como hasta el 27-oct-2026. */
export const CATALOGO_MARCA_POR_NOMBRE = true;

/** Fichas en vuelo a la vez. Son pocas (≈10 Fashion Shoes, ≈42 Vistana). */
const CONCURRENCIA = 4;

/** Los marcaId de la corrida que se llaman exactamente `nombre`. Siempre
 *  incluye `idDeSiempre`. Nunca lanza. */
export async function marcaIdsPorNombre(
  arts: readonly SwitchArticulo[],
  client: Pick<SwitchClient, "getArticuloInfo">,
  nombre: string,
  idDeSiempre: number,
): Promise<Set<number>> {
  const ids = new Set<number>([idDeSiempre]);
  const representante = new Map<number, string>(); // marcaId → codigoBarra
  for (const a of arts) {
    if (a.marcaId == null || a.marcaId === idDeSiempre || representante.has(a.marcaId)) continue;
    if (a.codigoBarra) representante.set(a.marcaId, a.codigoBarra);
  }
  const buscado = nombre.trim();
  await enParalelo([...representante], CONCURRENCIA, async ([marcaId, cb]) => {
    try {
      const info = await client.getArticuloInfo(cb);
      if ((info?.articulo?.marca ?? "").trim() === buscado) ids.add(marcaId);
    } catch {
      // Ficha caída: ese marcaId queda afuera, como hoy.
    }
  });
  return ids;
}

/** El filtro de la corrida: por nombre con el interruptor prendido, por el id
 *  de siempre con él apagado. */
export async function filtroDeMarca(
  arts: readonly SwitchArticulo[],
  client: Pick<SwitchClient, "getArticuloInfo">,
  nombre: string,
  idDeSiempre: number,
  porNombre: boolean = CATALOGO_MARCA_POR_NOMBRE,
): Promise<(a: SwitchArticulo) => boolean> {
  if (!porNombre) return (a) => a.marcaId === idDeSiempre;
  const ids = await marcaIdsPorNombre(arts, client, nombre, idDeSiempre);
  return (a) => a.marcaId != null && ids.has(a.marcaId);
}

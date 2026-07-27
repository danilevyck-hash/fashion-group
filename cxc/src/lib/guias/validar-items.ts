// Validación de `empresa` en los ítems de una guía, del lado del SERVIDOR.
//
// Por qué existe: desde jul-2026 el formulario cierra el campo empresa contra
// las 8 del grupo. Una UI cerrada con una API que acepta cualquier cosa da una
// falsa sensación de garantía — el próximo cliente de esta API (un import, un
// script, una pestaña vieja que quedó abierta con el bundle anterior) puede
// volver a ensuciar `guia_items.empresa`, que es lo que rompe los reportes por
// empresa y el aviso de despacho.
//
// La tensión es con las guías HISTÓRICAS: tienen texto sucio ("VISTANA",
// "VISTANA / FASHION WEAR") y se editan con el mismo formulario. Por eso las dos
// puertas se tratan distinto, y a propósito:
//
//   • POST (guía NUEVA)  → estricto. Una guía que nace hoy no tiene excusa
//                          histórica: solo las 8.
//   • PUT (EDITAR)       → estricto MÁS los valores que esa misma guía ya tenía
//                          guardados. Así una guía vieja se abre, se toca
//                          cualquier otra cosa y se guarda sin pelear; y si
//                          alguien la limpia, el valor sucio no puede volver.
//
// Lo que NO se valida, y por qué: `cliente_codigo`. La UI nunca lo inventa (sale
// de /api/clientes) y un código equivocado degrada solo (la línea se ve "sin
// vincular", no se pierde plata ni se rompe un reporte). Verificarlo costaría un
// SELECT extra en cada guardada para atajar algo que hoy no puede pasar.

import { ALL_EMPRESA_KEYS, mapEmpresaName } from "@/lib/empresa-mapping";

/** Las 8 empresas del grupo, tal como se escriben en `guia_items.empresa`. */
export const EMPRESAS_GUIA: string[] = ALL_EMPRESA_KEYS.map(mapEmpresaName);

interface ItemEmpresa {
  empresa?: unknown;
}

/**
 * @param items      ítems que llegan en el body
 * @param permitidas empresas extra aceptadas además de las 8 (en PUT: las que
 *                   la guía ya tenía guardadas). Vacío en POST.
 * @returns mensaje de error para el usuario, o null si está todo bien.
 */
export function validarEmpresasItems(
  items: ItemEmpresa[],
  permitidas: Iterable<string> = [],
): string | null {
  const ok = new Set<string>(EMPRESAS_GUIA);
  for (const p of permitidas) {
    const v = (p ?? "").toString().trim();
    if (v) ok.add(v);
  }

  for (const item of items) {
    const empresa = ((item?.empresa ?? "") as string).toString().trim();
    // Vacío no se valida acá: el formulario ya lo exige y la columna acepta "".
    // Este guard es sobre valores INVENTADOS, no sobre campos sin llenar.
    if (!empresa) continue;
    if (!ok.has(empresa)) {
      return `La empresa "${empresa}" no es una de las del grupo. Elige una de la lista.`;
    }
  }
  return null;
}

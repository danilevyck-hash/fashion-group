// Alias de vendedor — la parte PURA (sin base).
//
// 🩸 Daniel, 3-sep-2026, textual: «¿por qué hay 4 Reinaldo?» y «llámalo
// Reynaldo y no Reinaldo». Switch manda el nombre de la misma persona distinto
// según la empresa y con errores de tipeo (REINALDO · REYNALDO · REINDALDO ·
// «REINDALDO » con espacio), y AGUAS / REY STOUTE AGUAS son una sola persona.
//
// Quién colapsa de verdad es la base: la tabla `comision_vendedor_alias`
// (grafía → persona) y la función `comision_vendedor_canonico()`, que llaman
// la RPC (`comision_b2b_v8`), el detalle, y los triggers de las tablas de
// tasas y exclusiones. Este módulo solo tiene lo que la pantalla necesita sin
// tocar la base:
//
//   • `aplicarAlias(nombre, alias)` — el mismo cálculo que la función SQL, para
//     que las rutas que agrupan del lado de Node (el origen de las tasas, los
//     vendedores elegibles por empresa) lleguen al MISMO nombre que la RPC.
//   • `nombreVendedorEnPantalla(nombre)` — «REYNALDO ESPINOSA» se muestra
//     «Reynaldo Espinosa» (Daniel: capitalizado, no en mayúsculas). DEFAULT
//     sigue siendo «Oficina (DEFAULT)».

import { etiquetaVendedor, DEFAULT_VENDEDOR } from "@/lib/comisiones/vendedor-default";

/** Una fila de `comision_vendedor_alias`, ya normalizada. */
export interface AliasVendedor {
  nombre_switch: string;
  vendedor_canonico: string;
}

/** Cómo se guarda la llave del alias: mayúsculas, sin bordes. */
export const claveAlias = (nombre: string): string => nombre.trim().toUpperCase();

/**
 * Espejo de `comision_vendedor_canonico(text)`: con alias devuelve la persona;
 * sin alias devuelve el nombre SOLO recortado (así «Rodrigo» sigue siendo
 * «Rodrigo», igual que en la RPC). Vacío → "".
 */
export function aplicarAlias(nombre: string | null | undefined, alias: readonly AliasVendedor[]): string {
  const recortado = (nombre ?? "").trim();
  if (!recortado) return "";
  const k = claveAlias(recortado);
  const hit = alias.find((a) => a.nombre_switch === k);
  return hit ? hit.vendedor_canonico : recortado;
}

/**
 * «REYNALDO ESPINOSA» → «Reynaldo Espinosa». Cada palabra con su primera letra
 * en mayúscula y el resto en minúscula; el guion y el apóstrofo también
 * cortan palabra («O'Neil», «Jean-Paul»). DEFAULT pasa por `etiquetaVendedor`.
 */
export function nombreVendedorEnPantalla(nombre: string): string {
  const v = (nombre ?? "").trim();
  if (!v) return "";
  if (v === DEFAULT_VENDEDOR) return etiquetaVendedor(v);
  return v
    .toLocaleLowerCase("es")
    .replace(/(^|[\s\-'])(\p{L})/gu, (_m, sep: string, letra: string) => sep + letra.toLocaleUpperCase("es"));
}

// ─────────────────────────────────────────────────────────────────────────────
// «AMERICAN CLASSICS» DEJA DE ESTAR REPETIDO.  (módulo PURO)
//
// Daniel, 5-sep-2026: *«Multifashion y american classic es el mismo»* y
// *«escoge al cliente multifashion, que amarre ese, pero que se escriba
// American Classics en la guía»*.
//
// 🩸 QUÉ PASABA, medido contra producción el 5-sep-2026:
//   · `D-201 American Classics` **no existe en `switch_clientes` en ninguna de
//     las 6 empresas del grupo** (el único «American Classic Store» que Switch
//     conoce es el 111380 de Confecciones Boston, otro mundo) y **no tiene ni
//     una factura**. Vive SOLO en `clientes_master` y en **2 renglones** de
//     guías de agosto, los dos con `facturas = '0000'`.
//   · `D-108 Multi Fashion Holding` sí está en las 6 y lleva **49 renglones**.
// O sea: dos códigos para el mismo cliente, y el bueno es el que factura.
//
// 🔴 LA REGLA, y las tres mitades importan:
//   1. **D-201 deja de OFRECERSE al armar una guía.** Es el mismo mecanismo que
//      los ausentes de Switch (`sinAusentesDeSwitch`): no se borra nada, deja
//      de aparecer en los selectores. Su ficha, su fila en `clientes_master` y
//      las guías viejas que lo nombran siguen intactas.
//   2. **Se elige D-108, y el NOMBRE que se escribe en el renglón es el alias
//      que la bodega usa** — que es justo lo que ya dice la guía GT-244, escrito
//      a mano. Ese alias YA EXISTÍA desde el 9-ago-2026 y vive en UN solo lugar,
//      `src/lib/clientes/nombre-display.ts` (`ALIAS_DISPLAY_CLIENTE`), que
//      además lo hace BUSCABLE. Acá no se repite: hay candado
//      (`clientes-nombre-display.test.ts`) que prohíbe escribirlo a mano en otro
//      archivo, y con razón — dos alias es cómo la pantalla se contradice.
//   3. **Las 2 guías viejas de D-201 no se tocan.** Es lo que el transportista
//      firmó.
//
// ⚠️ ESTO ES DE GUÍAS Y DE NADIE MÁS. D-201 sigue siendo un cliente válido del
// directorio para el resto del sistema; lo que se decidió acá es a quién se le
// despacha mercancía. Por eso la lista se pasa como dato al selector y no se
// filtra dentro de `clientes_master`.
// ─────────────────────────────────────────────────────────────────────────────

/** Multi Fashion Holding — el código que factura en las 6 empresas. */
export const CODIGO_MULTIFASHION = "D-108";

/** El duplicado que se retira de los selectores de guías. */
export const CODIGO_AMERICAN_CLASSICS_RETIRADO = "D-201";

/**
 * Los códigos que este módulo deja de ofrecer. Lista escrita a mano, nunca una
 * regla que adivine: agregar uno es una decisión de Daniel, no un patrón.
 */
export const CODIGOS_RETIRADOS_DE_GUIAS: readonly string[] = [
  CODIGO_AMERICAN_CLASSICS_RETIRADO,
];

/** ¿Este código dejó de ofrecerse al armar una guía? Exacto y sin bordes. */
export function estaRetiradoDeGuias(codigo: string | null | undefined): boolean {
  const c = String(codigo ?? "").trim().toUpperCase();
  return CODIGOS_RETIRADOS_DE_GUIAS.some((r) => r.toUpperCase() === c);
}

/** Quita los retirados de cualquier lista de clientes. Devuelve un array NUEVO. */
export function sinLosRetiradosDeGuias<T extends { codigo?: string | null }>(
  filas: readonly T[],
): T[] {
  return filas.filter((f) => !estaRetiradoDeGuias(f.codigo));
}

/**
 * 🔑 EL NOMBRE NO SE DECIDE ACÁ. Al elegir D-108, el selector ya escribe el
 * alias que la bodega usa: `ClientePicker` pasa por `nombreParaMostrar`
 * (`src/lib/clientes/nombre-display.ts`) tanto en la lista como al elegir, y
 * ese alias existe desde el 9-ago-2026 — Daniel, entonces: *«quiero que se
 * llame american classics store en guía porque si no el personal no va a
 * saber»*. Verificado el 5-sep-2026 contra ese módulo y su candado.
 *
 * Lo NUEVO del 5-sep-2026 es solo la mitad de arriba: **D-201 deja de
 * ofrecerse**. Escribir el alias otra vez acá lo pondría en dos lados.
 */

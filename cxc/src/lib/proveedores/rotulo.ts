// ─────────────────────────────────────────────────────────────────────────────
// 🔴 EL RÓTULO DEL CARTEL GRANDE DICE DE QUÉ ES EL NÚMERO QUE TIENE DEBAJO.
//
// 🩸 11-sep-2026. La lista de Proveedores muestra arriba un solo número grande
// con su rótulo. Con el chip de empresa el rótulo cambiaba («Por pagar ·
// Vistana»), pero con el BUSCADOR no: escribir «boston» dejaba en pantalla
//
//     Por pagar · grupo      $4,165.96
//
// cuando el grupo debe $4.696.830,50. El número ya estaba filtrado —el
// servidor devuelve `grupo_saldo` sumando solo lo que quedó— y el rótulo
// seguía nombrando al grupo entero. Un rótulo que miente sobre un monto es
// peor que no tener rótulo.
//
// LA REGLA, en un solo lugar y en orden de finura:
//   1. hay búsqueda escrita  → se nombra lo BUSCADO (es el filtro más fino, y
//      se aplica encima del chip de empresa);
//   2. hay empresa elegida   → se nombra la EMPRESA;
//   3. no hay nada           → «grupo».
//
// ⚠️ Lo buscado se muestra tal como se tecleó, solo recortado de bordes: no se
// capitaliza ni se normaliza. Es lo que la persona escribió y tiene que
// reconocerlo.
// ─────────────────────────────────────────────────────────────────────────────

/** Rótulo del cartel «Por pagar» según lo que hay filtrado en pantalla. */
export function rotuloPorPagar(
  empresaLabel: string | null | undefined,
  busqueda: string | null | undefined,
): string {
  const q = (busqueda ?? "").trim();
  if (q) return `Por pagar · ${q}`;
  const emp = (empresaLabel ?? "").trim();
  if (emp) return `Por pagar · ${emp}`;
  return "Por pagar · grupo";
}

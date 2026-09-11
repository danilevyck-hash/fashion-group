// ─────────────────────────────────────────────────────────────────────────────
// RECLAMOS — A QUÉ EMPRESAS SE LES DIBUJA TARJETA (10-sep-2026).
//
// Daniel, textual: *«joystep quítalo»* — Joystep tiene 0 reclamos en toda la
// historia y su tarjeta ocupaba lugar en $0,00. Y sobre Active Wear, también
// con 0: *«puede que sí se reclame»* — se queda, diciendo «Todavía sin
// reclamos» en vez de un cero grande.
//
// 🔴 LA LISTA SE DERIVA de `EMPRESAS` (el mapa de proveedores) y NO se escribe a
// mano: si mañana nace una séptima empresa que reclama, entra sola. Lo único
// escrito a mano es la resta, con su cita.
// ─────────────────────────────────────────────────────────────────────────────

import { EMPRESAS, EMPRESAS_MAP } from "./empresas";

/** Las que Daniel sacó de la portada, con su motivo. */
export const EMPRESAS_SIN_TARJETA: readonly string[] = [
  "Joystep", // «joystep quítalo» — 0 reclamos en toda la historia
];

/** Las empresas con tarjeta en la portada, en el orden del mapa. */
export const EMPRESAS_CON_RECLAMOS: readonly string[] = EMPRESAS.filter(
  (e) => !EMPRESAS_SIN_TARJETA.includes(e),
);

/** Lo que dice la tarjeta de una empresa que nunca reclamó (nunca «$0.00»). */
export const TODAVIA_SIN_RECLAMOS = "Todavía sin reclamos";

/**
 * Cómo se llama cada empresa en el PDF de su proveedor, para que el lector
 * pueda proponer la empresa FACTURADA. Igualdad por «contiene», en minúsculas
 * y sin tildes: «VISTANA INTERNACIONAL PANAMA, S.A.» y «FASHION SHOES HOLDING»
 * cruzan. Nada por parecido: un nombre que no contenga la palabra no cruza.
 *
 * Medido en los 8 PDF distintos del bucket (10-sep-2026): «FASHION WEAR»,
 * «FASHION SHOES HOLDING», «VISTANA INTERNACIONAL PANAMA, S.A.» y
 * «Active Shoes SA» — los cuatro cruzan con esta lista.
 */
const ALIAS_FACTURADA: Record<string, readonly string[]> = {
  "Vistana International": ["vistana"],
  "Fashion Wear": ["fashion wear"],
  "Fashion Shoes": ["fashion shoes"],
  "Active Shoes": ["active shoes"],
  "Active Wear": ["active wear"],
  Joystep: ["joystep"],
};

function llano(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

/** La empresa del mapa a la que le facturaron, según el nombre que trae el PDF; null si no cruza. */
export function empresaDesdeFacturada(nombre: string | null | undefined): string | null {
  const n = llano(nombre ?? "");
  if (!n) return null;
  for (const empresa of Object.keys(EMPRESAS_MAP)) {
    const alias = ALIAS_FACTURADA[empresa] ?? [llano(empresa)];
    if (alias.some((a) => n.includes(a))) return empresa;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// UN CLIENTE SIN CÓDIGO DE SWITCH NO TIENE FICHA (revisión 110, n.º 104).
//
// Ventas arma la lista desde las facturas: si un cliente no trae código
// (FERIA INT DE DAVID, KAREN DUTY FREE y MAZAR CITY SHOES, 14-nov-2026), su
// `id` llega como «—» y el enlace llevaba a /clientes/— , que es «Esta pantalla
// no existe». La ficha se abre POR CÓDIGO, nunca por nombre: sin código, el
// nombre no es enlace y se dice «Sin código en Switch».
// ─────────────────────────────────────────────────────────────────────────────

/** El rótulo al lado del nombre cuando falta el código. */
export const TEXTO_SIN_CODIGO = "Sin código en Switch";

/** ¿Este código abre una ficha? «—», vacío o nulo: no. */
export function tieneCodigoDeSwitch(codigo: string | null | undefined): codigo is string {
  const c = (codigo ?? "").trim();
  return c !== "" && c !== "—" && c !== "-";
}

// ─────────────────────────────────────────────────────────────────────────────
// Las pestañas del Depurador, en UN solo módulo PURO (4-sep-2026).
//
// De 7 pestañas a 3 (aprobado por Daniel): los tres caminos de generación
// (CK/TH, Reebok y Facturas Tienda) viven dentro de «Plantilla» y DEJAN de
// nombrarse en pantalla — el dispatcher reconoce el formato del archivo.
//
//   Plantilla ............ Nuevo (dropzone única) · Historial
//   Tallas y catálogo .... Tallas por bulto · Fotos a mi Excel
//   Configuración ........ Fórmulas · Descripciones (solo admin) · Reglas
//
// Los ?tab= viejos REDIRIGEN a su pestaña nueva: un enlace guardado
// (?tab=historial, ?tab=misfotos…) no se rompe.
// ─────────────────────────────────────────────────────────────────────────────

export type Tab = "plantilla" | "tallas" | "config";
export type Vista =
  | "nuevo" | "historial"            // Plantilla
  | "curvas" | "misfotos"            // Tallas y catálogo
  | "formulas" | "descripciones" | "reglas"; // Configuración

export const PESTANAS: { id: Tab; label: string }[] = [
  { id: "plantilla", label: "Plantilla" },
  { id: "tallas", label: "Tallas y catálogo" },
  { id: "config", label: "Configuración" },
];

/** Vistas de cada pestaña, en orden. La primera es la default. */
export const VISTAS_POR_TAB: Record<Tab, { id: Vista; label: string; soloAdmin?: boolean }[]> = {
  plantilla: [
    { id: "nuevo", label: "Nuevo" },
    { id: "historial", label: "Historial" },
  ],
  tallas: [
    { id: "curvas", label: "Tallas por bulto" },
    { id: "misfotos", label: "Fotos a mi Excel" },
  ],
  config: [
    { id: "formulas", label: "Fórmulas" },
    { id: "descripciones", label: "Descripciones", soloAdmin: true },
    { id: "reglas", label: "Reglas" },
  ],
};

/** ?tab= viejo → pestaña y vista nuevas (enlaces guardados no se rompen). */
export const TAB_VIEJO_A_NUEVO: Record<string, { tab: Tab; vista: Vista }> = {
  depurador: { tab: "plantilla", vista: "nuevo" },
  facturas: { tab: "plantilla", vista: "nuevo" },
  historial: { tab: "plantilla", vista: "historial" },
  curvas: { tab: "tallas", vista: "curvas" },
  misfotos: { tab: "tallas", vista: "misfotos" },
  formulas: { tab: "config", vista: "formulas" },
  reglas: { tab: "config", vista: "reglas" },
};

/**
 * Resuelve lo que venga en la URL a una (pestaña, vista) válida.
 *  · ?tab= nuevo válido → tal cual.
 *  · ?tab= viejo → su equivalente nuevo (redirección).
 *  · desconocido → la default, nunca en blanco.
 *  · una vista que no es de esa pestaña (o de admin sin serlo) cae a la
 *    primera vista de la pestaña.
 */
export function resolverTab(
  tabRaw: string,
  vistaRaw: string,
  esAdmin: boolean
): { tab: Tab; vista: Vista; redirigido: boolean } {
  const viejo = TAB_VIEJO_A_NUEVO[tabRaw];
  const tab: Tab = PESTANAS.some((p) => p.id === tabRaw)
    ? (tabRaw as Tab)
    : viejo?.tab ?? "plantilla";
  const vistas = VISTAS_POR_TAB[tab].filter((v) => !v.soloAdmin || esAdmin);
  const pedida = viejo?.vista ?? vistaRaw;
  const vista = vistas.some((v) => v.id === pedida) ? (pedida as Vista) : vistas[0].id;
  return { tab, vista, redirigido: viejo !== undefined };
}

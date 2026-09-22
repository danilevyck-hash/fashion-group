// ─────────────────────────────────────────────────────────────────────────────
// Las pestañas del Depurador, en UN solo módulo PURO (4-sep-2026).
//
// De 7 pestañas a 3 (aprobado por Daniel): los tres caminos de generación
// (CK/TH, Reebok y Facturas Tienda) viven dentro de «Plantilla» y DEJAN de
// nombrarse en pantalla — el dispatcher reconoce el formato del archivo.
//
//   Plantilla ............ Nuevo (dropzone única) · Historial
//   Tallas por bulto ..... (vista única)
//   Configuración ........ Fórmulas · Descripciones (solo admin) · Reglas
//
// 🩸 «FOTOS A MI EXCEL» SE RETIRÓ DE LA PANTALLA EL 22-sep-2026. Daniel:
// *«si si borra ese»* — y, en la misma frase, *«y no talla por bulto»*: «Tallas
// por bulto» SE QUEDA. Medido contra producción antes de tocar nada:
// `activity_logs` tiene **CERO** filas de `descarga_misfotos` en toda su
// historia (el contador escribe de verdad desde el 4-sep-2026 y se comprobó
// con las 3 filas de `descarga_excel` del 20-sep-2026).
//
// Al quedar «Tallas y catálogo» con una sola vista, el rótulo de la PESTAÑA
// pasó a ser «Tallas por bulto» (el «y catálogo» era justamente la vista que
// se fue) y la fila de vistas desaparece sola (`vistas.length > 1` en
// `page.tsx`). 🔴 El id de la pestaña sigue siendo `tallas`: `?tab=tallas`
// no se rompe.
//
// Los ?tab= viejos REDIRIGEN a su pestaña nueva: un enlace guardado
// (?tab=historial, ?tab=misfotos…) no se rompe. `misfotos` ahora aterriza en
// «Tallas por bulto», que es lo que existe.
// ─────────────────────────────────────────────────────────────────────────────

export type Tab = "plantilla" | "tallas" | "config";
export type Vista =
  | "nuevo" | "historial"            // Plantilla
  | "curvas"                         // Tallas por bulto (vista única)
  | "formulas" | "descripciones" | "reglas"; // Configuración

export const PESTANAS: { id: Tab; label: string }[] = [
  { id: "plantilla", label: "Plantilla" },
  { id: "tallas", label: "Tallas por bulto" },
  { id: "config", label: "Configuración" },
];

/** Vistas de cada pestaña, en orden. La primera es la default. */
export const VISTAS_POR_TAB: Record<Tab, { id: Vista; label: string; soloAdmin?: boolean }[]> = {
  plantilla: [
    { id: "nuevo", label: "Nuevo" },
    { id: "historial", label: "Historial" },
  ],
  // 🔴 UNA sola vista desde el 22-sep-2026: «Fotos a mi Excel» se retiró de la
  // pantalla. Con una sola vista, `page.tsx` no dibuja la fila de vistas.
  tallas: [
    { id: "curvas", label: "Tallas por bulto" },
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
  // 🔴 `?tab=misfotos` (retirada el 22-sep-2026) aterriza en lo que SÍ existe.
  misfotos: { tab: "tallas", vista: "curvas" },
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

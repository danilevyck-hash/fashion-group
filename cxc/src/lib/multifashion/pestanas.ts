// ─────────────────────────────────────────────────────────────────────────────
// Las pestañas de Multifashion, en UN solo módulo PURO (6-sep-2026).
//
// De SEIS a CUATRO. Daniel las revisó una por una en el escritorio y en el
// teléfono y decidió:
//
//   Resumen · Vendedoras · Productos · Clientes
//
// · **Metas se mudó ENTERA a Vendedoras** — no solo el bloque de aporte que ya
//   estaba repetido ahí: también «Nueva meta», «Cambiar», el premio, el rango de
//   fechas y la historia. Daniel, textual: *«de acuerdo, ponerlo en vendedoras,
//   pero el tab de metas no es idéntico, tiene más cosas útiles»*. No se perdió
//   nada; cambió dónde cuelga.
// · **Caja se retiró de la navegación.** Se abrió **8 días en toda su historia**
//   (`multifashion_caja_diaria`, 3-jul → 14-ago-2026), 3 de ellos con la caja en
//   cero. ⚠️ La razón es que nadie la usa, NO que abra una sesión en Switch: eso
//   era falso — tiene caché por día, el día cerrado se guarda para siempre y hoy
//   se re-pide cada 10 min. Su ruta (`/api/multifashion/caja`), su caché y su
//   componente **no se borran** (patrón `mayor_lineas`): lo que se fue es la
//   pestaña.
//
// 🩸 Y de paso se cierra un defecto viejo: `?subtab=` con basura dejaba la
// pantalla EN BLANCO (la tira de pestañas sola, sin contenido). Acá todo lo
// desconocido cae en «Resumen», nunca en la nada.
// ─────────────────────────────────────────────────────────────────────────────

export type TabMultifashion = "resumen" | "vendedoras" | "productos" | "clientes";

export const PESTANAS_MULTIFASHION: { id: TabMultifashion; label: string }[] = [
  { id: "resumen", label: "Resumen" },
  { id: "vendedoras", label: "Vendedoras" },
  { id: "productos", label: "Productos" },
  { id: "clientes", label: "Clientes" },
];

/**
 * `?subtab=` viejo → pestaña nueva. Un enlace guardado no se rompe.
 *
 * `overview` y `mes` ya se fusionaban en «Resumen» antes de este cambio; los
 * dos nuevos son `caja` (retirada) y `metas` (mudada a Vendedoras).
 */
export const SUBTAB_VIEJO_A_NUEVO: Record<string, TabMultifashion> = {
  overview: "resumen",
  mes: "resumen",
  caja: "resumen",
  metas: "vendedoras",
};

/**
 * Resuelve lo que venga en la URL a una pestaña válida.
 *  · una de las cuatro → tal cual.
 *  · una de las viejas → su equivalente (redirección).
 *  · cualquier otra cosa → «Resumen». **Nunca la pantalla en blanco.**
 */
export function resolverTabMultifashion(
  subtabRaw: string | null | undefined,
): { tab: TabMultifashion; redirigido: boolean } {
  const pedida = (subtabRaw ?? "").trim();
  if (PESTANAS_MULTIFASHION.some((p) => p.id === pedida)) {
    return { tab: pedida as TabMultifashion, redirigido: false };
  }
  const viejo = SUBTAB_VIEJO_A_NUEVO[pedida];
  if (viejo) return { tab: viejo, redirigido: true };
  return { tab: "resumen", redirigido: pedida !== "" };
}

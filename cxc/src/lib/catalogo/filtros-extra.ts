// ─────────────────────────────────────────────────────────────────────────────
// Filtros EXTRA del catálogo (25-jul-2026) — hoy solo Tommy Hilfiger.
//
// Dos filtros que Daniel aprobó SOLO para Tommy (flags `filtroBultos` y
// `filtroPrecio` en MARCA_THEME.features). Reebok y Joybees NO los muestran:
// medido contra producción, en Joybees el corte de bultos deja pasar el 92% y
// sus precios no tienen dispersión ($10 y $13 son 3 de cada 4 productos); en
// Reebok el precio es ~90% redundante con los chips de categoría que ya
// existen. Un filtro que casi no corta enreda al vendedor.
//
// Los tramos de precio son POR PIEZA (no por bulto) y respetan los huecos
// reales del inventario de Tommy — por eso no son números redondos.
// ─────────────────────────────────────────────────────────────────────────────

/** Bultos COMPLETOS mínimos del filtro "2 bultos o más". */
export const MIN_BULTOS = 2;

export type PrecioRango = "" | "hasta-22" | "23-31" | "32-48" | "49-mas";

/** Opciones del `<select>` de precio, en orden. La primera es "sin filtro". */
export const PRECIO_RANGO_OPTIONS: { value: PrecioRango; label: string }[] = [
  { value: "", label: "Precio: todos" },
  { value: "hasta-22", label: "Hasta $22" },
  { value: "23-31", label: "$23 a $31" },
  { value: "32-48", label: "$32 a $48" },
  { value: "49-mas", label: "$49 o más" },
];

/** Label del chip de bultos. Dice la REGLA, no un juicio de valor: la card del
 *  catálogo público no muestra Disponibilidad ni Existencia, así que "buen
 *  stock" dejaría al cliente sin saber por qué desaparecieron productos.
 *  "Bulto" ya es vocabulario de la card ("Bulto de 12"). */
export const BULTOS_CHIP_LABEL = "2 bultos o más";

/** ¿El valor de la URL es un rango válido? (query params = dato no confiable) */
export function esPrecioRango(v: string | null | undefined): v is PrecioRango {
  return PRECIO_RANGO_OPTIONS.some(o => o.value === (v || ""));
}

/**
 * ¿El precio POR PIEZA cae en el tramo? Los cortes son continuos (sin huecos
 * ni solapes) para que un precio con centavos siempre caiga en exactamente
 * uno: [0,23) · [23,32) · [32,49) · [49,∞).
 */
export function precioEnRango(price: number | null | undefined, rango: PrecioRango): boolean {
  if (!rango) return true;
  const p = Number(price ?? 0);
  if (!Number.isFinite(p)) return true;
  if (rango === "hasta-22") return p < 23;
  if (rango === "23-31") return p >= 23 && p < 32;
  if (rango === "32-48") return p >= 32 && p < 49;
  if (rango === "49-mas") return p >= 49;
  return true;
}

/**
 * ¿El producto tiene al menos `minBultos` bultos COMPLETOS disponibles?
 * `piezas` debe ser la DISPONIBILIDAD (lo vendible), no la existencia, y
 * `piezasPorBulto` sale de `theme.bulto(category)` — nunca hardcodeado.
 *
 * Fail-open si el tamaño de bulto viene inválido: un dato roto de config no
 * debe esconder producto (misma filosofía que `disponibleVendible`).
 */
export function cumpleBultosMinimos(
  piezas: number | null | undefined,
  piezasPorBulto: number,
  minBultos: number = MIN_BULTOS,
): boolean {
  if (!Number.isFinite(piezasPorBulto) || piezasPorBulto <= 0) return true;
  const p = Number(piezas ?? 0);
  if (!Number.isFinite(p)) return false;
  return Math.floor(p / piezasPorBulto) >= minBultos;
}

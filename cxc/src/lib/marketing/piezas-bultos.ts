// ============================================================================
// Marketing › Mobiliario — PIEZAS y BULTOS de una entrega (módulo PURO)
// ============================================================================
//
// 🔴 LA REGLA, Y NO HAY OTRA:
//
//     EL INVENTARIO SE DESCUENTA EN **PIEZAS**.
//     LOS BULTOS SON SÓLO CÓMO VIAJÓ LA MERCANCÍA.
//
//   Un bulto es una caja, un atado, un paquete. Daniel, textual:
//
//       "puedo mandar 30 norte colgador en 1 bulto. o 20 norte colgador
//        en un bulto"
//
//   O sea: **el bulto es VARIABLE y no hay conversión fija**. No existe —
//   y no debe existir nunca — una tabla de "piezas por bulto", ni un
//   `piezasDeBultos()`, ni un factor. Son dos números independientes que se
//   escriben a mano en cada renglón:
//
//       Norte colgador     150 piezas  en  5 bultos
//
//   Confundirlos DESCUADRA EL STOCK. Si alguien descontara bultos, el
//   ejemplo de arriba sacaría 5 unidades del inventario en vez de 150, y
//   nadie lo notaría hasta que el conteo físico no diera. Por eso la única
//   función que este módulo expone para tocar el stock se llama
//   `piezasParaStock()` y devuelve piezas y nada más, y el candado
//   `src/__tests__/lib/marketing-piezas-bultos.test.ts` pone el build ROJO
//   si `bultos` aparece en la aritmética de stock de `inventario.ts`.
//
// 🟡 LOS BULTOS SON OPCIONALES. `null` = "no se anotó", y se muestra en
//   blanco, NUNCA como 0. Un cero diría "viajó en cero bultos", que es
//   falso; las 21 entregas que ya existen no tienen el dato y no se les va
//   a inventar uno.
//
// Sin imports de Supabase ni de React: este módulo es puro y se testea sin
// base y sin navegador. Lo usan el servidor (inventario.ts, el comprobante)
// y la pantalla (EntregaForm, EntregasSection), así que el texto que ve
// Daniel y el número que descuenta el stock salen del MISMO lugar.
// ============================================================================

/** Piezas de un renglón: entero ≥ 0. Cualquier basura cae a 0. */
export function normalizarPiezas(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 0;
  const entero = Math.trunc(n);
  return entero > 0 ? entero : 0;
}

/**
 * Bultos de un renglón: entero ≥ 0, o `null` cuando no se anotó.
 *
 * Vacío, null, undefined y lo que no sea número → `null` (no 0). El 0
 * EXPLÍCITO sí se conserva: si alguien escribió cero, cero es el dato.
 */
export function normalizarBultos(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "string" && raw.trim() === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  const entero = Math.trunc(n);
  return entero >= 0 ? entero : null;
}

/**
 * 🔴 LO ÚNICO QUE PUEDE TOCAR EL STOCK.
 *
 * Recibe el renglón entero a propósito —incluidos los bultos— para dejar
 * escrito, en la firma misma, que teniendo los dos números delante se
 * elige piezas. No hay una segunda función que devuelva otra cosa.
 */
export function piezasParaStock(renglon: {
  piezas: number;
  bultos?: number | null;
}): number {
  return normalizarPiezas(renglon.piezas);
}

/**
 * Texto del renglón para la pantalla y para el papel.
 *
 * Con bultos:  "150 piezas en 5 bultos"
 * Sin bultos:  "150 piezas"
 *
 * Singular donde corresponde ("1 pieza en 1 bulto") porque esto lo lee
 * gente, no una máquina.
 */
export function textoPiezasBultos(
  piezas: number,
  bultos?: number | null,
): string {
  const p = normalizarPiezas(piezas);
  const base = `${p} ${p === 1 ? "pieza" : "piezas"}`;
  const b = normalizarBultos(bultos);
  if (b === null) return base;
  return `${base} en ${b} ${b === 1 ? "bulto" : "bultos"}`;
}

/** Bultos para la celda de una tabla: en blanco cuando no se anotó. */
export function textoBultos(bultos?: number | null): string {
  const b = normalizarBultos(bultos);
  return b === null ? "" : String(b);
}

/** Valor para un `<input>` de bultos: vacío cuando no se anotó. */
export function bultosParaInput(bultos?: number | null): string {
  const b = normalizarBultos(bultos);
  return b === null ? "" : String(b);
}

/**
 * Suma de bultos de una lista de renglones.
 *
 * ⚠️ Es un TOTAL DE TRANSPORTE (cuántos paquetes salieron), no una
 * cantidad de mercancía. No sirve —y no se debe usar— para stock.
 * Devuelve `null` si NINGÚN renglón anotó bultos: sumar puros "no sé" da
 * "no sé", no cero.
 */
export function totalBultos(
  renglones: ReadonlyArray<{ bultos?: number | null }>,
): number | null {
  let suma = 0;
  let hayAlguno = false;
  for (const r of renglones) {
    const b = normalizarBultos(r?.bultos);
    if (b === null) continue;
    hayAlguno = true;
    suma += b;
  }
  return hayAlguno ? suma : null;
}

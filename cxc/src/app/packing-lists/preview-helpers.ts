/**
 * Helpers puros para manipular PLPreviewItem en la pantalla de validación.
 * Todas las funciones son pure: reciben un item y retornan uno nuevo.
 * No tocan DB ni hacen I/O (excepto applyClaudeFallback que es async).
 *
 * Contrato: `item.parsed.bultos[].items[].qty` es la fuente de verdad.
 * `item.index` y `item.errors` se derivan con `recomputeDerived()`.
 */

import {
  buildIndex,
  validateParsedPL,
  PARSER_VERSION,
  type ParsedPackingList,
  type PLIndexRow,
  type PLValidationError,
  type PLBulto,
  type PLBultoItem,
} from "@/lib/parse-packing-list";

export interface PLPreviewItem {
  parsed: ParsedPackingList;
  index: PLIndexRow[];
  errors: PLValidationError[];
  existsInDB: boolean;
  // Map bultoId → source del ajuste. Se persiste al guardar como parser_metadata.
  adjustments: Record<string, "pdf_total" | "claude" | "manual_qty">;
  // bultoId temporalmente en loading de Claude
  fallbackInFlight?: string | null;
  // bultoId → mensaje de error si Claude falló en ese bulto
  fallbackErrors: Record<string, string>;
}

/** Recalcula `index` y `errors` desde los bultos/items actuales. */
export function recomputeDerived(item: PLPreviewItem): PLPreviewItem {
  // Recalcular totalPiezas de bultos y PL por si el usuario editó qty
  const recomputedBultos = item.parsed.bultos.map(b => ({
    ...b,
    // totalPiezas en bulto proviene del header PDF y NO se recalcula aquí.
    // La validación compara sum(items.qty) vs ese totalPiezas.
  }));
  const newParsed: ParsedPackingList = {
    ...item.parsed,
    bultos: recomputedBultos,
    // totalPiezas del PL también proviene del PDF, lo dejamos; validate usa
    // bulto.totalPiezas internamente.
  };
  const errors = validateParsedPL(newParsed);
  const index = buildIndex(newParsed);
  return { ...item, parsed: newParsed, index, errors };
}

/** Sustituye los items de UN bulto por un solo item sintético que cuadra con el header del PDF.
 *  Se usa cuando el operador confía en el "Total piezas: X" del PDF y quiere forzar el cuadre.
 */
export function applyPdfTotal(item: PLPreviewItem, bultoId: string): PLPreviewItem {
  const newBultos: PLBulto[] = item.parsed.bultos.map(b => {
    if (b.id !== bultoId) return b;
    const sintético: PLBultoItem = {
      estilo: "AJUSTE-MANUAL",
      producto: "AJUSTE MANUAL",
      qty: b.totalPiezas,
      hasM: false,
      has32: false,
    };
    return { ...b, items: [sintético] };
  });
  const updated: PLPreviewItem = {
    ...item,
    parsed: { ...item.parsed, bultos: newBultos },
    adjustments: { ...item.adjustments, [bultoId]: "pdf_total" },
    fallbackErrors: { ...item.fallbackErrors, [bultoId]: "" },
  };
  return recomputeDerived(updated);
}

/** Aplica el resultado de Claude al bulto: sustituye items con los estilos devueltos. */
export interface ClaudeEstilo {
  sku: string;
  color?: string;
  nombre?: string;
  qty_total: number;
}

export function applyClaudeResult(
  item: PLPreviewItem,
  bultoId: string,
  estilos: ClaudeEstilo[],
): PLPreviewItem {
  const newItems: PLBultoItem[] = estilos.map(e => ({
    estilo: e.sku,
    producto: e.nombre || "",
    qty: e.qty_total,
    hasM: false,
    has32: false,
  }));
  const newBultos: PLBulto[] = item.parsed.bultos.map(b =>
    b.id === bultoId ? { ...b, items: newItems } : b,
  );
  const updated: PLPreviewItem = {
    ...item,
    parsed: { ...item.parsed, bultos: newBultos },
    adjustments: { ...item.adjustments, [bultoId]: "claude" },
    fallbackErrors: { ...item.fallbackErrors, [bultoId]: "" },
  };
  return recomputeDerived(updated);
}

/** Edita la qty de UN item (por estilo) dentro de UN bulto. */
export function setItemQty(
  item: PLPreviewItem,
  bultoId: string,
  estilo: string,
  newQty: number,
): PLPreviewItem {
  const newBultos: PLBulto[] = item.parsed.bultos.map(b => {
    if (b.id !== bultoId) return b;
    const newBultoItems = b.items.map(it =>
      it.estilo === estilo ? { ...it, qty: newQty } : it,
    );
    return { ...b, items: newBultoItems };
  });
  const updated: PLPreviewItem = {
    ...item,
    parsed: { ...item.parsed, bultos: newBultos },
    adjustments: { ...item.adjustments, [bultoId]: "manual_qty" },
  };
  return recomputeDerived(updated);
}

/** Llama al endpoint de fallback Claude. Retorna los estilos o lanza con error human-readable. */
export async function fetchClaudeFallback(
  bultoText: string,
  totalEsperado: number,
): Promise<ClaudeEstilo[]> {
  const res = await fetch("/api/packing-lists/fallback-bulto", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ bultoText, totalEsperado }),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.ok) {
    throw new Error(json?.error || `Fallback falló (HTTP ${res.status})`);
  }
  return json.estilos as ClaudeEstilo[];
}

/** Construye el parser_metadata que se escribe al guardar el PL. */
export function buildParserMetadata(item: PLPreviewItem): Record<string, unknown> {
  const bultosTotales = item.parsed.bultos.length;
  const ajustados = Object.entries(item.adjustments);
  const manualBultos = ajustados.filter(([, src]) => src === "manual_qty" || src === "pdf_total").map(([id]) => id);
  const claudeBultos = ajustados.filter(([, src]) => src === "claude").map(([id]) => id);
  return {
    parser_version: PARSER_VERSION,
    ajustado_manualmente: manualBultos.length > 0,
    bultos_ajustados: manualBultos,
    fallback_claude_usado: claudeBultos.length > 0,
    bultos_fallback: claudeBultos,
    bultos_resueltos_nivel_1: bultosTotales - manualBultos.length - claudeBultos.length,
    bultos_resueltos_nivel_3: claudeBultos.length,
    bultos_requirieron_manual: manualBultos.length,
  };
}

/** Crea un PLPreviewItem nuevo desde un ParsedPackingList recién parseado. */
export function makePreviewItem(
  parsed: ParsedPackingList,
  existsInDB: boolean,
): PLPreviewItem {
  return recomputeDerived({
    parsed,
    index: [],
    errors: [],
    existsInDB,
    adjustments: {},
    fallbackInFlight: null,
    fallbackErrors: {},
  });
}

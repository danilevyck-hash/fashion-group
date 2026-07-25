// ─────────────────────────────────────────────────────────────────────────────
// Fotos faltantes de los catálogos (Reebok / Joybees / Tommy) — helpers PUROS.
//
// Una sola fuente para las 3 superficies que hablan de "productos sin foto":
//   1. Cola "Faltan foto" del admin (AdminCatalogoClient): colaSinFoto —
//      productos ACTIVOS/visibles sin foto, ordenados por disponibilidad desc
//      (lo más vendible primero).
//   2. Alerta Telegram del sync de catálogo (nuevos sin foto): buildNuevosSinFotoMsg
//      — UNA alerta por corrida, nada si 0 nuevos (anti-ruido).
//   3. Resumen SEMANAL de fotos faltantes (cron catalogos-fotos-resumen):
//      buildResumenSemanalMsg.
//
// Módulo puro (sin imports) — importable desde componentes cliente y desde
// crons server-side, y testeable sin supabase.
// ─────────────────────────────────────────────────────────────────────────────

/** Máximo de códigos listados en los mensajes de Telegram; el resto se agrupa
 *  como "y N más". */
export const LIMITE_CODIGOS = 15;

export interface ProductoFotoInfo {
  image_url: string | null;
  /** Visible en el catálogo (el sync lo mantiene). undefined = se asume activo. */
  active?: boolean | null;
  /** Toggle admin "Ocultar del catálogo" — gana sobre todo. */
  oculto_manual?: boolean | null;
  /** Disponible en Switch (Reebok/Tommy). */
  disponibilidad?: number | null;
  /** Fallback de disponibilidad (Joybees: el admin solo recibe `stock`). */
  stock?: number | null;
}

export function tieneFotoProducto(p: { image_url: string | null }): boolean {
  return !!(p.image_url && p.image_url.trim());
}

function disponibleDe(p: ProductoFotoInfo): number {
  return p.disponibilidad ?? p.stock ?? 0;
}

/**
 * Cola de trabajo "Faltan foto": productos ACTIVOS/visibles sin foto (image_url
 * null o vacío), ordenados por disponibilidad desc — lo más vendible primero.
 * Excluye ocultos del sync (active=false) y ocultados a mano (oculto_manual).
 */
export function colaSinFoto<T extends ProductoFotoInfo>(products: T[]): T[] {
  return products
    .filter((p) => p.active !== false && p.oculto_manual !== true && !tieneFotoProducto(p))
    .sort((a, b) => disponibleDe(b) - disponibleDe(a));
}

/** "A, B, C" o —si son más de `limit`— "A, …, O y N más". */
export function formatCodigos(codigos: string[], limit: number = LIMITE_CODIGOS): string {
  if (codigos.length <= limit) return codigos.join(", ");
  return `${codigos.slice(0, limit).join(", ")} y ${codigos.length - limit} más`;
}

/**
 * Alerta del sync de catálogo: productos NUEVOS (auto-agregados en esta
 * corrida) que quedaron sin foto. UNA alerta por corrida; null si no hubo
 * nuevos sin foto (anti-ruido: los viejos sin foto los cubre el resumen
 * semanal, no esta alerta).
 */
export function buildNuevosSinFotoMsg(marcaLabel: string, codigos: string[]): string | null {
  if (codigos.length === 0) return null;
  const n = codigos.length;
  const sustantivo = n === 1 ? "producto nuevo" : "productos nuevos";
  return `📷 ${marcaLabel}: ${n} ${sustantivo} sin foto: ${formatCodigos(codigos)}`;
}

export interface ResumenFotosMarca {
  /** "Reebok" / "Joybees" / "Tommy". */
  label: string;
  /** Códigos (SKU) visibles sin foto, ya ordenados. */
  codigos: string[];
  /** true = la marca aún no está activada (DDL pendiente — caso Tommy). */
  pendiente?: boolean;
}

/**
 * Mensaje del resumen SEMANAL de fotos faltantes (cron catalogos-fotos-resumen).
 * - Todo en 0 (y ninguna marca pendiente): mensaje corto de "todo al día".
 * - Si no: línea resumen por marca + detalle de códigos (límite 15 + resto)
 *   solo de las marcas con faltantes.
 */
export function buildResumenSemanalMsg(marcas: ResumenFotosMarca[]): string {
  const todasAlDia = marcas.every((m) => !m.pendiente && m.codigos.length === 0);
  if (todasAlDia) {
    return `📷 Los ${marcas.length} catálogos tienen todas sus fotos ✅`;
  }

  const partes = marcas.map((m, i) => {
    if (m.pendiente) return `${m.label}: pendiente de activación`;
    // Solo la primera marca lleva el sufijo "sin foto" (formato del resumen).
    return i === 0 ? `${m.label}: ${m.codigos.length} sin foto` : `${m.label}: ${m.codigos.length}`;
  });
  const detalle = marcas
    .filter((m) => !m.pendiente && m.codigos.length > 0)
    .map((m) => `${m.label} (${m.codigos.length}): ${formatCodigos(m.codigos)}`);

  let msg = `📷 Resumen semanal de fotos — ${partes.join(" · ")}`;
  if (detalle.length > 0) msg += `\n\n${detalle.join("\n")}`;
  return msg;
}

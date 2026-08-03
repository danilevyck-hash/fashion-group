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

/**
 * Orden A-Z de una lista de códigos, sin duplicados y sin vacíos.
 *
 * Deliberadamente NO usa `localeCompare` con opciones: el resultado tiene que
 * ser el mismo en el navegador de Daniel, en Node y en el test, y las tablas de
 * ICU no lo garantizan. Con códigos A-Z0-9 la comparación cruda en MAYÚSCULAS
 * ES el orden alfabético. Lo usan el Excel de la plantilla B2B
 * (dash-busqueda-excel) y el aviso de productos nuevos sin foto.
 */
export function ordenarCodigosAZ(codigos: readonly (string | null | undefined)[]): string[] {
  const limpios = codigos.map((c) => String(c ?? "").trim()).filter(Boolean);
  return Array.from(new Set(limpios)).sort((a, b) => {
    const A = a.toUpperCase();
    const B = b.toUpperCase();
    if (A < B) return -1;
    if (A > B) return 1;
    // Desempate estable por el código crudo (dos códigos que solo difieren en
    // mayúsculas/minúsculas no pueden quedar en orden aleatorio).
    return a < b ? -1 : a > b ? 1 : 0;
  });
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

// ── Aviso de productos NUEVOS sin foto (delta contra una marca de agua) ──────

export interface FilaSinFoto extends ProductoFotoInfo {
  sku: string | null;
  /** Momento en que la FILA nació en nuestra tabla (ISO). */
  created_at: string | null;
}

export interface PlanAvisoNuevos {
  /** Códigos a anunciar, ordenados A-Z. Vacío = no mandar nada. */
  codigos: string[];
  /** Marca de agua a guardar DESPUÉS de anunciar (ISO). */
  watermark: string;
  /** true = primera vez: no se anuncia nada, solo se planta la marca de agua. */
  sembrar: boolean;
}

/**
 * Decide qué productos sin foto son NUEVOS desde la última vez que se avisó.
 *
 * Es un delta de ESTADO, no un evento de una corrida: por eso da igual quién
 * metió el producto (el cron, "Actualizar ahora", la reconciliación o un
 * backfill) — todos los caminos quedan cubiertos por igual. Y por eso mismo no
 * puede repetir: lo que ya se anunció queda debajo de la marca de agua.
 *
 * `watermarkIso = null` significa "nunca se avisó de esta marca": se SIEMBRA en
 * silencio. Anunciar de golpe todo el atraso histórico sería ruido, y de eso ya
 * se encarga el resumen semanal de los lunes.
 *
 * La marca de agua nueva es `max(ahora, el created_at más nuevo que vimos)`. El
 * `max` no es adorno: una fila insertada MIENTRAS corría la consulta tiene
 * `created_at > ahora`, entra en este aviso, y sin el `max` volvería a entrar en
 * el siguiente — el mismo producto anunciado dos veces.
 */
export function planAvisoNuevos(
  filas: readonly FilaSinFoto[],
  watermarkIso: string | null,
  ahoraIso: string,
): PlanAvisoNuevos {
  const candidatas = filas.filter(
    (f) => f.active !== false && f.oculto_manual !== true && !tieneFotoProducto(f) && !!f.sku,
  );
  const maxCreated = candidatas.reduce<string>(
    (max, f) => (f.created_at && f.created_at > max ? f.created_at : max),
    "",
  );
  const watermark = maxCreated > ahoraIso ? maxCreated : ahoraIso;

  if (!watermarkIso) return { codigos: [], watermark, sembrar: true };

  const nuevas = candidatas.filter((f) => !!f.created_at && f.created_at > watermarkIso);
  return { codigos: ordenarCodigosAZ(nuevas.map((f) => f.sku)), watermark, sembrar: false };
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
export function buildResumenSemanalMsg(marcas: ResumenFotosMarca[]): string | null {
  // 🩸 SIN HALLAZGOS NO SE MANDA NADA — devuelve `null`, no un mensaje de "todo
  // bien". Daniel, 3-ago-2026: *"solo dime si me faltan fotos, no si no me
  // faltan fotos"*. Antes esta rama devolvía "📷 Los 3 catálogos tienen todas
  // sus fotos ✅" y llegaba cada lunes sin nada que hacer con él.
  //
  // Devolver `null` (en vez de dejar que el llamador decida) es lo que hace
  // IMPOSIBLE volver a mandarlo desde cualquiera de los dos consumidores: el
  // cron semanal y el colateral de switch-reconciliacion.
  const todasAlDia = marcas.every((m) => !m.pendiente && m.codigos.length === 0);
  if (todasAlDia) return null;

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

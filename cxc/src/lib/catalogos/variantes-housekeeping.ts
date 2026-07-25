// ─────────────────────────────────────────────────────────────────────────────
// Housekeeping de variantes en Storage. NÚCLEO PURO (la parte que decide QUÉ
// se borra) — el borrado real vive en el cron catalogos-fotos-resumen.
//
// CRITERIO ELEGIDO (el más seguro de los dos que estaban sobre la mesa):
// se borra la carpeta `{prefijo}/_v/{sku}/` SOLO cuando ese SKU YA NO EXISTE
// COMO FILA en la tabla de la marca.
//
// Por qué NO "lleva >30 días fuera del catálogo": estar fuera del catálogo
// (active=false) es el estado NORMAL y reversible de un producto sin
// existencia — se agota, se oculta a mano, vuelve a entrar mercancía y
// reaparece. Borrar sus fotos castigaría el caso común y obligaría a volver a
// subir el ZIP. Que la FILA desaparezca, en cambio, significa que el artículo
// se cayó del maestro de Switch: retiro definitivo.
//
// Guard anti-catástrofe: si la lista de SKUs vivos viene vacía (query que
// falló, tabla aún sin DDL, sync a medias) NO se borra absolutamente nada.
// Ante la duda, no borrar.
// ─────────────────────────────────────────────────────────────────────────────

import { normalizarSkuStorage } from "./fotos-b2b";

export interface CarpetaVariantes {
  /** Nombre de la carpeta = sku normalizado para Storage. */
  skuStorage: string;
  /** Bytes que ocupa (suma de sus objetos). */
  bytes: number;
}

export interface PlanHousekeeping {
  /** Carpetas a borrar. */
  aBorrar: CarpetaVariantes[];
  bytesLiberados: number;
  /** Motivo por el que no se borró nada (para el log/reporte). null = plan normal. */
  abortado: string | null;
}

/**
 * Decide qué carpetas de variantes se pueden borrar.
 *
 * @param carpetas  carpetas encontradas bajo `{prefijo}/_v/`
 * @param skusVivos SKUs (crudos, como están en la tabla) de TODAS las filas de
 *                  la marca — activas e inactivas, ocultas o no.
 */
export function planHousekeeping(
  carpetas: CarpetaVariantes[],
  skusVivos: string[],
): PlanHousekeeping {
  const vacio: PlanHousekeeping = { aBorrar: [], bytesLiberados: 0, abortado: null };

  if (carpetas.length === 0) return vacio;
  // Guard: sin SKUs vivos no se borra NADA (no podemos distinguir "retirado"
  // de "no pudimos leer la tabla").
  if (skusVivos.length === 0) {
    return { ...vacio, abortado: "sin SKUs vivos que comparar" };
  }

  const vivos = new Set(skusVivos.map((s) => normalizarSkuStorage(s)).filter(Boolean));
  const aBorrar = carpetas.filter((c) => c.skuStorage && !vivos.has(c.skuStorage));
  return {
    aBorrar,
    bytesLiberados: aBorrar.reduce((s, c) => s + (c.bytes || 0), 0),
    abortado: null,
  };
}

/** "12.4 MB" / "812 KB" — para el mensaje de Telegram. */
export function fmtBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

export interface ResumenHousekeeping {
  productos: number;
  bytes: number;
  fallos: number;
}

/** Línea del mensaje de Telegram. "" si no hubo nada que liberar (no ensuciar
 *  el resumen semanal cuando no pasó nada). */
export function lineaHousekeeping(r: ResumenHousekeeping): string {
  if (r.productos === 0 && r.fallos === 0) return "";
  if (r.productos === 0) return `🧹 Limpieza de fotos: ${r.fallos} carpeta(s) no se pudieron borrar`;
  const base = `🧹 Liberados ${fmtBytes(r.bytes)} de ${r.productos} producto${r.productos === 1 ? "" : "s"} retirado${r.productos === 1 ? "" : "s"}`;
  return r.fallos > 0 ? `${base} (${r.fallos} con error)` : base;
}

// ─────────────────────────────────────────────────────────────────────────────
// El ARCHIVO del historial del Depurador (4-sep-2026).
//
// Al descargar una plantilla de Switch, el MISMO Excel que bajó (bytes
// idénticos) se guarda en Storage para poder volver a bajarlo desde
// «Plantilla › Historial». Daniel, textual: «el historial solo quiero los
// excel para switch» y «que el archivo dure 90 días».
//
//   · 🔴 SOLO los Excel de Switch: el pedido para cliente de Reebok (con
//     fotos), Tallas y Fotos a mi Excel NO se guardan.
//   · 90 días y se borra solo (cron cleanup-depurador-archivos). 🔴 La FILA
//     con los totales se queda para siempre: al vencer el archivo, la fila
//     queda sin botón — nunca se borra la fila junto con el archivo.
//   · Bucket PRIVADO `depurador-plantillas` (migración 20260921120000). El
//     acceso es 100% server-side con service role — mismo patrón que
//     reclamo-facturas. La réplica off-site a R2 NO lo incluye a propósito:
//     son archivos generados, re-derivables del Excel del proveedor, y con
//     vencimiento de 90 días.
//
// Módulo compartido por la ruta del historial (subir/bajar) y el cron de
// limpieza — el nombre del bucket y la retención viven en UN solo lugar.
// ─────────────────────────────────────────────────────────────────────────────

import { supabaseServer } from "@/lib/supabase-server";

export const BUCKET_PLANTILLAS = "depurador-plantillas";

/** Cuántos días se puede volver a bajar el Excel. Daniel: «que el archivo
 *  dure 90 días». */
export const RETENCION_ARCHIVO_DIAS = 90;

/** Tope de tamaño del archivo guardado (el ZIP más grande medido pesa <5 MB;
 *  25 MB deja aire de sobra sin dejar que un error llene el bucket). */
export const ARCHIVO_MAX_BYTES = 25 * 1024 * 1024;

/** Nombre de archivo saneado para la ruta de Storage (sin separadores raros). */
export function nombreSaneado(nombre: string): string {
  const limpio = nombre.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 120);
  return limpio || "plantilla.xlsx";
}

/** Content-Type del archivo guardado según su extensión. */
export function contentTypeDe(nombre: string): string {
  if (/\.zip$/i.test(nombre)) return "application/zip";
  return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
}

export interface LimpiezaResult {
  ok: boolean; // false solo si el select/remove/update falló
  detail: string;
  borrados: number;
  cutoff: string;
}

/**
 * Borra de Storage los archivos con más de 90 días y les quita el botón a sus
 * filas (`archivo_path = null`). 🔴 LA FILA NO SE BORRA: los totales son
 * historial para siempre. IDEMPOTENTE: la segunda corrida no encuentra
 * candidatos. Mientras la DDL 20260921120000 no corra, la columna no existe y
 * la corrida es un no-op limpio (no hay archivos que limpiar).
 */
export async function runLimpiezaArchivosDepurador(now: Date = new Date()): Promise<LimpiezaResult> {
  const cutoff = new Date(now.getTime() - RETENCION_ARCHIVO_DIAS * 86400000).toISOString();

  const { data, error } = await supabaseServer
    .from("carga_history")
    .select("id, archivo_path")
    .not("archivo_path", "is", null)
    .lt("created_at", cutoff)
    .limit(500);

  if (error) {
    // DDL pendiente: la columna archivo_path no existe todavía → nada que
    // limpiar, no es una avería.
    if (/archivo_path/.test(error.message) || error.code === "42703") {
      return { ok: true, detail: "columna archivo_path pendiente de DDL — nada que limpiar", borrados: 0, cutoff };
    }
    return { ok: false, detail: error.message, borrados: 0, cutoff };
  }

  const filas = (data ?? []) as { id: string; archivo_path: string }[];
  if (filas.length === 0) return { ok: true, detail: "sin candidatos", borrados: 0, cutoff };

  // 1. Borrar los archivos de Storage.
  const { error: remErr } = await supabaseServer.storage
    .from(BUCKET_PLANTILLAS)
    .remove(filas.map((f) => f.archivo_path));
  if (remErr) return { ok: false, detail: remErr.message, borrados: 0, cutoff };

  // 2. Quitarle el botón a la fila — la fila con los totales SE QUEDA.
  const { error: updErr } = await supabaseServer
    .from("carga_history")
    .update({ archivo_path: null })
    .in("id", filas.map((f) => f.id));
  if (updErr) return { ok: false, detail: updErr.message, borrados: 0, cutoff };

  return { ok: true, detail: `${filas.length} archivo(s) vencidos borrados`, borrados: filas.length, cutoff };
}

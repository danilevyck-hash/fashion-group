// ─────────────────────────────────────────────────────────────────────────────
// LA ÚNICA PUERTA DE ESCRITURA A `asistencia_marcaciones` (14-sep-2026).
//
// Hasta hoy vivía adentro de `/api/asistencia/ingest`, que era el único que
// escribía. Con el reloj del teléfono hay DOS fuentes de marcaciones —el
// agente de la oficina y `/api/marcacion`— y las dos tienen que entrar por el
// MISMO `upsert(… ignoreDuplicates: true)` sobre `(dispositivo, evento_id)`:
// es lo que hace inofensivo el repaso nocturno del reloj Y el reenvío de una
// marca que esperó señal. Un segundo escritor con otra forma de escribir es
// exactamente cómo se duplicaron 134 marcaciones en agosto (ver
// `asistencia-una-sola-entrada.test.ts`).
//
// 🔴 NUNCA pisa una fila: `ignoreDuplicates` la ignora. No hay `update` ni
// `delete` acá ni en ningún lado — la tabla es append-only y hay barrido.
// ─────────────────────────────────────────────────────────────────────────────

import { supabaseServer } from "@/lib/supabase-server";
import type { MarcacionNormalizada } from "./ingest";

export interface ErrorDeGuardado {
  message: string;
  code?: string;
}

/**
 * Inserta las filas que no existan; las repetidas se ignoran en silencio.
 * Las filas del teléfono traen columnas de más (`sin_senal`, `foto_path`…):
 * por eso el tipo admite lo que agregue cada fuente encima de lo normalizado.
 */
export async function guardarMarcaciones<T extends MarcacionNormalizada>(
  filas: readonly T[],
): Promise<{ error: ErrorDeGuardado | null }> {
  if (filas.length === 0) return { error: null };
  const { error } = await supabaseServer
    .from("asistencia_marcaciones")
    .upsert(filas as T[], { onConflict: "dispositivo,evento_id", ignoreDuplicates: true });
  return { error: error ? { message: error.message, code: error.code } : null };
}

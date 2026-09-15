// ─────────────────────────────────────────────────────────────────────────────
// LA LECTURA QUE LE AGREGA EL TELÉFONO AL REPORTE (14-sep-2026).
//
// 🔴 ES UNA LECTURA APARTE Y TOLERANTE, Y ESO ES EL PUNTO. El `select` del
// reporte pide `id, empleado_codigo, empleado_nombre, ocurrio_en` y nada más.
// Agregarle ahí las columnas nuevas (`sin_senal`, `foto_path`…) haría que, con
// la migración `20261127120000` sin aplicar, PostgREST tirara la consulta
// entera: el reporte de asistencia de TODO el mundo se quedaría en blanco por
// una función que usan cuatro personas. Acá, si la migración no corrió, se
// devuelve vacío y el reporte es exactamente el de siempre.
//
// ⚠️ Volumen: son ≤2 marcas por día por persona y hoy son cuatro personas —un
// mes son ~170 filas—. Por eso no hace falta paginar; el `limit` está igual,
// por si mañana son cuarenta.
// ─────────────────────────────────────────────────────────────────────────────

import { supabaseServer } from "@/lib/supabase-server";
import { DISPOSITIVO_TELEFONO } from "./marcacion";
import { marcasPorDia, type MarcaTelefonoCruda, type MarcaTelefonoUI } from "./en-el-reporte";

const COLUMNAS =
  "id, empleado_codigo, ocurrio_en, tipo, sin_senal, created_at, foto_path, lat, lng";

/**
 * Las marcas del teléfono del período, agrupadas por `codigo|fecha`.
 * Nunca lanza: un tropiezo acá no puede dejar sin reporte a la contadora.
 */
export async function leerMarcasDelTelefono(
  desdeIso: string,
  hastaIso: string,
): Promise<Record<string, MarcaTelefonoUI[]>> {
  try {
    const { data, error } = await supabaseServer
      .from("asistencia_marcaciones")
      .select(COLUMNAS)
      .eq("dispositivo", DISPOSITIVO_TELEFONO)
      .gte("ocurrio_en", desdeIso)
      .lte("ocurrio_en", hastaIso)
      .order("ocurrio_en", { ascending: true })
      .limit(1000);
    if (error) {
      // Con la DDL sin correr esto es lo normal, no una avería: se calla y el
      // reporte sigue. Se deja el rastro en el log del servidor y nada más.
      console.warn("[marcacion/reporte] sin marcas del teléfono:", error.message);
      return {};
    }
    return marcasPorDia((data ?? []) as unknown as MarcaTelefonoCruda[]);
  } catch (e) {
    console.warn("[marcacion/reporte]", e instanceof Error ? e.message : e);
    return {};
  }
}

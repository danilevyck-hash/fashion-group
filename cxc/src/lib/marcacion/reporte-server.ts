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
// ⚠️ Volumen: hoy son pocas, pero se lee paginado (24-nov-2026) para que un
// rango largo no se corte en 1.000 filas sin avisar.
// ─────────────────────────────────────────────────────────────────────────────

import { supabaseServer } from "@/lib/supabase-server";
import { leerTodoPaginado } from "@/lib/supabase-paginado";
import { esTablaFaltante } from "@/lib/asistencia/config";
import { DISPOSITIVO_TELEFONO } from "./marcacion";
import { marcasPorDia, type MarcaTelefonoCruda, type MarcaTelefonoUI } from "./en-el-reporte";

const COLUMNAS =
  "id, empleado_codigo, ocurrio_en, tipo, sin_senal, created_at, hora_telefono, foto_path, lat, lng";

const ETIQUETA = "marcas del teléfono";

/**
 * Las marcas del teléfono del período, agrupadas por `codigo|fecha`.
 *
 * 🔴 24-nov-2026: paginado (antes `.limit(1000)` cortaba en silencio) y un
 * error de verdad YA NO se ve como «sin marcas»: se lanza y el reporte lo dice.
 * Solo una columna o tabla que falte (la DDL sin correr) sigue devolviendo vacío.
 */
export async function leerMarcasDelTelefono(
  desdeIso: string,
  hastaIso: string,
): Promise<Record<string, MarcaTelefonoUI[]>> {
  try {
    const filas = await leerTodoPaginado<MarcaTelefonoCruda>(ETIQUETA, (pedirCount, from, to) =>
      supabaseServer
        .from("asistencia_marcaciones")
        .select(COLUMNAS, pedirCount ? { count: "exact" } : {})
        .eq("dispositivo", DISPOSITIVO_TELEFONO)
        .gte("ocurrio_en", desdeIso)
        .lte("ocurrio_en", hastaIso)
        .order("ocurrio_en", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to),
    );
    return marcasPorDia(filas);
  } catch (e) {
    const mensaje = (e instanceof Error ? e.message : String(e)).replace(`${ETIQUETA}: `, "");
    if (esTablaFaltante({ message: mensaje }, "asistencia_marcaciones")) {
      console.warn("[marcacion/reporte] sin marcas del teléfono:", mensaje);
      return {};
    }
    throw new Error(`No se pudieron leer las marcas del teléfono: ${mensaje}`);
  }
}

// El I/O del mapeo «reloj + número → colaborador». La regla vive en
// `codigo-por-reloj.ts`. Solo LECTURA: las filas las carga Daniel con SQL.
import { supabaseServer } from "@/lib/supabase-server";
import {
  MARCAS_POR_RELOJ_Y_NUMERO,
  SIN_MAPA,
  TABLA_CODIGO_POR_RELOJ,
  armarMapaDeReloj,
  type AliasDeReloj,
  type MapaDeReloj,
} from "./codigo-por-reloj";

/**
 * El mapeo vivo. 🔴 Con el interruptor apagado NO consulta la base y devuelve
 * el mapa vacío: todo lector queda exactamente como hoy. Prendido, un error es
 * un error (sin la tabla, lanza): no se vuelve en silencio a mezclar personas.
 */
export async function leerMapaDeReloj(prendido = MARCAS_POR_RELOJ_Y_NUMERO): Promise<MapaDeReloj> {
  if (!prendido) return SIN_MAPA;
  const { data, error } = await supabaseServer
    .from(TABLA_CODIGO_POR_RELOJ)
    .select("dispositivo, codigo_reloj, empleado_codigo")
    .eq("activo", true);
  if (error) throw new Error(`No se pudo leer el mapeo de relojes: ${error.message}`);
  return armarMapaDeReloj((data ?? []) as unknown as AliasDeReloj[]);
}

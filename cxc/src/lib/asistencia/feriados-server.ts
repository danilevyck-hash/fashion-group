// 🔴 LA ÚNICA LECTURA DE FERIADOS (30-sep-2026). La usan el Reporte, la
// Planilla, la deuda automática del día libre, los avisos de marcación, el
// vigía del reloj y Multifashion: leer distinto en cada una es la forma de que
// la pantalla y el pago no cuadren.
//
// 🔴 19-nov-2026: los feriados NACIONALES salen calculados (`juntarFeriados`);
// la tabla trae lo extra (días libres, decretos) y su fila manda en su fecha.

import { supabaseServer } from "@/lib/supabase-server";
import { juntarFeriados, type FilaFeriado } from "./feriados";

export async function leerFeriados(desde: string, hasta: string): Promise<{
  feriados: Map<string, string>;
  diasLibres: Map<string, string>;
  faltaColumna: boolean;
}> {
  const { data, error } = await supabaseServer
    .from("asistencia_feriados")
    .select("fecha, nombre, tipo")
    .gte("fecha", desde)
    .lte("fecha", hasta);
  if (error) throw new Error(error.message);
  // `faltaColumna` se conserva (siempre `false` desde el 9-oct-2026) porque quien llama lo lee.
  return { ...juntarFeriados(desde, hasta, (data ?? []) as unknown as FilaFeriado[]), faltaColumna: false };
}

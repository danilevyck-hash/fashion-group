// 🔴 LA ÚNICA LECTURA DE `asistencia_feriados` PARA EL MOTOR (30-sep-2026).
// La usan el Reporte, la Planilla y la deuda automática del día libre: leer
// distinto en cada una es la forma de que la pantalla y el pago no cuadren.
//
// Sin la columna `tipo` (migración `20261222120000` sin aplicar) se vuelve a
// leer sin ella y TODO es feriado: exactamente lo de antes.

import { supabaseServer } from "@/lib/supabase-server";
import { separarFeriados, type FilaFeriado } from "./feriados";

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
  return { ...separarFeriados((data ?? []) as unknown as FilaFeriado[]), faltaColumna: false };
}

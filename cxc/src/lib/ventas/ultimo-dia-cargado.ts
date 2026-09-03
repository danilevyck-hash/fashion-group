// ─────────────────────────────────────────────────────────────────────────────
// ¿HASTA QUÉ DÍA LLEGÓ `switch_articulo_diario` en un período?
//
// Es el dato que alimenta el corte de la comparación «vs año pasado» en
// Ventas › Productos y Multifashion › Productos (`ventanaUnAnioAntes`, la
// definición única en `clientes-corte-comparativo.ts`). La tabla se carga a las
// 03:40 de Panamá y llega hasta AYER: cortar el año pasado en «hoy» le regalaba
// un día, siempre (medido el 3-sep-2026: Multifashion decía +4,2% y crecía
// +46,1%).
//
// UNA consulta chica por índice `(empresa_key, fecha)`: la fila más nueva del
// período. Las tres rutas la usan de aquí — cada consumidor con su propia copia
// es exactamente cómo se divergió antes.
// ─────────────────────────────────────────────────────────────────────────────

import { supabaseServer } from "@/lib/supabase-server";

/**
 * MAX(fecha) de `switch_articulo_diario` para la empresa dentro de [desde,
 * hasta] (fechas de calendario, la columna es DATE), o `null` si no hay filas.
 * Falla CERRADO (lanza): un corte inventado se ve igual que un corte bueno.
 */
export async function ultimoDiaArticuloDiario(
  empresaKey: string,
  desde: string,
  hasta: string,
): Promise<string | null> {
  const { data, error } = await supabaseServer
    .from("switch_articulo_diario")
    .select("fecha")
    .eq("empresa_key", empresaKey)
    .gte("fecha", desde)
    .lte("fecha", hasta)
    .order("fecha", { ascending: false })
    .limit(1);
  if (error) throw new Error(`switch_articulo_diario MAX(fecha) (${empresaKey} ${desde}→${hasta}): ${error.message}`);
  const fecha = (data as Array<{ fecha: string | null }> | null)?.[0]?.fecha ?? null;
  return typeof fecha === "string" && fecha.length >= 10 ? fecha.slice(0, 10) : null;
}

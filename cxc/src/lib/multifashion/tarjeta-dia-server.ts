// SERVIDOR de la tarjeta del día (`MULTIFASHION_TARJETA_DIA_2026_11`): la ruta
// `/api/multifashion/dia` y el cuadre `scripts/_verif-multifashion-tarjeta-dia.ts`
// leen por aquí. Solo lee. Reglas en `tarjeta-dia.ts`.

import { supabaseServer } from "@/lib/supabase-server";
import { leerTodoPaginado } from "@/lib/supabase-paginado";
import { leerRetailDia, VISTA_RETAIL } from "@/lib/multifashion/retail-dia";
import { fechaEquivalente, type DiaDeLaTarjeta } from "@/lib/multifashion/tarjeta-dia";

/** Margen del día desde `switch_articulo_diario` (NC restan, sin ND). `null` sin artículos. */
export async function margenDelDia(fecha: string): Promise<number | null> {
  const filas = await leerTodoPaginado<{ tipo: string; venta_total: number | string | null; costo_total: number | string | null }>(
    `switch_articulo_diario ACS [${fecha}]`,
    (pedirCount, a, b) =>
      supabaseServer
        .from("switch_articulo_diario")
        .select("tipo, venta_total, costo_total, articulo_id", pedirCount ? { count: "exact" } : {})
        .eq("empresa_key", "american_classic")
        .eq("fecha", fecha)
        .neq("tipo", "ND")
        .order("articulo_id", { ascending: true })
        .order("tipo", { ascending: true })
        .range(a, b),
  );
  let v = 0;
  let c = 0;
  for (const f of filas) {
    const s = f.tipo === "NC" ? -1 : 1;
    v += s * (Number(f.venta_total) || 0);
    c += s * (Number(f.costo_total) || 0);
  }
  if (!filas.length || v <= 0) return null;
  const m = (v - c) / v;
  return m >= -1 && m <= 1 ? m : null;
}

export async function leerTarjetaDelDia(fecha: string, hoy: string): Promise<DiaDeLaTarjeta> {
  const esHoy = fecha === hoy;
  const equivalente = fechaEquivalente(fecha);
  const [dia, previo, margen] = await Promise.all([
    leerRetailDia(fecha),
    leerRetailDia(equivalente),
    // Hoy no hay costo: `switch_articulo_diario` llega de madrugada.
    esHoy ? Promise.resolve(null) : margenDelDia(fecha),
  ]);
  // Un $0 el año pasado solo se afirma con historia cargada antes (nunca un cero inventado).
  let hayHistoriaPrevia = previo.documentos > 0;
  if (!hayHistoriaPrevia) {
    const { data, error } = await supabaseServer.from(VISTA_RETAIL).select("n_sistema").lt("fecha", equivalente).limit(1);
    if (error) throw new Error(error.message);
    hayHistoriaPrevia = (data ?? []).length > 0;
  }
  return {
    fecha,
    equivalente,
    esHoy,
    venta: dia.ventas,
    tickets: dia.documentos,
    ventaPrevia: previo.ventas,
    ticketsPrevios: previo.documentos,
    hayHistoriaPrevia,
    margen,
    horas: dia.horas,
  };
}

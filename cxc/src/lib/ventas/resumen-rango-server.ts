// SERVIDOR: Ventas › Resumen entre dos fechas (Daniel, 5-oct-2026). Las MISMAS
// fuentes que el Resumen del mes en curso (`ventas_dashboard_summary_v2`):
// venta = `switch_facturas` firmada; costo = `switch_articulo_diario` sin el
// código ND (NC resta) + las ND de `switch_factura_utilidad`. Sin migración:
// lecturas paginadas, como la consulta por fechas de Comisiones.

import { supabaseServer } from "@/lib/supabase-server";
import { leerTodoPaginado } from "@/lib/supabase-paginado";
import { ALL_EMPRESA_KEYS } from "@/lib/empresa-mapping";
import { signoVenta, TIPO_VENTA_NOTA_DEBITO } from "@/lib/ventas/tipos-comprobante";
import { mismosDiasAnioPasado, sumarDias } from "@/lib/comisiones/vendedores-rango";
import { armarResumenRango, type MontoDia, type ResumenRango } from "./rango-ventas";

const diaPanama = (ts: string) => new Date(Date.parse(ts) - 5 * 3_600_000).toISOString().slice(0, 10);

async function ventas(desde: string, hasta: string): Promise<MontoDia[]> {
  const filas = await leerTodoPaginado<{ empresa_key: string; tipo_comprobante: string; subtotal_descuento: number | string | null; fecha: string }>(
    "switch_facturas (resumen por rango)",
    (pedirCount, a, b) =>
      supabaseServer
        .from("switch_facturas")
        .select("empresa_key, tipo_comprobante, subtotal_descuento, fecha", pedirCount ? { count: "exact" } : {})
        .gte("fecha", `${desde}T00:00:00-05:00`)
        .lt("fecha", `${sumarDias(hasta, 1)}T00:00:00-05:00`)
        .order("id", { ascending: true })
        .range(a, b),
  );
  return filas.map(f => ({ empresa_key: f.empresa_key, dia: diaPanama(f.fecha), monto: signoVenta(f.tipo_comprobante) * Number(f.subtotal_descuento ?? 0) }));
}

async function costos(desde: string, hasta: string): Promise<MontoDia[]> {
  const [art, nd] = await Promise.all([
    leerTodoPaginado<{ empresa_key: string; tipo: string; costo_total: number | string | null; fecha: string; articulo_id: number }>(
      "switch_articulo_diario (resumen por rango)",
      (pedirCount, a, b) =>
        supabaseServer
          .from("switch_articulo_diario")
          .select("empresa_key, tipo, costo_total, fecha, articulo_id", pedirCount ? { count: "exact" } : {})
          .neq("tipo", "ND")
          .gte("fecha", desde)
          .lte("fecha", hasta)
          .order("fecha", { ascending: true })
          .order("empresa_key", { ascending: true })
          .order("articulo_id", { ascending: true })
          .order("tipo", { ascending: true })
          .range(a, b),
    ),
    leerTodoPaginado<{ empresa_key: string; costo: number | string | null; fecha: string; id: number }>(
      "switch_factura_utilidad ND (resumen por rango)",
      (pedirCount, a, b) =>
        supabaseServer
          .from("switch_factura_utilidad")
          .select("empresa_key, costo, fecha, id", pedirCount ? { count: "exact" } : {})
          .eq("tipo_comprobante", TIPO_VENTA_NOTA_DEBITO)
          .gte("fecha", desde)
          .lte("fecha", hasta)
          .order("id", { ascending: true })
          .range(a, b),
    ),
  ]);
  return [
    ...art.map(r => ({ empresa_key: r.empresa_key, dia: r.fecha, monto: (r.tipo === "NC" ? -1 : 1) * Number(r.costo_total ?? 0) })),
    ...nd.map(r => ({ empresa_key: r.empresa_key, dia: r.fecha, monto: Number(r.costo ?? 0) })),
  ];
}

export async function leerResumenRango(desde: string, hasta: string): Promise<ResumenRango> {
  const anterior = mismosDiasAnioPasado(desde, hasta);
  const [v, c, vp, cp] = await Promise.all([
    ventas(desde, hasta), costos(desde, hasta), ventas(anterior.desde, anterior.hasta), costos(anterior.desde, anterior.hasta),
  ]);
  return armarResumenRango({ desde, hasta, anterior, empresas: ALL_EMPRESA_KEYS, ventas: v, costos: c, ventasPrevio: vp, costosPrevio: cp });
}

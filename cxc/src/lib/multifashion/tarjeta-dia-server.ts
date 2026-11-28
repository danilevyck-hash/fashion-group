// SERVIDOR de la tarjeta del día (`MULTIFASHION_TARJETA_DIA_2026_11`): la ruta
// `/api/multifashion/dia` y el cuadre `scripts/_verif-multifashion-tarjeta-dia.ts`
// leen por aquí. Solo lee. Reglas en `tarjeta-dia.ts`.

import { supabaseServer } from "@/lib/supabase-server";
import { leerTodoPaginado } from "@/lib/supabase-paginado";
import { leerRetailDia, VISTA_RETAIL } from "@/lib/multifashion/retail-dia";
import { fechaEquivalente, type DiaDeLaTarjeta } from "@/lib/multifashion/tarjeta-dia";
import { estimarMargen, type MargenEstimado, type RenglonVendido } from "@/lib/multifashion/margen-estimado";
import { MULTIFASHION_MARGEN_ESTIMADO_2026_11 } from "@/lib/ui/multifashion-margen-estimado-2026-11";
import { createSwitchClient } from "@/lib/switch-api/client";

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

/** Costo ACTUAL (`costo_api`) de cada artículo de ACS, por `articulo_id`. */
export async function costosActuales(ids: readonly number[]): Promise<Map<number, number>> {
  const out = new Map<number, number>();
  const unicos = [...new Set(ids)];
  for (let i = 0; i < unicos.length; i += 200) {
    const { data, error } = await supabaseServer
      .from("switch_articulo_info")
      .select("articulo_id, costo_api")
      .eq("empresa_key", "american_classic")
      .in("articulo_id", unicos.slice(i, i + 200));
    if (error) throw new Error(error.message);
    for (const f of data ?? []) out.set(Number(f.articulo_id), Number(f.costo_api) || 0);
  }
  return out;
}

// ponytail: caché en memoria de la instancia (10 min), no compartido entre
// lambdas; si los logins a Switch molestan, pasarlo a una tabla como la caja.
const TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, { en: number; valor: MargenEstimado | null }>();

/** Lo vendido HOY por artículo, de Switch (API, sesión cerrada al terminar). */
async function vendidoEnSwitch(fecha: string): Promise<RenglonVendido[]> {
  const client = createSwitchClient("american_classic");
  const porClave = new Map<string, RenglonVendido>();
  try {
    for (let pagina = 1; pagina <= 60; pagina++) {
      const data = await client.getVentaSucursal({ fecha, sucursalId: 1, porPagina: 50, paginaActual: pagina });
      const arr = data?.ventasucursal ?? [];
      for (const a of arr) {
        porClave.set(`${a.articuloId}|${a.tipo}`, {
          articuloId: Number(a.articuloId),
          tipo: String(a.tipo),
          cantidad: Number(a.cantidadtotal) || 0,
          venta: Number(a.ventatotal) || 0,
        });
      }
      if (arr.length < 50) break;
    }
  } finally {
    await client.logout();
  }
  return [...porClave.values()];
}

/** El margen ESTIMADO de hoy. Falla ABIERTA a `null` (la tarjeta dice «mañana»). */
export async function margenEstimadoDeHoy(fecha: string): Promise<MargenEstimado | null> {
  const c = cache.get(fecha);
  if (c && Date.now() - c.en < TTL_MS) return c.valor;
  try {
    const renglones = await vendidoEnSwitch(fecha);
    const valor = estimarMargen(renglones, await costosActuales(renglones.map((r) => r.articuloId)));
    cache.set(fecha, { en: Date.now(), valor });
    return valor;
  } catch (err) {
    console.error("[multifashion/dia] margen estimado:", err instanceof Error ? err.message : err);
    return c?.valor ?? null;
  }
}

export async function leerTarjetaDelDia(fecha: string, hoy: string): Promise<DiaDeLaTarjeta> {
  const esHoy = fecha === hoy;
  const equivalente = fechaEquivalente(fecha);
  const [dia, previo, margen, estimado] = await Promise.all([
    leerRetailDia(fecha),
    leerRetailDia(equivalente),
    // Hoy no hay costo: `switch_articulo_diario` llega de madrugada.
    esHoy ? Promise.resolve(null) : margenDelDia(fecha),
    // …por eso hoy va ESTIMADO, sin guardarlo: mañana manda el real.
    esHoy && MULTIFASHION_MARGEN_ESTIMADO_2026_11 ? margenEstimadoDeHoy(fecha) : Promise.resolve(null),
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
    margen: estimado ? estimado.margen : margen,
    margenEstimado: estimado != null,
    cobertura: estimado ? estimado.cobertura : null,
    horas: dia.horas,
  };
}

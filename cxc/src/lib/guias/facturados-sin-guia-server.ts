// «Facturados» (26-nov-2026): lee de la BASE —nunca de Switch— las facturas del
// grupo de la ventana (5 días hábiles; `primerDiaDeFacturados`) que todavía no entraron a ninguna guía viva.
// Solo LEE. La regla pura vive en `facturados-sin-guia.ts`.

import { supabaseServer } from "@/lib/supabase-server";
import { leerTodoPaginado } from "@/lib/supabase-paginado";
import { hoyPanama } from "@/lib/fecha-panama";
import { TIPO_FACTURA } from "@/lib/guias/atajos-facturas";
import { entraEnFacturados, primerDiaDeFacturados, esCobroSuelto, estaEnGuia, indiceEnGuia } from "@/lib/guias/facturados-sin-guia";
import { FACTURADOS_QUITAR_2026_11, claveQuitada, separarQuitadas } from "@/lib/ui/facturados-quitar-2026-11";

export interface FacturadoLeido {
  empresa_key: string;
  secuencial: string;
  fecha: string;
  subtotal: number | null;
  cliente_codigo: string | null;
  cliente_nombre: string | null;
  /** Bultos de sus etiquetas vivas; null = sin etiquetar. */
  bultos: number | null;
}

/** Una factura quitada a mano de Facturados (`guias_facturas_quitadas`). */
export interface QuitadaLeida extends FacturadoLeido {
  quitada_id: number;
  quitada_por: string;
  quitada_en: string;
}

interface FilaQuitada {
  id: number;
  empresa_key: string;
  secuencial: string;
  fecha_factura: string;
  quitada_por: string;
  quitada_en: string;
}

interface FilaFactura {
  id: number;
  empresa_key: string;
  secuencial: string;
  fecha: string;
  subtotal: number | string | null;
  cliente_switch_id: number | null;
  cliente_nombre: string | null;
  pedido_referencia: string | null;
  pedido_leido_en: string | null;
}

// La ventana sale de UN solo lugar (`primerDiaDeFacturados`): 5 días hábiles con el corte.
const desdeIso = (hoy: string) => new Date(`${primerDiaDeFacturados(hoy)}T00:00:00-05:00`).toISOString();

async function leerRenglonesVivos(): Promise<Array<{ empresa: string | null; facturas: string | null }>> {
  const guias = await leerTodoPaginado<{ guia_items: Array<{ empresa: string | null; facturas: string | null; deleted: boolean | null }> | null }>(
    "guia_transporte (facturados)",
    (pedirCount, desde, hasta) =>
      supabaseServer
        .from("guia_transporte")
        .select("id, guia_items(empresa, facturas, deleted)", pedirCount ? { count: "exact" } : {})
        .eq("deleted", false)
        .order("id", { ascending: true })
        .range(desde, hasta),
  );
  // guia_items tiene su PROPIO `deleted`: filtrar solo la cabecera deja pasar renglones borrados.
  return guias.flatMap((g) => (g.guia_items ?? []).filter((it) => !it.deleted));
}

/** Las quitadas activas de la ventana (solo con `FACTURADOS_QUITAR_2026_11`). */
async function leerQuitadas(empresas: readonly string[]): Promise<FilaQuitada[]> {
  if (!FACTURADOS_QUITAR_2026_11) return [];
  return leerTodoPaginado<FilaQuitada>("guias_facturas_quitadas", (pedirCount, desde, hasta) =>
    supabaseServer
      .from("guias_facturas_quitadas")
      .select("id, empresa_key, secuencial, fecha_factura, quitada_por, quitada_en", pedirCount ? { count: "exact" } : {})
      .in("empresa_key", [...empresas])
      .eq("deleted", false)
      .gte("fecha_factura", primerDiaDeFacturados(hoyPanama()))
      .order("id", { ascending: true })
      .range(desde, hasta),
  );
}

/** Facturados y, aparte, las que se quitaron a mano (para «Ver quitadas»). */
export async function leerFacturadosYQuitadas(
  empresas: readonly string[],
): Promise<{ facturados: FacturadoLeido[]; quitadas: QuitadaLeida[] }> {
  const [filas, quitadas] = await Promise.all([leerFacturadosSinGuia(empresas), empresas.length ? leerQuitadas(empresas) : []]);
  const porClave = new Map(quitadas.map((q) => [claveQuitada({ ...q, fecha: q.fecha_factura }), q]));
  const partes = separarQuitadas(filas, new Set(porClave.keys()));
  return {
    facturados: partes.visibles,
    quitadas: partes.quitadas.map((f) => {
      const q = porClave.get(claveQuitada(f))!;
      return { ...f, quitada_id: q.id, quitada_por: q.quitada_por, quitada_en: q.quitada_en };
    }),
  };
}

export async function leerFacturadosSinGuia(empresas: readonly string[]): Promise<FacturadoLeido[]> {
  if (empresas.length === 0) return [];
  const [facturas, renglones] = await Promise.all([
    leerTodoPaginado<FilaFactura>("switch_facturas (facturados)", (pedirCount, desde, hasta) =>
      supabaseServer
        .from("switch_facturas")
        .select("id, empresa_key, secuencial, fecha, subtotal, cliente_switch_id, cliente_nombre, pedido_referencia, pedido_leido_en", pedirCount ? { count: "exact" } : {})
        .in("empresa_key", [...empresas])
        .eq("tipo_comprobante", TIPO_FACTURA)
        .gte("fecha", desdeIso(hoyPanama()))
        .order("id", { ascending: true })
        .range(desde, hasta),
    ),
    leerRenglonesVivos(),
  ]);
  const indice = indiceEnGuia(renglones);
  const sinGuia = facturas.filter((f) => !esCobroSuelto(f) && !estaEnGuia(indice, f.empresa_key, f.secuencial));
  if (sinGuia.length === 0) return [];

  // El CÓDIGO del cliente sale del puente por ID, nunca del nombre.
  const ids = [...new Set(sinGuia.map((f) => f.cliente_switch_id).filter((x): x is number => x != null))];
  const secuenciales = [...new Set(sinGuia.map((f) => f.secuencial))];
  const [clientes, etiquetas] = await Promise.all([
    ids.length
      ? leerTodoPaginado<{ empresa_key: string; cliente_switch_id: number; codigo: string | null; nombre: string | null }>(
          "switch_clientes (facturados)",
          (pedirCount, desde, hasta) =>
            supabaseServer
              .from("switch_clientes")
              .select("id, empresa_key, cliente_switch_id, codigo, nombre", pedirCount ? { count: "exact" } : {})
              .in("empresa_key", [...empresas])
              .in("cliente_switch_id", ids)
              .order("id", { ascending: true })
              .range(desde, hasta),
        )
      : Promise.resolve([]),
    leerTodoPaginado<{ empresa_key: string; secuencial: string; cajas: number | null }>(
      "guias_etiquetas (facturados)",
      (pedirCount, desde, hasta) =>
        supabaseServer
          .from("guias_etiquetas")
          .select("id, empresa_key, secuencial, cajas", pedirCount ? { count: "exact" } : {})
          .in("empresa_key", [...empresas])
          .in("secuencial", secuenciales)
          .or("deleted.is.null,deleted.eq.false")
          .order("id", { ascending: true })
          .range(desde, hasta),
    ),
  ]);
  const cliente = new Map(clientes.map((c) => [`${c.empresa_key}:${c.cliente_switch_id}`, c]));
  const bultos = new Map<string, number>();
  for (const e of etiquetas) {
    const k = `${e.empresa_key}:${e.secuencial}`;
    bultos.set(k, (bultos.get(k) ?? 0) + (e.cajas ?? 0));
  }

  return sinGuia
    .map((f) => {
      const c = f.cliente_switch_id != null ? cliente.get(`${f.empresa_key}:${f.cliente_switch_id}`) : undefined;
      const b = bultos.get(`${f.empresa_key}:${f.secuencial}`);
      const n = f.subtotal == null ? null : Number(f.subtotal);
      return {
        empresa_key: f.empresa_key,
        secuencial: f.secuencial,
        fecha: f.fecha,
        subtotal: Number.isFinite(n) ? n : null,
        cliente_codigo: c?.codigo ?? null,
        cliente_nombre: c?.nombre ?? f.cliente_nombre,
        bultos: b ? b : null,
      };
    })
    // Sin código no se puede saber si es el mostrador o D-108: se muestra (falla abierta).
    .filter((f) => f.cliente_codigo == null || entraEnFacturados(f.cliente_codigo));
}

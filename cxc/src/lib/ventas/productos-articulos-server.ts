// Ventas › Productos (PRODUCTOS_FILTROS_2026_10): los códigos vendidos en una
// ventana y los que tienen existencia, con departamento · género · descripción,
// existencia, «vendió en 90 días» y la foto del catálogo si la hay.
// Una llamada a `ventas_productos_articulos_v1`; sin la migración, el camino
// paginado de abajo.

import { supabaseServer } from "@/lib/supabase-server";
import { leerTodoPaginado } from "@/lib/supabase-paginado";
import { esFuncionAusente } from "@/lib/multifashion/productos-lectura";
import { departamentoSinMarca, generoDe, type ArticuloVendido } from "@/lib/productos/filtros";

const num = (x: unknown) => Number(x ?? 0) || 0;
const txt = (x: unknown) => String(x ?? "").trim();

export interface FilaArticulos {
  c: string; d: string; q: number; v: number; k: number;
  m: string | null; r: string | null; s: string | null;
  e: number | null; n90: boolean;
}

export function articuloDeFila(f: FilaArticulos, foto: string | null = null): ArticuloVendido {
  const descripcion = txt(f.d);
  return {
    codigo: txt(f.c),
    descripcion,
    unidades: num(f.q),
    venta: num(f.v),
    costo: num(f.k),
    campos: {
      departamento: departamentoSinMarca(f.m),
      genero: generoDe(descripcion, f.r, f.s),
      descripcion,
    },
    existencia: f.e == null ? null : num(f.e),
    vendio90: !!f.n90,
    foto,
  };
}

/** Catálogo con fotos de cada empresa (las que tienen uno). */
const CATALOGO: Record<string, string> = {
  fashion_shoes: "tommy_products",
  vistana: "calvin_products",
  joystep: "joybees_products",
  active_shoes: "products",
};
const claveSku = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

async function fotosDe(empresa: string): Promise<Map<string, string>> {
  const tabla = CATALOGO[empresa];
  if (!tabla) return new Map();
  const { data, error } = await supabaseServer.from(tabla).select("sku, image_url").not("image_url", "is", null).limit(1000);
  if (error) return new Map(); // la foto es una ayuda: sin ella, la lista igual
  return new Map(((data ?? []) as { sku: string; image_url: string }[]).map(r => [claveSku(r.sku), r.image_url]));
}

export async function leerArticulos(empresa: string, desde: string, hasta: string, hoy: string): Promise<ArticuloVendido[]> {
  const [filas, fotos] = await Promise.all([leerFilas(empresa, desde, hasta, hoy), fotosDe(empresa)]);
  return filas.map(f => articuloDeFila(f, fotos.get(claveSku(f.c)) ?? null));
}

async function leerFilas(empresa: string, desde: string, hasta: string, hoy: string): Promise<FilaArticulos[]> {
  const { data, error } = await supabaseServer.rpc("ventas_productos_articulos_v1", {
    p_empresa_key: empresa, p_desde: desde, p_hasta: hasta, p_hoy: hoy,
  });
  if (!error) return (data ?? []) as FilaArticulos[];
  if (!esFuncionAusente(error)) throw new Error(`ventas_productos_articulos_v1: ${error.message}`);
  return leerSinMigracion(empresa, desde, hasta, hoy);
}

const menosDias = (iso: string, n: number) =>
  new Date(Date.parse(`${iso}T00:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);

type Agrupado = { c: string | null; d: string | null; t: string; q: number; v: number; k: number };

async function agrupado(empresa: string, d: string, h: string): Promise<Agrupado[]> {
  const r = await supabaseServer.rpc("multifashion_articulo_diario_agrupado_v1", { p_empresa_key: empresa, p_desde: d, p_hasta: h });
  if (r.error) throw new Error(`multifashion_articulo_diario_agrupado_v1: ${r.error.message}`);
  return ((r.data as { f?: unknown[] } | null)?.f ?? []) as Agrupado[];
}

// ponytail: camino lento SOLO hasta aplicar la migración 20261229120000.
// Diferencias conocidas con la RPC: la descripción es la de más venta del código
// en la ventana (no la más reciente de la historia), y la clasificación sale de
// las líneas de factura del año anterior a la ventana (no de toda la historia).
async function leerSinMigracion(empresa: string, desde: string, hasta: string, hoy: string): Promise<FilaArticulos[]> {
  const desde90 = menosDias(hoy, 89);
  const desdeLineas = menosDias(desde < desde90 ? desde : desde90, 365);
  // Secuencial a propósito: lecturas grandes de a una contra compute Micro.
  const ventana = await agrupado(empresa, desde, hasta);
  const ultimos90 = await agrupado(empresa, desde90, hoy);
  const stock = await leerTodoPaginado<{ codigo: string; existencia: number | null; descripcion: string | null }>(
    `switch_articulo_info (${empresa})`,
    (pedirCount, ini, fin) =>
      supabaseServer.from("switch_articulo_info")
        .select("codigo, existencia, descripcion", pedirCount ? { count: "exact" } : {})
        .eq("empresa_key", empresa)
        .order("codigo", { ascending: true })
        .range(ini, fin),
  );
  const lineas = await leerTodoPaginado<{ codigo: string; fecha: string; marca: string | null; rubro: string | null; subrubro: string | null }>(
    `switch_factura_lineas (${empresa} ${desdeLineas}→${hasta})`,
    (pedirCount, ini, fin) =>
      supabaseServer.from("switch_factura_lineas")
        .select("codigo, fecha, marca, rubro, subrubro", pedirCount ? { count: "exact" } : {})
        .eq("empresa_key", empresa)
        .gte("fecha", desdeLineas)
        .lte("fecha", `${hasta}T23:59:59`)
        .order("id", { ascending: true })
        .range(ini, fin),
  );

  const clase = new Map<string, { fecha: string; m: string | null; r: string | null; s: string | null }>();
  for (const l of lineas) {
    const prev = clase.get(l.codigo);
    if (!prev || l.fecha > prev.fecha) clase.set(l.codigo, { fecha: l.fecha, m: l.marca, r: l.rubro, s: l.subrubro });
  }
  const vendio90 = new Set(ultimos90.map(f => f.c).filter(Boolean) as string[]);
  const existencia = new Map(stock.map(s => [s.codigo, s]));

  const porCodigo = new Map<string, { d: string; q: number; v: number; k: number; mejor: number }>();
  for (const f of ventana) {
    if (!f.c) continue;
    const sg = f.t === "NC" ? -1 : 1;
    const v = num(f.v) * sg;
    const a = porCodigo.get(f.c) ?? { d: txt(f.d), q: 0, v: 0, k: 0, mejor: -Infinity };
    a.q += num(f.q) * sg;
    a.v += v;
    a.k += num(f.k) * sg;
    if (v > a.mejor && f.d) { a.mejor = v; a.d = txt(f.d); }
    porCodigo.set(f.c, a);
  }
  const codigos = new Set<string>();
  for (const [c, a] of porCodigo) if (a.v !== 0 || a.q !== 0) codigos.add(c);
  for (const s of stock) if (num(s.existencia) > 0) codigos.add(s.codigo);

  return [...codigos].map(c => {
    const a = porCodigo.get(c);
    const st = existencia.get(c);
    const cl = clase.get(c);
    return {
      c,
      d: a?.d || txt(st?.descripcion) || "(sin descripcion)",
      q: a?.q ?? 0, v: a?.v ?? 0, k: a?.k ?? 0,
      m: cl?.m ?? null, r: cl?.r ?? null, s: cl?.s ?? null,
      e: st?.existencia ?? null,
      n90: vendio90.has(c),
    };
  });
}

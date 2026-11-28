// «Vendido por tipo» — las lecturas (28-nov-2026). SOLO LEE.
//   · Las seis del grupo: `switch_factura_lineas` del período (días de Panamá),
//     facturas suman y notas de crédito restan (como `switch_productos_por_cliente`).
//   · Multifashion: `switch_articulo_diario` (FA suma, NC resta) + la marca de
//     `switch_articulo_marca` por artículo.
// Devuelve un renglón por (empresa, código, tipo) con sus piezas netas; las
// sumas por tipo las hace `agruparPorTipo` (módulo puro), en la pantalla y en
// el cuadre.

import { supabaseServer } from "@/lib/supabase-server";
import { leerTodoPaginado } from "@/lib/supabase-paginado";
import { esMultifashion, tieneTipo, tipoDe, type ArticuloVendido } from "./vendido-por-tipo";

const NOTA_DE_CREDITO = "Nota de Crédito";
/** Páginas que se piden a la vez (un año del grupo son ~50 páginas). */
const SIMULTANEAS = 6;

const num = (v: unknown): number => {
  const x = typeof v === "number" ? v : Number.parseFloat(String(v ?? ""));
  return Number.isFinite(x) ? x : 0;
};

/** `2026-11-01` → el instante en que empieza ese día en Panamá (UTC−5 fijo). */
const inicioDia = (d: string) => `${d}T00:00:00-05:00`;
function diaSiguiente(d: string): string {
  const t = new Date(`${d}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + 1);
  return t.toISOString().slice(0, 10);
}

class Acumulador {
  private m = new Map<string, ArticuloVendido>();
  sumar(empresa: string, codigo: string, descripcion: string, tipo: string, piezas: number) {
    const k = `${empresa}|${codigo}|${tipo}`;
    const a = this.m.get(k);
    if (a) a.piezas += piezas;
    else this.m.set(k, { empresa, codigo, descripcion, tipo, piezas });
  }
  lista(): ArticuloVendido[] {
    return [...this.m.values()].filter((a) => a.piezas !== 0);
  }
}

interface FilaLinea {
  empresa_key: string;
  tipo_comprobante: string;
  codigo: string | null;
  descripcion: string | null;
  rubro: string | null;
  subrubro: string | null;
  cantidad: number | string;
}

async function leerGrupo(empresas: readonly string[], desde: string, hasta: string, acc: Acumulador) {
  if (empresas.length === 0) return;
  const filas = await leerTodoPaginado<FilaLinea>(
    "switch_factura_lineas (vendido por tipo)",
    (c, d, h) =>
      supabaseServer
        .from("switch_factura_lineas")
        .select("empresa_key, tipo_comprobante, codigo, descripcion, rubro, subrubro, cantidad", c ? { count: "exact" } : {})
        .in("empresa_key", [...empresas])
        .gte("fecha", inicioDia(desde))
        .lt("fecha", inicioDia(diaSiguiente(hasta)))
        .order("id", { ascending: true })
        .range(d, h),
    undefined,
    SIMULTANEAS,
  );
  for (const f of filas) {
    const signo = f.tipo_comprobante === NOTA_DE_CREDITO ? -1 : 1;
    const tipo = tipoDe(f.empresa_key, [f.subrubro, f.rubro], f.descripcion);
    acc.sumar(f.empresa_key, f.codigo ?? "(sin código)", f.descripcion ?? "", tipo, signo * num(f.cantidad));
  }
}

async function leerMultifashion(empresa: string, desde: string, hasta: string, acc: Acumulador) {
  const [dias, marcas] = await Promise.all([
    leerTodoPaginado<{ articulo_id: number; codigo: string | null; descripcion: string | null; tipo: string; cantidad_total: number | string }>(
      "switch_articulo_diario (vendido por tipo)",
      (c, d, h) =>
        supabaseServer
          .from("switch_articulo_diario")
          .select("articulo_id, codigo, descripcion, tipo, cantidad_total", c ? { count: "exact" } : {})
          .eq("empresa_key", empresa)
          .gte("fecha", desde)
          .lte("fecha", hasta)
          .order("id", { ascending: true })
          .range(d, h),
      undefined,
      SIMULTANEAS,
    ),
    leerTodoPaginado<{ articulo_id: number; marca_nombre: string | null }>(
      "switch_articulo_marca (vendido por tipo)",
      (c, d, h) =>
        supabaseServer
          .from("switch_articulo_marca")
          .select("articulo_id, marca_nombre", c ? { count: "exact" } : {})
          .eq("empresa_key", empresa)
          .order("articulo_id", { ascending: true })
          .range(d, h),
      undefined,
      SIMULTANEAS,
    ),
  ]);
  const marca = new Map(marcas.map((m) => [m.articulo_id, m.marca_nombre]));
  for (const f of dias) {
    const signo = f.tipo === "NC" ? -1 : 1;
    const tipo = tipoDe(empresa, [marca.get(f.articulo_id)]);
    acc.sumar(empresa, f.codigo ?? String(f.articulo_id), f.descripcion ?? "", tipo, signo * num(f.cantidad_total));
  }
}

/** Los artículos vendidos de esas empresas en el rango (días de Panamá, inclusive). */
export async function leerVendidoPorTipo(empresas: readonly string[], desde: string, hasta: string): Promise<ArticuloVendido[]> {
  const acc = new Acumulador();
  const conTipo = empresas.filter(tieneTipo);
  await Promise.all([
    leerGrupo(conTipo.filter((e) => !esMultifashion(e)), desde, hasta, acc),
    ...conTipo.filter(esMultifashion).map((e) => leerMultifashion(e, desde, hasta, acc)),
  ]);
  return acc.lista();
}

// Multifashion › Productos con la pantalla común (PRODUCTOS_FILTROS_2026_10).
//
// Multifashion no tiene líneas de factura: su clasificación es el diccionario
// `switch_articulo_marca` (la «marca» de Switch es el departamento, «TH
// MENSWEAR») y la marca real sale de él (`grupoDeDepartamento`). El Stock sale
// de `switch_articulo_info` (cron `sync-articulo-info`, desde el 5-oct-2026).
//
// El servidor manda `departamentos` (código → departamento de Switch); el
// navegador arma los artículos con el ranking por código que ya viaja.

import { departamentoSinMarca, generoDe, type ArticuloVendido, type ChipFiltro } from "@/lib/productos/filtros";
import { grupoDeDepartamento } from "./marcas-grupo";
import { textoAgrupable, type FilaArticuloDiario, type RenglonRanking } from "./productos-ranking";

export const CHIPS_MULTIFASHION: ChipFiltro[] = [
  { campo: "marca", etiqueta: "Marca" },
  { campo: "departamento", etiqueta: "Departamento" },
  { campo: "genero", etiqueta: "Género", cobertura: 0.8 },
  { campo: "descripcion", etiqueta: "Descripción", conBuscador: true },
];

/** Código → departamento, en forma compacta (los nombres una sola vez). */
export interface DepartamentosPorCodigo {
  n: string[];
  c: Record<string, number>;
}

/** SERVIDOR: el departamento canónico de cada código vendido. */
export function departamentosPorCodigo<T extends Pick<FilaArticuloDiario, "codigo" | "articulo_id">>(
  filas: readonly T[],
  depDeArticulo: ReadonlyMap<number, string>,
): DepartamentosPorCodigo {
  const n: string[] = [];
  const idx = new Map<string, number>();
  const c: Record<string, number> = {};
  for (const f of filas) {
    const cod = textoAgrupable(f.codigo);
    const dep = depDeArticulo.get(f.articulo_id);
    if (!cod || !dep || cod in c) continue;
    let i = idx.get(dep);
    if (i === undefined) { i = n.length; n.push(dep); idx.set(dep, i); }
    c[cod] = i;
  }
  return { n, c };
}

/** SERVIDOR: código (con la misma limpieza del ranking) → existencia de Switch. */
export function stockPorCodigo(filas: readonly { codigo: string; existencia: number | string | null }[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const f of filas) {
    const cod = textoAgrupable(f.codigo);
    const n = Number(f.existencia);
    if (cod && f.existencia != null && Number.isFinite(n)) out[cod] = (out[cod] ?? 0) + n;
  }
  return out;
}

/**
 * AJUSTES_APPLE_6 (punto 6): lo que hace falta para «Sin venta en 90 días» y
 * «Agotados», con lo que ya se trae: la venta por artículo de los últimos 90
 * días (`switch_articulo_diario`) y el Stock de Switch (`switch_articulo_info`).
 * `v90` = códigos vendidos en 90 días; `solo` = los que tienen Stock y no se
 * vendieron en el período ([código, descripción]); `deps` = su departamento.
 */
export interface AtencionMultifashion {
  v90: string[];
  solo: [string, string][];
  deps: DepartamentosPorCodigo;
}

/** SERVIDOR. */
export function atencionMultifashion(
  filas90: readonly Pick<FilaArticuloDiario, "codigo">[],
  stock: readonly { codigo: string; existencia: number | string | null; articulo_id?: number; descripcion?: string | null }[],
  vendidosEnPeriodo: ReadonlySet<string>,
  depDeArticulo: ReadonlyMap<number, string>,
): AtencionMultifashion {
  // Vendió = tiene algún renglón en la ventana, la MISMA regla que Ventas (`productos-articulos-server.ts`).
  const v90 = [...new Set(filas90.map(f => textoAgrupable(f.codigo)).filter(Boolean))];
  const solo: [string, string][] = [];
  const vistos = new Set<string>();
  const conDep: { codigo: string; articulo_id: number }[] = [];
  for (const s of stock) {
    const c = textoAgrupable(s.codigo);
    if (!c || vistos.has(c) || vendidosEnPeriodo.has(c) || !(Number(s.existencia) > 0)) continue;
    vistos.add(c);
    solo.push([c, textoAgrupable(s.descripcion) || c]);
    if (s.articulo_id != null) conDep.push({ codigo: c, articulo_id: s.articulo_id });
  }
  return { v90, solo, deps: departamentosPorCodigo(conDep, depDeArticulo) };
}

/** NAVEGADOR: los artículos del período (el ranking por código). */
export function articulosMultifashion(
  codigos: readonly RenglonRanking[],
  deps: DepartamentosPorCodigo,
  stock: Readonly<Record<string, number>> = {},
  atencion?: AtencionMultifashion,
): ArticuloVendido[] {
  const conStock = Object.keys(stock).length > 0;
  const v90 = atencion ? new Set(atencion.v90) : null;
  const vendidos = codigos.map(r => {
    const i = deps.c[r.clave];
    const dep = i === undefined ? "" : deps.n[i];
    return {
      codigo: r.clave,
      descripcion: r.detalle,
      unidades: r.unidades,
      venta: r.venta,
      costo: r.costo,
      ...(conStock ? { existencia: stock[r.clave] ?? null } : {}),
      ...(v90 ? { vendio90: v90.has(r.clave) } : {}),
      campos: {
        marca: dep ? grupoDeDepartamento(dep).nombre : "",
        departamento: departamentoSinMarca(dep),
        genero: generoDe(r.detalle),
        descripcion: r.detalle,
      },
    };
  });
  if (!atencion || !v90) return vendidos;
  // Los que solo tienen Stock: no suman venta, solo entran a «Sin venta en 90 días».
  const quietos = atencion.solo.map(([codigo, descripcion]): ArticuloVendido => {
    const i = atencion.deps.c[codigo];
    const dep = i === undefined ? "" : atencion.deps.n[i];
    return {
      codigo, descripcion, unidades: 0, venta: 0, costo: 0,
      existencia: stock[codigo] ?? null,
      vendio90: v90.has(codigo),
      campos: {
        marca: dep ? grupoDeDepartamento(dep).nombre : "",
        departamento: departamentoSinMarca(dep),
        genero: generoDe(descripcion),
        descripcion,
      },
    };
  });
  return [...vendidos, ...quietos];
}

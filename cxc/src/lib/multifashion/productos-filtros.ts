// Multifashion › Productos con la pantalla común (PRODUCTOS_FILTROS_2026_10).
//
// Multifashion no tiene líneas de factura ni inventario en la base: su
// clasificación es el diccionario `switch_articulo_marca` (la «marca» de Switch
// es el departamento, «TH MENSWEAR») y la marca real sale de él
// (`grupoDeDepartamento`). Sin existencia, ni días de inventario.
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
export function departamentosPorCodigo(
  filas: readonly FilaArticuloDiario[],
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

/** NAVEGADOR: los artículos del período (el ranking por código). */
export function articulosMultifashion(
  codigos: readonly RenglonRanking[],
  deps: DepartamentosPorCodigo,
): ArticuloVendido[] {
  return codigos.map(r => {
    const i = deps.c[r.clave];
    const dep = i === undefined ? "" : deps.n[i];
    return {
      codigo: r.clave,
      descripcion: r.detalle,
      unidades: r.unidades,
      venta: r.venta,
      costo: r.costo,
      campos: {
        marca: dep ? grupoDeDepartamento(dep).nombre : "",
        departamento: departamentoSinMarca(dep),
        genero: generoDe(r.detalle),
        descripcion: r.detalle,
      },
    };
  });
}

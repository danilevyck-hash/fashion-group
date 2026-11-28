// El margen ESTIMADO de un día de Multifashion (`MULTIFASHION_MARGEN_ESTIMADO_2026_11`).
// Módulo PURO. Venta = la de Switch por artículo (NC restan, ND fuera, como el
// margen real de `tarjeta-dia-server.ts`); costo = cantidad × costo ACTUAL del
// artículo. Un artículo sin costo (o costo ≤ 0) sale de la cuenta y se DICE en
// `cobertura` (fracción de la venta que sí se estimó): nunca un costo inventado.

export interface RenglonVendido {
  articuloId: number;
  tipo: string;
  cantidad: number;
  venta: number;
}

export interface MargenEstimado {
  /** Fracción (0.34). */
  margen: number;
  /** Fracción de la venta del día con costo conocido (1 = toda). */
  cobertura: number;
}

export function estimarMargen(renglones: readonly RenglonVendido[], costoPorArticulo: ReadonlyMap<number, number>): MargenEstimado | null {
  let ventaTotal = 0;
  let venta = 0;
  let costo = 0;
  for (const r of renglones) {
    if (r.tipo === "ND") continue;
    const s = r.tipo === "NC" ? -1 : 1;
    ventaTotal += s * r.venta;
    const c = costoPorArticulo.get(r.articuloId);
    if (c == null || !(c > 0)) continue;
    venta += s * r.venta;
    costo += s * r.cantidad * c;
  }
  if (ventaTotal <= 0 || venta <= 0) return null;
  const margen = (venta - costo) / venta;
  if (!(margen >= -1 && margen <= 1)) return null;
  return { margen, cobertura: Math.min(1, venta / ventaTotal) };
}

/** «sobre el 87 % de la venta» solo cuando falta costo de algo (bajo 99,5 %). */
export function notaDeCobertura(cobertura: number): string | null {
  return cobertura < 0.995 ? `estimado sobre el ${Math.floor(cobertura * 100)} % de la venta` : null;
}

// ============================================================================
// Marketing — helpers de cálculo de entregas de muebles
// ============================================================================
// Las entregas reparten cantidades por marca dinámicamente
// (cantidad_por_marca: Record<marcaId, unidades>). El reparto NO usa
// porcentajes — cada marca paga lo que se llevó × precio_unitario.
//
// NO incluir lógica de importación 15%: las entregas no llevan importación.
// ============================================================================

import type {
  EntregaItemInput,
  MkEntregaItem,
  MkInventarioProducto,
} from "./marketing/types";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Suma todas las unidades en un mapa cantidad_por_marca. */
export function unidadesTotales(
  cantidadPorMarca: Record<string, number>,
): number {
  let total = 0;
  for (const v of Object.values(cantidadPorMarca ?? {})) {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) total += n;
  }
  return total;
}

/**
 * Costo de una línea de entrega: precio × suma de cantidades por marca.
 * Acepta tanto MkEntregaItem (post-DB) como EntregaItemInput + precio externo.
 */
export function calcularSubtotalLinea(
  item: { cantidad_por_marca?: Record<string, number>; cantidadPorMarca?: Record<string, number>; precio_unitario?: number },
  precioExterno?: number,
): number {
  const cant =
    item.cantidad_por_marca ?? item.cantidadPorMarca ?? {};
  const precio = item.precio_unitario ?? precioExterno ?? 0;
  return round2(precio * unidadesTotales(cant));
}

/** Total de una entrega: suma de subtotales por línea. */
export function calcularTotalEntrega(
  items: ReadonlyArray<{
    cantidad_por_marca?: Record<string, number>;
    cantidadPorMarca?: Record<string, number>;
    precio_unitario?: number;
  }>,
  precioByProductoId?: Map<string, number>,
): number {
  let total = 0;
  for (const it of items) {
    const precioExterno = precioByProductoId?.get(
      String((it as { producto_id?: string; productoId?: string }).producto_id ??
        (it as { productoId?: string }).productoId ??
        ""),
    );
    total += calcularSubtotalLinea(it, precioExterno);
  }
  return round2(total);
}

/**
 * Total para una marca específica en una entrega: suma de
 * (precio × cantidad de esa marca) por todas las líneas.
 */
export function calcularTotalPorMarca(
  items: ReadonlyArray<{
    cantidad_por_marca?: Record<string, number>;
    cantidadPorMarca?: Record<string, number>;
    precio_unitario?: number;
    producto_id?: string;
    productoId?: string;
  }>,
  marcaId: string,
  precioByProductoId?: Map<string, number>,
): number {
  if (!marcaId) return 0;
  let total = 0;
  for (const it of items) {
    const cantMap = it.cantidad_por_marca ?? it.cantidadPorMarca ?? {};
    const cant = Number(cantMap[marcaId] ?? 0);
    if (!Number.isFinite(cant) || cant <= 0) continue;
    const precio =
      it.precio_unitario ??
      precioByProductoId?.get(String(it.producto_id ?? it.productoId ?? "")) ??
      0;
    total += precio * cant;
  }
  return round2(total);
}

/**
 * ¿Hay stock suficiente para entregar `cantidad` unidades del producto?
 * Informativo — el form muestra warning pero NO bloquea el guardado.
 *
 * Para edición, el caller debe pasar `cantidadPrevia` (la cantidad ya tomada
 * por esta misma entrega) para no contarla doble — el stock efectivo es
 * `stock_total + cantidadPrevia`.
 */
export function validarStockSuficiente(
  producto: Pick<MkInventarioProducto, "stock_total">,
  cantidad: number,
  cantidadPrevia: number = 0,
): boolean {
  const disponible = Number(producto.stock_total ?? 0) + (cantidadPrevia || 0);
  return cantidad <= disponible;
}

/**
 * Suma cantidades por producto a través de un set de items. Útil para
 * descontar stock al guardar (insert) o al editar (delta = nueva - vieja).
 *
 * Devuelve Map<productoId, unidades_totales>.
 */
export function sumaUnidadesPorProducto(
  items: ReadonlyArray<EntregaItemInput | MkEntregaItem>,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const it of items) {
    const productoId = String(
      (it as EntregaItemInput).productoId ??
        (it as MkEntregaItem).producto_id ??
        "",
    );
    if (!productoId) continue;
    const cant = unidadesTotales(
      (it as EntregaItemInput).cantidadPorMarca ??
        (it as MkEntregaItem).cantidad_por_marca ??
        {},
    );
    out.set(productoId, (out.get(productoId) ?? 0) + cant);
  }
  return out;
}

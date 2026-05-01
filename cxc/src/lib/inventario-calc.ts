// ============================================================================
// Marketing — helpers de cálculo de entregas de muebles
// ============================================================================
// Modelo nuevo (post-schema 2026-05): cada item de entrega tiene un array
// `reparto: [{marca_id, empresa, cantidad}]`. El cálculo aplica:
//   - Marca externa: 50% del subtotal va a la marca, 50% va a la empresa
//     interna pagadora (empresa). Empresa puede override marca.empresa_codigo.
//   - Marca interna (Joybees): 100% va a la marca; empresa se ignora.
//
// NO incluir lógica de importación 15%: las entregas no llevan importación.
// ============================================================================

import type {
  EntregaItemInput,
  MkEntregaItem,
  MkInventarioProducto,
  RepartoItemEntry,
  RepartoItemInput,
  TipoMarca,
} from "./marketing/types";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Cantidad total (suma de todas las marcas) en una fila de reparto. */
export function unidadesTotales(
  reparto: ReadonlyArray<RepartoItemEntry | RepartoItemInput> | undefined,
): number {
  let total = 0;
  for (const r of reparto ?? []) {
    const n = Number(r.cantidad);
    if (Number.isFinite(n) && n > 0) total += n;
  }
  return total;
}

interface CalcItem {
  productoId?: string;
  producto_id?: string;
  reparto?: ReadonlyArray<RepartoItemEntry | RepartoItemInput>;
  precio_unitario?: number;
}

/**
 * Costo bruto de una línea de entrega: precio × suma de cantidades del reparto.
 * NO aplica 50/50 — eso se hace al distribuir entre marca y empresa.
 */
export function calcularSubtotalLinea(
  item: CalcItem,
  precioExterno?: number,
): number {
  const precio = item.precio_unitario ?? precioExterno ?? 0;
  return round2(precio * unidadesTotales(item.reparto));
}

/** Total bruto de una entrega: suma de subtotales por línea. */
export function calcularTotalEntrega(
  items: ReadonlyArray<CalcItem>,
  precioByProductoId?: Map<string, number>,
): number {
  let total = 0;
  for (const it of items) {
    const precio =
      it.precio_unitario ??
      precioByProductoId?.get(String(it.producto_id ?? it.productoId ?? "")) ??
      0;
    total += precio * unidadesTotales(it.reparto);
  }
  return round2(total);
}

function repartoMarcaId(r: RepartoItemEntry | RepartoItemInput): string {
  return String(
    (r as RepartoItemEntry).marca_id ??
      (r as RepartoItemInput).marcaId ??
      "",
  );
}

/**
 * Total que cobra una marca específica: suma de
 * (cantidad × precio × factor) donde factor = 0.5 para externa, 1.0 para interna.
 *
 * `tiposByMarca` mapea marca_id → tipo. Default 'externa' si no aparece.
 */
export function calcularTotalPorMarca(
  items: ReadonlyArray<CalcItem>,
  marcaId: string,
  tiposByMarca?: Map<string, TipoMarca>,
  precioByProductoId?: Map<string, number>,
): number {
  if (!marcaId) return 0;
  let total = 0;
  for (const it of items) {
    for (const r of it.reparto ?? []) {
      if (repartoMarcaId(r) !== marcaId) continue;
      const cant = Number(r.cantidad);
      if (!Number.isFinite(cant) || cant <= 0) continue;
      const precio =
        it.precio_unitario ??
        precioByProductoId?.get(String(it.producto_id ?? it.productoId ?? "")) ??
        0;
      const tipo = tiposByMarca?.get(marcaId) ?? "externa";
      const factor = tipo === "interna" ? 1 : 0.5;
      total += precio * cant * factor;
    }
  }
  return round2(total);
}

/**
 * ¿Hay stock suficiente? Informativo — el form muestra warning pero NO bloquea.
 * Para edición, sumar la cantidad previa al stock disponible.
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
 * Suma de unidades por producto a través de un set de items. Usado para
 * descontar stock al guardar (insert) o computar delta neto al editar.
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
    const cant = unidadesTotales(it.reparto);
    out.set(productoId, (out.get(productoId) ?? 0) + cant);
  }
  return out;
}

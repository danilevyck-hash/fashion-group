// Mapeo ÚNICO de ítems de reclamo → filas de `reclamo_items` para insert.
// Compartido por crear (POST /api/reclamos) y editar (PUT /api/reclamos/[id]/items)
// para que ambos write paths nunca se desincronicen.
//
// IMPORTANTE: la lista de campos debe ser EXACTAMENTE columnas reales de la
// tabla viva. `subtotal` NO existe en `reclamo_items` (PostgREST responde
// PGRST204 si se envía) — se deriva siempre al vuelo como
// cantidad × precio_unitario donde se necesite (UI, PDF, Excel, CSV).

export interface ReclamoItemRow {
  reclamo_id: string;
  referencia: string;
  descripcion: string;
  talla: string;
  genero: string | null;
  cantidad: number;
  precio_unitario: number;
  motivo: string;
  nro_factura: string;
  nro_orden_compra: string;
}

export function buildReclamoItemRows(
  reclamoId: string,
  items: Record<string, unknown>[],
): ReclamoItemRow[] {
  return items.map((item) => ({
    reclamo_id: reclamoId,
    referencia: String(item.referencia || ""),
    descripcion: String(item.descripcion || ""),
    talla: String(item.talla || ""),
    genero: item.genero ? String(item.genero) : null,
    cantidad: Number(item.cantidad) || 1,
    precio_unitario: Number(item.precio_unitario) || 0,
    motivo: String(item.motivo || "Faltante de Mercancía"),
    nro_factura: String(item.nro_factura || ""),
    nro_orden_compra: String(item.nro_orden_compra || ""),
  }));
}

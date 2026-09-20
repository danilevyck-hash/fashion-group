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
    // 🔴 LA TALLA SE GUARDA RECORTADA (20-sep-2026).
    //
    // 🩸 Se guardaba con un espacio adelante —`" TODAS"`, `" 8"`, `" 34-32"`— y
    // ese espacio SALE EN EL PAPEL QUE RECIBE EL PROVEEDOR. Medido: **32
    // renglones dicen «TODAS»** y ~25 más arrancan con espacio.
    //
    // 🔑 DE DÓNDE SALE, que no es un misterio: `ItemsEditor` usa un espacio
    // solo (`" "`) como SEÑAL de «Otros» —es lo que hace `!TALLAS.includes(t)
    // && t !== ""` y cambia el desplegable por un campo de texto—, y lo que se
    // escribe después se pega detrás. Por eso el recorte va ACÁ, al GUARDAR, y
    // no al teclear: recortando mientras se escribe, la señal se borra sola y
    // el campo de texto se cierra en la cara de quien lo está usando.
    //
    // ⚠️ Lo YA guardado se queda como está: no hay migración de limpieza, y no
    // la habrá hasta que Daniel la pida.
    talla: String(item.talla || "").trim(),
    genero: item.genero ? String(item.genero) : null,
    cantidad: Number(item.cantidad) || 1,
    precio_unitario: Number(item.precio_unitario) || 0,
    motivo: String(item.motivo || "Faltante de Mercancía"),
    nro_factura: String(item.nro_factura || ""),
    nro_orden_compra: String(item.nro_orden_compra || ""),
  }));
}

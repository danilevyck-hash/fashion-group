// Validación de obligatoriedad de Reclamos — COMPARTIDA entre client (forms) y
// server (POST / PATCH / PUT items). Única fuente de verdad de qué es obligatorio.
//
// OBLIGATORIOS:
//   Cabecera: empresa, nro_factura, fecha_reclamo, nro_orden_compra (N° pedido).
//   Ítem: referencia (código), descripcion, talla, genero, cantidad (>0),
//         precio_unitario (>=0), motivo. Y debe haber >= 1 ítem.
// OPCIONALES (excluidos a propósito): notas, factura PDF, fotos.
//
// Devuelve un mensaje en español listo para mostrar, o null si todo está OK.

export interface ReclamoHeaderInput {
  empresa?: unknown;
  nro_factura?: unknown;
  fecha_reclamo?: unknown;
  nro_orden_compra?: unknown;
}

export interface ReclamoItemInput {
  referencia?: unknown;
  descripcion?: unknown;
  talla?: unknown;
  genero?: unknown;
  cantidad?: unknown;
  precio_unitario?: unknown;
  motivo?: unknown;
}

function s(v: unknown): string {
  if (typeof v === "string") return v.trim();
  if (v == null) return "";
  return String(v).trim();
}

/** Valida la cabecera. null si OK. */
export function validateReclamoHeader(h: ReclamoHeaderInput): string | null {
  if (!s(h.empresa)) return "Selecciona la empresa.";
  if (!s(h.nro_factura)) return "Falta el N° de factura.";
  if (!s(h.fecha_reclamo)) return "Falta la fecha.";
  if (!s(h.nro_orden_compra)) return "Falta el N° de pedido.";
  return null;
}

/** Valida un ítem. `n` = número 1-based para el mensaje. null si OK. */
export function validateReclamoItem(item: ReclamoItemInput, n: number): string | null {
  if (!s(item.referencia)) return `Ítem ${n}: falta el código.`;
  if (!s(item.descripcion)) return `Ítem ${n}: falta la descripción.`;
  if (!s(item.talla)) return `Ítem ${n}: falta la talla.`;
  if (!s(item.genero)) return `Ítem ${n}: falta el género (Men/Women/Kids/Accessories).`;
  const cant = Number(item.cantidad);
  if (!Number.isFinite(cant) || cant <= 0) return `Ítem ${n}: la cantidad debe ser mayor a 0.`;
  const precio = Number(item.precio_unitario);
  if (!Number.isFinite(precio) || precio < 0) return `Ítem ${n}: el precio no puede ser negativo.`;
  if (!s(item.motivo)) return `Ítem ${n}: falta el motivo.`;
  return null;
}

/** Valida la lista de ítems (>=1 y cada uno completo). null si OK. */
export function validateReclamoItems(items: unknown): string | null {
  if (!Array.isArray(items) || items.length === 0) return "Agrega al menos un ítem.";
  for (let i = 0; i < items.length; i++) {
    const err = validateReclamoItem(items[i] as ReclamoItemInput, i + 1);
    if (err) return err;
  }
  return null;
}

/** Validación completa para crear/editar (cabecera + ítems). null si OK. */
export function validateReclamoFull(h: ReclamoHeaderInput, items: unknown): string | null {
  return validateReclamoHeader(h) ?? validateReclamoItems(items);
}

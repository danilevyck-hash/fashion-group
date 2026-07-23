// Regresión PGRST204 "Could not find the 'subtotal' column of 'reclamo_items'":
// el payload de insert de ítems NO debe incluir `subtotal` (la columna no existe
// en la tabla viva) y debe conservar nro_factura/nro_orden_compra por ítem
// (antes se perdían al editar). buildReclamoItemRows es el mapeo compartido
// por crear (POST /api/reclamos) y editar (PUT /api/reclamos/[id]/items).
import { describe, it, expect } from "vitest";
import { buildReclamoItemRows } from "@/lib/reclamos/item-rows";

// Columnas reales de reclamo_items (esquema vivo, verificado 2026-07-23) menos
// las que pone la DB sola (id, created_at, deleted).
const LIVE_INSERTABLE_COLUMNS = [
  "reclamo_id",
  "referencia",
  "descripcion",
  "talla",
  "genero",
  "cantidad",
  "precio_unitario",
  "motivo",
  "nro_factura",
  "nro_orden_compra",
].sort();

describe("buildReclamoItemRows", () => {
  const item = {
    referencia: "REF-1",
    descripcion: "Zapato",
    talla: "9",
    genero: "Men",
    cantidad: 2,
    precio_unitario: 10.5,
    subtotal: 21, // el cliente puede mandarlo — NUNCA debe llegar al insert
    motivo: "Mercancía dañada",
    nro_factura: "F-123",
    nro_orden_compra: "PO-9",
  };

  it("nunca incluye subtotal en el payload (columna inexistente → PGRST204)", () => {
    const rows = buildReclamoItemRows("rid", [item]);
    expect(rows).toHaveLength(1);
    expect(Object.keys(rows[0])).not.toContain("subtotal");
  });

  it("las llaves del payload son exactamente columnas reales de la tabla", () => {
    const rows = buildReclamoItemRows("rid", [item]);
    expect(Object.keys(rows[0]).sort()).toEqual(LIVE_INSERTABLE_COLUMNS);
  });

  it("conserva nro_factura y nro_orden_compra por ítem (edit path los perdía)", () => {
    const rows = buildReclamoItemRows("rid", [item]);
    expect(rows[0].nro_factura).toBe("F-123");
    expect(rows[0].nro_orden_compra).toBe("PO-9");
    expect(rows[0].reclamo_id).toBe("rid");
  });

  it("aplica defaults seguros en campos vacíos", () => {
    const rows = buildReclamoItemRows("rid", [{}]);
    expect(rows[0]).toEqual({
      reclamo_id: "rid",
      referencia: "",
      descripcion: "",
      talla: "",
      genero: null,
      cantidad: 1,
      precio_unitario: 0,
      motivo: "Faltante de Mercancía",
      nro_factura: "",
      nro_orden_compra: "",
    });
  });
});

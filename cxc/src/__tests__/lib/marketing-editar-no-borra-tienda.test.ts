// 🩸 27-nov-2026: Daniel editó SOLO la marca y el % de una factura (Impresora
// Comercial S.A., $48.15, tienda D-139) y al guardar la tienda quedó vacía.
// Causa: `getFacturaById` → `mapFactura` armaba la factura a mano y dejaba
// afuera `tienda_codigo`, `nota`, `se_reporta` y `pct_a_la_marca`. La ficha
// abría con «Sin tienda» y el guardado mandaba `tiendaCodigo: null`.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cuerpoDeLaEdicion, datosDeLaFila, soloLoQueCambio } from "@/lib/marketing/editar-gasto";

const FILA = {
  id: "f-1",
  proyecto_id: null,
  numero_factura: "0001-123",
  fecha_factura: "2026-11-27",
  proveedor: "Impresora Comercial S.A.",
  concepto: "Impresión",
  subtotal: 45,
  itbms: 3.15,
  total: 48.15,
  tiene_importacion: false,
  estado_pago: "creado",
  tienda_codigo: "D-139",
  nota: "Apertura",
  se_reporta: true,
  pct_a_la_marca: 50,
  anulado_en: null,
  anulado_motivo: null,
  created_at: "2026-11-27T10:00:00Z",
  updated_at: "2026-11-27T10:00:00Z",
};

afterEach(() => {
  vi.resetModules();
  vi.doUnmock("@/lib/supabase-server");
});

describe("editar una factura no borra su tienda", () => {
  it("la factura que abre la ficha trae su tienda, su nota y su %", async () => {
    vi.doMock("@/lib/supabase-server", () => ({
      supabaseServer: {
        from: (t: string) => ({
          select: () => ({
            eq: () =>
              t === "mk_facturas"
                ? { maybeSingle: async () => ({ data: FILA, error: null }) }
                : Promise.resolve({ data: [], error: null }),
          }),
        }),
      },
    }));
    const { getFacturaById } = await import("@/lib/marketing/queries");
    const f = await getFacturaById("f-1");
    expect(f).toMatchObject({ tienda_codigo: "D-139", nota: "Apertura", se_reporta: true, pct_a_la_marca: 50 });
    // Y el formulario abre con la tienda puesta, no en «Sin tienda».
    expect(datosDeLaFila(f)).toMatchObject({ esDeTienda: true, tiendaCodigo: "D-139" });
  });

  it("al guardar solo viaja lo que cambió", () => {
    const antes = cuerpoDeLaEdicion(datosDeLaFila(FILA));
    expect(soloLoQueCambio(antes, antes)).toEqual({});
    const ahora = cuerpoDeLaEdicion(datosDeLaFila({ ...FILA, nota: "Remodelación" }));
    expect(soloLoQueCambio(ahora, antes)).toEqual({ nota: "Remodelación" });
    // Sin «antes» (crear) viaja todo.
    expect(soloLoQueCambio(ahora, null)).toEqual(ahora);
  });
});

// Agrupación por modelo del catálogo Joybees (`groupByModel`).
//
// 🩸 EL BUG QUE CIERRA (medido en producción el 25-jul-2026): dos artículos de
// Switch con el MISMO código base pero distinto sufijo y distinto PRECIO
// —`UKTRK.BLK-KIDS` $13 con 95 unidades y `UKTRK.BLK-JUNIOR` $15 con 120—
// salían en el catálogo como DOS TARJETAS IDÉNTICAS: las dos decían `UKTRK.BLK`
// (sin sufijo) y las dos decían 95. Las 120 unidades del otro artículo eran
// invisibles. Causa: el segundo grupo se guardaba en la MISMA llave del Map
// (pisando al primero) y su llave se empujaba DOS VECES en el orden de salida,
// así que el mismo objeto se devolvía repetido.
//
// Lo que NO debe cambiar: los pares que comparten nombre Y precio (W/M, o
// KIDS/JUNIOR al mismo precio) siguen en UNA card con un botón por variante.

import { describe, it, expect } from "vitest";
import { groupByModel, type JoybeesProduct } from "@/components/catalogo/groupByModel";

function prod(over: Partial<JoybeesProduct> & { sku: string }): JoybeesProduct {
  return {
    id: `id-${over.sku}`,
    name: "Producto",
    category: "clogs",
    gender: "kids",
    price: 10,
    stock: 0,
    existencia: 0,
    disponibilidad: 0,
    image_url: null,
    active: true,
    popular: false,
    is_regalia: false,
    created_at: "2026-07-01T00:00:00Z",
    ...over,
  };
}

// Caso REAL de producción.
const TRK_KIDS = prod({
  sku: "UKTRK.BLK-KIDS", name: "Kids Trekking Shoe Solid Black",
  price: 13, existencia: 95, disponibilidad: 95, stock: 95,
});
const TRK_JUNIOR = prod({
  sku: "UKTRK.BLK-JUNIOR", name: "Kids Trekking Shoe Solid Black",
  price: 15, existencia: 120, disponibilidad: 120, stock: 120,
});

describe("groupByModel — dos SKU que solo difieren en el sufijo", () => {
  it("con PRECIO distinto son DOS productos: dos cards, cada una con SU stock", () => {
    const groups = groupByModel([TRK_KIDS, TRK_JUNIOR]);
    expect(groups).toHaveLength(2);
    // No es el mismo objeto repetido (era exactamente el bug).
    expect(groups[0]).not.toBe(groups[1]);
    // Cada card muestra su SKU COMPLETO — el sufijo no se pierde.
    expect(groups.map(g => g.baseSku).sort()).toEqual(["UKTRK.BLK-JUNIOR", "UKTRK.BLK-KIDS"]);
    // Y cada una lleva su propia existencia: ningún 120 desaparece.
    const porSku = new Map(groups.map(g => [g.baseSku, g]));
    expect(porSku.get("UKTRK.BLK-KIDS")!.price).toBe(13);
    expect(porSku.get("UKTRK.BLK-KIDS")!.variants[0].product.existencia).toBe(95);
    expect(porSku.get("UKTRK.BLK-JUNIOR")!.price).toBe(15);
    expect(porSku.get("UKTRK.BLK-JUNIOR")!.variants[0].product.existencia).toBe(120);
    // Una variante por card, con su etiqueta de sufijo.
    expect(porSku.get("UKTRK.BLK-KIDS")!.variants.map(v => v.genderLabel)).toEqual(["Kids"]);
    expect(porSku.get("UKTRK.BLK-JUNIOR")!.variants.map(v => v.genderLabel)).toEqual(["Junior"]);
  });

  it("las React keys (baseSku) quedan ÚNICAS entre las dos cards", () => {
    const keys = groupByModel([TRK_KIDS, TRK_JUNIOR]).map(g => g.baseSku);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("da igual el orden de entrada: ninguno pisa al otro", () => {
    const a = groupByModel([TRK_KIDS, TRK_JUNIOR]);
    const b = groupByModel([TRK_JUNIOR, TRK_KIDS]);
    expect(a).toHaveLength(2);
    expect(b).toHaveLength(2);
    expect(b.map(g => g.baseSku).sort()).toEqual(a.map(g => g.baseSku).sort());
  });

  it("con MISMO nombre y precio siguen siendo UNA card con dos variantes (no se toca la agrupación)", () => {
    const w = prod({
      sku: "UAACG.BLK-W", name: "Adults Active Clog Solid Black",
      gender: "women", price: 13, existencia: 132, disponibilidad: 132, stock: 132,
    });
    const m = prod({
      sku: "UAACG.BLK-M", name: "Adults Active Clog Solid Black",
      gender: "adults_m", price: 13, existencia: 132, disponibilidad: 132, stock: 132,
    });
    const groups = groupByModel([w, m]);
    expect(groups).toHaveLength(1);
    // Acá el base SÍ es el código a mostrar: la card tiene un botón por variante.
    expect(groups[0].baseSku).toBe("UAACG.BLK");
    expect(groups[0].variants.map(v => v.genderLabel)).toEqual(["Mujer", "Hombre"]);
  });

  it("un modelo con UNA sola variante publicada muestra su SKU completo, no el base", () => {
    const groups = groupByModel([TRK_JUNIOR]);
    expect(groups).toHaveLength(1);
    expect(groups[0].baseSku).toBe("UKTRK.BLK-JUNIOR");
  });

  it("los SKU sin sufijo conocido no se tocan", () => {
    const solo = prod({ sku: "UKOLG.NSC", name: "Kids Oxygen Clog", price: 11 });
    const groups = groupByModel([solo, TRK_KIDS, TRK_JUNIOR]);
    expect(groups).toHaveLength(3);
    expect(groups[0].baseSku).toBe("UKOLG.NSC");
  });

  it("tres SKU del mismo base con tres precios dan tres cards distintas", () => {
    const tercero = prod({
      sku: "UKTRK.BLK-M", name: "Kids Trekking Shoe Solid Black",
      gender: "adults_m", price: 17, existencia: 7, disponibilidad: 7, stock: 7,
    });
    const groups = groupByModel([TRK_KIDS, TRK_JUNIOR, tercero]);
    expect(groups).toHaveLength(3);
    expect(new Set(groups.map(g => g.baseSku)).size).toBe(3);
    expect(groups.map(g => g.variants[0].product.existencia).sort((a, b) => a! - b!))
      .toEqual([7, 95, 120]);
  });
});

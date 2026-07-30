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
// EL INVARIANTE, que no cambió nunca: **ninguna variante puede quedar
// escondida.** Cada SKU tiene que ser alcanzable con SU precio y SU stock.
//
// ⚠️ CÓMO se cumple SÍ cambió (30-jul-2026). El primer arreglo partió el par en
// DOS TARJETAS porque "una card tiene UN precio". Con el SELECTOR DE TALLA de la
// card agrupada (aprobado por Daniel sobre el mockup de la opción A) eso dejó de
// ser cierto: cada botón de talla lleva su propio precio y su propio stock, y el
// precio grande sigue a la talla elegida. Así `UKTRK.BLK` vuelve a ser UN modelo
// —como es en la vitrina— sin que se pierda un solo número. Los pares al MISMO
// precio (W/M, KIDS/JUNIOR) ya venían en una card y siguen igual; lo que se
// arregló en esa card fue que mostraba la SUMA de los dos stocks
// (`joybees-selector-talla.test.tsx`).
//
// Lo único que TODAVÍA parte grupos: un sufijo repetido o un nombre distinto —
// ahí dos botones se verían iguales y uno de los stocks sería inalcanzable.

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
  it("con PRECIO distinto es UN modelo con DOS tallas, cada una con SU precio y SU stock", () => {
    const groups = groupByModel([TRK_KIDS, TRK_JUNIOR]);
    expect(groups).toHaveLength(1);
    const [g] = groups;
    // El código a mostrar es el base: la card tiene un botón por talla.
    expect(g.baseSku).toBe("UKTRK.BLK");
    expect(g.variants.map(v => v.genderLabel)).toEqual(["Kids", "Junior"]);
    // Ni un número se pierde: cada variante conserva SU precio y SU existencia.
    const porSku = new Map(g.variants.map(v => [v.product.sku, v.product]));
    expect(porSku.get("UKTRK.BLK-KIDS")!.price).toBe(13);
    expect(porSku.get("UKTRK.BLK-KIDS")!.existencia).toBe(95);
    expect(porSku.get("UKTRK.BLK-JUNIOR")!.price).toBe(15);
    expect(porSku.get("UKTRK.BLK-JUNIOR")!.existencia).toBe(120);
    // El precio del GRUPO es el menor y solo ordena la grilla — la card muestra
    // el de la talla elegida, así que ningún precio queda tapado.
    expect(g.price).toBe(13);
  });

  it("las React keys (baseSku) quedan ÚNICAS: ninguna card se repite", () => {
    const keys = groupByModel([TRK_KIDS, TRK_JUNIOR]).map(g => g.baseSku);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("da igual el orden de entrada: ninguno pisa al otro", () => {
    const a = groupByModel([TRK_KIDS, TRK_JUNIOR]);
    const b = groupByModel([TRK_JUNIOR, TRK_KIDS]);
    // Un modelo en los dos sentidos, y las dos existencias presentes en los dos.
    for (const g of [a, b]) {
      expect(g).toHaveLength(1);
      expect(g[0].variants.map(v => v.product.existencia).sort((x, y) => x! - y!))
        .toEqual([95, 120]);
      expect(g[0].price).toBe(13);
    }
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
    expect(groups).toHaveLength(2);
    expect(groups[0].baseSku).toBe("UKOLG.NSC");
    expect(groups[1].baseSku).toBe("UKTRK.BLK");
  });

  it("tres tallas del mismo base con tres precios: UN modelo, tres botones", () => {
    const tercero = prod({
      sku: "UKTRK.BLK-M", name: "Kids Trekking Shoe Solid Black",
      gender: "adults_m", price: 17, existencia: 7, disponibilidad: 7, stock: 7,
    });
    const groups = groupByModel([TRK_KIDS, TRK_JUNIOR, tercero]);
    expect(groups).toHaveLength(1);
    // Las TRES existencias siguen alcanzables, una por botón de talla.
    expect(groups[0].variants.map(v => v.product.existencia).sort((a, b) => a! - b!))
      .toEqual([7, 95, 120]);
    expect(new Set(groups[0].variants.map(v => v.suffix)).size).toBe(3);
  });

  it("un SUFIJO REPETIDO sí parte el grupo: dos botones iguales taparían un stock", () => {
    const otroKids = prod({
      sku: "UKTRK.BLK-KIDS", name: "Kids Trekking Shoe Solid Black",
      price: 13, existencia: 40, disponibilidad: 40, stock: 40,
    });
    const groups = groupByModel([TRK_KIDS, otroKids]);
    expect(groups).toHaveLength(2);
    expect(groups[0]).not.toBe(groups[1]);
    expect(groups.map(g => g.variants[0].product.existencia).sort((a, b) => a! - b!))
      .toEqual([40, 95]);
  });
});

// Lo que Daniel VE en el catálogo interno de Joybees: la píldora del código y
// la línea "Disponibilidad / Existencia" de cada tarjeta.
//
// 🩸 Caso real del 25-jul-2026: `UKTRK.BLK-KIDS` (95 uds, $13) y
// `UKTRK.BLK-JUNIOR` (120 uds, $15) salían como DOS tarjetas idénticas —
// "UKTRK.BLK · $13 · Disponibilidad 95 · Existencia 95" las dos— y las 120
// unidades del Junior no aparecían en ninguna parte. Acá se renderizan las
// cards de verdad (mismo componente que la app) y se mide el texto.

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import CatalogoGroupedCard from "@/components/catalogo/CatalogoGroupedCard";
import { groupByModel, type JoybeesProduct } from "@/components/catalogo/groupByModel";

afterEach(cleanup);

function prod(over: Partial<JoybeesProduct> & { sku: string }): JoybeesProduct {
  return {
    id: `id-${over.sku}`,
    name: "Kids Trekking Shoe Solid Black",
    category: "trekking",
    gender: "kids",
    price: 13,
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

const KIDS = prod({ sku: "UKTRK.BLK-KIDS", price: 13, existencia: 95, disponibilidad: 95, stock: 95 });
const JUNIOR = prod({ sku: "UKTRK.BLK-JUNIOR", price: 15, existencia: 120, disponibilidad: 120, stock: 120 });

describe("card del catálogo interno — dos SKU con el mismo base", () => {
  it("cada tarjeta muestra SU código completo, SU precio y SU stock", () => {
    const groups = groupByModel([KIDS, JUNIOR]);
    expect(groups).toHaveLength(2);

    for (const g of groups) {
      const { unmount } = render(
        <CatalogoGroupedCard
          marca="joybees"
          group={g}
          cartMap={new Map()}
          onQtyChange={() => {}}
          showStock
        />,
      );
      const texto = document.body.innerText || document.body.textContent || "";
      if (g.baseSku === "UKTRK.BLK-KIDS") {
        expect(screen.getByText("UKTRK.BLK-KIDS")).toBeTruthy();
        expect(texto).toContain("Disponibilidad 95");
        expect(texto).toContain("Existencia 95");
        expect(texto).toContain("$13");
        expect(texto).not.toContain("120");
      } else {
        expect(g.baseSku).toBe("UKTRK.BLK-JUNIOR");
        expect(screen.getByText("UKTRK.BLK-JUNIOR")).toBeTruthy();
        expect(texto).toContain("Disponibilidad 120");
        expect(texto).toContain("Existencia 120");
        expect(texto).toContain("$15");
        expect(texto).not.toContain("95");
      }
      unmount();
      cleanup();
    }
  });

  it("ninguna de las dos muestra el código base pelado (era lo que confundía)", () => {
    for (const g of groupByModel([KIDS, JUNIOR])) {
      const { unmount } = render(
        <CatalogoGroupedCard
          marca="joybees"
          group={g}
          cartMap={new Map()}
          onQtyChange={() => {}}
          showStock
        />,
      );
      expect(screen.queryByText("UKTRK.BLK")).toBeNull();
      unmount();
      cleanup();
    }
  });

  it("el par que SÍ comparte precio sigue siendo una card con las dos variantes y el stock sumado", () => {
    const w = prod({ sku: "UAACG.BLK-W", name: "Adults Active Clog Solid Black", gender: "women", price: 13, existencia: 84, disponibilidad: 84, stock: 84 });
    const m = prod({ sku: "UAACG.BLK-M", name: "Adults Active Clog Solid Black", gender: "adults_m", price: 13, existencia: 83, disponibilidad: 83, stock: 83 });
    const groups = groupByModel([w, m]);
    expect(groups).toHaveLength(1);
    render(
      <CatalogoGroupedCard
        marca="joybees"
        group={groups[0]}
        cartMap={new Map()}
        onQtyChange={() => {}}
        showStock
      />,
    );
    expect(screen.getByText("UAACG.BLK")).toBeTruthy();
    const texto = document.body.innerText || document.body.textContent || "";
    expect(texto).toContain("Disponibilidad 167"); // 84 + 83
    expect(texto).toContain("Agregar Mujer");
    expect(texto).toContain("Agregar Hombre");
  });
});

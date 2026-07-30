// Lo que Daniel VE en el catálogo interno de Joybees: la píldora del código y
// los números de stock de cada tarjeta. Se renderizan las cards de verdad
// (mismo componente que la app) y se mide el texto.
//
// 🩸 DOS BUGS, el mismo daño: un stock que no aparece en ninguna parte.
//   1. (25-jul-2026) `UKTRK.BLK-KIDS` 95 uds $13 y `UKTRK.BLK-JUNIOR` 120 uds
//      $15 salían como DOS tarjetas IDÉNTICAS — "UKTRK.BLK · $13 · 95" las dos—
//      y las 120 del Junior eran invisibles.
//   2. (30-jul-2026) el par al MISMO precio sí venía en una tarjeta, pero
//      mostraba la SUMA: `UAACG.BLK` decía "Disponibilidad 167" por 84 Mujer +
//      83 Hombre, y ni el 84 ni el 83 estaban escritos en ningún lado.
//
// Los dos se cierran con el SELECTOR DE TALLA (aprobado por Daniel, opción A del
// mockup): un botón por talla, cada uno con SU stock y SU precio, y la
// disponibilidad de abajo siguiendo a la talla elegida. **La suma no se muestra
// nunca.** Detalle completo del selector en `joybees-selector-talla.test.tsx`.

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
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

/** Todo el texto visible de la card, con espacios normalizados. */
function visible(): string {
  return (document.body.textContent ?? "").replace(/\s+/g, " ").trim();
}

function pintar(g: ReturnType<typeof groupByModel>[number]) {
  return render(
    <CatalogoGroupedCard
      marca="joybees"
      group={g}
      cartMap={new Map()}
      onQtyChange={() => {}}
      showStock
    />,
  );
}

describe("card del catálogo interno — dos SKU con el mismo base", () => {
  it("con precios distintos: UNA tarjeta, los dos precios y los dos stocks a la vista", () => {
    const groups = groupByModel([KIDS, JUNIOR]);
    expect(groups).toHaveLength(1);
    const { container } = pintar(groups[0]);

    // El código es el del MODELO: la tarjeta trae un botón por talla.
    expect(screen.getByText("UKTRK.BLK")).toBeTruthy();
    const texto = visible();
    // Los dos precios y los dos stocks, sin tocar nada.
    expect(texto).toContain("$13");
    expect(texto).toContain("$15");
    expect(texto).toContain("95");
    expect(texto).toContain("120");
    // La disponibilidad de abajo es la de la talla elegida, con su nombre.
    expect(texto).toContain("Disponibilidad 95 · Kids");

    // Al elegir Junior, cambian el número y el precio grande.
    const botones = Array.from(container.querySelectorAll('[role="group"] button'));
    fireEvent.click(botones[1]);
    expect(visible()).toContain("Disponibilidad 120 · Junior");
    expect(container.querySelector(".text-xl.font-bold")!.textContent).toBe("$15");
  });

  it("NO puede volver la tarjeta repetida: un solo modelo, un solo código", () => {
    const groups = groupByModel([KIDS, JUNIOR]);
    pintar(groups[0]);
    // Antes había DOS cards diciendo "UKTRK.BLK"; ahora hay una sola.
    expect(screen.getAllByText("UKTRK.BLK")).toHaveLength(1);
    // Y el código no esconde un sufijo: el sufijo vive en los botones de talla.
    expect(screen.queryByText("UKTRK.BLK-KIDS")).toBeNull();
    expect(screen.queryByText("UKTRK.BLK-JUNIOR")).toBeNull();
  });

  it("el par al MISMO precio muestra los DOS stocks y NUNCA la suma", () => {
    const w = prod({ sku: "UAACG.BLK-W", name: "Adults Active Clog Solid Black", gender: "women", price: 13, existencia: 84, disponibilidad: 84, stock: 84 });
    const m = prod({ sku: "UAACG.BLK-M", name: "Adults Active Clog Solid Black", gender: "adults_m", price: 13, existencia: 83, disponibilidad: 83, stock: 83 });
    const groups = groupByModel([w, m]);
    expect(groups).toHaveLength(1);
    const { container } = pintar(groups[0]);

    expect(screen.getByText("UAACG.BLK")).toBeTruthy();
    const texto = visible();
    expect(texto).toContain("84");
    expect(texto).toContain("83");
    // 84 + 83 = 167. Ese número ya no existe en la pantalla.
    expect(texto).not.toContain("167");
    expect(texto).toContain("Disponibilidad 84 · Mujer");
    // El botón de acción agrega la talla elegida (antes había uno por variante).
    expect(container.querySelector("button.w-full")!.textContent).toBe("Agregar Mujer");
    fireEvent.click(Array.from(container.querySelectorAll('[role="group"] button'))[1]);
    expect(container.querySelector("button.w-full")!.textContent).toBe("Agregar Hombre");
    expect(visible()).toContain("Disponibilidad 83 · Hombre");
  });
});

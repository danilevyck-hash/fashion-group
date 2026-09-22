/**
 * ─────────────────────────────────────────────────────────────────────────────
 * CANDADO DE PANTALLA — EL NOMBRE EN LA TARJETA, MARCA POR MARCA (22-sep-2026)
 *
 * El hermano de `src/__tests__/lib/catalogo-la-foto-manda.test.ts`: aquél mira
 * el DATO del tema y el código fuente; éste PINTA las cuatro tarjetas y lee lo
 * que queda en pantalla.
 *
 * 🔴 Tommy y Calvin NO dibujan el nombre. Medido contra producción ese día:
 *    Tommy **19 nombres distintos para 455 productos vivos** («Women-Sneakers»
 *    ×97) y Calvin **6 para 82** — la línea repetía el encabezado de sección
 *    («SNEAKERS — WOMEN · 92») tres centímetros más arriba. Daniel, sobre cómo
 *    su vendedor le señala un producto a un cliente: *«b) señalando la foto»*.
 *
 * 🔴 Reebok y Joybees SÍ lo dibujan — 74/220 y 70/81 nombres distintos: ahí la
 *    línea dice «CLASSIC LEATHER» y «Kids Varsity Clog Black/Red», y quitarla
 *    es el error INVERSO, igual de defecto.
 *
 * ⚠️ El nombre NO se borra del dato: sigue viajando y queda en el `title` del
 *    código, así que al pasar el mouse se lee completo.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import CatalogoProductCard from "@/components/catalogo/CatalogoProductCard";
import type { CatalogoProducto } from "@/components/catalogo/types";
import { MARCA_THEME, type MarcaUiKey } from "@/lib/catalogo/marcas-ui";

vi.mock("@/lib/hooks/useModalDismiss", () => ({ useEscapeClose: () => {} }));
vi.mock("@/lib/tommy-supabase-server", () => ({ tommyServer: {} }));
vi.mock("@/lib/supabase-server", () => ({ supabaseServer: {} }));

afterEach(cleanup);

const NOMBRE = "Women-Sneakers";
const CODIGO = "EN0EN020840K4";

const producto: CatalogoProducto = {
  id: "p1",
  sku: CODIGO,
  name: NOMBRE,
  price: 34,
  image_url: null,
  category: "sneakers",
};

function pintar(marca: MarcaUiKey) {
  return render(
    <CatalogoProductCard marca={marca} product={producto} qty={0} onQtyChange={() => {}} />,
  );
}

describe("las marcas cuyo nombre repite la categoría no lo dibujan", () => {
  for (const marca of ["tommy", "calvin"] as const) {
    it(`${marca}: la tarjeta muestra el CÓDIGO y no el nombre`, () => {
      const { container } = pintar(marca);
      expect(container.textContent).toContain(CODIGO);
      expect(container.textContent).not.toContain(NOMBRE);
      // El nombre sigue al alcance del mouse.
      expect(container.querySelector(`[title="${NOMBRE}"]`)).not.toBeNull();
      // Y el código se lee: no quedó en la píldora tenue.
      const titulo = container.querySelector<HTMLElement>(`[title="${NOMBRE}"]`)!;
      expect(titulo.className).toBe(MARCA_THEME[marca].card.codigoTitulo);
      expect(titulo.className).not.toContain("/50");
    });
  }
});

describe("las marcas cuyo nombre dice el modelo lo siguen dibujando", () => {
  for (const marca of ["reebok", "joybees"] as const) {
    it(`${marca}: la tarjeta muestra el nombre Y el código`, () => {
      const { container } = pintar(marca);
      expect(container.textContent).toContain(NOMBRE);
      expect(container.textContent).toContain(CODIGO);
      // El código sigue en su píldora de siempre.
      const pildora = [...container.querySelectorAll<HTMLElement>("span")].find(
        (e) => e.textContent === CODIGO,
      );
      expect(pildora?.className).toBe(MARCA_THEME[marca].card.skuPill);
    });
  }
});

describe("sin código, la tarjeta no queda anónima", () => {
  it("Tommy sin sku cae al nombre en vez de dibujar nada", () => {
    const { container } = render(
      <CatalogoProductCard
        marca="tommy"
        product={{ ...producto, sku: "" }}
        qty={0}
        onQtyChange={() => {}}
      />,
    );
    expect(container.textContent).toContain(NOMBRE);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 CANDADO · Catálogos estilo Apple, tercera vuelta (`CATALOGOS_APPLE_2026_10_B`,
// 2-oct-2026). El interruptor solo cambia el LUGAR de las cosas:
//   1. Hoy los cinco grupos están apagados (`false` = la pantalla de hoy).
//   2. La barra de las sub-rutas decide con la dirección EXACTA, nunca con
//      `includes`, y apagada no dibuja nada distinto.
//   3. Ni el carrito, ni el checkout, ni el precio, ni una ruta del servidor
//      leen el interruptor.
//   4. El buscador en una fila manda los MISMOS valores, sin duplicar controles.
//   5. Apagado, cada pantalla conserva literal su clase de hoy.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import fs from "fs";
import path from "path";
import CatalogoFilters from "@/components/catalogo/CatalogoFilters";
import { CATALOGOS_APPLE_2026_10_B, CHIP_V4, barraDeSubruta, precioAlAplicar, textoChipPrecio } from "@/lib/catalogo/catalogos-2026-10-b";
import { precioEnFiltro } from "@/lib/catalogo/filtros-extra";

const RAIZ = process.cwd();
const leer = (p: string) => fs.readFileSync(path.join(RAIZ, p), "utf8");
afterEach(() => cleanup());

function listar(dir: string): string[] {
  return fs.readdirSync(path.join(RAIZ, dir), { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === "__tests__" ? [] : listar(p);
    return /\.(ts|tsx)$/.test(e.name) ? [p] : [];
  });
}

describe("1 · los interruptores", () => {
  it("los seis están APAGADOS hasta el «sí» de Daniel", () => {
    expect(CATALOGOS_APPLE_2026_10_B).toEqual({
      buscadorEnUnaFila: false,
      catalogoPublico: false,
      revisarPedido: false,
      subpaginasInternas: false,
      administrar: false,
      tituloCelularChico: false,
    });
  });
});

describe("2 · la barra de las sub-rutas", () => {
  const rutas = { pedidosHref: "/catalogo/tommy/pedidos", catalogoHref: "/catalogo/tommy" };

  it("apagada, ninguna dirección cambia", () => {
    for (const p of ["/catalogo/tommy/pedidos", "/catalogo/tommy/pedido/abc", "/catalogo/tommy/checkout"]) {
      expect(barraDeSubruta(p, rutas, false)).toBeNull();
    }
  });

  it("prendida: el camino en Comprobantes, «← Comprobantes» en el detalle y «← Catálogo · Confirmar pedido» en Ver pedido", () => {
    expect(barraDeSubruta("/catalogo/tommy/pedidos", rutas, true)).toEqual({ tipo: "migas" });
    expect(barraDeSubruta("/catalogo/tommy/pedidos/", rutas, true)).toEqual({ tipo: "migas" });
    expect(barraDeSubruta("/catalogo/tommy/pedido/55b0", rutas, true)).toEqual({
      tipo: "volver", href: "/catalogo/tommy/pedidos", label: "Comprobantes",
    });
    expect(barraDeSubruta("/catalogo/tommy/checkout", rutas, true)).toEqual({
      tipo: "volver", href: "/catalogo/tommy", label: "Catálogo", titulo: "Confirmar pedido",
    });
  });

  it("prendida: el catálogo, la confirmación y cualquier otra dirección quedan como hoy", () => {
    for (const p of [
      "/catalogo/tommy", "/catalogo/tommy/confirmacion/55b0", "/catalogo/tommy/pedidos/extra",
      "/catalogo/tommy/pedido/55b0/mas", "/x/catalogo/tommy/pedidos", null, undefined, "",
    ]) {
      expect(barraDeSubruta(p, rutas, true), String(p)).toBeNull();
    }
  });
});

describe("3 · 🔴 nada del pedido ni del precio lee el interruptor", () => {
  it("ni el carrito, ni el checkout, ni el precio, ni la tarjeta", () => {
    for (const p of [
      "src/components/catalogo/CheckoutClient.tsx",
      "src/components/catalogo/CatalogoStickyCartBar.tsx",
      "src/components/catalogo/LineasPedidoEditables.tsx",
      "src/components/catalogo/CatalogoProductCard.tsx",
      "src/lib/catalogo/carrito.ts",
      "src/lib/catalogo/precio.ts",
    ]) {
      expect(leer(p), p).not.toContain("catalogos-2026-10-b");
    }
  });

  it("ninguna ruta del servidor lo lee", () => {
    const rutas = listar("src/app/api").filter((p) => leer(p).includes("CATALOGOS_APPLE_2026_10_B"));
    expect(rutas).toEqual([]);
  });

  it("el checkout recibe el título por PROP desde su página, no importa el interruptor", () => {
    expect(leer("src/app/catalogo/[marca]/checkout/page.tsx"))
      .toContain("tituloEnLaBarra={CATALOGOS_APPLE_2026_10_B.subpaginasInternas}");
  });
});

describe("4 · 🔴 el buscador en una fila manda lo mismo", () => {
  function montar(unaFila: boolean) {
    const cb = {
      onSearchChange: vi.fn(), onGenderChange: vi.fn(), onCategoryChange: vi.fn(),
      onSortByChange: vi.fn(), onClearAll: vi.fn(),
    };
    render(
      <CatalogoFilters
        marca="tommy"
        searchInput="EN0"
        gender="women"
        category=""
        sortBy="relevancia"
        filteredCount={420}
        genderOptions={[{ value: "women", label: "Women" }, { value: "men", label: "Men" }]}
        categoryOptions={[{ value: "sneakers", label: "Sneakers" }]}
        apple
        unaFila={unaFila}
        {...cb}
      />,
    );
    return cb;
  }

  for (const unaFila of [false, true]) {
    it(`unaFila=${unaFila}: buscar, ordenar y limpiar llaman igual, y la cantidad se ve`, () => {
      const cb = montar(unaFila);
      fireEvent.change(screen.getByPlaceholderText(/Buscar/), { target: { value: "ABC" } });
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "precio-asc" } });
      fireEvent.click(screen.getByText("Limpiar filtros"));
      expect(cb.onSearchChange).toHaveBeenCalledWith("ABC");
      expect(cb.onSortByChange).toHaveBeenCalledWith("precio-asc");
      expect(cb.onClearAll).toHaveBeenCalledTimes(1);
      expect(screen.getByText("420 productos")).toBeTruthy();
      expect(screen.getAllByRole("combobox")).toHaveLength(1);
      expect(screen.getAllByPlaceholderText(/Buscar/)).toHaveLength(1);
    });
  }

  it("v4: los filtros están A LA VISTA en una fila que se desliza, sin botón «Filtros»", () => {
    const { container } = render(
      <CatalogoFilters
        marca="tommy" searchInput="" gender="" category="" sortBy="relevancia" filteredCount={420}
        onSearchChange={vi.fn()} onGenderChange={vi.fn()} onCategoryChange={vi.fn()}
        onSortByChange={vi.fn()} onClearAll={vi.fn()}
        bultosFilter={false} onBultosFilterChange={vi.fn()}
        precio={{ desde: "", hasta: "" }} onPrecioChange={vi.fn()}
        genderOptions={[{ value: "women", label: "Women" }, { value: "men", label: "Men" }]}
        categoryOptions={[{ value: "sneakers", label: "Sneakers" }, { value: "boots", label: "Boots" }]}
        apple unaFila
      />,
    );
    const fila = container.querySelector("[data-fila-filtros]")!;
    expect(fila.className).toContain("overflow-x-auto");
    expect(screen.queryByRole("button", { name: /^Filtros/ })).toBeNull();
    // Bultos, Género, Categoría, Precio y el orden viven en la MISMA fila, sin
    // abrir nada, en el celular y en la computadora (sin píldoras de opciones).
    for (const t of ["2+ bultos", "Género", "Categoría", "Precio", "Relevancia"]) {
      expect(fila.textContent, t).toContain(t);
    }
    // Chip compacto: 36 de alto a la vista y 44 de toque.
    expect(CHIP_V4).toContain("h-9");
    expect(CHIP_V4).toContain("before:-inset-y-1");
    expect(screen.getByRole("combobox").closest("div[title]")!.className).toContain("h-9");
    expect(screen.queryByText("Women")).toBeNull(); // las opciones viven en el menú
  });

  it("v4: el chip dice lo elegido («Women ▾»), se resalta, y el menú trae «Todos» y ✓", () => {
    const onGenderChange = vi.fn();
    render(
      <CatalogoFilters
        marca="tommy" searchInput="" gender="women" category="" sortBy="relevancia" filteredCount={10}
        onSearchChange={vi.fn()} onGenderChange={onGenderChange} onCategoryChange={vi.fn()}
        onSortByChange={vi.fn()} onClearAll={vi.fn()}
        genderOptions={[{ value: "", label: "Todos" }, { value: "women", label: "Women" }, { value: "men", label: "Men" }]}
        apple unaFila
      />,
    );
    const chip = screen.getByRole("button", { name: "Women" });
    expect(chip.getAttribute("aria-haspopup")).toBe("listbox");
    fireEvent.click(chip);
    expect(screen.getByRole("option", { name: "Todos" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Women" }).getAttribute("aria-selected")).toBe("true");
    fireEvent.click(screen.getByRole("option", { name: "Men" }));
    expect(onGenderChange).toHaveBeenCalledWith("men");
  });
});

describe("5 · apagado = la pantalla de hoy, literal", () => {
  it("la barra del catálogo conserva su alto fijo y «← Inicio»", () => {
    const n = leer("src/components/catalogo/CatalogoNavbar.tsx");
    expect(n).toContain('"max-w-7xl mx-auto px-4 h-14 flex items-center gap-3 sm:gap-4 border-b border-gray-100"');
    expect(n).toContain('<Link href="/home" className={theme.navbar.inicioLink}>← Inicio</Link>');
  });
  it("Comprobantes conserva su camino y su título", () => {
    expect(leer("src/app/catalogo/[marca]/pedidos/RutaArriba.tsx"))
      .toContain('"flex flex-wrap items-center gap-1 px-6 py-1 text-xs text-gray-400"');
    expect(leer("src/components/catalogo/PedidosListClient.tsx")).toContain('"text-2xl font-light mb-6"');
  });
  it("el detalle conserva «← Volver a Comprobantes» y el checkout su encabezado", () => {
    expect(leer("src/components/catalogo/PedidoDetalleClient.tsx")).toContain("← Volver a {PANEL_COMPROBANTES}");
    expect(leer("src/components/catalogo/CheckoutClient.tsx")).toContain('<p className="text-sm text-gray-500">{cfg.label}</p>');
  });
  it("el catálogo público y «Revisar pedido» conservan su encabezado y su «Descargar PDF»", () => {
    expect(leer("src/components/catalogo/CatalogoPublicoPage.tsx")).toContain('<div className="-mt-3 mb-4 flex justify-end">');
    expect(leer("src/components/catalogo/RevisarPedidoPublico.tsx")).toContain('<p className="text-sm text-gray-500">{theme.label}</p>');
  });
  it("Administrar conserva su encabezado", () => {
    expect(leer("src/app/catalogos/admin/[marca]/AdminCatalogoClient.tsx")).toContain('"flex items-start justify-between gap-3 mb-6 flex-wrap"');
  });
});

describe("6 · 🔴 «Precio ▾» como chip filtra LO MISMO", () => {
  function montarPrecio(desde = "", hasta = "") {
    const onPrecioChange = vi.fn();
    render(
      <CatalogoFilters
        marca="tommy" searchInput="" gender="" category="" sortBy="relevancia" filteredCount={10}
        onSearchChange={vi.fn()} onGenderChange={vi.fn()} onCategoryChange={vi.fn()}
        onSortByChange={vi.fn()} onClearAll={vi.fn()}
        precio={{ desde, hasta }} onPrecioChange={onPrecioChange} preciosDisponibles={[20, 25, 34, 40]}
        apple unaFila
      />,
    );
    return onPrecioChange;
  }

  it("el par que manda es el MISMO que el filtro de antes, y `precioEnFiltro` decide igual", () => {
    // Antes: escribir 34 en «desde» llenaba «hasta» con 34 (el espejo).
    expect(precioAlAplicar({ desde: "34", hasta: "" })).toEqual({ desde: "34", hasta: "34" });
    expect(precioAlAplicar({ desde: " 20 ", hasta: "40" })).toEqual({ desde: "20", hasta: "40" });
    expect(precioAlAplicar({ desde: "", hasta: "40" })).toEqual({ desde: "", hasta: "40" });
    const precios = [19.99, 20, 25, 34, 40, 40.01, null];
    const pasa = (f: { desde: string; hasta: string }) => precios.map((p) => precioEnFiltro(p, f.desde, f.hasta));
    expect(pasa(precioAlAplicar({ desde: "34", hasta: "" }))).toEqual(pasa({ desde: "34", hasta: "34" }));
    expect(pasa(precioAlAplicar({ desde: "20", hasta: "40" }))).toEqual([false, true, true, true, true, false, true]);
  });

  it("el chip abre Desde/Hasta; «Aplicar» manda el par y «Limpiar» lo vacía", () => {
    const onPrecioChange = montarPrecio();
    fireEvent.click(screen.getByRole("button", { name: /^Precio/ }));
    fireEvent.change(screen.getByLabelText("Precio desde"), { target: { value: "20" } });
    fireEvent.change(screen.getByLabelText("Precio hasta"), { target: { value: "40" } });
    fireEvent.click(screen.getByText("Aplicar"));
    expect(onPrecioChange).toHaveBeenLastCalledWith({ desde: "20", hasta: "40" });
    fireEvent.click(screen.getByRole("button", { name: /^Precio/ }));
    fireEvent.click(screen.getByText("Limpiar"));
    expect(onPrecioChange).toHaveBeenLastCalledWith({ desde: "", hasta: "" });
  });

  it("con el filtro puesto el chip lo dice, y no queda la fila vieja «PRECIO desde/hasta»", () => {
    montarPrecio("20", "40");
    expect(screen.getByRole("button", { name: "$20–$40" })).toBeTruthy();
    expect(screen.queryByText("Quitar precio")).toBeNull();
    expect(screen.queryByLabelText("Precio desde")).toBeNull();
    expect(textoChipPrecio({ desde: "25", hasta: "25" })).toBe("$25");
    expect(textoChipPrecio({ desde: "17.5", hasta: "" })).toBe("Desde $17.50");
    expect(textoChipPrecio({ desde: "", hasta: "" })).toBeNull();
  });
});

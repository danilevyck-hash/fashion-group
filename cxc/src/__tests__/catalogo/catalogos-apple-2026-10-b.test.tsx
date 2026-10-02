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
import { CATALOGOS_APPLE_2026_10_B, barraDeSubruta } from "@/lib/catalogo/catalogos-2026-10-b";

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
  it("los cinco están APAGADOS hasta el «sí» de Daniel", () => {
    expect(CATALOGOS_APPLE_2026_10_B).toEqual({
      buscadorEnUnaFila: false,
      catalogoPublico: false,
      revisarPedido: false,
      subpaginasInternas: false,
      administrar: false,
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
      // En una fila, «Limpiar filtros» vive adentro de «Filtros».
      if (unaFila) fireEvent.click(screen.getByRole("button", { name: /Filtros/ }));
      fireEvent.click(screen.getByText("Limpiar filtros"));
      expect(cb.onSearchChange).toHaveBeenCalledWith("ABC");
      expect(cb.onSortByChange).toHaveBeenCalledWith("precio-asc");
      expect(cb.onClearAll).toHaveBeenCalledTimes(1);
      expect(screen.getByText("420 productos")).toBeTruthy();
      expect(screen.getAllByRole("combobox")).toHaveLength(1);
      expect(screen.getAllByPlaceholderText(/Buscar/)).toHaveLength(1);
    });
  }

  it("unaFila: «Filtros» y el orden miden 44 px y el botón dice cuántos filtros hay puestos", () => {
    montar(true);
    const filtros = screen.getByRole("button", { name: /Filtros/ });
    expect(filtros.className).toContain("h-11 w-11");
    expect(filtros.textContent).toContain("1");
    expect(screen.getByRole("combobox").closest("div[title]")!.className).toContain("h-11 w-11");
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

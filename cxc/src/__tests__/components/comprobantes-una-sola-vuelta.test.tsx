/**
 * ─────────────────────────────────────────────────────────────────────────────
 * CANDADO — UNA SOLA FORMA DE VOLVER, Y COMPLETA (22-sep-2026)
 *
 * En la captura de Comprobantes de Reebok del 19-sep-2026, en 100 píxeles de
 * alto convivían TRES formas de volver: «← Inicio» (la navbar), el camino de
 * migas «Inicio › Catálogos › Marcas › Reebok › Comprobantes», y «← Catálogo»
 * encima del título. Se queda el camino —dice dónde estás **y** deja saltar a
 * cualquier nivel—; las dos flechas se van.
 *
 * 🩸 SE COMPROBÓ A DÓNDE IBA CADA UNA: «← Inicio» a `/home` (el tramo
 * «Inicio») y «← Catálogo» a `theme.catalogoHref` (el tramo de la MARCA, y el
 * logo de la navbar, que ya es un enlace ahí). Ninguna llevaba a un sitio que
 * el camino no ofrezca. Este candado lo vuelve a comprobar en las 4 marcas.
 *
 * 🔴 Y COMO EL CAMINO PASA A SER LA ÚNICA SALIDA, TIENE QUE ESTAR COMPLETO EN
 * TODAS: Administrar y Categorías decían «Inicio › Catálogos» a secas.
 *
 * ⚠️ «← Inicio» NO se borra de la navbar: envuelve todas las sub-rutas del
 * catálogo (el catálogo, el checkout, el detalle, la confirmación) y ahí es la
 * única salida. Se esconde SOLO donde hay camino.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  hayCaminoDeMigas,
  migasDeAppHeader,
  tramosDeAdministrar,
  tramosDeCategorias,
  tramosDeComprobantes,
  TRAMO_ADMINISTRAR,
  TRAMO_CATEGORIAS,
} from "@/lib/catalogo/camino-de-migas";
import { getMarcaTheme, MARCAS_UI } from "@/lib/catalogo/marcas-ui";
import { PANEL_COMPROBANTES } from "@/lib/catalogo/numeros-pedido";

const RUTA = { actual: "/catalogo/reebok/pedidos" };
vi.mock("next/navigation", () => ({
  usePathname: () => RUTA.actual,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(""),
}));
vi.mock("@/lib/hooks/usePublicarAlturaEncabezado", () => ({
  usePublicarAlturaEncabezado: () => {},
}));

import CatalogoNavbar from "@/components/catalogo/CatalogoNavbar";
import RutaArriba from "@/app/catalogo/[marca]/pedidos/RutaArriba";

const leer = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

afterEach(() => {
  cleanup();
  RUTA.actual = "/catalogo/reebok/pedidos";
  sessionStorage.clear();
});

describe("🩸 lo que cada flecha hacía: nada que el camino no haga", () => {
  for (const marca of MARCAS_UI) {
    it(`en ${marca}, los destinos de las dos flechas están en el camino`, () => {
      const theme = getMarcaTheme(marca)!;
      const destinos = tramosDeComprobantes(marca).map((t) => t.href);
      // «← Inicio» iba a /home; «← Catálogo», al catálogo de la marca.
      expect(destinos).toContain("/home");
      expect(destinos).toContain(theme.catalogoHref);
    });
  }
});

describe("🔴 las dos flechas se fueron de la pantalla de Comprobantes", () => {
  it("la navbar NO dibuja «← Inicio» sobre /catalogo/<marca>/pedidos", () => {
    RUTA.actual = "/catalogo/reebok/pedidos";
    sessionStorage.setItem("cxc_role", "admin");
    render(<CatalogoNavbar marca="reebok" />);
    expect(screen.queryByText("← Inicio")).toBeNull();
  });

  it("⚠️ y SÍ la dibuja en el catálogo, el checkout y el detalle", () => {
    for (const ruta of [
      "/catalogo/reebok",
      "/catalogo/reebok/checkout",
      "/catalogo/reebok/pedido/abc",
      "/catalogo/reebok/confirmacion/abc",
      "/catalogo/reebok/productos",
    ]) {
      cleanup();
      RUTA.actual = ruta;
      sessionStorage.setItem("cxc_role", "admin");
      render(<CatalogoNavbar marca="reebok" />);
      expect(screen.queryByText("← Inicio"), `${ruta} se quedó sin salida`).not.toBeNull();
    }
  });

  it("«← Catálogo» ya no se escribe en ninguna parte de la pantalla", () => {
    const cliente = leer("src/components/catalogo/PedidosListClient.tsx")
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
    expect(cliente).not.toContain("← Catálogo");
  });

  it("CONTROL: el camino sigue dibujándose, con sus cinco tramos", () => {
    RUTA.actual = "/catalogo/reebok/pedidos";
    const { container } = render(<RutaArriba marca="reebok" />);
    const textos = Array.from(container.querySelectorAll("nav span, nav a")).map((e) =>
      (e.textContent ?? "").trim(),
    );
    for (const tramo of ["Inicio", "Catálogos", "Marcas", "Reebok", PANEL_COMPROBANTES]) {
      expect(textos, `falta el tramo ${tramo}`).toContain(tramo);
    }
  });
});

describe("🔴 `hayCaminoDeMigas` decide, y es exacta", () => {
  it("solo la lista de comprobantes de una marca", () => {
    expect(hayCaminoDeMigas("/catalogo/reebok/pedidos")).toBe(true);
    expect(hayCaminoDeMigas("/catalogo/joybees/pedidos/")).toBe(true);
    expect(hayCaminoDeMigas("/catalogo/tommy/pedidos")).toBe(true);
  });

  it("y nada más — ni el detalle, ni el checkout, ni una ruta parecida", () => {
    for (const ruta of [
      "/catalogo/reebok",
      "/catalogo/reebok/pedido/abc",
      "/catalogo/reebok/pedidos/abc",
      "/catalogo/reebok/checkout",
      "/catalogos/admin/reebok",
      "/pedidos",
      "",
      null,
    ]) {
      expect(hayCaminoDeMigas(ruta), `${ruta} no dibuja camino`).toBe(false);
    }
  });
});

describe("🔴 el camino está COMPLETO en las tres pantallas del módulo", () => {
  it("Comprobantes: Inicio › Catálogos › Marcas › <Marca> › Comprobantes", () => {
    expect(tramosDeComprobantes("reebok").map((t) => t.label)).toEqual([
      "Inicio", "Catálogos", "Marcas", "Reebok", PANEL_COMPROBANTES,
    ]);
  });

  it("Administrar: los mismos cuatro tramos y «Administrar» al final", () => {
    expect(tramosDeAdministrar("reebok").map((t) => t.label)).toEqual([
      "Inicio", "Catálogos", "Marcas", "Reebok", TRAMO_ADMINISTRAR,
    ]);
  });

  it("Categorías cuelga de Administrar, y se puede volver a él", () => {
    const tramos = tramosDeCategorias("reebok");
    expect(tramos.map((t) => t.label)).toEqual([
      "Inicio", "Catálogos", "Marcas", "Reebok", TRAMO_ADMINISTRAR, TRAMO_CATEGORIAS,
    ]);
    expect(tramos[4].href).toBe("/catalogos/admin/reebok");
  });

  it("🔴 en los tres, solo el ÚLTIMO tramo se queda sin a dónde ir", () => {
    for (const tramos of [
      tramosDeComprobantes("reebok"),
      tramosDeAdministrar("joybees"),
      tramosDeCategorias("reebok"),
    ]) {
      const sinHref = tramos.filter((t) => !t.href);
      expect(sinHref.length).toBe(1);
      expect(sinHref[0]).toBe(tramos[tramos.length - 1]);
    }
  });

  it("la marca sale del tema, no de un texto tecleado: sirve para las cuatro", () => {
    for (const marca of MARCAS_UI) {
      const theme = getMarcaTheme(marca)!;
      for (const tramos of [tramosDeComprobantes(marca), tramosDeAdministrar(marca)]) {
        expect(tramos[3].label, `la marca de ${marca}`).toBe(theme.label);
        expect(tramos[3].href, `el catálogo de ${marca}`).toBe(theme.catalogoHref);
      }
    }
  });

  it("🔴 las dos pantallas de administrar MONTAN el camino, no un `module` pelado", () => {
    const admin = leer("src/app/catalogos/admin/[marca]/AdminCatalogoClient.tsx");
    const categorias = leer("src/app/catalogos/admin/[marca]/categorias/CategoriasRubroClient.tsx");
    expect(admin).toContain("migasDeAppHeader(tramosDeAdministrar(marca)");
    expect(categorias).toContain('migasDeAppHeader(tramosDeCategorias("reebok")');
    // 🩸 Lo que había antes, y que dejaba el camino en «Inicio › Catálogos».
    for (const src of [admin, categorias]) {
      expect(src).not.toContain('<AppHeader module="Catálogos" />');
    }
  });

  it("🔑 `migasDeAppHeader` NO repite lo que AppHeader ya pone (Inicio y el módulo)", () => {
    const ir = vi.fn();
    const migas = migasDeAppHeader(tramosDeAdministrar("reebok"), ir);
    expect(migas.map((m) => m.label)).toEqual(["Marcas", "Reebok", TRAMO_ADMINISTRAR]);
    migas[0].onClick!();
    expect(ir).toHaveBeenCalledWith("/catalogos/marcas");
    // El último es donde estás: no lleva a ningún lado.
    expect(migas[migas.length - 1].onClick).toBeUndefined();
  });

  it("🔑 el último tramo de Comprobantes se DERIVA de PANEL_COMPROBANTES", () => {
    const src = leer("src/lib/catalogo/camino-de-migas.ts");
    expect(src).toContain("PANEL_COMPROBANTES");
    // Un cuarto nombre para este lugar es lo que Daniel arregló el 6-sep-2026.
    expect(src).not.toContain('label: "Pedidos"');
  });
});

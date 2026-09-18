// ─────────────────────────────────────────────────────────────────────────────
// CANDADO — CATÁLOGOS: `/catalogo` y `/catalogos` DEJAN DE DAR ERROR, Y LA
// PANTALLA DE COMPROBANTES DICE DÓNDE ESTÁS (17-sep-2026).
//
// Daniel, 6-sep-2026, textual: «entro a catalogo y sale /catalogos/marcas,
// después entro a pedidos y sale /catalogo/reebok/pedidos y si pongo /catalogo
// sale error» · «una sola ruta arriba: Inicio › Catálogos › Marcas › Reebok ›
// Pedidos».
//
// 🩸 Medido antes: no existían `src/app/catalogo/page.tsx` ni
// `src/app/catalogos/page.tsx`, y `next.config.js` no nombraba «catalogo» ni
// una vez. Y no era solo un enlace tecleado a mano: el breadcrumb del propio
// hub deriva el enlace del módulo del primer tramo de la dirección, así que
// tocar «Catálogos» arriba de /catalogos/marcas caía en el 404 de Next, en
// inglés.
//
// Lo que este candado exige:
//   1. Las DOS direcciones redirigen al hub, con fuente EXACTA y 307.
//   2. 🔴 NINGUNA dirección que hoy funciona deja de funcionar: los dos árboles
//      de rutas siguen enteros, y no hay un redirect que se coma
//      `/catalogo/<marca>` ni `/catalogos/admin/<marca>`.
//   3. La pantalla de comprobantes monta el camino completo, con los cuatro
//      primeros tramos enlazados y el último en texto plano.
//   4. 🔑 El último tramo se DERIVA de `PANEL_COMPROBANTES`: un cuarto nombre
//      para este lugar sería volver al problema que Daniel arregló ese mismo
//      día («todo Comprobantes, porque ahí también hay cotizaciones y
//      borradores»).
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import path from "path";
import { PANEL_COMPROBANTES } from "@/lib/catalogo/numeros-pedido";
import { getMarcaTheme, MARCAS_UI } from "@/lib/catalogo/marcas-ui";
import { tramosDeComprobantes } from "@/app/catalogo/[marca]/pedidos/RutaArriba";

const RAIZ = process.cwd();
const nextConfig = readFileSync(path.join(RAIZ, "next.config.js"), "utf8");
const bloqueRedirects = nextConfig.slice(
  nextConfig.indexOf("async redirects()"),
  nextConfig.indexOf("experimental:"),
);

describe("🔴 /catalogo y /catalogos llegan al hub", () => {
  it("las dos están, y las dos van a /catalogos/marcas", () => {
    expect(bloqueRedirects).toContain('{ source: "/catalogo", destination: "/catalogos/marcas"');
    expect(bloqueRedirects).toContain('{ source: "/catalogos", destination: "/catalogos/marcas"');
  });

  it("temporales (307), como todos los de este archivo", () => {
    for (const fuente of ['source: "/catalogo",', 'source: "/catalogos",']) {
      const linea = bloqueRedirects
        .split("\n")
        .find((l) => l.includes(fuente)) as string;
      expect(linea, `falta el redirect de ${fuente}`).toBeTruthy();
      expect(linea).toContain("permanent: false");
    }
  });

  it("la fuente es EXACTA: nada de comodines que se coman las marcas", () => {
    // Un `/catalogo/:path*` apagaría el catálogo con sesión entero.
    expect(bloqueRedirects).not.toContain('source: "/catalogo/');
    expect(bloqueRedirects).not.toContain('source: "/catalogos/');
    expect(bloqueRedirects).not.toMatch(/source:\s*"\/catalogos?\/?:/);
    expect(bloqueRedirects).not.toMatch(/source:\s*"\/catalogos?\*/);
  });
});

describe("🔴 ninguna dirección que hoy funciona deja de funcionar", () => {
  const vivas = [
    "src/app/catalogos/marcas/page.tsx",
    "src/app/catalogos/admin/[marca]/page.tsx",
    "src/app/catalogos/admin/[marca]/categorias/page.tsx",
    "src/app/catalogo/[marca]/page.tsx",
    "src/app/catalogo/[marca]/layout.tsx",
    "src/app/catalogo/[marca]/pedidos/page.tsx",
    "src/app/catalogo/[marca]/productos/page.tsx",
    "src/app/catalogo/[marca]/checkout/page.tsx",
    "src/app/catalogo/[marca]/pedido/page.tsx",
    "src/app/catalogo/[marca]/pedido/[id]/page.tsx",
    "src/app/catalogo/[marca]/confirmacion/[id]/page.tsx",
  ];
  for (const rel of vivas) {
    it(`${rel} sigue existiendo`, () => {
      expect(existsSync(path.join(RAIZ, rel))).toBe(true);
    });
  }

  it("las dos redirecciones NO crean páginas que tapen los dos árboles", () => {
    // Un page.tsx en `/catalogo` o `/catalogos` sería otra forma de hacerlo, y
    // bajaría una pantalla que no se necesita. Se hace en next.config.
    expect(existsSync(path.join(RAIZ, "src/app/catalogo/page.tsx"))).toBe(false);
    expect(existsSync(path.join(RAIZ, "src/app/catalogos/page.tsx"))).toBe(false);
  });
});

describe("🔴 la pantalla de comprobantes dice dónde estás", () => {
  it("monta el camino arriba de la lista", () => {
    const page = readFileSync(path.join(RAIZ, "src/app/catalogo/[marca]/pedidos/page.tsx"), "utf8");
    expect(page).toContain("<RutaArriba marca={theme.marca} />");
    expect(page).toContain("<PedidosListClient");
  });

  it("los cinco tramos, en orden, para Reebok", () => {
    expect(tramosDeComprobantes("reebok").map((t) => t.label)).toEqual([
      "Inicio",
      "Catálogos",
      "Marcas",
      "Reebok",
      PANEL_COMPROBANTES,
    ]);
  });

  it("los cuatro primeros llevan a algún lado; el último es donde estás", () => {
    const tramos = tramosDeComprobantes("reebok");
    expect(tramos.slice(0, 4).map((t) => t.href)).toEqual([
      "/home",
      "/catalogo",
      "/catalogos/marcas",
      "/catalogo/reebok",
    ]);
    expect(tramos[4].href).toBeUndefined();
  });

  it("la marca sale del tema, no de un texto tecleado: sirve para las cuatro", () => {
    for (const marca of MARCAS_UI) {
      const tramos = tramosDeComprobantes(marca);
      const theme = getMarcaTheme(marca)!;
      expect(tramos[3].label, `la marca de ${marca}`).toBe(theme.label);
      expect(tramos[3].href, `el catálogo de ${marca}`).toBe(theme.catalogoHref);
    }
  });

  it("🔑 el último tramo se DERIVA de PANEL_COMPROBANTES, no se teclea", () => {
    const src = readFileSync(
      path.join(RAIZ, "src/app/catalogo/[marca]/pedidos/RutaArriba.tsx"),
      "utf8",
    );
    expect(src).toContain("PANEL_COMPROBANTES");
    // Un cuarto nombre para este lugar es exactamente lo que Daniel arregló el
    // 6-sep-2026: «todo Comprobantes».
    expect(src).not.toContain('label: "Pedidos"');
  });
});

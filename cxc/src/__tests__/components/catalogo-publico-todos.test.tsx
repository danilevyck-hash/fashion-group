// ─────────────────────────────────────────────────────────────────────────────
// UN LINK PÚBLICO CON LOS CUATRO CATÁLOGOS — /catalogo-publico/todos (23-sep-2026)
//
// Daniel: «Créame un link para clientes para poder ver los 4 catálogos».
//
// Lo que este archivo impide:
//   1. Que la página deje de listar EXACTAMENTE las marcas del hub (las 4 de
//      `MARCAS_DEL_HUB`), en ese orden, cada una apuntando al link público de
//      su tema — nunca a una lista de URLs escrita a mano.
//   2. Que «todos» se vuelva una marca (rompería la ruta estática).
//   3. Que la ruta deje de ser pública: cuelga del prefijo `/catalogo-publico/`
//      del middleware; si alguien lo acorta o lo quita, el cliente cae al login.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import CatalogosPublicosPage, { metadata } from "@/app/catalogo-publico/todos/page";
import { URL_CATALOGOS_PUBLICOS } from "@/lib/catalogo/url-catalogos-publicos";
import { MARCAS_DEL_HUB } from "@/lib/catalogo/contadores";
import { getMarcaTheme } from "@/lib/catalogo/marcas-ui";

describe("/catalogo-publico/todos — un link con los cuatro catálogos", () => {
  const html = renderToStaticMarkup(<CatalogosPublicosPage />);

  it("lista las marcas del hub, en su orden, cada una con su link público", () => {
    const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
    const esperados = MARCAS_DEL_HUB.map((m) => getMarcaTheme(m)!.publicoShareUrl);
    expect(esperados).toHaveLength(4);
    expect(hrefs).toEqual(esperados);
  });

  it("cada tarjeta dice a qué marca lleva", () => {
    for (const m of MARCAS_DEL_HUB) {
      expect(html).toContain(`Ver catálogo ${getMarcaTheme(m)!.label}`);
    }
  });

  it("«todos» no es una marca: la ruta estática no choca con [marca]", () => {
    expect(getMarcaTheme("todos")).toBeNull();
  });

  it("el link que se comparte es el del dominio público, bajo el prefijo sin login", () => {
    expect(URL_CATALOGOS_PUBLICOS).toBe("https://www.fashiongr.com/catalogo-publico/todos");
    const middleware = readFileSync("src/middleware.ts", "utf8");
    expect(middleware).toContain('"/catalogo-publico/"');
    expect(new URL(URL_CATALOGOS_PUBLICOS).pathname.startsWith("/catalogo-publico/")).toBe(true);
  });

  it("la vista previa de WhatsApp dice qué es y tiene imagen", () => {
    expect(metadata.title).toBe("Catálogos Fashion Group");
    expect(metadata.openGraph?.url).toBe(URL_CATALOGOS_PUBLICOS);
    expect(JSON.stringify(metadata.openGraph?.images)).toContain("/logo.jpeg");
  });
});

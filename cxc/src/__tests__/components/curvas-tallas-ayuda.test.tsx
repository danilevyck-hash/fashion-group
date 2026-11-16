// Curvas de tallas por caja en el «?» de Catálogos (16-nov-2026, Daniel): cada
// catálogo de marca lleva SOLO su PDF; la lista de marcas, el completo; Joybees
// y el resto de las pantallas, ninguno.
import fs from "node:fs";
import path from "node:path";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import VideosAyuda from "@/components/VideosAyuda";
import { videosDeLaRuta } from "@/components/estructura/BotonComoSeUsa";
import { curvasDeLaRuta } from "@/lib/ui/curvas-tallas-2026-11";

vi.mock("next/navigation", () => ({ usePathname: () => "/catalogo/tommy" }));

describe("qué PDF sale en cada catálogo", () => {
  it.each([
    ["/catalogos/marcas", "/ayuda/curvas-tallas-calzado.pdf"],
    ["/catalogo/tommy", "/ayuda/curvas-tallas-tommy.pdf"],
    ["/catalogo/calvin", "/ayuda/curvas-tallas-calvin.pdf"],
    ["/catalogo/reebok", "/ayuda/curvas-tallas-reebok.pdf"],
  ])("%s → %s", (ruta, pdf) => {
    expect(curvasDeLaRuta(ruta)?.href).toBe(pdf);
    // El archivo existe de verdad en `public/`.
    expect(fs.existsSync(path.join(process.cwd(), "public", pdf))).toBe(true);
    // Y el «?» de esa dirección existe (videos de Catálogos).
    expect(videosDeLaRuta(ruta)).toBe("catalogos");
  });

  it.each(["/catalogo/joybees", "/catalogo/tommy/pedidos", "/catalogos/admin/tommy", "/cxc", "/home", null])(
    "%s → ninguno",
    (ruta) => expect(curvasDeLaRuta(ruta)).toBeNull(),
  );

  it("el nombre del archivo dice la marca", () => {
    expect(curvasDeLaRuta("/catalogo/calvin")?.nombre).toBe("Curvas de tallas por caja - Calvin Klein.pdf");
  });
});

describe("el renglón en la hoja del «?»", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (u: string) =>
        String(u).startsWith("/api/videos-ayuda")
          ? { ok: true, json: async () => ({ modulo: "Catálogos", formato: "computadora", conFormatoCelular: false, lista: [], completo: null }) }
          : { ok: true, blob: async () => new Blob(["%PDF"]) },
      ),
    );
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it("con PDF: «Curvas de tallas por caja» enlaza al de la marca", () => {
    render(<VideosAyuda modulo="catalogos" curvas={curvasDeLaRuta("/catalogo/reebok")} open onClose={() => {}} />);
    const enlace = screen.getByRole("link", { name: /Curvas de tallas por caja/ });
    expect(enlace.getAttribute("href")).toBe("/ayuda/curvas-tallas-reebok.pdf");
    expect(enlace.getAttribute("target")).toBe("_blank");
  });

  it("sin PDF no se dibuja", () => {
    render(<VideosAyuda modulo="catalogos" curvas={null} open onClose={() => {}} />);
    expect(screen.queryByRole("link", { name: /Curvas de tallas/ })).toBeNull();
  });
});

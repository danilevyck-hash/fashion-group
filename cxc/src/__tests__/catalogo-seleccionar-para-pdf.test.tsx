// Candado de «Seleccionar para PDF» (23-nov-2026, Daniel: «a. a.»).
// 1) Con selección, el PDF lleva SOLO los marcados y el subtítulo lo dice.
// 2) Sin selección, el PDF sale como siempre (todo lo filtrado).
// 3) Solo el catálogo INTERNO lo ofrece: el público del cliente no cambia.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";

const downloadCatalogPdf = vi.fn(async (_: unknown) => {});
vi.mock("@/lib/catalogo/catalog-pdf", () => ({ downloadCatalogPdf: (a: unknown) => downloadCatalogPdf(a) }));

import { useDescargarCatalogoPdf, SELECCIONAR_PARA_PDF_2026_11 } from "@/components/catalogo/useDescargarCatalogoPdf";
import { getMarcaTheme } from "@/lib/catalogo/marcas-ui";
import { PRECIO_VACIO } from "@/lib/catalogo/filtros-extra";
import type { CatalogoProducto } from "@/components/catalogo/types";

const theme = getMarcaTheme("reebok")!;
const prod = (id: string, sku: string) =>
  ({ id, sku, name: `N ${sku}`, price: 50, image_url: null, gender: "hombre", category: "calzado" }) as unknown as CatalogoProducto;
const filtered = [prod("a", "100277416"), prod("b", "100277421"), prod("c", "100277422")];

async function descargar(seleccion?: Set<string>) {
  const { result } = renderHook(() => useDescargarCatalogoPdf());
  await act(async () => {
    await result.current.descargar({
      marca: "reebok", theme, agrupado: false, filtered, sortedGroups: [], filteredCount: filtered.length,
      gender: "", category: "", search: "", bultosFilter: false, precio: PRECIO_VACIO, catLabel: {},
      avisar: () => {}, seleccion,
    });
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const a = downloadCatalogPdf.mock.calls.at(-1)![0] as any;
  const skus = a.sections.flatMap((s: { items: { sku: string }[] }) => s.items.map(i => i.sku));
  return { a, skus };
}

describe("Seleccionar para PDF", () => {
  beforeEach(() => downloadCatalogPdf.mockClear());

  it("el interruptor está prendido", () => expect(SELECCIONAR_PARA_PDF_2026_11).toBe(true));

  it("con selección: solo los marcados y el subtítulo dice cuántos", async () => {
    const { a, skus } = await descargar(new Set(["a", "c"]));
    expect(skus.sort()).toEqual(["100277416", "100277422"]);
    expect(a.totalCount).toBe(2);
    expect(a.subtitle).toBe("2 artículos seleccionados");
  });

  it("un solo marcado va en singular", async () => {
    const { a } = await descargar(new Set(["b"]));
    expect(a.subtitle).toBe("1 artículo seleccionado");
  });

  it("lo marcado que el filtro ya no muestra no sale", async () => {
    const { skus } = await descargar(new Set(["a", "fuera-del-filtro"]));
    expect(skus).toEqual(["100277416"]);
  });

  it("sin selección: el PDF de siempre, con todo lo filtrado", async () => {
    const { a, skus } = await descargar();
    expect(skus).toHaveLength(3);
    expect(a.subtitle).toBe("");
  });

  it("el catálogo público del cliente no ofrece seleccionar", () => {
    const dir = path.join(process.cwd(), "src/components/catalogo");
    expect(fs.readFileSync(path.join(dir, "CatalogoPublicoPage.tsx"), "utf8")).not.toMatch(/Seleccionar para PDF|seleccion:/);
    expect(fs.readFileSync(path.join(dir, "CatalogoVendedorPage.tsx"), "utf8")).toMatch(/Seleccionar para PDF/);
  });
});

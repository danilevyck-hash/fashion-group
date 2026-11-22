// Candado del distintivo «Nuevo» de Catálogos (22-nov-2026, Daniel):
// «Nuevo» = la PRIMERA llegada del código exacto de Switch cae en los últimos
// 30 días de Panamá. Una reposición NO es nuevo. 31 días tampoco.
import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { codigosNuevos, desdeNuevo, marcarNuevos, DIAS_NUEVO } from "@/lib/catalogo/distintivo-nuevo";
import { DISTINTIVO_NUEVO, filtroNuevo } from "@/lib/ui/catalogo-nuevo-2026-11";

const HOY = "2026-11-22";

describe("distintivo «Nuevo» — la regla", () => {
  it("prendido y con 30 días", () => {
    expect(DISTINTIVO_NUEVO).toBe(true);
    expect(DIAS_NUEVO).toBe(30);
    expect(desdeNuevo(HOY)).toBe("2026-10-23");
  });

  it("alguna llegada dentro de 30 días = bolita (el día 30 cuenta)", () => {
    const n = codigosNuevos([
      { codigo_articulo: "A", fecha: "2026-11-20" },
      { codigo_articulo: "B", fecha: "2026-10-23" }, // hace 30 días justos
    ], HOY);
    expect([...n].sort()).toEqual(["A", "B"]);
  });

  it("hace 31 días NO", () => {
    expect(codigosNuevos([{ codigo_articulo: "C", fecha: "2026-10-22" }], HOY).size).toBe(0);
  });

  it("una REPOSICIÓN reciente SÍ lleva bolita (Daniel, 22-nov-2026)", () => {
    const n = codigosNuevos([
      { codigo_articulo: "R", fecha: "2026-11-15" },
      { codigo_articulo: "R", fecha: "2024-03-01" },
    ], HOY);
    expect(n.has("R")).toBe(true);
  });

  it("el código es EXACTO (con color): otro color del mismo estilo no contagia", () => {
    const productos = marcarNuevos(
      [{ sku: "100262404" }, { sku: "100262405" }, { sku: null }],
      new Set(["100262404"]),
    );
    expect(productos.map((p) => p.nuevo)).toEqual([true, false, false]);
  });

  it("al navegador va solo el booleano: ninguna fecha", () => {
    const [p] = marcarNuevos([{ sku: "X", name: "N" }], new Set(["X"]));
    expect(Object.keys(p).sort()).toEqual(["name", "nuevo", "sku"]);
  });

  it("falla ABIERTA y se resuelve en el SERVIDOR, SOLO para el admin", () => {
    const lib = readFileSync("src/lib/catalogo/distintivo-nuevo.ts", "utf8");
    expect(lib).toMatch(/catch \(e\)/);
    const ruta = readFileSync("src/app/api/catalogo/[marca]/products/route.ts", "utf8");
    expect(ruta).toMatch(/getSession\(req\)\?\.role === "admin" \? conDistintivoNuevo\(/);
    expect(ruta.match(/conDistintivoNuevo\(/g)?.length).toBe(1);
    expect(ruta.match(/await conLlegadaSiEsAdmin\(req, cfg, /g)?.length).toBe(3);
  });
});

describe("filtro «Nuevo» — una opción más del filtro de siempre", () => {
  it("sin ningún nuevo en el catálogo, la opción no sale y no corta", () => {
    expect(filtroNuevo([{ nuevo: false }, {}], true)).toEqual({ hay: false, activo: false });
  });

  it("con al menos uno, sale; corta solo si está puesto", () => {
    expect(filtroNuevo([{ nuevo: true }], false)).toEqual({ hay: true, activo: false });
    expect(filtroNuevo([{ nuevo: true }], true)).toEqual({ hay: true, activo: true });
  });

  it("va en la URL (?llegada=1) del catálogo interno y SIN la palabra «Nuevo» a la vista", () => {
    const s = readFileSync("src/components/catalogo/CatalogoVendedorPage.tsx", "utf8");
    expect(s).toMatch(/params\.set\("llegada", "1"\)/);
    expect(s).toMatch(/onNuevoFilterChange=\{nuevo\.hay \? setNuevoFilter : undefined\}/);
    const cel = readFileSync("src/components/catalogo/FiltrarCelular.tsx", "utf8");
    expect(cel).toMatch(/titulo="Llegada reciente"/);
    expect(cel).not.toMatch(/etiqueta="Nuevo"/);
    const filtros = readFileSync("src/components/catalogo/CatalogoFilters.tsx", "utf8");
    expect(filtros.match(/aria-label="Llegada reciente"/g)?.length).toBe(2);
    expect(filtros).not.toMatch(/>\s*Nuevo\s*</);
    expect(filtros).not.toMatch(/texto: "Nuevo"/);
  });
});

// 🔴 Daniel, 22-nov-2026: «quita lo de nuevo, mejor deja una bolita para yo
// saber, que el cliente no lo sepa».
describe("el CLIENTE no lo sabe", () => {
  it("el catálogo público no manda el dato ni ofrece el filtro", () => {
    expect(readFileSync("src/lib/catalogo/catalogo-publico-server.ts", "utf8")).not.toMatch(/DistintivoNuevo|distintivo-nuevo/);
    const pub = readFileSync("src/components/catalogo/CatalogoPublicoPage.tsx", "utf8");
    expect(pub).not.toMatch(/nuevoFilter|filtroNuevo|"nuevo"/);
  });

  it("la tarjeta dibuja una bolita sin texto, solo con showStock (interno)", () => {
    for (const f of ["src/components/catalogo/CatalogoProductCard.tsx", "src/components/catalogo/CatalogoGroupedCard.tsx"]) {
      const s = readFileSync(f, "utf8");
      expect(s).toMatch(/\{showStock && [^\n]*nuevo/);
      expect(s).toMatch(/aria-label="Llegada reciente"/);
    }
  });

  it("el PDF del catálogo no lee el dato", () => {
    expect(readFileSync("src/lib/catalogo/catalog-pdf.ts", "utf8")).not.toMatch(/\.nuevo\b/);
  });
});

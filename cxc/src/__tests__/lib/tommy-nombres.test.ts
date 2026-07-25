// ─────────────────────────────────────────────────────────────────────────────
// Parser de nombres Tommy (lib/tommy-nombres.ts) — contra los 23 valores
// REALES de `descripcion` de fashion_shoes (medidos en switch_articulo_diario,
// 24-jul-2026). Los 18 con patrón "Género-Categoría" deben parsear a sus slugs
// y armar el name "{codigo} · {categoría} {género}"; los 5 de basura contable
// deben caer al fallback (category "otros", gender null) — y de todos modos el
// filtro marcaId=3 los deja fuera del catálogo.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi } from "vitest";
import {
  parseTommyDescripcion,
  buildTommyDerivedFields,
} from "@/lib/tommy-nombres";
import { isTommyArticulo, TOMMY_MARCA_ID } from "@/lib/switch-api/sync-catalogo-tommy";
import type { SwitchArticulo } from "@/lib/switch-api/client";

// sync-catalogo-tommy importa clients Supabase eager (el de la marca y, vía
// sync-log/cron-telemetry, el del proyecto principal); acá solo se testean sus
// funciones puras — se mockean para que el import no exija env.
vi.mock("@/lib/tommy-supabase-server", () => ({ tommyServer: {} }));
vi.mock("@/lib/supabase-server", () => ({ supabaseServer: {} }));

// Los 23 valores reales (frecuencia desc) + su parse esperado (null = basura).
const REALES: Array<[string, { genero: string; categoria: string } | null]> = [
  ["Women-Flip Flops", { genero: "women", categoria: "flip_flops" }],
  ["Men-Flip Flops", { genero: "men", categoria: "flip_flops" }],
  ["Men-Sneakers", { genero: "men", categoria: "sneakers" }],
  ["Women-Sneakers", { genero: "women", categoria: "sneakers" }],
  ["Women-Sandals", { genero: "women", categoria: "sandals" }],
  ["Boys-Flip Flops", { genero: "boys", categoria: "flip_flops" }],
  ["Girls-Flip Flops", { genero: "girls", categoria: "flip_flops" }],
  ["Boys-Sneakers", { genero: "boys", categoria: "sneakers" }],
  ["Girls-Sneakers", { genero: "girls", categoria: "sneakers" }],
  ["Boys-Sandals", { genero: "boys", categoria: "sandals" }],
  ["Girls-Sandals", { genero: "girls", categoria: "sandals" }],
  ["MERCANCIA DEFECTUOSA", null],
  ["Boys-Shoes", { genero: "boys", categoria: "shoes" }],
  ["Women-Shoes", { genero: "women", categoria: "shoes" }],
  ["Girls-Shoes", { genero: "girls", categoria: "shoes" }],
  ["THERMO", null],
  ["Men-Shoes", { genero: "men", categoria: "shoes" }],
  ["women-Sneakers", { genero: "women", categoria: "sneakers" }], // minúscula real
  ["DONACION PARA EL DIA DEL NIÑO", null],
  ["Boys-Boots", { genero: "boys", categoria: "boots" }],
  ["Mercancía Defectuosa", null],
  ["CALZADOS DEFECTUOSOS", null],
  ["RETENCION DE N/C", null],
];

describe("parseTommyDescripcion — 23 valores reales de fashion_shoes", () => {
  for (const [descripcion, esperado] of REALES) {
    it(`"${descripcion}" → ${esperado ? `${esperado.genero}/${esperado.categoria}` : "null (basura)"}`, () => {
      expect(parseTommyDescripcion(descripcion)).toEqual(esperado);
    });
  }

  it("tolera espacios sobrantes de Switch", () => {
    expect(parseTommyDescripcion("  Women-Flip Flops  ")).toEqual({
      genero: "women",
      categoria: "flip_flops",
    });
    expect(parseTommyDescripcion("Men - Sneakers")).toEqual({
      genero: "men",
      categoria: "sneakers",
    });
  });

  it("Slippers está en el mapa (categoría del maestro sin ventas aún)", () => {
    expect(parseTommyDescripcion("Women-Slippers")).toEqual({
      genero: "women",
      categoria: "slippers",
    });
  });

  it("null/vacío/sin guión → null", () => {
    expect(parseTommyDescripcion(null)).toBeNull();
    expect(parseTommyDescripcion(undefined)).toBeNull();
    expect(parseTommyDescripcion("")).toBeNull();
    expect(parseTommyDescripcion("Sneakers")).toBeNull();
    expect(parseTommyDescripcion("-Sneakers")).toBeNull();
  });
});

describe("buildTommyDerivedFields — name = la descripcion de Switch tal cual", () => {
  // 25-jul-2026: el nombre es la descripcion de Switch, SIN el código (que ya
  // sale en su píldora de SKU) y SIN traducir.
  it("name = '{Género}-{Categoría}' con el vocabulario de Switch", () => {
    expect(buildTommyDerivedFields("TH1234", "Women-Flip Flops")).toEqual({
      name: "Women-Flip Flops",
      category: "flip_flops",
      gender: "women",
    });
    expect(buildTommyDerivedFields("CHIPOTLA-973", "Men-Sneakers")).toEqual({
      name: "Men-Sneakers",
      category: "sneakers",
      gender: "men",
    });
    expect(buildTommyDerivedFields("A1", "Girls-Sandals")).toEqual({
      name: "Girls-Sandals",
      category: "sandals",
      gender: "girls",
    });
    expect(buildTommyDerivedFields("B2", "Boys-Boots")).toEqual({
      name: "Boys-Boots",
      category: "boots",
      gender: "boys",
    });
  });

  it("el código NUNCA entra al nombre (vive en la píldora de SKU)", () => {
    for (const cod of ["TH1234", "CHIPOTLA-973", "FM03971-OGY"]) {
      expect(buildTommyDerivedFields(cod, "Women-Slippers").name).not.toContain(cod);
    }
  });

  it("normaliza la capitalización de Switch ('women-Sneakers' es real)", () => {
    expect(buildTommyDerivedFields("X1", "women-Sneakers").name).toBe("Women-Sneakers");
    expect(buildTommyDerivedFields("X2", "  Men - Flip Flops  ").name).toBe("Men-Flip Flops");
  });

  it("fallback: descripcion no parseable → la descripcion cruda, otros, null", () => {
    expect(buildTommyDerivedFields("AJUSTE", "MERCANCIA DEFECTUOSA")).toEqual({
      name: "MERCANCIA DEFECTUOSA",
      category: "otros",
      gender: null,
    });
  });

  it("fallback: sin descripcion → solo el codigo", () => {
    expect(buildTommyDerivedFields("TH9", null)).toEqual({
      name: "TH9",
      category: "otros",
      gender: null,
    });
  });
});

// ── Filtro de inventario del sync: marcaId === 3 ─────────────────────────────
function articulo(over: Partial<SwitchArticulo>): SwitchArticulo {
  return {
    id: 1,
    codigo: "X",
    descripcion: "Women-Sneakers",
    codigoBarraId: 1,
    costo: "1",
    disponible: "1",
    precio: "10",
    talla: null,
    color: null,
    marcaId: null,
    proveedor: "IMPORTADORA",
    ...over,
  };
}

describe("isTommyArticulo — filtro marcaId=3 (decisión Daniel 24-jul-2026)", () => {
  it("marcaId 3 entra", () => {
    expect(TOMMY_MARCA_ID).toBe(3);
    expect(isTommyArticulo(articulo({ marcaId: 3 }))).toBe(true);
  });

  it("otras marcas / null (basura marketing-ajustes) NO entran", () => {
    expect(isTommyArticulo(articulo({ marcaId: 1 }))).toBe(false);
    expect(isTommyArticulo(articulo({ marcaId: null }))).toBe(false);
  });

  it("NO filtra por proveedor (656/656 mismo importador — no discrimina)", () => {
    expect(isTommyArticulo(articulo({ marcaId: 3, proveedor: "CUALQUIERA" }))).toBe(true);
    expect(isTommyArticulo(articulo({ marcaId: 3, proveedor: null }))).toBe(true);
  });
});

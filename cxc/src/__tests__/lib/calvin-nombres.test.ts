// ─────────────────────────────────────────────────────────────────────────────
// Parser de nombres Calvin (lib/calvin-nombres.ts) — contra los 13 valores
// REALES de `descripcion` de vistana con marcaId 8 (medidos con el barrido de
// /apiarticulos, 12-ago-2026: 616 artículos). Los 13 siguen el patrón
// "Género-Categoría" y deben parsear a sus slugs; la basura contable de vistana
// (que además el filtro marcaId=8 deja fuera) cae al fallback.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi } from "vitest";
import {
  parseCalvinDescripcion,
  buildCalvinDerivedFields,
} from "@/lib/calvin-nombres";
import { isCalvinArticulo, CALVIN_MARCA_ID } from "@/lib/switch-api/sync-catalogo-calvin";
import type { SwitchArticulo } from "@/lib/switch-api/client";

// sync-catalogo-calvin importa clients Supabase eager (el de la marca y, vía
// sync-log/cron-telemetry, el del proyecto principal); acá solo se testean sus
// funciones puras — se mockean para que el import no exija env.
vi.mock("@/lib/calvin-supabase-server", () => ({ calvinServer: {} }));
vi.mock("@/lib/supabase-server", () => ({ supabaseServer: {} }));

// Los 13 valores reales (frecuencia desc, 12-ago-2026) + su parse esperado.
const REALES: Array<[string, { genero: string; categoria: string }]> = [
  ["Women-Sneakers", { genero: "women", categoria: "sneakers" }],
  ["Women-Flip Flops", { genero: "women", categoria: "flip_flops" }],
  ["Men-Sneakers", { genero: "men", categoria: "sneakers" }],
  ["Women-Sandals", { genero: "women", categoria: "sandals" }],
  ["Men-Flip Flops", { genero: "men", categoria: "flip_flops" }],
  ["Boys-Sneakers", { genero: "boys", categoria: "sneakers" }],
  ["Girls-Sneakers", { genero: "girls", categoria: "sneakers" }],
  ["Men-Slippers", { genero: "men", categoria: "slippers" }],
  ["Boys-Flip Flops", { genero: "boys", categoria: "flip_flops" }],
  ["Girls-Flip Flops", { genero: "girls", categoria: "flip_flops" }],
  ["Women-Shoes", { genero: "women", categoria: "shoes" }],
  ["Men-Sandals", { genero: "men", categoria: "sandals" }],
  ["Girls-Sandals", { genero: "girls", categoria: "sandals" }],
];

describe("parseCalvinDescripcion — 13 valores reales de vistana marcaId 8", () => {
  for (const [descripcion, esperado] of REALES) {
    it(`"${descripcion}" → ${esperado.genero}/${esperado.categoria}`, () => {
      expect(parseCalvinDescripcion(descripcion)).toEqual(esperado);
    });
  }

  it("tolera espacios sobrantes y mayúsculas de Switch", () => {
    expect(parseCalvinDescripcion("  Women-Flip Flops  ")).toEqual({
      genero: "women",
      categoria: "flip_flops",
    });
    expect(parseCalvinDescripcion("women-Sneakers")).toEqual({
      genero: "women",
      categoria: "sneakers",
    });
    expect(parseCalvinDescripcion("Men - Sandals")).toEqual({
      genero: "men",
      categoria: "sandals",
    });
  });

  it("Boots está en el mapa (vocabulario PVH; sin unidades hoy)", () => {
    expect(parseCalvinDescripcion("Women-Boots")).toEqual({
      genero: "women",
      categoria: "boots",
    });
  });

  it("basura contable / sin guión / vacío → null", () => {
    expect(parseCalvinDescripcion(null)).toBeNull();
    expect(parseCalvinDescripcion(undefined)).toBeNull();
    expect(parseCalvinDescripcion("")).toBeNull();
    expect(parseCalvinDescripcion("Sneakers")).toBeNull();
    expect(parseCalvinDescripcion("MERCANCIA DEFECTUOSA")).toBeNull();
    expect(parseCalvinDescripcion("RETENCION DE N/C")).toBeNull();
  });
});

describe("buildCalvinDerivedFields — name = descripcion de Switch normalizada", () => {
  it("parseable: name '{Género}-{Categoría}', slugs en category/gender", () => {
    expect(buildCalvinDerivedFields("V3A8-80217-313", "Women-Sandals")).toEqual({
      name: "Women-Sandals",
      category: "sandals",
      gender: "women",
    });
    // capitalización normalizada — "women-Sneakers" no rompe la vista
    expect(buildCalvinDerivedFields("KCCEN2710", "women-Sneakers")).toEqual({
      name: "Women-Sneakers",
      category: "sneakers",
      gender: "women",
    });
  });

  it("el CÓDIGO nunca entra al nombre (vive en su píldora de SKU)", () => {
    const d = buildCalvinDerivedFields("KCMALEE115", "Men-Flip Flops");
    expect(d.name).not.toContain("KCMALEE115");
  });

  it("no parseable: fallback descripcion cruda / codigo, category 'otros'", () => {
    expect(buildCalvinDerivedFields("X1", "MERCANCIA DEFECTUOSA")).toEqual({
      name: "MERCANCIA DEFECTUOSA",
      category: "otros",
      gender: null,
    });
    expect(buildCalvinDerivedFields("X2", "")).toEqual({
      name: "X2",
      category: "otros",
      gender: null,
    });
  });
});

describe("isCalvinArticulo — el filtro es marcaId 8 amarrado a vistana", () => {
  const art = (marcaId: number): SwitchArticulo =>
    ({ marcaId, codigo: "X", descripcion: "Women-Sneakers" }) as unknown as SwitchArticulo;

  it("marcaId 8 (CK FOOTWEAR) entra", () => {
    expect(CALVIN_MARCA_ID).toBe(8);
    expect(isCalvinArticulo(art(8))).toBe(true);
  });

  it("las otras 12 marcas de vistana NO entran — incluido el 3, que en vistana es CK Legwear (no Tommy)", () => {
    for (const id of [2, 3, 4, 5, 6, 7, 9, 18, 19, 20, 23, 24]) {
      expect(isCalvinArticulo(art(id))).toBe(false);
    }
  });
});

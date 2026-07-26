// El catálogo público habla de DISPONIBILIDAD, no de existencia.
//
// Switch da dos números: saldo (existencia física) y disponible (saldo −
// apartado). Hasta jul-2026 TODO el flujo público leía existencia:
// `publicCatalog.cols` ni siquiera traía la columna disponibilidad, y en
// Joybees/Tommy la columna `stock` es un espejo exacto de existencia
// (el cron escribe `stock: existencia`).
//
// La VISIBILIDAD del producto (`esVisibleEnCatalogo`) sigue decidiéndose por
// existencia: eso es deliberado y este test no lo toca.

import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "fs";
import path from "path";

vi.mock("@/lib/tommy-supabase-server", () => ({ tommyServer: {} }));
vi.mock("@/lib/supabase-server", () => ({ supabaseServer: {} }));

import { MARCAS_CONFIG } from "@/lib/catalogo/marcas";
import { disponibleVendible, tieneDisponibilidadReal } from "@/lib/catalogos/disponible";

function src(rel: string): string {
  return readFileSync(path.join(process.cwd(), rel), "utf8");
}

const MARCAS = ["reebok", "joybees", "tommy"] as const;
const PUBLICO = src("src/components/catalogo/CatalogoPublicoPage.tsx");
const AGRUPADA = src("src/components/catalogo/CatalogoGroupedCard.tsx");
const CONFIRMAR = src("src/app/api/catalogo/[marca]/pedido-publico/[id]/confirmar/route.ts");

describe("disponibleVendible — regla única", () => {
  it("usa disponibilidad cuando existe, aunque sea menor que la existencia", () => {
    expect(disponibleVendible({ existencia: 30, disponibilidad: 12 })).toBe(12);
    expect(disponibleVendible({ existencia: 30, disponibilidad: 0 })).toBe(0);
    expect(disponibleVendible({ stock: 30, existencia: 30, disponibilidad: 4 })).toBe(4);
  });

  it("una disponibilidad negativa (sobre-apartado) se lee como 0, nunca como deuda", () => {
    expect(disponibleVendible({ existencia: 5, disponibilidad: -3 })).toBe(0);
  });

  it("sin disponibilidad cae a existencia, y luego a stock — nunca a 0", () => {
    // Un dato faltante no puede hacer desaparecer producto del catálogo.
    expect(disponibleVendible({ existencia: 30 })).toBe(30);
    expect(disponibleVendible({ existencia: null, stock: 18 })).toBe(18);
    expect(disponibleVendible({ disponibilidad: null, existencia: null, stock: null })).toBe(0);
  });

  it("Reebok: el fallback es la suma de inventory (que es existencia)", () => {
    // La fila del producto trae disponibilidad → gana ella.
    expect(disponibleVendible({ disponibilidad: 7 }, 30)).toBe(7);
    // Pre-sync, sin nada en la fila → la suma de inventory.
    expect(disponibleVendible({}, 30)).toBe(30);
  });

  it("distingue el dato real del fallback", () => {
    expect(tieneDisponibilidadReal({ disponibilidad: 0 })).toBe(true);
    expect(tieneDisponibilidadReal({ existencia: 30 })).toBe(false);
  });
});

describe("publicCatalog.cols — las 3 marcas traen disponibilidad", () => {
  it("cada marca pide disponibilidad en el payload público", () => {
    for (const m of MARCAS) {
      const cols = MARCAS_CONFIG[m].publicCatalog.cols.split(",").map((c) => c.trim());
      expect(cols, m).toContain("disponibilidad");
      // La existencia viaja también: es el fallback si el sync no corrió.
      expect(cols, m).toContain("existencia");
    }
  });

  it("el catálogo interno ya la traía — el público queda alineado con él", () => {
    for (const m of MARCAS) {
      expect(MARCAS_CONFIG[m].products.cols.split(",").map((c) => c.trim()), m)
        .toContain("disponibilidad");
    }
  });
});

describe("el flujo público decide con disponibilidad, no con existencia", () => {
  it("las 3 ramas del catálogo público pasan por la regla única", () => {
    expect(PUBLICO).toContain('from "@/lib/catalogos/disponible"');
    // Una llamada por rama: Joybees (agrupada), Reebok (inventory), Tommy (plana).
    expect(PUBLICO.split("disponibleVendible(").length - 1).toBe(3);
    // Nada de leer el espejo de existencia a mano.
    expect(PUBLICO).not.toContain("p.stock > 0");
    expect(PUBLICO).not.toContain("_stock: p.stock");
  });

  it('"Agotado" de la card agrupada sale de disponibilidad', () => {
    expect(AGRUPADA).toContain('from "@/lib/catalogos/disponible"');
    expect(AGRUPADA).toContain("disponibleVendible(v.product) === 0");
    expect(AGRUPADA).not.toContain("v.product.stock === 0");
  });

  it('el "Disponible ahora" del pedido confirmado también es disponibilidad', () => {
    // Decía "Disponible ahora" pero mostraba existencia: en Reebok la suma de
    // inventory.quantity y en Joybees/Tommy la columna stock.
    expect(CONFIRMAR).toContain('from "@/lib/catalogos/disponible"');
    expect(CONFIRMAR).toContain('select("id, existencia, disponibilidad")');
    expect(CONFIRMAR).toContain('select("id, stock, existencia, disponibilidad")');
    expect(CONFIRMAR).not.toContain('select("id, stock")');
  });
});

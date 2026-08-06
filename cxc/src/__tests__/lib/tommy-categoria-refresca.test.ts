// ─────────────────────────────────────────────────────────────────────────────
// La categoría de Tommy se REFRESCA en cada sync, no solo al crear el producto.
//
// 🩸 EL BUG (5-ago-2026). Daniel filtró "Sandals" en el catálogo Tommy y le
// salieron cinco productos que se llaman **"Women-Flip Flops"**.
//
// Causa: `category` se escribía SOLO en el INSERT. Cuando Switch cambiaba la
// descripción de un artículo, el sync refrescaba el `name` y dejaba la
// `category` congelada — y las dos quedaban contradiciéndose.
//
// Medido contra producción: **12 de 490 productos** descuadrados.
//   7  sandals   → flip_flops   (los que vio Daniel)
//   2  flip_flops → slippers
//   1  sneakers  → slippers
//   1  sneakers  → sandals
//   1  sneakers  → shoes
//
// Para Tommy la categoría NO es manual: se DERIVA de la misma descripción que
// el nombre. Refrescar una sin la otra hace que el filtro del catálogo mienta.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { buildTommyDerivedFields } from "@/lib/tommy-nombres";

const sync = readFileSync(
  path.join(process.cwd(), "src/lib/switch-api/sync-catalogo-tommy.ts"),
  "utf8",
);

describe("🔴 el parser siempre estuvo bien — el problema era no aplicarlo", () => {
  it('"Women-Flip Flops" da flip_flops, nunca sandals', () => {
    const d = buildTommyDerivedFields("FW0FW066260GY", "Women-Flip Flops");
    expect(d.category).toBe("flip_flops");
    expect(d.gender).toBe("women");
  });

  it('"Boys-Slippers" da slippers', () => {
    expect(buildTommyDerivedFields("T30547-800", "Boys-Slippers").category).toBe("slippers");
  });

  it('"Women-Sandals" sí da sandals', () => {
    expect(buildTommyDerivedFields("X", "Women-Sandals").category).toBe("sandals");
  });
});

describe("🔴 el UPDATE ahora refresca la categoría", () => {
  it("updateFields devuelve category y gender, no solo name", () => {
    expect(sync).toContain("const cat = { category: d.category, gender: d.gender, ...bultoDeSwitch(a) }");
  });

  it("⚠️ nombre_manual protege el NOMBRE, no la categoría", () => {
    // El admin edita el nombre; la categoría sigue siendo de Switch. Si
    // `nombre_manual` también congelara la categoría, volvería el bug para todo
    // producto renombrado a mano.
    expect(sync).toContain("existing.nombre_manual === true ? cat : { ...cat, name: d.name }");
  });

  it("el INSERT sigue poniendo las tres", () => {
    expect(sync).toContain("{ name: d.name, category: d.category, gender: d.gender, ...bultoDeSwitch(a) }");
  });
});

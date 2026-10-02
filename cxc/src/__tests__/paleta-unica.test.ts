// 🔴 UNA PALETA (Daniel aprobó el estándar el 2-oct-2026; regla en
// `docs/diseno.md` › «Detalles aprendidos»). Trinquete: las clases de color
// fuera de la paleta solo pueden BAJAR. Al limpiar un módulo, baja el techo.
import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { describe, it, expect } from "vitest";

const PROHIBIDA = /(?<![\w-])(?:[a-z-]+:)*(?:bg|text|border|ring|from|to|via|divide|outline|decoration|fill|stroke|accent)-(?:(?:stone|slate|zinc|neutral|teal|green|rose|sky|indigo|violet|purple|fuchsia|lime|yellow|cyan|orange|pink)-\d{2,3}|\[#[0-9a-fA-F]{3,8}\])/g;
// Excepciones: el mapa de acentos y lo que lleva colores de MARCA para el cliente externo.
const PERMITIDOS = ["lib/moduleColors.ts", "components/catalogo/", "app/catalogo/", "app/catalogo-publico/", "app/pedido-", "components/reebok/", "components/ui/Avatar.tsx"];
const TECHO = 1189; // 2-oct-2026, tras la fase 1 (avisos y modo oscuro) — solo baja.

function* archivos(dir: string): Generator<string> {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) { if (!/(__tests__|app\/api)$/.test(p)) yield* archivos(p); }
    else if (/\.tsx?$/.test(n) && !n.includes(".test.")) yield p;
  }
}

describe("paleta única", () => {
  it("las clases de color fuera de la paleta no crecen", () => {
    let total = 0;
    for (const raiz of ["src/app", "src/components"])
      for (const f of archivos(raiz)) {
        if (PERMITIDOS.some((x) => f.includes(x))) continue;
        total += (readFileSync(f, "utf8").match(PROHIBIDA) ?? []).length;
      }
    expect(total).toBeLessThanOrEqual(TECHO);
  });
});

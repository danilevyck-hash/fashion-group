// ─────────────────────────────────────────────────────────────────────────────
// La multiplicación bultos × piezas vive en UN solo lugar.
//
// 🩸 Daniel, textual: *"no quiero que arregles con parches, sino arreglos de
// raiz"*. Se lo ganó: el mismo bug se "arregló" dos veces y siguió vivo.
//
// `bultos × piezas_por_bulto` estaba escrita OCHO veces y cada copia iba a
// buscarse el multiplicador por su cuenta. `FM0FM05537YBS` marcado en 8 salió
// como TOM-003 con $456 (12 × $38) y `cantidad: "12.0000"` a Switch.
//
// La raíz no era ninguno de los ocho lugares: era que hubiera ocho. El test que
// más importa de este archivo es el ÚLTIMO — el barrido que pone el build en
// rojo si aparece una novena.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import path from "path";
import { resolverLineas, resumirPedido, resumirDesdeItems } from "@/lib/catalogo/lineas-pedido";
import { getBultoSize as tommyBulto } from "@/lib/tommy-bulto";

const raiz = process.cwd();
const bultoTommy = (c?: string | null, b?: number | null) => tommyBulto(c, b);

describe("🔴 el caso de TOM-003, resuelto en un solo lugar", () => {
  it("1 bulto de un estilo de 8 → 8 piezas y $304", () => {
    const [l] = resolverLineas(
      [{ product_id: "p1", sku: "FM0FM05537YBS", quantity: 1, unit_price: 38, bulto_pzas: 8 }],
      { bultoSize: bultoTommy },
    );
    expect(l.bulto_pzas).toBe(8);
    expect(l.piezas).toBe(8);
    expect(l.subtotal).toBe(304);
  });

  it("sin marcar sigue en 12 — el resto del catálogo no cambia", () => {
    const [l] = resolverLineas([{ product_id: "p1", quantity: 1, unit_price: 38 }], { bultoSize: bultoTommy });
    expect(l.piezas).toBe(12);
    expect(l.subtotal).toBe(456);
  });

  it("el resumen da lo que Daniel pidió ver en Telegram", () => {
    const r = resumirDesdeItems(
      [
        { product_id: "p1", quantity: 1, unit_price: 38, bulto_pzas: 8 },
        { product_id: "p2", quantity: 2, unit_price: 10 },
        { product_id: "p3", quantity: 1, unit_price: 5, bulto_pzas: 8 },
      ],
      { bultoSize: bultoTommy },
    );
    expect(r.referencias).toBe(3);
    expect(r.bultos).toBe(4);
    expect(r.piezas).toBe(8 + 24 + 8);
    expect(r.total).toBe(304 + 240 + 40);
  });
});

describe("🔴 de dónde sale cada dato", () => {
  it("lo que ya trae el item GANA sobre el mapa", () => {
    // Un pedido viejo, o un item ya enriquecido, tiene que seguir valiendo lo
    // que valía aunque el producto se haya re-marcado después.
    const [l] = resolverLineas([{ product_id: "p1", quantity: 1, unit_price: 10, bulto_pzas: 8 }], {
      bultoSize: bultoTommy,
      bultoPzasByProduct: new Map([["p1", 12]]),
    });
    expect(l.piezas).toBe(8);
  });

  it("si el item no lo trae, se usa el mapa", () => {
    const [l] = resolverLineas([{ product_id: "p1", quantity: 1, unit_price: 10 }], {
      bultoSize: bultoTommy,
      bultoPzasByProduct: new Map([["p1", 8]]),
    });
    expect(l.piezas).toBe(8);
  });

  it("sin item y sin mapa → el default de la marca", () => {
    const [l] = resolverLineas([{ product_id: "p9", quantity: 1, unit_price: 10 }], {
      bultoSize: bultoTommy,
      bultoPzasByProduct: new Map(),
    });
    expect(l.piezas).toBe(12);
  });

  it("la categoría respeta el fallback de la marca (Reebok lo necesita)", () => {
    const reebokish = (c?: string | null) => (c === "footwear" ? 12 : 6);
    const [l] = resolverLineas([{ product_id: "p1", quantity: 1, unit_price: 10 }], {
      bultoSize: reebokish,
      fallbackCategory: "footwear",
    });
    expect(l.piezas).toBe(12);
  });
});

describe("🔴 aritmética del dinero", () => {
  it("el total se redondea UNA vez, al final", () => {
    // Redondear cada línea arrastra el error. Tres de $0.005 no son $0.00.
    const r = resumirPedido(
      resolverLineas(
        [
          { product_id: "a", quantity: 1, unit_price: 0.005 },
          { product_id: "b", quantity: 1, unit_price: 0.005 },
          { product_id: "c", quantity: 1, unit_price: 0.005 },
        ],
        { bultoSize: () => 1 },
      ),
    );
    expect(r.total).toBe(0.02); // 0.015 → 0.02, no 0
  });

  it("cantidades basura no rompen el pedido", () => {
    const [l] = resolverLineas(
      [{ product_id: "p1", quantity: null, unit_price: "abc" as unknown as number }],
      { bultoSize: bultoTommy },
    );
    expect(l.piezas).toBe(0);
    expect(l.subtotal).toBe(0);
  });

  it("un pedido vacío da ceros, no NaN", () => {
    const r = resumirDesdeItems([], { bultoSize: bultoTommy });
    expect(r).toEqual({ referencias: 0, bultos: 0, piezas: 0, total: 0 });
  });

  it("dos líneas del MISMO producto cuentan como UNA referencia", () => {
    const r = resumirDesdeItems(
      [{ product_id: "p1", quantity: 1, unit_price: 1 }, { product_id: "p1", quantity: 2, unit_price: 1 }],
      { bultoSize: () => 1 },
    );
    expect(r.referencias).toBe(1);
    expect(r.bultos).toBe(3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// EL TEST QUE SOSTIENE TODO LO DE ARRIBA.
// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 nadie vuelve a multiplicar por su cuenta", () => {
  const DIRS = ["src/lib/catalogo", "src/app/api/catalogo", "src/components/catalogo"];
  const EXENTO = new Set(["lineas-pedido.ts"]);

  function archivos(dir: string): string[] {
    const abs = path.join(raiz, dir);
    const out: string[] = [];
    for (const e of readdirSync(abs)) {
      const p = path.join(abs, e);
      if (statSync(p).isDirectory()) out.push(...archivos(path.join(dir, e)));
      else if (/\.(ts|tsx)$/.test(e)) out.push(path.join(dir, e));
    }
    return out;
  }

  it("no queda ninguna multiplicación por el bulto fuera del resolvedor", () => {
    // Las formas REALES que tenía el bug, todas medidas en el repo:
    //   i.quantity * bultoSize(...)      · i.quantity * bs
    //   quantity * theme.bulto(...)      · quantity * cfg.bultoSize(...)
    const PATRON = /\b(quantity|bultos)\s*\*\s*(bs\b|bulto\b|[\w.]*[Bb]ulto(Size)?\s*\()/;
    const culpables: string[] = [];
    for (const dir of DIRS) {
      for (const rel of archivos(dir)) {
        if (EXENTO.has(path.basename(rel))) continue;
        const src = readFileSync(path.join(raiz, rel), "utf8");
        src.split("\n").forEach((linea, i) => {
          if (PATRON.test(linea)) culpables.push(`${rel}:${i + 1}  ${linea.trim().slice(0, 90)}`);
        });
      }
    }
    expect(culpables, `multiplican por el bulto fuera de lineas-pedido.ts:\n${culpables.join("\n")}`).toEqual([]);
  });

  it("⚠️ el barrido de verdad mira archivos (si no, pasaría en verde vacío)", () => {
    const total = DIRS.reduce((n, d) => n + archivos(d).length, 0);
    expect(total).toBeGreaterThan(40);
  });
});

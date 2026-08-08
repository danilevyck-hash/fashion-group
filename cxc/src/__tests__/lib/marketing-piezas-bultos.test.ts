// ============================================================================
// CANDADO — PIEZAS ≠ BULTOS en las entregas de mobiliario.
//
// La regla, dicha por Daniel: *"puedo mandar 30 norte colgador en 1 bulto. o
// 20 norte colgador en un bulto"*. El bulto es VARIABLE: no hay, y no debe
// haber, ninguna conversión entre piezas y bultos.
//
// Lo que este archivo defiende:
//   1. El comportamiento del módulo puro (`lib/marketing/piezas-bultos.ts`).
//   2. Que NADIE escriba una conversión piezas↔bultos en ningún lado.
//   3. Que la aritmética de stock de `inventario.ts` no toque `bultos`.
//
// Los puntos 2 y 3 son BARRIDOS ESTÁTICOS sobre el código fuente: si mañana
// alguien "mejora" el módulo multiplicando bultos por un factor, el build se
// pone rojo antes de que el stock se descuadre en producción.
// ============================================================================
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  bultosParaInput,
  normalizarBultos,
  normalizarPiezas,
  piezasParaStock,
  textoBultos,
  textoPiezasBultos,
  totalBultos,
} from "@/lib/marketing/piezas-bultos";

const RAIZ = path.resolve(__dirname, "../../..");
function leer(rel: string): string {
  return fs.readFileSync(path.join(RAIZ, rel), "utf8");
}

// ── 1. Comportamiento ───────────────────────────────────────────────────────

describe("normalizarPiezas", () => {
  it("entero positivo tal cual", () => {
    expect(normalizarPiezas(150)).toBe(150);
    expect(normalizarPiezas("30")).toBe(30);
  });
  it("trunca decimales — media pieza no existe", () => {
    expect(normalizarPiezas(3.9)).toBe(3);
  });
  it("basura y negativos caen a 0", () => {
    expect(normalizarPiezas(null)).toBe(0);
    expect(normalizarPiezas(undefined)).toBe(0);
    expect(normalizarPiezas("")).toBe(0);
    expect(normalizarPiezas("abc")).toBe(0);
    expect(normalizarPiezas(-5)).toBe(0);
    expect(normalizarPiezas(NaN)).toBe(0);
  });
});

describe("normalizarBultos", () => {
  it("'no se anotó' es null, NUNCA 0", () => {
    // Es la diferencia entre "viajó en cero bultos" (falso) y "no lo anoté".
    expect(normalizarBultos(null)).toBeNull();
    expect(normalizarBultos(undefined)).toBeNull();
    expect(normalizarBultos("")).toBeNull();
    expect(normalizarBultos("   ")).toBeNull();
    expect(normalizarBultos("abc")).toBeNull();
    expect(normalizarBultos(-1)).toBeNull();
  });
  it("el 0 EXPLÍCITO sí se conserva", () => {
    expect(normalizarBultos(0)).toBe(0);
    expect(normalizarBultos("0")).toBe(0);
  });
  it("entero positivo tal cual", () => {
    expect(normalizarBultos(5)).toBe(5);
    expect(normalizarBultos("12")).toBe(12);
  });
});

describe("piezasParaStock — 🔴 lo único que puede mover el inventario", () => {
  it("devuelve PIEZAS aunque tenga los bultos delante", () => {
    // El caso textual de Daniel: 30 colgadores en 1 bulto salen 30 del stock.
    expect(piezasParaStock({ piezas: 30, bultos: 1 })).toBe(30);
    // …y 20 en 1 bulto salen 20. El bulto no cambió; las piezas sí.
    expect(piezasParaStock({ piezas: 20, bultos: 1 })).toBe(20);
  });
  it("el mismo número de bultos con distintas piezas da distinto stock", () => {
    const a = piezasParaStock({ piezas: 150, bultos: 5 });
    const b = piezasParaStock({ piezas: 40, bultos: 5 });
    expect(a).toBe(150);
    expect(b).toBe(40);
    expect(a).not.toBe(b);
  });
  it("sin bultos anotados descuenta igual", () => {
    expect(piezasParaStock({ piezas: 150 })).toBe(150);
    expect(piezasParaStock({ piezas: 150, bultos: null })).toBe(150);
  });
  it("NUNCA devuelve el número de bultos", () => {
    expect(piezasParaStock({ piezas: 150, bultos: 5 })).not.toBe(5);
    expect(piezasParaStock({ piezas: 0, bultos: 5 })).toBe(0);
  });
});

describe("textoPiezasBultos — cómo lo lee la gente", () => {
  it("el formato que escribió Daniel", () => {
    expect(textoPiezasBultos(150, 5)).toBe("150 piezas en 5 bultos");
  });
  it("sin bultos anotados no inventa un 'en 0 bultos'", () => {
    expect(textoPiezasBultos(150, null)).toBe("150 piezas");
    expect(textoPiezasBultos(150)).toBe("150 piezas");
    expect(textoPiezasBultos(150, null)).not.toContain("bulto");
  });
  it("singular donde corresponde", () => {
    expect(textoPiezasBultos(1, 1)).toBe("1 pieza en 1 bulto");
    expect(textoPiezasBultos(30, 1)).toBe("30 piezas en 1 bulto");
  });
  it("un 0 de bultos escrito a mano sí se dice", () => {
    expect(textoPiezasBultos(10, 0)).toBe("10 piezas en 0 bultos");
  });
});

describe("textoBultos / bultosParaInput", () => {
  it("sin dato → celda e input VACÍOS, no '0'", () => {
    expect(textoBultos(null)).toBe("");
    expect(textoBultos(undefined)).toBe("");
    expect(bultosParaInput(null)).toBe("");
  });
  it("con dato → el número", () => {
    expect(textoBultos(5)).toBe("5");
    expect(bultosParaInput(5)).toBe("5");
    expect(textoBultos(0)).toBe("0");
  });
});

describe("totalBultos — total de TRANSPORTE, no de mercancía", () => {
  it("suma sólo lo anotado", () => {
    expect(totalBultos([{ bultos: 5 }, { bultos: 2 }, { bultos: null }])).toBe(7);
  });
  it("si nadie anotó nada devuelve null (no 0)", () => {
    expect(totalBultos([{ bultos: null }, {}])).toBeNull();
    expect(totalBultos([])).toBeNull();
  });
});

// ── 2. Barrido estático: nadie convierte piezas ↔ bultos ────────────────────

describe("BARRIDO — no existe ninguna conversión piezas ↔ bultos", () => {
  const ARCHIVOS = [
    "src/lib/marketing/piezas-bultos.ts",
    "src/lib/marketing/inventario.ts",
    "src/lib/marketing/entrega-comprobante.ts",
    "src/lib/marketing/pdf-entrega-mueble.ts",
    "src/components/marketing/EntregaForm.tsx",
    "src/app/marketing/components/EntregasSection.tsx",
  ];

  it("no hay 'piezas por bulto' ni un factor de conversión", () => {
    const prohibido =
      /(piezas?\s*(por|\/|\*)\s*bulto|bultos?\s*(\*|×)\s*\w*(pieza|unidad|cantidad)|PIEZAS_POR_BULTO|piezasDeBultos|bultosAPiezas|piezasABultos)/i;
    for (const rel of ARCHIVOS) {
      const src = leer(rel);
      // El encabezado del módulo puro dice "piezas por bulto" para PROHIBIRLO;
      // se compara sólo el código, sin comentarios.
      const codigo = src
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(^|[^:])\/\/.*$/gm, "$1");
      expect(
        prohibido.test(codigo),
        `${rel} parece convertir piezas y bultos — no existe esa conversión`,
      ).toBe(false);
    }
  });
});

// ── 3. Barrido estático: el stock no se calcula con bultos ──────────────────

describe("BARRIDO — la aritmética de stock de inventario.ts no toca bultos", () => {
  const src = leer("src/lib/marketing/inventario.ts");

  it("`ajustarStock` se alimenta de piezas, nunca de un campo bultos", () => {
    // Se aísla el cuerpo de cada llamada a ajustarStock y el mapa que la
    // alimenta: ninguna de esas líneas puede nombrar `bultos` como sumando.
    const lineas = src.split("\n");
    const sospechosas = lineas.filter((l) => {
      const limpia = l.replace(/\/\/.*$/, "");
      if (!/stockDelta|delta\.set|sumaNew\.set|ajustarStock\(/.test(limpia)) {
        return false;
      }
      return /bultos/.test(limpia);
    });
    expect(
      sospechosas,
      "una línea de stock nombra `bultos`: el inventario se descuenta en PIEZAS",
    ).toEqual([]);
  });

  it("el descuento pasa por `piezasParaStock`, no por un Number() suelto", () => {
    expect(src).toContain("piezasParaStock");
    // Y el módulo declara de dónde sale la regla.
    expect(src).toContain("piezas-bultos");
  });

  it("`bultos` sí se persiste (si no, el dato se perdería)", () => {
    expect(src).toContain("bultos: itemsUnidades[i].bultos");
  });
});

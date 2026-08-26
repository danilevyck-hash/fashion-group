/**
 * Depurador › Fórmulas por marca en el iPhone (26-ago-2026).
 *
 * 🩸 LO QUE PASÓ. Daniel entró desde el iPhone y mandó la captura: cada fórmula
 * era una fila con «▸M» donde iba el nombre de la marca, y pedazos sueltos de
 * texto ("da", "od", "an") entre los campos. No se sabía de qué marca era cada
 * renglón.
 *
 * LA CAUSA, con números. La fila era la grilla de escritorio
 * `grid-cols-[minmax(0,1fr)_64px_50px_90px_96px]`: 300 px de columnas fijas +
 * 32 de gaps + 28 de relleno = 360 px de los 390 del iPhone. Al nombre le
 * quedaban 30 — y como la tarjeta lleva `overflow-hidden`, la columna del
 * `minmax(0,1fr)` se aplastaba a **0 px**.
 *
 * MEDIDO (navegador real, cookie firmada, datos de producción,
 * `scripts/_barrido-iphone-todo.mjs`), textos cortados en la pantalla:
 *
 *            390    834   1440
 *   ANTES     33     26      0     ← el nombre de la marca con 0 px de caja a
 *   DESPUÉS    0      0      0       390 y 12-22 px (11-16 %) a 834
 *
 * 🩸 POR QUÉ NINGUNA DE LAS DOS VUELTAS ANTERIORES (#297-318) LO VIO: aquellos
 * censos medían ARRASTRE y TOCABLES. Un `truncate` dentro de un
 * `overflow-hidden` no pide un solo píxel de arrastre — la pantalla daba 0 y
 * pasaba por sana mientras borraba el dato más importante de cada fila. Por eso
 * el barrido nuevo mide TEXTO CORTADO como defecto de primera clase.
 *
 * Este archivo congela la CAUSA (jsdom no calcula layout). La medición vive en
 * el script y en el PR.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const leer = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8");
const FORMULAS = "src/app/productos/cargar/FormulasConfig.tsx";
const src = leer(FORMULAS);

describe("Fórmulas por marca — tarjeta hasta lg, grilla desde lg", () => {
  it("las dos vistas están marcadas con un atributo FIJO, no con la clase del breakpoint", () => {
    // Igual que en Guías: `data-layout` no depende de dónde esté el corte, así
    // que mover el corte no deja al candado buscando un selector que ya no existe.
    expect(src).toContain('data-layout="tarjetas"');
    expect(src).toContain('data-layout="fila"');
  });

  it("la grilla de 5 columnas SOLO existe desde lg", () => {
    // Se leen las CLASES, no el archivo entero: el comentario de cabecera
    // también nombra la grilla y contarlo como marcado daba un falso positivo.
    const clases = [
      ...(src.match(/className="[^"]*"/g) ?? []),
      ...(src.match(/className=\{`[^`]*`/g) ?? []),
    ].filter((c) => c.includes("grid-cols-[minmax(0,1fr)_64px_50px_90px_96px]"));
    expect(clases.length).toBe(3); // marca, encabezado de columnas y descripción
    for (const c of clases) {
      expect(c).toContain("hidden");   // arranca oculta
      expect(c).toContain("lg:grid");  // y aparece recién en lg
      expect(c).not.toMatch(/(^|\s)grid\s/); // nunca `grid` a secas: eso la ponía en 390
    }
  });

  it("el corte NO puede volver a sm/md", () => {
    // A 390 las cuatro columnas fijas (64+50+90+96 = 300) más los gaps (32) y
    // el relleno (28) son 360 de 390: al nombre le quedan 30 px — y como la
    // tarjeta lleva `overflow-hidden`, la columna del `minmax(0,1fr)` se
    // aplasta a 0. MEDIDO: 0 px de caja para nombres que piden 88-135.
    expect(390 - (64 + 50 + 90 + 96) - 4 * 8 - 28).toBeLessThan(90);
    // A 834 la cuenta cruda daría 250 px libres, pero el nombre comparte esa
    // columna con la chapita ("27 desc · todas heredan", ~110 px) y con el
    // rótulo MARCA: (~56 px). MEDIDO a 834: 12-22 px de caja, 11-16 % del
    // texto. Por eso el corte es `lg` y no `md`.
    expect(src).not.toContain("md:grid-cols-[minmax(0,1fr)_64px_50px_90px_96px]");
    expect(src).not.toContain("sm:grid-cols-[minmax(0,1fr)_64px_50px_90px_96px]");
    expect(src).not.toContain('data-layout="tarjetas" className="md:hidden');
    expect(src).not.toContain('data-layout="tarjetas" className="sm:hidden');
  });

  it("en la tarjeta el nombre de la marca ENVUELVE — no se trunca ni se recorta", () => {
    const tarjeta = src.slice(src.indexOf('data-layout="tarjetas" className="px-3.5 py-3 lg:hidden"'));
    const bloque = tarjeta.slice(0, tarjeta.indexOf('data-layout="fila"'));
    expect(bloque).toContain("break-words");
    expect(bloque).toContain("{row.marca}");
    expect(bloque).not.toContain("truncate");
  });

  it("cada campo de la tarjeta lleva su etiqueta (etiqueta + dato)", () => {
    for (const etiqueta of ["Divisor", "Extra", "Redondeo", "Marca", "Empresa"]) {
      expect(src).toContain(`<Campo label="${etiqueta}">`);
    }
  });

  it("la descripción también es tarjeta en angosto, con su nombre completo", () => {
    const i = src.indexOf("function DescFila(");
    expect(i).toBeGreaterThan(0);
    const desc = src.slice(i);
    expect(desc).toContain('data-layout="tarjetas"');
    expect(desc).toContain('data-layout="fila"');
    expect(desc.slice(desc.indexOf('data-layout="tarjetas"'), desc.indexOf('data-layout="fila"'))).toContain("break-words");
  });
});

describe("Lo que ya estaba bien no se rompió", () => {
  it("los controles siguen pidiendo 44 px de alto (era la PEOR pestaña en área táctil)", () => {
    const selCls = src.slice(src.indexOf("const selCls"), src.indexOf("\n", src.indexOf("const selCls")));
    const numCls = src.slice(src.indexOf("const numCls"), src.indexOf("\n", src.indexOf("const numCls")));
    expect(selCls).toContain("min-h-[44px]");
    expect(numCls).toContain("min-h-[44px]");
  });

  it("el botón de guardar sigue siendo 44×44", () => {
    const save = src.slice(src.indexOf("function SaveBtn"));
    expect(save).toContain("min-h-[44px]");
    expect(save).toContain("min-w-[44px]");
  });

  it("los tres controles se escriben UNA vez y se reusan en los cuatro lugares", () => {
    // El divisor/extra/redondeo estaban copiados cuatro veces; con dos layouts
    // serían ocho copias y la próxima corrección se aplicaría a la mitad.
    for (const comp of ["DivisorInput", "ExtraSelect", "RedondeoSelect"]) {
      expect((src.match(new RegExp(`function ${comp}\\(`, "g")) ?? []).length).toBe(1);
    }
  });

  it("las chapitas de la tarjeta llegan a 12 px (a 9 y 10 px no se leen en un teléfono)", () => {
    // En escritorio se quedan chicas a propósito: `lg:text-[9px]` / `lg:text-[10px]`.
    for (const chapa of ["precio fijo", "propia"]) {
      const i = src.indexOf(`>${chapa}<`);
      expect(i, chapa).toBeGreaterThan(0);
      const ini = src.lastIndexOf("<span", i);
      const marca = src.slice(ini, i);
      expect(marca, chapa).toContain("text-[12px]");
      expect(marca, chapa).toMatch(/lg:text-\[(9|10)px\]/);
    }
  });

  it("las etiquetas visibles no cambiaron", () => {
    for (const t of ["+ Agregar marca", "Cómo funcionan las fórmulas", "Nuevas marcas", "Precio fijo", "Fórmula", "Entero"]) {
      expect(src, t).toContain(t);
    }
  });
});

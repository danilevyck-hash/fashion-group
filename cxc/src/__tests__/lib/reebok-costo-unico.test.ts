/* ─────────────────────────────────────────────────────────────────────────────
 * UN SOLO COSTO POR PRODUCTO — Reebok (14-sep-2026).
 *
 * Daniel, textual: «que el pedido use el mismo costo que Switch. Un solo costo
 * por producto».
 *
 * 🩸 EL DEFECTO. El mismo Excel del proveedor producía DOS costos para el mismo
 * artículo según qué archivo se bajara: la Plantilla de Switch usaba `fobReebok`
 * —0.80 en footwear, 0.70 en ropa y accesorios, y el «WholesalePrice OFF» del
 * proveedor cuando viene con valor— y el Pedido para cliente tenía su propio
 * `× 0.80` escrito a mano, que ignoraba las dos reglas.
 *
 * 🔴 ESTO MUEVE PRECIOS QUE SE LE DAN A CLIENTES. El costo del pedido es de
 * donde salen el Precio A y el Precio B, que es lo que el cliente ve. Medido
 * sobre el archivo real (`RBK FW26 - ACTIVE SEPTIEMBRE.xlsx`, 526 artículos):
 * **207 salían con un costo distinto en cada archivo** y **135 con un precio
 * distinto** — todos por ENCIMA del real, porque a la ropa se le aplicaba 0.80
 * donde correspondía 0.70.
 *
 * Lo que este candado protege, y por qué cada cosa:
 *   1. Las DOS salidas dicen el MISMO costo, en las tres ramas (zapato · ropa ·
 *      con descuento del proveedor). Es la regla que Daniel aprobó.
 *   2. La regla se LLAMA, no se copia: `costoReebok` es la única fuente. Copiarla
 *      es exactamente cómo nacieron los dos costos.
 *   3. Barrido: en la salida A no puede volver a aparecer un multiplicador de
 *      costo escrito a mano.
 *   4. CONTROL: el calzado sin descuento —que es donde las dos cuentas ya
 *      coincidían— sigue valiendo lo mismo que antes del arreglo.
 * ────────────────────────────────────────────────────────────────────────── */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  costoReebok,
  fobReebok,
  buildCatalogo,
  buildSwitchRows,
  REEBOK_FORMULA_A_DEFAULT,
  REEBOK_FORMULA_B_DEFAULT,
} from "@/lib/depurador/reebok";
import type { ReebokItem } from "@/lib/depurador/reebok";

const RAIZ = join(__dirname, "..", "..", "..");
const leer = (rel: string) => readFileSync(join(RAIZ, rel), "utf8");

const item = (p: Partial<ReebokItem>): ReebokItem => ({
  po: "PO-1", newArticle: "X", sku: "X0", name: "ARTÍCULO", department: "FOOTWEAR",
  category: "SHOES", ageGroup: "ADULT", colorName: "WHITE", gender: "Male", sellIn: "SI",
  wholesale: 10, wholesaleOff: null, talla: "9", piezas: 6, ...p,
});

/** Las TRES ramas del costo, una por caso. Números tomados del archivo real. */
const ZAPATO = item({
  newArticle: "100273049", name: "ENERGEN TECH PLUS 3", department: "FOOTWEAR",
  category: "SHOES", wholesale: 35.33,
});
const ROPA = item({
  newArticle: "APPTR1237", name: "URBOD TECH PANT", department: "APPAREL",
  category: "APPAREL", gender: "Female", talla: "M", wholesale: 32.8,
});
const CON_DESCUENTO = item({
  newArticle: "100075436", name: "ACTIVE FOUNDATION BAG", department: "HARDWARE",
  category: "BAGS", gender: "Unisex", talla: "U", wholesale: 22.33, wholesaleOff: 19.5,
});
const TODOS = [ZAPATO, ROPA, CON_DESCUENTO];

const costoDelPedido = (items: ReebokItem[], flete?: number) =>
  new Map(
    buildCatalogo(items, {
      formulaA: REEBOK_FORMULA_A_DEFAULT, formulaB: REEBOK_FORMULA_B_DEFAULT, flete,
    }).map((r) => [r.newArticle, r.costo]),
  );

const cifDeLaPlantilla = (items: ReebokItem[], flete?: number) =>
  new Map(
    buildSwitchRows(items, {
      formula: REEBOK_FORMULA_A_DEFAULT, temporada: "2026-09", tasa: "07", flete,
    }).map((r) => [String(r.cols["Código *"]), r.cols["Costo CIF *"]]),
  );

describe("🔴 Un solo costo por producto: el pedido dice lo mismo que la plantilla", () => {
  it("el zapato (80% del mayorista) vale lo mismo en las dos salidas", () => {
    // 35.33 × 0.80 = 28.26 → × 1.10 = 31.09
    expect(costoReebok("FOOTWEAR", 35.33, null, undefined)).toEqual({ fob: 28.26, cif: 31.09 });
    expect(costoDelPedido([ZAPATO]).get("100273049")).toBe(31.09);
    expect(cifDeLaPlantilla([ZAPATO]).get("100273049")).toBe(31.09);
  });

  it("🩸 la ropa es el 70%, también en el pedido — acá estaba el defecto", () => {
    // 32.80 × 0.70 = 22.96 → × 1.10 = 25.26. Antes el pedido decía 28.86 (× 0.80).
    expect(costoReebok("APPAREL", 32.8, null, undefined)).toEqual({ fob: 22.96, cif: 25.26 });
    expect(costoDelPedido([ROPA]).get("APPTR1237")).toBe(25.26);
    expect(cifDeLaPlantilla([ROPA]).get("APPTR1237")).toBe(25.26);
    // El que tenía: 32.80 × 0.80 × 1.10 = 28.86. No puede volver.
    expect(costoDelPedido([ROPA]).get("APPTR1237")).not.toBe(28.86);
  });

  it("🩸 el «WholesalePrice OFF» del proveedor manda, también en el pedido", () => {
    // Con OFF, el FOB ES el OFF: 19.50 → × 1.10 = 21.45. Sin él serían 19.65.
    expect(costoReebok("HARDWARE", 22.33, 19.5, undefined)).toEqual({ fob: 19.5, cif: 21.45 });
    expect(costoDelPedido([CON_DESCUENTO]).get("100075436")).toBe(21.45);
    expect(cifDeLaPlantilla([CON_DESCUENTO]).get("100075436")).toBe(21.45);
    expect(costoDelPedido([CON_DESCUENTO]).get("100075436")).not.toBe(19.65);
  });

  it("🔑 artículo por artículo, las dos salidas coinciden — con 1.10 y con 1.15", () => {
    for (const flete of [undefined, 1.1, 1.15]) {
      const pedido = costoDelPedido(TODOS, flete);
      const plantilla = cifDeLaPlantilla(TODOS, flete);
      for (const it of TODOS) {
        expect(pedido.get(it.newArticle), `${it.newArticle} con flete ${String(flete)}`)
          .toBe(plantilla.get(it.newArticle));
      }
    }
  });

  it("sin WholesalePrice no se inventa un costo: va vacío en las dos", () => {
    const sinPrecio = item({ newArticle: "SIN", wholesale: null });
    expect(costoReebok("FOOTWEAR", null, null, undefined)).toEqual({ fob: null, cif: null });
    expect(costoDelPedido([sinPrecio]).get("SIN")).toBeNull();
    expect(cifDeLaPlantilla([sinPrecio]).get("SIN")).toBeNull();
  });

  it("un OFF en cero o negativo NO es un descuento: manda el porcentaje", () => {
    expect(costoReebok("APPAREL", 32.8, 0, undefined).fob).toBe(22.96);
    expect(costoReebok("APPAREL", 32.8, -5, undefined).fob).toBe(22.96);
  });

  it("⚠️ el redondeo también es uno solo: FOB a centavos y RECIÉN AHÍ el flete", () => {
    // 35.33 × 0.80 = 28.264 → 28.26 → × 1.10 = 31.086 → 31.09.
    // Redondeando una sola vez al final daría 31.09 también acá, pero en 66 de
    // los 526 artículos del archivo real daba un centavo distinto.
    const { fob, cif } = costoReebok("FOOTWEAR", 35.33, null, 1.1);
    expect(fob).toBe(28.26);
    expect(cif).toBe(Math.round(28.26 * 1.1 * 100) / 100);
  });
});

describe("🔴 La regla se LLAMA, no se copia", () => {
  const src = leer("src/lib/depurador/reebok.ts");
  const sinComentarios = src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");
  // El cuerpo de la salida A (pedido para cliente).
  const cuerpoCatalogo = sinComentarios.slice(
    sinComentarios.indexOf("export function buildCatalogo"),
    sinComentarios.indexOf("export function buildCatalogoAoa"),
  );

  it("`costoReebok` existe y las dos salidas la llaman", () => {
    expect(sinComentarios).toContain("export function costoReebok");
    expect(cuerpoCatalogo).toContain("costoReebok(");
    const cuerpoSwitch = sinComentarios.slice(
      sinComentarios.indexOf("export function buildSwitchRows"),
      sinComentarios.indexOf("export const sinPiezasDelMes"),
    );
    expect(cuerpoSwitch).toContain("costoReebok(");
  });

  /* ⚠️ CAMBIÓ DE DIRECCIÓN EL 18-sep-2026, con la misma intención.
   * El 0,80 / 0,70 **se mudó** de `fobReebok` al módulo puro
   * `src/lib/depurador/descuento-proveedor.ts` (`DESCUENTO_ESTIMADO_CALZADO` y
   * `DESCUENTO_ESTIMADO_RESTO`), porque ahora Daniel puede escribir el descuento
   * real y el estimado pasó a ser el último recurso. La regla que este candado
   * protege NO cambió: el multiplicador vive en UN SOLO LUGAR y el pedido para
   * cliente no puede volver a tener el suyo. Lo único que cambió es cuál es ese
   * lugar. Candado del cambio: `reebok-descuento-proveedor.test.ts`. */
  it("🔴 en el pedido para cliente no vuelve a aparecer un × 0.8 (ni 0.7) suelto", () => {
    expect(cuerpoCatalogo).not.toMatch(/\*\s*0\.8\b/);
    expect(cuerpoCatalogo).not.toMatch(/\*\s*0\.7\b/);
    // CONTROL: el porcentaje sí vive —una sola vez— en el módulo del descuento.
    const descuento = leer("src/lib/depurador/descuento-proveedor.ts");
    expect(descuento).toMatch(/DESCUENTO_ESTIMADO_CALZADO = 20/);
    expect(descuento).toMatch(/DESCUENTO_ESTIMADO_RESTO = 30/);
    // Y `fobReebok` lo PIDE, no lo escribe.
    const cuerpoFob = sinComentarios.slice(
      sinComentarios.indexOf("export function fobReebok"),
      sinComentarios.indexOf("export function costoReebok"),
    );
    expect(cuerpoFob).toContain("factorDeDescuento");
  });

  it("🔴 el 0.80 y el 0.70 viven en UN solo lugar de todo el módulo", () => {
    const veces = (re: RegExp) => (sinComentarios.match(re) ?? []).length;
    // Ya no está en `reebok.ts`: se mudó al módulo del descuento (nota arriba).
    expect(veces(/\?\s*0\.8\s*:\s*0\.7/g)).toBe(0);
    const descuento = leer("src/lib/depurador/descuento-proveedor.ts")
      .split("\n").filter((l) => !l.trim().startsWith("*") && !l.trim().startsWith("/*")).join("\n");
    expect((descuento.match(/DESCUENTO_ESTIMADO_CALZADO\s*=/g) ?? []).length).toBe(1);
    expect((descuento.match(/DESCUENTO_ESTIMADO_RESTO\s*=/g) ?? []).length).toBe(1);
  });

  it("CONTROL: `fobReebok` sigue exportada y es la que decide el porcentaje", () => {
    expect(fobReebok("FOOTWEAR", 100, null)).toBe(80);
    expect(fobReebok("APPAREL", 100, null)).toBe(70);
    expect(fobReebok("HARDWARE", 100, 55)).toBe(55);
  });
});

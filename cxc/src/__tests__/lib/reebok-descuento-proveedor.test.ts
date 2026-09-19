/* ─────────────────────────────────────────────────────────────────────────────
 * 🔴 CANDADO — EL DESCUENTO DEL PROVEEDOR SE ESCRIBE, NO SE INVENTA (18-sep-2026)
 *
 * Daniel, textual: *«se debería de poner el descuento yo después de subir el
 * archivo, pongo el % en número»* · *«como configurar así como la fórmula, pongo
 * el % y que se auto calcule solo»* · *«como a veces vienen muchas líneas,
 * hacerlo como que más fácil, GLOBAL»*.
 *
 * 🩸 EL DEFECTO. En el camino de la PREFORMA (la confirmación de compra, con la
 * que se cotiza semanas antes del embarque) el sistema buscaba una columna
 * «WholesalePrice OFF» que **no aparece en ningún Excel real** que Daniel haya
 * recibido, y al no encontrarla SE INVENTABA el descuento: `× 0,80` en calzado y
 * `× 0,70` en ropa y accesorios. Los descuentos reales de Reebok varían —20 %,
 * 25 % y 30 % en el mismo embarque, medido sobre el despacho real del
 * 17-sep-2026— así que la cotización salía equivocada. Y **en silencio**: nada
 * en pantalla decía que ese costo era una suposición.
 *
 * 🔴 ESTO MUEVE PLATA: el «Costo CIF *» es el costo con el que el artículo entra
 * a Switch, y de él sale el precio de venta.
 *
 * Lo que este candado protege, y por qué cada cosa:
 *   1. CON EL % ESCRITO SE USA EL %, en las DOS salidas (plantilla Switch y
 *      pedido para cliente) — que es lo que Daniel pidió.
 *   2. SIN ÉL SE ESTIMA **Y SE AVISA**. Estimar sigue siendo lo de hoy, para no
 *      romper a nadie; el silencio era el defecto de fondo.
 *   3. EL «WholesalePrice OFF» REAL LE GANA AL %. El dato del proveedor manda
 *      siempre sobre la fórmula.
 *   4. EL DESPACHO NO CAMBIA NI UN CENTAVO. Ahí el costo viene del archivo
 *      (`Precio after Disc`) y se lee tal cual desde el 17-sep-2026.
 *   5. Un tecleo (un `150`, una letra) NO se aplica: cae al estimado y se dice.
 *   6. La regla vive en UN solo lugar y se LLAMA, no se copia — duplicarla es
 *      cómo nacieron los dos costos que el 14-sep-2026 hubo que volver a juntar.
 *   7. CONTROLES: sin escribir nada, el Excel de la preforma es el de siempre,
 *      número por número.
 * ────────────────────────────────────────────────────────────────────────── */

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import XLSX from "xlsx-js-style";
import {
  DESCUENTO_ESTIMADO_CALZADO,
  DESCUENTO_ESTIMADO_RESTO,
  DESCUENTO_MAX,
  CLAVE_DESCUENTO_RECORDADO,
  avisoDescuento,
  descuentoNoSeEntiende,
  esDescuentoValido,
  etiquetaDescuento,
  factorDeDescuento,
  normalizarDescuento,
  origenDelDescuento,
  resumenDescuento,
} from "@/lib/depurador/descuento-proveedor";
import {
  costoReebok,
  fobReebok,
  buildCatalogo,
  buildSwitchRows,
  REEBOK_FORMULA_A_DEFAULT,
  REEBOK_FORMULA_B_DEFAULT,
} from "@/lib/depurador/reebok";
import type { ReebokItem } from "@/lib/depurador/reebok";
import { parseDespacho } from "@/lib/depurador/reebok-despacho";

const RAIZ = path.join(__dirname, "..", "..", "..");
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");

const item = (p: Partial<ReebokItem>): ReebokItem => ({
  po: "PO-1", newArticle: "X", sku: "X0", name: "ARTÍCULO", department: "FOOTWEAR",
  category: "SHOES", ageGroup: "ADULT", colorName: "WHITE", gender: "Male", sellIn: "SI",
  wholesale: 10, wholesaleOff: null, talla: "9", piezas: 6, ...p,
});

/** Las tres ramas, con números del archivo real de septiembre. */
const ZAPATO = item({ newArticle: "100273049", name: "ENERGEN TECH PLUS 3", department: "FOOTWEAR", category: "SHOES", wholesale: 35.33 });
const ROPA = item({ newArticle: "APPTR1237", name: "URBOD TECH PANT", department: "APPAREL", category: "APPAREL", gender: "Female", talla: "M", wholesale: 32.8 });
const CON_OFF = item({ newArticle: "100075436", name: "ACTIVE FOUNDATION BAG", department: "HARDWARE", category: "BAGS", gender: "Unisex", talla: "U", wholesale: 22.33, wholesaleOff: 19.5 });
const TODOS = [ZAPATO, ROPA, CON_OFF];

const cifDeLaPlantilla = (items: ReebokItem[], descuento?: string | number | null) =>
  new Map(
    buildSwitchRows(items, {
      formula: REEBOK_FORMULA_A_DEFAULT, temporada: "2026-09", tasa: "07", descuento,
    }).map((r) => [String(r.cols["Código *"]), r.cols["Costo CIF *"]]),
  );

const fobDeLaPlantilla = (items: ReebokItem[], descuento?: string | number | null) =>
  new Map(
    buildSwitchRows(items, {
      formula: REEBOK_FORMULA_A_DEFAULT, temporada: "2026-09", tasa: "07", descuento,
    }).map((r) => [String(r.cols["Código *"]), r.cols["Costo FOB *"]]),
  );

const costoDelPedido = (items: ReebokItem[], descuento?: string | number | null) =>
  new Map(
    buildCatalogo(items, {
      formulaA: REEBOK_FORMULA_A_DEFAULT, formulaB: REEBOK_FORMULA_B_DEFAULT, descuento,
    }).map((r) => [r.newArticle, r.costo]),
  );

/* ═══════════════ 1 · CON EL % ESCRITO SE USA EL % ═══════════════════════════ */

describe("🔴 1 · el porcentaje escrito manda sobre la suposición", () => {
  it("el FOB del calzado es WholesalePrice × (1 − %/100), no el 0,80 de siempre", () => {
    // 35.33 × 0.75 = 26.4975 → 26.50. Con el estimado sería 35.33 × 0.80 = 28.26.
    expect(fobReebok("FOOTWEAR", 35.33, null, 25)).toBeCloseTo(26.4975, 6);
    expect(fobReebok("FOOTWEAR", 35.33, null, null)).toBeCloseTo(28.264, 6);
  });

  it("la ropa usa EL MISMO porcentaje: uno solo para todo el archivo", () => {
    // 🔑 Daniel: «hacerlo como que más fácil, GLOBAL». No hay un % por rubro.
    expect(fobReebok("APPAREL", 32.8, null, 25)).toBeCloseTo(24.6, 6);
    expect(fobReebok("HARDWARE", 32.8, null, 25)).toBeCloseTo(24.6, 6);
    expect(fobReebok("FOOTWEAR", 32.8, null, 25)).toBeCloseTo(24.6, 6);
  });

  it("el % se acepta escrito como texto, con coma o con el signo: es un campo que se teclea", () => {
    expect(normalizarDescuento("25")).toBe(25);
    expect(normalizarDescuento(" 25 ")).toBe(25);
    expect(normalizarDescuento("25 %")).toBe(25);
    expect(normalizarDescuento("22,5")).toBe(22.5);
    expect(normalizarDescuento(30)).toBe(30);
  });

  it("LAS DOS SALIDAS dicen el mismo costo con el % escrito — un solo costo por producto", () => {
    const plantilla = cifDeLaPlantilla(TODOS, 25);
    const pedido = costoDelPedido(TODOS, 25);
    for (const it of TODOS) {
      expect(pedido.get(it.newArticle), `${it.newArticle} en el pedido`).toBe(plantilla.get(it.newArticle));
    }
  });

  it("el CIF de la plantilla baja de verdad al escribir el descuento (el precio sale de ahí)", () => {
    const sin = cifDeLaPlantilla([ZAPATO, ROPA]);
    const con = cifDeLaPlantilla([ZAPATO, ROPA], 25);
    // 🔑 Con 25 %: al calzado se le estimaba 20 % (menos), así que el costo BAJA;
    // a la ropa se le estimaba 30 % (más), así que SUBE. Estimar de más y estimar
    // de menos son el mismo defecto, y se ven en direcciones opuestas.
    expect(Number(con.get("100273049"))).toBeLessThan(Number(sin.get("100273049")));
    expect(Number(con.get("APPTR1237"))).toBeGreaterThan(Number(sin.get("APPTR1237")));
  });

  it("un 0 escrito es un descuento de verdad: el FOB es el WholesalePrice pelado", () => {
    expect(fobReebok("FOOTWEAR", 35.33, null, 0)).toBeCloseTo(35.33, 6);
    expect(normalizarDescuento(0)).toBe(0);
    expect(normalizarDescuento("0")).toBe(0);
  });
});

/* ═══════════════ 2 · SIN ÉL SE ESTIMA **Y SE AVISA** ═══════════════════════ */

describe("🔴 2 · sin porcentaje se estima, y la pantalla LO DICE", () => {
  it("el estimado sigue siendo 0,80 en calzado y 0,70 en el resto", () => {
    expect(factorDeDescuento(null, true)).toBeCloseTo(0.8, 10);
    expect(factorDeDescuento(null, false)).toBeCloseTo(0.7, 10);
    expect(DESCUENTO_ESTIMADO_CALZADO).toBe(20);
    expect(DESCUENTO_ESTIMADO_RESTO).toBe(30);
  });

  it("el aviso es ÁMBAR, dice cuántos artículos son estimados y con qué porcentajes", () => {
    const r = resumenDescuento([{ clave: "A", wholesaleOff: null }, { clave: "B", wholesaleOff: null }], null);
    expect(r).toEqual({ archivo: 0, escrito: 0, estimado: 2 });
    const aviso = avisoDescuento(r, null);
    expect(aviso).not.toBeNull();
    expect(aviso!.tono).toBe("ambar");
    expect(aviso!.texto).toContain("2 artículos");
    expect(aviso!.texto).toContain("ESTIMADO");
    expect(aviso!.texto).toContain("20 %");
    expect(aviso!.texto).toContain("30 %");
    // 🔴 Y dice QUÉ HACER: un aviso que no se puede accionar no lo lee nadie.
    expect(aviso!.texto).toContain("Descuento del proveedor %");
  });

  it("con el % escrito el aviso deja de ser ámbar y dice cuánto se descontó", () => {
    const r = resumenDescuento([{ clave: "A", wholesaleOff: null }], 25);
    expect(r).toEqual({ archivo: 0, escrito: 1, estimado: 0 });
    const aviso = avisoDescuento(r, 25)!;
    expect(aviso.tono).toBe("normal");
    expect(aviso.texto).toContain("25 %");
    expect(aviso.texto).toContain("1 artículo");
    expect(aviso.texto).not.toContain("ESTIMADO");
  });

  it("la pantalla monta el campo, el aviso y los cuenta desde el MÓDULO puro", () => {
    const tsx = leer("src/app/productos/cargar/ReebokClient.tsx");
    expect(tsx).toContain("Descuento del proveedor %");
    expect(tsx).toContain("avisoDescuento");
    expect(tsx).toContain("resumenDescuento");
    expect(tsx).toContain("@/lib/depurador/descuento-proveedor");
    // El aviso ámbar se dibuja de verdad (no solo se calcula).
    expect(tsx).toContain("data-aviso-descuento");
  });

  it("lo escrito se recuerda por persona, en la familia `fg_last_depurador_*`", () => {
    expect(CLAVE_DESCUENTO_RECORDADO).toBe("fg_last_depurador_descuento_reebok");
    const tsx = leer("src/app/productos/cargar/ReebokClient.tsx");
    expect(tsx).toContain("CLAVE_DESCUENTO_RECORDADO");
    // 🔑 Vaciar el campo TIENE que borrar lo recordado: si no, volver al costo
    // estimado sería imposible después de recargar.
    expect(tsx).toContain("localStorage.removeItem(CLAVE_DESCUENTO_RECORDADO)");
  });
});

/* ═══════════════ 3 · EL DATO REAL LE GANA AL % ═════════════════════════════ */

describe("🔴 3 · «WholesalePrice OFF» real le gana al porcentaje escrito", () => {
  it("con OFF en el archivo, el FOB ES ese número aunque haya % escrito", () => {
    expect(fobReebok("HARDWARE", 22.33, 19.5, 25)).toBe(19.5);
    expect(fobReebok("HARDWARE", 22.33, 19.5, 90)).toBe(19.5);
    expect(fobReebok("HARDWARE", 22.33, 19.5, null)).toBe(19.5);
  });

  it("el costo del artículo con OFF no se mueve ni con % ni sin él, en las dos salidas", () => {
    const sin = costoReebok("HARDWARE", 22.33, 19.5, undefined);
    for (const pct of [null, 0, 10, 25, 50, 90]) {
      expect(costoReebok("HARDWARE", 22.33, 19.5, undefined, pct)).toEqual(sin);
    }
    expect(cifDeLaPlantilla([CON_OFF], 25).get("100075436")).toBe(cifDeLaPlantilla([CON_OFF]).get("100075436"));
    expect(costoDelPedido([CON_OFF], 25).get("100075436")).toBe(costoDelPedido([CON_OFF]).get("100075436"));
  });

  it("`origenDelDescuento` clasifica las tres ramas, y «archivo» gana siempre", () => {
    expect(origenDelDescuento(19.5, 25)).toBe("archivo");
    expect(origenDelDescuento(19.5, null)).toBe("archivo");
    expect(origenDelDescuento(null, 25)).toBe("escrito");
    expect(origenDelDescuento(null, null)).toBe("estimado");
    expect(origenDelDescuento(undefined, null)).toBe("estimado");
    // ⚠️ Un OFF en 0 no es un descuento del 100 %: es un hueco.
    expect(origenDelDescuento(0, null)).toBe("estimado");
  });

  it("el aviso DICE que el del archivo manda cuando conviven las dos cosas", () => {
    const r = resumenDescuento(
      [{ clave: "A", wholesaleOff: 19.5 }, { clave: "B", wholesaleOff: null }],
      25,
    );
    expect(r).toEqual({ archivo: 1, escrito: 1, estimado: 0 });
    expect(avisoDescuento(r, 25)!.texto).toContain("ese manda");
  });
});

/* ═══════════════ 4 · EL DESPACHO NO CAMBIA NI UN CENTAVO ═══════════════════ */

describe("🔴 4 · el despacho sale EXACTAMENTE igual que antes de este cambio", () => {
  const FIXTURES = [
    "src/__tests__/fixtures/reebok-despacho-nuevo-ropa.xlsx",
    "src/__tests__/fixtures/reebok-despacho-viejo-calzado.xlsx",
  ];

  for (const rel of FIXTURES) {
    it(`${path.basename(rel)} · las 25 columnas son idénticas con y sin % escrito`, () => {
      const wb = XLSX.read(fs.readFileSync(path.join(RAIZ, rel)), { type: "buffer" });
      const hoja = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(hoja, { header: 1, raw: true, defval: null });
      const { items } = parseDespacho(rows);
      expect(items.length).toBeGreaterThan(0);

      const base = buildSwitchRows(items, { formula: REEBOK_FORMULA_A_DEFAULT, temporada: "2026-09", tasa: "07" });
      // 🔴 Aunque alguien mande un % (no debería: la pantalla no lo ofrece en el
      // despacho), el «Precio after Disc» del archivo gana y nada se mueve.
      for (const pct of [25, 50, 90]) {
        const con = buildSwitchRows(items, { formula: REEBOK_FORMULA_A_DEFAULT, temporada: "2026-09", tasa: "07", descuento: pct });
        expect(con.map((r) => r.cols), `con ${pct} %`).toEqual(base.map((r) => r.cols));
      }
    });
  }

  it("la pantalla NO ofrece el campo en el despacho, y ahí no manda ningún %", () => {
    const tsx = leer("src/app/productos/cargar/ReebokClient.tsx");
    // El campo vive dentro de la rama de la confirmación.
    expect(tsx).toMatch(/formato === "confirmacion" &&[\s\S]{0,400}Descuento del proveedor %/);
    // Y el valor que viaja a los builders se apaga en el despacho.
    expect(tsx).toContain('formato === "confirmacion" ? normalizarDescuento(descuentoTexto) : null');
  });
});

/* ═══════════════ 5 · UN TECLEO NO SE APLICA, Y SE DICE ═════════════════════ */

describe("🔴 5 · lo que no se entiende cae al estimado y la pantalla lo dice", () => {
  it("fuera de 0–95, o si no es número, no hay porcentaje", () => {
    expect(normalizarDescuento("150")).toBeNull();
    expect(normalizarDescuento("-5")).toBeNull();
    expect(normalizarDescuento("abc")).toBeNull();
    expect(normalizarDescuento("")).toBeNull();
    expect(normalizarDescuento("   ")).toBeNull();
    expect(normalizarDescuento(undefined)).toBeNull();
    expect(normalizarDescuento(null)).toBeNull();
    expect(normalizarDescuento(DESCUENTO_MAX)).toBe(DESCUENTO_MAX);
    expect(normalizarDescuento(DESCUENTO_MAX + 0.01)).toBeNull();
  });

  it("un 150 tecleado deja el costo EXACTAMENTE como el estimado de siempre", () => {
    expect(fobReebok("FOOTWEAR", 35.33, null, "150")).toBeCloseTo(fobReebok("FOOTWEAR", 35.33, null, null), 10);
    expect(fobReebok("APPAREL", 32.8, null, "abc")).toBeCloseTo(fobReebok("APPAREL", 32.8, null, null), 10);
  });

  it("y se distingue «vacío» de «basura» para poder decirlo", () => {
    expect(descuentoNoSeEntiende("")).toBe(false);
    expect(descuentoNoSeEntiende("   ")).toBe(false);
    expect(descuentoNoSeEntiende(null)).toBe(false);
    expect(descuentoNoSeEntiende("25")).toBe(false);
    expect(descuentoNoSeEntiende("150")).toBe(true);
    expect(descuentoNoSeEntiende("abc")).toBe(true);
    const tsx = leer("src/app/productos/cargar/ReebokClient.tsx");
    expect(tsx).toContain("descuentoNoSeEntiende");
    expect(tsx).toContain("data-descuento-ilegible");
  });

  it("`esDescuentoValido` y `etiquetaDescuento` son la misma regla, escrita una vez", () => {
    expect(esDescuentoValido("25")).toBe(true);
    expect(esDescuentoValido("150")).toBe(false);
    expect(etiquetaDescuento(25)).toBe("25 %");
    expect(etiquetaDescuento(22.5)).toBe("22.5 %");
  });
});

/* ═══════════════ 6 · LA REGLA VIVE EN UN SOLO LUGAR ════════════════════════ */

describe("🔴 6 · el descuento se LLAMA, no se copia", () => {
  it("`reebok.ts` aplica el descuento pidiéndoselo al módulo, no con números sueltos", () => {
    const src = leer("src/lib/depurador/reebok.ts");
    expect(src).toContain('from "./descuento-proveedor"');
    expect(src).toContain("factorDeDescuento(normalizarDescuento(descuento)");
    // 🩸 Los 0.8 / 0.7 escritos a mano se fueron de la cuenta: ahora son
    // DESCUENTO_ESTIMADO_* en el módulo puro.
    const cuerpoFob = src.slice(src.indexOf("export function fobReebok"), src.indexOf("export function fobReebok") + 500);
    expect(cuerpoFob).not.toMatch(/\?\s*0\.8\s*:\s*0\.7/);
  });

  it("nadie más multiplica un WholesalePrice por su cuenta", () => {
    for (const rel of [
      "src/lib/depurador/reebok.ts",
      "src/lib/depurador/reebok-despacho.ts",
      "src/app/productos/cargar/ReebokClient.tsx",
    ]) {
      const cuerpo = leer(rel).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      expect(cuerpo, `${rel} tiene un descuento escrito a mano`).not.toMatch(/wholesale\s*\*\s*0\.[0-9]/i);
    }
  });

  it("`costoReebok` sigue siendo la única puerta del costo de Reebok", () => {
    const src = leer("src/lib/depurador/reebok.ts");
    // Las dos salidas la llaman, las dos con el descuento de la config.
    expect(src.match(/costoReebok\(first\.department, w, first\.wholesaleOff, cfg\.flete, cfg\.descuento\)/g)?.length).toBe(2);
  });
});

/* ═══════════════ 7 · CONTROLES — SIN ESCRIBIR NADA, TODO IGUAL ═════════════ */

describe("🟢 CONTROL · la preforma sin porcentaje sale como siempre", () => {
  it("el costo de las tres ramas es el de antes del cambio, número por número", () => {
    // Estos números son los que el sistema producía el 17-sep-2026.
    expect(costoReebok("FOOTWEAR", 35.33, null, undefined)).toEqual({ fob: 28.26, cif: 31.09 });
    expect(costoReebok("APPAREL", 32.8, null, undefined)).toEqual({ fob: 22.96, cif: 25.26 });
    expect(costoReebok("HARDWARE", 22.33, 19.5, undefined)).toEqual({ fob: 19.5, cif: 21.45 });
  });

  it("pasar `undefined`, `null` o `\"\"` como descuento es lo mismo que no pasarlo", () => {
    const base = fobDeLaPlantilla(TODOS);
    for (const v of [undefined, null, "", "   "]) {
      expect(fobDeLaPlantilla(TODOS, v as string | null | undefined)).toEqual(base);
    }
  });

  it("el artículo sin WholesalePrice sigue saliendo sin costo, no en cero", () => {
    expect(costoReebok("FOOTWEAR", null, null, undefined, 25)).toEqual({ fob: null, cif: null });
  });

  it("el resumen cuenta ARTÍCULOS, no filas: una talla repetida no cuenta dos veces", () => {
    const r = resumenDescuento(
      [
        { clave: "A", wholesaleOff: null }, { clave: "A", wholesaleOff: null }, { clave: "A", wholesaleOff: null },
        { clave: "B", wholesaleOff: 19.5 },
        { clave: "", wholesaleOff: null },
      ],
      null,
    );
    expect(r).toEqual({ archivo: 1, escrito: 0, estimado: 1 });
  });

  it("🔴 y gana la PRIMERA fila del artículo, que es la que decide el costo", () => {
    // `buildCatalogo` y `buildSwitchRows` toman el `wholesaleOff` de `group[0]`.
    // Contar por la ÚLTIMA diría «el costo sale del archivo» sobre un artículo
    // cuyo costo se está estimando.
    const r = resumenDescuento(
      [{ clave: "A", wholesaleOff: null }, { clave: "A", wholesaleOff: 19.5 }],
      null,
    );
    expect(r).toEqual({ archivo: 0, escrito: 0, estimado: 1 });
  });

  it("sin artículos no se dice nada: no hay aviso vacío", () => {
    expect(avisoDescuento({ archivo: 0, escrito: 0, estimado: 0 }, null)).toBeNull();
    expect(avisoDescuento({ archivo: 0, escrito: 0, estimado: 0 }, 25)).toBeNull();
  });
});

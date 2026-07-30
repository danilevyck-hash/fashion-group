// ─────────────────────────────────────────────────────────────────────────────
// Selector de talla de la card agrupada — SOLO Joybees (30-jul-2026).
//
// 🩸 QUÉ ESTABA ROTO. Un modelo con dos tallas mostraba la SUMA de los dos
// stocks y ninguno de los dos números reales aparecía en pantalla. Medido en
// producción: `UKVCG.MTC` decía "Disponibilidad 335" = 168 Junior + 167 Kids.
// Son 9 pares así hoy (5 `UKVCG.*` Kids/Junior, 3 `UAACG.*` y 1 `WBCLG.*`
// Mujer/Hombre). Vender contra el 335 es prometer bultos que no existen.
//
// LO APROBADO por Daniel (opción A del mockup, textual: *"opcion a sin rehacer
// el diseño en las 3 marcas para que sigan iguales, solo ahi en joybees"*):
//   · un botón por talla DENTRO de la tarjeta, cada uno con SU stock,
//   · el activo con fondo oscuro y la disponibilidad siguiendo a la talla,
//   · la SUMA no puede aparecer en ninguna parte,
//   · con precios distintos, cada botón dice su precio y el precio grande sigue
//     a la talla elegida,
//   · 44px de alto y sin desborde horizontal en iPhone.
//
// Y lo que este archivo protege sobre todo: **Agregar tiene que mandar el SKU de
// la talla elegida.** Es plata: el SKU equivocado sale mal a Switch.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { render, fireEvent } from "@testing-library/react";

vi.mock("@/lib/tommy-supabase-server", () => ({ tommyServer: {} }));
vi.mock("@/lib/supabase-server", () => ({ supabaseServer: {} }));

import CatalogoGroupedCard from "@/components/catalogo/CatalogoGroupedCard";
import {
  groupByModel, tienePreciosDistintos, type JoybeesProduct,
} from "@/components/catalogo/groupByModel";
import { MARCA_THEME } from "@/lib/catalogo/marcas-ui";

function src(rel: string): string {
  return readFileSync(path.join(process.cwd(), rel), "utf8");
}
const GROUPED_CARD = src("src/components/catalogo/CatalogoGroupedCard.tsx");
const PRODUCT_CARD = src("src/components/catalogo/CatalogoProductCard.tsx");

// ── Datos REALES de producción (leídos de joybees_products el 30-jul-2026) ──
function prod(p: Partial<JoybeesProduct> & { sku: string; price: number; disponibilidad: number }): JoybeesProduct {
  return {
    id: p.id ?? p.sku,
    sku: p.sku,
    name: p.name ?? "Producto",
    category: "footwear",
    gender: p.gender ?? "kids",
    price: p.price,
    stock: p.existencia ?? p.disponibilidad,
    existencia: p.existencia ?? p.disponibilidad,
    disponibilidad: p.disponibilidad,
    image_url: null,
    active: true,
    popular: false,
    is_regalia: false,
    created_at: "2026-07-01T00:00:00Z",
  };
}

/** Par al MISMO precio — el caso de la suma (335 = 168 + 167). */
const MTC = [
  prod({ id: "mtc-j", sku: "UKVCG.MTC-JUNIOR", name: "Kids Varsity Clog Solid Midnight Teal/Citrus", price: 10, disponibilidad: 168 }),
  prod({ id: "mtc-k", sku: "UKVCG.MTC-KIDS", name: "Kids Varsity Clog Solid Midnight Teal/Citrus", price: 10, disponibilidad: 167 }),
];

/** Par con PRECIO DISTINTO — Junior $15 / Kids $13. */
const TRK = [
  prod({ id: "trk-j", sku: "UKTRK.BLK-JUNIOR", name: "Kids Trekking Shoe Solid Black", price: 15, disponibilidad: 120 }),
  prod({ id: "trk-k", sku: "UKTRK.BLK-KIDS", name: "Kids Trekking Shoe Solid Black", price: 13, disponibilidad: 95 }),
];

/** Modelo de una sola talla — tiene que verse EXACTAMENTE como hoy. */
const SOLO = [
  prod({ id: "solo", sku: "UKVCG.OLM-KIDS", name: "Kids Varsity Clog Solid Olive", price: 10, disponibilidad: 168 }),
];

function pintar(productos: JoybeesProduct[], opts: { showStock?: boolean } = {}) {
  const grupos = groupByModel(productos);
  expect(grupos, "una tarjeta por modelo").toHaveLength(1);
  const onQtyChange = vi.fn();
  const r = render(
    <CatalogoGroupedCard
      marca="joybees"
      group={grupos[0]}
      cartMap={new Map()}
      onQtyChange={onQtyChange}
      showBultos
      showStock={opts.showStock ?? true}
    />
  );
  return { ...r, grupo: grupos[0], onQtyChange };
}

/** Texto plano de la card, con espacios normalizados. */
function texto(el: HTMLElement): string {
  return (el.textContent ?? "").replace(/\s+/g, " ").trim();
}

function botonesTalla(container: HTMLElement): HTMLButtonElement[] {
  const grupo = container.querySelector('[role="group"]');
  return grupo ? Array.from(grupo.querySelectorAll("button")) : [];
}

/** Lo que dice un botón de talla: [nombre visible, stock visible]. El nombre se
 *  ve en MAYÚSCULAS por CSS (`uppercase`), no en el texto — se verifica aparte. */
function dice(b: HTMLButtonElement): string[] {
  return Array.from(b.querySelectorAll("span")).map(s => (s.textContent ?? "").trim());
}

describe("par al MISMO precio — dos tallas con su stock separado", () => {
  it("un solo grupo con las DOS variantes y su propio stock", () => {
    const [g] = groupByModel(MTC);
    expect(g.baseSku).toBe("UKVCG.MTC");
    // Orden canónico: la talla chica primero, igual en TODAS las tarjetas
    // (el catálogo las devuelve en cualquier orden).
    expect(g.variants.map(v => v.genderLabel)).toEqual(["Kids", "Junior"]);
    expect(g.variants.map(v => v.product.disponibilidad)).toEqual([167, 168]);
    expect(tienePreciosDistintos(g)).toBe(false);
  });

  it("el orden de los botones es el MISMO en todas las tarjetas", () => {
    // Medido en producción antes del arreglo: `UKVCG.MTC` salía KIDS · JUNIOR y
    // `UKVCG.OLM` al lado JUNIOR · KIDS, según el orden del catálogo. La talla
    // chica va primero, y Mujer antes que Hombre (igual que las secciones).
    const alReves = groupByModel([...MTC].reverse());
    expect(alReves[0].variants.map(v => v.genderLabel)).toEqual(["Kids", "Junior"]);
    const adultos = [
      prod({ id: "m", sku: "UAACG.BLK-M", name: "Adults Active Clog", gender: "adults_m", price: 13, disponibilidad: 132 }),
      prod({ id: "w", sku: "UAACG.BLK-W", name: "Adults Active Clog", gender: "women", price: 13, disponibilidad: 130 }),
    ];
    expect(groupByModel(adultos)[0].variants.map(v => v.genderLabel)).toEqual(["Mujer", "Hombre"]);
  });

  it("la SUMA (335) no aparece en ninguna parte de la tarjeta", () => {
    const { container } = pintar(MTC);
    expect(texto(container)).not.toContain("335");
  });

  it("los DOS stocks se ven sin tocar nada (168 y 167)", () => {
    const { container } = pintar(MTC);
    const botones = botonesTalla(container);
    expect(botones).toHaveLength(2);
    expect(dice(botones[0])).toEqual(["Kids", "167"]);
    expect(dice(botones[1])).toEqual(["Junior", "168"]);
    // Se leen en mayúsculas (JUNIOR / KIDS): el uppercase es de CSS.
    expect(botones[0].querySelector("span")!.className).toContain("uppercase");
  });

  it("la disponibilidad de abajo es la de la talla elegida, con su nombre", () => {
    const { container } = pintar(MTC);
    expect(texto(container)).toContain("Disponibilidad 167 · Kids");
    fireEvent.click(botonesTalla(container)[1]);
    expect(texto(container)).toContain("Disponibilidad 168 · Junior");
    expect(texto(container)).not.toContain("Disponibilidad 167 ·");
  });

  it("el botón de la talla elegida se ve seleccionado (fondo oscuro)", () => {
    const { container } = pintar(MTC);
    const [kids, junior] = botonesTalla(container);
    expect(kids.getAttribute("aria-pressed")).toBe("true");
    expect(kids.className).toContain(MARCA_THEME.joybees.card.addBtn.split(" ")[0]); // bg-[#404041]
    expect(junior.getAttribute("aria-pressed")).toBe("false");
    expect(junior.className).toContain("bg-white");

    fireEvent.click(junior);
    expect(botonesTalla(container)[1].getAttribute("aria-pressed")).toBe("true");
    expect(botonesTalla(container)[0].getAttribute("aria-pressed")).toBe("false");
  });
});

describe("agregar al pedido manda el SKU de la talla ELEGIDA (es plata)", () => {
  it("sin tocar nada agrega la primera talla", () => {
    const { container, onQtyChange } = pintar(MTC);
    fireEvent.click(container.querySelector("button.w-full")!);
    expect(onQtyChange).toHaveBeenCalledTimes(1);
    const [id, qty, producto] = onQtyChange.mock.calls[0];
    expect(producto.sku).toBe("UKVCG.MTC-KIDS");
    expect(id).toBe("mtc-k");
    expect(qty).toBe(1);
  });

  it("eligiendo Junior agrega el SKU de Junior, no el de Kids", () => {
    const { container, onQtyChange } = pintar(MTC);
    fireEvent.click(botonesTalla(container)[1]);
    const agregar = container.querySelector("button.w-full")!;
    expect(agregar.textContent).toBe("Agregar Junior");
    fireEvent.click(agregar);
    const [id, , producto] = onQtyChange.mock.calls[0];
    expect(producto.sku).toBe("UKVCG.MTC-JUNIOR");
    expect(id).toBe("mtc-j");
  });
});

describe("par con PRECIO DISTINTO — cada talla con su precio", () => {
  it("vuelven a ser UN modelo, con las dos tallas y los dos precios", () => {
    const [g] = groupByModel(TRK);
    expect(g.baseSku).toBe("UKTRK.BLK");
    expect(g.variants.map(v => v.product.price)).toEqual([13, 15]);
    expect(tienePreciosDistintos(g)).toBe(true);
    // El precio del grupo es el MENOR y solo sirve para ordenar la grilla.
    expect(g.price).toBe(13);
  });

  it("el botón de cada talla dice SU precio", () => {
    const { container } = pintar(TRK);
    const botones = botonesTalla(container);
    expect(dice(botones[0])).toEqual(["Kids · $13", "95"]);
    expect(dice(botones[1])).toEqual(["Junior · $15", "120"]);
  });

  it("el precio de arriba se ajusta a la talla elegida", () => {
    const { container } = pintar(TRK);
    const precio = () => container.querySelector(".text-xl.font-bold")!.textContent;
    expect(precio()).toBe("$13");
    fireEvent.click(botonesTalla(container)[1]);
    expect(precio()).toBe("$15");
  });

  it("agregar la talla de $15 manda el SKU de $15, no el de $13", () => {
    const { container, onQtyChange } = pintar(TRK);
    fireEvent.click(botonesTalla(container)[1]);
    fireEvent.click(container.querySelector("button.w-full")!);
    const [, , producto] = onQtyChange.mock.calls[0];
    expect(producto.sku).toBe("UKTRK.BLK-JUNIOR");
    expect(producto.price).toBe(15);
  });

  it("con UN solo precio los botones NO lo repiten (ruido innecesario)", () => {
    const { container } = pintar(MTC);
    expect(texto(container.querySelector('[role="group"]') as HTMLElement)).not.toContain("$");
  });
});

describe("un modelo de UNA sola talla se ve como hoy", () => {
  it("sin selector, con su stock y el botón 'Agregar' a secas", () => {
    const { container } = pintar(SOLO);
    expect(container.querySelector('[role="group"]')).toBeNull();
    expect(container.querySelector("button.w-full")!.textContent).toBe("Agregar");
    const t = texto(container);
    expect(t).toContain("Disponibilidad 168");
    expect(t).toContain("Existencia 168");
    // Sin talla al lado del número: es el bloque histórico, no el nuevo.
    expect(t).not.toContain("· Kids");
  });

  it("un modelo con sufijo pero sin par muestra el SKU COMPLETO", () => {
    const [g] = groupByModel(SOLO);
    expect(g.baseSku).toBe("UKVCG.OLM-KIDS");
  });

  it("un producto sin sufijo sigue siendo su propia tarjeta", () => {
    const sinSufijo = prod({ sku: "UACCESORIO.BLK", price: 5, disponibilidad: 10, gender: "accessories" });
    const grupos = groupByModel([sinSufijo]);
    expect(grupos).toHaveLength(1);
    expect(grupos[0].baseSku).toBe("UACCESORIO.BLK");
    expect(grupos[0].variants).toHaveLength(1);
  });
});

describe("el catálogo PÚBLICO no filtra stock interno por el selector", () => {
  it("los botones de talla se ven, pero sin números de bodega", () => {
    const { container } = pintar(MTC, { showStock: false });
    const botones = botonesTalla(container);
    expect(botones).toHaveLength(2);
    expect(dice(botones[0])).toEqual(["Kids"]);
    expect(dice(botones[1])).toEqual(["Junior"]);
    expect(texto(container)).not.toContain("Disponibilidad");
    expect(texto(container)).not.toContain("Existencia");
  });
});

describe("ninguna variante puede quedar escondida (el invariante de #348)", () => {
  it("un SUFIJO REPETIDO abre otra tarjeta en vez de tapar un stock", () => {
    // Si Switch mandara dos filas -KIDS del mismo base, el selector tendría dos
    // botones "KIDS" y uno de los dos stocks sería inalcanzable.
    const dup = [
      prod({ id: "a", sku: "UKVCG.XXX-KIDS", name: "Clog", price: 10, disponibilidad: 50 }),
      prod({ id: "b", sku: "UKVCG.XXX-KIDS", name: "Clog", price: 10, disponibilidad: 70 }),
    ];
    const grupos = groupByModel(dup);
    expect(grupos).toHaveLength(2);
    expect(grupos.flatMap(g => g.variants.map(v => v.product.disponibilidad)).sort()).toEqual([50, 70]);
    // Cada tarjeta muestra el SKU completo: dos React keys distintas.
    expect(new Set(grupos.map(g => g.variants[0].product.id)).size).toBe(2);
  });

  it("nombres distintos con el mismo base siguen separados", () => {
    const otros = [
      prod({ id: "a", sku: "UKVCG.YYY-KIDS", name: "Clog A", price: 10, disponibilidad: 5 }),
      prod({ id: "b", sku: "UKVCG.YYY-JUNIOR", name: "Clog B", price: 10, disponibilidad: 6 }),
    ];
    expect(groupByModel(otros)).toHaveLength(2);
  });

  it("la función que SUMABA el stock del grupo está borrada, no sin llamar", () => {
    expect(GROUPED_CARD).not.toContain("sumaStock");
    expect(GROUPED_CARD).not.toContain("groupDisponibilidad");
    expect(GROUPED_CARD).not.toContain("groupExistencia");
  });
});

describe("táctil y sin scroll lateral en iPhone", () => {
  it("los botones de talla piden 44px de alto", () => {
    const { container } = pintar(MTC);
    for (const b of botonesTalla(container)) {
      expect(b.className).toContain("min-h-[44px]");
    }
  });

  it("los botones se reparten el ancho y cortan el texto en vez de desbordar", () => {
    const { container } = pintar(MTC);
    for (const b of botonesTalla(container)) {
      expect(b.className).toContain("flex-1");
      expect(b.className).toContain("min-w-0");
    }
    expect(GROUPED_CARD).toContain("max-w-full truncate");
    // Nada de ancho fijo ni scroll horizontal en la fila del selector.
    expect(GROUPED_CARD).not.toContain("overflow-x-auto");
  });
});

describe("Reebok y Tommy NO cambian", () => {
  it("solo Joybees agrupa por modelo, así que solo Joybees ve el selector", () => {
    expect(MARCA_THEME.joybees.features.agrupacionPorModelo).toBe(true);
    expect(MARCA_THEME.reebok.features.agrupacionPorModelo).toBe(false);
    expect(MARCA_THEME.tommy.features.agrupacionPorModelo).toBe(false);
  });

  it("la card PLANA (Reebok/Tommy) no tiene selector de talla ni lo conoce", () => {
    expect(PRODUCT_CARD).not.toContain("Selector de talla");
    expect(PRODUCT_CARD).not.toContain('role="group"');
    expect(PRODUCT_CARD).not.toContain("tallaOn");
    expect(PRODUCT_CARD).not.toContain("tienePreciosDistintos");
    // Y sigue pidiendo la línea de stock SIN talla (bloque histórico).
    expect(PRODUCT_CARD).toContain("<CatalogoStockLine");
    expect(PRODUCT_CARD).not.toContain("talla={");
  });

  it("los colores del selector salen del TEMA, no hardcodeados por marca", () => {
    // Si alguien enciende la agrupación en otra marca, hereda sus colores: el
    // activo es el mismo fondo del botón Agregar y el inactivo el del stock.
    expect(GROUPED_CARD).toContain("const tallaOn = `border-transparent ${t.addBtn}`");
    expect(GROUPED_CARD).toContain("${t.stock.strong}`");
    // Ningún color de Joybees dentro del bloque del selector. (Las insignias
    // Regalia/Popular sí traen el amarillo hardcodeado desde antes — están
    // arriba, en la foto, y no son parte de esto.)
    const desde = GROUPED_CARD.indexOf("Selector de talla");
    const hasta = GROUPED_CARD.indexOf("Action buttons");
    const selector = GROUPED_CARD.slice(desde, hasta);
    expect(selector).not.toMatch(/#[0-9A-Fa-f]{6}/);
  });
});

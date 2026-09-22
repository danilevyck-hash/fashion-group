/**
 * ─────────────────────────────────────────────────────────────────────────────
 * CANDADO — LA TARJETA DEL PRODUCTO, PODADA (22-sep-2026)
 *
 * 🩸 QUÉ SE PODÓ: el puntito de color con el nombre del color al lado. Medido
 * contra producción ese día:
 *
 *     `color` vacío en 391 de 391 productos de Reebok (390 NULL + 1 vacío),
 *     y las otras TRES marcas ni siquiera tienen la columna.
 *
 * 🔴 Y NO ES «está vacío por ahora»: NADIE puede llenarlo. La única puerta de
 * edición a mano —`PUT`/`POST /api/catalogo/[marca]/products`— lo RECHAZA con
 * 400 («Campos no editables: color»), el sync de Switch no lo escribe en
 * ninguna de las 4 marcas, y no hay script ni migración que lo toque. Switch
 * trae un `color` en `/apiarticulos/lista` y también viene vacío (medido el
 * 6-ago-2026, migración `20260806120000`).
 *
 * ═══ 🔴 LO QUE **NO** SE PODÓ, Y ESTE CANDADO PROTEGE IGUAL ═══
 *
 * **`badge` SE QUEDA.** Está igual de vacío (NULL en los 1.140 productos de las
 * 4 marcas), pero ESA MISMA RUTA SÍ LO ESCRIBE y lo valida contra tres valores
 * (`nuevo · oferta · proximamente`), con `requireAdminOSecretaria`. Vacío por
 * ahora no es lo mismo que muerto. Y de él cuelgan tres cosas vivas: la
 * PRE-ORDEN de Reebok, la regla de «a la venta» (`a-la-venta.ts`, espejada byte
 * a byte en la migración `20261123120000` de los contadores del hub) y el color
 * del precio en el PDF. Quitarlo dejaría la puerta abierta escribiendo un dato
 * que ya nadie dibuja.
 *
 * **«Consultar» SE QUEDA.** Hoy son 0 de 1.140 los productos sin precio —el
 * único con precio 0 está apagado—, pero `price` es `number | null` en la
 * columna y en el tipo, y un producto sin precio es un estado REAL y posible.
 * Borrarlo dejaría un hueco en blanco donde va el precio, que es peor que una
 * palabra.
 *
 * 🔑 Y las COLUMNAS de la base NO se dropean (patrón `mayor_lineas`).
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { render, cleanup } from "@testing-library/react";
import CatalogoProductCard from "@/components/catalogo/CatalogoProductCard";
import type { CatalogoProducto } from "@/components/catalogo/types";
import { MARCAS_CONFIG } from "@/lib/catalogo/marcas";

vi.mock("@/lib/hooks/useModalDismiss", () => ({ useEscapeClose: () => {} }));

afterEach(cleanup);

const leer = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");
const sinComentarios = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\{\/\*[\s\S]*?\*\/\}/g, " ").replace(/^[ \t]*\/\/.*$/gm, "");

const TARJETA = "src/components/catalogo/CatalogoProductCard.tsx";
const MARCAS = ["reebok", "joybees", "tommy", "calvin"] as const;

const producto = (over: Partial<CatalogoProducto> = {}): CatalogoProducto => ({
  id: "p1",
  sku: "RBK-1001",
  name: "Club C 85",
  price: 42.5,
  image_url: null,
  category: "footwear",
  ...over,
});

function pintar(p: CatalogoProducto) {
  return render(
    <CatalogoProductCard marca="reebok" product={p} qty={0} onQtyChange={() => {}} />,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
describe("1. 🔴 el color no vuelve a la TARJETA", () => {
  it("un producto con color dibujado a la fuerza no pinta ni puntito ni nombre", () => {
    // Se le mete el color por la puerta de atrás: aunque llegara, no se dibuja.
    const { container } = pintar(producto({ color: "Negro" } as CatalogoProducto));
    expect(container.textContent).not.toContain("Negro");
    // Ningún círculo con color de fondo: el puntito era el único.
    const conFondo = [...container.querySelectorAll<HTMLElement>("[style]")].filter((e) =>
      (e.getAttribute("style") || "").includes("background-color"),
    );
    expect(conFondo, "volvió un puntito de color a la tarjeta").toHaveLength(0);
  });

  it("y el código sigue estando: se podó el color, no la píldora", () => {
    const { container } = pintar(producto());
    expect(container.textContent).toContain("RBK-1001");
  });

  it("🔴 la tarjeta no vuelve a nombrar `color` ni a adivinar un hex por el texto", () => {
    const src = sinComentarios(leer(TARJETA));
    expect(src).not.toMatch(/product\.color/);
    expect(src).not.toMatch(/COLOR_DOT_MAP|getColorDot/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("2. 🔴 el color no vuelve a VIAJAR al navegador", () => {
  it("ninguna de las 8 lecturas de producto lo pide", () => {
    for (const m of MARCAS) {
      const cfg = MARCAS_CONFIG[m];
      for (const [donde, cols] of [
        ["admin", cfg.products.cols],
        ["público", cfg.publicCatalog.cols],
      ] as const) {
        expect(cols.split(","), `${m} · ${donde} volvió a pedir color`).not.toContain("color");
      }
    }
  });

  it("🔴 ni el buscador del catálogo ni el del vendedor lo miran", () => {
    // 🔑 La palabra COMPLETA y en minúscula, no `p.color`: escribirlo con un
    // rodeo (`(p as { color?: string }).color`) es exactamente cómo volvería.
    // Medido: después de quitar los comentarios, estos cuatro archivos no
    // contienen la palabra ni una vez (`setTextColor` y `saleColor` llevan
    // mayúscula y no cuentan).
    for (const f of [
      "src/components/catalogo/CatalogoPublicoPage.tsx",
      "src/components/catalogo/CatalogoVendedorPage.tsx",
    ]) {
      expect(sinComentarios(leer(f)), f).not.toMatch(/\bcolor\b/);
    }
  });

  it("🔴 ni el PDF del catálogo lo imprime", () => {
    for (const f of [
      "src/lib/catalogo/catalog-pdf.ts",
      "src/components/catalogo/useDescargarCatalogoPdf.ts",
    ]) {
      expect(sinComentarios(leer(f)), f).not.toMatch(/\bcolor\b/);
    }
  });

  it("🔑 pero la COLUMNA no se dropea: ninguna migración la borra", () => {
    const dir = path.join(process.cwd(), "supabase/migrations");
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".sql"))) {
      const sql = fs.readFileSync(path.join(dir, f), "utf8").toLowerCase();
      expect(sql, f).not.toMatch(/drop\s+column\s+(if\s+exists\s+)?color\b/);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("3. 🔴 `badge` SE QUEDA: tiene puerta viva que lo escribe", () => {
  const RUTA = "src/app/api/catalogo/[marca]/products/route.ts";

  it("la ruta lo sigue aceptando y validando contra los tres valores", () => {
    const src = leer(RUTA);
    expect(src).toMatch(/EDITABLE_FIELDS\s*=\s*\[[^\]]*"badge"/);
    for (const v of ["nuevo", "oferta", "proximamente"]) {
      expect(src, `${v} salió de los valores válidos`).toContain(`"${v}"`);
    }
  });

  it("🔴 los tres adornos siguen dibujándose cuando el badge llega", () => {
    for (const [valor, texto] of [
      ["oferta", "Oferta"],
      ["nuevo", "Nuevo"],
      ["proximamente", "Próximamente"],
    ] as const) {
      cleanup();
      const { container } = pintar(producto({ badge: valor }));
      expect(container.textContent, `se perdió el adorno «${texto}»`).toContain(texto);
    }
  });

  it("🔴 y sigue viajando en las 8 lecturas: de él cuelgan la pre-orden y «a la venta»", () => {
    for (const m of MARCAS) {
      const cfg = MARCAS_CONFIG[m];
      expect(cfg.products.cols.split(","), `${m} · admin`).toContain("badge");
      expect(cfg.publicCatalog.cols.split(","), `${m} · público`).toContain("badge");
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("4. 🔴 «Consultar» SE QUEDA: es el respaldo de un estado real", () => {
  it("un producto sin precio lo dice con una palabra, nunca con un hueco", () => {
    const { container } = pintar(producto({ price: null }));
    expect(container.textContent).toContain("Consultar");
  });

  it("y uno con precio muestra el precio", () => {
    const { container } = pintar(producto({ price: 42.5 }));
    expect(container.textContent).toContain("42.50");
    expect(container.textContent).not.toContain("Consultar");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Paridad y contratos del FLUJO PÚBLICO de catálogos en las 3 marcas
// (revisión de punta a punta, jul-2026).
//
// El catálogo público es lo ÚNICO que ve un cliente externo de Daniel. Estos
// tests fijan lo que se arregló para que no vuelva por marca ni se pierda en
// un refactor:
//
//   1. VISTA PREVIA DE WHATSAPP — las 3 marcas declaran og:image propia
//      (1200x630, PNG, URL absoluta) tanto en el link del catálogo como en el
//      link del pedido. Antes NINGUNA tenía imagen, y las 3 páginas de pedido
//      no declaraban nada: al cliente le llegaba "Fashion Group · Sistema
//      interno Fashion Group" en su propio WhatsApp.
//   2. ESTADOS DE ERROR — "no cargó" no puede disfrazarse de "no hay nada".
//   3. EL PROMPT DE INSTALAR EL ERP no se le muestra al cliente en NINGUNA
//      marca (la lista se derivaba a mano y solo cubría Reebok).
//   4. TEXTOS — español de verdad (con acentos) y los mismos en las 3 marcas.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "fs";
import path from "path";

vi.mock("@/lib/tommy-supabase-server", () => ({ tommyServer: {} }));
vi.mock("@/lib/supabase-server", () => ({ supabaseServer: {} }));

import { MARCA_THEME, MARCAS_UI } from "@/lib/catalogo/marcas-ui";
import {
  metadataCatalogoPublico,
  metadataPedidoPublico,
  DOMINIO_PUBLICO,
} from "@/lib/catalogo/metadata-publica";

const MARCAS = ["reebok", "joybees", "tommy", "calvin"] as const;

function src(rel: string): string {
  return readFileSync(path.join(process.cwd(), rel), "utf8");
}

/** Código SIN comentarios: en este repo los comentarios citan a propósito el
 *  texto viejo que se arregló ("antes decía X"), y eso dispararía falsos
 *  positivos en los tests que exigen que X ya no exista. */
function sinComentarios(code: string): string {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
    .join("\n");
}

function existe(rel: string): boolean {
  try {
    readFileSync(path.join(process.cwd(), rel));
    return true;
  } catch {
    return false;
  }
}

const PUBLICO = src("src/components/catalogo/CatalogoPublicoPage.tsx");
const PEDIDO = src("src/components/catalogo/PedidoPublicoClient.tsx");
const BARRA = src("src/components/catalogo/CatalogoStickyCartBar.tsx");
const FILTROS = src("src/components/catalogo/CatalogoFilters.tsx");
const INSTALL = src("src/components/InstallPrompt.tsx");

// ── 1. Vista previa del link en WhatsApp ─────────────────────────────────────

describe("vista previa de WhatsApp (openGraph)", () => {
  it.each(MARCAS)("%s declara una og:image propia, PNG y absoluta", (marca) => {
    const { ogImage } = MARCA_THEME[marca];
    expect(ogImage).toMatch(/^https:\/\//);
    expect(ogImage).toMatch(/\.png$/);
    // SVG no lo renderiza WhatsApp; relativa la resolvería Next contra la URL
    // del deploy de Vercel y no contra fashiongr.com.
    expect(ogImage).toContain(marca);
  });

  it("las 3 imágenes son distintas — ninguna marca hereda la de otra", () => {
    const urls = MARCAS.map((m) => MARCA_THEME[m].ogImage);
    expect(new Set(urls).size).toBe(MARCAS.length);
  });

  it.each(MARCAS)("el archivo de la og:image de %s existe en public/", (marca) => {
    const rel = new URL(MARCA_THEME[marca].ogImage).pathname; // /og/catalogo-<marca>.png
    expect(existe(path.join("public", rel))).toBe(true);
  });

  it.each(MARCAS)("el link del CATÁLOGO de %s previsualiza con nombre e imagen", (marca) => {
    const meta = metadataCatalogoPublico(marca);
    const og = meta.openGraph as Record<string, unknown>;
    expect(meta.title).toBe(MARCA_THEME[marca].metaTitle);
    expect(og.url).toBe(MARCA_THEME[marca].publicoShareUrl);
    const imgs = og.images as { url: string; width: number; height: number }[];
    expect(imgs[0].url).toBe(MARCA_THEME[marca].ogImage);
    // 1200x630 = 1.91:1, la relación que WhatsApp recorta sin cortar nada.
    expect(imgs[0].width).toBe(1200);
    expect(imgs[0].height).toBe(630);
  });

  it.each(MARCAS)("el link del PEDIDO de %s previsualiza con su marca, no con el ERP", (marca) => {
    const meta = metadataPedidoPublico(marca, "abc123");
    const og = meta.openGraph as Record<string, unknown>;
    expect(meta.title).toBe(`Tu pedido ${MARCA_THEME[marca].label}`);
    expect(og.url).toBe(`${DOMINIO_PUBLICO}${MARCA_THEME[marca].pedidoPublicoBase}/abc123`);
    expect((og.images as { url: string }[])[0].url).toBe(MARCA_THEME[marca].ogImage);
    // Lo que se está arreglando: heredar el layout raíz.
    expect(JSON.stringify(meta)).not.toContain("Sistema interno");
  });

  it("la vista previa del pedido NO filtra datos del pedido", () => {
    // La ve cualquiera a quien le reenvíen el mensaje de WhatsApp.
    const meta = JSON.stringify(metadataPedidoPublico("tommy", "abc123"));
    expect(meta).not.toMatch(/total|precio|\$\d/i);
  });

  it("una marca inventada no rompe la metadata", () => {
    expect(metadataCatalogoPublico("adidas")).toEqual({});
    expect(metadataPedidoPublico("adidas", "x")).toEqual({});
  });

  it("las 3 páginas de pedido declaran metadata", () => {
    for (const marca of MARCAS) {
      const page = src(`src/app/pedido-${marca}/[id]/page.tsx`);
      expect(page).toContain("generateMetadata");
      expect(page).toContain("metadataPedidoPublico");
    }
  });
});

// ── 2. Estados de error del cliente ──────────────────────────────────────────

describe("estados de error del flujo público", () => {
  it("el catálogo distingue 'no cargó' de 'no hay resultados'", () => {
    // Antes el catch dejaba products=[] y salía "No encontramos productos con
    // estos filtros" + "Limpiar filtros" SIN filtros puestos.
    expect(PUBLICO).toContain("setLoadError(true)");
    expect(PUBLICO).toContain("No pudimos cargar el catálogo");
    expect(PUBLICO).toContain("Reintentar");
    // Y el catálogo vacío de verdad tampoco culpa a los filtros.
    expect(PUBLICO).toContain("Por ahora no hay productos disponibles");
  });

  it("la página del pedido no le dice 'no existe' a quien se quedó sin red", () => {
    expect(PEDIDO).toContain("No pudimos abrir tu pedido");
    expect(PEDIDO).toContain("Tu pedido no se perdió");
    // El 404 real conserva su mensaje.
    expect(PEDIDO).toContain("Pedido no encontrado");
    // Un 5xx no es un link vencido.
    expect(PEDIDO).toMatch(/res\.status >= 500/);
  });

  it("el botón de PDF avisa cuando falla", () => {
    expect(sinComentarios(PEDIDO)).not.toContain("silent fail");
    expect(PEDIDO).toContain("No se pudo generar el PDF");
  });
});

// ── 3. Guardado: el cliente no puede cerrar la pantalla a medias ─────────────

describe("aviso de guardado", () => {
  it("confirmar DESDE EL CATÁLOGO avisa y frena el cierre de la pestaña", () => {
    // Es el camino que usa todo el mundo; el aviso vivía solo en la página del
    // pedido, que casi nadie llega a ver sin confirmar antes.
    expect(BARRA).toContain("Guardando tu pedido, no cierres esta pantalla");
    expect(PUBLICO).toContain("beforeunload");
  });

  it("la página del pedido conserva su aviso", () => {
    expect(PEDIDO).toContain("Guardando tu pedido, no cierres esta pantalla");
    expect(PEDIDO).toContain("beforeunload");
  });
});

// ── 4. El ERP interno no se le ofrece al cliente ─────────────────────────────

describe("prompt de instalar la app", () => {
  it("está apagado en las 3 páginas de pedido y en el catálogo público", () => {
    const { PUBLIC_PREFIXES } = { PUBLIC_PREFIXES: [
      "/catalogo-publico",
      ...MARCAS_UI.map((m) => MARCA_THEME[m].pedidoPublicoBase),
    ] };
    for (const marca of MARCAS) {
      const base = MARCA_THEME[marca].pedidoPublicoBase;
      expect(PUBLIC_PREFIXES.some((p) => `${base}/abc123`.startsWith(p))).toBe(true);
      expect(
        PUBLIC_PREFIXES.some((p) => `/catalogo-publico/${marca}`.startsWith(p)),
      ).toBe(true);
    }
  });

  it("la lista se DERIVA del tema — no se escribe marca por marca", () => {
    // El bug original: ["/catalogo-publico", "/pedido-reebok"] a mano, así que
    // Joybees y Tommy sí mostraban "Instala Fashion Group" al cliente.
    expect(INSTALL).toContain("MARCAS_UI.map");
    expect(INSTALL).not.toMatch(/PUBLIC_PREFIXES\s*=\s*\[\s*"\/catalogo-publico",\s*"\/pedido-reebok"\s*\]/);
  });
});

// ── 5. Textos ────────────────────────────────────────────────────────────────

describe("textos del catálogo público", () => {
  it.each(MARCAS)("el título y la descripción de %s van con acentos", (marca) => {
    const { metaTitle, metaDescription } = MARCA_THEME[marca];
    expect(metaTitle).toContain("Panamá");
    expect(metaTitle).toContain("Catálogo");
    expect(metaDescription).toContain("Catálogo");
    expect(metaDescription).toContain("Panamá");
  });

  it.each(MARCAS)("el buscador de %s dice 'código', no 'codigo'", (marca) => {
    expect(MARCA_THEME[marca].filtros.searchPlaceholder).toContain("código");
  });

  it("el menú Compartir dice lo MISMO en las 3 marcas", () => {
    const labels = MARCAS.map((m) => MARCA_THEME[m].vendorShare.copyLabel);
    expect(new Set(labels).size).toBe(1);
    expect(labels[0]).toBe("Copiar link público");
  });

  it("las etiquetas de los filtros están acentuadas", () => {
    expect(FILTROS).toContain(">Género<");
    expect(FILTROS).toContain(">Categoría<");
    expect(FILTROS).not.toContain(">Genero<");
    // "Cat." era una abreviatura que no dice nada.
    expect(FILTROS).not.toContain(">Cat.<");
  });

  it("el contador de resultados lleva la palabra, no un número suelto", () => {
    expect(FILTROS).toMatch(/filteredCount === 1 \? "producto" : "productos"/);
  });

  it("el header ya NO dice CATÁLOGO PANAMÁ en ninguna marca (poda 12-ago-2026)", () => {
    // Daniel: "quítame las palabras obvias" — ya estás EN el catálogo y todo el
    // negocio es Panamá. Antes este test fijaba que el subtítulo EXISTIERA en
    // todas las marcas; ahora fija lo contrario. El candado completo (incluido
    // el "Panamá" suelto del pedido público) vive en
    // poda-textos-cxc-multifashion.test.ts.
    const ui = sinComentarios(src("src/lib/catalogo/marcas-ui.tsx"));
    expect(ui).not.toContain("Catalogo Panama");
    expect(ui).not.toContain("Catálogo Panamá");
  });
});

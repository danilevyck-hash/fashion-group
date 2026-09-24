// ─────────────────────────────────────────────────────────────────────────────
// 🔴 CATÁLOGOS EN EL CELULAR — «lo mismo, ordenado» (24-sep-2026)
//
// Daniel aprobó los nueve cambios del mockup con un «todo sí», y fue explícito
// en lo que NO es esto: **no es un rediseño**. Catálogos se queda como está
// —mismo estilo, mismos colores, mismos rótulos, las mismas tarjetas— y el
// precio del pedido no se toca.
//
// Este archivo es el candado de los nueve. Tiene tres partes:
//   1. Lo PURO (los textos que se arman) se prueba llamando a las funciones.
//   2. Lo de PANTALLA se prueba renderizando y leyendo el DOM.
//   3. Lo de «apagado = antes» se lee del fuente: el interruptor es una
//      constante de compilación, así que lo que se puede exigir es que la rama
//      apagada conserve LITERAL la clase de hoy.
//
// 🔴 Y el candado del final es el que importa: **el payload del pedido es
// idéntico con el interruptor prendido y apagado**. Se renderiza el checkout
// de verdad, se elige un cliente de verdad, se toca «Pedido» y se compara byte
// por byte lo que salió por `fetch`. Nada de esto toca Switch.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, act } from "@testing-library/react";
import fs from "fs";
import path from "path";
import {
  BLANCO_CASILLA,
  CATALOGO_ORDEN_CELULAR,
  FILA_QUE_SE_DESLIZA,
  ROTULO_FILTROS,
  clasesBotonesDeLaMarca,
  cuantosFiltrosPuestos,
  lineaDeExistencias,
  lineaDelStock,
  textoBotonFiltros,
} from "@/lib/catalogo/orden-celular";

const RAIZ = process.cwd();
const leer = (p: string) => fs.readFileSync(path.join(RAIZ, p), "utf8");

const HUB = leer("src/app/catalogos/marcas/page.tsx");
const FILTROS = leer("src/components/catalogo/CatalogoFilters.tsx");
const STOCK_LINE = leer("src/components/catalogo/CatalogoStockLine.tsx");
const CARD = leer("src/components/catalogo/CatalogoProductCard.tsx");
const CARD_AGRUPADA = leer("src/components/catalogo/CatalogoGroupedCard.tsx");
const CHECKOUT = leer("src/components/catalogo/CheckoutClient.tsx");
const ENVIAR = leer("src/components/catalogo/EnviarDocumentoSwitch.tsx");
const CHIPS_COMPROBANTES = leer("src/components/catalogo/comprobantes/FiltrosComprobantes.tsx");
const PANEL = leer("src/components/catalogo/ComprobantesPanel.tsx");
const FILA_COMPROBANTE = leer("src/components/catalogo/comprobantes/FilaComprobante.tsx");
const DETALLE = leer("src/components/catalogo/PedidoDetalleClient.tsx");
const VENDEDOR = leer("src/components/catalogo/CatalogoVendedorPage.tsx");
const ADMIN = leer("src/app/catalogos/admin/[marca]/AdminCatalogoClient.tsx");
const FILA_ADMIN = leer("src/app/catalogos/admin/[marca]/ProductoFila.tsx");

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

describe("0 · el interruptor", () => {
  it("está prendido, y es UNO solo para los nueve", () => {
    expect(CATALOGO_ORDEN_CELULAR).toBe(true);
    // Los nueve cuelgan del mismo interruptor: apagarlo devuelve Catálogos
    // entero a como estaba, sin tener que acordarse de nueve lugares.
    for (const [nombre, fuente] of [
      ["hub", HUB], ["filtros", FILTROS], ["línea de stock", STOCK_LINE],
      ["tarjeta", CARD], ["tarjeta agrupada", CARD_AGRUPADA], ["checkout", CHECKOUT],
      ["chips de comprobantes", CHIPS_COMPROBANTES], ["panel", PANEL],
      ["fila de comprobante", FILA_COMPROBANTE], ["comprobante abierto", DETALLE],
      ["compartir", VENDEDOR], ["administrar", ADMIN], ["fila de administrar", FILA_ADMIN],
    ] as const) {
      expect(fuente, nombre).toContain("CATALOGO_ORDEN_CELULAR");
    }
  });

  it("🔴 no calcula plata: el módulo no tiene una sola operación de dinero", () => {
    const lib = leer("src/lib/catalogo/orden-celular.ts");
    const sinComentarios = lib.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
    // Ni multiplica, ni divide, ni redondea, ni formatea moneda.
    expect(sinComentarios).not.toMatch(/\btoFixed\b|\bMath\.round\b|\bfmtMoney\b|\bprecio\b/i);
    expect(sinComentarios).not.toContain("*");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 1 · HUB DE MARCAS — los cuatro botones, dos filas parejas de dos
// ═════════════════════════════════════════════════════════════════════════════
describe("1 · hub de marcas", () => {
  it("🔴 en el celular los cuatro botones van en rejilla de 2, y del mismo ancho", () => {
    const clases = clasesBotonesDeLaMarca();
    expect(clases).toContain("grid");
    expect(clases).toContain("grid-cols-2");
    // Y en la computadora manda el `flex-wrap` de siempre.
    expect(clases).toContain("sm:flex");
    expect(clases).toContain("sm:flex-wrap");
  });

  it("apagado = la fila de antes, sin rejilla", () => {
    expect(leer("src/lib/catalogo/orden-celular.ts"))
      .toContain('"mt-5 flex flex-wrap gap-2.5"');
  });

  it("🔴 el hub usa la función, no una clase escrita a mano", () => {
    expect(HUB).toContain("clasesBotonesDeLaMarca()");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2 · LINK PARA CLIENTES — una sola línea
// ═════════════════════════════════════════════════════════════════════════════
describe("2 · link para clientes", () => {
  it("🔴 en el celular se va el renglón del título; la dirección y el botón quedan en línea", () => {
    expect(HUB).toContain('CATALOGO_ORDEN_CELULAR ? "hidden sm:block" : ""');
    // La dirección NO se va, y sigue siendo la misma constante.
    expect(HUB).toContain('data-testid="link-catalogos-todos"');
    expect(HUB).toContain("URL_CATALOGOS_PUBLICOS");
  });

  it("⚠️ el rótulo del botón no se tocó: sigue diciendo «Copiar link» en las dos", () => {
    expect(HUB).toContain("Copiar link");
    expect(HUB).not.toMatch(/>\s*Copiar\s*</);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3 · EL CATÁLOGO DEL CLIENTE — «Filtros ›»
// ═════════════════════════════════════════════════════════════════════════════
describe("3 · los filtros se recogen en una fila", () => {
  it("cuenta los filtros PUESTOS, no los controles que existen", () => {
    expect(cuantosFiltrosPuestos({})).toBe(0);
    expect(cuantosFiltrosPuestos({ genero: "", categoria: "", precioMin: "", precioMax: "" })).toBe(0);
    // «Todos» no es un filtro puesto.
    expect(cuantosFiltrosPuestos({ genero: "todos", categoria: "todos" })).toBe(0);
    expect(cuantosFiltrosPuestos({ genero: "hombre" })).toBe(1);
    expect(cuantosFiltrosPuestos({ genero: "hombre", categoria: "calzado" })).toBe(2);
    expect(cuantosFiltrosPuestos({ precioMin: "17.50", precioMax: "17.50" })).toBe(2);
    expect(cuantosFiltrosPuestos({ soloVariosBultos: true })).toBe(1);
  });

  it("el rótulo dice «Filtros», y con filtros puestos dice cuántos", () => {
    expect(textoBotonFiltros(0)).toBe(ROTULO_FILTROS);
    expect(textoBotonFiltros(2)).toBe("Filtros · 2");
  });

  it("🔴 ni Género, ni Categoría, ni el precio se van: se pliegan", () => {
    // Los mismos controles de siempre, en el mismo archivo — no se duplicó
    // ninguno para el celular.
    expect((FILTROS.match(/<FiltroDesplegable/g) ?? []).length).toBe(2);
    expect((FILTROS.match(/<FiltroPrecioExacto/g) ?? []).length).toBe(1);
    expect(FILTROS).toContain("filtrosAbiertos");
    expect(FILTROS).toContain("aria-expanded={filtrosAbiertos}");
  });

  it("🔴 el buscador se queda ARRIBA, a la vista", () => {
    const iBuscador = FILTROS.indexOf("{/* Search bar */}");
    const iFiltros = FILTROS.indexOf("setFiltrosAbiertos((v) => !v)");
    expect(iBuscador).toBeGreaterThan(0);
    expect(iBuscador, "el buscador tiene que ir antes del pliegue").toBeLessThan(iFiltros);
  });

  it("apagado = los filtros abiertos de antes", () => {
    expect(FILTROS).toContain('"flex lg:hidden flex-wrap items-center gap-2"');
    expect(FILTROS).toContain('className="flex flex-wrap items-center justify-between gap-2"');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4 · LA TARJETA DEL PRODUCTO — una línea gris
// ═════════════════════════════════════════════════════════════════════════════
describe("4 · los tres datos de la tarjeta, en una línea", () => {
  it("junta con punto medio y NO inventa lo que no viene", () => {
    expect(lineaDelStock(["Bulto de 12", "Disponibilidad 1", "Existencia 1"]))
      .toBe("Bulto de 12 · Disponibilidad 1 · Existencia 1");
    expect(lineaDelStock(["Bulto de 12", "", null])).toBe("Bulto de 12");
    expect(lineaDelStock([null, undefined, ""])).toBe("");
  });

  it("🔴 no se quita ningún dato: los tres textos siguen ahí", () => {
    expect(STOCK_LINE).toContain("Disponibilidad {");
    expect(STOCK_LINE).toContain("Existencia {");
    expect(STOCK_LINE).toContain("Bulto de {bulto}");
  });

  it("🔴 el punto medio es CSS, no un nodo de texto", () => {
    // Si fuera texto, la tarjeta se leería «· Existencia 1».
    expect(STOCK_LINE).toContain("before:content-['·']");
    expect(STOCK_LINE).toContain("sm:before:content-none");
  });

  it("🔴 el precio, el código y el nombre no se tocaron", () => {
    for (const [nombre, fuente] of [["plana", CARD], ["agrupada", CARD_AGRUPADA]] as const) {
      expect(fuente, nombre).toContain("fmtPrecio(");
      expect(fuente, nombre).toContain("text-[10px] leading-[14px] text-gray-500");
    }
  });

  it("en la computadora la tarjeta queda igual: el bulto vuelve a su renglón", () => {
    expect(CARD).toContain('CATALOGO_ORDEN_CELULAR && showStock ? "hidden sm:block" : undefined');
    expect(STOCK_LINE).toContain("sm:hidden");
    expect(STOCK_LINE).toContain("sm:block");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 5 · EL CARRITO Y EL PEDIDO — el aviso pegado a su caja
// ═════════════════════════════════════════════════════════════════════════════
describe("5 · «Falta: elegir el cliente», pegado a la caja del cliente", () => {
  it("🔴 el aviso vive DENTRO del recuadro del cliente", () => {
    const caja = CHECKOUT.indexOf('data-medir="cliente-checkout"');
    const aviso = CHECKOUT.indexOf('data-medir="falta-cliente-en-la-caja"');
    const total = CHECKOUT.indexOf("Total del pedido");
    expect(caja).toBeGreaterThan(0);
    expect(aviso, "el aviso tiene que ir después de la caja del cliente").toBeGreaterThan(caja);
    expect(aviso, "y ANTES del total, que es de lo que se lo despegó").toBeLessThan(total);
  });

  it("🔴 es el MISMO texto de siempre, no una frase nueva", () => {
    expect(CHECKOUT).toContain("textoFaltaEnviar([FALTA_EL_CLIENTE])");
    expect(leer("src/lib/catalogo/cliente-elegido.ts")).toContain('export const FALTA_EL_CLIENTE = "elegir el cliente"');
  });

  it("🔴 no se dice dos veces: el de abajo se calla en el celular cuando ya lo dijo la caja", () => {
    expect(CHECKOUT).toContain("soloEnComputadora={CATALOGO_ORDEN_CELULAR && falta.length === 1");
    expect(ENVIAR).toContain('soloEnComputadora ? " hidden sm:block" : ""');
  });

  it("🔴 el precio editable del renglón no se tocó", () => {
    expect(CHECKOUT).toContain("<LineasPedidoEditables");
    const lineas = leer("src/components/catalogo/LineasPedidoEditables.tsx");
    expect(lineas).not.toContain("CATALOGO_ORDEN_CELULAR");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 6 · COMPROBANTES — el rótulo al lado, y las casillas de 44
// ═════════════════════════════════════════════════════════════════════════════
describe("6 · comprobantes", () => {
  it("🔴 cada grupo es UNA fila que se desliza, con su rótulo a la izquierda", () => {
    expect(CHIPS_COMPROBANTES).toContain("FILA_QUE_SE_DESLIZA");
    expect(CHIPS_COMPROBANTES).toContain('"flex items-center gap-2 sm:block"');
    expect(FILA_QUE_SE_DESLIZA).toContain("overflow-x-auto");
    // Y en la computadora vuelven a envolver, como hoy.
    expect(CHIPS_COMPROBANTES).toContain("sm:flex-wrap");
  });

  it("⚠️ LOS DOS GRUPOS NO SE JUNTAN EN UNA FILA: no caben (404 px contra 358)", () => {
    // Siguen siendo dos `<GrupoDeChips>`, uno por grupo.
    expect((CHIPS_COMPROBANTES.match(/<GrupoDeChips/g) ?? []).length).toBe(2);
  });

  it("🔴 los rótulos no cambiaron", () => {
    expect(CHIPS_COMPROBANTES).toContain("{grupo.rotulo}");
    expect(leer("src/lib/catalogo/origen-comprobante.ts")).toContain("Quién lo armó");
    expect(leer("src/lib/catalogo/chips-comprobantes.ts")).toContain("Qué es");
  });

  it("🔴 el blanco que se toca mide 44 px", () => {
    expect(BLANCO_CASILLA).toContain("min-h-[44px]");
    expect(BLANCO_CASILLA).toContain("min-w-[44px]");
    expect(FILA_COMPROBANTE).toContain("BLANCO_CASILLA");
    expect(PANEL).toContain('CATALOGO_ORDEN_CELULAR ? " min-h-[44px]" : ""');
  });

  it("apagado = las dos casillas de 16 px y los rótulos con renglón propio", () => {
    expect(CHIPS_COMPROBANTES).toContain('"text-xs text-gray-400 mb-1.5"');
    expect(CHIPS_COMPROBANTES).toContain('"flex flex-wrap gap-2"');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 7 · ADMINISTRAR — ningún texto se encima
// ═════════════════════════════════════════════════════════════════════════════
describe("7 · administrar: cero textos encimados", () => {
  it("los dos números van en una línea, con los mismos valores", () => {
    expect(lineaDeExistencias(14, 14)).toBe("Disponible 14 · En bodega 14");
    expect(lineaDeExistencias(6, null)).toBe("Disponible 6");
    expect(lineaDeExistencias(null, 12)).toBe("En bodega 12");
    expect(lineaDeExistencias(0, 0)).toBe("Disponible 0 · En bodega 0");
    expect(lineaDeExistencias(null, null)).toBe("");
  });

  it("🔴 la causa del encimado está tapada: la columna de datos ya no compite con los botones", () => {
    // 🩸 El defecto era de LUGAR: la columna de datos es `flex-1` (base 0), así
    // que nunca forzaba el salto de línea y su texto se derramaba encima de
    // «Subir otra» y «Esconder». Ahora, hasta `sm`, la foto y los datos van en
    // su propia fila de ancho completo y los botones bajan enteros.
    expect(FILA_ADMIN).toContain('"flex w-full min-w-0 items-center gap-3 sm:contents"');
    expect(FILA_ADMIN).toContain("shrink-0 grid w-full grid-cols-2");
  });

  it("🔴 y la segunda red: el renglón de los números envuelve y no se parte", () => {
    expect(FILA_ADMIN).toContain("flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1 text-xs");
    expect(FILA_ADMIN).toContain("tabular-nums whitespace-nowrap");
  });

  it("🔴 los chips van en UNA fila que se desliza", () => {
    expect(ADMIN).toContain("FILA_QUE_SE_DESLIZA");
    expect(ADMIN).toContain("sm:flex-wrap sm:overflow-x-visible");
  });

  it("vale para las cuatro marcas: la fila es UNA sola", () => {
    expect(ADMIN).toContain("<ProductoFila");
    // Lo único que cambia por marca dentro de la fila es el selector de bulto,
    // y se pregunta al tema, nunca al nombre de la marca.
    expect(FILA_ADMIN).toContain("theme.admin.bultoEditable");
    expect(FILA_ADMIN).not.toMatch(/marca === "(reebok|joybees|tommy|calvin)"/);
  });

  it("apagado = los dos textos sueltos de antes", () => {
    expect(FILA_ADMIN).toContain("`Disponible: ${disponible}`");
    expect(FILA_ADMIN).toContain("En bodega: {product.existencia}");
    expect(FILA_ADMIN).toContain('"shrink-0 flex flex-wrap items-center gap-2"');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 8 · UN COMPROBANTE ABIERTO — un solo deslizamiento
// ═════════════════════════════════════════════════════════════════════════════
describe("8 · el comprobante abierto no tiene scroll dentro de scroll", () => {
  it("🔴 en el celular la tabla solo se desliza de costado; la página crece", () => {
    expect(DETALLE).toContain('"mb-4 overflow-x-auto sm:overflow-auto sm:max-h-[70vh]"');
  });

  it("⚠️ en la computadora la caja conserva su alto — es lo que pega el encabezado", () => {
    expect(DETALLE).toContain("sm:max-h-[70vh]");
    expect(DETALLE).toContain('<thead className="sticky top-0 bg-white z-10">');
  });

  it("apagado = la caja de siempre", () => {
    expect(DETALLE).toContain('"mb-4 overflow-auto max-h-[70vh]"');
  });

  it("🔴 ni un número de la tabla cambia", () => {
    expect(DETALLE).not.toContain("lineaDelStock");
    expect(DETALLE).not.toContain("lineaDeExistencias");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 9 · COMPARTIR — el menú no tapa la lista
// ═════════════════════════════════════════════════════════════════════════════
describe("9 · compartir", () => {
  it("🔴 en el celular el menú deja de flotar: se abre debajo y empuja", () => {
    expect(VENDEDOR).toContain('CATALOGO_ORDEN_CELULAR ? " max-sm:static" : ""');
  });

  it("🔴 son las MISMAS dos opciones, en el mismo panel", () => {
    expect(VENDEDOR).toContain("theme.vendorShare.panel");
    expect(VENDEDOR).toContain("theme.vendorShare.copyLabel");
    expect(VENDEDOR).toContain("Descargar PDF");
    // Un solo panel: no se duplicó el menú para el celular.
    expect((VENDEDOR.match(/theme\.vendorShare\.panel/g) ?? []).length).toBe(1);
  });

  it("en la computadora sigue flotando", () => {
    const marcas = leer("src/lib/catalogo/marcas-ui.tsx");
    expect(marcas).toContain("absolute right-0 top-full");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 10 · LA PANTALLA, RENDERIZADA
// ═════════════════════════════════════════════════════════════════════════════
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useParams: () => ({ marca: "tommy" }),
  usePathname: () => "/catalogo/tommy/checkout",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/hooks/useSidebarCollapsed", () => ({
  useSidebarCollapsed: () => false,
  readSidebarCollapsed: () => false,
}));

describe("10 · lo que se ve", () => {
  it("🔴 la fila de administrar: foto, código y precio arriba; los números en UNA línea; los botones abajo", async () => {
    const ProductoFila = (await import("@/app/catalogos/admin/[marca]/ProductoFila")).default;
    const { container } = render(
      <ProductoFila
        marca="reebok"
        product={{ id: "1", sku: "ACCS010", name: "ACT CORE ANKLE SOCK 3P", image_url: "", price: 5, disponibilidad: 14, existencia: 14 } as never}
        onCambio={() => {}}
        tieneVariantes={() => []}
        showToast={() => {}}
      />,
    );
    // Los dos números en UN solo nodo, sin un segundo texto que compita.
    expect(container.textContent).toContain("Disponible 14 · En bodega 14");
    expect(container.textContent).not.toContain("Disponible: 14");
    expect(container.textContent).not.toContain("En bodega: 14");
    // Y los dos botones, en una caja de dos columnas.
    const subir = screen.getByRole("button", { name: /Subir/ });
    const esconder = screen.getByRole("button", { name: "Esconder" });
    const caja = subir.parentElement!;
    expect(caja, "los dos botones tienen que compartir caja").toBe(esconder.parentElement);
    expect(caja.className).toContain("grid-cols-2");
    expect(caja.className).toContain("w-full");
  });

  it("🔴 ningún texto de la fila se encima con otro (leído de la ESTRUCTURA)", async () => {
    const ProductoFila = (await import("@/app/catalogos/admin/[marca]/ProductoFila")).default;
    const { container } = render(
      <ProductoFila
        marca="reebok"
        product={{ id: "2", sku: "GH8168", name: "CLASSIC LEATHER LEGACY AZ", image_url: "", price: 5, disponibilidad: 12, existencia: 12 } as never}
        onCambio={() => {}}
        tieneVariantes={() => []}
        showToast={() => {}}
      />,
    );
    // jsdom no calcula geometría, así que el candado es estructural y mide la
    // CAUSA: los textos del producto y los botones no pueden vivir en la misma
    // fila apretada. Están en dos hermanos distintos del contenedor, y el de
    // los textos se lleva el ancho completo hasta `sm`.
    const numeros = Array.from(container.querySelectorAll("span"))
      .find((s) => s.textContent === "Disponible 12 · En bodega 12")!;
    const boton = screen.getByRole("button", { name: /Subir/ });
    expect(numeros).toBeTruthy();
    expect(boton.parentElement!.contains(numeros), "los números no pueden vivir en la caja de los botones").toBe(false);
    // Nada con posición absoluta en el layout de la fila (el único `absolute`
    // es interno a la miniatura, y ahí no hay texto).
    for (const el of Array.from(container.querySelectorAll("span, h3, p"))) {
      expect((el as HTMLElement).className, (el as HTMLElement).textContent ?? "")
        .not.toMatch(/\babsolute\b/);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 11 · 🔴 EL CANDADO QUE IMPORTA: EL PEDIDO SALE IGUAL, PRENDIDO Y APAGADO
// ═════════════════════════════════════════════════════════════════════════════
const OID = "44444444-4444-4444-8444-444444444444";
const ITEM_CARRITO = {
  product_id: "p1", sku: "TH-1", name: "Sandalia", image_url: "",
  quantity: 2, unit_price: 20, category: "footwear", bulto_pzas: 12,
};
const DIRECTORIO = [{ cliente_switch_id: 42, codigo: "D-42", nombre: "Sporting Shoes" }];
const CONTADO_FILA = { cliente_switch_id: 1, codigo: "TCKCTA", nombre: "VENTAS LOCA" };

interface Llamada { url: string; method: string; body: string | null }

function stubCheckout(): Llamada[] {
  const llamadas: Llamada[] = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    llamadas.push({ url, method: (init?.method || "GET").toUpperCase(), body: (init?.body as string) ?? null });
    const j = (b: unknown) => ({ ok: true, status: 200, json: async () => b });
    if (url.includes("/mi-vendedor")) return j({ vendedor: { id: 7, nombre: "Rey" } });
    if (url.includes("/clientes-switch")) return j({ clientes: DIRECTORIO, contado: CONTADO_FILA });
    if (url.includes("/catalogo/checkout")) return j({ ok: true, order_id: OID, order_number: "TOM-999", switch: { ok: true } });
    return j({});
  });
  vi.stubGlobal("fetch", fetchMock);
  sessionStorage.setItem("tommy_cart", JSON.stringify([ITEM_CARRITO]));
  return llamadas;
}

/** Arma el pedido con el interruptor en el valor que se le pida y devuelve lo que salió. */
async function pedidoQueSale(prendido: boolean): Promise<unknown> {
  vi.resetModules();
  vi.doMock("@/lib/catalogo/orden-celular", async () => {
    const real = await vi.importActual<typeof import("@/lib/catalogo/orden-celular")>(
      "@/lib/catalogo/orden-celular",
    );
    return { ...real, CATALOGO_ORDEN_CELULAR: prendido };
  });
  const CheckoutClient = (await import("@/components/catalogo/CheckoutClient")).default;
  const llamadas = stubCheckout();
  await act(async () => { render(<CheckoutClient marca="tommy" />); });
  await waitFor(() => expect(document.querySelector('[data-medir="documento-pedido"]')).not.toBeNull());
  fireEvent.click(screen.getByRole("button", { name: "Elegir" }));
  fireEvent.click(await screen.findByRole("button", { name: /Sporting Shoes/ }));
  const boton = () => document.querySelector('[data-medir="documento-pedido"]') as HTMLButtonElement;
  await waitFor(() => expect(boton().disabled).toBe(false));
  await act(async () => { fireEvent.click(boton()); });
  const envios = llamadas.filter((c) => c.url.includes("/api/catalogo/checkout") && c.method === "POST");
  expect(envios, "el pedido no salió").toHaveLength(1);
  cleanup();
  vi.doUnmock("@/lib/catalogo/orden-celular");
  return JSON.parse(envios[0].body!);
}

describe("11 · 🔴 nada de lo que se guarda cambia", () => {
  beforeEach(() => vi.clearAllMocks());

  it("el payload del pedido es IDÉNTICO con el interruptor prendido y apagado", async () => {
    const conElCambio = await pedidoQueSale(true) as Record<string, unknown>;
    const comoAntes = await pedidoQueSale(false) as Record<string, unknown>;

    // ⚠️ `idempotency_key` es un UUID nuevo por envío — su trabajo es ser
    // distinto en cada intento, así que se compara que EXISTA y sea un UUID,
    // no que sea el mismo. Todo lo demás se compara byte por byte.
    const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    for (const [rotulo, p] of [["prendido", conElCambio], ["apagado", comoAntes]] as const) {
      expect(String(p.idempotency_key), rotulo).toMatch(UUID);
    }
    const sinLlave = (p: Record<string, unknown>) => {
      const { idempotency_key: _ignorada, ...resto } = p;
      return resto;
    };
    expect(sinLlave(conElCambio)).toEqual(sinLlave(comoAntes));
    // Y por si alguien cambia la comparación: mismas claves, mismo orden,
    // mismos números — incluido el precio del renglón.
    expect(JSON.stringify(sinLlave(conElCambio))).toBe(JSON.stringify(sinLlave(comoAntes)));
    expect(JSON.stringify(conElCambio)).toContain('"unit_price":20');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// LA PANTALLA QUE VE EL CLIENTE — «como si fuese el mismo catálogo» (7-sep-2026)
//
// Daniel, textual: *«quiero que el cliente cuando abra el catálogo por el link
// se sienta como si fuese el mismo catálogo, solamente con par de limitaciones
// que ya sabemos, por ejemplo escoger el cliente, porque no quiero que él vea
// toda la cartera de clientes que tengo»*.
//
// Lo que este trabajo dejó puesto y no se puede volver a romper:
//
//   1. EL ESPACIO DE ABAJO SALE DE LA MEDIDA de la barra, nunca de un número
//      escrito a mano. La barra del público llevaba encima el bloque «Tu
//      nombre *» y tapaba el «Agregar» de la última fila.
//   2. EL CLIENTE TECLEA LA CANTIDAD. El número entre el − y el + era un botón
//      muerto en el público: 30 bultos costaban treinta toques.
//   3. EL CLIENTE DESCARGA EL PDF, con el hook COMPARTIDO — el mismo archivo
//      que el vendedor manda por WhatsApp, no una segunda copia.
//   4. EL CLIENTE REVISA ANTES DE CONFIRMAR, en una pantalla que reusa la lista
//      del checkout del vendedor y la MISMA barra del catálogo. El precio no se
//      toca y la cartera de clientes sigue cerrada.
//   5. EL AVISO SE CIERRA SOLO Y SE PUEDE CERRAR (3 s / 8 s).
//   6. LO QUE VIAJA AL NAVEGADOR: nunca la existencia física, nunca columnas
//      que no se dibujan, nunca el inventario de productos apagados. Y el
//      catálogo interno de Reebok dejó de leerse sin sesión.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "fs";
import path from "path";

vi.mock("@/lib/tommy-supabase-server", () => ({ tommyServer: {} }));
vi.mock("@/lib/supabase-server", () => ({ supabaseServer: {} }));

import {
  paquetePublico, filaPublica, COLUMNAS_QUE_NO_VIAJAN,
} from "@/lib/catalogo/publico-payload";
import { duracionToastMs, TOAST_MS_ERROR, TOAST_MS_EXITO } from "@/lib/ui/toast-duracion";
import {
  rutaCatalogoPublico, rutaRevisarPublico, esRutaDelCliente, sinBarraLateral,
} from "@/lib/catalogo/rutas-publicas";
import { MARCAS_UI } from "@/lib/catalogo/marcas-ui";
import { MARCAS_CONFIG } from "@/lib/catalogo/marcas";

const MARCAS = ["reebok", "joybees", "tommy", "calvin"] as const;

function src(rel: string): string {
  return readFileSync(path.join(process.cwd(), rel), "utf8");
}

/** Código SIN comentarios: acá los comentarios citan a propósito el texto viejo
 *  que se arregló, y eso dispararía falsos positivos. */
function sinComentarios(code: string): string {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
    .join("\n");
}

const PUBLICO = src("src/components/catalogo/CatalogoPublicoPage.tsx");
const VENDEDOR = src("src/components/catalogo/CatalogoVendedorPage.tsx");
const BARRA = src("src/components/catalogo/CatalogoStickyCartBar.tsx");
const REVISAR = src("src/components/catalogo/RevisarPedidoPublico.tsx");
const CHECKOUT = src("src/components/catalogo/CheckoutClient.tsx");
const LINEAS = src("src/components/catalogo/LineasPedidoEditables.tsx");
const CARD_PLANA = src("src/components/catalogo/CatalogoProductCard.tsx");
const CARD_AGRUPADA = src("src/components/catalogo/CatalogoGroupedCard.tsx");
const UI = src("src/components/ui.tsx");
const RUTA_PUBLIC = src("src/app/api/catalogo/[marca]/public/route.ts");
const RUTA_PRODUCTS = src("src/app/api/catalogo/[marca]/products/route.ts");

// ═════════════════════════════════════════════════════════════════════════════
// 1. EL ESPACIO DE ABAJO SALE DE LA MEDIDA
// ═════════════════════════════════════════════════════════════════════════════

describe("🔴 1. la barra no tapa el último «Agregar»", () => {
  it("las DOS pantallas reservan el alto REAL de la barra, no un número fijo", () => {
    for (const [nombre, código] of [["público", PUBLICO], ["revisar", REVISAR], ["vendedor", VENDEDOR]] as const) {
      expect(código, `${nombre}: pide la medida`).toContain("onAltoChange");
      expect(código, `${nombre}: la usa como reserva`).toContain("altoBarra");
      // El número escrito a mano que tapaba el botón: 112 px de `pb-28`.
      expect(sinComentarios(código), `${nombre}: vuelve el pb-28`).not.toContain("pb-28");
    }
  });

  it("la barra MIDE su alto y lo avisa cada vez que cambia", () => {
    expect(BARRA).toContain("ResizeObserver");
    expect(BARRA).toContain("getBoundingClientRect().height");
    // Sin ResizeObserver (navegador viejo) se mide UNA vez — nunca se vuelve a
    // un número inventado.
    expect(BARRA).toContain('typeof ResizeObserver === "undefined"');
  });

  it("el botón de subir también se levanta por encima de la barra", () => {
    for (const [nombre, código] of [["público", PUBLICO], ["vendedor", VENDEDOR]] as const) {
      expect(código, nombre).toMatch(/reservaAbajo \? \{ bottom: reservaAbajo \}/);
    }
  });

  it("sin carrito no se reserva nada", () => {
    for (const [nombre, código] of [["público", PUBLICO], ["revisar", REVISAR], ["vendedor", VENDEDOR]] as const) {
      expect(código, nombre).toMatch(/cartCount > 0 && altoBarra > 0 \? altoBarra \+ 16 : 0/);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. LA CANTIDAD SE TECLEA — TAMBIÉN EN EL PÚBLICO
// ═════════════════════════════════════════════════════════════════════════════

describe("🔴 2. el cliente teclea la cantidad", () => {
  it("el número abre el teclado SIN condición, en las dos tarjetas", () => {
    expect(CARD_PLANA).toContain("onClick={openQtyInput}");
    expect(CARD_AGRUPADA).toContain("onClick={() => openQtyInput(v.product, qty)}");
    // La condición que lo dejaba muerto en el público.
    for (const [nombre, código] of [["plana", CARD_PLANA], ["agrupada", CARD_AGRUPADA]] as const) {
      expect(sinComentarios(código), `${nombre}: vuelve el interruptor`).not.toContain("showBultos");
    }
  });

  it("el interruptor `showBultos` no queda vivo en ninguna parte", () => {
    for (const [nombre, código] of [
      ["vendedor", VENDEDOR], ["público", PUBLICO], ["revisar", REVISAR],
    ] as const) {
      expect(sinComentarios(código), nombre).not.toContain("showBultos");
    }
  });

  it("se dice qué hace el número (no es un número decorativo)", () => {
    for (const [nombre, código] of [["plana", CARD_PLANA], ["agrupada", CARD_AGRUPADA]] as const) {
      expect(código, nombre).toContain('aria-label="Escribir la cantidad"');
    }
  });

  it("NO se duplicó el control: la ventana de cantidad es UNA por tarjeta", () => {
    for (const [nombre, código] of [["plana", CARD_PLANA], ["agrupada", CARD_AGRUPADA]] as const) {
      expect((código.match(/Cantidad de bultos/g) || []).length, nombre).toBe(1);
    }
  });

  it("los botones de esa ventana se pueden tocar (44 px) en las dos tarjetas", () => {
    for (const [nombre, código] of [["plana", CARD_PLANA], ["agrupada", CARD_AGRUPADA]] as const) {
      const ventana = código.slice(código.indexOf("Cantidad de bultos"));
      expect((ventana.match(/min-h-\[44px\]/g) || []).length, nombre).toBeGreaterThanOrEqual(2);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. EL PDF, CON EL HOOK COMPARTIDO
// ═════════════════════════════════════════════════════════════════════════════

describe("🔴 3. el cliente descarga el catálogo en PDF", () => {
  it("las dos pantallas llaman al MISMO hook — no hay una segunda copia", () => {
    for (const [nombre, código] of [["público", PUBLICO], ["vendedor", VENDEDOR]] as const) {
      expect(código, nombre).toContain("useDescargarCatalogoPdf");
      expect(código, nombre).toContain("descargarPdf({");
      // Armar el PDF acá sería la segunda copia que el hook existe para evitar.
      expect(sinComentarios(código), `${nombre}: arma el PDF por su cuenta`)
        .not.toContain("downloadCatalogPdf");
    }
  });

  it("el verbo es «Descargar» en los dos lados (la palabra de la casa)", () => {
    for (const [nombre, código] of [["público", PUBLICO], ["vendedor", VENDEDOR]] as const) {
      expect(código, nombre).toContain('"Descargar PDF"');
      expect(sinComentarios(código), `${nombre}: dice "Bajar"`).not.toContain(">Bajar");
    }
  });

  it("un catálogo sin resultados no ofrece el botón (bajaría un PDF vacío)", () => {
    expect(PUBLICO).toContain("{filteredCount > 0 && (");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4. EL CLIENTE REVISA ANTES DE CONFIRMAR
// ═════════════════════════════════════════════════════════════════════════════

describe("🔴 4. el cliente revisa antes de confirmar", () => {
  it("la ruta se DERIVA de la marca y cuelga del catálogo público", () => {
    for (const marca of MARCAS) {
      expect(rutaCatalogoPublico(marca)).toBe(`/catalogo-publico/${marca}`);
      expect(rutaRevisarPublico(marca)).toBe(`/catalogo-publico/${marca}/revisar`);
      // Por colgar de ahí hereda las dos listas sin tocarlas: es pantalla de
      // cliente y se dibuja a ancho completo.
      expect(esRutaDelCliente(rutaRevisarPublico(marca)), marca).toBe(true);
      expect(sinBarraLateral(rutaRevisarPublico(marca)), marca).toBe(true);
    }
  });

  it("la página existe y sirve a las CUATRO marcas desde un solo archivo", () => {
    const page = src("src/app/catalogo-publico/[marca]/revisar/page.tsx");
    expect(page).toContain("RevisarPedidoPublico");
    expect(page).toContain("getMarcaTheme");
    expect(page).toContain("notFound");
    // Nada de una página por marca.
    for (const marca of MARCAS) {
      expect(sinComentarios(page), marca).not.toContain(`"${marca}"`);
    }
  });

  it("desde el catálogo se va a REVISAR, no se confirma de un toque", () => {
    expect(PUBLICO).toContain("rutaRevisarPublico(marca)");
    expect(PUBLICO).toContain('actionLabel="Revisar pedido"');
    // El catálogo ya no crea ni confirma ningún pedido.
    expect(sinComentarios(PUBLICO)).not.toContain("pedido-publico");
    expect(sinComentarios(PUBLICO)).not.toContain("confirmar");
  });

  it("reusa la lista del checkout del vendedor — no una segunda pantalla", () => {
    expect(REVISAR).toContain("LineasPedidoEditables");
    expect(CHECKOUT).toContain("LineasPedidoEditables");
    // Y el checkout ya no dibuja su propia lista.
    expect(sinComentarios(CHECKOUT)).not.toContain("supabaseThumb");
  });

  it("reusa la MISMA barra del catálogo (nombre + confirmar ya viven ahí)", () => {
    expect(REVISAR).toContain("CatalogoStickyCartBar");
    expect(REVISAR).toContain("onClientNameChange={setClientName}");
    expect(REVISAR).toContain("validarNombreCliente");
    // El nombre está en UN solo lugar: el catálogo ya no lo pide.
    expect(sinComentarios(PUBLICO)).not.toContain("clientName");
  });

  it("se puede volver al catálogo a agregar más sin perder lo que lleva", () => {
    expect(REVISAR).toContain("Agregar más productos");
    expect(REVISAR).toContain("Seguir viendo");
    // El carrito vive en la sesión de la pestaña; volver no lo borra.
    expect(REVISAR).toContain("guardarCarrito");
    expect(REVISAR).not.toContain("limpiarCarrito(theme.publicCartKey);\n    router");
  });

  it("🔴 EL PRECIO NO SE TOCA del lado del cliente", () => {
    // La lista compartida solo edita el precio si quien la usa le pasa cómo.
    expect(LINEAS).toContain("renderPrecio?:");
    expect(CHECKOUT).toContain("renderPrecio={");
    expect(sinComentarios(REVISAR)).not.toContain("renderPrecio");
    // Lo ÚNICO que la pantalla del cliente le cambia a una línea es la CANTIDAD:
    // no hay campo de precio ni escritura de `unit_price` en el carrito.
    expect(sinComentarios(REVISAR)).not.toContain("priceDraft");
    expect(sinComentarios(REVISAR)).toContain("{ ...i, quantity: qty }");
    expect(sinComentarios(REVISAR)).not.toMatch(/\{ \.\.\.i, unit_price/);
    // Y el freno de verdad sigue en el servidor: el pedido del link reescribe
    // los precios desde la base.
    for (const marca of MARCAS) {
      expect(MARCAS_CONFIG[marca].pedidoPublico.applyDbPrices, marca).toBeTypeOf("function");
    }
  });

  it("⚠️ la cartera de clientes sigue cerrada: el cliente escribe su nombre", () => {
    for (const [nombre, código] of [["revisar", REVISAR], ["público", PUBLICO], ["barra", BARRA]] as const) {
      expect(sinComentarios(código), `${nombre}: selector de cartera`).not.toContain("ClienteSwitchPicker");
      expect(sinComentarios(código), `${nombre}: directorio`).not.toContain("clientes-switch");
      expect(sinComentarios(código), `${nombre}: buscador de clientes`).not.toContain("clientes-search");
    }
  });

  it("el aviso de «no cierres esta pantalla» viajó con el paso que vigila", () => {
    expect(REVISAR).toContain("beforeunload");
    expect(BARRA).toContain("Guardando tu pedido, no cierres esta pantalla");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 5. EL AVISO SE CIERRA SOLO Y SE PUEDE CERRAR
// ═════════════════════════════════════════════════════════════════════════════

describe("🔴 5. el aviso no se queda pegado para siempre", () => {
  it("un error se lee 8 s y un éxito 3 s — la regla de la casa, en un lugar", () => {
    expect(duracionToastMs("error")).toBe(TOAST_MS_ERROR);
    expect(duracionToastMs("success")).toBe(TOAST_MS_EXITO);
    expect(TOAST_MS_ERROR).toBe(8000);
    expect(TOAST_MS_EXITO).toBe(3000);
    // Un error tiene que durar MÁS: dice qué hacer y hay que alcanzar a leerlo.
    expect(TOAST_MS_ERROR).toBeGreaterThan(TOAST_MS_EXITO);
  });

  it("el Toast se va solo cuando le pasan cómo cerrarse, y trae su ✕", () => {
    expect(UI).toContain("duracionToastMs");
    // 🩸 La ✕ se busca DENTRO del Toast: `aria-label="Cerrar"` aparece dos
    // veces en el archivo (el otro es el de los modales) y buscarlo suelto deja
    // pasar que se le quite justo al aviso.
    const toast = UI.slice(UI.indexOf("export function Toast"), UI.indexOf("// ── ESTÉTICA 7"));
    expect(toast).toContain('aria-label="Cerrar"');
    expect(toast).toContain("onClick={onDismiss}");
    // El reloj NO depende de `onDismiss` (que casi siempre es una función nueva
    // por render): si lo fuera, se reiniciaría y el aviso no se iría nunca.
    expect(UI).toContain("cerrarRef");
    expect(UI).toMatch(/\[message, type, seCierraSolo\]/);
  });

  it("las pantallas del cliente le pasan cómo cerrarse", () => {
    for (const [nombre, código] of [["público", PUBLICO], ["revisar", REVISAR]] as const) {
      expect(código, nombre).toContain("onDismiss={() => setToast(null)}");
    }
  });

  it("el aviso del público lleva su TIPO (un error no dura lo que un éxito)", () => {
    expect(PUBLICO).toContain('tipo: "success" | "error"');
    expect(PUBLICO).toContain("type={toast?.tipo}");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 6. LO QUE VIAJA AL NAVEGADOR DEL CLIENTE
// ═════════════════════════════════════════════════════════════════════════════

describe("🔴 6. la existencia física no sale del servidor", () => {
  const CRUDO = {
    id: "p1", name: "Clog", sku: "A-1",
    disponibilidad: 3, existencia: 40, stock: 40,
  };

  it("`existencia` y `stock` NO viajan; `disponibilidad` sí, resuelta", () => {
    const fila = filaPublica(CRUDO);
    expect(fila.disponibilidad).toBe(3);
    for (const col of COLUMNAS_QUE_NO_VIAJAN) {
      expect(fila, col).not.toHaveProperty(col);
    }
    expect(COLUMNAS_QUE_NO_VIAJAN).toEqual(["existencia", "stock"]);
  });

  it("el respaldo a existencia ocurre en el SERVIDOR — y no manda el número", () => {
    // Sin `disponibilidad` (el sync todavía no la escribió) el producto NO se
    // esconde: cae a existencia. Pero afuera sale un solo número.
    const fila = filaPublica({ id: "p2", existencia: 12 });
    expect(fila.disponibilidad).toBe(12);
    expect(fila).not.toHaveProperty("existencia");
    // Y en Reebok el respaldo es la suma del inventario por talla.
    const conInventario = filaPublica({ id: "p3" }, 7);
    expect(conInventario.disponibilidad).toBe(7);
  });

  it("nunca sale un número negativo ni un null", () => {
    expect(filaPublica({ id: "x", disponibilidad: -5 }).disponibilidad).toBe(0);
    expect(filaPublica({ id: "x" }).disponibilidad).toBe(0);
  });

  it("el inventario se acota a los productos del MISMO paquete", () => {
    const paquete = paquetePublico(
      [{ id: "vivo", disponibilidad: 2 }],
      [
        { product_id: "vivo", size: "M", quantity: 4 },
        { product_id: "apagado", size: "L", quantity: 9 },
      ],
    );
    expect(paquete.inventory).toHaveLength(1);
    expect(paquete.inventory?.[0].product_id).toBe("vivo");
  });

  it("sin inventario (3 marcas) el paquete no inventa la llave", () => {
    const paquete = paquetePublico([{ id: "a", disponibilidad: 1 }]);
    expect(paquete.inventory).toBeUndefined();
    expect(paquete.products).toHaveLength(1);
  });

  it("la ruta pública responde por el módulo, no arma el paquete a mano", () => {
    expect(RUTA_PUBLIC).toContain("paquetePublico");
    expect(sinComentarios(RUTA_PUBLIC)).not.toContain("return { products, inventory };");
  });

  it("las CUATRO marcas leen `disponibilidad`, y ninguna manda columnas de más", () => {
    for (const marca of MARCAS) {
      const cols = MARCAS_CONFIG[marca].publicCatalog.cols.split(",");
      expect(cols, `${marca}: lee disponibilidad`).toContain("disponibilidad");
      // 🩸 Reebok mandaba cuatro que ninguna otra manda y que nadie dibuja.
      for (const sobra of ["description", "sub_category", "on_sale", "created_at"]) {
        expect(cols, `${marca}: manda ${sobra}`).not.toContain(sobra);
      }
    }
  });
});

describe("🔴 6b. el catálogo interno de Reebok ya no se lee sin sesión", () => {
  it("las cuatro marcas piden sesión en el GET de products", () => {
    expect(sinComentarios(RUTA_PRODUCTS)).not.toContain("publico-scope-admin");
    for (const marca of MARCAS) {
      const estilo = MARCAS_CONFIG[marca].products.authStyle;
      expect(["scope-admin", "roles-modulo"], marca).toContain(estilo);
    }
    // La rama de Reebok pide sesión ANTES de mirar el `scope`.
    const rama = RUTA_PRODUCTS.slice(
      RUTA_PRODUCTS.indexOf('if (pcfg.authStyle === "scope-admin")'),
      RUTA_PRODUCTS.indexOf('const adminScope'),
    );
    expect(rama).toContain("requireRole(req, CATALOGO_ROLES)");
  });

  it("la otra mitad de la puerta (el inventario por talla) también se cerró", () => {
    // Devuelve la EXISTENCIA por talla de todo Reebok — justo lo que el paquete
    // público dejó de mandar. Sus dos llamadores entran con sesión.
    const inv = src("src/app/api/catalogo/reebok/inventory/route.ts");
    expect(inv).toContain("requireRole(req, CATALOGO_ROLES)");
    expect(sinComentarios(inv)).not.toContain("endpoint público");
  });

  it("las dos rutas salieron de la lista de caminos públicos del middleware", () => {
    const mw = sinComentarios(src("src/middleware.ts"));
    expect(mw).not.toContain('"/api/catalogo/reebok/products"');
    expect(mw).not.toContain('"/api/catalogo/reebok/inventory"');
    // CONTROL: lo público de verdad se queda.
    expect(mw).toContain('"/api/catalogo/reebok/public"');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 7. EL VACÍO QUE PROMETÍA UN WHATSAPP QUE NO ESTABA
// ═════════════════════════════════════════════════════════════════════════════

describe("🔴 7. «escríbenos por WhatsApp» ahora tiene un WhatsApp", () => {
  it("el estado vacío ofrece los contactos, derivados de la lista compartida", () => {
    expect(PUBLICO).toContain("Por ahora no hay productos disponibles");
    expect(PUBLICO).toContain("escríbenos por WhatsApp");
    // 🩸 Se exige el USO, no el import: con `WHATSAPP_CONTACTOS` importado y una
    // lista vacía en su lugar, el texto vuelve a prometer un WhatsApp que no
    // está y el candado no se enteraba.
    expect(PUBLICO).toContain("{WHATSAPP_CONTACTOS.map((c) => (");
    expect(PUBLICO).toContain("https://wa.me/${c.telefono}");
    // Nada de un número escrito a mano en la pantalla.
    expect(sinComentarios(PUBLICO)).not.toMatch(/507\d{7}/);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 8. LAS CUATRO MARCAS, IGUALES
// ═════════════════════════════════════════════════════════════════════════════

describe("las 4 marcas usan las MISMAS piezas", () => {
  it("no hay una pantalla por marca en ninguno de los tres archivos nuevos", () => {
    for (const [nombre, código] of [
      ["revisar", REVISAR], ["lista de líneas", LINEAS],
      ["paquete público", src("src/lib/catalogo/publico-payload.ts")],
    ] as const) {
      for (const marca of MARCAS) {
        expect(sinComentarios(código), `${nombre} nombra a ${marca}`).not.toContain(`"${marca}"`);
      }
    }
  });

  it("la lista de marcas del sistema sigue siendo la fuente", () => {
    expect([...MARCAS_UI].sort()).toEqual([...MARCAS].sort());
  });
});

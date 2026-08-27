/**
 * ─────────────────────────────────────────────────────────────────────────────
 * 🔴 UNA SOLA PANTALLA DE COMPROBANTES — LO QUE NO PUEDE VOLVER (25-ago-2026)
 *
 * Daniel: *"En pedidos de los catálogos. En administrar y pedidos debería ser
 * la misma pestaña, no dos aparte."*
 *
 * Este archivo congela las cuatro cosas que hicieron falta para que fuera UNA,
 * y que son justamente las que un refactor distraído deshace:
 *
 *   1. La lista NO muestra pedidos borrados, y eso ya no es opcional por marca.
 *   2. El pedido del LINK sin convertir NO tiene `status` — y por lo tanto NO
 *      es un borrador. (Inventarle uno duplicaba el conteo del chip.)
 *   3. Nadie GANA ni PIERDE un permiso: las dos listas de roles y los guards de
 *      servidor de cada acción quedan exactamente donde estaban.
 *   4. `?tab=pedidos` sigue llegando.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect, vi } from "vitest";
import { makeDb } from "../helpers/catalogo-mock-db";
import { readFileSync } from "fs";
import path from "path";
import { MARCAS_CONFIG } from "@/lib/catalogo/marcas";
import {
  CATALOGO_ROLES,
  CATALOGO_ADMIN_ROLES,
  COMPROBANTES_ROLES,
  COMPROBANTES_EDITAR_ROLES,
} from "@/lib/catalogo/roles";
import { filaDeOrders, filasDeOrders } from "@/lib/catalogo/fila-comprobante";
import { tipoComprobante, contarComprobantes, estaEnSwitch } from "@/lib/catalogo/numeros-pedido";

const leer = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf-8");
/** El código sin comentarios: un candado que un comentario satisface no es candado. */
const soloCodigo = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const RUTA_ORDERS = "src/app/api/catalogo/[marca]/orders/route.ts";

// ── 1. Los borrados no se listan, y no hay marca exenta ─────────────────────

describe("🔴 la lista NUNCA trae los pedidos borrados", () => {
  it("el filtro está encadenado a la query, sin `if` que lo pueda saltar", () => {
    const src = soloCodigo(leer(RUTA_ORDERS));
    expect(src).toContain('.eq("deleted", false)');
    // El quirk viejo era `if (cfg.listaFiltraDeleted) query = query.eq(...)`.
    expect(src).not.toMatch(/if\s*\([^)]*[Dd]eleted[^)]*\)/);
    expect(src).not.toContain("listaFiltraDeleted");
  });

  it("🩸 el interruptor murió: ninguna marca lo declara", () => {
    // Valía `true` en 4 de 4 — no era una opción, era un interruptor que solo
    // servía para volver a apagarse.
    for (const cfg of Object.values(MARCAS_CONFIG)) {
      expect("listaFiltraDeleted" in cfg, `${cfg.marca} lo volvió a declarar`).toBe(false);
    }
  });
});

// ── 2. El pedido del link no es un borrador ─────────────────────────────────

describe("🔴 el pedido del LINK sin convertir NO es un borrador", () => {
  it("la ruta le manda `status: null`, no la palabra 'borrador'", () => {
    const src = soloCodigo(leer(RUTA_ORDERS));
    expect(src).toContain("status: null");
    expect(src).not.toContain('status: "borrador"');
  });

  it("cae en «Pedidos» y NO infla el conteo de «Borradores»", () => {
    const publico = filaDeOrders({
      id: "ab12cd34", order_number: null, client_name: "Nathalie",
      created_at: "2026-08-10T12:00:00Z", fuente: "publicos", del_link: true, status: null,
    });
    expect(publico.status).toBeNull();
    expect(tipoComprobante({ ...publico, numeroPedido: null, fuente: "publicos" })).toBe("pedido");

    // 6 públicos + 1 borrador de verdad: el conteo tiene que decir 1, no 7.
    const filas = [
      ...Array.from({ length: 6 }, (_, i) =>
        filaDeOrders({ id: `p${i}`, created_at: "2026-08-10T12:00:00Z", fuente: "publicos", del_link: true, status: null }),
      ),
      filaDeOrders({ id: "o-1", order_number: "PED-021", created_at: "2026-08-01T12:00:00Z", fuente: "orders", status: "borrador" }),
    ];
    const c = contarComprobantes(filas.map((f) => ({
      numeroPedido: f.numero_pedido, switchNumero: f.switch_numero,
      switchDocumento: f.switch_documento, status: f.status, fuente: f.fuente, enSwitch: f.en_switch,
    })));
    expect(c.borrador).toBe(1);
    expect(c.pedido).toBe(6);
    expect(c.pedido + c.cotizacion + c.borrador).toBe(filas.length);
  });
});

// ── 3. «Está en Switch» es tener envío, no tener número ─────────────────────

describe("🔴 un envío ACTIVO sin número sigue estando en Switch", () => {
  it("el booleano manda sobre el número (si no, se leía «no se ha mandado»)", () => {
    const f = filaDeOrders({
      id: "o-8", order_number: "PED-022", created_at: "2026-08-05T12:00:00Z",
      fuente: "orders", en_switch: true, switch_numero: null,
    });
    expect(f.en_switch).toBe(true);
    expect(estaEnSwitch({ switchNumero: f.switch_numero, enSwitch: f.en_switch })).toBe(true);
    // Y sin el booleano se sigue deduciendo del número, como siempre.
    expect(estaEnSwitch({ switchNumero: "16-000000503" })).toBe(true);
    expect(estaEnSwitch({ switchNumero: null })).toBe(false);
  });

  it("una COTIZACIÓN viaja en la fila y no se lee como pedido (TOM-027)", () => {
    const f = filaDeOrders({
      id: "o-27", order_number: "TOM-027", client_name: "A-Amani, S.A.",
      created_at: "2026-08-24T12:00:00Z", fuente: "orders",
      en_switch: true, switch_numero: "15-000000123", switch_documento: "cotizacion",
    });
    expect(f.switch_documento).toBe("cotizacion");
    expect(tipoComprobante({
      switchNumero: f.switch_numero, switchDocumento: f.switch_documento,
      status: f.status, enSwitch: f.en_switch,
    })).toBe("cotizacion");
  });

  it("un `documento` desconocido NO se cuela como si fuera válido", () => {
    const f = filaDeOrders({ id: "x", created_at: "2026-08-01T12:00:00Z", switch_documento: "factura" });
    expect(f.switch_documento).toBeNull();
  });
});

// ── 3b. CONDUCTA: la ruta de verdad, no solo el mapeo ───────────────────────
//
// 🩸 Este bloque existe porque la verificación por mutación lo pidió: con solo
// los candados del ADAPTADOR, poner `switch_documento: null` EN LA RUTA
// sobrevivía. El mapeo puro puede estar perfecto y la fila salir vacía igual.

describe("🔴 CONDUCTA — lo que el GET /orders manda de verdad", () => {
  const PEDIDOS = [
    { id: "o-27", order_number: "TOM-027", status: "confirmado", deleted: false, tommy_order_items: [] },
    { id: "o-26", order_number: "TOM-026", status: "confirmado", deleted: false, tommy_order_items: [] },
  ];
  const ENVIOS = [
    { order_id: "o-27", numero_interno: "15-000000123", pedido_switch_id: 9, documento: "cotizacion", estado: "verificado" },
    { order_id: "o-26", numero_interno: "15-000000122", pedido_switch_id: 8, documento: "pedido", estado: "verificado" },
  ];

  async function correrGet() {
    vi.resetModules();
    const cliente = makeDb();
    cliente.queue("products", { data: [] });
    cliente.queue("tommy_orders", { data: PEDIDOS });
    cliente.queue("tommy_switch_envios", { data: ENVIOS });
    cliente.queue("tommy_pedidos_publicos", { data: [] });
    vi.doMock("@/lib/catalogo/marcas", () => ({
      getMarcaConfig: () => ({
        marca: "tommy",
        db: async () => cliente,
        publicosDb: async () => cliente,
        publicosTable: "tommy_pedidos_publicos",
        ordersTable: "tommy_orders",
        enviosTable: "tommy_switch_envios",
        productsTable: "products",
        itemsRelation: "tommy_order_items",
        ordersSelectExtra: "",
        bultoSize: 12,
        categoryLookup: null,
        fallbackCategory: undefined,
        calcTotal: () => 0,
      }),
    }));
    vi.doMock("@/lib/require-auth", () => ({ getSession: () => ({ role: "admin" }) }));
    vi.doMock("@/lib/catalogo/bulto-productos", () => ({
      leerCategoriaYBulto: async () => ({ bultoPzasByProduct: new Map() }),
    }));
    const mod = await import("@/app/api/catalogo/[marca]/orders/route");
    const res = await mod.GET(
      { url: "http://x/api/catalogo/tommy/orders" } as never,
      { params: { marca: "tommy" } },
    );
    return { filas: (await res.json()) as Record<string, unknown>[], cliente };
  }

  it("🔴 la COTIZACIÓN sale rotulada como tal — TOM-027 es real en producción", async () => {
    const { filas } = await correrGet();
    const t27 = filas.find((f) => f.order_number === "TOM-027")!;
    expect(t27.switch_documento).toBe("cotizacion");
    expect(t27.switch_numero).toBe("15-000000123");
    expect(t27.en_switch).toBe(true);
    // Y el pedido de al lado NO se contagia.
    const t26 = filas.find((f) => f.order_number === "TOM-026")!;
    expect(t26.switch_documento).toBe("pedido");
  });

  it("🔴 la query pide `deleted = false` — es el filtro de vida", async () => {
    const { cliente } = await correrGet();
    const cadena = cliente.chainsFor("tommy_orders")[0];
    expect(cadena._calls.eq ?? []).toContainEqual(["deleted", false]);
  });
});

// ── 4. NADIE gana ni pierde un permiso ──────────────────────────────────────

describe("🔴 las listas de roles y los guards del servidor, intactos", () => {
  it("las dos listas siguen congeladas", () => {
    // 🔴 gerente_boston entró a VER el 27-ago-2026 («catalogo para david si,
    // solo eso»). NO entró a COMPROBANTES_ROLES — se verifica abajo.
    expect([...CATALOGO_ROLES]).toEqual([
      "admin", "secretaria", "vendedor", "bodega", "gerente_boston",
    ]);
    expect(CATALOGO_ROLES as readonly string[]).toContain("gerente_boston");
    expect(COMPROBANTES_ROLES as readonly string[]).not.toContain("gerente_boston");
    expect([...CATALOGO_ADMIN_ROLES]).toEqual(["admin", "secretaria"]);
  });

  it("🩸 el vendedor NO entró a `/catalogos/admin/` por la ventana", () => {
    // La pantalla unificada vive en la ruta del vendedor. Si alguien la mudara
    // al panel de administrar, el vendedor quedaría afuera — o habría que
    // abrirle un permiso. Ni una cosa ni la otra.
    const shell = soloCodigo(leer("src/app/catalogos/admin/[marca]/AdminCatalogoClient.tsx"));
    expect(shell).toContain("catalogoAdminRoles()");
    expect(shell).not.toContain("ComprobantesPanel");
    const pantalla = soloCodigo(leer("src/components/catalogo/PedidosListClient.tsx"));
    expect(pantalla).toContain("ComprobantesPanel");
    expect(pantalla).not.toContain("pedidos-unificado");
  });

  it("🔴 VER la lista: el trío + BODEGA (25-ago-2026), y sin copia a mano", () => {
    // Daniel: *"Dale acceso a bodega a la lista de pedidos."* Este candado
    // exigía el literal de tres roles — o sea que fijaba el permiso VIEJO.
    // Cambia de dirección, no se borra: hoy exige que la ruta NO tenga lista
    // propia y que la única lista, la constante, sea la de los cuatro.
    const src = soloCodigo(leer(RUTA_ORDERS));
    expect(src).toContain("comprobantesRoles()");
    expect(src, "volvió una copia escrita a mano en la ruta").not.toMatch(
      /VIEW_ROLES\s*=\s*\[/,
    );
    expect([...COMPROBANTES_ROLES]).toEqual(["admin", "secretaria", "vendedor", "bodega"]);
  });

  it("🔴 pero bodega NO entró a TRABAJAR el pedido: editar sigue sin ella", () => {
    expect([...COMPROBANTES_EDITAR_ROLES]).toEqual(["admin", "secretaria", "vendedor"]);
    const detalle = soloCodigo(leer("src/app/api/catalogo/[marca]/orders/[id]/route.ts"));
    expect(detalle).toMatch(/EDIT_ROLES\s*=\s*\["admin",\s*"secretaria",\s*"vendedor"\]/);
  });

  it("🔴 BORRAR sigue siendo de admin+secretaria — EN EL SERVIDOR", () => {
    // Ninguna acción se movió de cliente a servidor en este cambio: las tres
    // ya estaban cerradas en el servidor y ahí siguen.
    const detalle = soloCodigo(leer("src/app/api/catalogo/[marca]/orders/[id]/route.ts"));
    expect(detalle).toMatch(/DELETE_ROLES\s*=\s*\["admin",\s*"secretaria"\]/);
    for (const [ruta, rel] of [
      ["bulk-delete", "src/app/api/catalogo/[marca]/orders/bulk-delete/route.ts"],
      ["pedidos-export", "src/app/api/catalogo/[marca]/pedidos-export/route.ts"],
    ] as const) {
      expect(soloCodigo(leer(rel)), ruta).toMatch(/requireRole\(req,\s*\["admin",\s*"secretaria"\]\)/);
    }
  });

  it("esconder un botón NO es el candado, y está dicho", () => {
    const panel = leer("src/components/catalogo/ComprobantesPanel.tsx");
    expect(panel).toContain("puedeAdministrar");
    expect(panel).toContain("puedeEditar");
    expect(panel).toMatch(/NO ES EL CANDADO/);
  });
});

// ── 5. La URL vieja sigue llegando ──────────────────────────────────────────

describe("🔴 `?tab=pedidos` no se rompe", () => {
  it("la página redirige a la pantalla, usando la constante de la key", () => {
    const src = soloCodigo(leer("src/app/catalogos/admin/[marca]/page.tsx"));
    expect(src).toContain("redirect(");
    expect(src).toContain("/pedidos`");
    // 🩸 No alcanza con que la constante esté IMPORTADA: la comparación tiene
    // que usarla. Con `=== "comprobantes"` el import seguía ahí y un
    // `toContain("TAB_COMPROBANTES_KEY")` pasaba con el redirect apuntando a
    // una key que nadie tiene guardada. Lo cazó la mutación, no la lectura.
    expect(src).toMatch(/tab\s*===\s*TAB_COMPROBANTES_KEY/);
    // Y no quedó una segunda copia de la key escrita a mano.
    expect(src).not.toMatch(/tab\s*===\s*["'][^"']+["']/);
  });
});

// ── 6. El mapeo del feed, campo por campo ───────────────────────────────────

describe("la traducción del feed no pierde ni inventa nada", () => {
  it("del_link manda sobre el badge; la tabla física, sobre el routing", () => {
    // Un pedido del link YA CONVERTIDO vive en orders y se muestra "Del link".
    const convertido = filaDeOrders({
      id: "o-2", order_number: "PED-022", created_at: "2026-08-11T12:00:00Z",
      fuente: "orders", del_link: true,
    });
    expect(convertido.origen).toBe("link");
    expect(convertido.fuente).toBe("orders");

    const propio = filaDeOrders({ id: "o-1", created_at: "2026-08-01T12:00:00Z", fuente: "orders", del_link: false });
    expect(propio.origen).toBe("mio");
  });

  it("un cliente vacío se dice «Sin nombre», no queda en blanco", () => {
    expect(filaDeOrders({ id: "x", created_at: "2026-08-01T12:00:00Z", client_name: "  " }).cliente).toBe("Sin nombre");
    expect(filaDeOrders({ id: "x", created_at: "2026-08-01T12:00:00Z" }).cliente).toBe("Sin nombre");
  });

  it("los números que no llegan quedan en 0, no en NaN", () => {
    const f = filaDeOrders({ id: "x", created_at: "2026-08-01T12:00:00Z", total: null, item_count: null });
    expect(f.total).toBe(0);
    expect(f.item_count).toBe(0);
  });

  it("la lista entera conserva el orden en que llegó", () => {
    const filas = filasDeOrders([
      { id: "a", created_at: "2026-08-03T12:00:00Z" },
      { id: "b", created_at: "2026-08-02T12:00:00Z" },
    ]);
    expect(filas.map((f) => f.id_natural)).toEqual(["a", "b"]);
  });
});

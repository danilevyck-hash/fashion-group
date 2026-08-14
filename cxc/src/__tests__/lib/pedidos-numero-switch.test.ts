/**
 * ─────────────────────────────────────────────────────────────────────────────
 * TENER NÚMERO DE SWITCH ES LO QUE DECIDE LA PESTAÑA
 *
 * Daniel, 14-ago-2026: *"Tienen q haber dos secciones. Borradores y pedidos a
 * switch. Y en pedidos a switch tiene que estar el número de switch en el
 * pedido para saber cuál es cuál."*
 *
 * `numerosSwitchPorPedido` es la fuente ÚNICA de "¿está en Switch?", y usa el
 * MISMO criterio que el candado de edición (#236/#237): envío en estado
 * 'enviado' o 'verificado'. Si las dos preguntas se respondieran por caminos
 * distintos, un pedido podría estar bloqueado para editar y aparecer en
 * Borradores — o al revés.
 *
 * 🩸 POR QUÉ NO SE USA `status`, medido contra producción el 14-ago-2026 sobre
 * los 100 pedidos de toda la historia de los 4 catálogos:
 *   · 7 en `confirmado` NUNCA llegaron a Switch (PED-001/002/003/004 y
 *     TOM-007/008/009 — estos tres del 12-ago, o sea anteayer).
 *   · PED-018 decía `borrador` y SÍ está en Switch (#16-000000506).
 * `confirmado` se escribe ANTES de llamar a Switch y queda escrito aunque la
 * llamada falle.
 *
 * 🔴 Los fixtures son los envíos REALES de producción: los 31 activos de las 4
 * marcas están en `verificado` y los 31 tienen `numero_interno`.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect, vi } from "vitest";
import { numerosSwitchPorPedido } from "@/lib/catalogo/switch-lock";
import { makeDb } from "../helpers/catalogo-mock-db";

/** Los envíos tal como están en producción (reebok_switch_envios). */
const ENVIOS_REALES = [
  { order_id: "o-018", numero_interno: "16-000000506", pedido_switch_id: 506 },
  { order_id: "o-020", numero_interno: "16-000000510", pedido_switch_id: 510 },
];

function db(resultado: { data?: unknown; error?: unknown }) {
  const m = makeDb();
  m.queue("reebok_switch_envios", resultado);
  return m;
}

/** Los argumentos de un método encadenado sobre la tabla de envíos. */
function argsDe(m: ReturnType<typeof makeDb>, metodo: string): unknown[][] {
  const chains = m.chainsFor("reebok_switch_envios");
  return chains.flatMap((c) => (c._calls[metodo] as unknown[][] | undefined) ?? []);
}

// ─────────────────────────────────────────────────────────────────────────────
describe("numerosSwitchPorPedido — la entrada existe ⇔ el pedido está en Switch", () => {
  it("devuelve el número de cada pedido con envío activo", async () => {
    const m = await numerosSwitchPorPedido(
      db({ data: ENVIOS_REALES }) as never,
      "reebok_switch_envios",
      ["o-018", "o-020", "o-001"],
    );
    expect(m.get("o-018")).toBe("16-000000506");
    expect(m.get("o-020")).toBe("16-000000510");
    // El que nunca salió no tiene ENTRADA, no una entrada en null.
    expect(m.has("o-001")).toBe(false);
  });

  it("🔴 solo mira envíos 'enviado' o 'verificado' — el mismo criterio que el candado de edición", async () => {
    const cliente = db({ data: ENVIOS_REALES });
    await numerosSwitchPorPedido(cliente as never, "reebok_switch_envios", ["o-018"]);
    const enEstado = argsDe(cliente, "in").find((a) => a[0] === "estado");
    expect(enEstado, "tiene que acotar por estado").toBeTruthy();
    expect(enEstado![1]).toEqual(["enviado", "verificado"]);
  });

  it("un envío que falló NO cuenta como estar en Switch", async () => {
    // El doble devuelve lo que le den; lo que se prueba es que la consulta
    // pida solo los activos (arriba). Acá: sin filas → nadie en Switch.
    const m = await numerosSwitchPorPedido(
      db({ data: [] }) as never,
      "reebok_switch_envios",
      ["o-004"],
    );
    expect(m.has("o-004")).toBe(false);
  });

  it("⚠️ envío activo SIN número: la entrada EXISTE con número null", async () => {
    // Hoy son 0 casos en producción, pero el camino existe. Está en Switch, así
    // que no puede esconderse en Borradores; y no se inventa un "?".
    const m = await numerosSwitchPorPedido(
      db({ data: [{ order_id: "o-022", numero_interno: null, pedido_switch_id: null }] }) as never,
      "reebok_switch_envios",
      ["o-022"],
    );
    expect(m.has("o-022")).toBe(true);
    expect(m.get("o-022")).toBeNull();
  });

  it("cae al pedido_switch_id cuando falta numero_interno", async () => {
    const m = await numerosSwitchPorPedido(
      db({ data: [{ order_id: "o-9", numero_interno: null, pedido_switch_id: 777 }] }) as never,
      "reebok_switch_envios",
      ["o-9"],
    );
    expect(m.get("o-9")).toBe("777");
  });

  it("🔴 FALLA ABIERTO: si la tabla no responde, NADIE queda en «Pedidos a Switch»", async () => {
    // Fail-open hacia Borradores: es la lectura conservadora. Lo contrario
    // (mandar todo a Switch) afirmaría envíos que nadie puede probar.
    const m = await numerosSwitchPorPedido(
      db({ error: { message: "relation does not exist" } }) as never,
      "reebok_switch_envios",
      ["o-018", "o-020"],
    );
    expect(m.size).toBe(0);
  });

  it("sin pedidos no consulta nada", async () => {
    const cliente = db({ data: ENVIOS_REALES });
    const m = await numerosSwitchPorPedido(cliente as never, "reebok_switch_envios", []);
    expect(m.size).toBe(0);
    expect(cliente.chainsFor("reebok_switch_envios")).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 el GET /orders manda en_switch y switch_numero", () => {
  // El bug original de las pestañas fue que la LISTA no recibía el dato: por
  // eso no alcanza con probar el helper, hay que ver qué sale de la ruta.
  const PEDIDOS = [
    { id: "o-018", order_number: "PED-018", status: "borrador", reebok_order_items: [] },
    { id: "o-001", order_number: "PED-001", status: "confirmado", reebok_order_items: [] },
  ];

  async function correrGet() {
    vi.resetModules();
    const cliente = makeDb();
    cliente.queue("products", { data: [] });
    cliente.queue("reebok_orders", { data: PEDIDOS });
    cliente.queue("reebok_switch_envios", { data: [ENVIOS_REALES[0]] });
    vi.doMock("@/lib/catalogo/marcas", () => ({
      getMarcaConfig: () => ({
        marca: "reebok",
        db: async () => cliente,
        ordersTable: "reebok_orders",
        enviosTable: "reebok_switch_envios",
        productsTable: "products",
        itemsRelation: "reebok_order_items",
        ordersSelectExtra: "",
        listaFiltraDeleted: false,
        bultoSize: 12,
        categoryLookup: null,
        fallbackCategory: undefined,
      }),
    }));
    vi.doMock("@/lib/require-auth", () => ({ getSession: () => ({ role: "admin" }) }));
    vi.doMock("@/lib/catalogo/bulto-productos", () => ({
      leerCategoriaYBulto: async () => ({ bultoPzasByProduct: new Map() }),
    }));
    const mod = await import("@/app/api/catalogo/[marca]/orders/route");
    const res = await mod.GET(
      { url: "http://x/api/catalogo/reebok/orders" } as never,
      { params: { marca: "reebok" } },
    );
    return (await res.json()) as { order_number: string; en_switch: boolean; switch_numero: string | null }[];
  }

  it("PED-018 («borrador» en la base) sale en_switch=true con su número", async () => {
    const filas = await correrGet();
    const p18 = filas.find((f) => f.order_number === "PED-018")!;
    expect(p18.en_switch).toBe(true);
    expect(p18.switch_numero).toBe("16-000000506");
  });

  it("PED-001 («confirmado» en la base) sale en_switch=false y sin número", async () => {
    const filas = await correrGet();
    const p1 = filas.find((f) => f.order_number === "PED-001")!;
    expect(p1.en_switch).toBe(false);
    expect(p1.switch_numero).toBeNull();
  });

  it("los dos campos viajan SIEMPRE, en todas las filas", async () => {
    const filas = await correrGet();
    for (const f of filas) {
      expect(f, `${f.order_number} sin en_switch`).toHaveProperty("en_switch");
      expect(f, `${f.order_number} sin switch_numero`).toHaveProperty("switch_numero");
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// EL VENDEDOR DE SWITCH DEL PEDIDO — candados del servidor (12-ago-2026).
//
// Daniel: *"y que al momento de hacer el pedido en todos los catalogos, que se
// pueda poder cambiar de vendedor, eso es posible?"*. Cinco cosas que este
// archivo sostiene, y las cinco son de PLATA (el vendedor manda en la comisión):
//
//  1. EL DEFAULT SIGUE SIENDO EL DEL LOGIN. Sin `vendedor_id` en el body, el
//     checkout usa `fg_user_switch_vendedor` igual que siempre.
//  2. Elegir uno lo PERSISTE en el pedido (`vendedor_switch_id`) y es el que
//     viaja a Switch — no el del login.
//  3. Un id que no esté en la lista de ESA empresa se RECHAZA. Los ids son por
//     empresa: uno de otra empresa le acreditaría la venta a otra persona.
//  4. Un pedido YA en Switch no deja cambiarlo → 409, mismo criterio que el
//     cliente (allá el pedido ya vive en el ERP; acá además la comisión ya
//     quedó donde quedó).
//  5. El 422 SIN_VENDEDOR sobrevive INTACTO para quien no tiene mapeo NI eligió.
//
//  + La lista se pide UNA vez cada 15 min por empresa (sesión única de Switch).
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { makeDb, type MockDb } from "../helpers/catalogo-mock-db";
import { makeReq, TEST_SECRET } from "../helpers/catalogo-request";

let calvinDb: MockDb;
vi.mock("@/lib/calvin-supabase-server", () => ({
  calvinServer: {
    from: (t: string) => calvinDb.from(t),
    rpc: (...a: unknown[]) => calvinDb.rpc(...a),
  },
}));

let reebokDb: MockDb;
vi.mock("@/lib/reebok-supabase-server", () => ({
  reebokServer: {
    from: (t: string) => reebokDb.from(t),
    rpc: (...a: unknown[]) => reebokDb.rpc(...a),
  },
}));

let mainDb: MockDb;
vi.mock("@/lib/supabase-server", () => ({
  supabaseServer: {
    from: (t: string) => mainDb.from(t),
    rpc: (...a: unknown[]) => mainDb.rpc(...a),
  },
}));

// Switch: la lista de vendedores y el envío del pedido. `listVendedores` cuenta
// sus llamadas — es lo que prueba el caché de la sesión única.
const listVendedores = vi.fn(async () => ({
  vendedores: [
    { id: 7, nombre: "Ana Pérez" },
    { id: 9, nombre: "Beto Ruiz" },
  ],
  paginacion: {},
}));
vi.mock("@/lib/switch-api/client", () => ({
  createSwitchClient: () => ({ listVendedores }),
  logoutAllSwitchSessions: vi.fn(async () => {}),
}));

const enviarPedidoSwitch = vi.fn(async () => ({ kind: "ok", numeroInterno: "X-1", pedidoSwitchId: 1, verificado: true, warnings: [] }));
vi.mock("@/lib/catalogo/switch-envio", () => ({
  enviarPedidoSwitch: (...a: unknown[]) => enviarPedidoSwitch(...(a as [])),
}));
vi.mock("@/lib/catalogo/bulto-productos", () => ({
  leerCategoriaYBulto: vi.fn(async () => ({ categoryByProduct: new Map(), bultoPzasByProduct: new Map() })),
}));
vi.mock("@/lib/telegram", () => ({ sendTelegramAlert: vi.fn(async () => {}) }));

import { MARCAS_CONFIG } from "@/lib/catalogo/marcas";
import { clienteSwitchRoles } from "@/lib/catalogo/roles";
import {
  _resetCacheVendedores,
  buscarVendedor,
  nombreDeVendedor,
  ordenarVendedores,
  parsearVendedorSwitchId,
  TTL_VENDEDORES_MS,
  vendedoresDeEmpresa,
} from "@/lib/catalogo/vendedor-switch";
import {
  GET as vendedoresGet,
  PATCH as vendedoresPatch,
} from "@/app/api/catalogo/[marca]/vendedores-switch/route";
import { GET as listaGet } from "@/app/api/admin/switch-vendedores/route";
import { POST as checkoutPost } from "@/app/api/catalogo/checkout/route";

beforeAll(() => {
  process.env.SESSION_SECRET = TEST_SECRET;
});

const OID = "44444444-4444-4444-8444-444444444444";
const P1 = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  vi.clearAllMocks();
  _resetCacheVendedores();
  calvinDb = makeDb();
  reebokDb = makeDb();
  mainDb = makeDb();
});

const leer = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8");

/** Argumentos de un método encadenado sobre la i-ésima consulta a una tabla. */
function args(db: MockDb, tabla: string, metodo: string, i = 0): unknown[][] {
  const chain = db.chainsFor(tabla)[i];
  return (chain?._calls?.[metodo] as unknown[][]) ?? [];
}

// ─── 1. El módulo puro ───────────────────────────────────────────────────────

describe("parsearVendedorSwitchId", () => {
  it("acepta un id entero positivo", () => {
    expect(parsearVendedorSwitchId(7)).toEqual({ ok: true, id: 7 });
    expect(parsearVendedorSwitchId("9")).toEqual({ ok: true, id: 9 });
  });

  it("🔴 null NO es una elección válida (al revés que el cliente, donde es Contado)", () => {
    // Un pedido sin vendedor no se puede enviar, o cae en el fallback de la
    // marca y la comisión se la lleva quien no vendió. "Quitar el vendedor" no
    // es una operación que exista.
    const r = parsearVendedorSwitchId(null);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toContain("Elige el vendedor");
  });

  it("rechaza 0, negativos, decimales y basura", () => {
    for (const v of [0, -3, 1.5, "abc", {}, []]) {
      expect(parsearVendedorSwitchId(v).ok, String(v)).toBe(false);
    }
  });
});

describe("nombreDeVendedor", () => {
  it("cae al id cuando no hay nombre, y lo dice cuando no hay vendedor", () => {
    expect(nombreDeVendedor({ id: 7, nombre: "Ana Pérez" })).toBe("Ana Pérez");
    expect(nombreDeVendedor({ id: 7, nombre: null })).toBe("Vendedor 7");
    expect(nombreDeVendedor(null)).toBe("Sin vendedor asignado");
  });
});

describe("buscarVendedor / ordenarVendedores", () => {
  const lista = [{ id: 9, nombre: "Beto" }, { id: 7, nombre: "Ana" }];
  it("encuentra por id y devuelve null si no está", () => {
    expect(buscarVendedor(lista, 7)?.nombre).toBe("Ana");
    expect(buscarVendedor(lista, 99)).toBeNull();
  });
  it("ordena alfabético sin mutar el arreglo original", () => {
    expect(ordenarVendedores(lista).map((v) => v.nombre)).toEqual(["Ana", "Beto"]);
    expect(lista[0].id).toBe(9);
  });
});

// ─── 2. El caché (sesión única de Switch) ────────────────────────────────────

describe("⚠️ la lista se pide UNA vez cada 15 min por empresa", () => {
  it("un segundo pedido dentro de la ventana NO toca Switch", async () => {
    const traer = vi.fn(async () => [{ id: 7, nombre: "Ana" }]);
    const a = await vendedoresDeEmpresa("vistana", traer, 1_000);
    const b = await vendedoresDeEmpresa("vistana", traer, 1_000 + TTL_VENDEDORES_MS - 1);
    expect(traer).toHaveBeenCalledTimes(1);
    expect(a.desdeSwitch).toBe(true);
    expect(b.desdeSwitch).toBe(false);
    expect(b.vendedores).toEqual(a.vendedores);
  });

  it("vencida la ventana, vuelve a preguntar", async () => {
    const traer = vi.fn(async () => [{ id: 7, nombre: "Ana" }]);
    await vendedoresDeEmpresa("vistana", traer, 1_000);
    await vendedoresDeEmpresa("vistana", traer, 1_000 + TTL_VENDEDORES_MS + 1);
    expect(traer).toHaveBeenCalledTimes(2);
  });

  it("cada empresa tiene su propia lista (los ids son POR empresa)", async () => {
    const traer = vi.fn(async () => [{ id: 7, nombre: "Ana" }]);
    await vendedoresDeEmpresa("vistana", traer, 1_000);
    await vendedoresDeEmpresa("fashion_shoes", traer, 1_000);
    expect(traer).toHaveBeenCalledTimes(2);
  });

  it("🩸 si Switch se cae, sirve la lista vieja en vez de romper", async () => {
    let falla = false;
    const traer = vi.fn(async () => {
      if (falla) throw new Error("Switch caído");
      return [{ id: 7, nombre: "Ana" }];
    });
    await vendedoresDeEmpresa("vistana", traer, 1_000);
    falla = true;
    const r = await vendedoresDeEmpresa("vistana", traer, 1_000 + TTL_VENDEDORES_MS + 1);
    expect(r.vendedores).toEqual([{ id: 7, nombre: "Ana" }]);
    expect(r.fresco).toBe(false);
  });

  it("sin ninguna lista buena, el error se propaga (no se inventa una vacía)", async () => {
    const traer = vi.fn(async () => { throw new Error("Switch caído"); });
    await expect(vendedoresDeEmpresa("vistana", traer, 1_000)).rejects.toThrow("Switch caído");
  });
});

// ─── 3. La lista es UNA sola ruta, abierta a quien arma pedidos ──────────────

describe("🔴 la lista sale del MISMO endpoint que Sistema → Usuarios", () => {
  it("no existe una segunda ruta de vendedores bajo /api/catalogo", () => {
    const r = leer("src/app/api/catalogo/[marca]/vendedores-switch/route.ts");
    expect(r).not.toContain("listVendedores");
    expect(r).toContain("/api/admin/switch-vendedores");
    // El picker del navegador pega contra la ruta de admin, no contra otra.
    const picker = leer("src/components/catalogo/VendedorSwitchPicker.tsx");
    expect(picker).toContain("/api/admin/switch-vendedores?empresa=");
  });

  it("un vendedor (no admin) puede leer la lista", async () => {
    const res = await listaGet(makeReq("/api/admin/switch-vendedores?empresa=vistana", { role: "vendedor" }));
    expect(res.status).toBe(200);
    expect((await res.json()).vendedores).toHaveLength(2);
  });

  it("bodega NO puede (no arma pedidos)", async () => {
    const res = await listaGet(makeReq("/api/admin/switch-vendedores?empresa=vistana", { role: "bodega" }));
    expect(res.status).toBe(403);
  });

  it("una empresa que no es de catálogo se rechaza", async () => {
    const res = await listaGet(makeReq("/api/admin/switch-vendedores?empresa=confecciones_boston", { role: "admin" }));
    expect(res.status).toBe(400);
  });

  it("dos aperturas del selector = UNA sola consulta a Switch", async () => {
    await listaGet(makeReq("/api/admin/switch-vendedores?empresa=vistana", { role: "vendedor" }));
    await listaGet(makeReq("/api/admin/switch-vendedores?empresa=vistana", { role: "admin" }));
    expect(listVendedores).toHaveBeenCalledTimes(1);
  });
});

// ─── 4. PATCH: cambiar el vendedor del pedido ────────────────────────────────

const patchReq = (body: unknown, role = "vendedor") =>
  makeReq("/api/catalogo/calvin/vendedores-switch", { method: "PATCH", body, role });

describe("PATCH /vendedores-switch", () => {
  it("guarda el vendedor elegido y su nombre", async () => {
    calvinDb.queue("calvin_switch_envios", { data: null });
    calvinDb.queue("calvin_orders", { data: null, error: null });
    const res = await vendedoresPatch(patchReq({ orderId: OID, vendedorSwitchId: 9 }), { params: { marca: "calvin" } });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, vendedorSwitchId: 9, nombre: "Beto Ruiz" });

    const upd = args(calvinDb, "calvin_orders", "update")[0][0] as Record<string, unknown>;
    expect(upd.vendedor_switch_id).toBe(9);
    // El nombre visible del pedido acompaña al vendedor: dejarlo con el viejo
    // sería una pantalla mintiendo sobre a nombre de quién va.
    expect(upd.vendor_name).toBe("Beto Ruiz");
  });

  it("🔴 un id que no está en la lista de ESA empresa se rechaza (404)", async () => {
    calvinDb.queue("calvin_switch_envios", { data: null });
    const res = await vendedoresPatch(patchReq({ orderId: OID, vendedorSwitchId: 12345 }), { params: { marca: "calvin" } });
    expect(res.status).toBe(404);
    expect((await res.json()).error).toContain("Vistana International");
    expect(calvinDb.chainsFor("calvin_orders")).toHaveLength(0);
  });

  it("🔴 un pedido YA enviado a Switch responde 409 y no escribe nada", async () => {
    calvinDb.queue("calvin_switch_envios", { data: { id: "e1" } });
    const res = await vendedoresPatch(patchReq({ orderId: OID, vendedorSwitchId: 9 }), { params: { marca: "calvin" } });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain("no se puede cambiar");
    expect(calvinDb.chainsFor("calvin_orders")).toHaveLength(0);
  });

  it("un envío FALLIDO no bloquea (se puede corregir y reintentar)", async () => {
    // El route filtra `.neq("estado","error")`, así que un envío en error no
    // aparece en la consulta — el doble devuelve null y el cambio pasa.
    calvinDb.queue("calvin_switch_envios", { data: null });
    calvinDb.queue("calvin_orders", { data: null, error: null });
    const res = await vendedoresPatch(patchReq({ orderId: OID, vendedorSwitchId: 7 }), { params: { marca: "calvin" } });
    expect(res.status).toBe(200);
    const envios = args(calvinDb, "calvin_switch_envios", "neq")[0];
    expect(envios).toEqual(["estado", "error"]);
  });

  it("sin la columna (DDL pendiente) responde 503 con qué falta correr", async () => {
    calvinDb.queue("calvin_switch_envios", { data: null });
    calvinDb.queue("calvin_orders", { data: null, error: { message: 'column "vendedor_switch_id" does not exist' } });
    const res = await vendedoresPatch(patchReq({ orderId: OID, vendedorSwitchId: 9 }), { params: { marca: "calvin" } });
    expect(res.status).toBe(503);
    expect((await res.json()).error).toContain("calvin_orders");
  });

  it("bodega no puede cambiarlo", async () => {
    const res = await vendedoresPatch(patchReq({ orderId: OID, vendedorSwitchId: 9 }, "bodega"), { params: { marca: "calvin" } });
    expect(res.status).toBe(403);
  });

  it("los roles se DERIVAN de createRoles en las 4 marcas", async () => {
    for (const cfg of Object.values(MARCAS_CONFIG)) {
      const esperados = clienteSwitchRoles(cfg.createRoles);
      expect(esperados, cfg.marca).toContain("vendedor");
      expect(esperados, cfg.marca).not.toContain("cliente");
    }
    // Reebok trae el 'cliente' legacy en createRoles y no debe entrar.
    const res = await vendedoresPatch(
      makeReq("/api/catalogo/reebok/vendedores-switch", { method: "PATCH", body: { orderId: OID, vendedorSwitchId: 9 }, role: "cliente" }),
      { params: { marca: "reebok" } },
    );
    expect(res.status).toBe(403);
  });
});

// ─── 5. GET: qué vendedor tiene el pedido ────────────────────────────────────

describe("GET /vendedores-switch?orderId=", () => {
  it("devuelve el del pedido con su nombre", async () => {
    calvinDb.queue("calvin_orders", { data: { vendedor_switch_id: 7 } });
    mainDb.queue("fg_user_switch_vendedor", { data: { vendedor_nombre: "Ana Pérez" } });
    const res = await vendedoresGet(makeReq(`/api/catalogo/calvin/vendedores-switch?orderId=${OID}`, { role: "vendedor" }), { params: { marca: "calvin" } });
    expect(await res.json()).toEqual({ vendedorSwitchId: 7, nombre: "Ana Pérez", esFallback: false });
  });

  it("🩸 sin vendedor propio DICE el default de la marca en vez de callarse", async () => {
    // Reebok tiene fallback de piloto: el pedido va a salir a nombre de alguien
    // igual, y esconderlo es justo lo que este selector vino a evitar.
    reebokDb.queue("reebok_orders", { data: { vendedor_switch_id: null } });
    const res = await vendedoresGet(makeReq(`/api/catalogo/reebok/vendedores-switch?orderId=${OID}`, { role: "vendedor" }), { params: { marca: "reebok" } });
    const d = await res.json();
    expect(d.esFallback).toBe(true);
    expect(d.vendedorSwitchId).toBe(MARCAS_CONFIG.reebok.fallback!.vendedorId);
  });

  it("sin vendedor y sin fallback devuelve null (Tommy/Joybees/Calvin)", async () => {
    calvinDb.queue("calvin_orders", { data: { vendedor_switch_id: null } });
    const res = await vendedoresGet(makeReq(`/api/catalogo/calvin/vendedores-switch?orderId=${OID}`, { role: "vendedor" }), { params: { marca: "calvin" } });
    expect(await res.json()).toEqual({ vendedorSwitchId: null, nombre: null, esFallback: false });
  });
});

// ─── 6. Checkout: default del login, override explícito, 422 intacto ─────────

const cart = [{ product_id: P1, sku: "S1", name: "P1", quantity: 1, unit_price: 10 }];
const checkoutReq = (extra: Record<string, unknown> = {}) =>
  makeReq("/api/catalogo/checkout", {
    method: "POST",
    role: "vendedor",
    body: { marca: "calvin", cliente: { id: 5, nombre: "ACME" }, items: cart, idempotency_key: "k1", ...extra },
  });

function pedidoCreado() {
  calvinDb.queueRpc({ data: { order_id: OID, order_number: "CK-001", already_created: false } });
  calvinDb.queue("calvin_orders", { data: null, error: null });
}

describe("POST /checkout — el vendedor", () => {
  it("🔴 SIN elección usa el del login, como siempre", async () => {
    mainDb.queue("fg_user_switch_vendedor", { data: { vendedor_id: 7, vendedor_nombre: "Ana Pérez" } });
    pedidoCreado();
    const res = await checkoutPost(checkoutReq());
    expect(res.status).toBe(200);
    expect(enviarPedidoSwitch.mock.calls[0][0]).toMatchObject({ vendedorId: 7, vendedorNombre: "Ana Pérez" });
    // Y no se le preguntó nada a Switch: el default no cuesta una sesión.
    expect(listVendedores).not.toHaveBeenCalled();
  });

  it("🔴 CON elección usa el elegido, y es el que se guarda en el pedido", async () => {
    mainDb.queue("fg_user_switch_vendedor", { data: { vendedor_id: 7, vendedor_nombre: "Ana Pérez" } });
    pedidoCreado();
    const res = await checkoutPost(checkoutReq({ vendedor_id: 9 }));
    expect(res.status).toBe(200);
    expect(enviarPedidoSwitch.mock.calls[0][0]).toMatchObject({ vendedorId: 9, vendedorNombre: "Beto Ruiz" });
    const upd = args(calvinDb, "calvin_orders", "update")[0][0] as Record<string, unknown>;
    expect(upd.vendedor_switch_id).toBe(9);
    const rpc = calvinDb.rpc.mock.calls[0][1] as Record<string, unknown>;
    expect(rpc.p_vendor_name).toBe("Beto Ruiz");
  });

  it("un vendedor de otra empresa se rechaza (404) y NO crea el pedido", async () => {
    mainDb.queue("fg_user_switch_vendedor", { data: { vendedor_id: 7, vendedor_nombre: "Ana Pérez" } });
    const res = await checkoutPost(checkoutReq({ vendedor_id: 4242 }));
    expect(res.status).toBe(404);
    expect(calvinDb.rpc.mock.calls).toHaveLength(0);
  });

  it("🔴 sin mapeo Y sin elección sigue siendo el 422 SIN_VENDEDOR de siempre", async () => {
    mainDb.queue("fg_user_switch_vendedor", { data: null });
    const res = await checkoutPost(checkoutReq());
    expect(res.status).toBe(422);
    const d = await res.json();
    expect(d.code).toBe("SIN_VENDEDOR");
    expect(d.error).toContain("pídele al admin asignarlo en Sistema → Usuarios");
  });

  it("sin mapeo PERO con elección, el pedido sale (esa era la salida que faltaba)", async () => {
    mainDb.queue("fg_user_switch_vendedor", { data: null });
    pedidoCreado();
    const res = await checkoutPost(checkoutReq({ vendedor_id: 9 }));
    expect(res.status).toBe(200);
    expect(enviarPedidoSwitch.mock.calls[0][0]).toMatchObject({ vendedorId: 9, vendedorNombre: "Beto Ruiz" });
  });
});

// ─── 7. Candados de código ───────────────────────────────────────────────────

describe("🔴 candados que no se pueden aflojar", () => {
  it("el detalle y el checkout muestran el vendedor SIEMPRE (no solo al abrir el selector)", () => {
    const detalle = leer("src/components/catalogo/PedidoDetalleClient.tsx");
    expect(detalle).toContain(">Vendedor<");
    expect(detalle).toContain("nombreDeVendedor(vendedorSwitch)");
    const checkout = leer("src/components/catalogo/CheckoutClient.tsx");
    expect(checkout).toContain("nombreDeVendedor(vendedor)");
    // La bajada "La venta se le acredita a esta persona." se podó el
    // 25-ago-2026 (aprobada por Daniel). Lo que este candado protege —que el
    // vendedor se VEA siempre, no solo con el selector abierto— no se aflojó:
    // lo prueban el rótulo y el nombre de arriba. Que el texto no vuelva lo
    // fija `poda-textos-cxc-multifashion.test.ts`.
    expect(checkout).toContain('text-gray-400">Vendedor<');
  });

  it("el checkout manda el vendedor elegido en el body", () => {
    expect(leer("src/components/catalogo/CheckoutClient.tsx")).toContain("vendedor_id: vendedor?.id ?? null");
  });

  it("el picker NO pide la lista por tecla (filtra en el navegador)", () => {
    const picker = leer("src/components/catalogo/VendedorSwitchPicker.tsx");
    // El fetch depende SOLO de la empresa: si `query` entrara en las
    // dependencias del efecto, cada tecla sería un login contra Switch.
    expect(picker).toMatch(/\}, \[empresa\]\);/);
    expect(picker).not.toMatch(/\[empresa, query\]/);
  });
});

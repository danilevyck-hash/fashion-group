import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/catalogo/{reebok,joybees}/orders/bulk-delete
// Eliminación masiva de pedidos: soft-delete por fuente, roles, mezcla
// enviados/no enviados a Switch, reporte por-ítem y auditoría (logActivity).
// ─────────────────────────────────────────────────────────────────────────────

// Clients por marca/tabla (mismos que los DELETE individuales):
// reebok_orders + reebok_switch_envios → reebokServer,
// reebok_pedidos_publicos → supabaseServer, joybees_* → joybeesServer.
const reebokFrom = vi.fn();
vi.mock("@/lib/reebok-supabase-server", () => ({
  reebokServer: { from: (...args: unknown[]) => reebokFrom(...args) },
}));
const mainFrom = vi.fn();
vi.mock("@/lib/supabase-server", () => ({
  supabaseServer: { from: (...args: unknown[]) => mainFrom(...args) },
}));
const joybeesFrom = vi.fn();
vi.mock("@/lib/joybees-supabase-server", () => ({
  joybeesServer: { from: (...args: unknown[]) => joybeesFrom(...args) },
}));

const mockLogActivity = vi.fn();
vi.mock("@/lib/log-activity", () => ({
  logActivity: (...args: unknown[]) => mockLogActivity(...args),
}));

// PR-1: rutas dinámicas [marca] — un solo handler por endpoint; los wrappers
// inyectan la marca del segmento (mismas aserciones que el arnés de PR-0).
import { POST as bulkDeletePost } from "@/app/api/catalogo/[marca]/orders/bulk-delete/route";
import { NextRequest } from "next/server";
const reebokPost = (req: NextRequest) => bulkDeletePost(req, { params: { marca: "reebok" } });
const joybeesPost = (req: NextRequest) => bulkDeletePost(req, { params: { marca: "joybees" } });
import { signSession } from "@/lib/session-cookie";

beforeAll(() => {
  process.env.SESSION_SECRET = "test-secret-bulk-delete-0123456789abcdef";
});

function makeRequest(marca: string, body: unknown, role?: string): NextRequest {
  const req = new NextRequest(`http://localhost/api/catalogo/${marca}/orders/bulk-delete`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (role) {
    req.cookies.set(
      "cxc_session",
      signSession({ role, userId: "u1", userName: "Tester", sessionToken: "tok-1" }),
    );
  }
  return req;
}

// Builder encadenable estilo PostgREST: cualquier método devuelve el chain y
// el chain es awaitable (thenable) con el resultado configurado.
type QueryResult = { data: unknown; error: unknown };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeChain(result: QueryResult): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = { _calls: {} as Record<string, unknown[][]> };
  for (const m of ["select", "update", "in", "eq"]) {
    chain[m] = vi.fn((...args: unknown[]) => {
      (chain._calls[m] ||= []).push(args);
      return chain;
    });
  }
  chain.then = (onF?: (v: QueryResult) => unknown, onR?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(onF, onR);
  return chain;
}

const U1 = "11111111-1111-4111-8111-111111111111";
const U2 = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/catalogo/reebok/orders/bulk-delete — auth", () => {
  it("401 sin sesión", async () => {
    const res = await reebokPost(makeRequest("reebok", { pedidos: [{ id: U1, fuente: "orders" }] }));
    expect(res.status).toBe(401);
  });

  it("403 para vendedor (solo admin y secretaria)", async () => {
    const res = await reebokPost(
      makeRequest("reebok", { pedidos: [{ id: U1, fuente: "orders" }] }, "vendedor"),
    );
    expect(res.status).toBe(403);
    expect(reebokFrom).not.toHaveBeenCalled();
  });

  it("secretaria puede eliminar", async () => {
    const envios = makeChain({ data: [], error: null });
    const orders = makeChain({ data: [{ id: U1 }], error: null });
    reebokFrom.mockImplementation((t: string) => (t === "reebok_switch_envios" ? envios : orders));

    const res = await reebokPost(
      makeRequest("reebok", { pedidos: [{ id: U1, fuente: "orders" }] }, "secretaria"),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.eliminados).toBe(1);
    expect(json.fallidos).toBe(0);
  });
});

describe("POST /api/catalogo/reebok/orders/bulk-delete — body", () => {
  it("400 sin lista de pedidos", async () => {
    const res = await reebokPost(makeRequest("reebok", {}, "admin"));
    expect(res.status).toBe(400);
  });

  it("400 con fuente inválida", async () => {
    const res = await reebokPost(
      makeRequest("reebok", { pedidos: [{ id: U1, fuente: "otra" }] }, "admin"),
    );
    expect(res.status).toBe(400);
  });

  it("400 con lista vacía", async () => {
    const res = await reebokPost(makeRequest("reebok", { pedidos: [] }, "admin"));
    expect(res.status).toBe(400);
  });
});

describe("POST /api/catalogo/reebok/orders/bulk-delete — fuentes mixtas y Switch", () => {
  it("soft-borra orders en reebok_orders (reebokServer) y publicos en reebok_pedidos_publicos (supabaseServer), reportando en_switch", async () => {
    // U1 ya está en Switch (envío verificado); U2 nunca se envió.
    const envios = makeChain({
      data: [{ order_id: U1, numero_interno: "16-000000489", pedido_switch_id: 489 }],
      error: null,
    });
    const orders = makeChain({ data: [{ id: U1 }, { id: U2 }], error: null });
    reebokFrom.mockImplementation((t: string) => {
      if (t === "reebok_switch_envios") return envios;
      if (t === "reebok_orders") return orders;
      throw new Error(`tabla inesperada en reebokServer: ${t}`);
    });
    const publicos = makeChain({ data: [{ short_id: "abc123" }], error: null });
    mainFrom.mockImplementation((t: string) => {
      if (t === "reebok_pedidos_publicos") return publicos;
      throw new Error(`tabla inesperada en supabaseServer: ${t}`);
    });

    const res = await reebokPost(
      makeRequest(
        "reebok",
        {
          pedidos: [
            { id: U1, fuente: "orders" },
            { id: U2, fuente: "orders" },
            { id: "abc123", fuente: "publicos" },
          ],
        },
        "admin",
      ),
    );
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json.eliminados).toBe(3);
    expect(json.fallidos).toBe(0);
    // El ya enviado sale en en_switch con su numero_interno.
    expect(json.en_switch).toEqual([{ id: U1, numero: "16-000000489" }]);
    expect(json.resultados).toEqual([
      { id: U1, fuente: "orders", ok: true, switch_numero: "16-000000489" },
      { id: U2, fuente: "orders", ok: true, switch_numero: null },
      { id: "abc123", fuente: "publicos", ok: true, switch_numero: null },
    ]);

    // SOFT delete (deleted=true + deleted_at), nunca .delete() físico.
    const ordersPayload = orders._calls.update[0][0] as Record<string, unknown>;
    expect(ordersPayload.deleted).toBe(true);
    expect(typeof ordersPayload.deleted_at).toBe("string");
    expect(orders._calls.in[0]).toEqual(["id", [U1, U2]]);
    const publicosPayload = publicos._calls.update[0][0] as Record<string, unknown>;
    expect(publicosPayload.deleted).toBe(true);
    expect(publicos._calls.in[0]).toEqual(["short_id", ["abc123"]]);
    // Los envíos activos se consultan con el criterio del candado (#236/#237).
    expect(envios._calls.in).toEqual([
      ["order_id", [U1, U2]],
      ["estado", ["enviado", "verificado"]],
    ]);
  });

  it("reporta por-ítem: no encontrado e id inválido sin tumbar el batch", async () => {
    const envios = makeChain({ data: [], error: null });
    // Solo U1 existe — U2 no aparece en el resultado del update.
    const orders = makeChain({ data: [{ id: U1 }], error: null });
    reebokFrom.mockImplementation((t: string) => (t === "reebok_switch_envios" ? envios : orders));

    const res = await reebokPost(
      makeRequest(
        "reebok",
        {
          pedidos: [
            { id: U1, fuente: "orders" },
            { id: U2, fuente: "orders" },
            { id: "no-es-uuid", fuente: "orders" },
          ],
        },
        "admin",
      ),
    );
    const json = await res.json();
    expect(json.eliminados).toBe(1);
    expect(json.fallidos).toBe(2);
    expect(json.resultados[1]).toMatchObject({ id: U2, ok: false, error: "No encontrado" });
    expect(json.resultados[2]).toMatchObject({ id: "no-es-uuid", ok: false, error: "Id inválido" });
    // El id malformado NO va al .in() (tumbaría el batch completo en PostgREST).
    expect(orders._calls.in[0]).toEqual(["id", [U1, U2]]);
  });

  it("audita vía logActivity con usuario, ids y números de Switch", async () => {
    const envios = makeChain({
      data: [{ order_id: U1, numero_interno: "16-000000500", pedido_switch_id: 500 }],
      error: null,
    });
    const orders = makeChain({ data: [{ id: U1 }], error: null });
    reebokFrom.mockImplementation((t: string) => (t === "reebok_switch_envios" ? envios : orders));

    await reebokPost(makeRequest("reebok", { pedidos: [{ id: U1, fuente: "orders" }] }, "admin"));

    expect(mockLogActivity).toHaveBeenCalledTimes(1);
    const [role, action, module, details, userName] = mockLogActivity.mock.calls[0];
    expect(role).toBe("admin");
    expect(action).toBe("pedidos_bulk_delete");
    expect(module).toBe("catalogo_reebok");
    expect(userName).toBe("Tester");
    expect(details).toMatchObject({
      total: 1,
      eliminados: 1,
      orders: [U1],
      en_switch: [{ id: U1, numero: "16-000000500" }],
    });
  });
});

describe("POST /api/catalogo/joybees/orders/bulk-delete — paridad", () => {
  it("ambas fuentes van a joybeesServer (joybees_orders + joybees_pedidos_publicos)", async () => {
    const envios = makeChain({ data: [], error: null });
    const orders = makeChain({ data: [{ id: U1 }], error: null });
    const publicos = makeChain({ data: [{ short_id: "jb1234" }], error: null });
    joybeesFrom.mockImplementation((t: string) => {
      if (t === "joybees_switch_envios") return envios;
      if (t === "joybees_orders") return orders;
      if (t === "joybees_pedidos_publicos") return publicos;
      throw new Error(`tabla inesperada en joybeesServer: ${t}`);
    });

    const res = await joybeesPost(
      makeRequest(
        "joybees",
        {
          pedidos: [
            { id: U1, fuente: "orders" },
            { id: "jb1234", fuente: "publicos" },
          ],
        },
        "secretaria",
      ),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.eliminados).toBe(2);
    // Nada de Joybees toca los clients de Reebok/principal.
    expect(reebokFrom).not.toHaveBeenCalled();
    expect(mainFrom).not.toHaveBeenCalled();
    expect(mockLogActivity.mock.calls[0][2]).toBe("catalogo_joybees");
  });

  it("403 para bodega", async () => {
    const res = await joybeesPost(
      makeRequest("joybees", { pedidos: [{ id: U1, fuente: "orders" }] }, "bodega"),
    );
    expect(res.status).toBe(403);
    expect(joybeesFrom).not.toHaveBeenCalled();
  });
});

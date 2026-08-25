// ─────────────────────────────────────────────────────────────────────────────
// ENVIAR A SWITCH EN UN SOLO TOQUE — la pantalla REAL, tocada de verdad.
//
// Los tests de función pura no pueden ver lo que importa acá: que el toque
// llegue hasta el POST real sin modal en el medio, que un problema lo detenga
// ANTES de escribir en el ERP, y que un doble toque no cree dos pedidos.
//
// 🔴 NADA de esto llega a Switch: `fetch` está stubbeado y se cuentan los POST
// reales (body `{}`) contra los dry-run (body `{"dry":true}`).
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, act } from "@testing-library/react";
import PedidoDetalleClient from "@/components/catalogo/PedidoDetalleClient";

const OID = "33333333-3333-4333-8333-333333333333";

// ⚠️ El router y los params van ESTABLES entre renders: `load` es un
// useCallback con `router` en sus deps, así que un objeto nuevo por render lo
// invalidaría y el efecto que lo llama se dispararía sin fin.
const ROUTER = { push: vi.fn(), replace: vi.fn() };
const PARAMS = { id: OID, marca: "reebok" };
vi.mock("next/navigation", () => ({
  useRouter: () => ROUTER,
  useParams: () => PARAMS,
  usePathname: () => `/catalogo/reebok/pedido/${OID}`,
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/hooks/useSidebarCollapsed", () => ({
  useSidebarCollapsed: () => false,
  readSidebarCollapsed: () => false,
}));

const ITEM = {
  id: "i1", product_id: "p1", sku: "SKU-1", name: "Zapato", image_url: "",
  quantity: 2, unit_price: 16.5, category: "footwear", bulto_pzas: 12, precio_lista: 16.5,
};

const PREVIEW_LIMPIO = {
  cliente: "Sporting Shoes (id 42)", vendedor: "Reinaldo (id 2)",
  lineas: [{ sku: "SKU-1", descripcionSwitch: "ZAPATO", bultos: 2, piezas: 24, precioCatalogo: 16.5, precioSwitch: 16.5 }],
  warnings: [], avisos: [], totalPiezas: 24, totalEstimado: 396,
};

const CREADO = { ok: true, numeroInterno: "16-000000999", pedidoSwitchId: 999, verificado: true, warnings: [] };

interface Escenario {
  status?: string;
  items?: Record<string, unknown>[];
  /**
   * Respuesta del toque (`auto:true`): el servidor pre-valida y CREA en el
   * mismo viaje. Por defecto, pedido creado.
   */
  auto?: { ok: boolean; status: number; body: Record<string, unknown> };
  /** Respuesta del POST de creación directa (body `{}`) — el "Enviar igual". */
  real?: { ok: boolean; status: number; body: Record<string, unknown> };
  permiso?: Record<string, unknown>;
}

/** Stub de `fetch` que registra cada llamada. Devuelve el registro. */
function stubApi(e: Escenario = {}) {
  const llamadas: { url: string; method: string; body: string | null }[] = [];
  const auto = e.auto ?? { ok: true, status: 200, body: CREADO };
  const real = e.real ?? { ok: true, status: 200, body: CREADO };

  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = (init?.method || "GET").toUpperCase();
    const body = (init?.body as string) ?? null;
    llamadas.push({ url, method, body });
    const j = (ok: boolean, status: number, b: unknown) => ({ ok, status, json: async () => b });

    if (url.includes("/enviar-switch") && method === "GET") return j(true, 200, { envio: null });
    if (url.includes("/enviar-switch") && method === "POST") {
      const esAuto = !!body && body.includes('"auto":true');
      const r = esAuto ? auto : real;
      return j(r.ok, r.status, r.body);
    }
    if (url.includes("/permiso-precio")) return j(true, 200, e.permiso ?? { permiso: true, verificado: true, mensaje: null });
    if (url.includes("/clientes-switch")) return j(true, 200, { clienteSwitchId: 42, nombre: "Sporting Shoes", codigo: "D-42" });
    if (url.includes("/clientes-search")) return j(true, 200, []);
    if (url.includes(`/orders/${OID}`) && method === "PUT") return j(true, 200, { ok: true });
    if (url.includes(`/orders/${OID}`)) {
      return j(true, 200, {
        id: OID, order_number: "PED-100", client_name: "Sporting Shoes", comment: "",
        status: e.status ?? "borrador", total: 396, created_at: "2026-08-12T12:00:00Z",
        reebok_order_items: e.items ?? [ITEM],
      });
    }
    return j(true, 200, {});
  });
  vi.stubGlobal("fetch", fetchMock);
  return llamadas;
}

type Llamada = { url: string; method: string; body: string | null };

/** TODOS los POST que pueden llegar a crear el pedido. */
const postsEnvio = (l: Llamada[]) => l.filter((c) => c.url.includes("/enviar-switch") && c.method === "POST");
/** El toque único: pre-valida y crea en UN viaje. */
const toquesAuto = (l: Llamada[]) => postsEnvio(l).filter((c) => (c.body || "").includes('"auto":true'));
/** Creación DIRECTA, sin pre-validar (el "Enviar igual" del modal). */
const creacionesDirectas = (l: Llamada[]) => postsEnvio(l).filter((c) => !(c.body || "").includes('"auto":true'));

/**
 * 25-ago-2026: ya NO hay un botón "Enviar a Switch". Están las DOS salidas,
 * "Pedido" y "Cotización", y tocarlas manda directo — sin ventana en el medio.
 * Todo lo que este archivo fija sigue midiéndose sobre el camino COMPLETO: qué
 * POST sale, cuántos, y qué pasa si se toca dos veces.
 */
const opcion = (clave: "pedido" | "cotizacion") =>
  document.querySelector(`[data-medir="documento-${clave}"]`) as HTMLButtonElement | null;

async function montar() {
  render(<PedidoDetalleClient marca="reebok" />);
  await waitFor(() => expect(opcion("pedido")).not.toBeNull());
  return opcion("pedido")!;
}

async function tocarEnviar(btn: HTMLElement, clave: "pedido" | "cotizacion" = "pedido") {
  const o = clave === "pedido" ? (btn as HTMLButtonElement) : opcion(clave);
  if (!o || o.disabled) return null; // apagado: esa salida no se ofrece
  await act(async () => { fireEvent.click(o); });
  return o;
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  sessionStorage.setItem("cxc_role", "admin");
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

// ── El camino normal ─────────────────────────────────────────────────────────

describe("un solo toque", () => {
  it("🔴 se ofrecen LAS DOS salidas, directo, y la cotización trae su etiqueta", async () => {
    stubApi();
    const btn = await montar();
    expect(btn.textContent).toBe("Pedido");
    expect(opcion("cotizacion")!.textContent).toBe("Cotizaciónno aparta mercancía");
    // Ni el texto viejo ni el paso viejo.
    expect(document.body.textContent).not.toContain("Confirmar y enviar a Switch");
    expect(document.body.textContent).not.toContain("Enviar a Switch");
  });

  it("🔴 con todo limpio, UN toque crea el pedido: confirma, revisa y escribe — sin modal", async () => {
    const llamadas = stubApi();
    const btn = await montar();
    await tocarEnviar(btn);

    await waitFor(() => expect(toquesAuto(llamadas)).toHaveLength(1));
    // Confirmar (el PUT lo exige el servidor) y DESPUÉS un solo viaje a Switch.
    expect(llamadas.some((c) => c.method === "PUT" && (c.body || "").includes('"status":"confirmado"'))).toBe(true);
    // ⏱️ UN SOLO POST: antes eran dos (dry + real) y cada uno volvía a cruzar
    // todos los SKU contra Switch. Ese segundo viaje es lo que se eliminó.
    expect(postsEnvio(llamadas)).toHaveLength(1);
    expect(creacionesDirectas(llamadas)).toHaveLength(0);
    // Y NO se abrió ninguna pantalla intermedia.
    expect(screen.queryByRole("button", { name: "Crear pedido en Switch" })).toBeNull();
    await screen.findByText(/pedido creado en Switch: 16-000000999/i);
  });

  it("el aviso de que crea un pedido REAL va ANTES del toque, no en un modal después", async () => {
    stubApi();
    await montar();
    // 25-ago-2026: el aviso ya no narra la elección (las dos salidas están a la
    // vista, con sus nombres). Queda lo que NO se ve: que es de verdad.
    const aviso = screen.getByText(/Se crea de verdad en Switch/);
    expect(aviso.textContent).toContain("active_shoes");
    expect(aviso.textContent).toMatch(/borrarlo a mano en el panel de Switch/);
  });

  it("mientras corre dice qué está pasando (la pre-validación tarda)", async () => {
    let soltar: (v: unknown) => void = () => {};
    const espera = new Promise((r) => { soltar = r; });
    const llamadas = stubApi();
    const base = global.fetch as unknown as (u: string, i?: RequestInit) => Promise<unknown>;
    vi.stubGlobal("fetch", async (u: string, i?: RequestInit) => {
      if (u.includes("/enviar-switch") && (i?.method || "") === "POST" && (i?.body as string).includes("auto")) await espera;
      return base(u, i);
    });
    const btn = await montar();
    await act(async () => { fireEvent.click(btn); });
    await screen.findByText(/Revisando el pedido contra Switch/);
    await act(async () => { soltar(null); });
    await waitFor(() => expect(toquesAuto(llamadas)).toHaveLength(1));
  });

  it("un pedido YA confirmado no se vuelve a confirmar: va directo a Switch", async () => {
    const llamadas = stubApi({ status: "confirmado" });
    const btn = await montar();
    await tocarEnviar(btn);
    await waitFor(() => expect(toquesAuto(llamadas)).toHaveLength(1));
    expect(llamadas.filter((c) => c.method === "PUT" && (c.body || "").includes("confirmado"))).toHaveLength(0);
  });
});

// ── Cuando hay que parar ─────────────────────────────────────────────────────

describe("se detiene y muestra el problema", () => {
  it("🔴 error de pre-validación: NO escribe en el ERP y enseña qué pasó", async () => {
    const llamadas = stubApi({
      auto: { ok: false, status: 422, body: {
        error: "El pedido no pasa la pre-validación",
        errores: ["SKU SKU-1 no existe en Switch (active_shoes)"],
        warnings: [], avisos: [], lineas: [],
      } },
    });
    const btn = await montar();
    await tocarEnviar(btn);

    await screen.findByText("No se puede enviar a Switch");
    expect(screen.getByText("SKU SKU-1 no existe en Switch (active_shoes)")).toBeTruthy();
    // 🔴 LO QUE MÁS IMPORTA: no sale NINGÚN segundo POST a crear el pedido.
    // Que el 422 tampoco haya escrito nada del lado del servidor lo fija
    // `switch-envio-paralelo.test.ts`, que corre el motor de verdad.
    expect(creacionesDirectas(llamadas)).toHaveLength(0);
    expect(postsEnvio(llamadas)).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Entendido" })).toBeTruthy();
  });

  it("con el permiso 0001 NEGADO se detiene con el texto de siempre", async () => {
    const llamadas = stubApi({
      auto: { ok: false, status: 422, body: {
        errores: ["El usuario de Switch no tiene permiso para cambiar precios (proceso 0001) — pedirlo al administrador de Switch o usar el precio de lista"],
        warnings: [], avisos: [], lineas: [],
      } },
    });
    const btn = await montar();
    await tocarEnviar(btn);
    await screen.findByText(/no tiene permiso para cambiar precios \(proceso 0001\)/);
    expect(creacionesDirectas(llamadas)).toHaveLength(0);
  });

  it("las líneas que SÍ cruzaron se ven debajo del problema (sin volver a consultar)", async () => {
    stubApi({
      auto: { ok: false, status: 422, body: {
        errores: ["SKU SKU-2 tiene precio 0 en Switch — corregirlo en el panel antes de enviar"],
        warnings: [], avisos: [],
        lineas: PREVIEW_LIMPIO.lineas,
      } },
    });
    const btn = await montar();
    await tocarEnviar(btn);
    const titulo = await screen.findByText("No se puede enviar a Switch");
    const modal = titulo.closest("div") as HTMLElement;
    expect(screen.getByText("Lo que sí cruzó con Switch")).toBeTruthy();
    // El SKU también está en la tabla del pedido, detrás del modal: se busca
    // DENTRO del modal para no confundirlos.
    expect(modal.querySelector("table")?.textContent).toContain("SKU-1");
    expect(modal.querySelector("table")?.textContent).toContain("ZAPATO");
  });

  it("un problema que NO es 422 (preventa, Switch caído) también detiene y se lee entero", async () => {
    const llamadas = stubApi({
      auto: { ok: false, status: 400, body: { error: "El pedido tiene 2 producto(s) en preventa — no se pueden enviar a Switch (sin inventario todavía)" } },
    });
    const btn = await montar();
    await tocarEnviar(btn);
    await screen.findByText(/2 producto\(s\) en preventa/);
    expect(creacionesDirectas(llamadas)).toHaveLength(0);
  });
});

// ── Doble toque ──────────────────────────────────────────────────────────────

describe("🔴 doble toque NO duplica el pedido", () => {
  it("dos clics seguidos hacen UN solo POST real", async () => {
    const llamadas = stubApi();
    const btn = await montar();
    // El envío nace en la OPCIÓN misma (25-ago-2026: ya no hay paso previo), así
    // que el triple toque va ahí: es el botón que puede duplicar un pedido si el
    // `enviandoRef` se rompe.
    await act(async () => {
      fireEvent.click(btn);
      fireEvent.click(btn);
      fireEvent.click(btn);
    });
    await waitFor(() => expect(toquesAuto(llamadas)).toHaveLength(1));
    expect(postsEnvio(llamadas)).toHaveLength(1);
    // Y la OTRA salida tampoco se cuela dentro del mismo envío: mientras corre
    // no está dibujada (el candado de arriba) y el `enviandoRef` la rebota.
    expect(toquesAuto(llamadas)).toHaveLength(1);
  });

  it("mientras corre, las dos salidas dejan de estar en pantalla", async () => {
    let soltar: (v: unknown) => void = () => {};
    const espera = new Promise((r) => { soltar = r; });
    stubApi();
    const base = global.fetch as unknown as (u: string, i?: RequestInit) => Promise<unknown>;
    vi.stubGlobal("fetch", async (u: string, i?: RequestInit) => {
      if (u.includes("/enviar-switch") && (i?.method || "") === "POST" && (i?.body as string).includes("auto")) await espera;
      return base(u, i);
    });
    const btn = await montar();
    await act(async () => { fireEvent.click(btn); });
    // Sin ventana de por medio, lo que impide el segundo toque es que las dos
    // opciones se vayan y quede el renglón del paso vivo.
    await waitFor(() => {
      expect(opcion("pedido")).toBeNull();
      expect(opcion("cotizacion")).toBeNull();
      expect(document.querySelector('[data-medir="enviando-switch"]')).not.toBeNull();
    });
    await act(async () => { soltar(null); });
  });

  it("y si el server igual recibe dos, su 409 se muestra (el candado manda)", async () => {
    const llamadas = stubApi({
      auto: { ok: false, status: 409, body: { error: "Este pedido ya fue enviado a Switch (16-000000999)" } },
    });
    const btn = await montar();
    await tocarEnviar(btn);
    await screen.findByText("Este pedido ya fue enviado a Switch (16-000000999)");
    expect(postsEnvio(llamadas)).toHaveLength(1);
  });

  it("🔴 si el servidor se DETIENE por un aviso bloqueante, el pedido no se creó y hay que decidir", async () => {
    // El toque manda `auto:true`; el servidor devuelve `preview` = "hay algo
    // que decidir". Recién el botón del modal manda la creación DIRECTA.
    const llamadas = stubApi({
      auto: { ok: true, status: 200, body: { preview: { ...PREVIEW_LIMPIO, avisos: [{ codigo: "precio_distinto", texto: "SKU SKU-1: precio del pedido $15.00 ≠ lista Switch $16.50 — se enviará el del pedido" }] } } },
    });
    const btn = await montar();
    await tocarEnviar(btn);

    await screen.findByText("Revisa esto antes de enviar");
    expect(creacionesDirectas(llamadas)).toHaveLength(0); // ← todavía NO se creó
    // …y el botón del modal sí lo crea, sin volver a pre-validar.
    const seguir = screen.getByRole("button", { name: "Crear pedido en Switch" });
    await act(async () => { fireEvent.click(seguir); });
    await waitFor(() => expect(creacionesDirectas(llamadas)).toHaveLength(1));
  });
});

// ── Precio ≠ lista, al EDITAR ────────────────────────────────────────────────

describe("el aviso de precio distinto aparece al EDITAR, no al enviar", () => {
  it("editar el precio muestra el de lista ahí mismo, en ámbar y sin bloquear", async () => {
    stubApi();
    const btn = await montar();
    expect(screen.queryByText(/← lista/)).toBeNull(); // coincide con lista: no se dice nada

    const input = document.querySelector('input[type="number"][step="1"][min="0"]') as HTMLInputElement;
    await act(async () => { fireEvent.change(input, { target: { value: "15" } }); });

    const nota = await screen.findByText(/← lista \$16\.50/);
    expect(nota.className).toContain("text-amber-600");
    // NO bloquea: el botón sigue vivo. Editar el precio es legítimo.
    expect((btn as HTMLButtonElement).disabled).toBe(false);
  });

  it("volver al precio de lista hace desaparecer el aviso", async () => {
    stubApi();
    await montar();
    const input = document.querySelector('input[type="number"][step="1"][min="0"]') as HTMLInputElement;
    await act(async () => { fireEvent.change(input, { target: { value: "15" } }); });
    await screen.findByText(/← lista \$16\.50/);
    await act(async () => { fireEvent.change(input, { target: { value: "16.5" } }); });
    await waitFor(() => expect(screen.queryByText(/← lista/)).toBeNull());
  });

  it("sin precio de lista en la base no se inventa ninguna diferencia", async () => {
    stubApi({ items: [{ ...ITEM, precio_lista: null }] });
    await montar();
    const input = document.querySelector('input[type="number"][step="1"][min="0"]') as HTMLInputElement;
    await act(async () => { fireEvent.change(input, { target: { value: "1" } }); });
    expect(screen.queryByText(/← lista/)).toBeNull();
  });
});

describe("el permiso 0001 se pregunta al editar, UNA vez, y no bloquea si falla", () => {
  const consultas = (l: { url: string }[]) => l.filter((c) => c.url.includes("/permiso-precio"));

  it("no se pregunta si no hay ningún precio editado (sesión única de Switch)", async () => {
    const llamadas = stubApi();
    await montar();
    await new Promise((r) => setTimeout(r, 1100));
    expect(consultas(llamadas)).toHaveLength(0);
  });

  it("se pregunta UNA sola vez aunque se sigan tecleando precios (debounce)", async () => {
    vi.useFakeTimers();
    try {
      const llamadas = stubApi();
      render(<PedidoDetalleClient marca="reebok" />);
      await act(async () => { await vi.advanceTimersByTimeAsync(50); });
      const input = document.querySelector('input[type="number"][step="1"][min="0"]') as HTMLInputElement;
      for (const v of ["1", "12", "125", "12"]) {
        await act(async () => {
          fireEvent.change(input, { target: { value: v } });
          await vi.advanceTimersByTimeAsync(100); // por debajo del debounce
        });
      }
      await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
      expect(consultas(llamadas)).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("permiso NEGADO: lo dice en ese momento y NO apaga el botón", async () => {
    stubApi({ permiso: { permiso: false, verificado: true, mensaje: "El usuario de Switch no tiene permiso para cambiar precios (proceso 0001) — pedirlo al administrador de Switch o usar el precio de lista" } });
    const btn = await montar();
    const input = document.querySelector('input[type="number"][step="1"][min="0"]') as HTMLInputElement;
    await act(async () => { fireEvent.change(input, { target: { value: "15" } }); });
    await screen.findByText(/no tiene permiso para cambiar precios \(proceso 0001\)/, {}, { timeout: 3000 });
    expect((btn as HTMLButtonElement).disabled).toBe(false); // se puede enviar con el precio de lista
  });

  it("🔴 FAIL-OPEN: si la consulta falla, no se dice nada y no se bloquea nada", async () => {
    stubApi();
    const base = global.fetch as unknown as (u: string, i?: RequestInit) => Promise<unknown>;
    vi.stubGlobal("fetch", async (u: string, i?: RequestInit) => {
      if (u.includes("/permiso-precio")) throw new Error("sin red");
      return base(u, i);
    });
    const btn = await montar();
    const input = document.querySelector('input[type="number"][step="1"][min="0"]') as HTMLInputElement;
    await act(async () => { fireEvent.change(input, { target: { value: "15" } }); });
    await new Promise((r) => setTimeout(r, 1100));
    expect(screen.queryByText(/no tiene permiso/)).toBeNull();
    expect((btn as HTMLButtonElement).disabled).toBe(false);
  });
});

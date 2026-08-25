// ─────────────────────────────────────────────────────────────────────────────
// 🔴 NINGÚN PEDIDO SALE A SWITCH SIN UN CLIENTE ELEGIDO A PROPÓSITO.
//
// Este es EL candado del cambio, y es de CONDUCTA a propósito: se renderizan
// las pantallas REALES, se tocan los botones REALES y se cuenta qué salió por
// `fetch`. Un barrido de texto sobre los archivos no sirve — el `disabled` del
// botón y el `return` del handler se pueden mutar sin que cambie una sola
// palabra del archivo, y este repo ya pagó cuatro veces el candado que se
// cumple a sí mismo con su propio comentario.
//
// 🩸 LO QUE VINO A TAPAR, medido contra producción el 14-ago-2026:
// 18 de 33 pedidos vivos (55%) sin cliente real · 15 ya confirmados y en Switch
// por $53.124 · ocho de $1.000 o más (TOM-002 $16.920 · TOM-017 $16.722 ·
// TOM-003 $7.254 · PED-017 $2.760 · PED-006 $2.100 · CKP-005 $1.704 ·
// TOM-001 $1.584 · PED-015 $1.560). NINGUNO era venta de mostrador.
//
// 🔴 NADA DE ESTO TOCA SWITCH: `fetch` está stubbeado y lo que se verifica es
// que las llamadas de escritura NO existan.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, act, within } from "@testing-library/react";
import CheckoutClient from "@/components/catalogo/CheckoutClient";
import PedidoDetalleClient from "@/components/catalogo/PedidoDetalleClient";
import { LABEL_CONTADO, SIN_CLIENTE_ELEGIDO } from "@/lib/catalogo/cliente-elegido";
import { TEXTO_NO_RESERVA } from "@/lib/catalogo/documento-switch";

/**
 * 🔴 24-ago-2026 — "Enviar a Switch" ahora PREGUNTA QUÉ: pedido o cotización.
 * Todo lo que este archivo protege se mide sobre el camino COMPLETO, y el
 * candado vale para LAS DOS salidas: la elección de salida no puede ser una
 * puerta de atrás al envío sin cliente.
 */
const opcionDoc = (clave: "pedido" | "cotizacion") =>
  document.querySelector(`[data-medir="documento-${clave}"]`) as HTMLButtonElement | null;

/** ¿Se abrió la elección? (con el botón apagado no debería abrirse siquiera). */
const hayEleccion = () => document.querySelector('[data-medir="elegir-documento"]') !== null;

const OID = "44444444-4444-4444-8444-444444444444";
const ROUTER = { push: vi.fn(), replace: vi.fn() };
const PARAMS = { id: OID, marca: "tommy" };
vi.mock("next/navigation", () => ({
  useRouter: () => ROUTER,
  useParams: () => PARAMS,
  usePathname: () => `/catalogo/tommy/pedido/${OID}`,
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/hooks/useSidebarCollapsed", () => ({
  useSidebarCollapsed: () => false,
  readSidebarCollapsed: () => false,
}));

interface Llamada { url: string; method: string; body: string | null }

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

// ═════════════════════════════════════════════════════════════════════════════
// 1. EL CHECKOUT DEL CATÁLOGO — donde nacieron los 15 pedidos
// ═════════════════════════════════════════════════════════════════════════════

const ITEM_CARRITO = {
  product_id: "p1", sku: "TH-1", name: "Sandalia", image_url: "",
  quantity: 2, unit_price: 20, category: "footwear", bulto_pzas: 12,
};

/**
 * Directorio de la empresa tal como lo devuelve `/api/catalogo/[marca]/clientes-switch`.
 *
 * 🔴 17-ago-2026: el checkout dejó de tener su lista propia y pasó al selector
 * único (`ClienteSwitchPicker`), el mismo del detalle y de "Duplicar". Por eso
 * el stub responde a ESA ruta y con SU forma —`cliente_switch_id` + el `contado`
 * resuelto aparte—, que es lo que la pantalla recibe de verdad.
 */
const DIRECTORIO = [{ cliente_switch_id: 42, codigo: "D-42", nombre: "Sporting Shoes" }];
/** El mostrador de fashion_shoes: en Switch se llama "VENTAS LOCA". */
const CONTADO_FILA = { cliente_switch_id: 1, codigo: "TCKCTA", nombre: "VENTAS LOCA" };

function stubCheckout(opts: { clientes?: unknown[]; contado?: unknown; vendedor?: unknown } = {}) {
  const llamadas: Llamada[] = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    llamadas.push({ url, method: (init?.method || "GET").toUpperCase(), body: (init?.body as string) ?? null });
    const j = (b: unknown) => ({ ok: true, status: 200, json: async () => b });
    if (url.includes("/mi-vendedor")) return j({ vendedor: "vendedor" in opts ? opts.vendedor : { id: 7, nombre: "Rey" } });
    if (url.includes("/clientes-switch")) {
      return j({
        clientes: opts.clientes ?? DIRECTORIO,
        contado: "contado" in opts ? opts.contado : CONTADO_FILA,
      });
    }
    if (url.includes("/catalogo/checkout")) return j({ ok: true, order_id: OID, order_number: "TOM-999", switch: { ok: true } });
    return j({});
  });
  vi.stubGlobal("fetch", fetchMock);
  sessionStorage.setItem("tommy_cart", JSON.stringify([ITEM_CARRITO]));
  return llamadas;
}

const enviosDeCheckout = (l: Llamada[]) => l.filter((c) => c.url.includes("/api/catalogo/checkout") && c.method === "POST");

async function pintarCheckout() {
  await act(async () => { render(<CheckoutClient marca="tommy" />); });
  await screen.findByRole("button", { name: /Enviar a Switch/ });
}

const botonEnviar = () => screen.getByRole("button", { name: /Enviar a Switch/ }) as HTMLButtonElement;

/**
 * El toque COMPLETO del checkout: "Enviar a Switch" → la salida elegida.
 * Devuelve `false` si la elección ni siquiera se abrió, que es lo que tiene que
 * pasar cuando falta el cliente.
 */
async function tocarEnviarCheckout(clave: "pedido" | "cotizacion" = "pedido", boton?: HTMLButtonElement) {
  await act(async () => { fireEvent.click(boton ?? botonEnviar()); });
  const o = opcionDoc(clave);
  if (!o) return false;
  await act(async () => { fireEvent.click(o); });
  return true;
}

describe("Checkout del catálogo — el cliente arranca vacío", () => {
  beforeEach(() => vi.clearAllMocks());

  it("🔴 arranca SIN cliente: no dice Contado, dice que hay que elegirlo", async () => {
    stubCheckout();
    await pintarCheckout();
    const caja = document.querySelector('[data-medir="cliente-checkout"]')!;
    expect(caja.textContent).toContain(SIN_CLIENTE_ELEGIDO);
    // Lo que NO puede pasar: que el cliente venga puesto solo.
    expect(caja.textContent).not.toContain("Contado");
  });

  it("🔴 el botón está APAGADO y dice qué falta", async () => {
    stubCheckout();
    await pintarCheckout();
    expect(botonEnviar().disabled).toBe(true);
    expect(document.querySelector('[data-medir="falta-enviar"]')!.textContent)
      .toBe("Falta: elegir el cliente");
  });

  it("🔴 tocar el botón apagado NO manda NADA a Switch — ni abre la elección", async () => {
    const llamadas = stubCheckout();
    await pintarCheckout();
    await act(async () => { fireEvent.click(botonEnviar()); });
    expect(hayEleccion()).toBe(false);
    expect(enviosDeCheckout(llamadas)).toHaveLength(0);
  });

  it("🔴 NI FORZANDO EL BOTÓN: el handler tampoco manda sin cliente", async () => {
    // La segunda capa. Un `disabled` es lo que se VE; si fuera lo único, el día
    // que alguien lo toque mal el pedido vuelve a salir a nombre de nadie. Acá
    // se le quita el candado visual al botón y se toca igual.
    const llamadas = stubCheckout();
    await pintarCheckout();
    const boton = botonEnviar();
    boton.disabled = false; // se le quita el candado visual
    // 🔴 Con el candado visual quitado, el handler TAMPOCO abre la elección: la
    // pantalla no puede ofrecer un camino que ya sabe cerrado.
    // ⚠️ Esta línea NO es verificable por mutación y se dice de frente: React no
    // despacha el click de un botón deshabilitado ni forzándole `disabled =
    // false` (medido en este repo, y vuelto a medir el 24-ago-2026 quitando la
    // guarda: los 30 casos siguen verdes). El candado que no se puede saltear es
    // el 422 del SERVIDOR, que sí está verificado por mutación.
    await act(async () => { fireEvent.click(boton); });
    expect(hayEleccion()).toBe(false);
    // Y se recorre TODO el camino igual: si la elección se abriera, se toca la
    // opción. Cualquiera de las dos salidas tiene que quedarse sin mandar nada.
    for (const salida of ["pedido", "cotizacion"] as const) {
      await tocarEnviarCheckout(salida, boton);
      expect(enviosDeCheckout(llamadas)).toHaveLength(0);
    }
  });

  it("elegir un cliente REAL enciende el botón y ese cliente es el que viaja", async () => {
    const llamadas = stubCheckout();
    await pintarCheckout();
    fireEvent.click(screen.getByRole("button", { name: "Elegir" }));
    fireEvent.click(await screen.findByRole("button", { name: /Sporting Shoes/ }));
    await waitFor(() => expect(botonEnviar().disabled).toBe(false));
    expect(document.querySelector('[data-medir="falta-enviar"]')).toBeNull();
    await tocarEnviarCheckout();
    const envios = enviosDeCheckout(llamadas);
    expect(envios).toHaveLength(1);
    expect(JSON.parse(envios[0].body!).cliente).toEqual({ id: 42, nombre: "Sporting Shoes" });
  });

  it("🔴 Contado SIGUE existiendo, pero hay que TOCARLO", async () => {
    const llamadas = stubCheckout();
    await pintarCheckout();
    fireEvent.click(screen.getByRole("button", { name: "Elegir" }));
    // Se espera al directorio: la opción de mostrador se dibuja ANTES de que
    // llegue, con el id de respaldo. Tocarla apurado mediría el respaldo.
    await screen.findByRole("button", { name: /Sporting Shoes/ });
    // Está, y con todas las letras.
    const contado = screen.getByRole("button", { name: LABEL_CONTADO });
    expect(botonEnviar().disabled).toBe(true); // verlo no es elegirlo
    fireEvent.click(contado);
    await waitFor(() => expect(botonEnviar().disabled).toBe(false));
    await tocarEnviarCheckout();
    const envios = enviosDeCheckout(llamadas);
    expect(envios).toHaveLength(1);
    expect(JSON.parse(envios[0].body!).cliente.id).toBe(1);
  });

  it("Contado usa el id REAL del mostrador de la empresa, no un número escrito a mano", async () => {
    // Empresa cuyo TCKCTA no es el id 1: el pedido tiene que salir con el suyo.
    const llamadas = stubCheckout({ contado: { cliente_switch_id: 908, codigo: "TCKCTA", nombre: "VENTAS" } });
    await pintarCheckout();
    fireEvent.click(screen.getByRole("button", { name: "Elegir" }));
    await screen.findByRole("button", { name: /Sporting Shoes/ });
    fireEvent.click(screen.getByRole("button", { name: LABEL_CONTADO }));
    await tocarEnviarCheckout();
    expect(JSON.parse(enviosDeCheckout(llamadas)[0].body!).cliente.id).toBe(908);
  });

  it("🔴 si el directorio no resuelve el mostrador, elegirlo NO se pierde: cae al id histórico", async () => {
    // Ante la duda se conserva la elección de la persona. Sin el respaldo, el
    // botón se encendería y el servidor contestaría 400 con el cliente ya
    // elegido en pantalla — la peor forma de fallar.
    const llamadas = stubCheckout({ contado: null });
    await pintarCheckout();
    fireEvent.click(screen.getByRole("button", { name: "Elegir" }));
    await screen.findByRole("button", { name: /Sporting Shoes/ });
    fireEvent.click(screen.getByRole("button", { name: LABEL_CONTADO }));
    await tocarEnviarCheckout();
    expect(JSON.parse(enviosDeCheckout(llamadas)[0].body!).cliente).toEqual({ id: 1, nombre: "Contado" });
  });

  it("🔴 el mostrador viaja SIEMPRE con el nombre 'Contado', se llame como se llame en Switch", async () => {
    // En fashion_shoes el TCKCTA se llama "VENTAS LOCA". El nombre que se
    // ESCRIBE en el pedido es el literal histórico; cambiarlo cambiaría el dato
    // de los pedidos nuevos, y eso no es parte de unificar el selector.
    const llamadas = stubCheckout();
    await pintarCheckout();
    fireEvent.click(screen.getByRole("button", { name: "Elegir" }));
    await screen.findByRole("button", { name: /Sporting Shoes/ });
    fireEvent.click(screen.getByRole("button", { name: LABEL_CONTADO }));
    await tocarEnviarCheckout();
    expect(JSON.parse(enviosDeCheckout(llamadas)[0].body!).cliente).toEqual({ id: 1, nombre: "Contado" });
    // Y en pantalla se dice con todas las letras, no "VENTAS LOCA".
    const caja = document.querySelector('[data-medir="cliente-checkout"]')!;
    expect(caja.textContent).toContain(LABEL_CONTADO);
    expect(caja.textContent).not.toContain("VENTAS LOCA");
  });

  it("el mostrador NO aparece dos veces (una opción, no dos formas de lo mismo)", async () => {
    stubCheckout({ clientes: [CONTADO_FILA, ...DIRECTORIO] });
    await pintarCheckout();
    fireEvent.click(screen.getByRole("button", { name: "Elegir" }));
    await screen.findByRole("button", { name: /Sporting Shoes/ });
    // "VENTAS LOCA" es el nombre del TCKCTA en fashion_shoes: aunque el
    // directorio lo devuelva en la lista, no puede salir como un cliente más.
    expect(screen.queryByRole("button", { name: /VENTAS LOCA/ })).toBeNull();
    expect(screen.getAllByRole("button", { name: LABEL_CONTADO })).toHaveLength(1);
  });

  it("🔴 el checkout usa EL selector único: ver Contado no es haberlo elegido", async () => {
    // Es la pieza compartida con el detalle y con "Duplicar" — su buscador, su
    // `aria-pressed` y su forma de resolver el mostrador. Un archivo puede
    // importarla y no dibujarla; esto lo mira en el DOM.
    stubCheckout();
    await pintarCheckout();
    fireEvent.click(screen.getByRole("button", { name: "Elegir" }));
    await screen.findByRole("button", { name: /Sporting Shoes/ });
    expect(screen.getByPlaceholderText("Buscar por nombre o código...")).toBeTruthy();
    expect(screen.getByRole("button", { name: LABEL_CONTADO }).getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByRole("button", { name: /Sporting Shoes/ }).getAttribute("aria-pressed")).toBe("false");
    expect(botonEnviar().disabled).toBe(true);
  });

  it("sin vendedor Y sin cliente, el aviso los nombra a los dos", async () => {
    stubCheckout({ vendedor: null });
    await pintarCheckout();
    expect(document.querySelector('[data-medir="falta-enviar"]')!.textContent)
      .toBe("Falta: elegir el cliente y elegir el vendedor");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. EL DETALLE DEL PEDIDO — un solo cliente, y el título sale del picker
// ═════════════════════════════════════════════════════════════════════════════

const ITEM = {
  id: "i1", product_id: "p1", sku: "TH-1", name: "Sandalia", image_url: "",
  quantity: 2, unit_price: 20, category: "footwear", bulto_pzas: 12, precio_lista: 20,
};

interface EscenarioDetalle {
  /** null = nadie eligió (el caso PED-004). */
  clienteSwitchId?: number | null;
  clienteNombre?: string | null;
  clienteCodigo?: string | null;
  /** Presente = el pedido vino del link público. */
  origenShortId?: string | null;
  clientName?: string;
  status?: string;
}

function stubDetalle(e: EscenarioDetalle = {}) {
  const llamadas: Llamada[] = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = (init?.method || "GET").toUpperCase();
    llamadas.push({ url, method, body: (init?.body as string) ?? null });
    const j = (b: unknown) => ({ ok: true, status: 200, json: async () => b });
    if (url.includes("/enviar-switch")) return j(method === "GET" ? { envio: null } : { ok: true, numeroInterno: "16-1", verificado: true });
    if (url.includes("/clientes-switch")) {
      if (method === "PATCH") {
        const b = JSON.parse((init?.body as string) || "{}");
        return j({ ok: true, clienteSwitchId: b.clienteSwitchId, nombre: b.clienteSwitchId === 42 ? "Sporting Shoes" : "VENTAS LOCA", codigo: b.clienteSwitchId === 42 ? "D-42" : "TCKCTA" });
      }
      if (url.includes("orderId=")) {
        return j({ clienteSwitchId: e.clienteSwitchId ?? null, nombre: e.clienteNombre ?? null, codigo: e.clienteCodigo ?? null });
      }
      return j({ clientes: [{ cliente_switch_id: 42, codigo: "D-42", nombre: "Sporting Shoes" }], contado: { cliente_switch_id: 1, codigo: "TCKCTA", nombre: "VENTAS LOCA" } });
    }
    if (url.includes("/vendedores-switch")) return j({ vendedorSwitchId: 7, nombre: "Rey", esFallback: false });
    if (url.includes("/permiso-precio")) return j({ permiso: true, verificado: true, mensaje: null });
    if (url.includes("/clientes-search")) return j([]);
    if (url.includes(`/orders/${OID}`) && method === "PUT") return j({ ok: true });
    if (url.includes(`/orders/${OID}`)) {
      return j({
        id: OID, order_number: "PED-004", client_name: e.clientName ?? "CITY MALL PASO CANOA",
        comment: "", status: e.status ?? "confirmado", total: 480, created_at: "2026-08-01T12:00:00Z",
        origen_short_id: e.origenShortId ?? null,
        tommy_order_items: [ITEM],
      });
    }
    return j({});
  });
  vi.stubGlobal("fetch", fetchMock);
  sessionStorage.setItem("cxc_role", "vendedor");
  return llamadas;
}

const enviosASwitch = (l: Llamada[]) => l.filter((c) => c.url.includes("/enviar-switch") && c.method === "POST");

/** El toque COMPLETO del detalle: "Enviar a Switch" → la salida elegida. */
async function tocarEnviarDetalle(clave: "pedido" | "cotizacion" = "pedido", boton?: HTMLButtonElement) {
  const b = boton ?? (screen.getByRole("button", { name: /Enviar a Switch/ }) as HTMLButtonElement);
  await act(async () => { fireEvent.click(b); });
  const o = opcionDoc(clave);
  if (!o) return false;
  await act(async () => { fireEvent.click(o); });
  return true;
}

async function pintarDetalle(e: EscenarioDetalle = {}) {
  const llamadas = stubDetalle(e);
  await act(async () => { render(<PedidoDetalleClient marca="tommy" />); });
  await screen.findByText("PED-004");
  return llamadas;
}

/** La caja del cliente — hay OTRO "Cambiar" al lado (el del vendedor). */
const cajaCliente = () => within(document.querySelector('[data-medir="cliente-detalle"]') as HTMLElement);

/**
 * Abre el selector y ESPERA a que el directorio cargue. La opción de mostrador
 * se dibuja antes que la respuesta (con el id de respaldo), así que tocarla
 * apurado mediría el respaldo y no el id real — el test pasaría verde sin haber
 * probado lo que dice probar.
 */
async function abrirSelectorCliente() {
  fireEvent.click(cajaCliente().getByRole("button", { name: /Elegir|Cambiar/ }));
  await screen.findByRole("button", { name: /Sporting Shoes/ });
}

describe("Detalle del pedido — el cliente es UNO SOLO", () => {
  beforeEach(() => vi.clearAllMocks());

  it("🔴 el caso PED-004: nombre en el título y NINGÚN cliente atrás → apagado", async () => {
    const llamadas = await pintarDetalle({ clienteSwitchId: null });
    const boton = screen.getByRole("button", { name: /Enviar a Switch/ }) as HTMLButtonElement;
    expect(boton.disabled).toBe(true);
    expect(document.querySelector('[data-medir="falta-enviar"]')!.textContent).toBe("Falta: elegir el cliente");
    await act(async () => { fireEvent.click(boton); });
    expect(hayEleccion()).toBe(false); // ni siquiera pregunta qué mandar
    expect(enviosASwitch(llamadas)).toHaveLength(0);
  });

  it("🔴 NI FORZANDO EL BOTÓN: el handler del detalle tampoco manda sin cliente", async () => {
    const llamadas = await pintarDetalle({ clienteSwitchId: null });
    const boton = screen.getByRole("button", { name: /Enviar a Switch/ }) as HTMLButtonElement;
    boton.disabled = false; // se le quita el candado visual
    // 🔴 Igual que en el checkout: sin cliente no se abre ni la elección.
    await act(async () => { fireEvent.click(boton); });
    expect(hayEleccion()).toBe(false);
    for (const salida of ["pedido", "cotizacion"] as const) {
      await tocarEnviarDetalle(salida, boton);
      expect(enviosASwitch(llamadas)).toHaveLength(0);
    }
  });

  it("🔴 el selector abre SIN NADA marcado: ver Contado no es haberlo elegido", async () => {
    // Pasarle `{id:null}` como valor marcaba el mostrador como si ya se hubiera
    // elegido — el mismo default silencioso, disfrazado de estado.
    await pintarDetalle({ clienteSwitchId: null });
    await abrirSelectorCliente();
    expect(screen.getByRole("button", { name: LABEL_CONTADO }).getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByRole("button", { name: /Sporting Shoes/ }).getAttribute("aria-pressed")).toBe("false");
  });

  it("🔴 en un pedido interno NO hay campo de texto libre para el cliente", async () => {
    await pintarDetalle({ clienteSwitchId: 42, clienteNombre: "Sporting Shoes", clienteCodigo: "D-42" });
    expect(document.querySelector('input[class*="text-xl"]')).toBeNull();
    expect(document.querySelector('[data-medir="titulo-pedido"]')).toBeTruthy();
  });

  it("🔴 elegir el cliente escribe el TÍTULO con lo elegido", async () => {
    const llamadas = await pintarDetalle({ clienteSwitchId: null });
    await abrirSelectorCliente();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Sporting Shoes/ })); });

    // El título dejó de decir el texto viejo y dice lo elegido.
    await waitFor(() =>
      expect(document.querySelector('[data-medir="titulo-pedido"]')!.textContent).toBe("Sporting Shoes"));
    // Y se guardó de verdad: el PUT lleva el nombre nuevo.
    const puts = llamadas.filter((c) => c.method === "PUT" && c.url.includes(`/orders/${OID}`));
    expect(puts.length).toBeGreaterThan(0);
    expect(JSON.parse(puts[puts.length - 1].body!).client_name).toBe("Sporting Shoes");
    // Y el botón se encendió.
    expect((screen.getByRole("button", { name: /Enviar a Switch/ }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("elegir Contado guarda un ID de verdad — elegirlo deja de parecerse a un olvido", async () => {
    const llamadas = await pintarDetalle({ clienteSwitchId: null });
    await abrirSelectorCliente();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: LABEL_CONTADO })); });
    const patch = llamadas.find((c) => c.method === "PATCH" && c.url.includes("/clientes-switch"))!;
    expect(JSON.parse(patch.body!).clienteSwitchId).toBe(1);
    await waitFor(() =>
      expect((screen.getByRole("button", { name: /Enviar a Switch/ }) as HTMLButtonElement).disabled).toBe(false));
  });

  it("con cliente elegido, el pedido SÍ sale", async () => {
    const llamadas = await pintarDetalle({ clienteSwitchId: 42, clienteNombre: "Sporting Shoes", clienteCodigo: "D-42" });
    const boton = screen.getByRole("button", { name: /Enviar a Switch/ }) as HTMLButtonElement;
    expect(boton.disabled).toBe(false);
    await tocarEnviarDetalle();
    expect(enviosASwitch(llamadas)).toHaveLength(1);
  });

  // ── La excepción real: el link público ──

  it("🔴 el pedido del LINK conserva su campo de nombre a mano", async () => {
    await pintarDetalle({ origenShortId: "ab12cd34", clientName: "Nathalie", clienteSwitchId: 1, clienteCodigo: "TCKCTA", clienteNombre: "VENTAS LOCA" });
    const input = document.querySelector('input[class*="text-xl"]') as HTMLInputElement;
    expect(input).toBeTruthy();
    expect(input.value).toBe("Nathalie");
  });

  // 🔴 CAMBIÓ DE DIRECCIÓN EL 14-ago-2026 (2ª vuelta). Antes exigía que el
  // pedido del LINK se pudiera mandar SIN cliente. Daniel pidió que ése también
  // espere a que una persona le ponga el cliente real — es literalmente lo que
  // describe: *"ponerle el nombre del cliente para así mandarlo a Switch"*.
  it("🔴 el pedido del LINK sin cliente TAMBIÉN tiene el botón apagado, y dice qué falta", async () => {
    const llamadas = await pintarDetalle({ origenShortId: "ab12cd34", clientName: "Nathalie", clienteSwitchId: null });
    const boton = screen.getByRole("button", { name: /Enviar a Switch/ }) as HTMLButtonElement;
    expect(boton.disabled).toBe(true);
    expect(document.querySelector('[data-medir="falta-enviar"]')?.textContent).toContain("elegir el cliente");
    await act(async () => { fireEvent.click(boton); });
    expect(hayEleccion()).toBe(false);
    expect(enviosASwitch(llamadas)).toHaveLength(0);
  });

  it("🔴 el pedido del LINK con cliente elegido sale igual que uno interno", async () => {
    const llamadas = await pintarDetalle({ origenShortId: "ab12cd34", clientName: "Nathalie", clienteSwitchId: 1, clienteCodigo: "TCKCTA", clienteNombre: "VENTAS LOCA" });
    const boton = screen.getByRole("button", { name: /Enviar a Switch/ }) as HTMLButtonElement;
    expect(boton.disabled).toBe(false);
    await tocarEnviarDetalle();
    expect(enviosASwitch(llamadas)).toHaveLength(1);
  });

  it("en el pedido del LINK, elegir cliente NO le pisa el nombre que escribió la persona", async () => {
    const llamadas = await pintarDetalle({ origenShortId: "ab12cd34", clientName: "Nathalie", clienteSwitchId: 1, clienteCodigo: "TCKCTA" });
    await abrirSelectorCliente();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Sporting Shoes/ })); });
    expect((document.querySelector('input[class*="text-xl"]') as HTMLInputElement).value).toBe("Nathalie");
    const puts = llamadas.filter((c) => c.method === "PUT" && c.url.includes(`/orders/${OID}`));
    expect(puts.every((p) => JSON.parse(p.body!).client_name === "Nathalie")).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. PEDIDO O COTIZACIÓN — la segunda salida NO es una puerta de atrás
//
// Daniel: ***"que estén los dos"***. Lo que este bloque fija es que la salida
// nueva no aflojó nada de lo de arriba (sin cliente no sale NINGUNA de las dos)
// y que la pantalla DICE la diferencia ANTES de mandar: una cotización no
// aparta mercancía, y enterarse después es justo el problema.
// ═════════════════════════════════════════════════════════════════════════════

const salidaDeCheckout = (l: Llamada[]) =>
  JSON.parse(enviosDeCheckout(l)[0].body!).documento as string;

describe("🔴 Pedido o cotización — la elección, y el candado que no se afloja", () => {
  beforeEach(() => vi.clearAllMocks());

  it("🔴 SIN cliente el botón no abre ni la elección — no hay nada que elegir", async () => {
    const llamadas = stubCheckout();
    await pintarCheckout();
    await act(async () => { fireEvent.click(botonEnviar()); });
    expect(hayEleccion()).toBe(false);
    expect(opcionDoc("cotizacion")).toBeNull();
    expect(enviosDeCheckout(llamadas)).toHaveLength(0);
  });

  it("🔴 la pantalla DICE que la cotización no aparta mercancía ANTES de mandar", async () => {
    const llamadas = stubCheckout();
    await pintarCheckout();
    fireEvent.click(screen.getByRole("button", { name: "Elegir" }));
    fireEvent.click(await screen.findByRole("button", { name: /Sporting Shoes/ }));
    await waitFor(() => expect(botonEnviar().disabled).toBe(false));

    await act(async () => { fireEvent.click(botonEnviar()); });
    // Está la advertencia, con todas las letras…
    expect(document.querySelector('[data-medir="elegir-documento"]')!.textContent)
      .toContain(TEXTO_NO_RESERVA);
    // …y todavía NO salió nada: se lee antes de decidir, no después.
    expect(enviosDeCheckout(llamadas)).toHaveLength(0);
  });

  it("elegir COTIZACIÓN manda documento:'cotizacion' — con el mismo cliente elegido", async () => {
    const llamadas = stubCheckout();
    await pintarCheckout();
    fireEvent.click(screen.getByRole("button", { name: "Elegir" }));
    fireEvent.click(await screen.findByRole("button", { name: /Sporting Shoes/ }));
    await waitFor(() => expect(botonEnviar().disabled).toBe(false));

    expect(await tocarEnviarCheckout("cotizacion")).toBe(true);
    expect(enviosDeCheckout(llamadas)).toHaveLength(1);
    expect(salidaDeCheckout(llamadas)).toBe("cotizacion");
    // El cliente sigue siendo el elegido: la salida no toca al cliente.
    expect(JSON.parse(enviosDeCheckout(llamadas)[0].body!).cliente).toEqual({ id: 42, nombre: "Sporting Shoes" });
  });

  it("elegir PEDIDO manda documento:'pedido' — el camino de siempre, explícito", async () => {
    const llamadas = stubCheckout();
    await pintarCheckout();
    fireEvent.click(screen.getByRole("button", { name: "Elegir" }));
    fireEvent.click(await screen.findByRole("button", { name: /Sporting Shoes/ }));
    await waitFor(() => expect(botonEnviar().disabled).toBe(false));

    await tocarEnviarCheckout("pedido");
    expect(salidaDeCheckout(llamadas)).toBe("pedido");
  });

  it("cancelar la elección no manda NADA", async () => {
    const llamadas = stubCheckout();
    await pintarCheckout();
    fireEvent.click(screen.getByRole("button", { name: "Elegir" }));
    fireEvent.click(await screen.findByRole("button", { name: /Sporting Shoes/ }));
    await waitFor(() => expect(botonEnviar().disabled).toBe(false));

    await act(async () => { fireEvent.click(botonEnviar()); });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Cancelar" })); });
    expect(hayEleccion()).toBe(false);
    expect(enviosDeCheckout(llamadas)).toHaveLength(0);
  });

  it("en el DETALLE la cotización también viaja como cotización", async () => {
    const llamadas = await pintarDetalle({ clienteSwitchId: 42, clienteNombre: "Sporting Shoes", clienteCodigo: "D-42" });
    expect(await tocarEnviarDetalle("cotizacion")).toBe(true);
    const envios = enviosASwitch(llamadas);
    expect(envios).toHaveLength(1);
    expect(JSON.parse(envios[0].body!).documento).toBe("cotizacion");
  });

  it("🔴 y en el DETALLE, sin cliente, la cotización tampoco sale", async () => {
    const llamadas = await pintarDetalle({ clienteSwitchId: null });
    expect(await tocarEnviarDetalle("cotizacion")).toBe(false);
    expect(enviosASwitch(llamadas)).toHaveLength(0);
  });
});

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * EL CLIENTE REVISA ANTES DE CONFIRMAR — candado de CONDUCTA (7-sep-2026)
 *
 * Acá NO se busca texto en un archivo: se RENDERIZA la pantalla del cliente, se
 * TOCAN los botones y se mira qué quedó en el carrito y qué `fetch` salió.
 *
 * 🩸 Lo que se arregló: desde el catálogo público, «Confirmar pedido» creaba el
 * pedido, lo mandaba a Switch y aterrizaba al cliente en una página donde ya no
 * había nada que cambiar. El VENDEDOR sí revisa (su checkout). Daniel: *«así
 * puede agregar, quitar o editar»*.
 *
 * Lo que se fija:
 *   1. Se ve LO QUE VA A PEDIR: producto, cantidad y subtotal.
 *   2. Se cambian cantidades y se quitan líneas, y el carrito queda guardado.
 *   3. 🔴 El PRECIO no se toca: no hay ni un campo para escribirlo.
 *   4. Sin nombre no se confirma — y el botón DICE por qué.
 *   5. Con nombre, confirmar hace las dos llamadas de siempre y lleva al pedido.
 *   6. ⚠️ La cartera de clientes no aparece por ninguna parte.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, act, within } from "@testing-library/react";
import RevisarPedidoPublico from "@/components/catalogo/RevisarPedidoPublico";
import { MARCA_THEME, MARCAS_UI } from "@/lib/catalogo/marcas-ui";

const PUSH = vi.fn();
const ROUTER = { push: (...a: unknown[]) => PUSH(...a), replace: vi.fn(), refresh: vi.fn() };
vi.mock("next/navigation", () => ({
  useRouter: () => ROUTER,
  usePathname: () => "/catalogo-publico/tommy/revisar",
  useSearchParams: () => new URLSearchParams(""),
}));

function makeStorage(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k) => (m.has(k) ? m.get(k)! : null),
    setItem: (k, v) => void m.set(k, String(v)),
    removeItem: (k) => void m.delete(k),
    clear: () => m.clear(),
    key: (i) => [...m.keys()][i] ?? null,
    get length() { return m.size; },
  } as Storage;
}

// Dos líneas de Tommy: una de bulto 8 y otra de 12, para que el subtotal no
// pueda salir bien por casualidad. 3 × 8 × $12 = $288 · 2 × 12 × $30 = $720.
const CARRITO = [
  { product_id: "p1", sku: "TH-001", name: "Polo Core", image_url: "", quantity: 3, unit_price: 12, category: "apparel", bulto_pzas: 8 },
  { product_id: "p2", sku: "TH-002", name: "Jeans Slim", image_url: "", quantity: 2, unit_price: 30, category: "apparel", bulto_pzas: 12 },
];

const CLAVE_CARRITO = MARCA_THEME.tommy.publicCartKey;
const CLAVE_NOMBRE = MARCA_THEME.tommy.publicClientNameKey;

let llamadas: { url: string; method: string; body: string }[] = [];

function red(opciones: { crearOk?: boolean; confirmarOk?: boolean } = {}) {
  const { crearOk = true, confirmarOk = true } = opciones;
  llamadas = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    llamadas.push({ url: u, method: init?.method || "GET", body: String(init?.body ?? "") });
    if (u.endsWith("/confirmar")) {
      return {
        ok: confirmarOk, status: confirmarOk ? 200 : 500,
        json: async () => (confirmarOk ? { numero: "TOM-044" } : { error: "Switch no contestó" }),
      } as Response;
    }
    return {
      ok: crearOk, status: crearOk ? 200 : 500,
      json: async () => (crearOk ? { short_id: "abc123" } : { error: "No se pudo guardar" }),
    } as Response;
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(globalThis, "localStorage", { value: makeStorage(), configurable: true, writable: true });
  Object.defineProperty(globalThis, "sessionStorage", { value: makeStorage(), configurable: true, writable: true });
  sessionStorage.setItem(CLAVE_CARRITO, JSON.stringify(CARRITO));
  red();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function leerCarritoGuardado(): typeof CARRITO {
  return JSON.parse(sessionStorage.getItem(CLAVE_CARRITO) || "[]");
}

function pintar(marca: (typeof MARCAS_UI)[number] = "tommy") {
  return render(<RevisarPedidoPublico marca={marca} />);
}

/** La LISTA de líneas, no el mini-carrito de la barra: los dos nombran los
 *  mismos productos, y lo que se está probando es la lista. */
function lista(): HTMLElement {
  const el = document.querySelector<HTMLElement>('[data-medir="lineas-pedido"]');
  if (!el) throw new Error("no se dibujó la lista de líneas");
  return el;
}

/** Espera a que la pantalla haya cargado el carrito de la sesión. */
async function esperarLista(): Promise<HTMLElement> {
  await waitFor(() => expect(within(lista()).getByText("Polo Core")).toBeTruthy());
  return lista();
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. SE VE LO QUE VA A PEDIR
// ═══════════════════════════════════════════════════════════════════════════

describe("🔴 1. la pantalla muestra lo que el cliente va a pedir", () => {
  it("cada producto con su cantidad y su subtotal, y el total abajo", async () => {
    pintar();
    const filas = await esperarLista();
    expect(within(filas).getByText("Jeans Slim")).toBeTruthy();

    const texto = (filas.textContent ?? "").replace(/\s+/g, " ");
    expect(texto).toContain("3 bultos");
    expect(texto).toContain("2 bultos");
    // Subtotales por línea y total del pedido: $288 + $720 = $1,008.
    expect(texto).toContain("$288.00");
    expect(texto).toContain("$720.00");
    // Y las piezas, que es en lo que trabaja Switch (3×8 = 24 · 2×12 = 24).
    expect(texto).toContain("24 pzas");
    // El total del pedido, fuera de la lista: $288 + $720 = $1,008.
    expect(document.body.textContent).toContain("$1,008");
  });

  it("con el carrito vacío no dice $0.00: dice qué pasó y ofrece la salida", async () => {
    sessionStorage.setItem(CLAVE_CARRITO, "[]");
    const { container } = pintar();
    await waitFor(() => expect(screen.getByText(/Todavía no agregaste nada/)).toBeTruthy());
    expect((container.textContent ?? "")).not.toContain("$0.00");
    expect(screen.getByRole("link", { name: /Ver el catálogo/ })).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. CAMBIAR CANTIDADES Y QUITAR LÍNEAS
// ═══════════════════════════════════════════════════════════════════════════

describe("🔴 2. el cliente cambia cantidades y quita líneas", () => {
  it("«+» sube la cantidad y lo guardado sigue lo que se ve", async () => {
    pintar();
    const filas = await esperarLista();
    await act(async () => { fireEvent.click(within(filas).getAllByRole("button", { name: "Más" })[0]); });
    await waitFor(() => expect(leerCarritoGuardado()[0].quantity).toBe(4));
    expect(within(lista()).getByText(/4 bultos/)).toBeTruthy();
  });

  it("«−» baja la cantidad", async () => {
    pintar();
    const filas = await esperarLista();
    await act(async () => { fireEvent.click(within(filas).getAllByRole("button", { name: "Menos" })[0]); });
    await waitFor(() => expect(leerCarritoGuardado()[0].quantity).toBe(2));
  });

  it("«Quitar» saca la línea y deja las demás intactas", async () => {
    pintar();
    const filas = await esperarLista();
    await act(async () => { fireEvent.click(within(filas).getAllByRole("button", { name: "Quitar" })[0]); });
    await waitFor(() => expect(leerCarritoGuardado()).toHaveLength(1));
    expect(leerCarritoGuardado()[0].product_id).toBe("p2");
    expect(within(lista()).queryByText("Polo Core")).toBeNull();
    expect(within(lista()).getByText("Jeans Slim")).toBeTruthy();
  });

  it("se puede volver al catálogo a agregar más SIN perder lo que lleva", async () => {
    pintar();
    await esperarLista();
    const volver = screen.getByRole("link", { name: /Agregar más productos/ });
    expect(volver.getAttribute("href")).toBe("/catalogo-publico/tommy");
    // El carrito vive en la sesión de la pestaña: sigue ahí.
    expect(leerCarritoGuardado()).toHaveLength(2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. 🔴 EL PRECIO NO SE TOCA
// ═══════════════════════════════════════════════════════════════════════════

describe("🔴 3. el precio no se toca del lado del cliente", () => {
  it("el precio se lee, y no hay ni un campo numérico para cambiarlo", async () => {
    const { container } = pintar();
    const filas = await esperarLista();
    expect((filas.textContent ?? "").replace(/\s+/g, " ")).toContain("$12.00");
    expect(container.querySelectorAll('input[type="number"]')).toHaveLength(0);
    expect(screen.queryByTitle("Tocar para cambiar el precio")).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. SIN NOMBRE NO SE CONFIRMA
// ═══════════════════════════════════════════════════════════════════════════

describe("🔴 4. sin nombre no se confirma, y el botón dice por qué", () => {
  it("el botón está apagado y escribe qué falta; no sale ninguna llamada", async () => {
    pintar();
    await esperarLista();
    const boton = screen.getByRole("button", { name: /Falta tu nombre/ }) as HTMLButtonElement;
    expect(boton.disabled).toBe(true);
    await act(async () => { fireEvent.click(boton); });
    expect(llamadas).toHaveLength(0);
  });

  it("⚠️ el nombre se ESCRIBE — la cartera de clientes no aparece", async () => {
    const { container } = pintar();
    await esperarLista();
    expect(screen.getByLabelText(/Tu nombre/)).toBeTruthy();
    // Ni un desplegable, ni un buscador de clientes: solo el campo de texto.
    expect(container.querySelectorAll("select")).toHaveLength(0);
    expect((container.textContent ?? "")).not.toContain("Elegir cliente");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. CON NOMBRE, CONFIRMAR HACE LO DE SIEMPRE
// ═══════════════════════════════════════════════════════════════════════════

describe("🔴 5. confirmar crea el pedido y lo confirma, en ese orden", () => {
  async function escribirNombreYConfirmar() {
    pintar();
    await esperarLista();
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/Tu nombre/), { target: { value: "María Pérez" } });
    });
    const boton = await screen.findByRole("button", { name: /Confirmar pedido/ });
    await act(async () => { fireEvent.click(boton); });
  }

  it("dos llamadas: crear con el nombre y las líneas, y confirmar", async () => {
    await escribirNombreYConfirmar();
    await waitFor(() => expect(llamadas).toHaveLength(2));
    expect(llamadas[0].url).toBe("/api/catalogo/tommy/pedido-publico");
    expect(llamadas[0].method).toBe("POST");
    const cuerpo = JSON.parse(llamadas[0].body);
    expect(cuerpo.cliente_nombre).toBe("María Pérez");
    expect(cuerpo.items).toHaveLength(2);
    expect(llamadas[1].url).toBe("/api/catalogo/tommy/pedido-publico/abc123/confirmar");
  });

  it("si la creación falla, NO se confirma nada y el carrito queda intacto", async () => {
    red({ crearOk: false });
    await escribirNombreYConfirmar();
    await waitFor(() => expect(screen.getByText("No se pudo guardar")).toBeTruthy());
    expect(llamadas.filter((l) => l.url.endsWith("/confirmar"))).toHaveLength(0);
    expect(leerCarritoGuardado()).toHaveLength(2);
  });

  it("si la confirmación falla, el carrito NO se vacía", async () => {
    red({ confirmarOk: false });
    await escribirNombreYConfirmar();
    await waitFor(() => expect(screen.getByText("Switch no contestó")).toBeTruthy());
    expect(leerCarritoGuardado()).toHaveLength(2);
  });

  it("reintentar NO duplica el pedido: reusa el que ya se creó", async () => {
    red({ confirmarOk: false });
    await escribirNombreYConfirmar();
    await waitFor(() => expect(screen.getByText("Switch no contestó")).toBeTruthy());
    const boton = await screen.findByRole("button", { name: /Confirmar pedido/ });
    await act(async () => { fireEvent.click(boton); });
    await waitFor(() => expect(llamadas.filter((l) => l.url.endsWith("/confirmar")).length).toBe(2));
    // Un solo POST de creación en las dos vueltas.
    expect(llamadas.filter((l) => l.url.endsWith("/pedido-publico"))).toHaveLength(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. LAS CUATRO MARCAS, LA MISMA PANTALLA
// ═══════════════════════════════════════════════════════════════════════════

describe("las 4 marcas usan esta MISMA pantalla", () => {
  it.each([...MARCAS_UI])("%s revisa y confirma contra su propia API", async (marca) => {
    sessionStorage.setItem(MARCA_THEME[marca].publicCartKey, JSON.stringify(CARRITO));
    localStorage.setItem(MARCA_THEME[marca].publicClientNameKey, "María Pérez");
    pintar(marca);
    await esperarLista();
    const boton = await screen.findByRole("button", { name: /Confirmar pedido/ });
    await act(async () => { fireEvent.click(boton); });
    await waitFor(() => expect(llamadas.length).toBeGreaterThan(0));
    expect(llamadas[0].url).toBe(`/api/catalogo/${marca}/pedido-publico`);
  });

  it("el nombre se recuerda de una visita a otra (no se vuelve a teclear)", async () => {
    localStorage.setItem(CLAVE_NOMBRE, "María Pérez");
    pintar();
    await esperarLista();
    expect((screen.getByLabelText(/Tu nombre/) as HTMLInputElement).value).toBe("María Pérez");
  });
});

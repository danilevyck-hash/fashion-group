/**
 * ─────────────────────────────────────────────────────────────────────────────
 * CATÁLOGOS Y PEDIDOS — LOS ARREGLOS DE LA AUDITORÍA DE FLUJO (23-ago-2026)
 *
 * 🔴 CANDADO DE CONDUCTA. Acá NO se busca texto en el archivo: se RENDERIZA la
 * pantalla, se TOCA el botón y se mira QUÉ `fetch` salió y qué quedó en
 * pantalla. Un barrido estático se cumple con el comentario que lo explica —
 * este repo ya pagó ese defecto cuatro veces.
 *
 * Lo que fija cada bloque:
 *   1. Borrar un pedido MIRA el resultado (antes cerraba y recargaba pasara lo
 *      que pasara: con 500 o sin red el pedido seguía ahí y la persona creía
 *      haberlo borrado).
 *   2. Hay UN solo "Ver pedido" en las 4 marcas (Joybees, Tommy y Calvin
 *      mostraban dos a la vez; Reebok siempre tuvo uno).
 *   3. "Vaciar" el carrito PREGUNTA antes de borrar 30 líneas de trabajo.
 *   5. El catálogo interno separa "no cargó" de "los filtros no dan" — y con
 *      cero filtros puestos NO ofrece "Limpiar filtros", ofrece "Reintentar".
 *   7. En el admin, la fila y su botón "Editar" llevan al MISMO lado.
 *   8. El PDF del catálogo dice en el encabezado que salió filtrado por PRECIO.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, act, within } from "@testing-library/react";
import PedidosListClient from "@/components/catalogo/PedidosListClient";
import CatalogoVendedorPage from "@/components/catalogo/CatalogoVendedorPage";
import CatalogoStickyCartBar from "@/components/catalogo/CatalogoStickyCartBar";
import ComprobantesPanel, { type UnifiedPedido } from "@/components/catalogo/ComprobantesPanel";
import { MARCAS_UI } from "@/lib/catalogo/marcas-ui";

const PUSH = vi.fn();
let QUERY = "";
// Objeto ESTABLE: uno nuevo por llamada rehace los `useCallback` que lo llevan
// en sus dependencias y la pantalla puede entrar en bucle.
const ROUTER = { push: (...a: unknown[]) => PUSH(...a), replace: vi.fn(), refresh: vi.fn() };
vi.mock("next/navigation", () => ({
  useRouter: () => ROUTER,
  usePathname: () => "/catalogo/reebok/pedidos",
  useSearchParams: () => new URLSearchParams(QUERY),
}));
const TOAST = vi.fn();
vi.mock("@/components/ToastSystem", () => ({
  useToast: () => ({ toast: (...a: unknown[]) => TOAST(...a) }),
}));
// "Actualizar ahora" tiene su propia red y su propio gate de rol.
vi.mock("@/components/shared/CatalogoSyncNow", () => ({ default: () => null }));

// El PDF del catálogo se importa dinámicamente; se intercepta para leer el
// subtítulo REAL con el que se genera.
const PDF = vi.fn(async () => {});
vi.mock("@/lib/catalogo/catalog-pdf", () => ({ downloadCatalogPdf: (...a: unknown[]) => PDF(...(a as [])) }));

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

let llamadas: { url: string; method: string; init?: RequestInit }[] = [];

beforeEach(() => {
  QUERY = "";
  vi.clearAllMocks();
  llamadas = [];
  Object.defineProperty(globalThis, "localStorage", { value: makeStorage(), configurable: true, writable: true });
  Object.defineProperty(globalThis, "sessionStorage", { value: makeStorage(), configurable: true, writable: true });
  sessionStorage.setItem("cxc_role", "admin");
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// ═══════════════════════════════════════════════════════════════════════════
// 1. BORRAR UN PEDIDO COMPRUEBA Y AVISA
// ═══════════════════════════════════════════════════════════════════════════
const PEDIDOS = [
  {
    id: "o-1", order_number: "PED-021", client_name: "Sporting Shoes", vendor_name: "Rey",
    status: "borrador", total: 500, item_count: 2, created_at: "2026-08-01T12:00:00Z",
    en_switch: false, switch_numero: null, fuente: "orders", del_link: false,
  },
];

function redLista(deleteStatus: number | "red-caida") {
  llamadas = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    const method = init?.method || "GET";
    llamadas.push({ url: u, method, init });
    if (method === "DELETE") {
      if (deleteStatus === "red-caida") throw new TypeError("Failed to fetch");
      return { ok: deleteStatus < 400, status: deleteStatus, json: async () => ({}) } as Response;
    }
    if (u.includes("/orders")) return { ok: true, json: async () => PEDIDOS } as Response;
    return { ok: true, json: async () => ({}) } as Response;
  }));
}

const gets = () => llamadas.filter((l) => l.method === "GET" && l.url.includes("/orders"));
const deletes = () => llamadas.filter((l) => l.method === "DELETE");

async function abrirBorrado() {
  render(<PedidosListClient marca="reebok" />);
  // 🔴 Desde que hay UNA sola pantalla, el panel abre en el chip «Pedidos» y
  // PED-021 es `status='borrador'`: hay que tocar su chip para verlo. No es un
  // rodeo del candado — es la pantalla que Daniel pidió (#608), y que el
  // borrado siga funcionando DESDE AHÍ es justamente lo que hay que probar.
  await waitFor(() => expect(screen.getByRole("button", { name: /Borradores/ })).toBeTruthy());
  fireEvent.click(screen.getByRole("button", { name: /Borradores/ }));
  await waitFor(() => expect(screen.getByText("PED-021")).toBeTruthy());
  fireEvent.click(screen.getByRole("button", { name: "Eliminar" }));
  // ConfirmDeleteModal habilita el botón rojo recién al segundo.
  const confirmar = await waitFor(() => {
    const b = document.querySelector<HTMLButtonElement>("button.bg-red-600");
    expect(b && !b.disabled).toBe(true);
    return b!;
  }, { timeout: 3000 });
  const getsAntes = gets().length;
  await act(async () => { fireEvent.click(confirmar); });
  return { getsAntes };
}

describe("🔴 1. borrar un pedido comprueba el resultado y lo dice", () => {
  it("con 500: la ventana SIGUE abierta, avisa y NO recarga la lista", async () => {
    redLista(500);
    const { getsAntes } = await abrirBorrado();
    await waitFor(() => expect(deletes()).toHaveLength(1));
    // La ventana no se cerró: el botón rojo sigue en pantalla.
    expect(document.querySelector("button.bg-red-600")).toBeTruthy();
    // Y lo dice con todas las letras.
    expect(TOAST).toHaveBeenCalledWith(expect.stringMatching(/No se pudo eliminar/i), "error");
    // Recargar la lista tras un fallo es justo lo que hacía creer que funcionó.
    expect(gets().length).toBe(getsAntes);
  });

  it("sin red: mismo trato — ventana abierta, aviso, sin recarga", async () => {
    redLista("red-caida");
    const { getsAntes } = await abrirBorrado();
    await waitFor(() => expect(TOAST).toHaveBeenCalled());
    expect(document.querySelector("button.bg-red-600")).toBeTruthy();
    expect(TOAST).toHaveBeenCalledWith(expect.stringMatching(/conexión/i), "error");
    expect(gets().length).toBe(getsAntes);
  });

  it("con 200: cierra, confirma que se eliminó y recarga", async () => {
    redLista(200);
    const { getsAntes } = await abrirBorrado();
    await waitFor(() => expect(gets().length).toBe(getsAntes + 1));
    expect(document.querySelector("button.bg-red-600")).toBeNull();
    expect(TOAST).toHaveBeenCalledWith("Pedido eliminado", "success");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2, 5 y 8. EL CATÁLOGO DEL VENDEDOR
// ═══════════════════════════════════════════════════════════════════════════
const PRODUCTOS = [
  { id: "p1", sku: "TH-001", name: "Polo Core", price: 12, image_url: null, category: "apparel", gender: "men", bulto_pzas: 8, disponibilidad: 240, existencia: 240, active: true },
  { id: "p2", sku: "TH-002", name: "Jeans Slim", price: 60, image_url: null, category: "apparel", gender: "men", bulto_pzas: 12, disponibilidad: 120, existencia: 120, active: true },
];

function redCatalogo(falla = false) {
  llamadas = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    llamadas.push({ url: u, method: init?.method || "GET", init });
    if (falla) throw new TypeError("Failed to fetch");
    if (u.includes("/products")) return { ok: true, status: 200, json: async () => PRODUCTOS } as Response;
    // Reebok arma su grid con el inventario POR TALLA: sin tallas su tarjeta no
    // ofrece "Agregar" y el carrito no se llenaría nunca (el test daría verde
    // sin haber mirado nada).
    if (u.includes("/inventory")) {
      return { ok: true, status: 200, json: async () => [
        { product_id: "p1", size: "9", quantity: 120 },
        { product_id: "p2", size: "10", quantity: 60 },
      ] } as Response;
    }
    return { ok: true, status: 200, json: async () => ({}) } as Response;
  }));
}

describe("🔴 2. UN solo «Ver pedido», en las 4 marcas", () => {
  for (const marca of MARCAS_UI) {
    it(`${marca}: con el carrito lleno hay exactamente 1`, async () => {
      redCatalogo();
      const { container } = render(<CatalogoVendedorPage marca={marca} />);
      await waitFor(() => expect(screen.getByText("Polo Core")).toBeTruthy());
      // Se llena el carrito TOCANDO la tarjeta, como una persona.
      const card = screen.getByText("Polo Core").closest("div.bg-white") as HTMLElement;
      await act(async () => { fireEvent.click(within(card).getByRole("button", { name: "Agregar" })); });
      await waitFor(() => {
        // `includes`, no `===`: la barra pegajosa de Reebok le pone una flecha
        // al final ("Ver pedido→") y con igualdad exacta el test daría verde
        // sin haber contado el botón que importa.
        const vistos = [...container.querySelectorAll("button, a")]
          .filter((b) => (b.textContent || "").includes("Ver pedido"));
        expect(vistos).toHaveLength(1);
      });
    });
  }
});

describe("🔴 5. «no cargó» ≠ «los filtros no dan»", () => {
  it("si el fetch se cae: dice que no cargó y ofrece Reintentar, no Limpiar filtros", async () => {
    redCatalogo(true);
    render(<CatalogoVendedorPage marca="tommy" />);
    const aviso = await waitFor(() => screen.getByText(/No pudimos cargar el catálogo/));
    const vacio = aviso.parentElement as HTMLElement;
    expect(within(vacio).getByRole("button", { name: "Reintentar" })).toBeTruthy();
    expect(screen.queryByText(/No encontramos productos con estos filtros/)).toBeNull();
    expect(within(vacio).queryByRole("button", { name: "Limpiar filtros" })).toBeNull();
  });

  // 🩸 Las TRES ramas de carga tienen su propio `catch` (Joybees agrupado ·
  // Reebok con inventario por talla · Tommy/Calvin planas). Probar una sola
  // deja las otras dos libres de volver al bug sin que nadie se entere: la
  // mutación que apaga el aviso SOLO en la rama de Reebok se escapaba.
  for (const marca of MARCAS_UI) {
    it(`${marca}: su rama de carga también avisa que no cargó`, async () => {
      redCatalogo(true);
      render(<CatalogoVendedorPage marca={marca} />);
      const aviso = await waitFor(() => screen.getByText(/No pudimos cargar el catálogo/));
      const vacio = aviso.parentElement as HTMLElement;
      expect(within(vacio).getByRole("button", { name: "Reintentar" })).toBeTruthy();
    });
  }

  it("«Reintentar» vuelve a pedir los productos de verdad", async () => {
    redCatalogo(true);
    render(<CatalogoVendedorPage marca="tommy" />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Reintentar" })).toBeTruthy());
    const antes = llamadas.filter((l) => l.url.includes("/products")).length;
    redCatalogo(false);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Reintentar" })); });
    await waitFor(() => expect(screen.getByText("Polo Core")).toBeTruthy());
    expect(llamadas.filter((l) => l.url.includes("/products")).length).toBeGreaterThan(0);
    expect(antes).toBeGreaterThan(0);
  });

  it("cargó bien pero está vacío y SIN filtros: tampoco culpa a los filtros", async () => {
    llamadas = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      llamadas.push({ url: String(url), method: "GET" });
      return { ok: true, status: 200, json: async () => [] } as Response;
    }));
    render(<CatalogoVendedorPage marca="tommy" />);
    const aviso = await waitFor(() => screen.getByText(/Por ahora no hay productos disponibles/));
    const vacio = aviso.parentElement as HTMLElement;
    expect(within(vacio).queryByRole("button", { name: "Limpiar filtros" })).toBeNull();
    expect(within(vacio).queryByRole("button", { name: "Reintentar" })).toBeNull();
  });

  it("con un filtro puesto que corta todo: AHÍ sí ofrece Limpiar filtros", async () => {
    QUERY = "search=noexistenada";
    redCatalogo();
    render(<CatalogoVendedorPage marca="tommy" />);
    const aviso = await waitFor(() => screen.getByText(/No encontramos productos con estos filtros/));
    // El botón que importa es el del VACÍO (la barra de filtros tiene el suyo).
    const vacio = aviso.parentElement as HTMLElement;
    expect(within(vacio).getByRole("button", { name: "Limpiar filtros" })).toBeTruthy();
    expect(screen.queryByText(/No pudimos cargar el catálogo/)).toBeNull();
  });
});

describe("🔴 8. el PDF dice que salió filtrado por precio", () => {
  it("con precio desde/hasta, el encabezado lo escribe", async () => {
    QUERY = "precio_desde=10&precio_hasta=50";
    redCatalogo();
    render(<CatalogoVendedorPage marca="tommy" />);
    await waitFor(() => expect(screen.getByText("Polo Core")).toBeTruthy());
    // El filtro FILTRA de verdad: Jeans ($60) queda fuera del rango.
    expect(screen.queryByText("Jeans Slim")).toBeNull();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Compartir/ })); });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Descargar PDF/ })); });
    await waitFor(() => expect(PDF).toHaveBeenCalled());
    expect(PDF.mock.calls[0][0]).toMatchObject({ subtitle: expect.stringContaining("$10") });
    expect((PDF.mock.calls[0][0] as { subtitle: string }).subtitle).toContain("$50");
  });

  it("solo «hasta»: también se escribe", async () => {
    QUERY = "precio_hasta=20";
    redCatalogo();
    render(<CatalogoVendedorPage marca="tommy" />);
    await waitFor(() => expect(screen.getByText("Polo Core")).toBeTruthy());
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Compartir/ })); });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Descargar PDF/ })); });
    await waitFor(() => expect(PDF).toHaveBeenCalled());
    expect((PDF.mock.calls[0][0] as { subtitle: string }).subtitle).toMatch(/hasta \$20/);
  });

  it("sin filtros el subtítulo sigue VACÍO (no se inventa ruido)", async () => {
    redCatalogo();
    render(<CatalogoVendedorPage marca="tommy" />);
    await waitFor(() => expect(screen.getByText("Polo Core")).toBeTruthy());
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Compartir/ })); });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Descargar PDF/ })); });
    await waitFor(() => expect(PDF).toHaveBeenCalled());
    expect((PDF.mock.calls[0][0] as { subtitle: string }).subtitle).toBe("");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. "VACIAR" PREGUNTA
// ═══════════════════════════════════════════════════════════════════════════
const CARRITO = [
  { product_id: "p1", sku: "TH-001", name: "Polo Core", image_url: "", quantity: 3, unit_price: 12, category: "apparel", bulto_pzas: 8 },
  { product_id: "p2", sku: "TH-002", name: "Jeans Slim", image_url: "", quantity: 2, unit_price: 30, category: "apparel", bulto_pzas: 12 },
];

function pintarBarra(onClearCart: () => void) {
  return render(
    <CatalogoStickyCartBar
      marca="tommy"
      cart={CARRITO}
      cartCount={5}
      cartTotal={396}
      onQtyChange={vi.fn()}
      onClearCart={onClearCart}
      variant="vendor"
      onCreateOrder={vi.fn()}
      formatTotal={(n) => String(n)}
    />,
  );
}

describe("🔴 3. «Vaciar» pregunta antes de borrar el pedido armado", () => {
  it("un toque en Vaciar NO vacía nada todavía", async () => {
    const limpiar = vi.fn();
    pintarBarra(limpiar);
    fireEvent.click(screen.getByRole("button", { name: /5 bultos/ }));
    fireEvent.click(screen.getByRole("button", { name: "Vaciar" }));
    expect(limpiar).not.toHaveBeenCalled();
    // Y se ve la pregunta, con lo que se pierde.
    expect(screen.getByText("¿Vaciar el pedido?")).toBeTruthy();
    expect(screen.getByText(/2 productos/)).toBeTruthy();
  });

  it("Cancelar deja el pedido intacto", async () => {
    const limpiar = vi.fn();
    pintarBarra(limpiar);
    fireEvent.click(screen.getByRole("button", { name: /5 bultos/ }));
    fireEvent.click(screen.getByRole("button", { name: "Vaciar" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(limpiar).not.toHaveBeenCalled();
    expect(screen.queryByText("¿Vaciar el pedido?")).toBeNull();
  });

  it("recién al CONFIRMAR se vacía", async () => {
    const limpiar = vi.fn();
    pintarBarra(limpiar);
    fireEvent.click(screen.getByRole("button", { name: /5 bultos/ }));
    fireEvent.click(screen.getByRole("button", { name: "Vaciar" }));
    const confirmar = await waitFor(() => {
      const b = document.querySelector<HTMLButtonElement>("button.bg-red-600");
      expect(b && !b.disabled).toBe(true);
      return b!;
    }, { timeout: 3000 });
    await act(async () => { fireEvent.click(confirmar); });
    expect(limpiar).toHaveBeenCalledTimes(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 7. LA FILA Y "EDITAR" LLEVAN AL MISMO LADO
// ═══════════════════════════════════════════════════════════════════════════
const DEL_LINK: UnifiedPedido = {
  origen: "link", id_natural: "ab12cd34", cliente: "Nathalie", total: 360,
  created_at: new Date().toISOString(), vendor: null, item_count: 1, fuente: "publicos",
};
const INTERNO: UnifiedPedido = {
  origen: "mio", id_natural: "PED-021", cliente: "Sporting Shoes", total: 500,
  created_at: new Date().toISOString(), vendor: "Rey", item_count: 2, fuente: "orders",
};

function redAdmin() {
  llamadas = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    llamadas.push({ url: u, method: init?.method || "GET", init });
    if (u.includes("/convertir")) return { ok: true, json: async () => ({ order_id: "o-nuevo" }) } as Response;
    return { ok: true, json: async () => ({}) } as Response;
  }));
}

const filaDe = (c: HTMLElement, cliente: string) =>
  [...c.querySelectorAll("tbody tr")].find((tr) => (tr.textContent || "").includes(cliente)) as HTMLElement;

describe("🔴 7. la fila y su botón «Editar» llevan al MISMO lado", () => {
  it("«Del link»: tocar la fila convierte y abre el detalle INTERNO (no la vista del cliente)", async () => {
    redAdmin();
    const { container } = render(
      <ComprobantesPanel marca="reebok" pedidos={[DEL_LINK, INTERNO]} onRefresh={async () => {}} showToast={vi.fn()} puedeAdministrar puedeEditar />,
    );
    await act(async () => { fireEvent.click(filaDe(container, "Nathalie")); });
    await waitFor(() => expect(PUSH).toHaveBeenCalledWith("/catalogo/reebok/pedido/o-nuevo"));
    expect(llamadas.some((l) => l.url.includes("/pedidos-publicos/ab12cd34/convertir") && l.method === "POST")).toBe(true);
    // Lo que ya NO puede pasar: irse a la pantalla que ve el CLIENTE.
    expect(PUSH.mock.calls.flat().some((a) => /pedido-|publico/.test(String(a)))).toBe(false);
  });

  it("la fila hace EXACTAMENTE lo mismo que el botón Editar de esa fila", async () => {
    redAdmin();
    const { container } = render(
      <ComprobantesPanel marca="reebok" pedidos={[DEL_LINK, INTERNO]} onRefresh={async () => {}} showToast={vi.fn()} puedeAdministrar puedeEditar />,
    );
    await act(async () => { fireEvent.click(filaDe(container, "Nathalie")); });
    await waitFor(() => expect(PUSH).toHaveBeenCalled());
    const porFila = [...PUSH.mock.calls];
    const llamadasFila = llamadas.map((l) => `${l.method} ${l.url}`);

    cleanup();
    PUSH.mockClear();
    redAdmin();
    const r2 = render(
      <ComprobantesPanel marca="reebok" pedidos={[DEL_LINK, INTERNO]} onRefresh={async () => {}} showToast={vi.fn()} puedeAdministrar puedeEditar />,
    );
    const btn = within(filaDe(r2.container, "Nathalie")).getByRole("button", { name: "Editar" });
    await act(async () => { fireEvent.click(btn); });
    await waitFor(() => expect(PUSH).toHaveBeenCalled());
    expect([...PUSH.mock.calls]).toEqual(porFila);
    expect(llamadas.map((l) => `${l.method} ${l.url}`)).toEqual(llamadasFila);
  });

  it("interno: la fila abre su detalle directo, sin pasar por convertir", async () => {
    redAdmin();
    const { container } = render(
      <ComprobantesPanel marca="reebok" pedidos={[DEL_LINK, INTERNO]} onRefresh={async () => {}} showToast={vi.fn()} puedeAdministrar puedeEditar />,
    );
    await act(async () => { fireEvent.click(filaDe(container, "Sporting Shoes")); });
    expect(PUSH).toHaveBeenCalledWith("/catalogo/reebok/pedido/PED-021");
    expect(llamadas.some((l) => l.url.includes("/convertir"))).toBe(false);
  });
});

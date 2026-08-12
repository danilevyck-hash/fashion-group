// EL CATÁLOGO, AGREGANDO A UN PEDIDO — se renderiza la pantalla REAL.
//
// El riesgo de verdad no es la matemática: es que un "Agregar" del catálogo
// termine en el CARRITO (que después crea un pedido NUEVO en el checkout) en
// vez de en el pedido que se está editando. Eso un test de función pura no lo
// puede ver, así que acá se monta `CatalogoVendedorPage`, se toca "Agregar" y
// se mira A DÓNDE fue la escritura.
//
// Cubre las 3 marcas planas del pedido de Daniel: Tommy (bulto 8/12 por
// estilo), Reebok (preventa `is_preorder`) y Calvin.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import CatalogoVendedorPage from "@/components/catalogo/CatalogoVendedorPage";

const PUSH = vi.fn();
let QUERY = "agregarA=ORD-1";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(QUERY),
  useRouter: () => ({ push: PUSH, replace: vi.fn() }),
  usePathname: () => "/catalogo/tommy",
}));

// El botón "Actualizar ahora" tiene su propia red y su propio gate de rol; no
// es lo que se está probando.
vi.mock("@/components/shared/CatalogoSyncNow", () => ({ default: () => null }));

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

const PRODUCTOS = [
  { id: "p1", sku: "TH-001", name: "Polo Core", price: 12, image_url: null, category: "apparel", gender: "men", bulto_pzas: 8, disponibilidad: 240, existencia: 240, active: true },
  { id: "p2", sku: "TH-002", name: "Jeans Slim", price: 30, image_url: null, category: "apparel", gender: "men", bulto_pzas: 12, disponibilidad: 120, existencia: 120, active: true, badge: "proximamente" },
];

interface Escenario {
  itemsField?: string;
  items?: { product_id: string; quantity: number; unit_price: number }[];
  envio?: { estado: string } | null;
  patchStatus?: number;
  pedidoOk?: boolean;
}

let llamadas: { url: string; init?: RequestInit }[] = [];

function stubRed(e: Escenario = {}) {
  const {
    itemsField = "tommy_order_items",
    items = [{ product_id: "p1", quantity: 9, unit_price: 12 }],
    envio = null,
    patchStatus = 200,
    pedidoOk = true,
  } = e;
  llamadas = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    llamadas.push({ url: String(url), init });
    const u = String(url);
    if (u.includes("/products?active=true")) {
      return { ok: true, status: 200, json: async () => PRODUCTOS };
    }
    if (u.includes("/inventory")) {
      // Reebok arma su stock con el inventario por talla; acá el vendible sale
      // de `disponibilidad`, igual que en producción.
      return { ok: true, status: 200, json: async () => [] };
    }
    if (u.includes("/enviar-switch")) {
      return { ok: true, status: 200, json: async () => ({ envio }) };
    }
    if (/\/item$/.test(u)) {
      return { ok: patchStatus === 200, status: patchStatus, json: async () => ({ ok: patchStatus === 200 }) };
    }
    if (/\/orders\/ORD-1$/.test(u)) {
      if (!pedidoOk) return { ok: false, status: 404, json: async () => ({}) };
      return {
        ok: true, status: 200,
        json: async () => ({ id: "ORD-1", order_number: "TOM-010", client_name: "Aidy Shop No.2", [itemsField]: items }),
      };
    }
    return { ok: true, status: 200, json: async () => ({}) };
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const patches = () => llamadas.filter((l) => /\/item$/.test(l.url));
/** El botón de LA tarjeta de ese producto (el grid ordena por categoría+género,
 *  así que el primer "Agregar" de la pantalla no es necesariamente el buscado). */
function botonDe(nombreProducto: string, boton: string) {
  const card = screen.getByText(nombreProducto).closest("div.bg-white") as HTMLElement;
  return within(card).getByRole("button", { name: boton });
}
const cuerpo = (i = 0) => JSON.parse(String(patches()[i].init!.body));

beforeEach(() => {
  QUERY = "agregarA=ORD-1";
  PUSH.mockClear();
  Object.defineProperty(globalThis, "localStorage", { value: makeStorage(), configurable: true, writable: true });
  Object.defineProperty(globalThis, "sessionStorage", { value: makeStorage(), configurable: true, writable: true });
  sessionStorage.setItem("cxc_role", "vendedor");
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("la barra dice a qué pedido se está agregando", () => {
  it("nombre del pedido, cliente, bultos y la salida de vuelta", async () => {
    stubRed();
    render(<CatalogoVendedorPage marca="tommy" />);
    await waitFor(() => expect(screen.getByText("TOM-010 · Aidy Shop No.2")).toBeTruthy());
    expect(screen.getByText("Agregando al pedido")).toBeTruthy();
    expect(screen.getByText("9 bultos en el pedido")).toBeTruthy();
    const volver = screen.getByRole("link", { name: "Listo, volver al pedido" });
    expect(volver.getAttribute("href")).toBe("/catalogo/tommy/pedido/ORD-1");
  });

  it("sin el parámetro, el catálogo es el de siempre (sin barra)", async () => {
    QUERY = "";
    stubRed();
    render(<CatalogoVendedorPage marca="tommy" />);
    await waitFor(() => expect(screen.getByText("Polo Core")).toBeTruthy());
    expect(screen.queryByText("Agregando al pedido")).toBeNull();
    expect(llamadas.some((l) => /\/orders\/ORD-1/.test(l.url))).toBe(false);
  });

  it("quien no puede editar el pedido (bodega) ve el catálogo normal", async () => {
    sessionStorage.setItem("cxc_role", "bodega");
    stubRed();
    render(<CatalogoVendedorPage marca="tommy" />);
    await waitFor(() => expect(screen.getByText("Polo Core")).toBeTruthy());
    expect(screen.queryByText("Agregando al pedido")).toBeNull();
  });
});

describe("agregar escribe en ESE pedido, nunca en el carrito", () => {
  it("Tommy: el PATCH va al pedido con el bulto y el precio del catálogo", async () => {
    stubRed({ items: [] });
    render(<CatalogoVendedorPage marca="tommy" />);
    await waitFor(() => expect(screen.getByText("Polo Core")).toBeTruthy());
    fireEvent.click(botonDe("Polo Core", "Agregar"));
    await waitFor(() => expect(patches().length).toBe(1));

    expect(patches()[0].url).toBe("/api/catalogo/tommy/orders/ORD-1/item");
    expect(patches()[0].init!.method).toBe("PATCH");
    expect(cuerpo()).toMatchObject({ product_id: "p1", sku: "TH-001", quantity: 1, unit_price: 12 });
    // Y el carrito quedó intacto: ni una escritura de storage.
    expect(sessionStorage.getItem("tommy_cart")).toBeNull();
    expect(localStorage.getItem("tommy_cart")).toBeNull();
  });

  it("la tarjeta muestra lo que YA tiene el pedido y el + suma ahí", async () => {
    stubRed({ items: [{ product_id: "p1", quantity: 9, unit_price: 12 }] });
    render(<CatalogoVendedorPage marca="tommy" />);
    await waitFor(() => expect(screen.getByText("9")).toBeTruthy());
    fireEvent.click(botonDe("Polo Core", "+"));
    await waitFor(() => expect(patches().length).toBe(1));
    expect(cuerpo().quantity).toBe(10);
    // El precio de la línea del pedido manda (pudo editarse a mano).
    expect(cuerpo().unit_price).toBe(12);
    await waitFor(() => expect(screen.getByText("10 bultos en el pedido")).toBeTruthy());
  });

  it("quitar la línea manda cantidad 0 (el server la borra)", async () => {
    stubRed({ items: [{ product_id: "p1", quantity: 1, unit_price: 12 }] });
    render(<CatalogoVendedorPage marca="tommy" />);
    await waitFor(() => expect(screen.getByText("Quitar")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Quitar" }));
    await waitFor(() => expect(patches().length).toBe(1));
    expect(cuerpo()).toMatchObject({ product_id: "p1", quantity: 0 });
  });

  it("Reebok: la preventa viaja como is_preorder", async () => {
    stubRed({ itemsField: "reebok_order_items", items: [] });
    render(<CatalogoVendedorPage marca="reebok" />);
    await waitFor(() => expect(screen.getByText("Jeans Slim")).toBeTruthy());
    fireEvent.click(botonDe("Jeans Slim", "Pre-ordenar"));
    await waitFor(() => expect(patches().length).toBe(1));
    expect(patches()[0].url).toBe("/api/catalogo/reebok/orders/ORD-1/item");
    expect(cuerpo()).toMatchObject({ product_id: "p2", is_preorder: true });
  });

  it("Calvin: mismo motor, su propio API", async () => {
    stubRed({ itemsField: "calvin_order_items", items: [] });
    render(<CatalogoVendedorPage marca="calvin" />);
    await waitFor(() => expect(screen.getByText("Polo Core")).toBeTruthy());
    fireEvent.click(botonDe("Polo Core", "Agregar"));
    await waitFor(() => expect(patches().length).toBe(1));
    expect(patches()[0].url).toBe("/api/catalogo/calvin/orders/ORD-1/item");
    // Calvin no maneja preventa: el campo ni se manda.
    expect(cuerpo().is_preorder).toBeUndefined();
  });
});

describe("un pedido que ya está en Switch no acepta nada", () => {
  it("con envío ACTIVO lo dice ANTES de tocar nada y no manda el PATCH", async () => {
    stubRed({ envio: { estado: "enviado" }, items: [] });
    render(<CatalogoVendedorPage marca="tommy" />);
    await waitFor(() =>
      expect(screen.getByText(/Este pedido ya está en Switch/)).toBeTruthy(),
    );
    fireEvent.click(screen.getAllByRole("button", { name: "Agregar" })[0]);
    await waitFor(() => expect(screen.getAllByText(/ya está en Switch/).length).toBeGreaterThan(0));
    expect(patches().length).toBe(0);
    expect(screen.getByRole("link", { name: "Volver al pedido" })).toBeTruthy();
  });

  it("si el candado aparece recién en el 409, la cantidad se revierte y se avisa", async () => {
    stubRed({ items: [], patchStatus: 409 });
    render(<CatalogoVendedorPage marca="tommy" />);
    await waitFor(() => expect(screen.getByText("Polo Core")).toBeTruthy());
    fireEvent.click(screen.getAllByRole("button", { name: "Agregar" })[0]);
    await waitFor(() => expect(patches().length).toBe(1));
    await waitFor(() =>
      expect(screen.getByText("Este pedido ya está en Switch — no se le pueden agregar productos.")).toBeTruthy(),
    );
    // La tarjeta volvió a "Agregar": el pedido NO tiene esa línea.
    expect(screen.getAllByRole("button", { name: "Agregar" }).length).toBeGreaterThan(0);
    // Y un segundo intento ya ni sale a la red.
    fireEvent.click(screen.getAllByRole("button", { name: "Agregar" })[0]);
    await waitFor(() => expect(patches().length).toBe(1));
  });

  it("si el pedido no se puede abrir, la barra lo dice y no se agrega nada", async () => {
    stubRed({ pedidoOk: false });
    render(<CatalogoVendedorPage marca="tommy" />);
    await waitFor(() => expect(screen.getByText("No se pudo abrir el pedido")).toBeTruthy());
    fireEvent.click(screen.getAllByRole("button", { name: "Agregar" })[0]);
    await waitFor(() =>
      expect(screen.getByText(/No se pudo abrir el pedido\. Vuelve al pedido/)).toBeTruthy(),
    );
    expect(patches().length).toBe(0);
  });
});

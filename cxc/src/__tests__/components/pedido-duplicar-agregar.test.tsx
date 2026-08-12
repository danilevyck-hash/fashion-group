// Duplicar con cliente editable + agregar artículos a un pedido existente
// (pedido de Daniel, 12-ago-2026). Se renderizan los modales REALES:
//
//  · DuplicarPedidoModal — mini-modal con el nombre pre-llenado y editable
//    ("¿Para quién es el pedido nuevo?"). Lo usan el Duplicar de la lista y
//    "Duplicar y corregir" del pedido bloqueado por Switch.
//  · AgregarProductosModal — buscador de productos de la marca que agrega
//    líneas al pedido vía el PATCH /item existente (candado Switch intacto).
//
// Además, candados estáticos: el draftIdKey muerto no puede volver, y el
// "+ Agregar productos" del detalle tiene que abrir el buscador (no irse al
// catálogo, donde "Agregar al pedido" mete al CARRITO y crea un pedido NUEVO).

import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { readFileSync } from "fs";
import path from "path";
import DuplicarPedidoModal from "@/components/catalogo/DuplicarPedidoModal";
import AgregarProductosModal, { type ProductoAgregable } from "@/components/catalogo/AgregarProductosModal";
import { getMarcaTheme } from "@/lib/catalogo/marcas-ui";

vi.mock("next/navigation", () => ({
  usePathname: () => "/catalogo/reebok/pedido/x",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/hooks/useSidebarCollapsed", () => ({
  useSidebarCollapsed: () => false,
  readSidebarCollapsed: () => false,
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// ── DuplicarPedidoModal ───────────────────────────────────────────────────────

describe("DuplicarPedidoModal", () => {
  it("pre-llena el nombre del original y pregunta para quién es el pedido nuevo", () => {
    render(
      <DuplicarPedidoModal
        orderNumber="PED-100"
        nombreInicial="Cliente Original"
        duplicando={false}
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(screen.getByText("Duplicar pedido PED-100")).toBeTruthy();
    expect(screen.getByText("¿Para quién es el pedido nuevo?")).toBeTruthy();
    expect((screen.getByPlaceholderText("Nombre del cliente") as HTMLInputElement).value).toBe(
      "Cliente Original",
    );
  });

  it("editar el nombre y tocar Duplicar entrega el nombre NUEVO", () => {
    const onConfirm = vi.fn();
    render(
      <DuplicarPedidoModal
        orderNumber="PED-100"
        nombreInicial="Cliente Original"
        duplicando={false}
        onConfirm={onConfirm}
        onCancel={() => {}}
      />,
    );
    fireEvent.change(screen.getByPlaceholderText("Nombre del cliente"), {
      target: { value: "  Otro Cliente  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Duplicar" }));
    expect(onConfirm).toHaveBeenCalledWith("Otro Cliente");
  });

  it("sin tocar el nombre entrega el original tal cual; vacío cae al original", () => {
    const onConfirm = vi.fn();
    const { unmount } = render(
      <DuplicarPedidoModal
        orderNumber="PED-100"
        nombreInicial="Cliente Original"
        duplicando={false}
        onConfirm={onConfirm}
        onCancel={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Duplicar" }));
    expect(onConfirm).toHaveBeenCalledWith("Cliente Original");
    unmount();

    const onConfirm2 = vi.fn();
    render(
      <DuplicarPedidoModal
        orderNumber="PED-100"
        nombreInicial="Cliente Original"
        duplicando={false}
        onConfirm={onConfirm2}
        onCancel={() => {}}
      />,
    );
    fireEvent.change(screen.getByPlaceholderText("Nombre del cliente"), { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "Duplicar" }));
    expect(onConfirm2).toHaveBeenCalledWith("Cliente Original");
  });

  it("Cancelar cancela sin duplicar; mientras duplica, todo queda deshabilitado", () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    const { unmount } = render(
      <DuplicarPedidoModal
        orderNumber="PED-100"
        nombreInicial="C"
        duplicando={false}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onCancel).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
    unmount();

    render(
      <DuplicarPedidoModal
        orderNumber="PED-100"
        nombreInicial="C"
        duplicando={true}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    const btn = screen.getByRole("button", { name: "Duplicando..." }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    fireEvent.click(btn);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("el aviso del cliente Switch solo sale cuando el padre lo pide (detalle sí, lista no)", () => {
    const { unmount } = render(
      <DuplicarPedidoModal
        orderNumber="PED-100"
        nombreInicial="C"
        duplicando={false}
        avisoClienteSwitch
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(screen.queryByText(/cliente de Switch se vuelve a elegir/)).toBeTruthy();
    unmount();
    render(
      <DuplicarPedidoModal
        orderNumber="PED-100"
        nombreInicial="C"
        duplicando={false}
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(screen.queryByText(/cliente de Switch se vuelve a elegir/)).toBeNull();
  });
});

// ── AgregarProductosModal ─────────────────────────────────────────────────────

const PRODUCTOS: ProductoAgregable[] = [
  { id: "p1", sku: "RBK-001", name: "Classic Leather", price: 20, image_url: null, category: "footwear" },
  { id: "p2", sku: "RBK-002", name: "Tee Logo", price: 8, image_url: null, category: "apparel" },
];

function stubProductos(productos: unknown = PRODUCTOS) {
  const fetchMock = vi.fn(async () => ({ ok: true, json: async () => productos }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("AgregarProductosModal", () => {
  beforeEach(() => vi.clearAllMocks());

  it("carga los productos ACTIVOS de la marca y los busca por nombre o código", async () => {
    const fetchMock = stubProductos();
    render(
      <AgregarProductosModal
        theme={getMarcaTheme("reebok")!}
        enPedido={new Map()}
        onAgregar={async () => true}
        onClose={() => {}}
      />,
    );
    // Lee el catálogo interno de la marca, solo lo vendible.
    expect(String(fetchMock.mock.calls[0][0])).toBe("/api/catalogo/reebok/products?active=true");
    await waitFor(() => expect(screen.getByText("Classic Leather")).toBeTruthy());
    expect(screen.getByText("Tee Logo")).toBeTruthy();

    // Búsqueda por código (case-insensitive) deja solo el que corresponde.
    fireEvent.change(screen.getByPlaceholderText("Buscar por nombre o código..."), {
      target: { value: "rbk-002" },
    });
    expect(screen.queryByText("Classic Leather")).toBeNull();
    expect(screen.getByText("Tee Logo")).toBeTruthy();

    // Sin coincidencias lo dice en simple.
    fireEvent.change(screen.getByPlaceholderText("Buscar por nombre o código..."), {
      target: { value: "zzz" },
    });
    expect(screen.getByText("No encontramos productos con ese nombre o código.")).toBeTruthy();
  });

  it("tocar Agregar entrega el producto al padre (que hace el PATCH /item)", async () => {
    stubProductos();
    const onAgregar = vi.fn(async () => true);
    render(
      <AgregarProductosModal
        theme={getMarcaTheme("reebok")!}
        enPedido={new Map()}
        onAgregar={onAgregar}
        onClose={() => {}}
      />,
    );
    await waitFor(() => expect(screen.getByText("Classic Leather")).toBeTruthy());
    fireEvent.click(screen.getAllByRole("button", { name: "Agregar" })[0]);
    await waitFor(() => expect(onAgregar).toHaveBeenCalledTimes(1));
    expect((onAgregar.mock.calls[0] as unknown[])[0]).toMatchObject({ id: "p1", sku: "RBK-001" });
  });

  it("un producto que YA está en el pedido dice cuántos bultos lleva y ofrece +1", async () => {
    stubProductos();
    render(
      <AgregarProductosModal
        theme={getMarcaTheme("reebok")!}
        enPedido={new Map([["p1", 3]])}
        onAgregar={async () => true}
        onClose={() => {}}
      />,
    );
    await waitFor(() => expect(screen.getByText("Classic Leather")).toBeTruthy());
    expect(screen.getByText(/en el pedido: 3/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "+1 bulto" })).toBeTruthy();
  });

  it("si el catálogo no carga lo dice, no deja la lista en blanco", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, json: async () => ({}) })));
    render(
      <AgregarProductosModal
        theme={getMarcaTheme("reebok")!}
        enPedido={new Map()}
        onAgregar={async () => true}
        onClose={() => {}}
      />,
    );
    await waitFor(() =>
      expect(screen.getByText("No se pudo cargar el catálogo. Cierra y vuelve a intentar.")).toBeTruthy(),
    );
  });
});

// ── Candados estáticos sobre el detalle del pedido ────────────────────────────

const SRC = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8");

describe("candados estáticos", () => {
  it("el draftIdKey muerto no vuelve (nadie lo leía: solo se escribía)", () => {
    expect(SRC("src/components/catalogo/PedidoDetalleClient.tsx")).not.toContain("draftIdKey");
    expect(SRC("src/lib/catalogo/marcas-ui.tsx")).not.toContain("draftIdKey");
  });

  it("'+ Agregar productos' abre el buscador inline y agrega vía PATCH /item (no navega al catálogo)", () => {
    const src = SRC("src/components/catalogo/PedidoDetalleClient.tsx");
    expect(src).toContain("AgregarProductosModal");
    expect(src).toContain("setShowAgregarModal(true)");
    expect(src).toContain("/item");
    // El header ya no puede tener el Link viejo al catálogo para agregar.
    expect(src).not.toMatch(/Link href=\{theme\.catalogoHref\}[^>]*>\s*\+ Agregar productos/);
  });

  it("los dos caminos de Duplicar pasan por el mini-modal con el nombre editable", () => {
    expect(SRC("src/components/catalogo/PedidosListClient.tsx")).toContain("DuplicarPedidoModal");
    expect(SRC("src/components/catalogo/PedidoDetalleClient.tsx")).toContain("DuplicarPedidoModal");
    // El POST de "Duplicar y corregir" manda el nombre elegido en el body.
    expect(SRC("src/components/catalogo/PedidoDetalleClient.tsx")).toMatch(
      /orders\/\$\{id\}\/duplicar[\s\S]{0,200}client_name/,
    );
  });
});

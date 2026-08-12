// Duplicar con cliente editable + agregar artículos a un pedido existente
// (pedido de Daniel, 12-ago-2026). Se renderizan los modales REALES:
//
//  · DuplicarPedidoModal — mini-modal con el nombre pre-llenado y editable
//    ("¿Para quién es el pedido nuevo?") y el SELECTOR DE CLIENTE DE SWITCH,
//    que es OBLIGATORIO: sin elegir no se puede duplicar (Daniel, 12-ago-2026:
//    *"un vendedor TIENE que elegir un cliente de switch, todos siempre"*).
//    Lo usan el Duplicar de la lista y "Duplicar y corregir" del pedido
//    bloqueado por Switch.
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

const CLIENTES = [
  { cliente_switch_id: 42, codigo: "D-42", nombre: "Sporting Shoes" },
  { cliente_switch_id: 77, codigo: "D-77", nombre: "City Mall David" },
];

/** Directorio de clientes de la marca (lo que devuelve clientes-switch). */
function stubClientes(clientes: unknown = CLIENTES) {
  const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ clientes }) }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderDup(props: Partial<React.ComponentProps<typeof DuplicarPedidoModal>> = {}) {
  return render(
    <DuplicarPedidoModal
      orderNumber="PED-100"
      nombreInicial="Cliente Original"
      api="/api/catalogo/reebok"
      directorioLabel="Active Shoes"
      duplicando={false}
      onConfirm={() => {}}
      onCancel={() => {}}
      {...props}
    />,
  );
}

describe("DuplicarPedidoModal", () => {
  beforeEach(() => vi.clearAllMocks());

  it("pre-llena el nombre del original y pregunta para quién es el pedido nuevo", () => {
    stubClientes();
    renderDup();
    expect(screen.getByText("Duplicar pedido PED-100")).toBeTruthy();
    expect(screen.getByText("¿Para quién es el pedido nuevo?")).toBeTruthy();
    expect((screen.getByPlaceholderText("Nombre del cliente") as HTMLInputElement).value).toBe(
      "Cliente Original",
    );
  });

  it("🔴 NO se puede duplicar sin elegir cliente de Switch — ni siquiera con el nombre puesto", () => {
    stubClientes();
    const onConfirm = vi.fn();
    renderDup({ onConfirm });
    const btn = screen.getByRole("button", { name: "Elige el cliente" }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    fireEvent.click(btn);
    expect(onConfirm).not.toHaveBeenCalled();
    // Escribir el nombre libre no habilita nada: el cliente es OTRA cosa.
    fireEvent.change(screen.getByPlaceholderText("Nombre del cliente"), { target: { value: "Quien sea" } });
    expect((screen.getByRole("button", { name: "Elige el cliente" }) as HTMLButtonElement).disabled).toBe(true);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("Contado es una OPCIÓN de un toque, no un default silencioso", async () => {
    stubClientes();
    const onConfirm = vi.fn();
    renderDup({ onConfirm });
    fireEvent.click(screen.getByRole("button", { name: "Contado (mostrador)" }));
    fireEvent.click(await screen.findByRole("button", { name: "Duplicar" }));
    expect(onConfirm).toHaveBeenCalledWith("Cliente Original", { id: null, nombre: "Contado (mostrador)", codigo: null });
  });

  it("elegir un cliente del directorio rellena el nombre y lo entrega junto al id", async () => {
    stubClientes();
    const onConfirm = vi.fn();
    renderDup({ onConfirm });
    fireEvent.click(await screen.findByText("Sporting Shoes"));
    expect((screen.getByPlaceholderText("Nombre del cliente") as HTMLInputElement).value).toBe("Sporting Shoes");
    fireEvent.click(screen.getByRole("button", { name: "Duplicar" }));
    expect(onConfirm).toHaveBeenCalledWith("Sporting Shoes", { id: 42, nombre: "Sporting Shoes", codigo: "D-42" });
  });

  it("editar el nombre después de elegir cliente entrega el nombre NUEVO con el MISMO cliente", async () => {
    stubClientes();
    const onConfirm = vi.fn();
    renderDup({ onConfirm });
    fireEvent.click(await screen.findByText("Sporting Shoes"));
    fireEvent.change(screen.getByPlaceholderText("Nombre del cliente"), {
      target: { value: "  Sporting Shoes N4  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Duplicar" }));
    expect(onConfirm).toHaveBeenCalledWith("Sporting Shoes N4", { id: 42, nombre: "Sporting Shoes", codigo: "D-42" });
  });

  it("nombre vacío cae al original (el cliente elegido no se pierde)", async () => {
    stubClientes();
    const onConfirm = vi.fn();
    renderDup({ onConfirm });
    fireEvent.click(screen.getByRole("button", { name: "Contado (mostrador)" }));
    fireEvent.change(screen.getByPlaceholderText("Nombre del cliente"), { target: { value: "   " } });
    fireEvent.click(await screen.findByRole("button", { name: "Duplicar" }));
    expect(onConfirm).toHaveBeenCalledWith("Cliente Original", { id: null, nombre: "Contado (mostrador)", codigo: null });
  });

  it("Cancelar cancela sin duplicar; mientras duplica, todo queda deshabilitado", () => {
    stubClientes();
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    const { unmount } = renderDup({ onConfirm, onCancel });
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onCancel).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
    unmount();

    renderDup({ duplicando: true, onConfirm, onCancel });
    const btn = screen.getByRole("button", { name: "Duplicando..." }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    fireEvent.click(btn);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("busca en el directorio de LA MARCA (no en uno global)", async () => {
    const fetchMock = stubClientes();
    renderDup({ api: "/api/catalogo/calvin", directorioLabel: "Vistana International" });
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(String(fetchMock.mock.calls[0][0])).toBe("/api/catalogo/calvin/clientes-switch?q=");
  });

  it("si el directorio no carga lo dice y NO deja elegir un cliente que no vio", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, json: async () => ({}) })));
    renderDup();
    await waitFor(() =>
      expect(screen.getByText(/No se pudo cargar el directorio de clientes/)).toBeTruthy(),
    );
    // Contado sigue disponible: es la única opción que no depende del directorio.
    expect(screen.getByRole("button", { name: "Contado (mostrador)" })).toBeTruthy();
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

  it("los DOS caminos mandan el cliente de Switch elegido al servidor", () => {
    // Lista → POST /orders ; detalle → POST /duplicar. Si alguno dejara de
    // mandarlo, el pedido nacería en Contado aunque la pantalla mostrara otro.
    expect(SRC("src/components/catalogo/PedidosListClient.tsx")).toMatch(
      /\$\{theme\.api\}\/orders[\s\S]{0,400}cliente_switch_id/,
    );
    expect(SRC("src/components/catalogo/PedidoDetalleClient.tsx")).toMatch(
      /orders\/\$\{id\}\/duplicar[\s\S]{0,300}cliente_switch_id/,
    );
  });

  it("el botón 'Guardar' y el letrero 'Guardado a las …' se fueron, pero el AUTOGUARDADO sigue vivo", () => {
    const src = SRC("src/components/catalogo/PedidoDetalleClient.tsx");
    // Se fue lo que pedía atención…
    expect(src).not.toContain("Guardado a las");
    expect(src).not.toContain("Cambios sin guardar");
    expect(src).not.toContain("fmtTimeHMS");
    // …y quedó el Reintentar, que solo sale cuando el guardado FALLA.
    expect(src).toContain("Reintentar");
    // 🔴 EL MECANISMO NO SE TOCA: "+ Agregar productos" escribe directo en el
    // servidor y sin autoguardado el resto quedaría solo en memoria.
    expect(src).toContain("setTimeout(() => { performSave(); }, 2000)");
    expect(src).toMatch(/autoSaveTimer\.current = setTimeout/);
  });

  it("UN botón encadena confirmar + enviar, y el correo interno es opcional", () => {
    const src = SRC("src/components/catalogo/PedidoDetalleClient.tsx");
    expect(src).toContain("Confirmar y enviar a Switch");
    // El encadenado vive en el FRONT: PUT status confirmado → preview.
    expect(src).toMatch(/status: "confirmado"[\s\S]{0,900}await previewSwitch\(\)/);
    // send-order YA NO cuelga de confirmar: es su propio botón.
    expect(src).toContain("Avisar por correo a Fashion Group");
    expect(src).toMatch(/async function avisarPorCorreo\(\)/);
    expect(src).not.toMatch(/async function confirmOrder\(\)/);
    // El POST real a Switch sigue detrás del modal de revisión de siempre.
    expect(src).toContain("Crear pedido en Switch");
  });

  it("el selector de cliente del detalle ya no está gated a admin/secretaria", () => {
    const src = SRC("src/components/catalogo/PedidoDetalleClient.tsx");
    // El bloque se muestra a todo rol editor (vendedor incluido) y ya no vive
    // dentro de la rama `canDelete` del pedido confirmado.
    expect(src).toMatch(/puedeCambiarCliente = isEditorRole/);
    expect(src).not.toMatch(/canDelete && \(\s*<div className="pt-3 border-t border-gray-100">/);
  });
});

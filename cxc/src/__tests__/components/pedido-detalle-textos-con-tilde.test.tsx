/**
 * ─────────────────────────────────────────────────────────────────────────────
 * LOS AVISOS DEL PEDIDO SE ESCRIBEN BIEN — Y EL PDF QUE SALE AL CLIENTE TAMBIÉN
 * (23-ago-2026)
 *
 * El detalle del pedido tenía ~20 avisos sin tilde ("Revisa tu conexion",
 * "Pedido en modo edicion", "Ingresa un email valido", "Switch no respondio").
 * El peor de todos no se ve en pantalla: el PDF que se le manda al cliente se
 * llamaba **"Cotizacion-TOM-014-2026-08-23.pdf"**. Ese archivo sale del sistema
 * y llega por WhatsApp o correo a alguien de AFUERA, que lo lee antes de
 * abrirlo.
 *
 * 🔴 CANDADO DE CONDUCTA: se renderiza la pantalla REAL, se tocan los botones y
 * se lee el nombre del archivo con el que se llamó al generador de PDF y el
 * texto que el aviso pintó. Un barrido de texto sobre el archivo se cumpliría
 * con el comentario de arriba.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, act, waitFor } from "@testing-library/react";
import PedidoDetalleClient from "@/components/catalogo/PedidoDetalleClient";

const OID = "44444444-4444-4444-8444-444444444444";
// 🩸 Objetos ESTABLES. Devolver uno nuevo en cada llamada hace que `router` y
// `params` cambien de identidad en cada render: los `useCallback` que los
// llevan en sus dependencias se rehacen, el efecto de carga vuelve a correr y
// la pantalla entra en bucle — el test se queda en blanco y muere por tiempo
// sin decir por qué.
const ROUTER = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() };
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

// El generador de PDF se intercepta para leer el nombre de archivo REAL.
const PDF = vi.fn(async () => {});
vi.mock("@/lib/catalogo/order-pdf-client", () => ({
  downloadCatalogoOrderPdf: (...a: unknown[]) => PDF(...(a as [])),
}));

const ITEM = {
  id: "i1", product_id: "p1", sku: "TH-1", name: "Sandalia", image_url: "",
  quantity: 2, unit_price: 20, category: "footwear", bulto_pzas: 12, precio_lista: 20,
};

function stub(status = "confirmado") {
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const method = (init?.method || "GET").toUpperCase();
    const j = (b: unknown) => ({ ok: true, status: 200, json: async () => b });
    if (url.includes("/enviar-switch")) return j(method === "GET" ? { envio: null } : { ok: true });
    if (url.includes("/clientes-switch")) {
      if (url.includes("orderId=")) return j({ clienteSwitchId: 42, nombre: "Sporting Shoes", codigo: "D-42" });
      return j({ clientes: [{ cliente_switch_id: 42, codigo: "D-42", nombre: "Sporting Shoes" }], contado: null });
    }
    if (url.includes("/vendedores-switch")) return j({ vendedorSwitchId: 7, nombre: "Rey", esFallback: false });
    if (url.includes("/permiso-precio")) return j({ permiso: true, verificado: true, mensaje: null });
    if (url.includes("/clientes-search")) return j([]);
    if (url.includes(`/orders/${OID}`) && method === "PUT") return j({ ok: true });
    if (url.includes(`/orders/${OID}`)) {
      return j({
        id: OID, order_number: "TOM-014", client_name: "Sporting Shoes",
        comment: "", status, total: 480, created_at: "2026-08-01T12:00:00Z",
        origen_short_id: null, tommy_order_items: [ITEM],
      });
    }
    return j({});
  }));
  sessionStorage.setItem("cxc_role", "vendedor");
}

async function pintar(status = "confirmado") {
  stub(status);
  await act(async () => { render(<PedidoDetalleClient marca="tommy" />); });
  await screen.findByText("TOM-014");
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

describe("🔴 el PDF que recibe el cliente se llama Cotización, con tilde", () => {
  it("un borrador sale como «Cotización-…»", async () => {
    await pintar("borrador");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /PDF/ })); });
    await waitFor(() => expect(PDF).toHaveBeenCalled());
    const { filename } = PDF.mock.calls[0][0] as { filename: string };
    expect(filename).toMatch(/^Cotización-TOM-014-/);
    expect(filename).not.toContain("Cotizacion");
  });

  it("un pedido ya confirmado sigue saliendo como «Pedido-…»", async () => {
    await pintar("confirmado");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /PDF/ })); });
    await waitFor(() => expect(PDF).toHaveBeenCalled());
    const { filename } = PDF.mock.calls[0][0] as { filename: string };
    expect(filename).toMatch(/^Pedido-TOM-014-/);
  });
});

describe("🔴 los avisos se escriben con tilde", () => {
  it("«Ingresa un email válido» al mandar un correo mal escrito", async () => {
    await pintar("confirmado");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Enviar por email al cliente/i })); });
    const campo = await screen.findByPlaceholderText("cliente@email.com");
    fireEvent.change(campo, { target: { value: "sin-arroba" } });
    await act(async () => {
      fireEvent.click(screen.getAllByRole("button", { name: /^Enviar$/i })[0]);
    });
    const aviso = await screen.findByText(/Ingresa un email/);
    expect(aviso.textContent).toContain("válido");
    expect(aviso.textContent).not.toContain("valido");
  });
});

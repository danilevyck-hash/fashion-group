// El autoguardado del pedido corre SOLO cuando el usuario cambia algo
// (16-nov-2026). Hasta hoy, los renglones y el cliente que llegaban del
// servidor al abrir el pedido contaban como «cambio», y a los 2 s el detalle
// reescribía el pedido solo: el servidor borraba y volvía a insertar los
// renglones, recalculaba el total con las reglas de hoy y el pedido confirmado
// quedaba con «Editado después de confirmar» sin que nadie tocara nada. Igual
// con un pedido recién duplicado (abre su detalle y pasa lo mismo).
//
// `PedidoDetalleClient` es UNO para las cuatro marcas (`marca` elige el tema):
// la prueba corre con Tommy y vale para Reebok, Joybees y Calvin.

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, act } from "@testing-library/react";
import PedidoDetalleClient from "@/components/catalogo/PedidoDetalleClient";

// Un solo objeto: `load` depende de `router`, y uno nuevo por render volvería
// a cargar el pedido en cada pintado.
const ROUTER = { push: vi.fn(), replace: vi.fn() };
const PARAMS = { id: "44444444-4444-4444-8444-444444444444" };
vi.mock("next/navigation", () => ({
  usePathname: () => "/catalogo/tommy/pedido/x",
  useRouter: () => ROUTER,
  useSearchParams: () => new URLSearchParams(),
  useParams: () => PARAMS,
}));

vi.mock("@/lib/hooks/useSidebarCollapsed", () => ({
  useSidebarCollapsed: () => false,
  readSidebarCollapsed: () => false,
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

const OID = PARAMS.id;
const ITEM = {
  id: "i1", product_id: "p1", sku: "TH-1", name: "Sandalia", image_url: "",
  quantity: 2, unit_price: 20, category: "footwear", bulto_pzas: 12, precio_lista: 20,
};

function stubDetalle() {
  const puts: string[] = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = (init?.method || "GET").toUpperCase();
    const j = (b: unknown) => ({ ok: true, status: 200, json: async () => b });
    if (url.includes(`/orders/${OID}`) && method === "PUT") { puts.push(String(init?.body ?? "")); return j({ ok: true }); }
    if (url.includes("/enviar-switch")) return j({ envio: null });
    if (url.includes("/clientes-switch")) return j({ clienteSwitchId: 42, nombre: "Sporting Shoes", codigo: "D-42" });
    if (url.includes("/vendedores-switch")) return j({ vendedorSwitchId: 7, nombre: "Rey", esFallback: false });
    if (url.includes("/permiso-precio")) return j({ permiso: true, verificado: true, mensaje: null });
    if (url.includes("/clientes-search")) return j([]);
    if (url.includes(`/orders/${OID}`)) {
      return j({
        id: OID, order_number: "PED-004", client_name: "Sporting Shoes", comment: "",
        status: "confirmado", total: 480, created_at: "2026-08-01T12:00:00Z",
        tommy_order_items: [ITEM],
      });
    }
    return j({});
  });
  vi.stubGlobal("fetch", fetchMock);
  sessionStorage.setItem("cxc_role", "vendedor");
  return puts;
}

const esperar = (ms: number) => act(() => new Promise<void>((r) => setTimeout(r, ms)));

describe("el autoguardado del pedido corre solo cuando el usuario edita", () => {
  it("cargar el pedido y esperar más de 2 s NO guarda nada; cambiar una cantidad SÍ", async () => {
    const puts = stubDetalle();
    await act(async () => { render(<PedidoDetalleClient marca="tommy" />); });
    await screen.findByText("PED-004");

    // Más que el debounce de 2 s, sin tocar nada.
    await esperar(2600);
    expect(puts, "cargar los datos del servidor no es una edición").toEqual([]);

    // Ahora sí: el usuario cambia la cantidad del renglón.
    const cantidad = screen.getAllByDisplayValue("2").find((el) => (el as HTMLInputElement).type === "number") as HTMLInputElement;
    expect(cantidad).toBeTruthy();
    await act(async () => { fireEvent.change(cantidad, { target: { value: "3" } }); });

    await waitFor(() => expect(puts.length).toBe(1), { timeout: 5000 });
    expect(JSON.parse(puts[0]).items[0].quantity).toBe(3);
  });
});

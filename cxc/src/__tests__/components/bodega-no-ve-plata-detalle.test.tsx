// ─────────────────────────────────────────────────────────────────────────────
// 🔴 BODEGA NO VE PLATA — EL DETALLE DEL PEDIDO (7-oct-2026)
//
// Daniel, textual: *"que ningún usuario con rol bodega vea precio, solo admin
// y secretaria"*. Caso concreto: en Catálogos › marca › Pedidos, bodega veía
// precio unitario y subtotal al abrir el detalle de un pedido.
//
// El servidor ya manda `unit_price`/`precio_lista`/`total` en null a bodega
// (candado `api/bodega-ve-pedidos.test.ts`); este archivo MONTA la pantalla
// real (`PedidoDetalleClient`) con ese feed —tal cual lo manda el servidor— y
// comprueba que NINGÚN monto se dibuja, ni la columna «Precio»/«Subtotal», ni
// el total de abajo. Y que a admin/secretaria/vendedor no se les quitó nada.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, act } from "@testing-library/react";
import PedidoDetalleClient from "@/components/catalogo/PedidoDetalleClient";

vi.mock("@/lib/catalogo/catalogos-2026-10-b", async (original) => {
  const real = await original<typeof import("@/lib/catalogo/catalogos-2026-10-b")>();
  return {
    ...real,
    CATALOGOS_APPLE_2026_10_B: {
      buscadorEnUnaFila: false, catalogoPublico: false, revisarPedido: false,
      subpaginasInternas: false, administrar: false, tituloCelularChico: false,
    },
  };
});

const OID = "66666666-6666-4666-8666-666666666666";
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
vi.mock("@/lib/catalogo/order-pdf-client", () => ({
  downloadCatalogoOrderPdf: vi.fn(async () => {}),
}));

/** El pedido tal como el servidor lo manda a CADA rol: `verPrecio` decide si
 *  `unit_price`/`precio_lista`/`total` viajan en número o en null — la MISMA
 *  forma que `orders/[id]/route.ts` produce de verdad. */
function pedidoDelServidor(verPrecio: boolean) {
  return {
    id: OID, order_number: "TOM-027", client_name: "Sporting Shoes",
    client_email: null, comment: "", status: "confirmado",
    total: verPrecio ? 480 : null,
    created_at: "2026-08-25T12:00:00Z",
    origen_short_id: null,
    tommy_order_items: [{
      id: "i1", product_id: "p1", sku: "TH-1", name: "Sandalia", image_url: "",
      quantity: 2, unit_price: verPrecio ? 20 : null, category: "footwear",
      bulto_pzas: 12, precio_lista: verPrecio ? 20 : null,
    }],
  };
}

async function pintar(role: string, verPrecio: boolean) {
  sessionStorage.setItem("cxc_role", role);
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const method = (init?.method || "GET").toUpperCase();
    const j = (b: unknown) => ({ ok: true, status: 200, json: async () => b });
    if (url.includes("/permiso-precio")) return j({ permiso: true, verificado: true, mensaje: null });
    if (url.includes(`/orders/${OID}`) && method === "GET") return j(pedidoDelServidor(verPrecio));
    return j({});
  }));
  const r = await act(async () => render(<PedidoDetalleClient marca="tommy" />));
  await screen.findByText("TOM-027");
  return r;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

describe("🔴 bodega: ningún monto se dibuja", () => {
  it("sin «Precio» ni «Subtotal» en el encabezado de la tabla", async () => {
    await pintar("bodega", false);
    expect(screen.queryByText("Precio")).toBeNull();
    expect(screen.queryByText("Subtotal")).toBeNull();
  });

  it("sin «$20» (precio unitario) ni «480.00» (subtotal: 2×12×20) en la fila", async () => {
    await pintar("bodega", false);
    expect(screen.queryByText("$20")).toBeNull();
    expect(screen.queryByDisplayValue("20")).toBeNull();
    expect(screen.queryByText(/480\.00/)).toBeNull();
  });

  it("sin el total de abajo", async () => {
    await pintar("bodega", false);
    // El bloque de totales sigue diciendo bultos y unidades, sin plata.
    expect(screen.getByText(/bultos/)).toBeTruthy();
    expect(screen.queryByText(/480\.00/)).toBeNull();
  });
});

describe("admin, secretaria y vendedor: no se les quitó nada", () => {
  for (const role of ["admin", "secretaria", "vendedor"]) {
    it(`${role}: sigue viendo «Precio», «Subtotal» y los montos`, async () => {
      await pintar(role, true);
      expect(screen.getByText("Precio")).toBeTruthy();
      expect(screen.getByText("Subtotal")).toBeTruthy();
      // El precio unitario se edita (casilla con el valor puesto); el
      // subtotal (2 × 12 piezas/bulto × $20 = $480) es texto fijo.
      expect(screen.getByDisplayValue("20")).toBeTruthy();
      expect(screen.getAllByText(/480\.00/).length).toBeGreaterThan(0);
    });
  }
});

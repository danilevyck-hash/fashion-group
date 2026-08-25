// ─────────────────────────────────────────────────────────────────────────────
// CONDUCTA — EL PDF QUE BAJA EL DETALLE DICE CUÁL DE LAS DOS FUE (25-ago-2026)
//
// La pantalla REAL, con el botón «Descargar PDF» tocado de verdad. Lo que se
// mira es lo que se le pide al generador: la palabra del encabezado
// (`documentoLabel`) y el nombre del archivo, que es lo PRIMERO que ve el
// cliente en WhatsApp antes de abrirlo.
//
// 🩸 EL BUG EXACTO DE TOM-027: mandar a Switch escribe `status = confirmado`,
// así que la regla vieja —`status === "confirmado" ? "Pedido" : "Cotización"`—
// bajaba «Pedido-TOM-027.pdf» para una COTIZACIÓN. El status solo NO alcanza.
//
// 🔴 Nada sale a Switch: `fetch` está stubbeado y se cuentan los POST.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, act } from "@testing-library/react";
import PedidoDetalleClient from "@/components/catalogo/PedidoDetalleClient";

const OID = "33333333-3333-4333-8333-333333333333";
const NUMERO = "TOM-027";

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

/** Lo que el detalle le pide al generador del PDF. */
const pdfCalls: Array<Record<string, unknown>> = [];
vi.mock("@/lib/catalogo/order-pdf-client", () => ({
  downloadCatalogoOrderPdf: vi.fn(async (opts: Record<string, unknown>) => { pdfCalls.push(opts); }),
}));

const ITEM = {
  id: "i1", product_id: "p1", sku: "SKU-1", name: "Zapato", image_url: "",
  quantity: 2, unit_price: 16.5, category: "footwear", bulto_pzas: 12, precio_lista: 16.5,
};

function stubApi(opts: { status: string; envio: Record<string, unknown> | null }) {
  const posts: string[] = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = (init?.method || "GET").toUpperCase();
    if (method === "POST") posts.push(url);
    const j = (b: unknown) => ({ ok: true, status: 200, json: async () => b });
    if (url.includes("/enviar-switch")) return j({ envio: opts.envio });
    if (url.includes("/permiso-precio")) return j({ permiso: true, verificado: true, mensaje: null });
    if (url.includes("/clientes-switch")) return j({ clienteSwitchId: 42, nombre: "Sporting Shoes", codigo: "D-42" });
    if (url.includes("/clientes-search")) return j([]);
    if (url.includes(`/orders/${OID}`)) {
      return j({
        id: OID, order_number: NUMERO, client_name: "Sporting Shoes", comment: "",
        status: opts.status, total: 396, created_at: "2026-08-12T12:00:00Z",
        reebok_order_items: [ITEM],
      });
    }
    return j({});
  });
  vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);
  return posts;
}

beforeEach(() => {
  vi.clearAllMocks();
  pdfCalls.length = 0;
  sessionStorage.clear();
  sessionStorage.setItem("cxc_role", "admin");
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

async function bajarPdf() {
  const btn = await screen.findByText("Descargar PDF");
  await act(async () => { fireEvent.click(btn); });
  await waitFor(() => expect(pdfCalls.length).toBe(1));
  return pdfCalls[0];
}

describe("🔴 el papel que baja el detalle", () => {
  // 🩸 MEDIDO Y SE DICE DE FRENTE: bajo el candado post-envío el detalle NO
  // dibuja el bloque "Compartir pedido" (`switchLock ? null : …`, conducta de
  // siempre), así que «Descargar PDF» SOLO existe cuando el pedido todavía NO
  // salió a Switch. O sea que por este botón nunca se llega a la rama de la
  // cotización de Switch — hoy el papel de una cotización sale por el "Ver PDF"
  // de la confirmación, que es una RUTA y está cubierta en
  // `api/pdf-pedido-o-cotizacion.test.ts` (20 casos, las 4 marcas).
  // La regla igual es UNA sola (`palabraDelPapel`) y hay candado de fuente en
  // `lib/documento-switch.test.ts` para que este archivo no vuelva a decidir
  // por su cuenta. Lo que SÍ se mide acá es lo reachable, que es el #584.

  it("sin salir a Switch, la regla de siempre: borrador = Cotización", async () => {
    // #584 intacto: el borrador es la cotización que se le pasa al cliente.
    const posts = stubApi({ status: "borrador", envio: null });
    render(<PedidoDetalleClient marca="reebok" />);
    const o = await bajarPdf();
    expect(o.documentoLabel).toBe("Cotización");
    expect(o.filename).toMatch(new RegExp(`^Cotización-${NUMERO}-\\d{4}-\\d{2}-\\d{2}\\.pdf$`));
    // 🔴 El número no cambia.
    expect(o.orderNumber).toBe(NUMERO);
    expect(posts).toEqual([]);
  });

  it("sin salir a Switch, confirmado = Pedido", async () => {
    stubApi({ status: "confirmado", envio: null });
    render(<PedidoDetalleClient marca="reebok" />);
    const o = await bajarPdf();
    expect(o.documentoLabel).toBe("Pedido");
    expect(o.filename).toMatch(new RegExp(`^Pedido-${NUMERO}-`));
  });

  it("un intento FALLIDO no es 'está en Switch' — sigue mandando el status", async () => {
    // 'error' libera el candado y no cuenta como envío activo: el papel se
    // llama como lo que es acá, no como algo que no llegó a existir allá.
    stubApi({ status: "borrador", envio: { estado: "error", numero_interno: null, pedido_switch_id: null, error_detalle: "0319" } });
    render(<PedidoDetalleClient marca="reebok" />);
    const o = await bajarPdf();
    expect(o.documentoLabel).toBe("Cotización");
  });

  it("🔴 el nombre del archivo y el encabezado NUNCA se separan", async () => {
    for (const caso of [
      { status: "borrador", envio: null },
      { status: "confirmado", envio: null },
    ]) {
      cleanup(); pdfCalls.length = 0;
      stubApi(caso as { status: string; envio: Record<string, unknown> | null });
      render(<PedidoDetalleClient marca="reebok" />);
      const o = await bajarPdf();
      expect(String(o.filename)).toMatch(new RegExp(`^${o.documentoLabel}-`));
    }
  });
});

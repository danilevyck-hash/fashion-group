// ─────────────────────────────────────────────────────────────────────────────
// CONDUCTA — LA CONFIRMACIÓN DICE CUÁL DE LAS DOS FUE (25-ago-2026)
//
// La pantalla REAL, montada y leída. Daniel mandó TOM-027 como COTIZACIÓN,
// Switch la aceptó (15-000000123), y el título grande decía «Pedido TOM-027
// guardado» — recién abajo, en chico, aparecía «Cotización enviada a Switch».
// El título mentía, y es lo primero que se lee.
//
// Y se fue el párrafo: Daniel, textual, *"no siempre tiene que haber
// explicación, eso ensucia mi ERP"*. La frase de los 500 pares NO se dibuja.
//
// 🔴 NADA sale a Switch: `fetch` está stubbeado y se cuentan los POST.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import ConfirmacionClient from "@/components/catalogo/ConfirmacionClient";

const OID = "33333333-3333-4333-8333-333333333333";
const NUMERO = "TOM-027";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => `/catalogo/tommy/confirmacion/${OID}`,
  useSearchParams: () => new URLSearchParams(),
}));

const ORDER = { id: OID, order_number: NUMERO, client_name: "COMERCIAL EL MACHETAZO, S.A.", total: 1234.5 };

/** Stub de `fetch`: devuelve el pedido y el envío pedido. Cuenta los POST. */
function stubApi(envio: Record<string, unknown> | null) {
  const posts: string[] = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = (init?.method || "GET").toUpperCase();
    if (method !== "GET") posts.push(url);
    const j = (b: unknown) => ({ ok: true, status: 200, json: async () => b });
    if (url.includes("/enviar-switch")) return j({ envio });
    return j(ORDER);
  });
  vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);
  return posts;
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const MARCAS = ["reebok", "joybees", "tommy", "calvin"] as const;

describe("🔴 el título nombra lo que hay en Switch — las 4 marcas", () => {
  for (const marca of MARCAS) {
    it(`${marca}: una COTIZACIÓN aceptada NO se titula «Pedido»`, async () => {
      const posts = stubApi({ estado: "verificado", numero_interno: "15-000000123", pedido_switch_id: 7, error_detalle: null, documento: "cotizacion" });
      render(<ConfirmacionClient marca={marca} orderId={OID} />);

      const titulo = await screen.findByRole("heading", { level: 1 });
      expect(titulo.textContent).toBe(`Cotización ${NUMERO} guardado`);
      // 🔴 El identificador NO cambió: TOM-027 sigue siendo TOM-027.
      expect(titulo.textContent).toContain(NUMERO);
      expect(titulo.textContent).not.toMatch(/^Pedido /);
      // Y el renglón de abajo ya no contradice al de arriba.
      expect(await screen.findByText(/Cotización enviada a Switch/)).toBeTruthy();
      // Abrir la pantalla no manda NADA.
      expect(posts).toEqual([]);
    });

    it(`${marca}: un PEDIDO se sigue titulando «Pedido»`, async () => {
      stubApi({ estado: "verificado", numero_interno: "15-000000124", pedido_switch_id: 8, error_detalle: null, documento: "pedido" });
      render(<ConfirmacionClient marca={marca} orderId={OID} />);
      const titulo = await screen.findByRole("heading", { level: 1 });
      expect(titulo.textContent).toBe(`Pedido ${NUMERO} guardado`);
    });

    it(`${marca}: si TODAVÍA NO salió a Switch no se le inventa etiqueta`, async () => {
      stubApi(null);
      render(<ConfirmacionClient marca={marca} orderId={OID} />);
      const titulo = await screen.findByRole("heading", { level: 1 });
      // Ni «Cotización» ni una tercera palabra: la de la casa, como siempre.
      expect(titulo.textContent).toBe(`Pedido ${NUMERO} guardado`);
      expect(await screen.findByText(/aún no se ha enviado a Switch/)).toBeTruthy();
    });

    it(`${marca}: con el DDL 20260824160000 pendiente el título dice «Pedido»`, async () => {
      stubApi({ estado: "verificado", numero_interno: "15-000000125", pedido_switch_id: 9, error_detalle: null });
      render(<ConfirmacionClient marca={marca} orderId={OID} />);
      const titulo = await screen.findByRole("heading", { level: 1 });
      expect(titulo.textContent).toBe(`Pedido ${NUMERO} guardado`);
    });
  }
});

describe("🔴 SE FUE EL PÁRRAFO — la pantalla no explica la diferencia", () => {
  it("después de una cotización NO aparece la frase de los 500 pares", async () => {
    stubApi({ estado: "verificado", numero_interno: "15-000000123", pedido_switch_id: 7, error_detalle: null, documento: "cotizacion" });
    const { container } = render(<ConfirmacionClient marca="tommy" orderId={OID} />);
    await screen.findByRole("heading", { level: 1 });
    await waitFor(() => expect(container.textContent).toContain("Cotización"));
    const texto = container.textContent || "";
    expect(texto).not.toMatch(/500 pares/);
    expect(texto).not.toMatch(/NO aparta la mercancía/);
    expect(texto).not.toMatch(/otros vendedores/);
    expect(texto).not.toMatch(/duplica el pedido/i);
  });

  it("el PDF que ofrece la pantalla es el de la ruta, no un texto inventado", async () => {
    stubApi({ estado: "verificado", numero_interno: "15-000000123", pedido_switch_id: 7, error_detalle: null, documento: "cotizacion" });
    render(<ConfirmacionClient marca="tommy" orderId={OID} />);
    const verPdf = await screen.findByText("Ver PDF");
    expect(verPdf.getAttribute("href")).toContain(`/orders/${OID}/pdf`);
  });
});

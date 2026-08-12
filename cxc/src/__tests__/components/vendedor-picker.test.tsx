// ─────────────────────────────────────────────────────────────────────────────
// EL SELECTOR DE VENDEDOR, RENDERIZADO (12-ago-2026).
//
// El riesgo de verdad no es la matemática (eso lo cubre el candado del
// servidor): es que el selector prometa algo que no cumple. Tres cosas que solo
// se ven renderizando:
//
//  1. El vendedor PUESTO viene marcado (`aria-pressed`) — si no, el default es
//     invisible y todo el mundo cree que tiene que elegir.
//  2. Tocar un vendedor AVISA al padre con el id y el nombre; buscar NO elige.
//  3. La lista se pide UNA sola vez, aunque se teclee — una llamada por tecla
//     sería un login contra Switch por tecla (sesión única por empresa).
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { readFileSync } from "fs";
import path from "path";
import VendedorSwitchPicker from "@/components/catalogo/VendedorSwitchPicker";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const VENDEDORES = [
  { id: 7, nombre: "Ana Pérez" },
  { id: 9, nombre: "Beto Ruiz" },
];

function stubLista(vendedores: unknown = VENDEDORES, ok = true) {
  const fetchMock = vi.fn(async () => ({ ok, json: async () => ({ vendedores }) }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderPicker(props: Partial<React.ComponentProps<typeof VendedorSwitchPicker>> = {}) {
  return render(
    <VendedorSwitchPicker
      empresa="vistana"
      directorioLabel="Vistana International"
      valor={{ id: 7, nombre: "Ana Pérez" }}
      onElegir={() => {}}
      {...props}
    />,
  );
}

const leer = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8");

describe("VendedorSwitchPicker", () => {
  beforeEach(() => vi.clearAllMocks());

  it("pide la lista a la MISMA ruta que Sistema → Usuarios, por empresa", async () => {
    const f = stubLista();
    renderPicker({ empresa: "fashion_shoes" });
    await waitFor(() => expect(f).toHaveBeenCalled());
    expect(f.mock.calls[0][0]).toBe("/api/admin/switch-vendedores?empresa=fashion_shoes");
  });

  it("🔴 el vendedor PUESTO viene marcado (el default se ve)", async () => {
    stubLista();
    renderPicker({ valor: { id: 9, nombre: "Beto Ruiz" } });
    const beto = await screen.findByRole("button", { name: /Beto Ruiz/ });
    expect(beto.getAttribute("aria-pressed")).toBe("true");
    const ana = screen.getByRole("button", { name: /Ana Pérez/ });
    expect(ana.getAttribute("aria-pressed")).toBe("false");
  });

  it("tocar un vendedor avisa al padre con id y nombre", async () => {
    stubLista();
    const onElegir = vi.fn();
    renderPicker({ onElegir });
    fireEvent.click(await screen.findByRole("button", { name: /Beto Ruiz/ }));
    expect(onElegir).toHaveBeenCalledWith({ id: 9, nombre: "Beto Ruiz" });
  });

  it("🔴 BUSCAR no es ELEGIR, y no vuelve a pedir la lista", async () => {
    const f = stubLista();
    const onElegir = vi.fn();
    renderPicker({ onElegir });
    await screen.findByRole("button", { name: /Ana Pérez/ });
    fireEvent.change(screen.getByPlaceholderText("Buscar vendedor..."), { target: { value: "beto" } });
    await waitFor(() => expect(screen.queryByRole("button", { name: /Ana Pérez/ })).toBeNull());
    expect(screen.getByRole("button", { name: /Beto Ruiz/ })).toBeTruthy();
    expect(onElegir).not.toHaveBeenCalled();
    expect(f).toHaveBeenCalledTimes(1); // ⚠️ una llamada por tecla = un login por tecla
  });

  it("busca sin acentos ni mayúsculas, y también por id", async () => {
    stubLista();
    renderPicker();
    await screen.findByRole("button", { name: /Ana Pérez/ });
    fireEvent.change(screen.getByPlaceholderText("Buscar vendedor..."), { target: { value: "PEREZ" } });
    await waitFor(() => expect(screen.getByRole("button", { name: /Ana Pérez/ })).toBeTruthy());
    fireEvent.change(screen.getByPlaceholderText("Buscar vendedor..."), { target: { value: "9" } });
    await waitFor(() => expect(screen.getByRole("button", { name: /Beto Ruiz/ })).toBeTruthy());
  });

  it("🔴 sin NINGÚN vendedor disponible lo DICE, con el nombre de la empresa", async () => {
    stubLista([]);
    renderPicker();
    expect(await screen.findByText(/Vistana International no tiene vendedores en Switch/)).toBeTruthy();
  });

  it("si Switch no responde lo dice, y no ofrece una lista vacía como si fuera la verdad", async () => {
    stubLista([], false);
    renderPicker();
    expect(await screen.findByText(/No se pudo cargar la lista de vendedores/)).toBeTruthy();
    expect(screen.queryByText(/no tiene vendedores en Switch/)).toBeNull();
  });

  it("todos los blancos tocables miden 44 px", async () => {
    stubLista();
    renderPicker();
    await screen.findByRole("button", { name: /Ana Pérez/ });
    for (const b of screen.getAllByRole("button")) {
      expect(b.className, b.textContent || "").toContain("min-h-[44px]");
    }
    expect(screen.getByPlaceholderText("Buscar vendedor...").className).toContain("min-h-[44px]");
  });
});

// ─── Candados de las DOS pantallas que lo usan ───────────────────────────────

describe("🔴 el vendedor se ve en los dos lugares donde se arma un pedido", () => {
  it("el detalle del pedido tiene el bloque con su 'Cambiar'", () => {
    const s = leer("src/components/catalogo/PedidoDetalleClient.tsx");
    expect(s).toContain("VendedorSwitchPicker");
    expect(s).toContain("setShowVendedorModal");
    expect(s).toContain("vendedores-switch");
    // El mismo criterio que el cliente: con envío vivo NO se cambia.
    expect(s).toContain("const puedeCambiarVendedor = puedeCambiarCliente");
  });

  it("el checkout dejó de ser de solo lectura y conserva el aviso al admin", () => {
    const s = leer("src/components/catalogo/CheckoutClient.tsx");
    expect(s).toContain("VendedorSwitchPicker");
    expect(s).toContain("setVendedorPickerOpen");
    // 🔴 El texto del caso "no hay mapeo" NO se pierde: el mapeo sigue siendo
    // lo que corresponde arreglar, aunque ahora haya salida.
    expect(s).toContain("pídele al admin asignarlo en Sistema → Usuarios");
  });
});

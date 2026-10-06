// ─────────────────────────────────────────────────────────────────────────────
// 🔴 CANDADO · Catálogos estilo Apple V2 (`CATALOGOS_APPLE_V2_2026_10`,
// 6-oct-2026). Solo cambia la pantalla:
//   1. Apagado hasta el «sí» de Daniel, y lo aprobado antes sigue prendido.
//   2. El carrito, el checkout, el precio y el catálogo PÚBLICO no leen el
//      interruptor; el cuerpo del POST del checkout es letra por letra el de hoy.
//   3. Prendido, «Confirmar pedido» pone los datos arriba y manda LO MISMO.
//   4. La barra del armado prendida llama al MISMO botón; la pública no cambia.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import fs from "fs";
import path from "path";
import ConfirmarPedidoAgrupado from "@/components/catalogo/ConfirmarPedidoAgrupado";
import { CATALOGOS_APPLE_V2_2026_10, claseChipAdmin, lineaDelPedido } from "@/lib/catalogo/catalogos-2026-10-v2";
import { CATALOGOS_APPLE_2026_10 } from "@/lib/catalogo/catalogos-2026-10";
import { CATALOGOS_APPLE_2026_10_B } from "@/lib/catalogo/catalogos-2026-10-b";

const RAIZ = process.cwd();
const leer = (p: string) => fs.readFileSync(path.join(RAIZ, p), "utf8");
afterEach(() => cleanup());

describe("1 · el interruptor", () => {
  it("V2 apagado; la v1 y la tercera vuelta siguen prendidas", () => {
    expect(CATALOGOS_APPLE_V2_2026_10).toBe(false);
    expect(CATALOGOS_APPLE_2026_10).toBe(true);
    expect(Object.values(CATALOGOS_APPLE_2026_10_B).every(Boolean)).toBe(true);
  });

  it("la línea gris solo junta números que ya están", () => {
    expect(lineaDelPedido({ productos: 1, bultos: 1 })).toBe("1 producto · 1 bulto");
    expect(lineaDelPedido({ productos: 3, bultos: 12 })).toBe("3 productos · 12 bultos");
    expect(lineaDelPedido({ productos: 3, unidades: 36 })).toBe("3 productos · 36 u");
  });

  it("el chip de Administrar usa la paleta (negro seleccionado, redondo)", () => {
    expect(claseChipAdmin(true)).toContain("bg-gray-900 text-white");
    expect(claseChipAdmin(false)).toContain("rounded-full");
  });
});

describe("2 · lo que se guarda o ve el cliente no lee el interruptor", () => {
  it("ni el carrito, ni el checkout, ni el precio, ni lo público", () => {
    for (const p of [
      "src/components/catalogo/CheckoutClient.tsx",
      "src/components/catalogo/ConfirmarPedidoAgrupado.tsx",
      "src/components/catalogo/CatalogoStickyCartBar.tsx",
      "src/components/catalogo/LineasPedidoEditables.tsx",
      "src/components/catalogo/CatalogoProductCard.tsx",
      "src/components/catalogo/CatalogoPublicoPage.tsx",
      "src/components/catalogo/RevisarPedidoPublico.tsx",
      "src/lib/catalogo/carrito.ts",
      "src/lib/catalogo/precio.ts",
    ]) {
      expect(leer(p), p).not.toContain("catalogos-2026-10-v2");
      expect(leer(p), p).not.toContain("CATALOGOS_APPLE_V2_2026_10");
    }
    // El público nunca le pasa la barra nueva al carrito.
    expect(leer("src/components/catalogo/CatalogoPublicoPage.tsx")).not.toMatch(/\bv2=/);
  });

  it("el cuerpo del POST del checkout es el de hoy", () => {
    expect(leer("src/components/catalogo/CheckoutClient.tsx")).toContain(
      "body: JSON.stringify({ marca, cliente: clienteParaCheckout(cliente), vendedor_id: vendedor?.id ?? null, items: cart, idempotency_key: token, documento }),",
    );
  });

  it("ninguna ruta del servidor lee el interruptor", () => {
    const listar = (dir: string): string[] =>
      fs.readdirSync(path.join(RAIZ, dir), { withFileTypes: true }).flatMap((e) => {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) return listar(p);
        return /\.(ts|tsx)$/.test(e.name) ? [p] : [];
      });
    for (const p of listar("src/app/api")) expect(leer(p), p).not.toContain("catalogos-2026-10-v2");
  });
});

const LINEAS = [
  { product_id: "a", sku: "A1", name: "Tenis", image_url: "", quantity: 2, unit_price: 10, bulto: 12, piezas: 24, subtotal: 240 },
  { product_id: "b", sku: "B1", name: "Gorra", image_url: "", quantity: 1, unit_price: 5, bulto: 12, piezas: 12, subtotal: 60 },
];

function montar(v2: boolean, faltaTexto: string | null, onElegir = vi.fn()) {
  render(
    <ConfirmarPedidoAgrupado
      lineas={LINEAS}
      onQty={() => {}}
      renderPrecio={() => null}
      cliente={faltaTexto ? null : "Cliente S.A."}
      clienteAbierto={false}
      onCliente={() => {}}
      selectorCliente={null}
      vendedor="Reinaldo Espinosa"
      vendedorAbierto={false}
      onVendedor={() => {}}
      selectorVendedor={null}
      total={300}
      totalPiezas={36}
      faltaTexto={faltaTexto}
      enviando={false}
      onElegir={onElegir}
      v2={v2}
    />,
  );
  return onElegir;
}

describe("3 · «Confirmar pedido» prendido", () => {
  it("los datos del pedido van ARRIBA de los productos (apagado, abajo)", () => {
    montar(true, null);
    const datos = document.querySelector('[data-medir="datos-del-pedido"]')!;
    const lineas = document.querySelector('[data-medir="lineas-pedido"]')!;
    expect(datos.compareDocumentPosition(lineas) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText("2 productos · 36 u")).toBeTruthy();
    cleanup();
    montar(false, null);
    const lineas2 = document.querySelector('[data-medir="lineas-pedido"]')!;
    const cliente2 = document.querySelector('[data-medir="cliente-checkout"]')!;
    expect(lineas2.compareDocumentPosition(cliente2) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText("2 productos")).toBeTruthy();
  });

  it("manda LO MISMO: «pedido» y «cotizacion», y con algo faltando no manda", () => {
    const onElegir = montar(true, null);
    fireEvent.click(screen.getByText("Enviar pedido"));
    fireEvent.click(screen.getByText("Cotización"));
    expect(onElegir.mock.calls).toEqual([["pedido"], ["cotizacion"]]);
    cleanup();
    const otro = montar(true, "Falta: seleccionar el cliente");
    fireEvent.click(screen.getByText("Enviar pedido"));
    expect(otro).not.toHaveBeenCalled();
    expect(screen.getByText("Falta: seleccionar el cliente")).toBeTruthy();
  });
});

describe("4 · la barra del armado", () => {
  it("prendida solo del vendedor, con el mismo botón y el mismo destino", () => {
    const barra = leer("src/components/catalogo/CatalogoStickyCartBar.tsx");
    expect(barra).toContain('{v2 && variant === "vendor" ? (');
    const vendedor = leer("src/components/catalogo/CatalogoVendedorPage.tsx");
    expect(vendedor).toContain("onCreateOrder={goCheckout}");
    expect(vendedor).toContain("v2={CATALOGOS_APPLE_V2_2026_10 ? {");
  });
});

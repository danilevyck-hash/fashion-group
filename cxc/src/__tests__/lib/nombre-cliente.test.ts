// Regla ÚNICA del nombre del cliente en los pedidos del link público.
// Regresión real (25-jul-2026): con el mínimo viejo de 2 caracteres entraron
// pedidos con cliente_nombre "ff" y nombres vacíos. Estos tests fijan que el
// mínimo son 3 LETRAS y que las 3 marcas usan LA MISMA regla y el MISMO texto.

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import {
  NOMBRE_MIN,
  NOMBRE_MAX,
  NOMBRE_ERROR_CORTO,
  contarLetras,
  nombreClienteValido,
  validarNombreCliente,
} from "@/lib/catalogo/nombre-cliente";
import { validatePedidoBody as reebokValidate } from "@/lib/reebok-pedido-publico-validate";
import { validatePedidoBody as joybeesValidate } from "@/lib/joybees-pedido-publico-validate";
import { validatePedidoBody as tommyValidate } from "@/lib/tommy-pedido-publico-validate";

describe("validarNombreCliente", () => {
  it("mínimo son 3 letras (no 3 caracteres)", () => {
    expect(NOMBRE_MIN).toBe(3);
    expect(validarNombreCliente("Ana").ok).toBe(true);
    expect(validarNombreCliente("An").ok).toBe(false);
  });

  it('rechaza el caso real reportado: "ff"', () => {
    const res = validarNombreCliente("ff");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe(NOMBRE_ERROR_CORTO);
  });

  it("rechaza vacío, solo espacios, solo números y solo símbolos", () => {
    for (const raw of ["", "   ", "12345", "...", "---", null, undefined, 42]) {
      expect(nombreClienteValido(raw)).toBe(false);
    }
  });

  it("acepta acentos y ñ como letras", () => {
    expect(contarLetras("Íñi")).toBe(3);
    expect(validarNombreCliente("Íñi").ok).toBe(true);
  });

  it("normaliza: recorta y colapsa espacios internos", () => {
    const res = validarNombreCliente("  María   Pérez  ");
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.nombre).toBe("María Pérez");
  });

  it("rechaza nombres más largos que el máximo", () => {
    expect(validarNombreCliente("x".repeat(NOMBRE_MAX + 1)).ok).toBe(false);
    expect(validarNombreCliente("a".repeat(NOMBRE_MAX)).ok).toBe(true);
  });
});

describe("paridad: las 3 marcas aplican la MISMA regla server-side", () => {
  const validItem = {
    product_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    sku: "SKU-1",
    name: "Producto",
    quantity: 1,
    unit_price: 10,
  };
  const validadores = [
    ["reebok", reebokValidate],
    ["joybees", joybeesValidate],
    ["tommy", tommyValidate],
  ] as const;

  for (const [marca, validate] of validadores) {
    it(`${marca}: rechaza "ff" con el texto compartido y acepta un nombre real`, () => {
      const corto = validate({ items: [validItem], cliente_nombre: "ff" });
      expect(corto.ok).toBe(false);
      if (!corto.ok) expect(corto.error).toBe(NOMBRE_ERROR_CORTO);

      const ok = validate({ items: [validItem], cliente_nombre: "  María   Pérez " });
      expect(ok.ok).toBe(true);
      if (ok.ok) expect(ok.cliente_nombre).toBe("María Pérez");
    });
  }
});

// ── UI: el campo se LEE como obligatorio en las 3 marcas ────────────────────
// La barra del carrito es UN componente compartido: si el contrato está en el
// archivo, vale para Reebok, Joybees y Tommy por construcción. Lo que se fija
// aquí es que el campo grita "obligatorio", que el error es visible y que el
// botón bloqueado DICE por qué (antes solo bajaba la opacidad).
describe("CatalogoStickyCartBar — el nombre se lee como obligatorio", () => {
  const BAR = readFileSync(
    path.join(process.cwd(), "src/components/catalogo/CatalogoStickyCartBar.tsx"),
    "utf8",
  );

  it("usa la regla compartida, no un .trim() suelto", () => {
    expect(BAR).toContain('from "@/lib/catalogo/nombre-cliente"');
    expect(BAR).not.toContain('!(clientName || "").trim()');
  });

  it("marca el campo como obligatorio (label + required + aria)", () => {
    expect(BAR).toContain("obligatorio");
    expect(BAR).toContain('aria-required="true"');
    expect(BAR).toContain("aria-invalid={nombreInvalido}");
  });

  it("muestra el motivo del bloqueo y lo repite en el botón", () => {
    expect(BAR).toContain('role="alert"');
    expect(BAR).toContain("{motivoBloqueo}");
    expect(BAR).toContain('"Falta tu nombre"');
  });

  it("el botón sigue deshabilitado mientras el nombre no sea válido", () => {
    expect(BAR).toContain("disabled={saving || nombreInvalido}");
  });
});

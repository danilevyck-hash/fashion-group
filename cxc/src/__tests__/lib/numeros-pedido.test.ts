// ─────────────────────────────────────────────────────────────────────────────
// LOS DOS NÚMEROS DE UN PEDIDO — la regla, no las palabras.
//
// Fija lo que la lista del admin NO puede dejar de decir:
//   · el número de la casa (PED-017) y el del ERP (16-000000503) son DOS cosas
//     distintas y ninguna reemplaza a la otra;
//   · un pedido que no salió NO dice «—»: dice que no se ha mandado;
//   · el número de Switch SIEMPRE viene con el nombre del documento — una
//     COTIZACIÓN no aparta mercancía y con el número solo se ve igual que un
//     pedido;
//   · el pedido del LINK sin convertir no tiene número propio y lo dice.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import {
  TEXTO_NO_ENVIADO,
  TEXTO_SIN_NUMERO,
  TEXTO_SIN_NUMERO_DEL_LINK,
  estaEnSwitch,
  textoBuscablePedido,
  textoEnSwitch,
  textoNumeroPedido,
  tieneNumeroPropio,
} from "@/lib/catalogo/numeros-pedido";

describe("el número de la casa", () => {
  it("se muestra tal cual en las 4 marcas", () => {
    for (const n of ["PED-017", "JBP-041", "TOM-026", "CKP-005"]) {
      expect(textoNumeroPedido({ numeroPedido: n, fuente: "orders" })).toBe(n);
      expect(tieneNumeroPropio({ numeroPedido: n })).toBe(true);
    }
  });

  it("el pedido del LINK sin convertir dice que se numera al abrirlo, no un blanco", () => {
    const t = textoNumeroPedido({ numeroPedido: null, fuente: "publicos" });
    expect(t).toBe(TEXTO_SIN_NUMERO_DEL_LINK);
    expect(t.trim()).not.toBe("");
    expect(t).not.toBe("—");
    expect(t).not.toBe("-");
  });

  it("un interno sin número lo dice, no lo tapa", () => {
    expect(textoNumeroPedido({ numeroPedido: null, fuente: "orders" })).toBe(TEXTO_SIN_NUMERO);
    expect(textoNumeroPedido({ numeroPedido: "   ", fuente: "orders" })).toBe(TEXTO_SIN_NUMERO);
  });
});

describe("🔴 el número de Switch nunca va solo: dice si fue pedido o COTIZACIÓN", () => {
  it("pedido", () => {
    const t = textoEnSwitch({ switchNumero: "16-000000503", switchDocumento: "pedido" });
    expect(t).toContain("16-000000503");
    expect(t.toLowerCase()).toContain("pedido");
    expect(t.toLowerCase()).not.toContain("cotiza");
  });

  it("cotización — y NO se puede confundir con un pedido", () => {
    const t = textoEnSwitch({ switchNumero: "16-000000503", switchDocumento: "cotizacion" });
    expect(t).toContain("16-000000503");
    expect(t.toLowerCase()).toContain("cotizaci");
    expect(t).not.toBe(textoEnSwitch({ switchNumero: "16-000000503", switchDocumento: "pedido" }));
  });

  it("sin la columna `documento` (DDL pendiente) se comporta como antes: PEDIDO", () => {
    for (const d of [null, undefined, "", "loquesea"]) {
      expect(textoEnSwitch({ switchNumero: "16-000000503", switchDocumento: d })).toBe(
        textoEnSwitch({ switchNumero: "16-000000503", switchDocumento: "pedido" }),
      );
    }
  });
});

describe("🔴 un pedido que no fue a Switch DICE lo que es", () => {
  it("no dice «—» ni un blanco", () => {
    const t = textoEnSwitch({ switchNumero: null });
    expect(t).toBe(TEXTO_NO_ENVIADO);
    expect(t).toMatch(/no se ha mandado/i);
    expect(t).not.toBe("—");
    expect(t).not.toBe("-");
    expect(t.trim()).not.toBe("");
    expect(estaEnSwitch({ switchNumero: null })).toBe(false);
    expect(estaEnSwitch({})).toBe(false);
  });

  it("el «?» heredado de pedidos-unificado NO se pinta como si fuera un número", () => {
    // Un envío activo sin numero_interno ni pedido_switch_id (hoy 0 casos en
    // producción) llega como "?". Está EN Switch, pero un signo de pregunta en
    // el lugar del número es el vacío que parece un dato.
    const t = textoEnSwitch({ switchNumero: "?", switchDocumento: "pedido" });
    expect(estaEnSwitch({ switchNumero: "?" })).toBe(true);
    expect(t).not.toContain("?");
    expect(t).toMatch(/sin número/i);
    expect(t).not.toBe(TEXTO_NO_ENVIADO);
  });
});

describe("el buscador encuentra por cualquiera de los dos números", () => {
  const fila = { cliente: "Hafez, S.A.", numeroPedido: "PED-018", switchNumero: "16-000000506" };

  it("por el número de la casa", () => {
    expect(textoBuscablePedido(fila)).toContain("ped-018");
  });

  it("por el número del ERP", () => {
    expect(textoBuscablePedido(fila)).toContain("16-000000506");
  });

  it("sigue encontrando por cliente", () => {
    expect(textoBuscablePedido(fila)).toContain("hafez");
  });
});

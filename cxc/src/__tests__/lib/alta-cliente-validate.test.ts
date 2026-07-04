import { describe, it, expect } from "vitest";
import { validarAltaCliente } from "@/lib/catalogo/alta-cliente-validate";

describe("validarAltaCliente", () => {
  it("acepta un alta válida completa", () => {
    const r = validarAltaCliente({ nombre: "  Calzados Marta  ", codigo: "CM-101", telefono: "6612-3456" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.nombre).toBe("Calzados Marta");
      expect(r.value.codigo).toBe("CM-101");
      expect(r.value.telefono).toBe("6612-3456");
    }
  });

  it("acepta teléfono ausente o vacío (queda null)", () => {
    for (const telefono of [undefined, "", "   "]) {
      const r = validarAltaCliente({ nombre: "Cliente Prueba", codigo: "CP-1", telefono });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.telefono).toBeNull();
    }
  });

  it("compacta espacios internos del teléfono", () => {
    const r = validarAltaCliente({ nombre: "Cliente Prueba", codigo: "CP-2", telefono: "+507 6612 3456" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.telefono).toBe("+50766123456");
  });

  // ── nombre ──
  it("rechaza nombre ausente, no-string o muy corto", () => {
    expect(validarAltaCliente({ codigo: "AB-1" }).ok).toBe(false);
    expect(validarAltaCliente({ nombre: 42, codigo: "AB-1" }).ok).toBe(false);
    expect(validarAltaCliente({ nombre: "A", codigo: "AB-1" }).ok).toBe(false);
    expect(validarAltaCliente({ nombre: "  X ", codigo: "AB-1" }).ok).toBe(false);
  });

  it("rechaza nombre de más de 120 caracteres", () => {
    const r = validarAltaCliente({ nombre: "x".repeat(121), codigo: "AB-1" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/nombre/i);
  });

  // ── codigo ──
  it("rechaza código con caracteres fuera de [a-zA-Z0-9-]", () => {
    for (const codigo of ["AB 1", "AB_1", "AB.1", "ÁB-1", "D-108!", "a"]) {
      const r = validarAltaCliente({ nombre: "Cliente Prueba", codigo });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toMatch(/código/i);
    }
  });

  it("rechaza código ausente o de más de 20 caracteres", () => {
    expect(validarAltaCliente({ nombre: "Cliente Prueba" }).ok).toBe(false);
    expect(validarAltaCliente({ nombre: "Cliente Prueba", codigo: "A".repeat(21) }).ok).toBe(false);
    expect(validarAltaCliente({ nombre: "Cliente Prueba", codigo: "A".repeat(20) }).ok).toBe(true);
  });

  // ── telefono ──
  it("rechaza teléfono con letras o longitud inválida", () => {
    for (const telefono of ["abc1234", "123456", "1".repeat(21), "6612-345x"]) {
      const r = validarAltaCliente({ nombre: "Cliente Prueba", codigo: "CP-3", telefono });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toMatch(/teléfono/i);
    }
  });
});

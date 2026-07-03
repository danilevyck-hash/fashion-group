import { describe, it, expect } from "vitest";
import { telefonoWhatsApp, waLink } from "../lib/phone-wa";

// Formatos REALES observados en switch_clientes de la instancia MULTI (3-jul).
describe("telefonoWhatsApp — normalización Panamá", () => {
  it("celular con guión", () => {
    expect(telefonoWhatsApp("6437-7065")).toBe("50764377065");
  });
  it("celular con coma colgando", () => {
    expect(telefonoWhatsApp("6212-0673,")).toBe("50762120673");
  });
  it("celular pegado sin guión", () => {
    expect(telefonoWhatsApp("62266653")).toBe("50762266653");
  });
  it("ya trae 507 con espacios", () => {
    expect(telefonoWhatsApp("507 6533 1308")).toBe("50765331308");
  });
  it("fijo de 7 dígitos", () => {
    expect(telefonoWhatsApp("774-1234")).toBe("5077741234");
  });
  it("prefijo internacional 00507", () => {
    expect(telefonoWhatsApp("00507 6533-1308")).toBe("50765331308");
  });
  it("dos números separados por / → toma el primero", () => {
    expect(telefonoWhatsApp("6212-0673 / 6301-1122")).toBe("50762120673");
  });
  it("cae al segundo campo si el primero está vacío (telefono, celular)", () => {
    expect(telefonoWhatsApp("", "6437-7065")).toBe("50764377065");
    expect(telefonoWhatsApp(null, "6437-7065")).toBe("50764377065");
  });
  it("basura no normalizable → null", () => {
    expect(telefonoWhatsApp("N/A")).toBe(null);
    expect(telefonoWhatsApp("123")).toBe(null);
    expect(telefonoWhatsApp("")).toBe(null);
    expect(telefonoWhatsApp(null, undefined)).toBe(null);
  });
  it("waLink arma wa.me o null", () => {
    expect(waLink("6437-7065")).toBe("https://wa.me/50764377065");
    expect(waLink("", null)).toBe(null);
  });
});

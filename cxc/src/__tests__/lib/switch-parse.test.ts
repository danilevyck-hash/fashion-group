import { describe, it, expect } from "vitest";
import { parseSwitchFecha, parseFechaDMY, parseAmount } from "@/lib/switch-api/parse";

describe("parseSwitchFecha", () => {
  it("convierte timestamp Switch a ISO con offset Panamá", () => {
    expect(parseSwitchFecha("2026-04-21 14:30:05")).toBe("2026-04-21T14:30:05-05:00");
    expect(parseSwitchFecha("2025-12-02 00:00:00")).toBe("2025-12-02T00:00:00-05:00");
  });

  it("acepta separador 'T' además de espacio", () => {
    expect(parseSwitchFecha("2026-04-21T14:30:05")).toBe("2026-04-21T14:30:05-05:00");
  });

  it("ignora milisegundos / texto sobrante después de los segundos", () => {
    expect(parseSwitchFecha("2026-04-21 14:30:05.123")).toBe("2026-04-21T14:30:05-05:00");
  });

  // 🟢-16: el regex viejo aceptaba zero-dates y generaba "0000-00-00T..." basura.
  it("rechaza zero-date '0000-00-00 00:00:00' (devuelve null)", () => {
    expect(parseSwitchFecha("0000-00-00 00:00:00")).toBeNull();
  });

  it("rechaza componentes imposibles (mes 00, día 00, mes 13, día 32)", () => {
    expect(parseSwitchFecha("2026-00-15 10:00:00")).toBeNull();
    expect(parseSwitchFecha("2026-04-00 10:00:00")).toBeNull();
    expect(parseSwitchFecha("2026-13-15 10:00:00")).toBeNull();
    expect(parseSwitchFecha("2026-04-32 10:00:00")).toBeNull();
  });

  it("rechaza año fuera de rango (0000, < 2000)", () => {
    expect(parseSwitchFecha("0000-05-01 10:00:00")).toBeNull();
    expect(parseSwitchFecha("1999-05-01 10:00:00")).toBeNull();
  });

  it("devuelve null para formato no reconocido", () => {
    expect(parseSwitchFecha("")).toBeNull();
    expect(parseSwitchFecha("21/04/2026")).toBeNull();
    expect(parseSwitchFecha("2026-04-21")).toBeNull(); // sin hora
    expect(parseSwitchFecha("basura")).toBeNull();
  });
});

describe("parseFechaDMY", () => {
  it("convierte DD-MM-YYYY a ISO YYYY-MM-DD", () => {
    expect(parseFechaDMY("21-04-2026")).toBe("2026-04-21");
    expect(parseFechaDMY("01-12-2025")).toBe("2025-12-01");
  });

  it("tolera espacios y devuelve null para null/undefined/basura", () => {
    expect(parseFechaDMY("  21-04-2026 ")).toBe("2026-04-21");
    expect(parseFechaDMY(null)).toBeNull();
    expect(parseFechaDMY(undefined)).toBeNull();
    expect(parseFechaDMY("2026-04-21")).toBeNull(); // formato ISO, no DMY
    expect(parseFechaDMY("")).toBeNull();
  });
});

describe("parseAmount", () => {
  it("saca la coma de miles (formato US) — sin esto se perdían facturas >= $1,000", () => {
    expect(parseAmount("2,112.0000")).toBe(2112);
    expect(parseAmount("769,292.75")).toBeCloseTo(769292.75, 2);
    expect(parseAmount("1,234,567.89")).toBeCloseTo(1234567.89, 2);
  });

  it("acepta montos sin coma y números nativos", () => {
    expect(parseAmount("2112.0000")).toBe(2112);
    expect(parseAmount(2112)).toBe(2112);
    expect(parseAmount("0")).toBe(0);
    expect(parseAmount(0)).toBe(0);
  });

  it("preserva el signo negativo (notas de crédito llegan negativas)", () => {
    expect(parseAmount("-1,500.50")).toBeCloseTo(-1500.5, 2);
  });

  it("devuelve null para vacío, null, undefined y no-numérico", () => {
    expect(parseAmount("")).toBeNull();
    expect(parseAmount("   ")).toBeNull();
    expect(parseAmount(null)).toBeNull();
    expect(parseAmount(undefined)).toBeNull();
    expect(parseAmount("abc")).toBeNull();
    expect(parseAmount(NaN)).toBeNull();
    expect(parseAmount(Infinity)).toBeNull();
  });
});

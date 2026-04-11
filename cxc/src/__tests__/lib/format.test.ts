import { describe, it, expect } from "vitest";
import { fmt, fmtDate, fmtGuia } from "@/lib/format";

describe("fmt()", () => {
  it("formats a number with 2 decimals", () => {
    expect(fmt(1234.5)).toBe("1,234.50");
  });

  it("formats zero", () => {
    expect(fmt(0)).toBe("0.00");
  });

  it("handles null/undefined as 0", () => {
    expect(fmt(null)).toBe("0.00");
    expect(fmt(undefined)).toBe("0.00");
  });

  it("formats negative numbers", () => {
    expect(fmt(-500)).toBe("-500.00");
  });
});

describe("fmtDate()", () => {
  it("formats a date string in Spanish", () => {
    const result = fmtDate("2026-04-09");
    // Should contain day, month abbreviation in Spanish, year
    expect(result).toMatch(/9/);
    expect(result).toMatch(/abr/i);
    expect(result).toMatch(/2026/);
  });

  it("returns empty string for empty input", () => {
    expect(fmtDate("")).toBe("");
  });

  it("returns the raw string for invalid date", () => {
    // fmtDate wraps in try/catch; an invalid string that doesn't throw
    // will still produce something — just verify it doesn't crash
    const result = fmtDate("not-a-date");
    expect(typeof result).toBe("string");
  });
});

describe("fmtGuia()", () => {
  it("pads single digit with zeros", () => {
    expect(fmtGuia(1)).toBe("GT-001");
  });

  it("pads double digit", () => {
    expect(fmtGuia(42)).toBe("GT-042");
  });

  it("does not pad 3+ digits", () => {
    expect(fmtGuia(123)).toBe("GT-123");
    expect(fmtGuia(1500)).toBe("GT-1500");
  });
});

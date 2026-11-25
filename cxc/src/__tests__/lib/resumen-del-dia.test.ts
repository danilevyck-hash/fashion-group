import { describe, it, expect } from "vitest";
import {
  bloqueDespachos,
  bloqueFacturas,
  partirParaTelegram,
  resumenDelDia,
  type FacturaDelDia,
} from "@/lib/alertas/resumen-del-dia";

const fa = (empresa: string, codigo: string, cliente: string, subtotal: number, tipo = "Factura"): FacturaDelDia => ({
  empresa, codigo, cliente, tipo, subtotal,
});

describe("🧾 ventas de hoy", () => {
  it("resta las NC, las dice aparte y agrupa por empresa y cliente (por CÓDIGO)", () => {
    const t = bloqueFacturas([
      fa("fashion_wear", "D-118", "Outlet Duty Free N3, S.A.", 19696),
      fa("fashion_wear", "D-118", "Outlet Duty Free N3, S.A.", 7652),
      fa("fashion_wear", "D-118", "Outlet Duty Free N3, S.A.", 33, "Nota de Crédito"),
      fa("fashion_wear", "D-14", "Bouti, S.A.", 12117),
      fa("fashion_wear", "D-14", "Bouti, S.A.", 12405, "Nota de Crédito"),
      fa("vistana", "D-26", "City Moda Chorrera", 588),
    ]);
    expect(t).toBe(
      [
        "🧾 Ventas de hoy · $27,615 · 4 facturas (ya restadas 2 notas de crédito · $12,438)",
        "Fashion Wear · $27,027\n• Outlet Duty Free N3, S.A. · $27,315 (con nota de crédito −$33)\n• Bouti, S.A. · −$288 (con nota de crédito −$12,405)",
        "Vistana · $588\n• City Moda Chorrera · $588",
      ].join("\n\n"),
    );
  });

  it("el mostrador y las empresas del grupo como cliente no entran (igual que los cobros)", () => {
    const t = bloqueFacturas([
      fa("fashion_wear", "TCKCTA", "VENTAS", 27, "Transacción"),
      fa("fashion_wear", "D-108", "Multi Fashion Holding", 50),
      fa("vistana", "D-26", "City Moda Chorrera", 588),
    ])!;
    expect(t.split("\n")[0]).toBe("🧾 Ventas de hoy · $588 · 1 factura");
    expect(t).not.toMatch(/VENTAS|Multi Fashion/);
  });

  it("el cliente con solo notas de crédito se dice por nombre, nunca un negativo suelto", () => {
    const t = bloqueFacturas([
      fa("fashion_shoes", "D-35", "City Shoes", 1662),
      fa("fashion_shoes", "D-104", "Millenium Sports", 1161, "Nota de Crédito"),
    ])!;
    expect(t).toContain("• Millenium Sports · nota de crédito −$1,161");
    expect(t).toContain("• City Shoes · $1,662\n");
    const dos = bloqueFacturas([
      fa("vistana", "D-1", "X", 10, "Nota de Crédito"),
      fa("vistana", "D-1", "X", 5, "Nota de Crédito"),
    ])!;
    expect(dos).toContain("• X · notas de crédito −$15");
  });

  it("sin facturas no hay bloque; un tipo desconocido no cuenta", () => {
    expect(bloqueFacturas([])).toBeNull();
    expect(bloqueFacturas([fa("vistana", "D-1", "X", 10, "Raro")])).toBeNull();
  });
});

describe("🚚 despachos de hoy", () => {
  it("guías y bultos arriba; por empresa sus bultos; por cliente facturas cortas · bultos · transportista", () => {
    const t = bloqueDespachos([
      {
        transportista: "Sanjur",
        renglones: [
          { empresa: "Fashion Wear", codigo: "D-118", cliente: "Outlet Duty Free N3, S.A.", facturas: "11-000003415", bultos: 6 },
          { empresa: "Fashion Wear", codigo: "D-118", cliente: "Outlet Duty Free N3, S.A.", facturas: "11-000003418", bultos: 4 },
          { empresa: "Vistana International", codigo: "D-25", cliente: "CITY MALL PASO CANOA", facturas: "11-000003240", bultos: 2 },
        ],
      },
      { transportista: "Entrega directa", renglones: [{ empresa: "Fashion Shoes", codigo: "D-35", cliente: "City Shoes", facturas: "11-000002665", bultos: 1 }] },
    ]);
    expect(t).toBe(
      [
        "🚚 Despachos de hoy · 2 guías · 13 bultos",
        "Fashion Wear · 10 bultos\n• Outlet Duty Free N3, S.A. · 3415, 3418 · 10 bultos · Sanjur",
        "Vistana · 2 bultos\n• City Mall Paso Canoa · 3240 · 2 bultos · Sanjur",
        "Fashion Shoes · 1 bulto\n• City Shoes · 2665 · 1 bulto · Entrega directa",
      ].join("\n\n"),
    );
  });

  it("sin guías no hay bloque", () => {
    expect(bloqueDespachos([])).toBeNull();
  });
});

describe("un solo mensaje", () => {
  it("omite el bloque vacío y conserva el orden", () => {
    expect(resumenDelDia(["🧾 A", null, "💰 C"])).toBe("🧾 A\n\n\n💰 C");
    expect(resumenDelDia([null, null, null])).toBeNull();
  });

  it("si no cabe se parte en varios, sin perder nada", () => {
    const bloque = Array.from({ length: 300 }, (_, i) => `• Cliente ${i} · $1,000`).join("\n");
    const texto = `🧾 Facturas\n\n${bloque}\n\n💰 Cobros`;
    const partes = partirParaTelegram(texto);
    expect(partes.length).toBeGreaterThan(1);
    for (const p of partes) expect(p.length).toBeLessThanOrEqual(4096);
    const lineas = (s: string) => s.split("\n").filter(Boolean);
    expect(partes.flatMap(lineas)).toEqual(lineas(texto));
    expect(partirParaTelegram("corto")).toEqual(["corto"]);
  });
});

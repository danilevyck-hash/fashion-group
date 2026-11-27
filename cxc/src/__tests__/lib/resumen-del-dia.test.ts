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

const F = "2026-11-26";

describe("🧾 ventas", () => {
  it("negrita, «– », sin facturas; el neto por cliente; el que queda en $0 no sale", () => {
    const t = bloqueFacturas(
      [
        fa("fashion_shoes", "D-1", "R.J.A.S.A.", 9754),
        fa("fashion_shoes", "D-2", "Viva Panamá Duty Free", 9204),
        fa("fashion_shoes", "D-3", "City Mall Paso Canoa", 120, "Nota de Crédito"),
        fa("fashion_shoes", "D-4", "Anulado", 500),
        fa("fashion_shoes", "D-4", "Anulado", 500, "Nota de Crédito"),
        fa("vistana", "D-26", "A & B <x>", 100),
      ],
      F,
    );
    expect(t).toBe(
      [
        "<b>🧾 Ventas · jue 26 nov</b>\n<b>$18,938</b>",
        "<b>Fashion Shoes · $18,838</b>\n– R.J.A.S.A. · $9,754\n– Viva Panamá Duty Free · $9,204\n– City Mall Paso Canoa · −$120",
        "<b>Vistana · $100</b>\n– A &amp; B &lt;x&gt; · $100",
      ].join("\n\n"),
    );
  });

  it("el mostrador y las empresas del grupo como cliente no entran", () => {
    const t = bloqueFacturas(
      [fa("fashion_wear", "TCKCTA", "VENTAS", 27, "Transacción"), fa("fashion_wear", "D-108", "Multi Fashion Holding", 50), fa("vistana", "D-26", "City Moda", 588)],
      F,
    )!;
    expect(t.split("\n")[1]).toBe("<b>$588</b>");
    expect(t).not.toMatch(/VENTAS|Multi Fashion/);
  });

  it("sin facturas no hay mensaje; un tipo desconocido no cuenta", () => {
    expect(bloqueFacturas([], F)).toBeNull();
    expect(bloqueFacturas([fa("vistana", "D-1", "X", 10, "Raro")], F)).toBeNull();
  });
});

describe("🚚 despachos", () => {
  it("por guía → cliente con sus bultos, de mayor a menor, sin facturas", () => {
    const t = bloqueDespachos(
      [
        {
          numero: 328,
          transportista: "Edwin",
          renglones: [
            { empresa: "Vistana International", codigo: "D-25", cliente: "CITY MALL PASO CANOA", facturas: "11-000003240", bultos: 100 },
            { empresa: "Fashion Wear", codigo: "D-25", cliente: "CITY MALL PASO CANOA", facturas: "11-000003241", bultos: 56 },
            { empresa: "Fashion Wear", codigo: "D-118", cliente: "Outlet", facturas: "11-000003415", bultos: 6 },
          ],
        },
        { numero: 329, transportista: "Entrega directa", renglones: [{ empresa: "Fashion Shoes", codigo: "D-35", cliente: "City Shoes", facturas: "11-000002665", bultos: 1 }] },
      ],
      F,
    );
    expect(t).toBe(
      [
        "<b>🚚 Despachos · jue 26 nov</b>\n2 guías · 163 bultos",
        "<b>Guía 328 · Edwin · 162 bultos</b>\n– City Mall Paso Canoa · 156\n– Outlet · 6",
        "<b>Guía 329 · Entrega directa · 1 bulto</b>\n– City Shoes · 1",
      ].join("\n\n"),
    );
    expect(t).not.toMatch(/\d{4}\b.*3240|000003/);
  });

  it("sin guías no hay mensaje", () => {
    expect(bloqueDespachos([], F)).toBeNull();
  });
});

describe("tres mensajes", () => {
  it("omite la sección vacía y conserva el orden", () => {
    expect(resumenDelDia(["🧾 A", null, "💰 C"])).toEqual(["🧾 A", "💰 C"]);
    expect(resumenDelDia([null, null, null])).toEqual([]);
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

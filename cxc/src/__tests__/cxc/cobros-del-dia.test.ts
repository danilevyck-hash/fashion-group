import { describe, it, expect } from "vitest";
import { mensajeCobrosDelDia, type CobroDelDia } from "@/lib/cxc/cobros-del-dia";

// La foto de la cartera: 4:10 p.m. de Panamá (21:10 UTC).
const FOTO = "2026-10-05T21:10:00Z";
const CORTE = { vistana: FOTO, fashion_wear: FOTO, fashion_shoes: FOTO };
const c = (empresa: string, codigo: string, cliente: string, monto: number, hora = "10:00"): CobroDelDia =>
  ({ empresa, codigo, cliente, monto, creado: `2026-10-05T${hora}:00+00:00` });
/** `empresa|codigo` → saldo a +90 días de la foto. */
const saldos = (o: Record<string, number>) => new Map(Object.entries(o));

describe("resumen diario de cobros — formato dictado por Daniel (7-oct-2026)", () => {
  it("🔒 el ejemplo de Daniel, al pie de la letra", () => {
    const m = mensajeCobrosDelDia(
      [
        c("fashion_shoes", "C-1", "Outlet Duty Free N3, S.A.", 43095),
        c("fashion_shoes", "C-2", "Sport Fashion", 4000),
      ],
      saldos({ "fashion_shoes|C-2": 21494 }),
      CORTE,
    );
    expect(m).toBe(
      "💰 Cobros de hoy · $47,095 · 2 pagos\n" +
        "\n" +
        "Fashion Shoes\n" +
        "• Outlet Duty Free N3, S.A. · $43,095 · al día ✓\n" +
        "• Sport Fashion · $4,000 · le quedan +90 d $21,494",
    );
  });

  it("sin cobros no manda nada", () => {
    expect(mensajeCobrosDelDia([], new Map(), CORTE)).toBeNull();
  });

  it("un solo pago: «1 pago», sin centavos", () => {
    expect(mensajeCobrosDelDia([c("vistana", "D-30", "Golden Mall", 2100.49)], new Map(), CORTE)).toBe(
      "💰 Cobros de hoy · $2,100 · 1 pago\n\nVistana\n• Golden Mall · $2,100 · al día ✓",
    );
  });

  it("dos empresas: un bloque por empresa con una línea en blanco entre bloques", () => {
    const m = mensajeCobrosDelDia(
      [c("vistana", "D-30", "Golden Mall", 2100), c("fashion_wear", "D-80", "Jerusalem De Panama", 1000)],
      saldos({ "fashion_wear|D-80": 800 }),
      CORTE,
    );
    expect(m).toBe(
      "💰 Cobros de hoy · $3,100 · 2 pagos\n" +
        "\n" +
        "Vistana\n" +
        "• Golden Mall · $2,100 · al día ✓\n" +
        "\n" +
        "Fashion Wear\n" +
        "• Jerusalem De Panama · $1,000 · le quedan +90 d $800",
    );
  });

  it("un cliente con dos pagos el mismo día en la misma empresa: una línea con la suma", () => {
    const m = mensajeCobrosDelDia(
      [c("vistana", "D-25", "City Mall Paso Canoa ", 3000), c("vistana", "D-25", "City Mall Paso Canoa", 2000)],
      saldos({ "vistana|D-25": 12300 }),
      CORTE,
    );
    expect(m).toBe("💰 Cobros de hoy · $5,000 · 1 pago\n\nVistana\n• City Mall Paso Canoa · $5,000 · le quedan +90 d $12,300");
  });

  it("saldo solo en 31-90 (sin +90): «al día ✓», como lo dictó Daniel", () => {
    // Su ejemplo real: Outlet Duty Free tenía $67,593 en 31-90 y él escribió «al día ✓».
    // El +90 de la foto es 0, así que el saldo de 31-90 no llega a este mensaje.
    const m = mensajeCobrosDelDia([c("vistana", "D-9", "Plaza Real", 500)], saldos({ "vistana|D-9": 0 }), CORTE);
    expect(m).toBe("💰 Cobros de hoy · $500 · 1 pago\n\nVistana\n• Plaza Real · $500 · al día ✓");
  });

  it("un pago registrado después de la foto se le resta a su +90", () => {
    const s = saldos({ "vistana|D-9": 300 });
    expect(mensajeCobrosDelDia([c("vistana", "D-9", "Plaza Real", 200, "17:00")], s, CORTE)).toMatch(/· le quedan \+90 d \$100$/);
    expect(mensajeCobrosDelDia([c("vistana", "D-9", "Plaza Real", 300, "17:00")], s, CORTE)).toMatch(/· al día ✓$/);
  });

  it("fuera el mostrador y las empresas del grupo como clientes", () => {
    const m = mensajeCobrosDelDia(
      [c("vistana", "D-30", "Golden Mall", 100), c("vistana", "TCKCTA", "VENTAS", 95), c("fashion_wear", "D-108", "Multi Fashion Holding", 9000)],
      new Map(),
      CORTE,
    );
    expect(m).toBe("💰 Cobros de hoy · $100 · 1 pago\n\nVistana\n• Golden Mall · $100 · al día ✓");
  });

  it("muchos: corta a 15 con «y N más · Ver en CxC»", () => {
    const filas = Array.from({ length: 17 }, (_, i) => c("vistana", `D-${i}`, `C${i}`, 100 + i));
    const m = mensajeCobrosDelDia(filas, new Map(), CORTE)!;
    expect(m.startsWith("💰 Cobros de hoy · $1,836 · 17 pagos\n\nVistana\n• C16 · $116")).toBe(true);
    expect(m.match(/^• /gm)).toHaveLength(15);
    expect(m.endsWith("\n\ny 2 más · Ver en CxC https://www.fashiongr.com/cxc")).toBe(true);
  });
});

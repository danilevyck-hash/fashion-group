import { describe, it, expect } from "vitest";
import { mensajeCobrosDelDia, type CobroDelDia } from "@/lib/cxc/cobros-del-dia";

// La foto de la cartera: 4:10 p.m. de Panamá (21:10 UTC).
const CORTE = { vistana: "2026-10-05T21:10:00Z", fashion_wear: "2026-10-05T21:10:00Z" };
const c = (empresa: string, codigo: string, cliente: string, monto: number, hora = "10:00"): CobroDelDia =>
  ({ empresa, codigo, cliente, monto, creado: `2026-10-05T${hora}:00+00:00` });

describe("resumen diario de cobros", () => {
  it("sin cobros no manda nada", () => {
    expect(mensajeCobrosDelDia([], new Map(), CORTE)).toBeNull();
  });

  it("agrupa por empresa, ordena por monto y dice el +90 días que queda", () => {
    const mas90 = new Map([["vistana|D-25", 12300], ["fashion_wear|D-80", 800]]);
    const m = mensajeCobrosDelDia(
      [
        c("vistana", "D-30", "Golden Mall", 2100),
        c("fashion_wear", "D-80", "Jerusalem De Panama", 1000, "17:00"), // después de la foto: se resta
        c("vistana", "D-25", "City Mall Paso Canoa ", 3000),
        c("vistana", "D-25", "City Mall Paso Canoa", 2000), // mismo cliente: una línea
        c("vistana", "TCKCTA", "VENTAS", 95), // mostrador: fuera
        c("fashion_wear", "D-108", "Multi Fashion Holding", 9000), // empresa del grupo: fuera
      ],
      mas90,
      CORTE,
    );
    expect(m).toBe(
      "💰 Cobros de hoy · $8,100 · 3 pagos\n" +
        "Vistana\n" +
        "• City Mall Paso Canoa · $5,000 · le quedan +90 d $12,300\n" +
        "• Golden Mall · $2,100 · al día ✓\n" +
        "Fashion Wear\n" +
        "• Jerusalem De Panama · $1,000 · al día ✓",
    );
  });

  it("muchos: corta a 15 con «y N más · Ver en CxC»", () => {
    const filas = Array.from({ length: 17 }, (_, i) => c("vistana", `D-${i}`, `C${i}`, 100 + i));
    const m = mensajeCobrosDelDia(filas, new Map(), CORTE)!;
    expect(m.startsWith("💰 Cobros de hoy · $1,836 · 17 pagos\nVistana\n• C16 · $116")).toBe(true);
    expect(m.match(/^• /gm)).toHaveLength(15);
    expect(m.endsWith("\ny 2 más · Ver en CxC https://www.fashiongr.com/cxc")).toBe(true);
  });
});

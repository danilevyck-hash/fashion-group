/**
 * 🔒 Cambio de dirección (24-nov-2026, Daniel). Hasta ese día el bloque iba POR
 * EMPRESA («2 pagos») y al +90 de la foto de las 4:10 p. m. se le restaba el
 * pago posterior. Ahora va POR CLIENTE («N clientes»), un renglón por empresa, y
 * el +90 es el que Switch dice al momento: nunca se resta el pago por cuenta
 * propia. Los controles de siempre (mostrador fuera, total cero, tope de 15) se
 * conservan.
 */
import { describe, it, expect } from "vitest";
import { mas90DeLaRespuesta, mensajeCobrosDelDia, type CobroDelDia } from "@/lib/cxc/cobros-del-dia";

const c = (empresa: string, codigo: string, cliente: string, monto: number): CobroDelDia => ({ empresa, codigo, cliente, monto });
/** `empresa|codigo` → +90 que dice Switch. */
const saldos = (o: Record<string, number | null>) => new Map(Object.entries(o));

describe("cobros de hoy — por cliente (24-nov-2026)", () => {
  it("🔒 agrupa por cliente: su total arriba y un renglón por empresa", () => {
    const m = mensajeCobrosDelDia(
      [
        c("fashion_wear", "D-23", "City Mall David", 50885),
        c("vistana", "D-23", "City Mall David", 16314),
        c("fashion_shoes", "D-23", "City Mall David", 11046),
        c("fashion_wear", "D-160", "Transporte Sanjur", 60),
      ],
      saldos({ "fashion_wear|D-23": 106152, "vistana|D-23": 0, "fashion_shoes|D-23": null, "fashion_wear|D-160": 0 }),
    );
    expect(m).toBe(
      "💰 Cobros de hoy · $78,305 · 2 clientes\n" +
        "\n" +
        "City Mall David · $78,245\n" +
        "  • Fashion Wear $50,885 · le quedan +90 d $106,152\n" +
        "  • Vistana $16,314 · al día ✓\n" +
        "  • Fashion Shoes $11,046 · +90 sin actualizar\n" +
        "\n" +
        "Transporte Sanjur · $60\n" +
        "  • Fashion Wear $60 · al día ✓",
    );
  });

  it("el total del cliente suma sus pagos de todas las empresas; dos pagos en una empresa van en un renglón", () => {
    const m = mensajeCobrosDelDia(
      [c("vistana", "D-25", "City Mall Paso Canoa ", 3000), c("vistana", "D-25", "City Mall Paso Canoa", 2000), c("fashion_wear", "D-25", "City Mall Paso Canoa", 500)],
      saldos({ "vistana|D-25": 12300, "fashion_wear|D-25": 0 }),
    );
    expect(m).toBe(
      "💰 Cobros de hoy · $5,500 · 1 cliente\n\nCity Mall Paso Canoa · $5,500\n  • Vistana $5,000 · le quedan +90 d $12,300\n  • Fashion Wear $500 · al día ✓",
    );
  });

  it("control al revés: el pago NO se le resta al +90 de Switch", () => {
    const m = mensajeCobrosDelDia([c("vistana", "D-9", "Plaza Real", 200)], saldos({ "vistana|D-9": 300 }))!;
    expect(m).toMatch(/• Vistana \$200 · le quedan \+90 d \$300$/);
    expect(m).not.toContain("$100");
  });

  it("sin lectura de Switch dice «+90 sin actualizar», nunca inventa", () => {
    expect(mensajeCobrosDelDia([c("vistana", "D-9", "Plaza Real", 200)], new Map())).toMatch(/· \+90 sin actualizar$/);
  });

  it("sin cobros no manda nada", () => {
    expect(mensajeCobrosDelDia([], new Map())).toBeNull();
  });

  it("fuera el mostrador y las empresas del grupo como clientes", () => {
    const m = mensajeCobrosDelDia(
      [c("vistana", "D-30", "Golden Mall", 100), c("vistana", "TCKCTA", "VENTAS", 95), c("fashion_wear", "D-108", "Multi Fashion Holding", 9000)],
      saldos({ "vistana|D-30": 0 }),
    );
    expect(m).toBe("💰 Cobros de hoy · $100 · 1 cliente\n\nGolden Mall · $100\n  • Vistana $100 · al día ✓");
  });

  it("muchos: corta a 15 clientes con «y N más · Ver en CxC»", () => {
    const filas = Array.from({ length: 17 }, (_, i) => c("vistana", `D-${i}`, `C${i}`, 100 + i));
    const m = mensajeCobrosDelDia(filas, new Map())!;
    expect(m.startsWith("💰 Cobros de hoy · $1,836 · 17 clientes\n\nC16 · $116")).toBe(true);
    expect(m.match(/^ {2}• /gm)).toHaveLength(15);
    expect(m.endsWith("\n\ny 2 más · Ver en CxC https://www.fashiongr.com/cxc")).toBe(true);
  });
});

describe("el +90 sale de los tramos de Switch", () => {
  const resp = (saldos: unknown) => ({ estadocuenta: { elements: [], Saldos: saldos } });
  it("suma los tramos desde 91 días", () => {
    expect(
      mas90DeLaRespuesta(
        resp([
          { desde: 0, hasta: 30, saldo: 35413.46 },
          { desde: 61, hasta: 90, saldo: 7282.26 },
          { desde: 91, hasta: 120, saldo: 21947 },
          { desde: 121, hasta: 180, saldo: 2151.73 },
          { desde: 366, hasta: 99999999, saldo: 10 },
        ]),
      ),
    ).toBeCloseTo(24108.73, 2);
  });
  it("sin aging o con un tramo ilegible: null («+90 sin actualizar»)", () => {
    expect(mas90DeLaRespuesta({ estadocuenta: { elements: [] } })).toBeNull();
    expect(mas90DeLaRespuesta(resp([{ desde: "x", saldo: 1 }]))).toBeNull();
  });
});

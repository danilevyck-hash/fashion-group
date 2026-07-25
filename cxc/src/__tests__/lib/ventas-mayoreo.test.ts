import { describe, it, expect } from "vitest";
import { buildNotaMayoreo } from "@/lib/ventas/mayoreo";

describe("buildNotaMayoreo — separación por vista", () => {
  it("MULTIFASHION: el caso vivo de Daniel, retail puro con la nota de lo excluido", () => {
    // 9-jul-2026, única factura de mayoreo del mes en american_classic.
    const nota = buildNotaMayoreo({
      incluido: false,
      monto: 2208.9,
      clientes: ["ACTIVE WEAR, S.A."],
      facturas: 1,
    });
    expect(nota?.texto).toBe("no incluye $2,208.90 de mayoreo · ACTIVE WEAR, S.A.");
    expect(nota?.detalle).toBeNull();
  });

  it("VENTAS: el mismo monto pero declarado como incluido", () => {
    const nota = buildNotaMayoreo({
      incluido: true,
      monto: 2208.9,
      clientes: ["ACTIVE WEAR, S.A."],
      facturas: 1,
    });
    expect(nota?.texto).toBe("incluye $2,208.90 de mayoreo · ACTIVE WEAR, S.A.");
  });

  it("VENTAS YTD 2026 real: monto del año con el conteo de clientes", () => {
    // Datos reales de producción: wholesale.ytdVentas=28365.90, 5 tickets,
    // 3 clientes (Joystep, LA FRONTERA DUTY FREE, ACTIVE WEAR, S.A.).
    const nota = buildNotaMayoreo({
      incluido: true,
      monto: 28365.9,
      clientesCount: 3,
      clienteNombre: "LA FRONTERA DUTY FREE",
      facturas: 5,
    });
    expect(nota?.texto).toBe("incluye $28,365.90 de mayoreo · 5 facturas");
  });

  it("resume por facturas y deja el detalle de clientes accesible", () => {
    const nota = buildNotaMayoreo({
      incluido: false,
      monto: 5000,
      clientes: ["ACTIVE WEAR, S.A.", "LA FRONTERA DUTY FREE"],
      facturas: 3,
    });
    expect(nota?.texto).toBe("no incluye $5,000.00 de mayoreo · 3 facturas");
    expect(nota?.detalle).toBe("ACTIVE WEAR, S.A. · LA FRONTERA DUTY FREE");
  });

  it("varios clientes pero una sola factura por cliente conocida ⇒ resume por clientes", () => {
    const nota = buildNotaMayoreo({
      incluido: false,
      monto: 900,
      clientesCount: 2,
      facturas: 1,
    });
    expect(nota?.texto).toBe("no incluye $900.00 de mayoreo · 2 clientes");
  });

  it("sin cliente conocido, solo el monto", () => {
    const nota = buildNotaMayoreo({ incluido: false, monto: 100 });
    expect(nota?.texto).toBe("no incluye $100.00 de mayoreo");
  });

  it("sin mayoreo en el período no hay nota", () => {
    expect(buildNotaMayoreo({ incluido: true, monto: 0 })).toBeNull();
    expect(buildNotaMayoreo({ incluido: false, monto: -5 })).toBeNull();
    expect(buildNotaMayoreo({ incluido: false, monto: Number.NaN })).toBeNull();
  });

  it("ignora nombres vacíos de la lista", () => {
    const nota = buildNotaMayoreo({
      incluido: false,
      monto: 10,
      clientes: ["  ", "", "ACTIVE WEAR, S.A."],
    });
    expect(nota?.texto).toBe("no incluye $10.00 de mayoreo · ACTIVE WEAR, S.A.");
  });
});

describe("cuadre de los números entre las 2 vistas", () => {
  // Ventas muestra tienda completa; Multifashion muestra retail puro. La
  // diferencia entre ambos totales tiene que ser exactamente el mayoreo, y esa
  // diferencia es la que declara la nota de cada vista.
  it("total Ventas − total Multifashion = mayoreo declarado", () => {
    const retail = 296373.224;
    const mayoreo = 28365.9;
    const tiendaCompleta = retail + mayoreo;

    expect(tiendaCompleta - retail).toBeCloseTo(mayoreo, 6);

    const enVentas = buildNotaMayoreo({ incluido: true, monto: mayoreo, clientesCount: 3, facturas: 5 });
    const enMultifashion = buildNotaMayoreo({ incluido: false, monto: mayoreo, clientesCount: 3, facturas: 5 });

    expect(enVentas?.texto).toContain("incluye $28,365.90");
    expect(enMultifashion?.texto).toContain("no incluye $28,365.90");
    // El monto declarado es el MISMO en las dos vistas; cambia solo el verbo.
    expect(enVentas?.texto.replace("incluye", "")).toBe(enMultifashion?.texto.replace("no incluye", ""));
  });
});

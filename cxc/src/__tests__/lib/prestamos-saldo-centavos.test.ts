// 29-sep-2026 · Préstamo de $800 con 26 pagos de $25 + uno de $7.33: el saldo
// salía 142.66999… y el pago exacto de la liquidación (142.67) «excedía lo que
// debe». Hubo que anotar 142.66 y quedó debiendo $0.01.
import { describe, it, expect } from "vitest";
import { calcularSaldoPrestamo } from "../../lib/prestamos-saldo";

describe("calcularSaldoPrestamo · centavos exactos", () => {
  const movs = [
    { concepto: "Préstamo", monto: 800, estado: "aprobado" },
    ...Array.from({ length: 26 }, () => ({ concepto: "Pago", monto: 25, estado: "aprobado" })),
    { concepto: "Pago", monto: "7.33", estado: "aprobado" },
  ];
  it("el saldo es 142.67 exacto y el pago de 142.67 no lo excede", () => {
    const s = calcularSaldoPrestamo(movs);
    expect(s.cuentas.prestamo.saldo).toBe(142.67);
    expect(142.67 > s.cuentas.prestamo.saldo).toBe(false);
  });
  it("pagando 142.67 queda en cero, no en -0.00000001", () => {
    const s = calcularSaldoPrestamo([...movs, { concepto: "Pago", monto: 142.67, estado: "aprobado" }]);
    expect(s.saldo).toBe(0);
  });
});

// ============================================================================
// Candado de las columnas Calvin / Tommy / Otras marcas del Excel de Marketing.
//
// Lo que protege: que las TRES columnas siempre sumen el Subtotal. Un Excel de
// gastos donde CK + TH + Otras ≠ Subtotal es un Excel que nadie puede auditar,
// y es el error fácil de cometer si algún día "Otras" se calcula sumando las
// partes ajenas en vez de restando (ver el encabezado de columnas-marca.ts).
// ============================================================================
import { describe, it, expect } from "vitest";
import {
  CODIGO_CALVIN,
  CODIGO_TOMMY,
  splitMarcas,
  sumarSplits,
} from "@/lib/marketing/columnas-marca";

const cuadra = (subtotal: number, partes: Array<{ codigo: string; monto: number }>) => {
  const s = splitMarcas(subtotal, partes);
  return Math.abs(s.ck + s.th + s.otras - Math.round(subtotal * 100) / 100) < 0.005;
};

describe("splitMarcas — reparto del subtotal entre Calvin, Tommy y otras", () => {
  it("una sola marca se lleva todo el subtotal", () => {
    expect(splitMarcas(93.46, [{ codigo: CODIGO_TOMMY, monto: 93.46 }])).toEqual({
      ck: 0,
      th: 93.46,
      otras: 0,
    });
    expect(splitMarcas(60.99, [{ codigo: CODIGO_CALVIN, monto: 60.99 }])).toEqual({
      ck: 60.99,
      th: 0,
      otras: 0,
    });
  });

  it("dos marcas 50/50 reparten mitad y mitad", () => {
    const s = splitMarcas(100, [
      { codigo: CODIGO_CALVIN, monto: 50 },
      { codigo: CODIGO_TOMMY, monto: 50 },
    ]);
    expect(s).toEqual({ ck: 50, th: 50, otras: 0 });
  });

  it("una marca que no es CK ni TH cae completa en 'Otras marcas'", () => {
    expect(splitMarcas(3985.79, [{ codigo: "OTR", monto: 3985.79 }])).toEqual({
      ck: 0,
      th: 0,
      otras: 3985.79,
    });
    expect(splitMarcas(1540, [{ codigo: "J", monto: 1540 }])).toEqual({
      ck: 0,
      th: 0,
      otras: 1540,
    });
  });

  it("SIN reparto (gasto sin marca asignada) todo va a 'Otras marcas', no se pierde", () => {
    expect(splitMarcas(250)).toEqual({ ck: 0, th: 0, otras: 250 });
    expect(splitMarcas(250, [])).toEqual({ ck: 0, th: 0, otras: 250 });
  });

  it("mezcla CK + TH + otra: las tres columnas cuadran con el subtotal", () => {
    const s = splitMarcas(300, [
      { codigo: CODIGO_CALVIN, monto: 100 },
      { codigo: CODIGO_TOMMY, monto: 120 },
      { codigo: "RBK", monto: 80 },
    ]);
    expect(s).toEqual({ ck: 100, th: 120, otras: 80 });
    expect(s.ck + s.th + s.otras).toBe(300);
  });

  it("INVARIANTE: ck + th + otras === subtotal, en todos los casos raros", () => {
    // Partes que suman de MENOS (una entrega cuyo total_por_marca no cubre todo).
    expect(cuadra(1000, [{ codigo: CODIGO_TOMMY, monto: 600 }])).toBe(true);
    // Partes que suman de MÁS (dato inconsistente): el residuo no puede ser < 0.
    expect(cuadra(100, [{ codigo: CODIGO_TOMMY, monto: 500 }])).toBe(true);
    expect(
      splitMarcas(100, [
        { codigo: CODIGO_CALVIN, monto: 500 },
        { codigo: CODIGO_TOMMY, monto: 500 },
      ]).otras,
    ).toBe(0);
    // Montos no numéricos no rompen la suma.
    expect(cuadra(50, [{ codigo: CODIGO_TOMMY, monto: NaN }])).toBe(true);
    expect(cuadra(0, [{ codigo: CODIGO_TOMMY, monto: 10 }])).toBe(true);
    // Decimales con centavos.
    expect(cuadra(157.5, [{ codigo: CODIGO_CALVIN, monto: 157.5 }])).toBe(true);
    expect(
      cuadra(66.6, [
        { codigo: CODIGO_CALVIN, monto: 22.2 },
        { codigo: CODIGO_TOMMY, monto: 44.4 },
      ]),
    ).toBe(true);
  });

  it("ninguna columna sale negativa ni mayor que el subtotal", () => {
    const s = splitMarcas(70, [{ codigo: CODIGO_TOMMY, monto: 9000 }]);
    expect(s.th).toBeLessThanOrEqual(70);
    expect(s.ck).toBeGreaterThanOrEqual(0);
    expect(s.otras).toBeGreaterThanOrEqual(0);
  });

  it("sumarSplits agrega los totales del cliente sin arrastrar centavos", () => {
    const s = sumarSplits([
      { ck: 0.1, th: 0.2, otras: 0 },
      { ck: 0.2, th: 0.1, otras: 0 },
    ]);
    expect(s).toEqual({ ck: 0.3, th: 0.3, otras: 0 });
  });
});

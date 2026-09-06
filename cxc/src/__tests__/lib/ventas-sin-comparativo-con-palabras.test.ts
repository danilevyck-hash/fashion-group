// ─────────────────────────────────────────────────────────────────────────────
// «n/a» SE DICE CON PALABRAS (5-sep-2026).
//
// 🩸 QUÉ PASABA. En la matriz del Resumen, Joystep salía **«n/a» de febrero a
// junio**. La cuenta estaba BIEN: `isNaComparison` marca «hay valor este año
// pero el año pasado no hay base para comparar», y en 2025 Joystep **no vendió
// nada hasta julio**. Daniel, textual: *el sistema tiene razón, la palabra es la
// que no dice nada*.
//
// 🔑 SON DOS CASOS Y NO UNO, Y POR ESO SON DOS FRASES. La base del año anterior
// puede no servir porque fue **cero** —no vendió— o porque fue **menos de
// $100**, el piso de `BASE_MIN_COMPARATIVO`. En el segundo SÍ vendió, y decir
// «no vendiste» sería falso: la sigla no decía nada, pero al menos no mentía.
//
// 🔴 LO QUE NO CAMBIÓ: no se inventa un porcentaje. Con base comparable vuelve
// el Δ% de siempre, con su flecha y su color.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import {
  deltaCelda, textoSinComparativo, buildSlotsMetrica, isNaComparison,
  SIN_VENTA_ANTERIOR, VENTA_ANTERIOR_MINIMA, type CeldaBase,
} from "@/lib/ventas/celda";
import { SIN_COMPARATIVO, BASE_MIN_COMPARATIVO } from "@/lib/variacion";

/** El caso REAL: Joystep en marzo. Vendió este año; en 2025, nada. */
const JOYSTEP_MARZO: CeldaBase = {
  ventas: 14_500, ventasPrev: 0,
  utilidad: 4_100, utilidadPrev: 0,
};

describe("la frase, según POR QUÉ no hay comparación", () => {
  it("🔴 base en CERO → «no vendiste»", () => {
    expect(textoSinComparativo(0)).toBe(SIN_VENTA_ANTERIOR);
    expect(SIN_VENTA_ANTERIOR).toBe("no vendiste");
  });

  it("🔑 base positiva pero por debajo de $100 → «casi no vendiste»", () => {
    // Acá SÍ vendió. «No vendiste» sería falso, y es la mitad del cambio.
    expect(textoSinComparativo(40)).toBe(VENTA_ANTERIOR_MINIMA);
    expect(textoSinComparativo(BASE_MIN_COMPARATIVO - 0.01)).toBe(VENTA_ANTERIOR_MINIMA);
  });

  it("una base negativa (devolución neta) tampoco es «no vendiste»… es cero o menos", () => {
    // Con notas de crédito que superan las ventas la base es negativa. Se trata
    // como «no vendiste»: no quedó venta contra la que comparar.
    expect(textoSinComparativo(-500)).toBe(SIN_VENTA_ANTERIOR);
  });

  it("⚠️ sin el dato de la base se cae a la sigla de antes, que nunca miente", () => {
    expect(textoSinComparativo(undefined)).toBe(SIN_COMPARATIVO);
    expect(textoSinComparativo(null)).toBe(SIN_COMPARATIVO);
    expect(textoSinComparativo(NaN)).toBe(SIN_COMPARATIVO);
  });
});

describe("la celda del heatmap", () => {
  it("🩸 el caso de Joystep: dice «no vendiste», no «n/a»", () => {
    expect(isNaComparison(JOYSTEP_MARZO, "ventas")).toBe(true);
    expect(deltaCelda(null, "ventas", true, JOYSTEP_MARZO.ventasPrev)).toEqual({
      texto: "no vendiste",
      tone: "neutral",
    });
  });

  it("y el detalle de la fila transformada dice lo mismo", () => {
    const [ventas] = buildSlotsMetrica(JOYSTEP_MARZO, "ventas");
    expect(ventas.delta).toBe("no vendiste");
    // Es un dato, no una alarma: sin color.
    expect(ventas.tone).toBe("neutral");
  });

  it("🔴 CONTROL — con base comparable vuelve el Δ% de siempre", () => {
    const normal: CeldaBase = { ventas: 120_000, ventasPrev: 100_000, utilidad: 42_000, utilidadPrev: 30_000 };
    expect(isNaComparison(normal, "ventas")).toBe(false);
    expect(deltaCelda(0.2, "ventas", false, normal.ventasPrev)).toEqual({
      texto: "▲ +20%",
      tone: "emerald",
    });
  });

  it("🔴 CONTROL — un mes FUTURO sigue diciendo «—», no «no vendiste»", () => {
    // «—» = acá no pasó nada todavía. «no vendiste» = pasó algo este año y el
    // pasado no había con qué compararlo. Confundirlos sería el bug opuesto.
    const futuro: CeldaBase = { ventas: null, ventasPrev: 9_000, utilidad: null, utilidadPrev: 2_000 };
    expect(deltaCelda(null, "ventas", false, futuro.ventasPrev)).toBeNull();
    expect(buildSlotsMetrica(futuro, "ventas")[0].delta).toBe("—");
  });

  it("⚠️ sin pasarle la base, la celda sigue funcionando y dice «n/a»", () => {
    // Compatibilidad: el parámetro es opcional a propósito, para que un caller
    // que no tenga la base a mano no se rompa ni afirme de más.
    expect(deltaCelda(null, "ventas", true)).toEqual({ texto: SIN_COMPARATIVO, tone: "neutral" });
  });
});

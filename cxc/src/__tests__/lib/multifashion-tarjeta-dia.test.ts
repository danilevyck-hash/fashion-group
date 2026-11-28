// Candado de la tarjeta del día de Multifashion (`MULTIFASHION_TARJETA_DIA_2026_11`).
// Números del sábado 21-nov-2026 medidos contra producción (cuadre:
// scripts/_verif-multifashion-tarjeta-dia.ts).
import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/supabase-server", () => ({ supabaseServer: {} }));
import { MULTIFASHION_TARJETA_DIA_2026_11 } from "@/lib/ui/multifashion-dia-2026-11";
import {
  cambioDelDia, esFechaValida, fechaEquivalente, horaCorta, horasDeMayorVenta, horasDelDibujo,
  subtituloDelDia, ticketPromedio, tituloDelDia,
} from "@/lib/multifashion/tarjeta-dia";
import { ventanasResumen } from "@/lib/acs-resumen-diario";

describe("tarjeta del día de Multifashion", () => {
  it("está prendida", () => expect(MULTIFASHION_TARJETA_DIA_2026_11).toBe(true));

  it("compara con el MISMO día de la semana del año pasado, la regla del Telegram", () => {
    for (const f of ["2026-11-21", "2026-11-27", "2026-03-01", "2028-02-29"]) {
      expect(fechaEquivalente(f)).toBe(ventanasResumen(f).fechaComparable);
      expect(new Date(`${fechaEquivalente(f)}T12:00:00Z`).getUTCDay()).toBe(new Date(`${f}T12:00:00Z`).getUTCDay());
    }
  });

  it("título y subtítulo del mockup", () => {
    expect(tituloDelDia("2026-11-21", false)).toBe("Sábado 21 de noviembre");
    expect(tituloDelDia("2026-11-27", true)).toBe("Hoy, viernes 27 de noviembre");
    expect(subtituloDelDia("2025-11-22", false)).toBe("contra el sábado 22 nov 2025");
    expect(subtituloDelDia("2025-11-28", true)).toBe("en curso · contra el viernes 28 nov 2025");
  });

  it("el %: ±5 % gris sin flecha, bajo 1 % con un decimal, $0 = «sin venta año pasado»", () => {
    expect(cambioDelDia({ venta: 1818.47, ventaPrevia: 4616.6, hayHistoriaPrevia: true })).toEqual({ texto: "▼ −61%", tono: "dn" });
    expect(cambioDelDia({ venta: 1040, ventaPrevia: 1000, hayHistoriaPrevia: true })).toEqual({ texto: "+4%", tono: "fl" });
    expect(cambioDelDia({ venta: 1004, ventaPrevia: 1000, hayHistoriaPrevia: true })).toEqual({ texto: "+0.4%", tono: "fl" });
    expect(cambioDelDia({ venta: 900, ventaPrevia: 0, hayHistoriaPrevia: true })?.texto).toBe("sin venta año pasado");
    expect(cambioDelDia({ venta: 900, ventaPrevia: 0, hayHistoriaPrevia: false })).toBeNull();
  });

  it("ticket promedio y horas de mayor venta", () => {
    expect(ticketPromedio(1818.47, 40)).toBeCloseTo(45.46, 2);
    expect(ticketPromedio(100, 0)).toBeNull();
    const horas = Array.from({ length: 24 }, () => 0);
    horas[12] = 100; horas[13] = 600; horas[14] = 300; horas[17] = 200;
    expect(horasDeMayorVenta(horas)).toEqual({ desde: 12, hasta: 15, rotulo: "12–3 pm", monto: 1000 });
    expect(horasDeMayorVenta(Array.from({ length: 24 }, () => 0))).toBeNull();
    expect(horasDelDibujo(horas)).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18]);
    horas[20] = 5;
    expect(horasDelDibujo(horas).at(-1)).toBe(20);
    expect(horaCorta(10)).toBe("10a");
    expect(horaCorta(12)).toBe("12p");
  });

  it("valida la fecha", () => {
    expect(esFechaValida("2026-11-21")).toBe(true);
    expect(esFechaValida("2026-02-30")).toBe(false);
    expect(esFechaValida("x")).toBe(false);
  });
});

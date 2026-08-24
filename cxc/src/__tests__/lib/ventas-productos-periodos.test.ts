// Ventas › Productos: los cuatro períodos y el precio promedio.
//
// Todo lo que decide FECHAS recibe `ahora` explícito. Sin eso, el bug de un
// borde de mes o de año aparece un día de cada 30 (o uno de cada 365) y ninguna
// corrida de tests lo caza.

import { describe, it, expect } from "vitest";
import {
  productosRange,
  productosRangoPeriodo,
  productosRangoComparativo,
  periodoLabel,
  periodoSlug,
  precioPromedio,
  fmtPrecioProm,
  esProductosPeriodo,
  diaPanama,
} from "@/lib/ventas/productos";

// 24-ago-2026, 03:00 UTC → en Panamá (UTC-5) todavía es el 23.
const MADRUGADA = new Date("2026-08-24T03:00:00Z");
// 24-ago-2026, 18:00 UTC → 13:00 en Panamá, mismo día.
const TARDE = new Date("2026-08-24T18:00:00Z");

describe("el día es el de PANAMÁ, no el del servidor", () => {
  it("a las 03:00 UTC en Panamá todavía es el día anterior", () => {
    expect(diaPanama(MADRUGADA)).toBe("2026-08-23");
    expect(diaPanama(TARDE)).toBe("2026-08-24");
  });
});

describe("productosRange NO cambió (es el camino que ya estaba publicado)", () => {
  it("un mes calendario completo, con su último día real", () => {
    expect(productosRange(2026, 6)).toEqual({ desde: "2026-06-01", hasta: "2026-06-30" });
    expect(productosRange(2024, 2)).toEqual({ desde: "2024-02-01", hasta: "2024-02-29" });
    expect(productosRange(2026, 2)).toEqual({ desde: "2026-02-01", hasta: "2026-02-28" });
  });
  it("un año cerrado va entero", () => {
    expect(productosRange(2024, null)).toEqual({ desde: "2024-01-01", hasta: "2024-12-31" });
  });
});

describe("los cuatro períodos que pidió Daniel", () => {
  it("año en curso = lo mismo que antes (no se movió una fecha)", () => {
    expect(productosRangoPeriodo("ytd", 2026, null, TARDE)).toEqual(productosRange(2026, null));
    expect(productosRangoPeriodo("ytd", 2026, 6, TARDE)).toEqual(productosRange(2026, 6));
  });

  it("últimos 6 meses = 6 meses de CALENDARIO incluido el que corre", () => {
    // Ago-2026 hacia atrás: mar, abr, may, jun, jul, ago = 6.
    expect(productosRangoPeriodo("6m", 2026, null, TARDE)).toEqual({
      desde: "2026-03-01",
      hasta: "2026-08-24",
    });
  });

  it("últimos 12 meses = once cerrados + el que corre", () => {
    expect(productosRangoPeriodo("12m", 2026, null, TARDE)).toEqual({
      desde: "2025-09-01",
      hasta: "2026-08-24",
    });
  });

  it("año pasado = el año calendario anterior, ENTERO", () => {
    expect(productosRangoPeriodo("anio_pasado", 2026, null, TARDE)).toEqual({
      desde: "2025-01-01",
      hasta: "2025-12-31",
    });
  });

  it("el corte es el 1 del mes, no 'hace 180 días' — la ventana no se corre sola", () => {
    const a = productosRangoPeriodo("12m", 2026, null, new Date("2026-08-05T18:00:00Z"));
    const b = productosRangoPeriodo("12m", 2026, null, new Date("2026-08-28T18:00:00Z"));
    expect(a.desde).toBe(b.desde); // el piso no se movió en 23 días
    expect(a.hasta).not.toBe(b.hasta);
  });

  it("el año del selector global NO mueve las ventanas relativas", () => {
    for (const year of [2024, 2025, 2026]) {
      expect(productosRangoPeriodo("12m", year, null, TARDE).desde).toBe("2025-09-01");
      expect(productosRangoPeriodo("anio_pasado", year, 7, TARDE).hasta).toBe("2025-12-31");
    }
  });

  it("cruzando el año: en enero, 6 meses arrancan en agosto del año anterior", () => {
    const ene = new Date("2027-01-09T18:00:00Z");
    expect(productosRangoPeriodo("6m", 2027, null, ene)).toEqual({
      desde: "2026-08-01",
      hasta: "2027-01-09",
    });
    expect(productosRangoPeriodo("anio_pasado", 2027, null, ene)).toEqual({
      desde: "2026-01-01",
      hasta: "2026-12-31",
    });
  });
});

describe("el Δ compara contra el MISMO período del año anterior", () => {
  it("mes suelto: el mismo mes, un año antes (lo que ya hacía la pantalla)", () => {
    expect(productosRangoComparativo("ytd", 2026, 6, TARDE)).toEqual(productosRange(2025, 6));
  });

  it("año en curso: el camino viejo, intacto — su corrección NO entra acá", () => {
    // 🩸 Deja el año anterior ENTERO contra un año en curso parcial. Es el
    // comportamiento publicado y moverlo cambiaría una columna que Daniel ya
    // está mirando; queda anotado como hallazgo, no como cambio silencioso.
    expect(productosRangoComparativo("ytd", 2026, null, TARDE)).toEqual({
      desde: "2025-01-01",
      hasta: "2025-12-31",
    });
  });

  it("períodos relativos: la MISMA ventana corrida 12 meses, punta a punta", () => {
    expect(productosRangoComparativo("12m", 2026, null, TARDE)).toEqual({
      desde: "2024-09-01",
      hasta: "2025-08-24",
    });
    expect(productosRangoComparativo("6m", 2026, null, TARDE)).toEqual({
      desde: "2025-03-01",
      hasta: "2025-08-24",
    });
    expect(productosRangoComparativo("anio_pasado", 2026, null, TARDE)).toEqual({
      desde: "2024-01-01",
      hasta: "2024-12-31",
    });
  });

  it("mismo LARGO de ventana: comparar 6 meses contra 12 es el error caro", () => {
    for (const p of ["6m", "12m", "anio_pasado"] as const) {
      const act = productosRangoPeriodo(p, 2026, null, TARDE);
      const cmp = productosRangoComparativo(p, 2026, null, TARDE);
      // Tolerancia de 1 día y ni uno más: es el 29-feb, no un corte flojo.
      // ("Año pasado" 2025 son 365 días y su comparativo 2024 son 366.)
      expect(Math.abs(dias(cmp.desde, cmp.hasta) - dias(act.desde, act.hasta))).toBeLessThanOrEqual(1);
    }
  });

  it("el 29-feb cae en el 28 del año que no es bisiesto (no en el 1-mar)", () => {
    // 29-feb-2028 (bisiesto) → la ventana de 6m termina ahí.
    const bisiesto = new Date("2028-02-29T18:00:00Z");
    expect(productosRangoPeriodo("6m", 2028, null, bisiesto).hasta).toBe("2028-02-29");
    expect(productosRangoComparativo("6m", 2028, null, bisiesto).hasta).toBe("2027-02-28");
  });
});

describe("precio promedio", () => {
  it("es venta ÷ unidades del grupo, no el promedio de los precios", () => {
    expect(precioPromedio(1000, 40)).toBe(25);
    expect(precioPromedio(183921.85, 8242)).toBeCloseTo(22.3152, 4);
  });

  it("sin unidades netas positivas NO hay precio — y no es cero", () => {
    // Un grupo que quedó en devolución neta: un "$0.00" sería mentira.
    expect(precioPromedio(500, 0)).toBeNull();
    expect(precioPromedio(-200, -10)).toBeNull();
    expect(fmtPrecioProm(precioPromedio(500, 0))).toBe("—");
  });

  it("nunca devuelve NaN ni Infinity", () => {
    expect(precioPromedio(NaN, 10)).toBeNull();
    expect(precioPromedio(10, NaN)).toBeNull();
    expect(precioPromedio(null, 10)).toBeNull();
    expect(precioPromedio(10, undefined)).toBeNull();
  });

  it("se pinta con el formato de plata de la casa, 2 decimales", () => {
    expect(fmtPrecioProm(22.3153)).toBe("$22.32");
    expect(fmtPrecioProm(1234.5)).toBe("$1,234.50");
  });
});

describe("rótulos y nombre de archivo", () => {
  it("el año abierto se llama 'Año en curso'; el cerrado, por su año", () => {
    expect(periodoLabel(2026, null, "ytd", TARDE)).toBe("Año en curso");
    expect(periodoLabel(2025, null, "ytd", TARDE)).toBe("Año 2025");
  });
  it("el mes suelto no cambió de nombre", () => {
    expect(periodoLabel(2026, 6, "ytd", TARDE)).toBe("Jun 2026");
  });
  it("los relativos se llaman como Daniel los nombró", () => {
    expect(periodoLabel(2026, null, "6m", TARDE)).toBe("Últimos 6 meses");
    expect(periodoLabel(2026, null, "12m", TARDE)).toBe("Últimos 12 meses");
    expect(periodoLabel(2026, null, "anio_pasado", TARDE)).toBe("Año 2025");
  });
  it("el nombre del archivo distingue los períodos", () => {
    expect(periodoSlug(null, "ytd")).toBe("ytd");
    expect(periodoSlug(6, "ytd")).toBe("06");
    expect(periodoSlug(null, "12m")).toBe("12m");
  });
});

describe("la API no acepta cualquier período", () => {
  it("solo los cuatro", () => {
    for (const p of ["ytd", "6m", "12m", "anio_pasado"]) expect(esProductosPeriodo(p)).toBe(true);
    for (const p of ["", "3m", "YTD", "ayer", "24m", "anio-pasado"]) expect(esProductosPeriodo(p)).toBe(false);
  });
});

/** Días entre dos fechas ISO, inclusive. */
function dias(desde: string, hasta: string): number {
  return Math.round((Date.parse(hasta) - Date.parse(desde)) / 86_400_000) + 1;
}

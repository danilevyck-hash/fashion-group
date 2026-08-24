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
// El criterio de "la misma ventana un año antes" vive en Multifashion y se
// REUSA; el test lo importa de ahí para no reescribirlo.
import { unAnioAntes } from "@/lib/multifashion/productos-ranking";

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
    expect(productosRange(2026, 6, TARDE)).toEqual({ desde: "2026-06-01", hasta: "2026-06-30" });
    expect(productosRange(2024, 2, TARDE)).toEqual({ desde: "2024-02-01", hasta: "2024-02-29" });
    expect(productosRange(2026, 2, TARDE)).toEqual({ desde: "2026-02-01", hasta: "2026-02-28" });
  });
  it("un año cerrado va entero", () => {
    expect(productosRange(2024, null, TARDE)).toEqual({ desde: "2024-01-01", hasta: "2024-12-31" });
  });
  it("el año en curso llega hasta hoy", () => {
    expect(productosRange(2026, null, TARDE)).toEqual({ desde: "2026-01-01", hasta: "2026-08-24" });
  });
  it("`ahora` es solo un parámetro con default: el cálculo es el mismo de siempre", () => {
    // Sin el 3er argumento tiene que dar EXACTAMENTE lo mismo que con el reloj
    // de verdad — es el camino que la pantalla venía usando.
    const reloj = new Date();
    expect(productosRange(2026, null)).toEqual(productosRange(2026, null, reloj));
    expect(productosRange(2026, 6)).toEqual(productosRange(2026, 6, reloj));
  });
});

describe("los cuatro períodos que pidió Daniel", () => {
  it("año en curso = lo mismo que antes (no se movió una fecha)", () => {
    expect(productosRangoPeriodo("ytd", 2026, null, TARDE)).toEqual(productosRange(2026, null, TARDE));
    expect(productosRangoPeriodo("ytd", 2026, 6, TARDE)).toEqual(productosRange(2026, 6, TARDE));
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
  it("mes suelto: el mismo mes, un año antes (lo que ya hacía la pantalla) — INTACTO", () => {
    expect(productosRangoComparativo("ytd", 2026, 6, TARDE)).toEqual(productosRange(2025, 6, TARDE));
    // Un mes cerrado ya compara entero contra entero: acá no se recorta nada.
    expect(productosRangoComparativo("ytd", 2026, 2, TARDE)).toEqual({
      desde: "2025-02-01",
      hasta: "2025-02-28",
    });
    // 🩸 Febrero de 2029 (28 días) contra el de 2028 (BISIESTO, 29): el mes
    // suelto va contra el mes ENTERO del año pasado, con sus 29 días. Si a este
    // camino se le colara el recorte del año en curso, el 29 se perdería y el
    // Δ de un mes cerrado —un período que este cambio NO toca— se movería.
    expect(productosRangoComparativo("ytd", 2029, 2, TARDE)).toEqual({
      desde: "2028-02-01",
      hasta: "2028-02-29",
    });
  });

  it("🩸 año en curso: el MISMO TRAMO del año pasado, no el año entero", () => {
    // 8 meses de 2026 contra los 12 de 2025 daba caídas que eran del calendario:
    // Women-T-Shirts S/S salía −38% en «Año en curso» y +29% / +15% en los
    // períodos que sí comparan parejo, en la misma pantalla.
    expect(productosRangoComparativo("ytd", 2026, null, TARDE)).toEqual({
      desde: "2025-01-01",
      hasta: "2025-08-24",
    });
  });

  it("año en curso: el comparativo termina EXACTAMENTE donde termina el período, un año antes", () => {
    for (const ahora of [TARDE, new Date("2026-01-01T18:00:00Z"), new Date("2026-12-31T18:00:00Z")]) {
      const act = productosRangoPeriodo("ytd", 2026, null, ahora);
      const cmp = productosRangoComparativo("ytd", 2026, null, ahora);
      expect(cmp.desde).toBe("2025-01-01");
      expect(cmp.hasta).toBe(unAnioAntes(act.hasta));
      // Mismo largo de ventana, con la tolerancia de 1 día del 29-feb.
      expect(Math.abs(dias(cmp.desde, cmp.hasta) - dias(act.desde, act.hasta))).toBeLessThanOrEqual(1);
    }
  });

  it("un año YA CERRADO sigue comparándose entero contra entero", () => {
    // Sin caso especial: el `hasta` de 2024 es el 31-dic y un año antes es el
    // 31-dic de 2023. Es lo mismo que devolvía antes del arreglo.
    expect(productosRangoComparativo("ytd", 2024, null, TARDE)).toEqual({
      desde: "2023-01-01",
      hasta: "2023-12-31",
    });
  });

  it("el 29-feb del año en curso cae en el 28, no en el 1-mar", () => {
    const bisiesto = new Date("2028-02-29T18:00:00Z");
    expect(productosRangoComparativo("ytd", 2028, null, bisiesto)).toEqual({
      desde: "2027-01-01",
      hasta: "2027-02-28",
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

// ─────────────────────────────────────────────────────────────────────────────
// UN SOLO CRITERIO DE "LA MISMA VENTANA UN AÑO ANTES", NO TRES.
//
// El repo ya lo resolvía en `rangoComparativo` de Multifashion. Este módulo lo
// REUSA (`unAnioAntes`); si alguien se escribe su propia copia, los dos
// criterios empiezan a divergir el 29-feb y nadie se entera hasta 2028.
//
// ⚠️ EL BARRIDO BORRA LOS COMENTARIOS PRIMERO: sin eso, la explicación de acá
// arriba —que nombra la función— haría "pasar" el barrido sin haber mirado el
// código. Un candado que se satisface con su propia documentación no es un
// candado.
// ─────────────────────────────────────────────────────────────────────────────
describe("el criterio de comparación vive en UN solo lugar", () => {
  const SRC = "src/lib/ventas/productos.ts";

  /** Código sin comentarios de bloque ni de línea. */
  function sinComentarios(txt: string): string {
    return txt.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");
  }

  it("productos.ts IMPORTA unAnioAntes en vez de redefinirlo", async () => {
    const fs = await import("node:fs");
    const codigo = sinComentarios(fs.readFileSync(SRC, "utf8"));
    expect(codigo).toMatch(/import\s*\{[^}]*\bunAnioAntes\b[^}]*\}\s*from\s*"@\/lib\/multifashion\/productos-ranking"/);
    // Ni una definición propia: ni función, ni const, ni método.
    expect(codigo).not.toMatch(/(function|const|let|var)\s+unAnioAntes\b/);
  });

  it("el comparativo no clava el 31-dic: sale del fin del período, no de una constante", async () => {
    const fs = await import("node:fs");
    const codigo = sinComentarios(fs.readFileSync(SRC, "utf8"));
    const cuerpo = /export function productosRangoComparativo[\s\S]*?\n}/.exec(codigo)?.[0] ?? "";
    expect(cuerpo).not.toBe("");
    // El 31-dic es legítimo en `productosRange` (fin del año calendario) y en
    // «Año pasado» (un año cerrado ENTERO). Acá adentro, no: el fin del
    // comparativo se deriva del fin del período, que es de lo que se trata todo.
    expect(cuerpo).not.toMatch(/12-31/);
  });

  it("el comparativo del año en curso no recalcula 'hoy' por su cuenta", async () => {
    const fs = await import("node:fs");
    const codigo = sinComentarios(fs.readFileSync(SRC, "utf8"));
    const cuerpo = /export function productosRangoComparativo[\s\S]*?\n}/.exec(codigo)?.[0] ?? "";
    expect(cuerpo).not.toBe("");
    // Las dos puntas de la comparación salen del MISMO instante: un `new Date()`
    // acá adentro las separa un día entre las 7 p.m. y la medianoche de Panamá.
    expect(cuerpo).not.toMatch(/new Date\(\)/);
    expect(cuerpo).not.toMatch(/Date\.now\(\)/);
  });
});

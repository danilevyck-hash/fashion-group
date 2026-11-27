// La tarjeta «mes a mes» en Multifashion, Comisiones, Artículos y el drill-down
// del Resumen (27-nov-2026, `GESTOS_IPHONE_2026_11`).
import { describe, expect, it } from "vitest";
import { anchoDeBarras, notaDelMesEnCurso, mesEnCursoDelCorte, urlClientesDelMes } from "@/lib/ventas/mes-a-mes";
import { cambioDeVendedora, vendedoraMesAMes } from "@/lib/multifashion/vendedora-mes-a-mes";
import { comisionMesAMes } from "@/lib/comisiones/mes-a-mes";
import { articuloMesAMes, ayerDe, cambioDeArticulo } from "@/lib/ventas/articulo-mes-a-mes";
import { periodoDesdeUrl } from "@/lib/ventas/periodo";

describe("la barrita y el mes en curso", () => {
  it("proporcional al mayor; negativos y ceros sin barra", () => {
    expect(anchoDeBarras([50, 100, 0, -20])).toEqual([50, 100, 0, 0]);
    expect(anchoDeBarras([0, 0])).toEqual([0, 0]);
  });
  it("el mes en curso solo si el corte cae en el año", () => {
    expect(mesEnCursoDelCorte(2026, "2026-11-26")).toBe(11);
    expect(mesEnCursoDelCorte(2025, "2026-11-26")).toBeNull();
    expect(notaDelMesEnCurso(2026, "2026-11-26")).toBe("Nov va al 26 nov y se compara con los mismos días de 2025.");
    expect(notaDelMesEnCurso(2026, "2026-11-30")).toBeNull();
  });
});

describe("tocar un mes → Ventas › Clientes con los filtros que YA existen", () => {
  it("mes cerrado: el mes entero; mes en curso: hasta el corte", () => {
    expect(urlClientesDelMes(2026, 5, "vistana", "2026-11-26")).toBe("/ventas?tab=clientes&periodo=2026-05-01_2026-05-31&empresa=vistana");
    expect(urlClientesDelMes(2026, 11, "vistana", "2026-11-26")).toBe("/ventas?tab=clientes&periodo=2026-11-01_2026-11-26&empresa=vistana");
    expect(urlClientesDelMes(2024, 2, "fwear", null)).toContain("periodo=2024-02-01_2024-02-29");
  });
  it("el período del enlace lo entiende el selector de siempre (rango)", () => {
    const u = new URL(`https://x${urlClientesDelMes(2026, 5, "vistana", null)}`);
    expect(periodoDesdeUrl(u.searchParams.get("periodo"))).toEqual({ tipo: "rango", desde: "2026-05-01", hasta: "2026-05-31" });
  });
});

describe("Multifashion › Vendedoras", () => {
  const f = (fecha: string, sub: number, can = "Jailine Quispe", ven = "Jailine Quispe") => ({ fecha, subtotal: sub, vendedor: ven, vendedor_canonico: can });
  it("mes a mes por su nombre EXACTO, sin DEFAULT; el mes en curso contra los MISMOS días", () => {
    const filas = [
      f("2025-01-10", 100), f("2026-01-05", 150),
      f("2025-11-20", 40), f("2025-11-28", 999), f("2026-11-03", 80),
      f("2026-01-06", 500, "Jailine"), // otra persona
      f("2026-01-07", 500, "Jailine Quispe", "DEFAULT"),
    ];
    const r = vendedoraMesAMes(filas, "Jailine Quispe", 2026, "2026-11-26", new Date("2026-11-27T15:00:00Z"));
    expect(r.meses[0]).toEqual({ mes: 1, actual: 150, previo: 100 });
    expect(r.meses[10]).toEqual({ mes: 11, actual: 80, previo: 40 });
    expect(r.meses).toHaveLength(11);
    expect(r.total).toEqual({ actual: 230, previo: 140 });
  });
  it("«Nueva» sin venta el año pasado; «—» con base menor de $100; el % como la fila", () => {
    expect(cambioDeVendedora(500, 0).texto).toBe("Nueva");
    expect(cambioDeVendedora(500, 99).texto).toBe("—");
    expect(cambioDeVendedora(60, 100)).toEqual({ texto: "▼ 40 %", tono: "dn" });
    expect(cambioDeVendedora(103, 100)).toEqual({ texto: "= 3 %", tono: "fl" });
  });
});

describe("Comisiones", () => {
  it("cada mes el neto del vendedor; sin fila = $0; sin flechas", () => {
    const r = comisionMesAMes({ por_mes: [
      { mes: 1, vendedores: [{ vendedor: "EDWIN", comision_total: 1132.36 }] },
      { mes: 2, vendedores: [] },
    ] }, "EDWIN");
    expect(r).toEqual([{ mes: 1, actual: 1132.36, previo: null }, { mes: 2, actual: 0, previo: null }]);
  });
});

describe("Consulta de artículos", () => {
  const serie = [
    { mes: "2025-01", unidades: 10, venta: 0 }, { mes: "2025-11", unidades: 100, venta: 0 },
    { mes: "2026-01", unidades: 0, venta: 0 }, { mes: "2026-11", unidades: 30, venta: 0 },
  ];
  it("hasta AYER; el mes en curso contra los MISMOS días con el día a día", () => {
    expect(ayerDe("2026-11-27")).toBe("2026-11-26");
    const dias = [{ fecha: "2025-11-26", unidades: 7 }, { fecha: "2025-11-27", unidades: 93 }];
    const r = articuloMesAMes(serie, dias, "2026-11-27");
    expect(r.meses[0]).toEqual({ mes: 1, actual: 0, previo: 10 });
    expect(r.meses[10]).toEqual({ mes: 11, actual: 30, previo: 7 });
    expect(r.total).toEqual({ actual: 30, previo: 17 });
  });
  it("sin el día a día el mes en curso no se compara («—»), nunca un % inventado", () => {
    const r = articuloMesAMes(serie, null, "2026-11-27");
    expect(r.meses[10].previo).toBeNull();
    expect(r.total.previo).toBeNull();
    expect(cambioDeArticulo(30, null).texto).toBe("—");
    expect(cambioDeArticulo(0, 10).texto).toBe("▼ −100%");
  });
});

describe("Multifashion: bajo 1 % con un decimal en la tarjeta", () => {
  it("+0.5 % y −0.3 %", async () => {
    const { cambioDeVendedora } = await import("@/lib/multifashion/vendedora-mes-a-mes");
    expect(cambioDeVendedora(1004.9, 1000).texto).toBe("= 0.5 %");
    expect(cambioDeVendedora(997, 1000).texto).toBe("= 0.3 %");
    expect(cambioDeVendedora(1000, 1000).texto).toBe("= 0 %");
    expect(cambioDeVendedora(1290, 1000).texto).toBe("▲ 29 %");
  });
});

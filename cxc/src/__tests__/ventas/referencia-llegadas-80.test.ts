// ─────────────────────────────────────────────────────────────────────────────
// 🔴 CANDADO — «EL 80 % SE VENDIÓ EN N SEMANAS» (25-sep-2026)
//
// La regla vive en `lib/ventas/referencia-llegadas.ts` y es una LECTURA APARTE:
// no cambia Compré, Vendí, Stock ni el cuadre. Acá se congela contra el caso
// real que Daniel mira, `NB2570` de Vistana, con los datos de producción del
// 25-sep-2026 guardados en `fixtures/referencia-nb2570.json`
// (54 líneas de ingreso, 363 renglones de venta, 26 colores).
//
// Los cuatro números del mockup aprobado:
//   · MODELO   — nov 2025 · 360 pzas · el 80 % en **21 sem**
//   · MODELO   — ago 2026 · 360 pzas · **«—»**, queda **100 %**
//   · COLOR001 — la última (feb 2026) **«—»**, queda **100 %**
//   · COLOR001 — la anterior que SÍ se vendió (abr 2025) · **52 sem**
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import {
  agruparLlegadasPorDia,
  medirLlegadas,
  semanasEntre,
  stockPrevio,
  sumarDias,
  ultimaYVara,
} from "@/lib/ventas/referencia-llegadas";
import fixture from "../fixtures/referencia-nb2570.json";

const modelo = {
  llegadas: fixture.modelo_llegadas,
  dias: fixture.modelo_dias,
  stock: fixture.modelo_stock,
};
const color001 = {
  llegadas: fixture.color001_llegadas,
  dias: fixture.color001_dias,
  stock: fixture.color001_stock,
};

describe("la fila de la bodega — lo que había antes de la primera llegada", () => {
  it("🔴 stockPrevio = comprado − stock − vendido, nunca negativo", () => {
    // NB2570: 5.856 − 888 − 4.580 = 388
    expect(stockPrevio(5856, 4580, 888)).toBe(388);
    // Sin foto de bodega no se puede correr la fila: cero.
    expect(stockPrevio(5856, 4580, null)).toBe(0);
    // Si vendido + stock pasa lo comprado, el hueco es un ajuste: cero, no un
    // número con signo inventado.
    expect(stockPrevio(100, 90, 50)).toBe(0);
  });

  it("las semanas se cuentan sin husos ni horario de verano", () => {
    expect(semanasEntre("2025-11-16", "2026-04-12")).toBe(21);
    expect(semanasEntre("2026-01-01", "2026-01-01")).toBe(0);
  });
});

describe("NB2570 — el MODELO (26 colores, 27 llegadas)", () => {
  const medidas = medirLlegadas(modelo.llegadas, modelo.dias, modelo.stock);

  it("son 27 llegadas y suman las 5.856 piezas de «Compré»", () => {
    expect(medidas).toHaveLength(27);
    expect(medidas.reduce((s, l) => s + l.unidades, 0)).toBe(5856);
    expect(medidas[0].fecha).toBe("2022-10-25");
  });

  it("🔴 la llegada de nov 2025 (360 pzas) hizo el 80 % en 21 semanas", () => {
    const nov = medidas.find((l) => l.fecha === "2025-11-16")!;
    expect(nov.unidades).toBe(360);
    expect(nov.semanas).toBe(21);
    expect(nov.quedaPct).toBe(0);
    expect(nov.vendida).toBe(true);
  });

  it("🔴 la última (ago 2026, 360 pzas) va en «—» y queda 100 %", () => {
    const { ultima, vara } = ultimaYVara(medidas);
    expect(ultima!.fecha).toBe("2026-08-04");
    expect(ultima!.unidades).toBe(360);
    expect(ultima!.semanas).toBeNull();
    expect(ultima!.quedaPct).toBe(100);
    // 🔴 La vara NO es «la de antes» a secas: es la última que SÍ completó su
    // 80 %. Las de feb y abr de 2026 tampoco se movieron.
    expect(vara!.fecha).toBe("2025-11-16");
    expect(vara!.semanas).toBe(21);
  });

  it("las llegadas del modelo son las de sus colores, juntadas por DÍA", () => {
    const juntas = agruparLlegadasPorDia(
      fixture.ingresos.map((r) => ({ fecha: r.fecha, unidades: Number(r.cantidad) })),
    );
    expect(juntas).toEqual(modelo.llegadas);
    // 54 líneas de Switch → 27 llegadas.
    expect(fixture.ingresos).toHaveLength(54);
  });

  it("los días del modelo son la suma de los días de sus colores", () => {
    const unidos = sumarDias([color001.dias, []]);
    expect(unidos).toEqual(color001.dias);
  });
});

describe("NB2570001 — el COLOR (7 llegadas)", () => {
  const medidas = medirLlegadas(color001.llegadas, color001.dias, color001.stock);
  const { ultima, vara } = ultimaYVara(medidas);

  it("🔴 la última (feb 2026, 180 pzas) va en «—» y queda 100 %", () => {
    expect(ultima!.fecha).toBe("2026-02-19");
    expect(ultima!.unidades).toBe(180);
    expect(ultima!.semanas).toBeNull();
    expect(ultima!.quedaPct).toBe(100);
  });

  it("🔴 la anterior que SÍ se vendió (abr 2025) tardó 52 semanas", () => {
    expect(vara!.fecha).toBe("2025-04-09");
    expect(vara!.unidades).toBe(240);
    expect(vara!.semanas).toBe(52);
  });

  it("⚠️ no se le atribuye ni una venta a ninguna llegada: los totales no se tocan", () => {
    // La medición NO altera lo comprado ni lo vendido: son los mismos números
    // de `compras.ts`. Es la línea que separa esto del FIFO prohibido.
    expect(medidas.reduce((s, l) => s + l.unidades, 0)).toBe(935);
    expect(color001.dias.reduce((s, d) => s + d.unidades, 0)).toBe(552);
    expect(color001.stock).toBe(345);
  });
});

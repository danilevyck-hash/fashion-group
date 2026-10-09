// ─────────────────────────────────────────────────────────────────────────────
// 🔴 CANDADO — LA GRÁFICA DE VENTAS DIARIAS (9-oct-2026, propuesta).
//
// Detrás de `MULTIFASHION_GRAFICA_2026_10` (lib/multifashion/grafica-mes.ts),
// SEPARADO del rediseño de Multifashion y que NACE APAGADO. Congela:
//   1. El interruptor en `false` hasta el «sí» de Daniel.
//   2. Los montos no se recalculan: cada barra lleva el monto y los tiquetes
//      del detalle, el promedio es la venta de los días cerrados ÷ esos días.
//   3. Un día en $0: «sin-venta» con la MISMA regla del aviso (`diasSinVenta`);
//      domingo o feriado, «cerrado»; sin feriados leídos no se acusa.
//   4. El último día cerrado se destaca y el siguiente es «hoy».
//   5. En el celular el eje lleva 1 · 8 · 15 · 22 · 29 · Hoy, sin encimarse.
//   6. Sin el interruptor se dibuja la gráfica de hoy (computadora y celular).
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import {
  MULTIFASHION_GRAFICA_2026_10, etiquetaEnCelular, graficaDelMes, lineaDeLaGrafica,
} from "@/lib/multifashion/grafica-mes";
import { diasSinVenta } from "@/lib/multifashion/resumen-minimo";

const leer = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8");

// Julio 2026: el 5 es domingo, el 6 lunes; feriado inventado el 21.
const julio = Array.from({ length: 31 }, (_, i) => {
  const dia = i + 1;
  const cero = dia === 5 || dia === 6 || dia === 21;
  return { dia, ventas: cero ? 0 : 1000 + dia * 10, n_tickets: cero ? 0 : 20 };
});

describe("el interruptor", () => {
  it("nace apagado y es OTRO que el del rediseño", () => {
    expect(MULTIFASHION_GRAFICA_2026_10).toBe(false);
    expect(leer("src/lib/multifashion/grafica-mes.ts")).not.toMatch(/MULTIFASHION_APPLE_2026_10/);
  });
});

describe("los días", () => {
  const g = graficaDelMes({ dias: julio, year: 2026, mes: 7, esMesActual: false, diaActual: 31, feriados: ["2026-07-21"] });

  it("los montos son los del detalle y el promedio es la venta ÷ los días cerrados", () => {
    expect(g.dias.map((d) => d.ventas)).toEqual(julio.map((d) => d.ventas));
    const suma = julio.reduce((s, d) => s + d.ventas, 0);
    expect(g.promedio).toBeCloseTo(suma / 31, 6);
    expect(g.dias.find((d) => d.ventas === Math.max(...julio.map((x) => x.ventas)))?.alto).toBe(1);
  });

  it("un día en $0: ámbar si el aviso lo acusa; domingo y feriado, cerrados", () => {
    expect(g.dias[4].estado).toBe("cerrado"); // dom 5
    expect(g.dias[5].estado).toBe("sin-venta"); // lun 6
    expect(g.dias[20].estado).toBe("cerrado"); // feriado 21
    const aviso = diasSinVenta({ dias: julio, isMesActual: false, diaActual: 31, year: 2026, mes: 7, feriados: ["2026-07-21"] });
    expect(g.dias.filter((d) => d.estado === "sin-venta").map((d) => d.dia)).toEqual(aviso.dias);
  });

  it("sin feriados leídos no se acusa a nadie", () => {
    const sin = graficaDelMes({ dias: julio, year: 2026, mes: 7, esMesActual: false, diaActual: 31, feriados: null });
    expect(sin.dias.some((d) => d.estado === "sin-venta")).toBe(false);
  });

  it("al tocar, el día y su monto; sin tocar, el promedio", () => {
    expect(lineaDeLaGrafica(g, 2026, 7, 6)).toMatch(/· sin ventas y no es feriado$/);
    expect(lineaDeLaGrafica(g, 2026, 7, 21)).toMatch(/· sin ventas · feriado$/);
    expect(lineaDeLaGrafica(g, 2026, 7, null)).toMatch(/^Promedio diario \$[\d,]+ · 31 días$/);
  });
});

describe("el mes en curso", () => {
  const g = graficaDelMes({ dias: julio, year: 2026, mes: 7, esMesActual: true, diaActual: 8, feriados: [] });

  it("el último día cerrado se destaca, el siguiente es «hoy» y el resto futuro", () => {
    expect(g.dias[7].estado).toBe("ultimo");
    expect(g.dias[8].estado).toBe("hoy");
    expect(g.dias[9].estado).toBe("futuro");
    expect(g.dias[20].alto).toBe(0);
    expect(g.diasCerrados).toBe(8);
  });

  it("en el celular: 1 · 15 · 22 · 29 · Hoy (el 8, pegado a Hoy, se calla)", () => {
    expect(g.dias.filter((d) => etiquetaEnCelular(d, g)).map((d) => d.dia)).toEqual([1, 9, 15, 22, 29]);
  });
});

describe("sin el interruptor, la gráfica de hoy", () => {
  it("computadora y celular la condicionan a `MULTIFASHION_GRAFICA_2026_10`", () => {
    expect(leer("src/components/multifashion/MultifashionResumenView.tsx")).toMatch(/hasData && MULTIFASHION_GRAFICA_2026_10 \? \(/);
    expect(leer("src/components/multifashion/celular/InicioCelular.tsx")).toMatch(/\{MULTIFASHION_GRAFICA_2026_10 \? \(/);
  });
});

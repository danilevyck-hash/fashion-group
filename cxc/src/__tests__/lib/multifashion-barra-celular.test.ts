/**
 * 🔴 CANDADO — MULTIFASHION EN EL CELULAR CON EL ENCABEZADO COMPARTIDO
 * (`MULTIFASHION_BARRA_2026_10`, 11-oct-2026).
 *
 * La regla: en el Resumen del celular el título es la ÚNICA navegación (sin los
 * cuatro renglones) y no hay línea gris de hábitos; su dibujo se prueba en
 * `multifashion-celular.test.tsx` (`soloElMes`).
 * Lo que no debe cambiar: los nombres de las secciones son los de las pestañas,
 * la línea de hoy lleva los MISMOS dos montos que la línea gris de antes, la
 * frescura sigue siendo `LineaDeFrescura`, y apagado queda el encabezado de antes.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { lineaDeHoy, montoCorto, seccionesDeLaBarra, subtituloHoyAyer } from "@/lib/multifashion/celular";
import { PESTANAS_MULTIFASHION } from "@/lib/multifashion/pestanas";
import {
  TITULO_HISTORICO, filasDelHistorico, historicoDeVentas, mesesDelHistorico, rangoDelHistorico, type MesHistorico,
} from "@/lib/multifashion/historico";

const shell = fs.readFileSync(path.join(process.cwd(), "src/app/multifashion/MultifashionShell.tsx"), "utf8");

describe("Multifashion › celular › encabezado compartido", () => {
  it("el Resumen sin renglones ni hábitos cuelga del MISMO interruptor (apagado = como antes)", () => {
    expect(shell).toContain("soloElMes: barra");
    const inicio = fs.readFileSync(path.join(process.cwd(), "src/components/multifashion/celular/InicioCelular.tsx"), "utf8");
    expect(inicio).toContain("soloElMes = false");
    expect(inicio).toMatch(/\{!soloElMes && \(\s*<ul data-celular="renglones"/);
    expect(inicio).toContain("const habitos = !soloElMes &&");
    // En su lugar, «Últimos 12 meses»: solo con el interruptor.
    expect(inicio).toContain("{soloElMes && <HistoricoCelular />}");
  });

  it("el título ofrece Resumen y las cuatro secciones, con los nombres de las pestañas", () => {
    expect(seccionesDeLaBarra(PESTANAS_MULTIFASHION, 2026).map((s) => s.label))
      .toEqual(["Resumen", "Año 2026", "Vendedoras", "Productos", "Clientes"]);
    expect(seccionesDeLaBarra(PESTANAS_MULTIFASHION, 2026).filter((s) => s.value !== "anio").map((s) => s.value))
      .toEqual(PESTANAS_MULTIFASHION.map((p) => p.id));
  });

  it("🔴 la línea de hoy dice los mismos montos que la línea gris de antes", () => {
    const hoy = { hayVentas: true, ventas: 1866.4, ayer: 1795.2 };
    const l = lineaDeHoy(hoy)!;
    expect(l).toEqual({ hoy: "$1,866", ayer: "ayer $1,795" });
    expect(`hoy ${l.hoy} · ${l.ayer}`).toBe(subtituloHoyAyer({ dias: 11, hoy }));
    expect(l.hoy).toBe(montoCorto(hoy.ventas));
  });

  it("sin ventas no se escribe $0, y fuera del mes de hoy no hay línea", () => {
    expect(lineaDeHoy({ hayVentas: false, ventas: 0, ayer: 1795 })!.hoy).toBe("sin ventas todavía");
    expect(lineaDeHoy(null)).toBeNull();
    expect(lineaDeHoy(undefined)).toBeNull();
  });

  it("el encabezado es la barra compartida, detrás del interruptor, y el de antes sigue para apagado", () => {
    expect(shell).toContain("useBarraCelular(MULTIFASHION_BARRA_2026_10)");
    expect(shell).toMatch(/\{barra && \(\s*<BarraDeControles/);
    expect(shell).toContain("{MULTIFASHION_CELULAR && !barra && (");
    // La frescura no se dibuja a mano: sigue siendo el componente común, uno solo en el celular.
    expect(shell.match(/<LineaDeFrescura\s+forma="celular"/g)).toHaveLength(1);
  });
});

describe("Multifashion › celular › «Últimos 12 meses»", () => {
  const HOY = "2026-10-11"; // domingo
  const mes = (anio: number, m: number, dias: [number, number][], horas: [number, number][] = []): MesHistorico => ({
    anio, mes: m, dias: dias.map(([dia, ventas]) => ({ dia, ventas })), horas: horas.map(([hora, ventas]) => ({ hora, ventas })),
  });
  const MESES = [
    // sáb 5 y sáb 12 sep; dom 6 sep (uno en $0 no es divisor: dom 13)
    mes(2026, 9, [[5, 3000], [12, 2000], [6, 4000], [13, 0]], [[15, 900], [17, 500]]),
    // sáb 3 oct (récord), dom 4 oct, y HOY dom 11 con una venta enorme que no debe entrar
    mes(2026, 10, [[3, 7104], [4, 5000], [11, 99999]], [[15, 300], [17, 600]]),
  ];

  it("la ventana se nombra, son 12 meses y termina AYER", () => {
    expect(TITULO_HISTORICO).toBe("Últimos 12 meses");
    const v = mesesDelHistorico(HOY);
    expect(v).toHaveLength(12);
    expect(v[0]).toEqual({ anio: 2025, mes: 11 });
    expect(v[11]).toEqual({ anio: 2026, mes: 10 });
    const h = historicoDeVentas(MESES, HOY);
    expect([h.desde, h.hasta]).toEqual(["2025-11-01", "2026-10-10"]);
    expect(rangoDelHistorico(h)).toBe("nov 2025 – 10 oct 2026");
  });

  it("🔴 HOY no entra, y el promedio es por día CON venta", () => {
    const h = historicoDeVentas(MESES, HOY);
    // Domingo: (4000 + 5000) / 2 — sin el $0 del 13 ni los $99,999 de hoy.
    expect(h.diaSemana).toEqual({ dow: 0, promedio: 4500, dias: 2 });
    expect(h.mejorDia).toEqual({ fecha: "2026-10-03", ventas: 7104 });
    expect(h.horaPico).toBe(15); // 900 + 300 contra 500 + 600
  });

  it("los tres rótulos, con su valor; lo que no se puede calcular no se dibuja", () => {
    expect(filasDelHistorico(historicoDeVentas(MESES, HOY), "3–4 pm")).toEqual([
      { rotulo: "Día de mayor venta", valor: "Domingo · promedio $4,500" },
      { rotulo: "Hora de mayor venta", valor: "3–4 pm" },
      { rotulo: "Venta diaria más alta", valor: "$7,104 · 3 oct 2026" },
    ]);
    expect(filasDelHistorico(historicoDeVentas([], HOY), null)).toEqual([]);
    expect(filasDelHistorico(historicoDeVentas([mes(2026, 10, [[11, 500]])], HOY), null)).toEqual([]);
  });
});


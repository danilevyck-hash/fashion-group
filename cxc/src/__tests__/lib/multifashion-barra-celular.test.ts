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
import {
  contraAlCorte, lineaDeHoy, montoCorto, seccionesDeLaBarra, subtituloHoyAyer, ventaDeHoyParaElMes,
} from "@/lib/multifashion/celular";
import { PESTANAS_MULTIFASHION } from "@/lib/multifashion/pestanas";
import {
  TITULO_HISTORICO, historicoDeVentas, lineaDelHistorico, mesesDelHistorico, type MesHistorico,
} from "@/lib/multifashion/historico";

const shell = fs.readFileSync(path.join(process.cwd(), "src/app/multifashion/MultifashionShell.tsx"), "utf8");

describe("Multifashion › celular › encabezado compartido", () => {
  it("el Resumen sin renglones ni hábitos cuelga del MISMO interruptor (apagado = como antes)", () => {
    expect(shell).toContain("soloElMes: barra");
    const inicio = fs.readFileSync(path.join(process.cwd(), "src/components/multifashion/celular/InicioCelular.tsx"), "utf8");
    expect(inicio).toContain("soloElMes = false");
    expect(inicio).toMatch(/\{!soloElMes && \(\s*<ul data-celular="renglones"/);
    expect(inicio).toContain("const habitos = !soloElMes &&");
    // La gráfica alta (240 px) solo la pide el celular con el interruptor; sin la prop mide lo de siempre.
    expect(inicio).toContain("alta={soloElMes}");
    const grafica = fs.readFileSync(path.join(process.cwd(), "src/components/multifashion/GraficaDelMes.tsx"), "utf8");
    expect(grafica).toContain('alta = false');
    expect(grafica).toContain('alta ? "h-[240px]" : "h-[120px]"');
    expect(grafica).toContain("sm:h-[180px]");
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
  });

  it("🔴 HOY no entra, y el promedio es por día CON venta", () => {
    const h = historicoDeVentas(MESES, HOY);
    // Domingo: (4000 + 5000) / 2 — sin el $0 del 13 ni los $99,999 de hoy.
    expect(h.diaSemana).toEqual({ dow: 0, promedio: 4500, dias: 2 });
    expect(h.mejorDia).toEqual({ fecha: "2026-10-03", ventas: 7104 });
    expect(h.horaPico).toBe(15); // 900 + 300 contra 500 + 600
  });

  it("UNA línea que nombra la ventana: día y hora de mayor venta; lo que no se puede calcular se omite", () => {
    const h = historicoDeVentas(MESES, HOY);
    expect(lineaDelHistorico(h, "3–4 pm")).toBe("Últimos 12 meses · mayor venta: domingo y 3–4 pm");
    expect(lineaDelHistorico(h, null)).toBe("Últimos 12 meses · mayor venta: domingo");
    expect(lineaDelHistorico(historicoDeVentas([], HOY), "3–4 pm")).toBe("Últimos 12 meses · mayor venta: 3–4 pm");
    // Sin ningún dato no hay línea (ni con solo la venta de HOY).
    expect(lineaDelHistorico(historicoDeVentas([], HOY), null)).toBeNull();
    expect(lineaDelHistorico(historicoDeVentas([mes(2026, 10, [[11, 500]])], HOY), null)).toBeNull();
  });

  it("es una línea gris sin caja, y la frescura va en el renglón de hoy con el componente común", () => {
    const inicio = fs.readFileSync(path.join(process.cwd(), "src/components/multifashion/celular/InicioCelular.tsx"), "utf8");
    const pieza = inicio.slice(inicio.indexOf("function HistoricoCelular"), inicio.indexOf("function RenglonFila"));
    expect(pieza).toMatch(/<p data-celular="historico" className="[^"]*text-sm text-gray-500/);
    expect(pieza).not.toMatch(/border|rounded|uppercase|<ul|<li/);
    const renglon = shell.slice(shell.indexOf('data-celular="hoy-y-frescura"'), shell.indexOf("{MULTIFASHION_CELULAR && !barra && ("));
    expect(renglon).toContain("flex flex-wrap"); // si no cabe, baja: nunca se corta
    expect(renglon).toContain('data-celular="hoy"');
    expect(renglon).toContain("{frescuraCel}");
    expect(renglon).not.toMatch(/truncate|overflow-hidden/);
  });
});

describe("Multifashion › celular › el número del mes con la venta de hoy", () => {
  const base = { esMesActual: true, anio: 2026, mes: 10, diaActual: 10 };
  const hoy = { fecha: "2026-10-11", hayVentas: true, ventas: 2140.25 };

  it("🔴 número grande = días completos + la venta de hoy, cuando hoy existe y es el día que sigue al corte", () => {
    expect(ventaDeHoyParaElMes({ ...base, hoy })).toBe(2140.25);
    expect(montoCorto(26616.37 + ventaDeHoyParaElMes({ ...base, hoy })!)).toBe("$28,757");
  });

  it("sin dato, sin ventas, en otro mes o con el día corrido, queda el número de siempre: nunca se adivina", () => {
    expect(ventaDeHoyParaElMes({ ...base, hoy: undefined })).toBeNull();
    expect(ventaDeHoyParaElMes({ ...base, hoy: { ...hoy, hayVentas: false, ventas: 0 } })).toBeNull();
    expect(ventaDeHoyParaElMes({ ...base, esMesActual: false, hoy })).toBeNull();
    // El detalle ya cortó en el 11 (pasó la medianoche) y «hoy» sigue siendo el 11: no se suma dos veces.
    expect(ventaDeHoyParaElMes({ ...base, diaActual: 11, hoy })).toBeNull();
    expect(ventaDeHoyParaElMes({ ...base, hoy: { ...hoy, fecha: "2026-10-12" } })).toBeNull();
  });

  it("el %, la proyección y el promedio no se recalculan; el % dice hasta cuándo", () => {
    expect(contraAlCorte(2026, 10, 10)).toBe("al 10 oct, contra 2025");
    const inicio = fs.readFileSync(path.join(process.cwd(), "src/components/multifashion/celular/InicioCelular.tsx"), "utf8");
    // Las tres cuentas siguen saliendo de `totales` (días completos), sin `ventaHoy`.
    expect(inicio).toContain("variacionPct(totales.ventas, data.yoy.ventas)");
    expect(inicio).toContain("data.is_mes_actual ? totales.proyeccion_cierre : null");
    expect(inicio).toContain("{montoCorto(totales.ventas + (ventaHoy ?? 0))}");
    const grafica = fs.readFileSync(path.join(process.cwd(), "src/components/multifashion/GraficaDelMes.tsx"), "utf8");
    // La gráfica recibe los MISMOS días: el promedio no ve la venta de hoy.
    expect(grafica).toContain("graficaDelMes({ dias, year, mes, esMesActual, diaActual, feriados })");
    // Apagado (sin `soloElMes`) no se pide ni se suma nada.
    const vista = fs.readFileSync(path.join(process.cwd(), "src/components/multifashion/MultifashionResumenView.tsx"), "utf8");
    expect(vista).toContain("useVentaHoy(syncTick, celular?.soloElMes === true)");
    expect(vista).toContain("ventaHoy={celular.soloElMes ? ventaDeHoyParaElMes(");
  });

  it("en la barra el mes va entero, como en Ventas; fuera de la barra sigue corto", () => {
    const sel = fs.readFileSync(path.join(process.cwd(), "src/components/multifashion/PeriodoSelect.tsx"), "utf8");
    expect(sel).toContain("mesCompleto = false");
    expect(sel).toContain("rotuloCorto={mesCompleto ? undefined : corto}");
    expect(shell).toContain("mesCompleto={barra}");
  });
});


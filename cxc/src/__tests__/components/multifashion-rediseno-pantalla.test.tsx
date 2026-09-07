// ─────────────────────────────────────────────────────────────────────────────
// LO QUE SE VE — el rediseño de Multifashion dibujado de verdad (6-sep-2026).
//
// Los candados de `multifashion-rediseno.test.ts` leen el fuente. Éstos MONTAN
// los componentes con un payload real y comprueban lo que queda en pantalla:
// las cuatro tarjetas, la sección «Cuándo vende la tienda» con su período en
// cada línea, la línea de cobertura de Clientes y el desplegable de período.
//
// 🔴 Es la diferencia entre «el código dice» y «el usuario ve».
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MultifashionResumenView } from "@/components/multifashion/MultifashionResumenView";
import { PeriodoSelect } from "@/components/multifashion/PeriodoSelect";
import { opcionesPeriodo } from "@/lib/multifashion/periodo";

// Los números son los MEDIDOS contra producción el 6-sep-2026.
const DETALLE = {
  year: 2026, mes: 9, mes_label: "Septiembre", is_mes_actual: true,
  dia_actual: 5, dias_en_mes: 30,
  dias: [
    { dia: 1, ventas: 1624.63, utilidad: null, n_tickets: 30, ventas_mes_anterior: 0 },
    { dia: 5, ventas: 3364.19, utilidad: null, n_tickets: 60, ventas_mes_anterior: 0 },
  ],
  totales: {
    ventas: 10867.09, mayoreo: 0, ventas_total: 10867.09, utilidad: null,
    n_tickets: 213, ticket_promedio: 51.02, margen: null,
    proyeccion_cierre: 65202.51, proyeccion_dias: 5, proyeccion_dias_mes: 30,
  },
  mes_anterior: { ventas: 7232.85, utilidad: null, n_tickets: 151, tiene_data: true },
  yoy: { ventas: 5343.98, utilidad: null, n_tickets: 118, tiene_data: true },
  mejor_dia: { fecha: "2026-09-05", ventas: 3364.19 },
  peor_dia: { fecha: "2026-09-03", ventas: 1166.98 },
  heatmap_dia_semana: [
    { dow: 6, dow_label: "Sáb", ventas_promedio: 3364.19, count_dias: 1 },
  ],
  horas: [{ hora: 16, ventas: 1624.4, n_tickets: 20 }],
  hora_pico: 16, hora_pico_ventas: 1624.4,
  anio_anterior: 2025, anio_anterior_tiene_data: true,
  mayoreo_clientes: [], mayoreo_facturas: 0, mayoreo_cliente: null,
  // La ventana de 3 meses, con los números medidos.
  patrones: {
    dow: [
      { dow: 5, dow_label: "Vie", ventas_promedio: 2108.23, count_dias: 10 },
      { dow: 6, dow_label: "Sáb", ventas_promedio: 2640.52, count_dias: 10 },
    ],
    mejorDow: { dow: 6, dow_label: "Sáb", ventas_promedio: 2640.52, count_dias: 10 },
    horas: [{ hora: 15, ventas: 15209.52 }, { hora: 16, ventas: 14718.54 }],
    horaPico: 15, horaPicoVentas: 15209.52,
    mesesUsados: 3, n_meses: 3, desde: "2026-07", hasta: "2026-09",
  },
};

const MESES_VACIOS = Array.from({ length: 12 }, (_, i) => ({
  mes: ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"][i],
  ventas: i === 8 ? 10867.09 : 0, tickets: i === 8 ? 213 : 0,
  ticketProm: 0, vs2025: i === 8 ? 1.03 : null,
  fecha_corte: null, es_periodo_parcial: i === 8, dia_corte_anio_anterior: null,
}));

const OVERVIEW = {
  tienda: "American Classics", ubicacion: "Chiriquí", manager: "Jennifer Miranda",
  metaAnual: 800000, expectedTodayPct: 0.49,
  retail: { meses: MESES_VACIOS, ytdVentas: 369153.24, ytdTickets: 8058, ticketProm: 45.81, margen: null, margenPrev: null },
  total: { ytdVentas: 397519.14, ytdTickets: 8063, margen: 0.3328, margenPrev: 0.3317 },
  wholesale: { meses: [], ytdVentas: 28365.9, ytdTickets: 5, totalClientes: 3, topClienteName: "LA FRONTERA DUTY FREE" },
  proyeccionCierre: { tiene_proyeccion: true, proyeccion: 732213.29, cierre_prev: 676337.36 },
  serieActual: { dias: [{ fecha: "2026-09-05", acumulado: 369153.24 }], meses: [] },
  seriePrevio: { dias: [{ fecha: "2025-09-05", acumulado: 340982.79 }], meses: [] },
// eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any;

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => ({
    ok: true, json: async () => DETALLE,
  })) as unknown as typeof fetch);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

async function pintar() {
  render(
    <MultifashionResumenView overview={OVERVIEW} selectedYear={2026} isClosedYear={false} mes={9} />,
  );
  // El detalle llega por fetch: hay que esperarlo.
  await screen.findByText("Cuándo vende la tienda");
}

describe("Resumen · las cuatro tarjetas", () => {
  it("se ven Ventas del mes · Tickets · Cierra en · Año 2026, con sus cifras", async () => {
    await pintar();
    // El monto del mes aparece dos veces (la tarjeta y la fila de septiembre de
    // la tabla «Mes a mes»): lo que se comprueba es que esté EN LA TARJETA.
    const tarjeta = (rotulo: string) =>
      screen.getByText(rotulo).parentElement as HTMLElement;
    expect(tarjeta("Ventas del mes").textContent).toContain("$10,867.09");
    expect(tarjeta("Tickets").textContent).toContain("213");
    expect(tarjeta("Cierra en").textContent).toContain("$65,202.51");
    expect(tarjeta("Año 2026").textContent).toContain("$369,153.24");
  });

  it("🔴 «Cierra en» dice sobre CUÁNTOS DÍAS está hecha", async () => {
    await pintar();
    expect(screen.getByText("con 5 días")).toBeTruthy();
  });

  it("🩸 el desplegable «Panorama del año» ya no está — el año se ve directo", async () => {
    await pintar();
    expect(screen.queryByText(/Panorama del año/)).toBeNull();
    // Y lo que ese desplegable traía sigue a la vista.
    expect(screen.getByText(/cierra en/)).toBeTruthy();
    expect(screen.getByText(/margen tienda/)).toBeTruthy();
  });
});

describe("Resumen · «Cuándo vende la tienda»", () => {
  it("es UNA sección con las cuatro líneas", async () => {
    await pintar();
    expect(screen.getByText("Cuándo vende la tienda")).toBeTruthy();
    for (const t of ["Mejor día", "Peor día", "Día más fuerte", "Hora pico"]) {
      expect(screen.getByText(new RegExp(`^${t}$`)), `falta «${t}»`).toBeTruthy();
    }
  });

  it("🔴 CADA LÍNEA DICE DE QUÉ PERÍODO HABLA", async () => {
    await pintar();
    expect(screen.getAllByText("· este mes").length).toBe(2);
    expect(screen.getAllByText("· últimos 3 meses").length).toBe(2);
  });

  it("🩸 el día más fuerte YA NO es el mismo número que el mejor día del mes", async () => {
    await pintar();
    // Mejor día del mes: $3.364,19 (el sábado 5). Día más fuerte: $2.640,52 de
    // promedio sobre DIEZ sábados. Antes las dos decían $3.364,19.
    const seccion = screen.getByText("Cuándo vende la tienda").parentElement as HTMLElement;
    expect(seccion.textContent).toContain("$3,364.19");
    // El promedio de los 10 sábados sale compacto: $2,641 (de $2.640,52).
    expect(seccion.textContent).toContain("$2,641 promedio");
    expect(seccion.textContent).not.toContain("$3,364.19 promedio");
  });

  it("la hora pico es la de los 3 meses (3 pm), no la del mes suelto (4 pm)", async () => {
    await pintar();
    expect(screen.getByText("3–4 pm")).toBeTruthy();
    expect(screen.queryByText("4–5 pm")).toBeNull();
  });
});

describe("El desplegable de período", () => {
  it("dice el período con todas las letras y llega a 44 px", () => {
    const opciones = opcionesPeriodo({
      tab: "vendedoras", anios: [2026], corte: { anio: 2026, mes: 9 },
    });
    render(<PeriodoSelect valor="2026-09" opciones={opciones} onChange={() => {}} />);
    const trigger = screen.getByLabelText("Período");
    expect(trigger.textContent).toContain("Septiembre 2026");
    expect(trigger.className).toContain("h-11");
  });
});

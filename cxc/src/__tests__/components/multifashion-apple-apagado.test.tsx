// ─────────────────────────────────────────────────────────────────────────────
// 🔴 CANDADO — `MULTIFASHION_APPLE_2026_10` APAGADO = LA PANTALLA DE HOY, BYTE
// POR BYTE (8-oct-2026).
//
// Monta las pantallas que toca el rediseño (Resumen en computadora y celular,
// «Año» del celular, Vendedoras con su meta y Clientes) con datos fijos y
// compara el HTML entero contra `__snapshots__/multifashion-apple-apagado…`.
// La foto se sacó con el código de `origin/main` ANTES del rediseño: si con el
// interruptor apagado cambia un solo byte, esto se pone rojo. Prender el
// interruptor también lo pone rojo (verificado al escribirlo).
// 9-oct-2026: Daniel aprobó el rediseño y el interruptor quedó PRENDIDO. Esta
// prueba lo fuerza a `false` con `vi.mock` para que apagarlo siga devolviendo
// la pantalla de antes, byte por byte (la vuelta atrás queda garantizada).
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/supabase-server", () => ({
  supabaseServer: { from: vi.fn(), rpc: vi.fn() },
}));
// 9-oct-2026: `MULTIFASHION_GRAFICA_2026_10` también quedó PRENDIDO (Daniel
// aprobó la gráfica). Este candado es la pantalla de ANTES: la gráfica se fija
// a `false` igual que el rediseño. La nueva la cuida `multifashion-grafica.test.ts`.
vi.mock("@/lib/multifashion/grafica-mes", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/multifashion/grafica-mes")>()),
  MULTIFASHION_GRAFICA_2026_10: false,
}));
vi.mock("@/lib/multifashion/apple", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/multifashion/apple")>()),
  MULTIFASHION_APPLE_2026_10: false,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/multifashion",
  useSearchParams: () => new URLSearchParams(),
}));

import { render, screen, cleanup, act } from "@testing-library/react";
import { SWRConfig } from "swr";
import { MultifashionResumenView } from "@/components/multifashion/MultifashionResumenView";
import { VendedorasSubtab } from "@/components/multifashion/VendedorasSubtab";
import { ClientesMultifashionSubtab } from "@/components/multifashion/ClientesMultifashionSubtab";
import { armarUniverso, type FilaFactura, type FilaRegistrado } from "@/lib/multifashion/clientes-universo";
import { avanceMeta } from "@/lib/multifashion/metas-avance";
import type { MetaConAvance } from "@/lib/multifashion/metas-lectura";

const HOY = "2026-09-23";

const DETALLE = {
  year: 2026, mes: 9, mes_label: "Septiembre", is_mes_actual: true,
  dia_actual: 22, dias_en_mes: 30,
  dias: Array.from({ length: 30 }, (_, i) => ({
    dia: i + 1, ventas: [12, 21].includes(i + 1) ? 0 : 1400, utilidad: null,
    n_tickets: [12, 21].includes(i + 1) ? 0 : 30, ventas_mes_anterior: 1300, ventas_anio_anterior: 1100,
  })),
  totales: {
    ventas: 31834.45, mayoreo: null, ventas_total: null, utilidad: null,
    n_tickets: 658, ticket_promedio: 48.38, margen: null,
    proyeccion_cierre: 45527.63, proyeccion_dias: 22, proyeccion_dias_mes: 30, proyeccion_base: "temporada",
  },
  mes_anterior: { ventas: 40662, utilidad: null, n_tickets: 800, tiene_data: true },
  yoy: { ventas: 25473.08, utilidad: null, n_tickets: 600, tiene_data: true },
  mejor_dia: { fecha: "2026-09-19", ventas: 4064.3 },
  peor_dia: { fecha: "2026-09-07", ventas: 967.22 },
  heatmap_dia_semana: [{ dow: 6, dow_label: "Sáb", ventas_promedio: 2770, count_dias: 3 }],
  horas: [], hora_pico: null, hora_pico_ventas: null,
  anio_anterior: 2025, anio_anterior_tiene_data: true, anio_anterior_mes_completo: 36430.41,
  feriados: [],
  patrones: {
    dow: [{ dow: 6, dow_label: "Sáb", ventas_promedio: 2770.2, count_dias: 12 }],
    mejorDow: { dow: 6, dow_label: "Sáb", ventas_promedio: 2770.2, count_dias: 12 },
    horas: [{ hora: 17, ventas: 19651 }], horaPico: 17, horaPicoVentas: 19651,
    mesesUsados: 3, n_meses: 3, desde: "2026-07", hasta: "2026-09",
  },
};

const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const RETAIL_MESES = [33272.39, 38381.69, 38325.58, 47375.17, 42446.03, 64503.06, 40788.67, 53193.56, 31834.45, 0, 0, 0];
const OVERVIEW = {
  tienda: "American Classics", ubicacion: "Chiriquí", manager: "Jennifer Miranda",
  metaAnual: 800000, expectedTodayPct: 0.49,
  retail: {
    ytdVentas: 390120.61, ytdTickets: 8503, ticketProm: 45.88, margen: null, margenPrev: null,
    meses: RETAIL_MESES.map((v, i) => ({
      mes: MESES[i], ventas: v, tickets: v > 0 ? 100 : 0, ticketProm: 0, vs2025: v > 0 ? 0.1 : null,
      fecha_corte: null, es_periodo_parcial: i === 8, dia_corte_anio_anterior: null,
    })),
  },
  total: { ytdVentas: 418486.51, ytdTickets: 8508, margen: 0.3329, margenPrev: 0.3317 },
  wholesale: {
    ytdVentas: 28365.9, ytdTickets: 5, totalClientes: 3, topClienteName: "LA FRONTERA DUTY FREE",
    meses: MESES.map((m, i) => ({ mes: m, ventas: i === 3 ? 24807 : 0, tickets: i === 3 ? 1 : 0 })),
  },
  proyeccionCierre: { year: 2026, tiene_proyeccion: true, proyeccion: 755341.55, cierre_prev: 652420.19, delta_pct: 0.1578, ytd_actual: 390388.26, ytd_prev: 337194.72 },
  serieActual: { year: 2026, corte: "2026-09-23", es_anio_actual: true, dias: [{ fecha: "2026-09-22", ventas: 1000, acumulado: 390120.61 }], meses: [] },
  seriePrevio: { year: 2025, corte: "2025-12-31", es_anio_actual: false, dias: [{ fecha: "2025-09-22", ventas: 900, acumulado: 337194.72 }], meses: [] },
// eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any;

const VENDEDORAS = {
  vendedoras: [
    { nombre: "SHEYNEE BATISTA", tickets: 251, ventas: 11320.43, ticket_promedio: 45.1, comision: 55.53, manager: false, top: true, delta_ventas_pct: -0.14, delta_tickets_pct: null },
    { nombre: "JENNIFER MIRANDA", tickets: 94, ventas: 6423.38, ticket_promedio: 68.33, comision: 30.29, manager: true, top: false, delta_ventas_pct: 0.31, delta_tickets_pct: null },
  ],
  total_vendedoras_periodo: 2, ventas_total: 17743.81, tickets_total: 345, ventas_total_prev: 0, tickets_total_prev: 0,
  fecha_corte: "2026-09-22", es_periodo_parcial: true, dia_corte_periodo_anterior: "2026-08-22",
};
const BONOS_SEP = {
  mes_evaluado: { year: 2026, mes: 9 }, es_elegible: false, fecha_max_data: "2026-09-22", ultimo_mes_elegible: { year: 2026, mes: 8 },
  gerente: { nombre: "JENNIFER MIRANDA", ventas_mes: 53193.56, ventas_mes_prev: 39453.49, delta_pct: 0.348, tiene_comparacion: true, bono: 0 },
  vendedoras: [],
};

/** Una meta que, así como va, NO llega: la que el rediseño sube arriba. */
function metaQueNoLlega(): MetaConAvance {
  const avance = avanceMeta({ desde: "2026-09-01", hasta: "2026-12-31", hoy: HOY, objetivo: 420000, vendido: 31834.45, pesos: [] });
  return {
    id: "m1", nombre: "Viaje playa", desde: "2026-09-01", hasta: "2026-12-31", objetivo: 420000, tipo: "grupal",
    premio: "Un viaje para todas", premioMonto: null, activa: true,
    participantes: [{ clave: "SHEYNEE BATISTA", nombre: "Sheynee Batista", objetivoIndividual: null }],
    avance,
    porVendedora: [{ clave: "SHEYNEE BATISTA", nombre: "Sheynee Batista", vendido: 11320.43, aporte: 0.36, objetivo: null, avance: null }],
    aporteNoAsignado: 0.01, fuente: "rpc", temporadaDisponible: false,
  } as MetaConAvance;
}

const reg = (id: number, nombre: string): FilaRegistrado =>
  ({ cliente_switch_id: id, nombre, telefono: "6000-0000", celular: null, raw_data: null });
const fac = (id: number, fecha: string, monto: number, mayoreo = false): FilaFactura =>
  ({ cliente_switch_id: id, cliente_nombre: null, fecha: `${fecha}T15:00:00+00:00`, tipo_comprobante: "Factura", subtotal_descuento: monto, is_wholesale: mayoreo });
const UNIVERSO = armarUniverso(
  [reg(324, "LA FRONTERA DUTY FREE"), reg(47, "VENTAS MAHER"), ...Array.from({ length: 12 }, (_, i) => reg(100 + i, `CLIENTE ${i}`))],
  [fac(324, "2026-04-07", 24807, true), fac(47, "2026-02-02", 300), ...Array.from({ length: 12 }, (_, i) => fac(100 + i, `2025-0${1 + (i % 9)}-15`, 50 + i))],
  HOY,
);
const RETAIL = {
  fecha_inicio: "2026-09-01", fecha_fin: "2026-09-30", limit: 50, total_clientes: 3, total_ventas: 100, total_tickets: 3,
  clientes_identificados: 120, ventas_identificadas: 9358.06, tickets_identificados: 126,
  ventas_anonimas: 22475.39, tickets_anonimos: 532, pct_identificado: 29.4, clientes: [],
};

const RUTAS: Record<string, unknown> = {
  "/api/multifashion/vendedoras": VENDEDORAS,
  "/api/multifashion/bonos": BONOS_SEP,
  "/api/multifashion/metas": { instalado: true, puedeEditar: true, metas: [metaQueNoLlega()], vendedoras: [] },
  "/api/multifashion/retail-recurrentes": RETAIL,
  "/api/multifashion/fidelizacion": { hoy: HOY, detalle_activo: true, cards: UNIVERSO.cards, clientes: UNIVERSO.clientes },
  "/api/multifashion/contactos": { hoy: HOY, porCliente: {} },
  "/api/multifashion/productos": { ranking: { totales: { unidades: 1237, venta: 31834.45, costo: 21300, utilidad: 10534.45, margen: 0.331 } } },
  "/api/multifashion/detalle-mensual": DETALLE,
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-23T15:00:00-05:00"));
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const clave = Object.keys(RUTAS).find((k) => url.includes(k));
    if (!clave) return { ok: false, status: 404, json: async () => ({ error: `sin ruta para ${url}` }) };
    return { ok: true, status: 200, json: async () => RUTAS[clave] };
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

const montar = (ui: React.ReactElement) =>
  render(<SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>{ui}</SWRConfig>);
/** El HTML cuando ya llegó todo: igual en dos vueltas seguidas (los renglones
 *  del celular piden su dato aparte y llegan después). */
async function quieto(c: HTMLElement): Promise<string> {
  let antes = "";
  for (let i = 0; i < 50; i++) {
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    if (c.innerHTML === antes) return antes;
    antes = c.innerHTML;
  }
  return antes;
}
const PERIODO = { tipo: "mes" as const, anio: 2026, mes: 9 };
const CORTE = { anio: 2026, mes: 9 };

describe("MULTIFASHION_APPLE_2026_10 apagado: la pantalla de hoy, byte por byte", () => {
  it("Resumen · computadora", async () => {
    const { container } = montar(
      <MultifashionResumenView overview={OVERVIEW} selectedYear={2026} isClosedYear={false} mes={9} />,
    );
    await screen.findByText("Ventas del mes");
    expect(await quieto(container)).toMatchSnapshot();
  });

  it("Resumen · celular (inicio)", async () => {
    const { container } = montar(
      <MultifashionResumenView overview={OVERVIEW} selectedYear={2026} isClosedYear={false} mes={9}
        celular={{ periodo: PERIODO, corte: CORTE, pantalla: "inicio", onAbrir: () => {} }} />,
    );
    await screen.findByText("Ventas del mes");
    expect(await quieto(container)).toMatchSnapshot();
  });

  it("Resumen · celular («Año»)", async () => {
    const { container } = montar(
      <MultifashionResumenView overview={OVERVIEW} selectedYear={2026} isClosedYear={false} mes={9}
        celular={{ periodo: PERIODO, corte: CORTE, pantalla: "anio", onAbrir: () => {} }} />,
    );
    await screen.findByText("Ventas del mes");
    expect(await quieto(container)).toMatchSnapshot();
  });

  it("Vendedoras · con la meta que no llega", async () => {
    const { container } = montar(
      <VendedorasSubtab selectedYear={2026} periodo={PERIODO} corte={CORTE} conMetas vsAnioPasado conTotalAPagar />,
    );
    await screen.findAllByText("Sheynee Batista");
    await screen.findByText("Viaje playa");
    expect(await quieto(container)).toMatchSnapshot();
  });

  it("Vendedoras · celular", async () => {
    const { container } = montar(
      <VendedorasSubtab selectedYear={2026} periodo={PERIODO} corte={CORTE} conMetas enCelular vsAnioPasado conTotalAPagar />,
    );
    await screen.findAllByText("Sheynee Batista");
    expect(await quieto(container)).toMatchSnapshot();
  });

  it("Clientes", async () => {
    const { container } = montar(<ClientesMultifashionSubtab selectedYear={2026} mes={9} periodo={PERIODO} />);
    await screen.findByText("Frecuentes");
    await screen.findAllByText(/compró/);
    expect(await quieto(container)).toMatchSnapshot();
  });
});

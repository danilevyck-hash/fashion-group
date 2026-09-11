// ─────────────────────────────────────────────────────────────────────────────
// VENTAS › RESUMEN — LOS CAMBIOS DEL 11-sep-2026, PROBADOS TOCANDO LA PANTALLA.
//
// Los trece cambios de Ventas los aprobó Daniel uno por uno sobre el mockup
// («Ventas, ahora vs después»). Los del Resumen son de FORMA y ninguno mueve un
// total de venta (medido antes y después con la RPC real:
// `scripts/_medir-ventas-13-cambios.mjs`). Lo único que cambia de valor es la
// utilidad y el margen del MES EN CURSO, que dejan de mezclar la venta de hoy
// con el costo de ayer. Acá se RENDERIZA y se mira qué quedó dibujado:
//
//   1. Dos modos (Ventas · Utilidad), sin Trimestral, sin Anual, sin Margen %.
//   2. Total y Proyección FIJAS a la derecha, con fondo sólido.
//   3. En Utilidad, el margen % va debajo de cada cifra — y se divide por la
//      venta HASTA EL CORTE, no por la de hoy.
//   4. Las tarjetas llevan su cifra y su delta; el período no se repite. La
//      caja del mes dice «Septiembre · $… ▼ 50% · vs $… en 2025».
//   5. El pie dice hasta qué día vale el margen del mes.
//   6. «Descargar en Excel» en el escritorio Y en el celular; baja el modo que
//      se ve y deja rastro en `activity_logs`.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { ResumenView, MODO_OPCIONES } from "@/components/ventas/ResumenView";
import type { VentasResumen, ProyeccionResp } from "@/components/ventas/types";

vi.mock("@/lib/hooks/useAuth", () => ({
  useAuth: () => ({ authChecked: true, role: "admin", userName: "Daniel" }),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/ventas",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/shared/SyncNowButton", () => ({
  default: () => <button type="button">Actualizar ahora</button>,
}));
const exportResumenToExcel = vi.fn(async (_data: unknown, _modo: unknown) => {});
vi.mock("@/lib/ventas/excel", () => ({
  exportResumenToExcel: (data: unknown, modo: unknown) => exportResumenToExcel(data, modo),
}));
const logActivityClient = vi.fn((_p: unknown) => {});
vi.mock("@/lib/logActivityClient", () => ({ logActivityClient: (p: unknown) => logActivityClient(p) }));

beforeAll(() => {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  window.HTMLElement.prototype.hasPointerCapture = vi.fn(() => false) as never;
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    observe() {} unobserve() {} disconnect() {}
  };
});
beforeEach(() => {
  exportResumenToExcel.mockClear();
  logActivityClient.mockClear();
  vi.stubGlobal("fetch", vi.fn(async () => (
    { ok: true, status: 200, json: async () => ({}) } as unknown as Response
  )));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

// Vistana, el 11-sep-2026, con los números medidos: venta de septiembre hasta
// hoy $60.956,10; costo hasta el 10 $43.548,58; venta hasta el 10 $56.418,00.
// Utilidad ya viene con el corte aplicado (así la manda `queries.ts`).
const V_SEP = 60_956.10, C_SEP = 43_548.58, V_HASTA = 56_418;
const U_SEP = V_HASTA - C_SEP; // 12.869,42 → margen 22,8 %

const meses = (v: number, sep: number) => Array.from({ length: 12 }, (_, i) => (i < 8 ? v : i === 8 ? sep : null));

const PROYECCION = {
  anio: 2026, fecha_corte: "2026-09-11", mes_corte: 9, peso_ritmo: 0.75, peso_historico: 0.25,
  empresas: [{
    empresa: "vistana", nombre: "Vistana", ventas_ytd: 1_298_151.79, ventas_prev_ytd_sp: 1_190_000,
    ventas_prev_year: 2_340_000, cierre_anio_anterior: 2_340_000, delta_vs_anio_anterior: 214_382,
    delta_vs_anio_anterior_pct: 0.09, ritmo_actual: 1.09, ritmo_historico: 1.05, historia_disponible: 3,
    frac_ytd_estacional: 0.51, algoritmo: "estacional", factor_final: 1.09, proyeccion_cierre: 2_554_382,
    proyeccion_restante: 1_256_230, es_fallback_lineal: false, status: "verde",
  }],
  totales_grupo: {
    ventas_ytd: 1_298_151.79, proyeccion_cierre: 2_554_382, proyeccion_restante: 1_256_230,
    cierre_anio_anterior_total: 2_340_000, delta_vs_anio_anterior_total: 214_382,
    delta_vs_anio_anterior_pct: 0.09, status: "verde",
  },
} as unknown as ProyeccionResp;

function resumen(over: Partial<VentasResumen> = {}): VentasResumen {
  return {
    year: 2026,
    mesActual: 9,
    kpis: {
      ventasNetasYTD: 1_298_151.79, ventas2025YTD: 1_190_000,
      utilidadYTD: 360_000, utilidad2025YTD: 330_000,
      margenYTD: 0.279, margen2025YTD: 0.27,
    },
    empresas: [{
      empresa: { id: "vistana", nombre: "Vistana International", tipo: "b2b" },
      ventas2026: meses(150_000, V_SEP),
      ventas2025: meses(140_000, 98_000),
      ventasPrevFull: Array(12).fill(190_000),
      utilidad2026: meses(45_000, U_SEP),
      utilidad2025: meses(40_000, 28_000),
      ventasParaMargen: meses(150_000, V_HASTA),
      costoHasta: "2026-09-10",
      margenPct: 0.279, margenPctPrev: 0.27,
    }],
    es_periodo_parcial: true,
    fecha_corte: "2026-09-11",
    dia_corte_anio_anterior: "2025-09-11",
    data_actualizada_at: "2026-09-11T15:00:00Z",
    proyeccion: PROYECCION,
    corte_costo: "2026-09-10",
    ...over,
  };
}

function pintar(datos = resumen(), cerrado = false) {
  return render(
    <ResumenView data={datos} multi={null} selectedYear={datos.year} isClosedYear={cerrado} loading={false} error={null} />,
  );
}

/** La matriz del escritorio (el celular también está montado en jsdom). */
const matriz = () => document.querySelector(".min-\\[1440px\\]\\:block") as HTMLElement;
const tabsDe = (raiz: HTMLElement) => [...raiz.querySelectorAll('[role="tab"]')].map(t => (t.textContent ?? "").trim());

// ═════════════════════════════════════════════════════════════════════════════

describe("1 · dos modos y una sola granularidad", () => {
  it("el control del escritorio y el del celular ofrecen Ventas y Utilidad, y nada más", () => {
    pintar();
    expect(MODO_OPCIONES.map(o => o.label)).toEqual(["Ventas", "Utilidad"]);
    expect(tabsDe(matriz())).toEqual(["Ventas", "Utilidad"]);
    for (const nombre of ["Trimestral", "Anual", "Mensual", "Margen %"]) {
      expect(screen.queryAllByRole("tab", { name: nombre }), nombre).toHaveLength(0);
    }
  });

  it("la matriz sigue siendo mensual: los 12 meses, Total y Proyección", () => {
    pintar();
    const encabezados = [...matriz().querySelectorAll("thead th")].map(th => (th.textContent ?? "").trim());
    expect(encabezados).toEqual(["Empresa", "Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic", "Total", "Proyección"]);
  });
});

describe("2 · 🔴 Total y Proyección, fijas a la derecha", () => {
  it("los dos encabezados son sticky: Proyección pegada al borde, Total a su lado", () => {
    pintar();
    const total = matriz().querySelector('th[data-col-fija="total"]') as HTMLElement;
    const proy = matriz().querySelector('th[data-col-fija="proyeccion"]') as HTMLElement;
    expect(total.className).toContain("sticky");
    expect(proy.className).toContain("sticky");
    expect(proy.className).toContain("right-0");
    // Total deja libre exactamente el ancho de Proyección.
    expect(total.style.right).toBe(`${proy.style.minWidth}`);
    expect(Number.parseInt(proy.style.minWidth, 10)).toBeGreaterThan(80);
  });

  it("las celdas fijas de cada fila llevan fondo SÓLIDO: nada se ve a través", () => {
    pintar();
    const celdas = [...matriz().querySelectorAll('td[data-col-fija]')] as HTMLElement[];
    expect(celdas.length).toBeGreaterThanOrEqual(4); // Vistana ×2 + Total Grupo ×2
    for (const td of celdas) {
      expect(td.className, td.textContent ?? "").toContain("sticky");
      expect(td.className, td.textContent ?? "").toMatch(/\bbg-(white|gray-50|gray-950|teal-50)\b/);
    }
  });

  it("en un año CERRADO no hay Proyección, y Total queda pegada al borde", () => {
    pintar(resumen({ proyeccion: null, corte_costo: null }), true);
    expect(matriz().querySelector('th[data-col-fija="proyeccion"]')).toBeNull();
    const total = matriz().querySelector('th[data-col-fija="total"]') as HTMLElement;
    expect(total.style.right).toBe("0px");
  });
});

describe("3 · 🔴 en Utilidad, el margen va debajo de cada cifra — con el corte", () => {
  it("la celda de septiembre dice 23 % (56.418 de base), no 21 % (60.956, la venta de hoy)", () => {
    pintar();
    fireEvent.click(screen.getAllByRole("tab", { name: "Utilidad" })[0]);
    const margenes = [...matriz().querySelectorAll("[data-margen-celda]")].map(m => (m.textContent ?? "").trim());
    expect(margenes.length).toBeGreaterThan(0);
    // Ene–ago: 45.000 / 150.000 = 30 %. Septiembre: 12.869,42 / 56.418 = 22,8 % → «23%».
    expect(margenes).toContain("30%");
    expect(margenes).toContain("23%");
    expect(margenes).not.toContain("21%");
    // Y la cifra de la celda es la utilidad, no la venta.
    expect(matriz().textContent).toContain("$12,869");
  });

  it("en Ventas no hay margen chico en ninguna celda", () => {
    pintar();
    expect(matriz().querySelectorAll("[data-margen-celda]")).toHaveLength(0);
  });

  it("el Total del año en Utilidad lleva el margen del año, el MISMO de la tarjeta", () => {
    pintar();
    fireEvent.click(screen.getAllByRole("tab", { name: "Utilidad" })[0]);
    const total = matriz().querySelector('td[data-col-fija="total"]') as HTMLElement;
    expect(total.querySelector("[data-margen-celda]")?.textContent).toBe("28%");
  });
});

describe("4 · las tarjetas: cifra y delta, sin repetir el período", () => {
  it("las cuatro se llaman VENTAS · UTILIDAD · MARGEN · CIERRE DEL AÑO y no dicen «Ene–Sep 2026» ni «vs 2025»", () => {
    pintar();
    for (const l of ["VENTAS", "UTILIDAD", "MARGEN", "CIERRE DEL AÑO"]) expect(screen.getByText(l)).toBeTruthy();
    const texto = matriz().textContent ?? "";
    expect(texto).not.toMatch(/Ene–Sep 2026/);
    expect(texto).not.toContain("vs 2025");
    expect(texto).not.toContain("8 empresas");
    // El delta sí, y contra qué compara en el title.
    expect(screen.getAllByText("▲ +9%").length).toBeGreaterThanOrEqual(1);
    const conTitle = [...matriz().querySelectorAll("p[title]")].map(p => p.getAttribute("title") ?? "");
    expect(conTitle.some(t => t.includes("2025"))).toBe(true);
  });

  it("la caja del mes: «Septiembre · $60,956.10 ▼ 38% · vs $98,000.00 en 2025» — el «vs» se queda", () => {
    pintar();
    const caja = document.querySelector("[data-mes-en-curso]") as HTMLElement;
    expect(caja.textContent).toContain("Septiembre");
    expect(caja.textContent).toContain("$60,956.10");
    expect(caja.textContent).toContain("▼ 38%");
    expect(caja.textContent).toContain("vs $98,000.00 en 2025");
    expect(caja.textContent).not.toContain("Septiembre 2026 vs");
  });
});

describe("5 · el pie dice hasta qué día vale el margen del mes", () => {
  it("escritorio y celular: «Utilidad y margen de septiembre al 10 de septiembre…»", () => {
    pintar();
    const frase = "Utilidad y margen de septiembre al 10 de septiembre, el último día con costo cargado";
    expect(document.querySelector('[data-pie-matriz="escritorio"]')?.textContent).toContain(frase);
    expect(document.querySelector('[data-leyenda-proyectado="celular"]')?.textContent).toContain(frase);
    // Y sigue diciendo hasta qué día llega la venta.
    expect(document.querySelector('[data-pie-matriz="escritorio"]')?.textContent).toContain("Datos hasta el 11 sep");
  });

  it("sin corte (la RPC todavía no existe, o año cerrado) no se afirma nada", () => {
    pintar(resumen({ corte_costo: null }));
    expect(document.body.textContent).not.toContain("último día con costo");
    cleanup();
    pintar(resumen({ proyeccion: null, corte_costo: "2026-09-10" }), true);
    expect(document.body.textContent).not.toContain("último día con costo");
  });
});

describe("6 · «Descargar en Excel», en las dos caras, con el modo que se ve y con rastro", () => {
  it("hay botón en el escritorio Y en el celular", () => {
    pintar();
    expect(screen.getAllByRole("button", { name: /Descargar en Excel/ }).length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByRole("button", { name: /^Excel$/ })).toBeNull();
  });

  it("baja Ventas o Utilidad según el modo, y anota la descarga", async () => {
    pintar();
    fireEvent.click(screen.getAllByRole("button", { name: /Descargar en Excel/ })[0]);
    await waitFor(() => expect(exportResumenToExcel).toHaveBeenCalledTimes(1));
    expect(exportResumenToExcel.mock.calls[0][1]).toBe("ventas");
    expect(logActivityClient).toHaveBeenCalledWith({
      action: "descarga_excel", module: "ventas", details: { pestana: "resumen", modo: "ventas", anio: 2026 },
    });

    fireEvent.click(screen.getAllByRole("tab", { name: "Utilidad" })[0]);
    fireEvent.click(screen.getAllByRole("button", { name: /Descargar en Excel/ })[0]);
    await waitFor(() => expect(exportResumenToExcel).toHaveBeenCalledTimes(2));
    expect(exportResumenToExcel.mock.calls[1][1]).toBe("utilidad");
  });
});

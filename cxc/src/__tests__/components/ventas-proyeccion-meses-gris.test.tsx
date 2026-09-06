// ─────────────────────────────────────────────────────────────────────────────
// VENTAS › RESUMEN — los meses que faltan se DIBUJAN en gris, en el escritorio
// y en el celular (5-sep-2026).
//
// La aritmética vive en `ventas-proyeccion-mensual.test.ts`. Este candado es de
// PANTALLA: qué se ve, dónde, y sobre todo qué NO cambió.
//
//  · Oct-nov-dic dejan de decir «—» y muestran su monto en gris, sin Δ y sin
//    nada que abrir.
//  · 🔴 La celda del MES EN CURSO no se toca: monto y % contra los mismos días
//    del año pasado, y NADA de un rótulo «vs 1–5 sep» — Daniel, textual: *«no
//    pongas vs 1–5 sep, ensuscia»*.
//  · 🔴 «Total» sigue siendo lo VENDIDO y «Proyección» el año completo.
//  · Un año CERRADO no proyecta nada: sigue con sus guiones.
//  · En Utilidad y en Margen tampoco se dibuja: no existe una utilidad
//    proyectada por mes, y pintar un margen de un mes que no pasó sería
//    inventar el dato.
//  · Y en el celular es el MISMO arreglo de 12 meses de la tarjeta, no una
//    vista nueva.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { render, screen, within, cleanup, fireEvent } from "@testing-library/react";
import { ResumenView } from "@/components/ventas/ResumenView";
import { ResumenViewMobile } from "@/components/ventas/ResumenViewMobile";
import { LEYENDA_MESES_PROYECTADOS } from "@/lib/ventas/proyeccion-mensual";
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

beforeAll(() => {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  window.HTMLElement.prototype.hasPointerCapture = vi.fn(() => false) as never;
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    observe() {} unobserve() {} disconnect() {}
  };
});
beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => (
    { ok: true, status: 200, json: async () => ({}) } as unknown as Response
  )));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

// ── Producción, 5-sep-2026 (corte 2026-09-05) ────────────────────────────────
// Multifashion y Active Wear: la primera es el caso que Daniel miró, la segunda
// es la que vendió $0 en noviembre de 2025.
const PREV_MULTI = [
  21_996.83, 42_046.32, 36_224.21, 66_778.36, 36_302.49, 59_292.96,
  37_172.16, 39_453.49, 36_430.41, 48_892.13, 61_196.78, 200_257.73,
];
const PREV_AWEAR = [
  13_559.33, 25_155, 25_155, 25_155, 25_155, 25_155,
  25_155, 25_155, 25_155, 4_996, null, 3_237,
];

const PROYECCION = {
  anio: 2026,
  fecha_corte: "2026-09-05",
  mes_corte: 9,
  peso_ritmo: 0.75,
  peso_historico: 0.25,
  empresas: [
    {
      empresa: "american_classic", nombre: "Multifashion",
      ventas_ytd: 397_519.14, ventas_prev_ytd_sp: 344_610.79,
      cierre_anio_anterior: 686_043.69, proyeccion_cierre: 791_372.50,
      proyeccion_restante: 393_853.36, delta_vs_anio_anterior: 105_328.81,
      es_fallback_lineal: false, algoritmo: "estacional",
    },
    {
      empresa: "active_wear", nombre: "Active Wear",
      ventas_ytd: 341_093.30, ventas_prev_ytd_sp: 191_458.33,
      cierre_anio_anterior: 199_716.33, proyeccion_cierre: 355_805.37,
      proyeccion_restante: 14_712.07, delta_vs_anio_anterior: 156_089.04,
      es_fallback_lineal: false, algoritmo: "estacional",
    },
  ],
  totales_grupo: {
    ventas_ytd: 738_612.44,
    proyeccion_cierre: 1_147_177.87,
    proyeccion_restante: 408_565.43,
    cierre_anio_anterior_total: 885_760.02,
    delta_vs_anio_anterior_total: 261_417.85,
    delta_vs_anio_anterior_pct: 0.295,
    status: "verde",
  },
} as unknown as ProyeccionResp;

/** Ene-ago con datos, septiembre parcial, oct-dic vacíos: la forma real. */
const hasta = (v: number, prev: number[]) =>
  Array.from({ length: 12 }, (_, i) => (i < 9 ? v : null)) as (number | null)[];

function resumen(over: Partial<VentasResumen> = {}): VentasResumen {
  return {
    year: 2026,
    mesActual: 9,
    kpis: {
      ventasNetasYTD: 738_612.44, ventas2025YTD: 536_069.12,
      utilidadYTD: 200_000, utilidad2025YTD: 180_000,
      margenYTD: 0.27, margen2025YTD: 0.26,
    },
    empresas: [
      {
        empresa: { id: "multi", nombre: "Multifashion", tipo: "retail" },
        ventas2026: hasta(44_168, PREV_MULTI), ventas2025: PREV_MULTI.slice(0, 9),
        utilidad2026: hasta(12_000, PREV_MULTI), utilidad2025: PREV_MULTI.slice(0, 9),
        ventasPrevFull: PREV_MULTI,
        margenPct: 0.27, margenPctPrev: 0.26,
      },
      {
        empresa: { id: "awear", nombre: "Active Wear", tipo: "b2b" },
        ventas2026: hasta(37_899, PREV_AWEAR), ventas2025: PREV_AWEAR.slice(0, 9),
        utilidad2026: hasta(9_000, PREV_AWEAR), utilidad2025: PREV_AWEAR.slice(0, 9),
        ventasPrevFull: PREV_AWEAR,
        margenPct: 0.24, margenPctPrev: 0.25,
      },
    ],
    es_periodo_parcial: true,
    fecha_corte: "2026-09-05",
    dia_corte_anio_anterior: "2025-09-05",
    data_actualizada_at: "2026-09-05T12:00:00Z",
    proyeccion: PROYECCION,
    ...over,
  } as unknown as VentasResumen;
}

const props = {
  multi: null, availableYears: [2026], selectedYear: 2026,
  loading: false, error: null, onYearChange: vi.fn(),
};

/** Las celdas grises del ESCRITORIO (el celular usa `m:<fila>:<col>`). */
function celdasGrisEscritorio(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>("[data-mes-proyectado]"))
    .filter(el => !el.dataset.mesProyectado?.includes(":"));
}

describe("escritorio — oct, nov y dic se llenan en gris", () => {
  it("las tres columnas que faltan traen su monto, no un guion", () => {
    render(<ResumenView {...props} data={resumen()} isClosedYear={false} />);
    const grises = celdasGrisEscritorio();
    // 2 empresas × 3 meses. (El Total Grupo tiene su propio atributo.)
    expect(grises).toHaveLength(6);
    const textos = grises.map(e => e.textContent);
    expect(textos).toContain("$56,399");   // Multifashion octubre
    expect(textos).toContain("$70,592");   // Multifashion noviembre
    expect(textos).toContain("$231,003");  // Multifashion diciembre
    for (const t of textos) expect(t).not.toBe("—");
  });

  it("🔴 el noviembre de Active Wear dice $0 y se deja así", () => {
    render(<ResumenView {...props} data={resumen()} isClosedYear={false} />);
    const textos = celdasGrisEscritorio().map(e => e.textContent);
    expect(textos).toContain("$0");
  });

  it("la celda gris NO es tocable: no hay nada medido que abrir", () => {
    render(<ResumenView {...props} data={resumen()} isClosedYear={false} />);
    for (const celda of celdasGrisEscritorio()) {
      expect(celda.querySelector("button")).toBeNull();
    }
  });

  it("va en gris y con fondo tenue — se distingue de lo vendido", () => {
    render(<ResumenView {...props} data={resumen()} isClosedYear={false} />);
    for (const celda of celdasGrisEscritorio()) {
      expect(celda.className).toContain("text-gray-400");
      expect(celda.className).toContain("bg-gray-50");
    }
  });

  it("el Total Grupo trae la SUMA de las dos empresas", () => {
    render(<ResumenView {...props} data={resumen()} isClosedYear={false} />);
    const grupo = Array.from(document.querySelectorAll<HTMLElement>("[data-mes-proyectado-grupo]"));
    expect(grupo).toHaveLength(3);
    // Octubre: 56.398,58 (Multifashion) + 8.900,70 (Active Wear) ≈ 65.299.
    expect(grupo[0].textContent).toBe("$65,299");
  });

  it("hay UNA leyenda que dice qué es el gris, al pie de la matriz", () => {
    render(<ResumenView {...props} data={resumen()} isClosedYear={false} />);
    const pie = document.querySelector<HTMLElement>('[data-pie-matriz="escritorio"]');
    expect(pie).not.toBeNull();
    expect(pie!.textContent).toContain(LEYENDA_MESES_PROYECTADOS);
  });
});

describe("🔴 lo que NO cambió", () => {
  it("la celda del mes en curso sigue con su monto y su %, sin rótulo de rango", () => {
    render(<ResumenView {...props} data={resumen()} isClosedYear={false} />);
    // Septiembre de Multifashion: se ve el monto vendido, no un proyectado.
    const sep = document.querySelector<HTMLElement>('[data-celda="d:multi:8"]');
    expect(sep).not.toBeNull();
    expect(sep!.textContent).toContain("$44,168");
    // Daniel: «no pongas vs 1–5 sep, ensuscia». Ni en la celda ni al abrirla.
    expect(document.body.textContent).not.toMatch(/vs 1[–-]5 sep/i);
    fireEvent.click(sep!);
    expect(document.body.textContent).not.toMatch(/vs 1[–-]5 sep/i);
  });

  it("la columna Total sigue siendo lo VENDIDO, no la suma con lo proyectado", () => {
    render(<ResumenView {...props} data={resumen()} isClosedYear={false} />);
    const total = document.querySelector<HTMLElement>('[data-celda="d:multi:total"]');
    // 9 meses × 44.168 = 397.512, lo vendido. Nada de sumarle el gris.
    expect(total!.textContent).toContain("$397,512.00");
  });

  it("la columna Proyección sigue siendo el año completo", () => {
    render(<ResumenView {...props} data={resumen()} isClosedYear={false} />);
    const proy = document.querySelector<HTMLElement>('[data-celda="d:multi:proy"]');
    expect(proy!.textContent).toContain("$791,373");
  });

  it("un año CERRADO no proyecta nada: siguen los guiones", () => {
    render(<ResumenView {...props} data={resumen({ proyeccion: null })} isClosedYear />);
    expect(celdasGrisEscritorio()).toHaveLength(0);
    expect(document.querySelectorAll("[data-mes-proyectado-grupo]")).toHaveLength(0);
  });

  it("en Utilidad y en Margen no se dibuja ningún mes proyectado", () => {
    render(<ResumenView {...props} data={resumen()} isClosedYear={false} />);
    for (const modo of ["Utilidad", "Margen %"]) {
      fireEvent.click(screen.getAllByRole("tab", { name: modo })[0]);
      expect(celdasGrisEscritorio(), modo).toHaveLength(0);
    }
  });

  it("en Trimestral tampoco: el reparto es MENSUAL", () => {
    render(<ResumenView {...props} data={resumen()} isClosedYear={false} />);
    fireEvent.click(screen.getAllByRole("tab", { name: "Trimestral" })[0]);
    expect(celdasGrisEscritorio()).toHaveLength(0);
    // Y la leyenda del gris tampoco: no hay ningún gris que explicar.
    expect(document.body.textContent).not.toContain(LEYENDA_MESES_PROYECTADOS);
  });
});

describe("celular — el MISMO arreglo de 12 meses de la tarjeta", () => {
  const mobileProps = {
    selectedYear: 2026,
    isClosedYear: false,
    viewMode: "ventas" as const,
    setViewMode: vi.fn(),
    granularity: "mensual" as const,
    setGranularity: vi.fn(),
    anualData: null,
    anualError: null,
    onOpenEmpresa: vi.fn(),
    onAbrirFila: vi.fn(),
    filaDetalle: null,
    onCerrarFila: vi.fn(),
    multiMayoreoNota: null,
  };

  it("al abrir la tarjeta, oct-nov-dic traen su monto en gris", () => {
    render(<ResumenViewMobile {...mobileProps} data={resumen()} />);
    fireEvent.click(screen.getAllByRole("button", { name: /Multifashion/ })[0]);
    const grises = Array.from(document.querySelectorAll<HTMLElement>('[data-mes-proyectado^="m:multi:"]'));
    expect(grises).toHaveLength(3);
    expect(grises.map(e => e.textContent).join(" ")).toContain("$56,399");
    for (const g of grises) {
      expect(g.className).toContain("bg-gray-50");            // fondo tenue
      expect(g.innerHTML).toContain("text-gray-400");         // el monto, en gris
      expect(g.tagName).toBe("DIV"); // no es un botón: no hay nada que abrir
    }
  });

  it("no se inventó una vista nueva: siguen los 12 meses + Total + Proyección", () => {
    render(<ResumenViewMobile {...mobileProps} data={resumen()} />);
    fireEvent.click(screen.getAllByRole("button", { name: /Multifashion/ })[0]);
    const tarjeta = document.querySelector<HTMLElement>('[data-mes-proyectado^="m:multi:"]')!.closest("ul")!;
    expect(within(tarjeta).getAllByText(/^(Ene|Feb|Mar|Abr|May|Jun|Jul|Ago|Sep|Oct|Nov|Dic)$/)).toHaveLength(12);
    expect(within(tarjeta).getByText("Total 2026")).toBeTruthy();
    expect(within(tarjeta).getByText("Proyección")).toBeTruthy();
  });

  it("la tarjeta del Total grupo también trae sus tres meses grises", () => {
    render(<ResumenViewMobile {...mobileProps} data={resumen()} />);
    fireEvent.click(screen.getAllByRole("button", { name: /Total grupo/ })[0]);
    const grises = Array.from(document.querySelectorAll<HTMLElement>('[data-mes-proyectado^="m:__total_grupo__:"]'));
    expect(grises).toHaveLength(3);
    expect(grises[0].textContent).toContain("$65,299");
  });

  it("en Utilidad el celular tampoco dibuja meses grises ni leyenda", () => {
    render(<ResumenViewMobile {...mobileProps} viewMode="utilidad" data={resumen()} />);
    fireEvent.click(screen.getAllByRole("button", { name: /Multifashion/ })[0]);
    expect(document.querySelectorAll('[data-mes-proyectado^="m:"]')).toHaveLength(0);
    expect(document.querySelector('[data-leyenda-proyectado="celular"]')).toBeNull();
  });

  it("la leyenda del gris también está en el celular", () => {
    render(<ResumenViewMobile {...mobileProps} data={resumen()} />);
    expect(screen.getByText(LEYENDA_MESES_PROYECTADOS)).toBeTruthy();
  });

  it("un año cerrado no dibuja meses grises en el celular", () => {
    render(<ResumenViewMobile {...mobileProps} isClosedYear data={resumen({ proyeccion: null })} />);
    fireEvent.click(screen.getAllByRole("button", { name: /Multifashion/ })[0]);
    expect(document.querySelectorAll('[data-mes-proyectado^="m:"]')).toHaveLength(0);
  });
});

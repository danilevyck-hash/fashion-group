// ─────────────────────────────────────────────────────────────────────────────
// VENTAS › RESUMEN — «Cierre del año» sube a tarjeta, y NUNCA se dibuja una
// meta (5-sep-2026).
//
// 🩸 DÓNDE ESTABA. La proyección del grupo vivía en la ÚLTIMA celda de la fila
// negra, al borde derecho de una matriz de 15 columnas que —medido el
// 30-jul-2026— solo entra entera a partir de 1440 px. Para leer en cuánto
// cierra el año había que arrastrar la tabla hasta el final. Es de los cuatro
// números que Daniel mira todos los días y estaba en el peor lugar de la
// pantalla.
//
// ⚠️ LA COLUMNA «Proyección» DE LA TABLA SE QUEDA: ahí se ve empresa por
// empresa, que es otra pregunta. Lo que sube es el número del GRUPO.
//
// 🔴 Y NO SE DIBUJA NINGUNA META. `ventas_proyeccion_cierre_v7` devuelve
// `meta_anual`, `gap_vs_meta` y `status` (rojo/amarillo/verde) desde
// `ventas_metas`. Daniel: *«quita meta, no lo uso, prefiero proyeccion»*.
//
// 🔴 Y LOS MESES QUE NO LLEGARON SE QUEDAN. Daniel dijo que NO a quitarlos: OCT,
// NOV y DIC siguen dibujándose con su guion. Un mes que desaparece de la fila
// hace contar los que quedan para saber cuál falta.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { readFileSync } from "fs";
import path from "path";
import { ResumenView } from "@/components/ventas/ResumenView";
import { ResumenViewMobile } from "@/components/ventas/ResumenViewMobile";
import {
  explicacionProyeccionGrupo, fraccionCumplidaGrupo, deltaProyeccionTexto,
} from "@/lib/ventas/proyeccion-texto";
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

const raiz = path.resolve(__dirname, "../../..");
const leer = (rel: string) => readFileSync(path.join(raiz, rel), "utf8");

// Los NÚMEROS REALES medidos contra producción el 5-sep-2026 (corte 2026-09-05,
// `scripts/_medir-ventas-cuatro-numeros.mjs`): así el candado no prueba una
// aritmética inventada sino la que Daniel de verdad ve.
const PROYECCION = {
  anio: 2026,
  fecha_corte: "2026-09-05",
  mes_corte: 9,
  peso_ritmo: 0.75,
  peso_historico: 0.25,
  empresas: [
    { empresa: "vistana", ventas_prev_ytd_sp: 6_137_868.73 },
  ],
  totales_grupo: {
    ventas_ytd: 6_271_021.43,
    proyeccion_cierre: 11_627_069,
    proyeccion_restante: 5_356_048,
    cierre_anio_anterior_total: 11_415_214,
    delta_vs_anio_anterior_total: 211_855,
    delta_vs_anio_anterior_pct: 0.0186,
    status: "verde",
  },
} as unknown as ProyeccionResp;

const serie = (v: number) => Array.from({ length: 12 }, (_, i) => (i < 9 ? v : null));

function resumen(conProyeccion = true): VentasResumen {
  return {
    year: 2026,
    mesActual: 9,
    kpis: {
      ventasNetasYTD: 6_271_021.43, ventas2025YTD: 6_137_868.73,
      utilidadYTD: 1_801_866.32, utilidad2025YTD: 1_690_000,
      margenYTD: 0.287332, margen2025YTD: 0.275361,
    },
    empresas: [{
      empresa: { id: "vistana", nombre: "Vistana International", tipo: "b2b" } as never,
      ventas2026: serie(696_780), ventas2025: serie(681_985),
      utilidad2026: serie(200_207), utilidad2025: serie(187_777),
      margenPct: 0.287332, margenPctPrev: 0.275361,
    }],
    es_periodo_parcial: true,
    fecha_corte: "2026-09-05",
    dia_corte_anio_anterior: "2025-09-05",
    data_actualizada_at: "2026-09-05T12:00:00Z",
    proyeccion: conProyeccion ? PROYECCION : null,
  } as unknown as VentasResumen;
}

function pintarEscritorio(datos = resumen()) {
  return render(
    <ResumenView
      data={datos} multi={null} availableYears={[2026, 2025]} selectedYear={2026}
      isClosedYear={false} loading={false} error={null} onYearChange={vi.fn()}
    />,
  );
}
function pintarCelular(datos = resumen()) {
  return render(
    <ResumenViewMobile
      data={datos} selectedYear={2026} isClosedYear={false}
      viewMode="ventas" setViewMode={vi.fn()} granularity="mensual" setGranularity={vi.fn()}
      anualData={null} anualError={null} onOpenEmpresa={vi.fn()} onAbrirFila={vi.fn()}
      filaDetalle={null} onCerrarFila={vi.fn()}
    />,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 1 · LA CUARTA TARJETA
// ─────────────────────────────────────────────────────────────────────────────

describe("1 · «Cierre del año» es la cuarta tarjeta, arriba", () => {
  it("escritorio: el número del grupo y su Δ contra el cierre anterior", () => {
    // ⚠️ `ResumenView` monta ADENTRO a `ResumenViewMobile` (uno se esconde con
    // CSS, que en jsdom no corre), así que las dos tarjetas existen a la vez.
    // Que las dos digan el MISMO número es justo lo que hay que sostener.
    pintarEscritorio();
    expect(screen.getByText("CIERRE DEL AÑO")).toBeTruthy();
    expect(screen.getAllByText("$11,627,069").length).toBeGreaterThanOrEqual(1);
    // El delta va en el subtítulo, en plata y no en porcentaje: es lo que se
    // compara contra el cierre real del año pasado.
    const tarjeta = screen.getByText("CIERRE DEL AÑO").closest("div")!;
    expect(tarjeta.textContent).toContain("+$211,855");
    expect(tarjeta.textContent).toContain("vs 2025");
  });

  it("celular: la misma tarjeta, con el mismo número", () => {
    pintarCelular();
    expect(screen.getByText("Cierre del año")).toBeTruthy();
    expect(screen.getAllByText("$11,627,069").length).toBeGreaterThanOrEqual(1);
  });

  it("⚠️ la COLUMNA «Proyección» de la tabla NO se fue", () => {
    // Ahí se ve empresa por empresa, que es otra pregunta. Si desapareciera,
    // subir el total habría costado el detalle.
    pintarEscritorio();
    expect(screen.getAllByText("Proyección").length).toBeGreaterThanOrEqual(1);
  });

  it("en un año CERRADO no hay nada que proyectar y la tarjeta no se dibuja", () => {
    render(
      <ResumenView
        data={{ ...resumen(false), year: 2025 }} multi={null} availableYears={[2025]}
        selectedYear={2025} isClosedYear loading={false} error={null} onYearChange={vi.fn()}
      />,
    );
    expect(screen.queryByText("CIERRE DEL AÑO")).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2 · LA EXPLICACIÓN, MEDIDA — no inventada
// ─────────────────────────────────────────────────────────────────────────────

describe("2 · al tocarla, dice de dónde sale el número", () => {
  it("🔴 la fracción sale del payload de la RPC, no de una regla de tres", () => {
    // Σ `ventas_prev_ytd_sp` de las empresas ÷ `cierre_anio_anterior_total`:
    // literalmente cuánto del año anterior estaba cumplido a esta MISMA altura.
    const g = {
      ventas_ytd: 6_271_021.43,
      proyeccion_cierre: 11_627_069,
      cierre_anio_anterior_total: 11_415_214,
      delta_vs_anio_anterior_total: 211_855,
      ventas_prev_ytd_sp: 6_137_868.73,
    };
    expect(fraccionCumplidaGrupo(g)).toBeCloseTo(6_137_868.73 / 11_415_214, 10);
    const frase = explicacionProyeccionGrupo(g, 2025, { fechaCorte: "2026-09-05" });
    expect(frase).toBe("En 2025 al 5 sep llevabas el 54% del año. Suma la proyección de cada empresa: $11,627,069.");
  });

  it("🔴 sin cierre del año anterior NO se inventa un porcentaje", () => {
    const g = {
      ventas_ytd: 100, proyeccion_cierre: 200,
      cierre_anio_anterior_total: 0, delta_vs_anio_anterior_total: null,
      ventas_prev_ytd_sp: 0,
    };
    expect(fraccionCumplidaGrupo(g)).toBeNull();
    expect(explicacionProyeccionGrupo(g, 2025)).toBe("Suma la proyección de cada empresa: $200.");
  });

  it("sin comparativo, el Δ lo dice con palabras y no con un cero", () => {
    expect(deltaProyeccionTexto(null)).toBe("n/a");
    expect(deltaProyeccionTexto(211_855)).toBe("+$211,855");
    expect(deltaProyeccionTexto(-12_000)).toBe("−$12,000");
  });

  it("la tarjeta se abre y muestra esa frase", () => {
    pintarEscritorio();
    // ⚠️ El ancla dice DE QUÉ VISTA es. `ResumenView` monta adentro al celular,
    // así que un `[data-kpi-proyeccion]` a secas encontraría la tarjeta del
    // otro layout y el candado pasaría con la del escritorio rota — que es
    // exactamente la mutación que se le escapó la primera vez.
    for (const vista of ["escritorio", "celular"]) {
      const boton = document.querySelector(`[data-kpi-proyeccion="${vista}"]`) as HTMLElement;
      expect(boton, `la tarjeta del ${vista} no se puede abrir`).toBeTruthy();
      expect(document.querySelector(`[data-kpi-proyeccion-detalle="${vista}"]`)).toBeNull();
      fireEvent.click(boton);
      expect(document.querySelector(`[data-kpi-proyeccion-detalle="${vista}"]`)!.textContent)
        .toContain("llevabas el 54% del año");
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3 · NINGUNA META, EN NINGUNA PARTE
// ─────────────────────────────────────────────────────────────────────────────

describe("3 · 🔴 no se dibuja una meta en ninguna de las dos vistas", () => {
  // ⚠️ SIN `\b`: el texto del `<body>` viene todo pegado («$11,627,069meta del
  // año»), así que no hay borde de palabra que encontrar y la primera versión de
  // este candado dejó pasar una meta puesta a mano en el subtítulo.
  it("ni la palabra ni el semáforo llegan a la pantalla", () => {
    pintarEscritorio();
    const texto = document.body.textContent ?? "";
    expect(texto).not.toMatch(/meta/i);
    expect(texto).not.toMatch(/gap|semáforo|objetivo del año/i);
  });

  it("y el celular tampoco", () => {
    pintarCelular();
    expect(document.body.textContent ?? "").not.toMatch(/meta/i);
  });

  it("🔴 y el botón «Excel» del Resumen está VISIBLE, adentro de la pestaña", () => {
    // `getAllByRole` respeta el árbol de accesibilidad: un botón con `hidden`
    // —o escondido con `aria-hidden`— no aparece. Es la diferencia entre «el
    // export existe en el archivo» y «se puede tocar».
    pintarEscritorio();
    expect(screen.getAllByRole("button", { name: /Excel/ }).length).toBeGreaterThanOrEqual(1);
  });

  it("🔴 el contrato que viaja al navegador tampoco los trae", () => {
    // `stripMetasProyeccion` los saca en el servidor. Que no se dibujen es la
    // mitad; la otra es que ni siquiera lleguen — si llegan, alguien los pinta.
    const tipos = leer("src/components/ventas/types.ts");
    const proyEmpresa = tipos.slice(
      tipos.indexOf("export type ProyeccionEmpresa = {"),
      tipos.indexOf("export type ProyeccionGrupo = {"),
    );
    for (const campo of ["meta_anual", "gap_vs_meta", "meta_efectiva", "meta_sugerida"]) {
      expect(proyEmpresa, `${campo} no puede estar en el contrato`).not.toMatch(
        new RegExp(`^\\s*${campo}[?:]`, "m"),
      );
    }
    expect(leer("src/lib/ventas/queries.ts")).toContain("stripMetasProyeccion");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4 · LOS MESES QUE NO LLEGARON SE QUEDAN
// ─────────────────────────────────────────────────────────────────────────────

describe("4 · 🔴 OCT, NOV y DIC siguen dibujándose", () => {
  it("la matriz tiene los DOCE meses, con guion en los que no llegaron", () => {
    // Daniel dijo que NO a quitarlos. Un mes que desaparece de la fila obliga a
    // contar los que quedan para saber cuál falta.
    pintarEscritorio();
    const encabezados = [...document.querySelectorAll("thead th")].map((th) => th.textContent?.trim());
    for (const mes of ["Oct", "Nov", "Dic"]) {
      expect(encabezados, `${mes} no puede desaparecer`).toContain(mes);
    }
    // Y sus celdas dicen «—», que es «acá no pasó nada todavía».
    expect(document.body.textContent).toContain("—");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5 · EL MARGEN, SIN DECIMAL
// ─────────────────────────────────────────────────────────────────────────────

describe("5 · el margen del grupo va sin decimal (diccionario § 0, #5)", () => {
  it("28,7332 % se pinta «29%» — el VALOR no se movió, el formateo sí", () => {
    pintarEscritorio();
    const tarjeta = screen.getByText("MARGEN PROMEDIO").closest("div")!;
    expect(tarjeta.textContent).toContain("29%");
    expect(tarjeta.textContent).not.toContain("28.7%");
    // ⚠️ Los PUNTOS conservan su decimal: son una DIFERENCIA entre dos
    // porcentajes, y a cero decimales «+0.4 pts» se leería como «no cambió».
    expect(tarjeta.textContent).toContain("pts");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// LOS RÓTULOS DE VENTAS, EN ESPAÑOL SIMPLE — y el año que compara, el REAL.
//
// Daniel no es programador ni contador, y toda la app está en español simple.
// En Ventas quedaban cuatro cosas que no lo estaban:
//
//   1. "VENTAS NETAS YTD" / "UTILIDAD YTD" — `YTD` es *year to date*, jerga en
//      inglés. Y en el CELULAR decía "Ventas YTD · +12% vs '25" SIN DECIR QUÉ
//      MESES: la cifra grande y su cambio no significan nada si no se sabe
//      contra qué período se miran.
//   2. "Ver detalle de huérfanos sin master" en la tarjeta del celular —
//      vocabulario de base de datos— mientras en escritorio el MISMO renglón
//      decía "click para ver detalle". Dos textos para el mismo botón.
//   3. "CXC actual" / "Ver en CXC" en la ficha del cliente, cuando en todo el
//      resto del sistema esa pantalla se llama "Cuentas por Cobrar".
//   4. 🔴 "Δ vs 2025" ESCRITO A MANO. Con 2025 elegido arriba, la pantalla
//      decía "Compras 2025 · Δ vs 2025" y la columna comparaba contra 2024: el
//      rótulo afirmaba lo contrario de lo que mostraba. El año ahora se DERIVA
//      del mismo dato que hace la división.
//
// Son candados de CONDUCTA: se RENDERIZA la pantalla y se lee lo que quedó
// dibujado. Un barrido de texto sobre el archivo se cumple con el comentario
// que explica el cambio — este repo ya lo pagó cuatro veces.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, within, fireEvent } from "@testing-library/react";
import { ClientesView } from "@/components/ventas/ClientesView";
import { ResumenViewMobile } from "@/components/ventas/ResumenViewMobile";
import { ResumenView } from "@/components/ventas/ResumenView";
import ClienteDetail, { type ClienteDetailData } from "@/app/clientes/[codigo]/ClienteDetail";
import type { Clientes, Cliente, VentasResumen } from "@/components/ventas/types";
import { existsSync, readFileSync } from "fs";
import path from "path";

vi.mock("@/lib/hooks/useAuth", () => ({
  useAuth: () => ({ authChecked: true, role: "admin", userName: "Daniel" }),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/ventas",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
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

// ── Fixtures ────────────────────────────────────────────────────────────────

const cliente = (over: Partial<Cliente> = {}): Cliente => ({
  rank: 1, id: "D-01", nombre: "CLIENTE UNO", empresa: "Vistana International",
  empresaKey: "vistana", ytd: 1000, delta: 0.18, ultima: "12 ago 2026",
  ultimaIso: "2026-08-12", empresas_count: 1, wa: "", ...over,
});

function clientes(over: Partial<Clientes> = {}): Clientes {
  const rows = [cliente(), cliente({ rank: 2, id: "D-02", nombre: "CLIENTE DOS", delta: -0.4 })];
  return { total: rows.length, pageSize: rows.length, rows, ...over };
}

const serie = (v: number) => Array.from({ length: 12 }, (_, i) => (i < 8 ? v : null));

function resumen(): VentasResumen {
  return {
    year: 2026,
    mesActual: 8,
    kpis: {
      ventasNetasYTD: 500000, ventas2025YTD: 446000,
      utilidadYTD: 150000, utilidad2025YTD: 130000,
      margenYTD: 0.3, margen2025YTD: 0.29,
    },
    empresas: [{
      empresa: { id: "vist", name: "Vistana International", key: "vistana" } as never,
      ventas2026: serie(60000), ventas2025: serie(55000),
      utilidad2026: serie(18000), utilidad2025: serie(16000),
      margenPct: 0.3, margenPctPrev: 0.29,
    }],
    es_periodo_parcial: true,
    fecha_corte: "2026-08-24",
    dia_corte_anio_anterior: "2025-08-24",
    data_actualizada_at: "2026-08-24T12:00:00Z",
    proyeccion: null,
  };
}

function pintarMobileKpis(datos = resumen()) {
  return render(
    <ResumenViewMobile
      data={datos}
      selectedYear={datos.year}
      isClosedYear={false}
      viewMode="ventas"
      setViewMode={vi.fn()}
      granularity="mensual"
      setGranularity={vi.fn()}
      anualData={null}
      anualError={null}
      onOpenEmpresa={vi.fn()}
      onAbrirFila={vi.fn()}
      filaDetalle={null}
      onCerrarFila={vi.fn()}
    />,
  );
}

/** Las tres tarjetas de la grilla de KPIs del celular, en orden. */
function tarjetasKpi(): HTMLElement[] {
  const linea = document.querySelector("[data-periodo-kpis]");
  const grilla = linea?.nextElementSibling;
  return [...(grilla?.children ?? [])] as HTMLElement[];
}

// ─────────────────────────────────────────────────────────────────────────────

describe("1 · «YTD» se fue, y el celular DICE qué meses está mirando", () => {
  it("las tres tarjetas del celular se llaman por su nombre, sin la sigla", () => {
    pintarMobileKpis();
    // Acotado a la grilla de KPIs: "Ventas" también rotula el toggle de la
    // matriz, y un getByText suelto encontraría el equivocado.
    const rotulos = tarjetasKpi().map(t => (t.querySelector("p")?.textContent ?? "").trim());
    expect(rotulos).toEqual(["Ventas", "Utilidad", "Margen"]);
    expect(document.body.textContent).not.toContain("YTD");
  });

  it("🔴 el período va A LA VISTA, con sus meses y su año", () => {
    pintarMobileKpis();
    const linea = document.querySelector("[data-periodo-kpis]")!;
    expect(linea.textContent).toContain("Ene–Ago 2026");
    expect(linea.textContent).toContain("comparado con 2025");
  });

  it("el año del cambio va completo, no cortado con apóstrofo", () => {
    pintarMobileKpis();
    expect(document.body.textContent).toContain("vs 2025");
    expect(document.body.textContent).not.toContain("vs '25");
  });

  it("un año CERRADO lo dice con su año, no «Año completo» a secas", () => {
    const datos = { ...resumen(), year: 2025, mesActual: 12 };
    render(
      <ResumenViewMobile
        data={datos} selectedYear={2025} isClosedYear
        viewMode="ventas" setViewMode={vi.fn()} granularity="mensual" setGranularity={vi.fn()}
        anualData={null} anualError={null} onOpenEmpresa={vi.fn()} onAbrirFila={vi.fn()}
        filaDetalle={null} onCerrarFila={vi.fn()}
      />,
    );
    const linea = document.querySelector("[data-periodo-kpis]")!;
    expect(linea.textContent).toContain("Año 2025 completo");
  });
});

describe("2 · el mismo renglón dice la misma frase en las dos pantallas", () => {
  const conOtros = () => clientes({
    rows: [
      cliente(),
      cliente({ rank: 2, id: "—", nombre: "Otros clientes (3)", isOtrosAggregate: true, ytd: 500, delta: 0.1 }),
    ],
  });

  it("ni «huérfanos» ni «master» aparecen en pantalla", () => {
    render(<ClientesView data={conOtros()} selectedYear={2026} isClosedYear={false} modo="ventas" onModo={() => {}} />);
    expect(document.body.textContent).not.toMatch(/huérfano/i);
    expect(document.body.textContent).not.toMatch(/sin master/i);
  });

  it("🔁 escritorio y celular dicen EXACTAMENTE lo mismo — ahora, cuántos son", () => {
    // Decía que las dos pantallas tenían que decir «Tocar para ver el detalle»,
    // la pista del diálogo. El diálogo se retiró el 5-sep-2026: esos clientes
    // van en la lista, y el renglón que los separa dice cuántos son.
    //
    // Lo que este test siempre miró NO cambió: que el MISMO renglón diga la
    // MISMA frase en las dos pantallas. Antes eran dos textos distintos («click
    // para ver detalle» y «Ver detalle de huérfanos sin master») y quien lo
    // aprendía en el celular no lo reconocía en la computadora.
    const conHuerfano = clientes({
      rows: [cliente(), cliente({ id: "SIN-COD", nombre: "SIN CÓDIGO", isOrphan: true, ytd: 500, delta: 0.1 })],
    });
    render(<ClientesView data={conHuerfano} selectedYear={2026} isClosedYear={false} modo="ventas" onModo={() => {}} />);
    // Los dos layouts se montan a la vez en jsdom (uno se esconde con CSS), así
    // que si hubiera dos frases distintas aparecerían las dos.
    const dichos = screen.getAllByText(/Otros clientes \(1\) · todavía no están en el directorio/);
    expect(dichos.length).toBeGreaterThanOrEqual(2);
    expect(document.body.textContent).not.toContain("click para ver detalle");
    expect(document.body.textContent).not.toContain("Tocar para ver el detalle");
  });
});

describe("3 · «Δ vs 2025» deja de mentir: el año sale del dato que hace la cuenta", () => {
  it("con 2026 elegido compara contra 2025", () => {
    render(<ClientesView data={clientes({ anioComparativo: 2025 })} selectedYear={2026} isClosedYear={false} modo="ventas" onModo={() => {}} />);
    expect(screen.getByText("vs 2025")).toBeTruthy();
  });

  it("🔴 con 2025 elegido dice 2024 — que es contra lo que compara de verdad", () => {
    render(<ClientesView data={clientes({ anioComparativo: 2024 })} selectedYear={2025} isClosedYear modo="ventas" onModo={() => {}} />);
    expect(screen.getByText("vs 2024")).toBeTruthy();
    // El bug era éste: el encabezado decía "2025" al lado de "Compras 2025".
    expect(screen.queryByText("vs 2025")).toBeNull();
    expect(screen.queryByText(/Δ vs 2025/)).toBeNull();
  });

  it("la pantalla DICE contra qué compara, no lo deja en un símbolo", () => {
    render(<ClientesView data={clientes({ anioComparativo: 2024 })} selectedYear={2025} isClosedYear modo="ventas" onModo={() => {}} />);
    const lineas = [...document.querySelectorAll("[data-comparativo-clientes]")];
    expect(lineas.length).toBeGreaterThanOrEqual(1);
    for (const l of lineas) {
      expect(l.textContent).toContain("mismo período de 2024");
    }
  });

  it("un payload viejo de la caché (sin el campo) cae a `selectedYear − 1`, que da lo mismo", () => {
    const sinCampo = clientes();
    delete (sinCampo as { anioComparativo?: number }).anioComparativo;
    render(<ClientesView data={sinCampo} selectedYear={2025} isClosedYear modo="ventas" onModo={() => {}} />);
    expect(screen.getByText("vs 2024")).toBeTruthy();
  });

  it("la «Δ» no vuelve como rótulo suelto", () => {
    render(<ClientesView data={clientes({ anioComparativo: 2025 })} selectedYear={2026} isClosedYear={false} modo="ventas" onModo={() => {}} />);
    expect(document.body.textContent).not.toContain("Δ vs");
  });
});

describe("4 · ⚠️ lo que NO cambió", () => {
  it("la columna de compras sigue diciendo el año elegido", () => {
    render(<ClientesView data={clientes({ anioComparativo: 2025 })} selectedYear={2026} isClosedYear={false} modo="ventas" onModo={() => {}} />);
    expect(screen.getByText("Compras 2026")).toBeTruthy();
  });

  it("las cifras de las tarjetas del celular no se movieron", () => {
    pintarMobileKpis();
    // $500.000 de venta y 30% de margen, tal como los manda el servidor.
    // 🔁 Sin decimal desde el 5-sep-2026 (diccionario § 0, #5): antes «30.0%».
    // El VALOR no se movió — solo el formateo, que ahora pasa por
    // `fmtPorcentaje`, la única definición del módulo.
    expect(document.body.textContent).toContain("30%");
    const tarjetas = tarjetasKpi();
    expect(tarjetas.length).toBe(3);
    expect(within(tarjetas[0]).getByText("Ventas")).toBeTruthy();
  });
});

describe("5 · la ficha del cliente deja de usar la sigla y la jerga", () => {
  // ⚠️ CAMBIÓ DE FORMA EL 5-sep-2026, no de regla. La ficha se rediseñó: la
  // tabla pasó a `Empresa · <año> · <año-1> · vs · Debe` (se retiró la columna
  // «Cobrado», que no usaba nadie) y arriba aparecieron las cuatro tarjetas.
  // Lo que este bloque protege es lo MISMO de antes: **cero siglas y cero
  // jerga en inglés** en la única página de cliente que abren todos los roles.
  const FICHA: ClienteDetailData = {
    cliente: {
      id: "u-1", codigo: "D-01", nombre: "CLIENTE UNO", razon_social: null,
      identificacion: null, dv: null, provincia: null, telefono: null,
      celular: null, email: null, notas: null, last_synced_at: null,
      updated_at: null, created_at: null,
    },
    anio: 2026,
    empresas: [{ empresa: "vistana", compras: 1000, comprasAnterior: 800, debe: 200 }],
    compras_brutas: 1000,
    ultima_compra: "2026-08-12",
    ultimo_pago: null,
    pagos_por_fecha: [],
    documentos_con_saldo: 0,
    aging: [],
  };

  const pintar = () => render(<ClienteDetail initialData={FICHA} />);

  it("«CXC» no aparece como rótulo: la pantalla se llama Cuentas por Cobrar", () => {
    pintar();
    expect(screen.queryByText("CXC actual")).toBeNull();
    expect(screen.queryByText(/Ver en CXC/)).toBeNull();
    expect(document.body.textContent).not.toMatch(/\bCXC\b/);
    expect(screen.getByText(/Ver en Cuentas por Cobrar/)).toBeTruthy();
  });

  it("«YTD» no aparece en ningún rótulo de la ficha", () => {
    pintar();
    expect(document.body.textContent).not.toContain("YTD");
  });

  it("las columnas dicen el año con todas sus cifras", () => {
    pintar();
    expect(screen.getByText("Compró 2026")).toBeTruthy();
    // Los encabezados de la tabla: el año y el año pasado, enteros.
    expect(screen.getAllByText("2026").length).toBeGreaterThan(0);
    expect(screen.getAllByText("2025").length).toBeGreaterThan(0);
    expect(screen.getByText("vs 2025")).toBeTruthy();
  });

  it("⚠️ la explicación de por qué las cifras NO cuadran sigue ahí, con las columnas de HOY", () => {
    pintar();
    // NO SE BORRA NUNCA: sin ella la tabla se lee como un error de la app. Y
    // hace más falta que antes, porque la tarjeta «Debe» divide una cifra por
    // la otra («el 38% de lo que te compró»).
    fireEvent.click(screen.getByRole("button", { name: /Por qué las cifras no cuadran/i }));
    const ayuda = screen.getByText(/va sin ITBMS/).closest("div")!;
    expect(ayuda.textContent).toContain("Compró");
    expect(ayuda.textContent).toContain("Debe");
    expect(ayuda.textContent).not.toMatch(/\bCXC\b/);
    // La columna que se retiró no puede volver por la puerta de atrás.
    expect(ayuda.textContent).not.toContain("Cobrado");
  });

  it("⚠️ las cifras de la tabla no se movieron", () => {
    pintar();
    // $1,000.00 comprado este año · $800.00 el año pasado · $200.00 por cobrar.
    const texto = document.body.textContent ?? "";
    expect(texto).toContain("1,000.00");
    expect(texto).toContain("800.00");
    expect(texto).toContain("200.00");
  });
});

describe("6 · el ESCRITORIO también dejó la sigla", () => {
  const pintarEscritorio = (year = 2026, cerrado = false) => {
    const datos = { ...resumen(), year, mesActual: cerrado ? 12 : 8 };
    return render(
      <ResumenView
        data={datos} multi={null} availableYears={[2026, 2025]}
        selectedYear={year} isClosedYear={cerrado} loading={false} error={null}
        onYearChange={vi.fn()}
      />,
    );
  };

  it("🔴 las tarjetas se llaman por su nombre, sin «YTD»", () => {
    pintarEscritorio();
    expect(screen.getByText("VENTAS NETAS")).toBeTruthy();
    expect(screen.getByText("UTILIDAD")).toBeTruthy();
    expect(screen.queryByText(/YTD/)).toBeNull();
  });

  it("el período va debajo de cada cifra, con sus meses y su año", () => {
    pintarEscritorio();
    // ⚠️ `ResumenView` monta TAMBIÉN la vista de celular (se esconde con CSS),
    // así que hay que quedarse con los subtítulos del escritorio: los del
    // celular dicen su período en la línea de arriba, no adentro de la tarjeta.
    const escritorio = document.querySelector(".min-\\[1440px\\]\\:block")!;
    const subs = [...escritorio.querySelectorAll("p")]
      .map(p => p.textContent ?? "")
      .filter(t => t.includes("vs 2025"));
    // Los TRES subtítulos lo dicen: si uno se quedara sin período, la misma
    // fila respondería "¿de cuándo?" de dos maneras distintas.
    expect(subs.length).toBe(3);
    for (const t of subs) expect(t).toContain("Ene–Ago 2026");
  });

  it("🔴 un año CERRADO dice CUÁL, no «Año completo» a secas", () => {
    pintarEscritorio(2025, true);
    expect(document.body.textContent).toContain("Año 2025 completo");
    expect(document.body.textContent).not.toMatch(/(^|[^0-9])Año completo/);
  });

  it("⚠️ las cifras del escritorio no se movieron", () => {
    pintarEscritorio();
    const texto = document.body.textContent ?? "";
    // 🔁 Sin decimal desde el 5-sep-2026 (diccionario § 0, #5): «30%».
    expect(texto).toContain("30%");       // margen
    expect(texto).toContain("500,000");   // ventas netas
  });
});

// 🔁 CAMBIÓ DE DIRECCIÓN el 5-sep-2026. Decía que el DIÁLOGO de «Otros
// clientes» tenía que decir el año real contra el que compara.
//
// Ya no hay diálogo: esos clientes van EN LA LISTA, bajo un renglón que los
// separa y los cuenta (Daniel, sobre abrirlo: *«si y si»*). El año contra el
// que compara lo dice el encabezado de la columna de la propia lista —que es
// justo lo que los dos casos de arriba, «5 · la columna dice el año REAL», ya
// exigen— así que la regla no se perdió: se cumple en un solo lugar en vez de
// dos.
describe("7 · 🔁 el diálogo de «Otros clientes» se retiró: van en la lista", () => {
  it("ni el componente ni su montaje existen", () => {
    const raiz = path.resolve(__dirname, "../../..");
    expect(existsSync(path.join(raiz, "src/components/ventas/OtrosClientesDialog.tsx"))).toBe(false);
    const vista = readFileSync(path.join(raiz, "src/components/ventas/ClientesView.tsx"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");
    expect(vista).not.toContain("OtrosClientesDialog");
  });

  it("🔴 y esos clientes se pintan, con su renglón que los cuenta", () => {
    const conHuerfano = clientes({ anioComparativo: 2024 });
    conHuerfano.rows = [
      ...conHuerfano.rows,
      cliente({ id: "SIN-COD", nombre: "SIN CÓDIGO", delta: 0.2, isOrphan: true, ytd: 500 }),
    ];
    render(<ClientesView data={conHuerfano} selectedYear={2025} isClosedYear modo="ventas" onModo={() => {}} />);
    // El cliente está EN LA LISTA (dos renders: tabla y tarjeta).
    expect(screen.getAllByText("SIN CÓDIGO").length).toBeGreaterThanOrEqual(1);
    // Y el renglón que los separa dice cuántos son.
    expect(screen.getAllByText(/Otros clientes \(1\)/).length).toBeGreaterThanOrEqual(1);
    // El año comparativo lo sigue diciendo el encabezado de la columna.
    expect(screen.getByText("vs 2024")).toBeTruthy();
  });
});

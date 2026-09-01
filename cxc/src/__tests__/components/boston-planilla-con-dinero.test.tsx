// ─────────────────────────────────────────────────────────────────────────────
// 🔴 LA PLANILLA DE BOSTON DIBUJA LA PLATA — y sigue aguantando el flag apagado.
//
// `VE_SUELDOS_DE_BOSTON` pasó a `true` (31-ago-2026) y la API empezó a mandar
// `dinero` y `totales`. La pantalla los ignoraba: tipaba las filas como
// `LineaSinDinero` y tenía cinco columnas de horas, ninguna de plata.
//
// Este archivo RENDERIZA la pestaña y lee el DOM. Un barrido de texto no puede
// ver lo único que importa —qué llegó a la tabla— y en este repo ya se cumplió
// cuatro veces con el comentario que explicaba el cambio.
//
// Las DOS direcciones pesan igual:
//   1. con `dinero` → las 18 columnas del grupo, en su orden, y el pie de TOTAL;
//   2. con `sinSueldos: true` → la tabla vuelve sola a las 5 de horas, sin un
//      solo `$`. Si el flag se apaga, la pantalla no puede romperse.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import PlanillaBoston from "@/app/boston/tabs/PlanillaBoston";


// ─────────────────────────────────────────────────────────────────────────────
// DOBLE DEL SELECTOR DE RANGO.
//
// 🔴 Desde el 1-sep-2026 la planilla abre VACÍA: no pide nada hasta que alguien
// elige el período (*«la quincena se paga según el rango de fecha
// seleccionado»*). Estos casos necesitan datos, así que primero eligen.
//
// 🩸 Va un doble y no el control real porque el control carga el calendario con
// `dynamic()`, y bajo vitest eso NO resuelve: el diálogo abre y no hay un solo
// `data-day` que tocar. Su conducta —ancla, cierre, orden invertido— se prueba
// sobre el componente real en `rango-fechas-calendario.test.tsx`.
vi.mock("@/components/ui/RangoFechas", () => ({
  __esModule: true,
  default: ({ desde, hasta, vacio, onChange }: {
    desde: string; hasta: string; vacio?: boolean;
    onChange: (d: string, h: string) => void;
  }) => (
    <button type="button" onClick={() => onChange(desde, hasta)}>
      {vacio ? "Elegí el período" : `${desde} – ${hasta}`}
    </button>
  ),
}));

/** Las 18 columnas, en el orden EXACTO de `PlanillaTab` (la del grupo). */
const COLUMNAS = [
  "Salario\nquincenal", "Extra\n1.25", "Ausen-\ncias", "Tar-\ndanzas",
  "Extra\n1.50", "Exce-\ndente", "Domin-\ngos", "Feria-\ndos", "Total\nbruto",
  "Seguro\nsocial", "Seguro\neducativo", "ISR", "Prés-\ntamo", "Ter-\nceros",
  "Mercan-\ncía", "Total\ndeducc.", "Otros\nservicios (+)", "Neto a\npagar",
];

const horas = { extraDiurnoMin: 60, extraNocturnoMin: 0, tardanzaMin: 0, ausenciaMin: 0 };

/** Los montos REALES de ALEJANDRA CAMAÑO, quincena 1-15 ago 2026 (producción). */
const DINERO_REAL = {
  rataHora: 0, valorMinuto: 0,
  salarioQuincenal: 261.74, extraDiurno: 2.83, ausencias: 2.31, tardanzas: 1.94,
  extraNocturno: 0, excedente: 0, domingos: 0, feriados: 0, totalBruto: 260.32,
  ausenciaPorTardanza: 0, ausenciaDeDiaCompleto: 0, vacacionesYaPagadas: 0,
  baseSeguros: null, seguroSocial: 25.38, seguroEducativo: 3.25, isr: 0,
  prestamo: 10, terceros: 0, mercancia: 0, totalDeducciones: 38.63,
  otrosServicios: 0, netoPagar: 221.69,
};

const fila = (extra: Record<string, unknown> = {}) => ({
  codigo: "1", etiqueta: "ALEJANDRA CAMAÑO", nombre: "ALEJANDRA", empresa: "confecciones_boston",
  empresaEtiqueta: "Confecciones Boston", jornadaSemanal: 48, horas,
  faltaConfigurar: [], fueraDePlanilla: false, noMarcaReloj: false,
  decidirAMano: null, extraMedido: null, extraAprobada: true, ...extra,
});

const TOTALES = {
  personas: 1, fueraDePlanilla: 0, sinConfigurar: 0, decidirAMano: 0,
  ...DINERO_REAL,
};

/** Responde siempre lo mismo, y GUARDA cada URL: hay un caso que cuenta las
 *  llamadas que NO se hicieron. */
function responder(cuerpo: Record<string, unknown>) {
  const llamadas: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    llamadas.push(String(url));
    return { ok: true, status: 200, json: async () => cuerpo };
  }) as unknown as typeof fetch);
  return llamadas;
}

// 🔴 LA PLANILLA DE BOSTON ABRE VACÍA (1-sep-2026), igual que la del grupo: no
// pide nada hasta que alguien elige el período. Daniel, textual: *«la quincena
// se paga según el rango de fecha seleccionado»* — abrir mostrando plata de un
// período que nadie eligió es lo que no puede pasar, porque su corte de
// quincena es variable (a veces del 28 al 10).
//
// Así que todo caso que necesite datos hace primero lo que hace la persona:
// tocar el control y elegir. El doble contesta con el rango que ya tiene
// puesto, que es la quincena en curso.
//
// 🩸 `getAllByRole(...)[0]`, no `getByRole`: en jsdom no hay Tailwind, así que
// las vistas `lg:hidden` y `hidden lg:block` se montan LAS DOS y `getByRole`
// revienta con «Found multiple elements».
function elegirPeriodo() {
  fireEvent.click(screen.getAllByRole("button", { name: /Elegí el período/ })[0]);
}

beforeEach(() => vi.useRealTimers());
afterEach(() => vi.unstubAllGlobals());

// ═════════════════════════════════════════════════════════════════════════════
// 🔴 LA CONDUCTA NUEVA (1-sep-2026): NO SE PIDE NADA HASTA QUE HAY PERÍODO.
//
// Daniel, textual: *«la quincena se paga según el rango de fecha
// seleccionada»*. Su corte de quincena es VARIABLE —a veces del 28 al 10—, así
// que abrir mostrando la plata de un período que nadie eligió no es una
// comodidad: es afirmar un pago que nadie pidió, con nombres y montos.
//
// El candado va acá y no solo sobre `PlanillaTab` porque son DOS pantallas
// distintas: la de Boston es la que ve David, y es la que tiene los sueldos
// abiertos desde el 31-ago-2026. Que una arranque vacía no dice nada de la otra.
describe("🔴 abre VACÍA: la plata no se muestra sin período elegido", () => {
  const CON_DINERO = {
    empresaEtiqueta: "Confecciones Boston",
    lineas: [fila({ dinero: DINERO_REAL, manuales: {}, salarioMensual: 550 })],
    totales: TOTALES,
    avisos: {},
  };

  it("🔴 al montar NO se pide la planilla — cero llamadas a la ruta", async () => {
    const llamadas = responder(CON_DINERO);
    render(<PlanillaBoston />);
    // Se espera a que la pantalla se asiente: si hubiera un efecto que carga
    // solo, ya habría corrido para cuando el control se puede leer.
    await waitFor(() =>
      expect(screen.getAllByRole("button", { name: /Elegí el período/ }).length)
        .toBeGreaterThan(0));
    expect(llamadas.filter((u) => u.includes("/api/asistencia/planilla"))).toEqual([]);
  });

  it("🔴 y en vez del cuadro dice qué hacer: «Elegí el período que vas a pagar»", async () => {
    responder(CON_DINERO);
    render(<PlanillaBoston />);
    expect(await screen.findByText(/Elegí el período que vas a pagar/)).toBeTruthy();
    // Ni un símbolo de plata antes de elegir: el vacío no es «no hay datos», es
    // que todavía no se sabe QUÉ período se está pagando.
    expect(document.body.textContent ?? "").not.toMatch(/\$/);
    expect(screen.queryByText(/ALEJANDRA CAMAÑO/)).toBeNull();
  });

  it("y recién al elegirlo aparece el cuadro, pedido por ESE rango", async () => {
    const llamadas = responder(CON_DINERO);
    render(<PlanillaBoston />);
    elegirPeriodo();
    await waitFor(() => expect(screen.getAllByText("$221.69").length).toBeGreaterThan(0));
    const pedido = llamadas.find((u) => u.includes("/api/asistencia/planilla"))!;
    expect(pedido).toContain("desde=");
    expect(pedido).toContain("hasta=");
    // Y el cartel del vacío se fue: ya hay un período que mirar.
    expect(screen.queryByText(/Elegí el período que vas a pagar/)).toBeNull();
  });
});

describe("🔴 con los sueldos abiertos", () => {
  const CON_DINERO = {
    empresaEtiqueta: "Confecciones Boston",
    lineas: [fila({ dinero: DINERO_REAL, manuales: {}, salarioMensual: 550, quincenalReferencia: 275 })],
    totales: TOTALES,
    avisos: {},
  };

  it("dibuja las 18 columnas del grupo, en su orden", async () => {
    responder(CON_DINERO);
    render(<PlanillaBoston />);
    elegirPeriodo();
    await waitFor(() => expect(screen.getAllByRole("columnheader").length).toBeGreaterThan(5));
    const th = screen.getAllByRole("columnheader").map((e) => e.textContent);
    expect(th[0]).toBe("Persona");
    expect(th.slice(1)).toEqual(COLUMNAS);
  });

  it("🔴 los montos salen al centavo, con el mismo formato del grupo", async () => {
    responder(CON_DINERO);
    render(<PlanillaBoston />);
    elegirPeriodo();
    // 🩸 `getAllByText`, no `getByText`: en jsdom no hay Tailwind, así que las
    // DOS vistas (tarjetas `lg:hidden` y tabla `hidden lg:block`) se montan a la
    // vez y el neto aparece dos veces. `getByText` revienta con dos matches.
    await waitFor(() => expect(screen.getAllByText("$221.69").length).toBeGreaterThan(0));
    // El neto, el bruto y una deducción — los tres tal como la API los manda.
    expect(screen.getAllByText("$260.32").length).toBeGreaterThan(0);
    expect(screen.getAllByText("$25.38").length).toBeGreaterThan(0);
    // Y el cero se dibuja «—», nunca «$0.00»: es la regla de `$$`.
    expect(screen.queryByText("$0.00")).toBeNull();
  });

  it("tiene pie de TOTAL, como la planilla del grupo", async () => {
    responder(CON_DINERO);
    render(<PlanillaBoston />);
    elegirPeriodo();
    await waitFor(() => expect(screen.getByText(/TOTAL · 1 persona/)).toBeTruthy());
  });

  it("⚠️ el pie «los sueldos los lleva contabilidad» YA NO se dibuja", async () => {
    responder(CON_DINERO);
    render(<PlanillaBoston />);
    elegirPeriodo();
    await waitFor(() => expect(screen.getByText(/TOTAL/)).toBeTruthy());
    expect(screen.queryByText(/los sueldos los lleva contabilidad/i)).toBeNull();
  });

  it("🔴 una fila SIN dinero no se rellena con ceros: dice por qué", async () => {
    responder({
      ...CON_DINERO,
      lineas: [
        CON_DINERO.lineas[0],
        fila({ codigo: "53", etiqueta: "GABRIELA JARAMILLO", dinero: null,
               decidirAMano: "entró el 4 de agosto de 2026" }),
      ],
    });
    render(<PlanillaBoston />);
    elegirPeriodo();
    await waitFor(() => expect(screen.getAllByText(/entró el 4 de agosto de 2026/).length).toBeGreaterThan(0));
  });
});

describe("🔴 y si el flag vuelve a `false`, la pantalla NO se rompe", () => {
  const SIN_DINERO = {
    empresaEtiqueta: "Confecciones Boston",
    lineas: [fila()],           // sin `dinero`, como recorta el servidor
    sinSueldos: true,
    avisos: {},
  };

  it("vuelve a las 5 columnas de horas", async () => {
    responder(SIN_DINERO);
    render(<PlanillaBoston />);
    elegirPeriodo();
    await waitFor(() => expect(screen.getAllByRole("columnheader").length).toBe(5));
    expect(screen.getAllByRole("columnheader").map((e) => e.textContent))
      .toEqual(["Persona", "Extra 1,25", "Extra 1,50", "Tarde", "Ausencia"]);
  });

  it("⛔ y NI UN símbolo de dinero llega a la pantalla", async () => {
    responder(SIN_DINERO);
    render(<PlanillaBoston />);
    elegirPeriodo();
    await waitFor(() => expect(screen.getAllByRole("columnheader").length).toBe(5));
    expect(document.body.textContent ?? "").not.toMatch(/\$/);
  });

  it("ahí SÍ se explica por qué no hay plata", async () => {
    responder(SIN_DINERO);
    render(<PlanillaBoston />);
    elegirPeriodo();
    await waitFor(() => expect(screen.getByText(/los sueldos los lleva contabilidad/i)).toBeTruthy());
  });
});

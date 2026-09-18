/**
 * ─────────────────────────────────────────────────────────────────────────────
 * 🔴 ENCONTRAR RÁPIDO LOS DÍAS A REVISAR (18-sep-2026)
 *
 * Daniel, textual, sobre el mockup de cuatro cuadros: *«opcion a con mockup»* y
 * *«si y nada más el botón de "Solo a revisar"»*.
 *
 * DOS cosas, y nada más que esas dos:
 *
 *   1. El número de la columna «A revisar» es un ENLACE: se toca y se abre a
 *      esa persona con SOLO esos días.
 *   2. Un botón **«Solo a revisar»** al lado del buscador deja en la tabla
 *      únicamente a quien tiene algo.
 *
 * 🔴 LO QUE NO SE HACE: partir la columna en «marcó de más» y «le falta una
 * marca». Se le ofreció (era la opción B del mockup) y dijo que no.
 *
 * 🔴 NINGÚN NÚMERO DE PLATA CAMBIA. Este archivo no toca `reporte.ts` ni la
 * planilla: lo único que se mueve es qué filas y qué días se DIBUJAN.
 *
 * 🔴 POR QUÉ SE RENDERIZA Y NO ALCANZA CON LAS FUNCIONES PURAS: que
 * `soloConDiasARevisar` devuelva dos personas no prueba que el pie de la tabla
 * sume sobre esas dos, ni que el filtro se escriba con `replace`, ni que la
 * fila sin días muestre un guion en vez de un enlace. Lo que se sostiene acá es
 * lo que Daniel ve.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor, within } from "@testing-library/react";
import { ToastProvider } from "@/components/ToastSystem";
import { REGLAS_DEFAULT } from "@/lib/asistencia/config";
import { enlaceDiasDe } from "@/lib/asistencia/marcas-impares";
import {
  PARAM_DIAS_DE, PARAM_SOLO_A_REVISAR, ROTULO_SOLO_A_REVISAR, VACIO_SIN_A_REVISAR,
  VALOR_PRENDIDO, VER_A_TODOS,
  conteoARevisar, diasARevisarDe, enlaceDiasARevisarDe, filtroPrendido,
  rotuloDescarga, soloConDiasARevisar, textoSoloEstosDias, tieneDiasARevisar,
} from "@/lib/asistencia/solo-a-revisar";

// El acomodo nuevo está prendido en producción desde el 11-sep-2026.
vi.hoisted(() => { process.env.NEXT_PUBLIC_PERSONA_EN_EL_CENTRO = "1"; });

// ── El doble del router ──────────────────────────────────────────────────────
// `REEMPLAZOS` guarda lo que se escribió con `replace`; `EMPUJES`, lo que se
// escribió con `push`. 🔴 El filtro es del MISMO nivel: `push` tiene que quedar
// vacío o el Atrás del navegador cicla por cada toque.
let URL_ACTUAL = "";
const REEMPLAZOS: string[] = [];
const EMPUJES: string[] = [];
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn((u: string) => { EMPUJES.push(String(u)); }),
    replace: vi.fn((u: string) => {
      REEMPLAZOS.push(String(u));
      // La URL de verdad cambia: así el componente lee lo que acaba de escribir.
      URL_ACTUAL = String(u).split("?")[1] ?? "";
    }),
    refresh: vi.fn(), prefetch: vi.fn(),
  }),
  usePathname: () => "/asistencia",
  useSearchParams: () => new URLSearchParams(URL_ACTUAL),
}));

// 🔴 Los dos generadores, espiados: lo que importa no es que se bajen, sino
// CUÁNTAS personas reciben. La regla de la casa es que lo que sale de la
// pantalla no se recorte salvo que el botón DIGA a cuántos afecta.
const excelRecibio = vi.fn();
const pdfRecibio = vi.fn();
vi.mock("@/lib/asistencia/exportar", () => ({
  construirExcel: (arg: { personas: unknown[] }) => { excelRecibio(arg); return {}; },
  construirPdf: (arg: { personas: unknown[] }) => { pdfRecibio(arg); return { save: vi.fn() }; },
}));
vi.mock("@/lib/excel-export", () => ({ downloadWorkbook: vi.fn() }));

import ReporteTab from "@/app/asistencia/ReporteTab";

// ── El arnés ─────────────────────────────────────────────────────────────────

const PEDIDOS: string[] = [];
function servir(datos: unknown) {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const u = String(url);
    PEDIDOS.push(u);
    if (u.includes("/api/asistencia/reporte")) return { ok: true, json: async () => datos } as Response;
    return { ok: true, json: async () => ({ relojes: [] }) } as Response;
  }));
}
const montar = (ui: React.ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);

const dia = (over: Record<string, unknown> = {}) => ({
  fecha: "2026-09-01", marcas: [], marcasIds: [], repetidas: [], entrada: null, salida: null,
  tardeMin: 0, excesoAlmuerzoMin: 0, salidaTempranaMin: 0, extraMin: 0, trabajadoMin: 0,
  revisar: false, salidaSospechosa: false, enCurso: false, fueraDeVigencia: false,
  ausente: false, vacacion: null, justificado: null,
  permiso: null, permisoRango: null,
  permisoPerdonaMin: 0, permisoPerdonaSalidaMin: 0, permisoPerdonaAlmuerzoMin: 0,
  feriado: null, habil: true, correcciones: [],
  ...over,
});

const resumen = (over: Record<string, unknown> = {}) => ({
  diasTrabajados: 2, ausenciasSinJustificar: 0, ausenciasJustificadas: 0,
  diasTrabajandoFuera: 0, diasVacaciones: 0, diasVacacionesYaPagadas: 0,
  vecesTarde: 0, minutosTarde: 0, minutosTardeDeDiasARevisar: 0,
  diasConPermiso: 0, minutosPerdonadosPorPermiso: 0,
  minutosPerdonadosTarde: 0, minutosPerdonadosSalidaTemprana: 0, minutosPerdonadosAlmuerzo: 0,
  excesoAlmuerzoMin: 0, salidaTempranaMin: 0, extraMin: 0, diasARevisar: 0,
  diasEnCurso: 0, tiempoNoTrabajadoMin: 0, diasCorregidos: 0, correcciones: 0,
  ...over,
});

/**
 * Tres colaboradores medidos como en producción: dos con días a revisar y uno
 * limpio. Los días: el 1 de septiembre es el que hay que revisar, el 2 no.
 */
const TRES = {
  personas: [
    {
      codigo: "16", nombre: "ANDREA PEREZ", salida: "17:00", almuerzoMin: 30,
      dias: [dia({ fecha: "2026-09-01", revisar: true, marcas: ["08:04:08"] }), dia({ fecha: "2026-09-02" })],
      resumen: resumen({ diasARevisar: 1, minutosTarde: 10, tiempoNoTrabajadoMin: 20, ausenciasSinJustificar: 1 }),
    },
    {
      codigo: "43", nombre: "MARTHA CHAVARRIA", salida: "17:00", almuerzoMin: 30,
      dias: [dia({ fecha: "2026-09-01", revisar: true }), dia({ fecha: "2026-09-02", revisar: true })],
      resumen: resumen({ diasARevisar: 2, minutosTarde: 5, tiempoNoTrabajadoMin: 30, ausenciasSinJustificar: 2 }),
    },
    {
      codigo: "22", nombre: "ALEJANDRA CAMANO", salida: "17:00", almuerzoMin: 30,
      dias: [dia({ fecha: "2026-09-01" }), dia({ fecha: "2026-09-02" })],
      resumen: resumen({ diasARevisar: 0, minutosTarde: 100, tiempoNoTrabajadoMin: 700, ausenciasSinJustificar: 4 }),
    },
  ],
  sinHorario: 0, sinHorarioLista: [], reglas: REGLAS_DEFAULT, decisionesExtra: {},
};

beforeEach(() => {
  URL_ACTUAL = "desde=2026-09-01&hasta=2026-09-15";
  PEDIDOS.length = 0; REEMPLAZOS.length = 0; EMPUJES.length = 0;
  excelRecibio.mockClear(); pdfRecibio.mockClear();
  try { localStorage.clear(); } catch { /* jsdom */ }
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

async function abrirReporte(datos: unknown = TRES) {
  servir(datos);
  montar(<ReporteTab />);
  await screen.findAllByText(/Andrea Perez|Alejandra Camano|No hay marcaciones/);
}
const boton = () => screen.getByRole("button", { name: ROTULO_SOLO_A_REVISAR });
/** El pie de la tabla: su única fila, dentro del `<tfoot>`. */
const pie = () => document.querySelector("tfoot tr") as HTMLTableRowElement;

// ═════════════════════════════════════════════════════════════════════════════
// 1. LA REGLA, EN EL MÓDULO PURO — no se inventa acá, se lee del motor
// ═════════════════════════════════════════════════════════════════════════════

describe("🔴 el módulo puro: solo filtra por lo que el motor ya decidió", () => {
  const gente = [
    { codigo: "16", resumen: { diasARevisar: 1 } },
    { codigo: "43", resumen: { diasARevisar: 2 } },
    { codigo: "22", resumen: { diasARevisar: 0 } },
  ];

  it("deja solo a quien tiene días a revisar — por `resumen.diasARevisar`, la MISMA cuenta de la columna", () => {
    expect(soloConDiasARevisar(gente, true).map((p) => p.codigo)).toEqual(["16", "43"]);
    expect(tieneDiasARevisar(gente[0])).toBe(true);
    expect(tieneDiasARevisar(gente[2])).toBe(false);
  });

  it("apagado devuelve la MISMA lista, sin copiar ni reordenar", () => {
    expect(soloConDiasARevisar(gente, false)).toBe(gente);
  });

  it("los días salen de `revisar`, que lo pone el motor — acá no se vuelve a decidir", () => {
    const dias = [{ revisar: true, fecha: "a" }, { revisar: false, fecha: "b" }, { revisar: true, fecha: "c" }];
    expect(diasARevisarDe(dias, true).map((d) => d.fecha)).toEqual(["a", "c"]);
    expect(diasARevisarDe(dias, false)).toBe(dias);
  });

  it("el filtro solo se prende con «1»", () => {
    expect(filtroPrendido(VALOR_PRENDIDO)).toBe(true);
    expect(filtroPrendido("")).toBe(false);
    expect(filtroPrendido(null)).toBe(false);
    expect(filtroPrendido("si")).toBe(false);
    expect(filtroPrendido("0")).toBe(false);
  });

  it("el conteo existe SOLO con el filtro prendido, y respeta el singular", () => {
    expect(conteoARevisar(2, 3, false)).toBe("");
    expect(conteoARevisar(2, 3, true)).toBe("2 de 3 colaboradores");
    expect(conteoARevisar(1, 1, true)).toBe("1 de 1 colaborador");
  });

  it("la línea del detalle recortado dice cuántos de cuántos, y calla cuando no recorta", () => {
    expect(textoSoloEstosDias(11, 11)).toBeNull();
    expect(textoSoloEstosDias(0, 11)).toBeNull();
    expect(textoSoloEstosDias(3, 11)).toContain("Solo los 3 días a revisar, de 11");
    expect(textoSoloEstosDias(1, 11)).toContain("Solo el día a revisar");
  });

  it("🔴 el botón de descarga DICE a cuántos afecta solo cuando la pantalla está recortada", () => {
    expect(rotuloDescarga("Excel", 34, false)).toBe("Excel");
    expect(rotuloDescarga("Excel", 34, true)).toBe("Excel · 34");
    expect(rotuloDescarga("PDF", 1, true)).toBe("PDF · 1");
  });

  it("🔴 UNA SOLA FORMA DE LLEGAR AL DÍA: el enlace se arma SOBRE `enlaceDiasDe`", () => {
    const rango = { desde: "2026-09-01", hasta: "2026-09-15" };
    const base = enlaceDiasDe("43", rango);
    const mio = enlaceDiasARevisarDe("43", rango);
    expect(mio.startsWith(base)).toBe(true);
    expect(mio).toContain(`${PARAM_DIAS_DE}=43`);
    // Y lleva el período puesto: abre en las mismas fechas que se miraban.
    expect(mio).toContain("desde=2026-09-01");
    expect(mio).toContain("hasta=2026-09-15");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. EL BOTÓN «SOLO A REVISAR»
// ═════════════════════════════════════════════════════════════════════════════

describe("🔴 el botón «Solo a revisar»", () => {
  it("existe al lado del buscador y arranca APAGADO", async () => {
    await abrirReporte();
    expect(boton().getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByText("Alejandra Camano")).toBeTruthy();
  });

  it("deja en la tabla solo a quien tiene algo — y no le pide NADA nuevo al servidor", async () => {
    await abrirReporte();
    const antes = PEDIDOS.filter((u) => u.includes("/api/asistencia/reporte")).length;
    fireEvent.click(boton());
    await waitFor(() => expect(screen.queryByText("Alejandra Camano")).toBeNull());
    expect(screen.getByText("Andrea Perez")).toBeTruthy();
    expect(screen.getByText("Martha Chavarria")).toBeTruthy();
    expect(boton().getAttribute("aria-pressed")).toBe("true");
    // 🔴 Filtra lo YA cargado: ni una petición más.
    expect(PEDIDOS.filter((u) => u.includes("/api/asistencia/reporte")).length).toBe(antes);
  });

  it("🔴 EL TOTAL SIGUE AL FILTRO: el pie se suma sobre lo que se VE", async () => {
    await abrirReporte();
    // Con los tres: 1+2+4 = 7 ausencias, 10+5+100 = 115 min tarde, 750 no trabajado, 3 a revisar.
    expect(within(pie()).getByText("3 colaboradores")).toBeTruthy();
    expect(within(pie()).getByText("7")).toBeTruthy();
    expect(within(pie()).getByText("115")).toBeTruthy();
    expect(within(pie()).getByText("750")).toBeTruthy();

    fireEvent.click(boton());
    // Con los dos: 1+2 = 3 ausencias, 15 min tarde, 50 no trabajado, 3 a revisar.
    await waitFor(() => expect(within(pie()).queryByText("2 colaboradores")).toBeTruthy());
    expect(within(pie()).getByText("15")).toBeTruthy();
    expect(within(pie()).getByText("50")).toBeTruthy();
    // 🩸 El defecto que esto impide: un pie de 3 personas arriba de una tabla de 2.
    expect(within(pie()).queryByText("115")).toBeNull();
    expect(within(pie()).queryByText("750")).toBeNull();
  });

  it("dice «2 de 3 colaboradores» para que el total recortado no se lea como el de todos", async () => {
    await abrirReporte();
    expect(screen.queryByText("2 de 3 colaboradores")).toBeNull();
    fireEvent.click(boton());
    await screen.findByText("2 de 3 colaboradores");
  });

  it("🔴 VA EN LA URL CON `replace`, NUNCA CON `push`", async () => {
    await abrirReporte();
    fireEvent.click(boton());
    await waitFor(() => expect(REEMPLAZOS.some((u) => u.includes(`${PARAM_SOLO_A_REVISAR}=1`))).toBe(true));
    // 🔴 Es un filtro del MISMO nivel: el Atrás del navegador no cicla por él.
    expect(EMPUJES).toEqual([]);
  });

  it("se apaga y vuelven todos", async () => {
    await abrirReporte();
    fireEvent.click(boton());
    await waitFor(() => expect(screen.queryByText("Alejandra Camano")).toBeNull());
    fireEvent.click(boton());
    await screen.findByText("Alejandra Camano");
    expect(boton().getAttribute("aria-pressed")).toBe("false");
  });

  it("un enlace compartido llega YA filtrado", async () => {
    URL_ACTUAL = `desde=2026-09-01&hasta=2026-09-15&${PARAM_SOLO_A_REVISAR}=1`;
    await abrirReporte();
    await waitFor(() => expect(screen.queryByText("Alejandra Camano")).toBeNull());
    expect(boton().getAttribute("aria-pressed")).toBe("true");
  });

  it("cuando no deja a nadie se DICE con palabras, y se ofrece la salida", async () => {
    const limpios = { ...TRES, personas: [TRES.personas[2]] };
    await abrirReporte(limpios);
    fireEvent.click(boton());
    await screen.findByText(new RegExp(VACIO_SIN_A_REVISAR));
    expect(screen.queryByRole("table")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: VER_A_TODOS }));
    await screen.findByText("Alejandra Camano");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. EL NÚMERO QUE LLEVA AL DÍA
// ═════════════════════════════════════════════════════════════════════════════

describe("🔴 el número de «A revisar» lleva a los días", () => {
  /** El enlace del número de una persona, o `null` si no lo hay. */
  const enlaceDe = (codigo: string) =>
    document.querySelector(`a[href$="${PARAM_DIAS_DE}=${codigo}"]`) as HTMLAnchorElement | null;

  it("🔴 CON 0 DÍAS A REVISAR NO HAY ENLACE: va el guion de siempre", async () => {
    await abrirReporte();
    // Alejandra (22) tiene 0: ni enlace propio ni ningún enlace con su código.
    expect(enlaceDe("22")).toBeNull();
    // Andrea (16) tiene 1, y Martha (43) tiene 2: las dos con enlace.
    expect(enlaceDe("16")).not.toBeNull();
    expect(enlaceDe("43")).not.toBeNull();
  });

  it("el enlace es de verdad —copiable— y apunta a esa persona con sus días", async () => {
    await abrirReporte();
    const a = enlaceDe("43")!;
    expect(a.getAttribute("href")).toBe(
      enlaceDiasARevisarDe("43", { desde: "2026-09-01", hasta: "2026-09-15" }),
    );
    expect(a.textContent).toBe("2");
  });

  it("🔴 AL TOCARLO SE ABRE ESA PERSONA CON SOLO ESOS DÍAS", async () => {
    await abrirReporte();
    // Cerrado: no se ve ningún día.
    expect(screen.queryByText("mar 1 sep")).toBeNull();
    fireEvent.click(enlaceDe("16")!);
    // 🔴 El 1 de septiembre es el que hay que revisar; el 2 NO se dibuja.
    await screen.findByText("mar 1 sep");
    expect(screen.queryByText("mié 2 sep")).toBeNull();
  });

  it("dice que está recortado y cómo se sueltan los demás días", async () => {
    await abrirReporte();
    fireEvent.click(enlaceDe("16")!);
    await screen.findByText(/Solo el día a revisar, de 2 del período/);
  });

  it("tocar la fila lo abre ENTERO — es la salida, sin un control nuevo", async () => {
    await abrirReporte();
    fireEvent.click(enlaceDe("16")!);
    await screen.findByText("mar 1 sep");
    fireEvent.click(screen.getByText("Andrea Perez"));
    await screen.findByText("mié 2 sep");
    expect(screen.queryByText(/Solo el día a revisar/)).toBeNull();
  });

  it("🔴 el enlace tampoco empuja historial: `replace`, como todo filtro", async () => {
    await abrirReporte();
    fireEvent.click(enlaceDe("43")!);
    await waitFor(() => expect(REEMPLAZOS.some((u) => u.includes(`${PARAM_DIAS_DE}=43`))).toBe(true));
    expect(EMPUJES).toEqual([]);
  });

  it("apagar el filtro suelta la fila recortada: nunca queda recortada sin decirlo", async () => {
    await abrirReporte();
    fireEvent.click(boton());
    await waitFor(() => expect(screen.queryByText("Alejandra Camano")).toBeNull());
    fireEvent.click(enlaceDe("16")!);
    await screen.findByText(/Solo el día a revisar/);
    fireEvent.click(boton());
    await screen.findByText("Alejandra Camano");
    expect(screen.queryByText(/Solo el día a revisar/)).toBeNull();
  });

  it("un enlace compartido llega con la persona ya abierta en sus días", async () => {
    URL_ACTUAL = `desde=2026-09-01&hasta=2026-09-15&${PARAM_DIAS_DE}=16`;
    await abrirReporte();
    await screen.findByText("mar 1 sep");
    expect(screen.queryByText("mié 2 sep")).toBeNull();
    await screen.findByText(/Solo el día a revisar/);
  });

  it("⚠️ sin nada que recortar no se dice nada: los 2 días de Martha son los 2 a revisar", async () => {
    URL_ACTUAL = `desde=2026-09-01&hasta=2026-09-15&${PARAM_DIAS_DE}=43`;
    await abrirReporte();
    await screen.findByText("mar 1 sep");
    // Los dos días están, y no hay línea gris: no se recortó nada.
    expect(screen.queryByText("mié 2 sep")).toBeTruthy();
    expect(screen.queryByText(/Solo los 2 días a revisar/)).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4. LO QUE SALE DE LA PANTALLA
// ═════════════════════════════════════════════════════════════════════════════

describe("🔴 el Excel y el PDF bajan lo que se ve, y el botón lo DICE", () => {
  it("con el filtro apagado los botones se llaman «Excel» y «PDF»", async () => {
    await abrirReporte();
    expect(screen.getByRole("button", { name: "Excel" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "PDF" })).toBeTruthy();
  });

  it("con el filtro prendido dicen a cuántos afectan", async () => {
    await abrirReporte();
    fireEvent.click(boton());
    await screen.findByRole("button", { name: "Excel · 2" });
    expect(screen.getByRole("button", { name: "PDF · 2" })).toBeTruthy();
  });

  it("🔴 y bajan EXACTAMENTE esas 2 personas, no las 3 de la lista entera", async () => {
    await abrirReporte();
    fireEvent.click(boton());
    await screen.findByRole("button", { name: "Excel · 2" });
    fireEvent.click(screen.getByRole("button", { name: "Excel · 2" }));
    await waitFor(() => expect(excelRecibio).toHaveBeenCalled());
    expect(excelRecibio.mock.calls[0][0].personas.map((p: { codigo: string }) => p.codigo))
      .toEqual(["16", "43"]);
    fireEvent.click(screen.getByRole("button", { name: "PDF · 2" }));
    await waitFor(() => expect(pdfRecibio).toHaveBeenCalled());
    expect(pdfRecibio.mock.calls[0][0].personas).toHaveLength(2);
  });

  it("sin filtro bajan las 3, como siempre", async () => {
    await abrirReporte();
    fireEvent.click(screen.getByRole("button", { name: "Excel" }));
    await waitFor(() => expect(excelRecibio).toHaveBeenCalled());
    expect(excelRecibio.mock.calls[0][0].personas).toHaveLength(3);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 5. LO QUE **NO** SE HIZO — y es una decisión, no un olvido
// ═════════════════════════════════════════════════════════════════════════════

describe("🔴 la columna NO se partió en dos", () => {
  it("no hay botones de «Marcó de más» ni de «Le falta una marca»", async () => {
    await abrirReporte();
    // Se le ofreció en el mockup (la opción B, con sus tres botones) y Daniel
    // eligió *«nada más el botón de "Solo a revisar"»*. Agregarlos «de paso»
    // sería inventarle una decisión.
    expect(screen.queryByRole("button", { name: /Marcó de más/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Le falta una marca/i })).toBeNull();
  });
});

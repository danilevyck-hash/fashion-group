// ─────────────────────────────────────────────────────────────────────────────
// 🔴 PLANILLA: LA QUINCENA SE ELIGE CON DOS BOTONES (10-sep-2026, mockup
// aprobado por Daniel)
//
// «1 – 15 sep» y «16 – 30 sep» —el mes en curso de Panamá y el último día REAL
// del mes— más «Otro rango ⌄» que despliega el calendario de siempre. El campo
// «Cortar el reloj el» se ve DESDE EL INICIO con el corte propuesto (13 o 28) y
// una frase corta; vacío = quincena entera. «Generar» negro. Excel / PDF /
// Comprobantes aparecen solo con la planilla ya generada.
//
// 🔴 LO QUE SE GUARDA Y LO QUE SE CALCULA NO CAMBIA: la misma llamada, con el
// mismo rango y el mismo corte, elija uno por botón o por calendario. Hay
// candado que compara las dos URL.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";

// 🔴 EL DOBLE DEL ROUTER (11-sep-2026). Desde que la Planilla y Colaboradores
// llevan buscador, su texto vive en la URL (`useUrlState`, `replace`), y eso
// llama a `useRouter()`: sin app router montado, jsdom tira «invariant expected
// app router to be mounted» antes de dibujar una sola fila. El doble devuelve
// una URL VACÍA a propósito — sin búsqueda escrita, la lista es la de siempre,
// que es justo lo que estos candados miran.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/asistencia",
  useSearchParams: () => new URLSearchParams(),
}));

import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { ToastProvider } from "@/components/ToastSystem";
import { REGLAS_DEFAULT } from "@/lib/asistencia/config";
import {
  HORAS_CERO, TOTALES_CERO, MANUALES_CERO, quincena, periodoDeQuincena, type LineaPlanilla,
} from "@/lib/asistencia/planilla";
import {
  corteInicial, esLaQuincena, fraseCorte, quincenasDelMes, rotuloQuincena,
} from "@/lib/asistencia/elegir-quincena";

vi.mock("@/lib/asistencia/planilla-unida", () => ({ planillaUnidaPrendida: () => true, PLANILLA_UNIDA: true }));

// El calendario de siempre, doblado: un botón que dice lo suyo y otro que
// «elige por calendario» exactamente el 1–15 de septiembre.
vi.mock("@/components/ui/RangoFechas", () => ({
  __esModule: true,
  default: ({ desde, hasta, vacio, inline, textoVacio, onChange }: {
    desde: string; hasta: string; vacio?: boolean; inline?: boolean; textoVacio?: string;
    onChange: (d: string, h: string) => void;
  }) => (
    <div data-testid="rango" data-inline={inline ? "si" : "no"}>
      <button type="button">{vacio ? (textoVacio ?? "Elige el período") : `${desde} – ${hasta}`}</button>
      <button type="button" data-testid="calendario-1-15-sep" onClick={() => onChange("2026-09-01", "2026-09-15")}>
        calendario 1-15 sep
      </button>
      <button type="button" data-testid="calendario-libre" onClick={() => onChange("2026-09-03", "2026-09-20")}>
        calendario libre
      </button>
    </div>
  ),
  ultimoRango: () => null,
}));

import PlanillaTab from "@/app/asistencia/PlanillaTab";

const Q = quincena(2026, 9, 1);
const dinero = {
  rataHora: 4.62, valorMinuto: 0.077, salarioQuincenal: 400, baseSeguros: null,
  extraDiurno: 0, extraNocturno: 0, excedente: 0, domingos: 0, feriados: 0,
  ausencias: 0, ausenciaPorTardanza: 0, ausenciaDeDiaCompleto: 0,
  vacacionesYaPagadas: 0, tardanzas: 0, totalBruto: 400, seguroSocial: 39,
  seguroEducativo: 5, isr: 0, prestamo: 0, terceros: 0, mercancia: 0,
  totalDeducciones: 44, otrosServicios: 0, netoPagar: 356,
};
const AVISOS = {
  faltaMigracionConfiguracion: null, faltaMigracionManual: null, faltaMigracionBajas: null,
  faltaMigracionServicioProfesional: null, faltaMigracionVacaciones: null, faltaMigracionAprobaciones: null,
  faltaMigracionReparto: null, repartosRechazados: [], avisoRepartoRechazado: null,
  fueraPorBaja: 0, marcoDespuesDeIrse: 0, sinHorario: 0, salidaAsumida: "17:00", horasAusenciaDefault: 8,
  conSabado: 0, periodoAbierto: null, sinFicha: [], avisoSinFicha: null,
  vacacionesNoPagadas: [], avisoVacacionesNoPagadas: null, extraSinAprobar: [], avisoExtraSinAprobar: null,
  rangoLibre: false, factorBase: 1, diasCalendario: 15,
};
const LINEA: LineaPlanilla = {
  codigo: "22", etiqueta: "ALEJANDRA CAMAÑO", nombre: "ALEJANDRA CAMAÑO",
  empresa: "confecciones_boston", empresaEtiqueta: "Confecciones Boston",
  salarioMensual: 800, jornadaSemanal: 40, horas: { ...HORAS_CERO },
  faltaConfigurar: [], fueraDePlanilla: false, pagaSeguros: true,
  decidirAMano: null, quincenalReferencia: null, dinero, manuales: { ...MANUALES_CERO },
} as LineaPlanilla;
const CUADRO = {
  quincena: Q, periodo: periodoDeQuincena(Q), empresa: "confecciones_boston", empresaEtiqueta: "Confecciones Boston",
  lineas: [LINEA], totales: { ...TOTALES_CERO, ...dinero, personas: 1 }, reglas: REGLAS_DEFAULT, prestamos: [], avisos: AVISOS,
};
const BORRADOR = { ok: true, estado: "borrador", cerrada: null, solapadas: [], historial: [], aviso: null };

interface Llamada { url: string; init?: RequestInit }
function servir() {
  const llamadas: Llamada[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    llamadas.push({ url: String(url), init });
    const body = String(url).includes("planilla-guardada") ? BORRADOR : CUADRO;
    return { ok: true, status: 200, json: async () => body } as Response;
  }));
  return llamadas;
}
const montar = () => render(<ToastProvider><PlanillaTab /></ToastProvider>);
const boton = (nombre: RegExp | string) => screen.getAllByRole("button", { name: nombre })[0] as HTMLButtonElement;
const generar = () => fireEvent.click(boton(/^Generar$/));
const urlDelCuadro = (ll: Llamada[]) => ll.find((c) => c.url.includes("/api/asistencia/planilla?"))?.url ?? null;
const corteInput = () => screen.getByLabelText("Cortar el reloj el") as HTMLInputElement;

beforeEach(() => {
  vi.unstubAllGlobals();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-09-10T15:00:00Z")); // 10 sep 2026, 10:00 a.m. Panamá
  sessionStorage.setItem("cxc_role", "admin");
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); sessionStorage.clear(); });

describe("el módulo puro: las dos quincenas del mes, con el último día real", () => {
  it("septiembre: 1 – 15 sep y 16 – 30 sep; febrero 2026: 16 – 28 feb; julio: 16 – 31 jul", () => {
    const [a, b] = quincenasDelMes("2026-09-10");
    expect([rotuloQuincena(a), rotuloQuincena(b)]).toEqual(["1 – 15 sep", "16 – 30 sep"]);
    expect(rotuloQuincena(quincenasDelMes("2026-02-03")[1])).toBe("16 – 28 feb");
    expect(rotuloQuincena(quincenasDelMes("2026-07-31")[1])).toBe("16 – 31 jul");
    expect(a.desde).toBe("2026-09-01"); expect(b.hasta).toBe("2026-09-30");
  });
  it("el corte propuesto es el 13 o el 28, y la frase dice qué pasa con los días de después", () => {
    const [a, b] = quincenasDelMes("2026-09-10");
    expect(corteInicial(a)).toBe("2026-09-13");
    expect(corteInicial(b)).toBe("2026-09-28");
    expect(fraseCorte("2026-09-13", "2026-09-15")).toBe("Del 14 al 15 se paga normal y se ajusta en la siguiente.");
    expect(fraseCorte("2026-09-28", "2026-09-30")).toBe("Del 29 al 30 se paga normal y se ajusta en la siguiente.");
    expect(fraseCorte("2026-09-14", "2026-09-15")).toBe("El 15 se paga normal y se ajusta en la siguiente.");
    expect(fraseCorte("2026-09-15", "2026-09-15")).toBeNull();
    expect(esLaQuincena(a, "2026-09-01", "2026-09-15")).toBe(true);
    expect(esLaQuincena(a, "2026-09-01", "2026-09-14")).toBe(false);
  });
});

describe("🔴 la pantalla: dos botones, el corte a la vista, Generar negro", () => {
  it("abre con «1 – 15 sep», «16 – 30 sep» y «Otro rango»; el calendario NO va en línea", async () => {
    servir(); montar();
    expect(boton("1 – 15 sep")).toBeTruthy();
    expect(boton("16 – 30 sep")).toBeTruthy();
    expect(screen.getAllByText("Otro rango").length).toBeGreaterThan(0);
    expect(screen.getByTestId("rango").getAttribute("data-inline")).toBe("no");
    expect(screen.queryByText(/Elige el período$/)).toBeNull();
  });

  // ⚠️ 11-sep-2026: Excel, PDF y Comprobantes viven en UN botón «Descargar ⌄»
  // (mockup «Antes de cerrar»). Cambió dónde están, no cuándo aparecen.
  it("🔴 «Cortar el reloj el» se ve DESDE EL INICIO, vacío, y «Descargar» NO está", async () => {
    servir(); montar();
    expect(corteInput().value).toBe("");
    expect(screen.getByText("Vacío: se lee la quincena entera.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Descargar/ })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: /^Excel$/ })).toBeNull();
    expect(boton(/^Generar$/).disabled).toBe(true);
  });

  it("tocar «1 – 15 sep» lo prende, propone el corte del 13 con su frase, y Generar se pone NEGRO", async () => {
    servir(); montar();
    fireEvent.click(boton("1 – 15 sep"));
    expect(boton("1 – 15 sep").getAttribute("aria-pressed")).toBe("true");
    expect(boton("16 – 30 sep").getAttribute("aria-pressed")).toBe("false");
    expect(corteInput().value).toBe("2026-09-13");
    expect(screen.getByText("Del 14 al 15 se paga normal y se ajusta en la siguiente.")).toBeTruthy();
    // Y el chip dice el corte corto (11-sep-2026, mockup): «Corte 13 sep».
    expect(screen.getByText("Corte 13 sep")).toBeTruthy();
    expect(boton(/^Generar$/).disabled).toBe(false);
    expect(boton(/^Generar$/).className).toContain("bg-black");
  });

  it("«16 – 30 sep» propone el 28", async () => {
    servir(); montar();
    fireEvent.click(boton("16 – 30 sep"));
    expect(corteInput().value).toBe("2026-09-28");
    expect(screen.getByText("Del 29 al 30 se paga normal y se ajusta en la siguiente.")).toBeTruthy();
  });

  it("🔴 Generar pide EL MISMO rango y corte que los botones muestran, y recién ahí sale «Descargar» con Excel/PDF/Comprobantes", async () => {
    const ll = servir(); montar();
    fireEvent.click(boton("1 – 15 sep"));
    generar();
    await screen.findAllByText(/ALEJANDRA CAMAÑO/i);
    expect(urlDelCuadro(ll)).toBe("/api/asistencia/planilla?desde=2026-09-01&hasta=2026-09-15&empresa=confecciones_boston&corte=2026-09-13");
    fireEvent.click(boton(/^Descargar/));
    expect(screen.getByRole("menuitem", { name: /^Excel$/ })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: /^PDF$/ })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: /^Comprobantes$/ })).toBeTruthy();
  });

  it("🔴 EL MISMO PEDIDO POR CALENDARIO: elegir 1–15 sep en «Otro rango» arma la MISMA URL que el botón", async () => {
    const porBoton = servir(); montar();
    fireEvent.click(boton("1 – 15 sep"));
    generar();
    await screen.findAllByText(/ALEJANDRA CAMAÑO/i);
    const urlBoton = urlDelCuadro(porBoton);
    cleanup();

    const porCalendario = servir(); montar();
    fireEvent.click(screen.getByTestId("calendario-1-15-sep"));
    // El calendario que cae en una quincena exacta propone el mismo corte.
    expect(corteInput().value).toBe("2026-09-13");
    // Y el botón de esa quincena se prende igual: es el mismo rango.
    expect(boton("1 – 15 sep").getAttribute("aria-pressed")).toBe("true");
    generar();
    await screen.findAllByText(/ALEJANDRA CAMAÑO/i);
    expect(urlDelCuadro(porCalendario)).toBe(urlBoton);
  });

  it("un rango libre por calendario no prende ningún botón, se lee la quincena entera, y se pide TAL CUAL", async () => {
    const ll = servir(); montar();
    fireEvent.click(screen.getByTestId("calendario-libre"));
    expect(screen.queryAllByRole("button", { pressed: true })).toHaveLength(0);
    expect(corteInput().value).toBe("");
    expect(screen.getAllByText("2026-09-03 – 2026-09-20").length).toBeGreaterThan(0);
    generar();
    await waitFor(() => expect(urlDelCuadro(ll)).toBe("/api/asistencia/planilla?desde=2026-09-03&hasta=2026-09-20&empresa=confecciones_boston"));
  });

  it("«Quincena entera» vacía el corte y el pedido va sin `corte`", async () => {
    const ll = servir(); montar();
    fireEvent.click(boton("1 – 15 sep"));
    fireEvent.click(boton(/^Quincena entera$/));
    expect(corteInput().value).toBe("");
    generar();
    await waitFor(() => expect(urlDelCuadro(ll)).toBe("/api/asistencia/planilla?desde=2026-09-01&hasta=2026-09-15&empresa=confecciones_boston"));
  });
});

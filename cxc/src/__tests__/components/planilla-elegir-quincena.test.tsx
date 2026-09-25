// ─────────────────────────────────────────────────────────────────────────────
// 🔴 PLANILLA: LA QUINCENA SE ELIGE CON BOTONES (10-sep-2026, mockup aprobado
// por Daniel), Y CON NADA MÁS (15-sep-2026).
//
// CUATRO botones: las dos quincenas del mes anterior y las dos del mes en curso
// de Panamá, con el último día REAL del mes. El campo «Cortar el reloj el» se ve
// DESDE EL INICIO con el corte propuesto (13 o 28) y una frase corta; vacío =
// quincena entera. «Generar» negro. Excel / PDF / Comprobantes aparecen solo con
// la planilla ya generada.
//
// 🩸 CAMBIÓ DE DIRECCIÓN EL 15-sep-2026. Hasta ese día había además un «Otro
// rango ⌄» con el calendario de siempre, y este archivo probaba que por ahí se
// podía pedir un rango libre. Daniel, textual: *«si la quincena es fija, que no
// haya opción de rango, solo las opciones»*. De ahí salían los rangos que
// prorratean el sueldo por `factorBase`, APAGAN los montos escritos a mano y
// dejan guardadas cabeceras que no son quincenas — y por eso el ajuste de la
// quincena anterior no se disparaba nunca.
//
// 🔴 LO QUE SE GUARDA Y LO QUE SE CALCULA NO CAMBIA: el botón pide el MISMO
// `desde`/`hasta`/`corte` que pedía el calendario para ese mismo rango.
//
// 🔴 ⚠️ Y LA RUTA SIGUE ACEPTANDO RANGOS LIBRES: `medirAjusteAnterior` se llama
// a sí misma con el rango corto de los días sin medir. Lo que se quitó es la
// OPCIÓN DE LA PANTALLA. Hay un caso abajo que lo sostiene.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { ToastProvider } from "@/components/ToastSystem";
import { REGLAS_DEFAULT } from "@/lib/asistencia/config";
import {
  HORAS_CERO, TOTALES_CERO, MANUALES_CERO, quincena, periodoDeQuincena, type LineaPlanilla,
} from "@/lib/asistencia/planilla";
import {
  corteInicial, esLaQuincena, fraseCorte, quincenasDelMes, quincenasElegibles, rotuloQuincena,
} from "@/lib/asistencia/elegir-quincena";
// 🔴 24-sep-2026: el rótulo de la barra sale del módulo puro del rediseño.
import { rotuloDelPeriodo } from "@/lib/asistencia/pantalla-2026-09";

vi.mock("@/lib/asistencia/planilla-unida", () => ({ planillaUnidaPrendida: () => true, PLANILLA_UNIDA: true }));

// 🩸 Acá vivía el doble del calendario (`RangoFechas`). Se fue el 15-sep-2026
// con «Otro rango ⌄»: la Planilla ya no lo monta.

import PlanillaTab from "@/app/asistencia/PlanillaTab";

// ── 🔴 EL DOBLE DEL ROUTER (24-sep-2026) ────────────────────────────────────
// Desde que la quincena y el corte viajan en la dirección (`plQuincena`,
// `plCorte`, ver `pestanas-vivas.ts`), `PlanillaTab` usa `useUrlState`. Acá se
// renderiza el componente suelto, sin el router de la app.
let URL_PLANILLA = "";
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn((u: string) => { URL_PLANILLA = String(u).split("?")[1] ?? ""; }),
    replace: vi.fn((u: string) => { URL_PLANILLA = String(u).split("?")[1] ?? ""; }),
    refresh: vi.fn(), prefetch: vi.fn(),
  }),
  usePathname: () => "/asistencia",
  useSearchParams: () => new URLSearchParams(URL_PLANILLA),
}));


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
/**
 * 🩸 CAMBIÓ DE DIRECCIÓN EL 24-sep-2026: la quincena se elegía con CUATRO
 * botones y ahora la pone el SELECTOR ÚNICO del módulo
 * («‹ 16 – 30 sep 2026 ›», `ASISTENCIA_PANTALLA_2026_09`), que vive en
 * `?desde=&hasta=` y comparte clave y memoria con Asistencia, Aprobaciones y
 * Préstamos › Movimientos.
 *
 * 🔴 LA REGLA NO CAMBIÓ: solo se pagan QUINCENAS —el selector de la Planilla no
 * lleva calendario— y lo que se pide al servidor es exactamente el mismo
 * `desde`/`hasta`/`corte` de siempre.
 *
 * Acá se abre directo en una quincena, que es como llega la pantalla de verdad
 * cuando alguien viene de otra pestaña o del enlace de un aviso.
 */
function abrirEn(desde: string, hasta: string) {
  URL_PLANILLA = `desde=${desde}&hasta=${hasta}`;
  return montar();
}
/** «‹» y «›» de la barra. */
const atras = () => fireEvent.click(screen.getByRole("button", { name: "Quincena anterior" }));
const boton = (nombre: RegExp | string) => screen.getAllByRole("button", { name: nombre })[0] as HTMLButtonElement;
const generar = () => fireEvent.click(boton(/^Generar$/));
const urlDelCuadro = (ll: Llamada[]) => ll.find((c) => c.url.includes("/api/asistencia/planilla?"))?.url ?? null;
const corteInput = () => screen.getByLabelText("Cortar el reloj el") as HTMLInputElement;

beforeEach(() => {
  vi.unstubAllGlobals();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-09-10T15:00:00Z")); // 10 sep 2026, 10:00 a.m. Panamá
  sessionStorage.setItem("cxc_role", "admin");
  // 🔴 24-sep-2026: la dirección y la memoria del período son COMPARTIDAS por
  // las cuatro pestañas, así que un caso que las deja escritas le cambiaría la
  // quincena al siguiente. Se limpian las dos.
  URL_PLANILLA = "";
  try { localStorage.clear(); } catch { /* jsdom sin localStorage */ }
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); sessionStorage.clear(); });

describe("el módulo puro: las dos quincenas del mes, con el último día real", () => {
  // 🔄 CAMBIÓ DE DIRECCIÓN EL 15-sep-2026, y no se borró: julio decía «16 – 31
  // jul» y ahora dice «16 – 30 jul». Daniel: *«Que el 31 no se pague nunca»*, y
  // los tres Excel de la contadora dicen «DEL 16 AL 30 DE AGOSTO». Febrero y los
  // meses de 30 NO se tocaron — el recorte es solo del 31.
  it("septiembre: 1 – 15 sep y 16 – 30 sep; febrero 2026: 16 – 28 feb; julio: 16 – 30 jul", () => {
    const [a, b] = quincenasDelMes("2026-09-10");
    expect([rotuloQuincena(a), rotuloQuincena(b)]).toEqual(["1 – 15 sep", "16 – 30 sep"]);
    expect(rotuloQuincena(quincenasDelMes("2026-02-03")[1])).toBe("16 – 28 feb");
    expect(rotuloQuincena(quincenasDelMes("2026-07-31")[1])).toBe("16 – 30 jul");
    expect(a.desde).toBe("2026-09-01"); expect(b.hasta).toBe("2026-09-30");
  });

  it("⚠️ CONTROL: en septiembre (30 días) la pantalla NO dice nada del 31 (15-sep-2026)", () => {
    // Un aviso que sale siempre deja de avisar. El caso al revés —agosto, donde
    // SÍ sale— está en `asistencia-planilla-cerrar-quincena.test.tsx`.
    servir();
    abrirEn("2026-09-16", "2026-09-30");
    expect(screen.queryByText(/El 31 no paga sueldo/)).toBeNull();
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

describe("🔴 la pantalla: la barra de quincena, el corte a la vista, Generar negro", () => {
  it("🩸 24-sep-2026: abre en la quincena en curso, con la barra, y sin ningún calendario", async () => {
    servir(); montar();
    // 🔴 Lo primero que se lee es QUÉ quincena se va a pagar, escrito entero.
    expect(screen.getByText(rotuloDelPeriodo("2026-09-01", "2026-09-15"))).toBeTruthy();
    expect(screen.getByRole("button", { name: "Quincena anterior" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Quincena siguiente" })).toBeTruthy();
    // 🩸 Los cuatro botones de quincena se retiraron.
    expect(screen.queryByRole("button", { name: "1 – 15 ago" })).toBeNull();
    expect(screen.queryByRole("button", { name: "16 – 30 ago" })).toBeNull();
    expect(screen.queryByRole("button", { name: "1 – 15 sep" })).toBeNull();
    expect(screen.queryByRole("button", { name: "16 – 30 sep" })).toBeNull();
    // 🔴 Y ni rastro del rango libre: en la Planilla el selector NO lleva
    // calendario, porque acá solo se pagan quincenas.
    expect(screen.queryByText("Otro rango")).toBeNull();
    expect(screen.queryByTestId("rango")).toBeNull();
    expect(screen.queryByText(/Elige el período$/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Elegir un día o un rango" })).toBeNull();
  });

  // ⚠️ 11-sep-2026: Excel, PDF y Comprobantes viven en UN botón «Descargar ⌄»
  // (mockup «Antes de cerrar»). Cambió dónde están, no cuándo aparecen.
  it("🔴 el corte se ve DESDE EL INICIO, y «Descargar» NO está hasta generar", async () => {
    const ll = servir(); montar();
    // 🩸 CAMBIÓ DE DIRECCIÓN EL 24-sep-2026: el campo abría VACÍO porque la
    // quincena arrancaba sin elegir. Ahora la quincena viene puesta, así que el
    // corte viene con el PROPUESTO de esa quincena (13 / 28), que es
    // exactamente lo que pasaba al tocar uno de los cuatro botones.
    expect(corteInput().value).toBe("2026-09-13");
    // 🩸 CAMBIÓ EL 25-sep-2026. Decía «El reloj se lee hasta el 28 sep · cambiar
    // — Del 29 al 30 se paga normal…»: repetía el día que el campo de al lado ya
    // dice y no decía DESDE cuándo. Daniel: *«debería decir desde cuándo lee (la
    // última apertura, día después); y algo minimalista que se sepa que es el
    // cierre del reloj»*. Sin cierre anterior (este historial va vacío), el
    // desde es el inicio de la quincena.
    expect(screen.getByText(/Corte del reloj · lee del 1 al 13 sep/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "cambiar" })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Descargar/ })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: /^Excel$/ })).toBeNull();
    // 🔴 LO QUE NO CAMBIÓ, Y ES LO QUE IMPORTA: la plata NO se dibuja sola.
    // Elegir la quincena no le pide el cuadro a nadie.
    expect(urlDelCuadro(ll)).toBeNull();
    expect(screen.getByText("Esta quincena todavía no se generó")).toBeTruthy();
  });

  it("la quincena 1 – 15 sep trae el corte del 13 con su frase, y Generar es NEGRO", async () => {
    servir(); montar();
    expect(screen.getByText(rotuloDelPeriodo("2026-09-01", "2026-09-15"))).toBeTruthy();
    expect(corteInput().value).toBe("2026-09-13");
    // 🩸 La cola «Del 14 al 15 se paga normal y se ajusta en la siguiente» se fue
    // al ⓘ el 25-sep-2026: es la explicación, no el dato. La frase NO cambió.
    expect(screen.queryByText(/Del 14 al 15 se paga normal/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Los días que quedan/ }));
    expect(screen.getByText(/Del 14 al 15 se paga normal y se ajusta en la siguiente\./)).toBeTruthy();
    // 🩸 El chip gris «Corte 13 sep» se retiró: repetía el valor que el campo ya
    // dice. Lo que queda —y lo que este caso exige— es que el corte propuesto se
    // LEA en palabras, en la línea gris.
    expect(screen.queryByText("Corte 13 sep")).toBeNull();
    expect(screen.getByText(/Corte del reloj · lee del 1 al 13 sep/)).toBeTruthy();
    expect(boton(/^Generar$/).disabled).toBe(false);
    expect(boton(/^Generar$/).className).toContain("bg-black");
  });

  it("la quincena 16 – 30 sep propone el 28", async () => {
    servir();
    abrirEn("2026-09-16", "2026-09-30");
    expect(corteInput().value).toBe("2026-09-28");
    expect(screen.getByText(/Corte del reloj · lee del 16 al 28 sep/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Los días que quedan/ }));
    expect(screen.getByText(/Del 29 al 30 se paga normal y se ajusta en la siguiente\./)).toBeTruthy();
  });

  it("🔴 Generar pide EL MISMO rango y corte que la barra muestra, y recién ahí sale «Descargar» con Excel/PDF/Comprobantes", async () => {
    const ll = servir(); montar();
    generar();
    await screen.findAllByText(/ALEJANDRA CAMAÑO/i);
    expect(urlDelCuadro(ll)).toBe("/api/asistencia/planilla?desde=2026-09-01&hasta=2026-09-15&empresa=confecciones_boston&corte=2026-09-13");
    fireEvent.click(boton(/^Descargar/));
    expect(screen.getByRole("menuitem", { name: /^Excel$/ })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: /^PDF$/ })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: /^Comprobantes$/ })).toBeTruthy();
  });

  /* 🩸 CAMBIÓ DE DIRECCIÓN EL 15-sep-2026. Acá había dos casos: «elegir 1–15 sep
   * por calendario arma la MISMA URL que el botón» y «un rango libre por
   * calendario se pide TAL CUAL». Los dos probaban una puerta que Daniel mandó
   * cerrar: *«si la quincena es fija, que no haya opción de rango, solo las
   * opciones»*. Quedan estos dos en su lugar. */
  it("🔴 la quincena del MES ANTERIOR se pide de verdad — para eso está la flecha «‹»", async () => {
    // Sin ella, estando en octubre no habría forma de abrir ni cerrar la
    // quincena 1–15 de septiembre, que es cuando la contadora la cierra.
    const ll = servir(); montar();
    atras(); // 1 – 15 sep → 16 – 30 ago
    expect(screen.getByText(rotuloDelPeriodo("2026-08-16", "2026-08-30"))).toBeTruthy();
    expect(corteInput().value).toBe("2026-08-28");
    generar();
    await screen.findAllByText(/ALEJANDRA CAMAÑO/i);
    expect(urlDelCuadro(ll)).toBe("/api/asistencia/planilla?desde=2026-08-16&hasta=2026-08-30&empresa=confecciones_boston&corte=2026-08-28");
  });

  it("🔴 CONTROL: la RUTA sigue aceptando rangos libres — de eso vive el ajuste de la quincena anterior", async () => {
    // `medirAjusteAnterior` vuelve a llamar a la MISMA ruta con el rango corto
    // de los días que quedaron sin medir, para valuarlos sin duplicar el motor.
    // Si alguien cierra la ruta «ya que el calendario no está», se muere el
    // ajuste. Esto se verifica en el servidor, no en la pantalla.
    const { readFileSync } = await import("node:fs");
    const ruta = readFileSync("src/app/api/asistencia/planilla/route.ts", "utf-8");
    expect(ruta).toContain("medirAjusteAnterior");
    // La ruta lee `desde`/`hasta` de la query, sin exigir que sean una quincena.
    expect(ruta).toMatch(/sp\.get\("desde"\)/);
    expect(ruta).toMatch(/sp\.get\("hasta"\)/);
  });

  it("🩸 la «×» vacía el corte y el pedido va sin `corte`", async () => {
    // 🩸 CAMBIÓ DE DIRECCIÓN EL 24-sep-2026: era un botón «Quincena entera» al
    // lado del campo. Se retiró junto con el chip «Corte 13 sep» —los dos
    // hablaban del mismo valor que el campo ya decía— y quedó una «×» pegada al
    // campo. 🔴 LO QUE NO CAMBIÓ: vacío = se lee la quincena ENTERA, y el pedido
    // viaja SIN `corte`, exactamente igual que antes.
    const ll = servir(); montar();
    fireEvent.click(boton(/^Quitar el corte$/));
    expect(corteInput().value).toBe("");
    // Sin corte, el reloj se lee hasta el fin de la medición de la quincena.
    expect(screen.getByText(/Corte del reloj · lee del 1 al 15 sep/)).toBeTruthy();
    generar();
    await waitFor(() => expect(urlDelCuadro(ll)).toBe("/api/asistencia/planilla?desde=2026-09-01&hasta=2026-09-15&empresa=confecciones_boston"));
  });
});

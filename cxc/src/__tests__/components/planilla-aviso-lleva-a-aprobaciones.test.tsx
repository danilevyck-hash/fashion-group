/**
 * ─────────────────────────────────────────────────────────────────────────────
 * EL AVISO DE HORAS EXTRA SIN APROBAR LLEVA A LA PERSONA (3-sep-2026)
 *
 * Daniel, textual: *«si, no dejar cerrar hasta que se apruebe o se rechace, y
 * al hacer clic en el mensaje de aprobacion, que te lleve al colaborador para
 * aprobar»*.
 *
 * Dos pantallas, un recorrido:
 *
 *   1. PLANILLA — el aviso ámbar «N personas tienen horas extra sin aprobar» y
 *      el freno rojo del cierre nombran a cada persona como un ENLACE a
 *      `?tab=aprobaciones&persona=<código>`, con el rango del cuadro.
 *   2. APROBACIONES — con `persona` en la URL toma el rango de la URL, ABRE el
 *      primer día que esa persona tiene sin aprobar, resalta su fila
 *      (`aria-current`) y muestra el chip «Mostrando a … — ver a todos ×».
 *      Sin `persona` (CONTROL), nada cambia: días cerrados, sin chip.
 *
 * 🩸 El doble del selector de rango es obligatorio acá (ver el candado de
 * cerrar-quincena): `next/dynamic` no resuelve bajo vitest.
 * Fechas fijas. `next/navigation` se dobla por archivo, con la URL que cada
 * caso necesita.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor, within } from "@testing-library/react";
import { act } from "react";

import { ToastProvider } from "@/components/ToastSystem";
import { REGLAS_DEFAULT } from "@/lib/asistencia/config";
import {
  HORAS_CERO, TOTALES_CERO, MANUALES_CERO, quincena, periodoDeQuincena, type LineaPlanilla,
} from "@/lib/asistencia/planilla";
import { enlaceAprobaciones, type DiaAprobacion } from "@/lib/asistencia/aprobaciones";
import PlanillaTab from "@/app/asistencia/PlanillaTab";
import AprobacionesTab from "@/app/asistencia/AprobacionesTab";

// ── next/navigation: la URL la pone cada caso ────────────────────────────────
let URL_ACTUAL = "";
const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace, refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/asistencia",
  useSearchParams: () => new URLSearchParams(URL_ACTUAL),
}));

vi.mock("@/components/ui/RangoFechas", () => ({
  __esModule: true,
  default: ({ desde, hasta, vacio, onChange, accion }: {
    desde: string; hasta: string; vacio?: boolean;
    onChange: (d: string, h: string) => void; accion?: React.ReactNode;
  }) => (
    <div data-testid="rango" data-desde={desde} data-hasta={hasta}>
      <button type="button" onClick={() => onChange(desde, hasta)}>
        {vacio ? "Elige el período" : `${desde} – ${hasta}`}
      </button>
      {accion}
    </div>
  ),
  // 🔑 Un rango RECORDADO distinto del de la URL: si la pestaña lo tomara, el
  // caso «el rango viene de la URL» se pondría rojo.
  ultimoRango: () => ({ desde: "2026-07-01", hasta: "2026-07-15" }),
}));

// ═════════════════════════════════════════════════════════════════════════════
// 1. LA PLANILLA
// ═════════════════════════════════════════════════════════════════════════════

const Q = quincena(2026, 8, 1); // 1 → 15 de agosto de 2026

const dinero = {
  rataHora: 5.77, valorMinuto: 0.0962, salarioQuincenal: 500, baseSeguros: null,
  extraDiurno: 0, extraNocturno: 0, excedente: 0, domingos: 0, feriados: 0,
  ausencias: 0, ausenciaPorTardanza: 0, ausenciaDeDiaCompleto: 0,
  vacacionesYaPagadas: 0, tardanzas: 0, totalBruto: 500, seguroSocial: 48.75,
  seguroEducativo: 6.25, isr: 0, prestamo: 0, terceros: 0, mercancia: 0,
  totalDeducciones: 55, otrosServicios: 0, netoPagar: 445,
};

const linea = (over: Partial<LineaPlanilla> = {}): LineaPlanilla => ({
  codigo: "6", etiqueta: "KEVIN LUBO", nombre: "KEVIN LUBO",
  empresa: "fashion_wear", empresaEtiqueta: "Fashion Wear",
  salarioMensual: 1000, jornadaSemanal: 40, horas: { ...HORAS_CERO },
  faltaConfigurar: [], fueraDePlanilla: false, pagaSeguros: true,
  decidirAMano: null, quincenalReferencia: null, dinero,
  manuales: { ...MANUALES_CERO },
  extraMedido: null, extraAprobada: false,
  extraNoAprobada: { minutos: 150, diurnoMin: 150, nocturnoMin: 0, monto: 12.2 },
  ...over,
} as LineaPlanilla);

const EXTRA_SIN_APROBAR = [
  { codigo: "6", etiqueta: "KEVIN LUBO", minutos: 150, monto: 12.2 },
  { codigo: "11", etiqueta: "JULIO GARAY", minutos: 76.5, monto: 9.2 },
];

const AVISOS = {
  faltaMigracionConfiguracion: null, faltaMigracionManual: null,
  faltaMigracionBajas: null, faltaMigracionServicioProfesional: null,
  faltaMigracionVacaciones: null, faltaMigracionAprobaciones: null,
  faltaMigracionReparto: null, repartosRechazados: [], avisoRepartoRechazado: null,
  fueraPorBaja: 0, marcoDespuesDeIrse: 0, sinHorario: 0, salidaAsumida: "17:00",
  horasAusenciaDefault: 8, conSabado: 0, periodoAbierto: null,
  sinFicha: [], avisoSinFicha: null,
  vacacionesNoPagadas: [], avisoVacacionesNoPagadas: null,
  extraSinAprobar: EXTRA_SIN_APROBAR,
  avisoExtraSinAprobar: "2 personas tienen horas extra sin aprobar: NO se pagaron en este cuadro. Se aprueban en la pestaña Aprobaciones. KEVIN LUBO · 2,50 h · $12.20 — JULIO GARAY · 1,28 h · $9.20",
  rangoLibre: false, factorBase: 1, diasCalendario: 15,
};

const CUADRO = {
  quincena: Q, periodo: periodoDeQuincena(Q),
  empresa: "fashion_wear", empresaEtiqueta: "Fashion Wear",
  lineas: [linea(), linea({ codigo: "11", etiqueta: "JULIO GARAY", nombre: "JULIO GARAY" })],
  totales: { ...TOTALES_CERO, ...dinero, personas: 2 },
  reglas: REGLAS_DEFAULT, prestamos: [], avisos: AVISOS,
};
const BORRADOR = { ok: true, estado: "borrador", cerrada: null, solapadas: [], historial: [], aviso: null };

const FRENO = {
  tipo: "horas-extra", personas: 2,
  quienes: ["KEVIN LUBO", "JULIO GARAY"], codigos: ["6", "11"],
  texto: "2 personas tienen horas extra sin aprobar (KEVIN LUBO · 150.00 min, JULIO GARAY · 76.50 min). Ve a la pestaña «Aprobaciones», aprueba o deja sin aprobar esas horas, y vuelve a cerrar.",
};

function servirPlanilla(conFreno = false) {
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    let status = 200; let body: unknown = CUADRO;
    if (u.includes("planilla-guardada")) {
      if (init?.method === "POST" && conFreno) { status = 409; body = { ok: false, error: "No se puede cerrar", frenos: [FRENO] }; }
      else body = BORRADOR;
    }
    return { ok: status < 300, status, json: async () => body } as Response;
  }));
}

function generar() {
  fireEvent.click(screen.getAllByRole("button", { name: /Elige el período/ })[0]);
  fireEvent.click(screen.getAllByRole("button", { name: /^Generar$/ })[0]);
}

const ESPERADO_KEVIN = "/asistencia?tab=aprobaciones&persona=6&desde=2026-08-01&hasta=2026-08-15";

beforeEach(() => {
  URL_ACTUAL = "";
  replace.mockClear();
  vi.setSystemTime(new Date("2026-08-10T15:00:00Z"));
  sessionStorage.setItem("cxc_role", "admin");
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); sessionStorage.clear(); });

describe("🔴 PLANILLA: cada persona del aviso es un enlace a Aprobaciones", () => {
  it("el aviso tiene la cabecera y UN enlace por persona, con persona=<código> y el rango del cuadro", async () => {
    servirPlanilla();
    render(<ToastProvider><PlanillaTab /></ToastProvider>);
    generar();
    const aviso = await screen.findByTestId("aviso-extra-sin-aprobar");
    expect(aviso.textContent).toContain("2 personas tienen horas extra sin aprobar");
    expect(aviso.textContent).toContain("Se aprueban en la pestaña Aprobaciones");

    const enlaces = within(aviso).getAllByRole("link");
    expect(enlaces).toHaveLength(2);
    expect(enlaces[0].getAttribute("href")).toBe(ESPERADO_KEVIN);
    expect(enlaces[0].textContent).toContain("KEVIN LUBO");
    expect(enlaces[0].textContent).toContain("2,50 h");
    expect(enlaces[0].textContent).toContain("$12.20");
    expect(enlaces[1].getAttribute("href"))
      .toBe("/asistencia?tab=aprobaciones&persona=11&desde=2026-08-01&hasta=2026-08-15");
    // 🔑 La URL sale del MISMO armador que usa la pantalla de Aprobaciones para
    // leerla: un solo nombre de parámetro.
    expect(enlaces[0].getAttribute("href"))
      .toBe(enlaceAprobaciones("6", { desde: "2026-08-01", hasta: "2026-08-15" }));
  });

  it("🔴 el freno del cierre también: cada nombre lleva a su persona", async () => {
    servirPlanilla(true);
    render(<ToastProvider><PlanillaTab /></ToastProvider>);
    generar();
    await screen.findByTestId("aviso-extra-sin-aprobar");
    fireEvent.click(screen.getByRole("button", { name: "Cerrar quincena" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Cerrar quincena" }));
    const cartel = (await screen.findByText(/No se puede cerrar la quincena todavía/)).parentElement!;
    const enlaces = within(cartel).getAllByRole("link");
    expect(enlaces.map((a) => a.getAttribute("href"))).toEqual([
      ESPERADO_KEVIN,
      "/asistencia?tab=aprobaciones&persona=11&desde=2026-08-01&hasta=2026-08-15",
    ]);
    expect(enlaces[0].textContent).toBe("KEVIN LUBO");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. APROBACIONES
// ═════════════════════════════════════════════════════════════════════════════

const gente = (xs: Array<[string, string, number, boolean]>) =>
  xs.map(([codigo, etiqueta, minutos, aprobado]) => ({
    codigo, etiqueta, empresa: "fashion_wear", empresaEtiqueta: "Fashion Wear",
    salida: "18:11", minutos, diurnoMin: minutos, nocturnoMin: 0,
    aprobado, por: aprobado ? "Julio" : null, cuando: null,
    minutosVistos: aprobado ? minutos : null, cambio: false,
  }));

// Kevin (6) tiene el lunes 3 APROBADO y el martes 4 SIN aprobar; Julio (11)
// el lunes sin aprobar. El primer día PENDIENTE de Kevin es el martes — y ese
// día también está Luis (9), que NO tiene que resaltarse.
const DIAS: DiaAprobacion[] = [
  { fecha: "2026-08-03", etiqueta: "lun 3 ago", semana: "2026-08-03", minutos: 176,
    gente: gente([["11", "JULIO GARAY", 76, false], ["6", "KEVIN LUBO", 100, true]]) },
  { fecha: "2026-08-04", etiqueta: "mar 4 ago", semana: "2026-08-03", minutos: 90,
    gente: gente([["6", "KEVIN LUBO", 50, false], ["9", "LUIS ARROYO", 40, false]]) },
  { fecha: "2026-08-05", etiqueta: "mié 5 ago", semana: "2026-08-03", minutos: 40,
    gente: gente([["9", "LUIS ARROYO", 40, false]]) },
];

let pedidas: string[] = [];
function servirAprobaciones(dias: DiaAprobacion[] = DIAS) {
  pedidas = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    pedidas.push(String(url));
    return { ok: true, json: async () => ({ aprobaciones: dias, puedeAprobar: true, avisos: {} }) } as Response;
  }));
}

async function montarAprobaciones(dias: DiaAprobacion[] = DIAS) {
  servirAprobaciones(dias);
  render(<ToastProvider><AprobacionesTab /></ToastProvider>);
  await waitFor(() => expect(pedidas.length).toBeGreaterThan(0));
  await waitFor(() => expect(screen.queryByText("Cargando…")).toBeNull());
}

describe("🔴 APROBACIONES con ?persona= en la URL", () => {
  beforeEach(() => { URL_ACTUAL = "tab=aprobaciones&persona=6&desde=2026-08-01&hasta=2026-08-15"; });

  it("el rango es el de la URL, no el recordado", async () => {
    await montarAprobaciones();
    expect(pedidas[0]).toContain("desde=2026-08-01");
    expect(pedidas[0]).toContain("hasta=2026-08-15");
    expect(pedidas[0]).not.toContain("2026-07-01");
    expect(screen.getByTestId("rango").getAttribute("data-desde")).toBe("2026-08-01");
  });

  it("🔴 abre el primer día donde ESA persona tiene extras SIN aprobar (el martes, no el lunes aprobado)", async () => {
    await montarAprobaciones();
    // El martes está abierto: se ve la fila de Kevin de ese día.
    const martes = screen.getByText(/mar 4/).closest("button")!;
    expect(martes.getAttribute("aria-expanded")).toBe("true");
    // El lunes sigue cerrado: no se ve a Julio.
    expect(screen.getByText(/lun 3/).closest("button")!.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("JULIO GARAY")).toBeNull();
  });

  it("🔴 resalta SU fila (aria-current), y a nadie más", async () => {
    await montarAprobaciones();
    const resaltadas = document.querySelectorAll('[aria-current="true"]');
    expect(resaltadas).toHaveLength(1);
    expect(resaltadas[0].textContent).toContain("KEVIN LUBO");
    // Luis está en el mismo día abierto, a la vista y SIN resaltar.
    expect(screen.getByText("LUIS ARROYO")).toBeTruthy();
    expect(screen.getByText("LUIS ARROYO").closest("label")!.getAttribute("aria-current")).toBeNull();
    // Y los demás días siguen en pantalla: no se filtra a nadie.
    expect(screen.getByText(/mié 5/)).toBeTruthy();
    expect(screen.getByText(/lun 3/)).toBeTruthy();
  });

  it("muestra el chip «Mostrando a KEVIN LUBO — ver a todos ×», y tocarlo limpia `persona`", async () => {
    await montarAprobaciones();
    const chip = screen.getByTestId("chip-persona");
    expect(chip.textContent).toContain("Mostrando a");
    expect(chip.textContent).toContain("KEVIN LUBO");
    await act(async () => { within(chip).getByRole("button", { name: /ver a todos/ }).click(); });
    expect(replace).toHaveBeenCalled();
    const url = String(replace.mock.calls[replace.mock.calls.length - 1][0]);
    expect(url).not.toContain("persona=");
    expect(url).toContain("tab=aprobaciones");
  });

  it("si no tiene nada pendiente en el rango, lo dice y no abre ningún día", async () => {
    URL_ACTUAL = "tab=aprobaciones&persona=11&desde=2026-08-01&hasta=2026-08-15";
    const TODO_APROBADO: DiaAprobacion[] = [
      { ...DIAS[0], gente: gente([["11", "JULIO GARAY", 76, true], ["6", "KEVIN LUBO", 100, false]]) },
    ];
    await montarAprobaciones(TODO_APROBADO);
    expect(screen.getByTestId("chip-persona").textContent)
      .toContain("JULIO GARAY no tiene horas extra pendientes en este período.");
    expect(screen.getByText(/lun 3/).closest("button")!.getAttribute("aria-expanded")).toBe("false");
  });
});

describe("CONTROL: sin ?persona= nada cambia", () => {
  it("días cerrados, sin chip, sin fila resaltada, y el rango recordado manda", async () => {
    URL_ACTUAL = "tab=aprobaciones";
    await montarAprobaciones();
    expect(screen.queryByTestId("chip-persona")).toBeNull();
    expect(document.querySelectorAll('[aria-current="true"]')).toHaveLength(0);
    for (const t of ["lun 3", "mar 4", "mié 5"]) {
      expect(screen.getByText(new RegExp(t)).closest("button")!.getAttribute("aria-expanded")).toBe("false");
    }
    expect(screen.queryByText("KEVIN LUBO")).toBeNull();
    // El último rango recordado, como siempre.
    await waitFor(() => expect(pedidas.some((u) => u.includes("desde=2026-07-01"))).toBe(true));
  });
});

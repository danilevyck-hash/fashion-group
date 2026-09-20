/**
 * ─────────────────────────────────────────────────────────────────────────────
 * 🔴 LAS HORAS EXTRA SE DECIDEN DESDE EL REPORTE (19-sep-2026).
 *
 * Daniel: la columna «Extras» pasa a tener **Sí / No** ahí mismo, sin ir a la
 * pestaña Aprobaciones.
 *
 * Lo que este candado exige:
 *   A. Los dos botones salen donde hay hora extra que decidir, y solo ahí.
 *   B. 🔴 AL APROBAR MANDA EL SERVIDOR: el MISMO endpoint, el MISMO cuerpo y el
 *      MISMO `?empresa=` que usa la pestaña. Nada de lógica duplicada.
 *   C. Optimista y reversible: si el servidor dice que no, la pantalla vuelve.
 *   D. Control: la pestaña Aprobaciones no se tocó.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import fs from "fs";
import path from "path";
import { render, screen, fireEvent, cleanup, waitFor, within } from "@testing-library/react";

import { ToastProvider } from "@/components/ToastSystem";
import { REGLAS_DEFAULT } from "@/lib/asistencia/config";
import { MOTIVOS_JUSTIFICACION } from "@/lib/asistencia/motivos";
import { seDecideEnElReporte, etiquetaDecidirExtra } from "@/lib/asistencia/extras-decididas";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/asistencia",
  useSearchParams: () => new URLSearchParams(""),
}));

import ReporteTab from "@/app/asistencia/ReporteTab";

const RAIZ = process.cwd();

afterEach(() => { cleanup(); vi.unstubAllGlobals(); sessionStorage.clear(); });

type Llamada = { url: string; init?: RequestInit };
function servir(respuestas: Array<[string, unknown]>, llamadas: Llamada[] = [], falla?: string) {
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    llamadas.push({ url: u, init });
    if (falla && u.includes(falla)) {
      return { ok: false, status: 403, json: async () => ({ error: "No es de tu empresa" }) } as Response;
    }
    const par = respuestas.find(([frag]) => u.includes(frag));
    return { ok: true, status: 200, json: async () => par?.[1] ?? {} } as Response;
  }));
  return llamadas;
}
const montar = (ui: React.ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);

const dia = (over: Record<string, unknown>) => ({
  fecha: "2026-08-31", marcas: [], marcasIds: [], entrada: null, salida: null,
  tardeMin: 0, excesoAlmuerzoMin: 0, salidaTempranaMin: 0, extraMin: 0, trabajadoMin: 0,
  revisar: false, ausente: false, justificado: null, feriado: null, habil: true,
  correcciones: [], repetidas: [], ...over,
});

/** Un día CON hora extra: el que se decide. */
const CON_EXTRA = dia({
  fecha: "2026-08-31",
  marcas: ["08:00:00", "12:00:00", "13:00:00", "19:30:00"],
  marcasIds: ["m1", "m2", "m3", "m4"],
  extraMin: 150,
});
/** Un día SIN hora extra: no hay nada que decidir. */
const SIN_EXTRA = dia({
  fecha: "2026-09-01",
  marcas: ["08:00:00", "12:00:00", "13:00:00", "17:00:00"],
  marcasIds: ["m5", "m6", "m7", "m8"],
});

const persona = (over: Record<string, unknown> = {}) => ({
  codigo: "17", nombre: "KENER HERNANDEZ", salida: "17:00", almuerzoMin: 30,
  dias: [CON_EXTRA, SIN_EXTRA],
  resumen: {
    diasTrabajados: 2, ausenciasSinJustificar: 0, ausenciasJustificadas: 0, diasTrabajandoFuera: 0,
    vecesTarde: 0, minutosTarde: 0, minutosTardeDeDiasARevisar: 0,
    excesoAlmuerzoMin: 0, salidaTempranaMin: 0, tiempoNoTrabajadoMin: 0, extraMin: 150,
    diasARevisar: 0, diasCorregidos: 0,
  },
  ...over,
});

const base = (over: Record<string, unknown> = {}, p = persona()): Array<[string, unknown]> => [
  ["/api/asistencia/reloj", { relojes: [] }],
  ["/api/asistencia/justificaciones", { justificaciones: [], personas: [], motivos: MOTIVOS_JUSTIFICACION }],
  ["/correcciones/motivos", { motivos: [] }],
  ["/api/asistencia/aprobaciones", { ok: true, decision: "si", dias: 1 }],
  ["/api/asistencia/reporte", {
    personas: [p], sinHorario: 0, reglas: REGLAS_DEFAULT,
    correccionesDisponible: true, decisionesExtra: {}, ...over,
  }],
];

async function abrirPersona() {
  fireEvent.click(await screen.findByText("Kener Hernandez"));
  await screen.findByText("lun 31 ago");
}
const filaDe = (fecha: string) =>
  screen.getByText((_t, el) => el?.tagName === "TD" && el.textContent?.trim().endsWith(fecha) === true
    && el.getAttribute("colspan") === null)
    .closest("tr") as HTMLTableRowElement;

const ETIQUETA = etiquetaDecidirExtra("Kener Hernandez", "lun 31 ago");

// ─────────────────────────────────────────────────────────────────────────────
// A. DÓNDE SALEN LOS BOTONES
// ─────────────────────────────────────────────────────────────────────────────

describe("A · los dos botones salen donde hay algo que decidir", () => {
  it("la regla pura: hace falta hora extra Y que la cobre", () => {
    expect(seDecideEnElReporte(150, true)).toBe(true);
    expect(seDecideEnElReporte(0, true)).toBe(false);
    expect(seDecideEnElReporte(150, false)).toBe(false);
    expect(seDecideEnElReporte(Number.NaN, true)).toBe(false);
  });

  it("🔴 en el día con extra salen «Sí» y «No»; en el día sin extra, no", async () => {
    sessionStorage.setItem("cxc_role", "admin");
    servir(base());
    montar(<ReporteTab />);
    await abrirPersona();
    const conExtra = filaDe("31 ago");
    expect(within(conExtra).getByRole("button", { name: `Sí a ${ETIQUETA}` })).toBeTruthy();
    expect(within(conExtra).getByRole("button", { name: `No a ${ETIQUETA}` })).toBeTruthy();
    const sinExtra = filaDe("1 sep");
    expect(within(sinExtra).queryByRole("button", { name: /^Sí a / })).toBeNull();
  });

  it("🔴 quien no puede aprobar no ve los botones (y el servidor lo frena igual)", async () => {
    sessionStorage.setItem("cxc_role", "secretaria");
    servir(base());
    montar(<ReporteTab />);
    await abrirPersona();
    expect(screen.queryByRole("button", { name: /^Sí a / })).toBeNull();
  });

  it("quien no cobra horas extra no tiene nada que decidir", async () => {
    sessionStorage.setItem("cxc_role", "admin");
    servir(base({}, persona({ cobraHorasExtra: false })));
    montar(<ReporteTab />);
    await abrirPersona();
    expect(screen.queryByRole("button", { name: /^Sí a / })).toBeNull();
  });

  it("lo ya decidido llega prendido desde el servidor", async () => {
    sessionStorage.setItem("cxc_role", "admin");
    servir(base({ decisionesExtra: { "17|2026-08-31": "no" } }));
    montar(<ReporteTab />);
    await abrirPersona();
    const fila = filaDe("31 ago");
    expect(within(fila).getByRole("button", { name: `No a ${ETIQUETA}` }).getAttribute("aria-pressed")).toBe("true");
    expect(within(fila).getByRole("button", { name: `Sí a ${ETIQUETA}` }).getAttribute("aria-pressed")).toBe("false");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B. 🔴 AL APROBAR MANDA EL SERVIDOR — el mismo endpoint, sin lógica duplicada
// ─────────────────────────────────────────────────────────────────────────────

describe("B · manda el servidor", () => {
  it("🔴 tocar «Sí» manda el MISMO cuerpo que la pestaña Aprobaciones", async () => {
    sessionStorage.setItem("cxc_role", "admin");
    const llamadas = servir(base());
    montar(<ReporteTab empresa="vistana" />);
    await abrirPersona();
    fireEvent.click(screen.getByRole("button", { name: `Sí a ${ETIQUETA}` }));
    await waitFor(() => {
      expect(llamadas.some((l) => l.url.includes("/api/asistencia/aprobaciones"))).toBe(true);
    });
    const post = llamadas.find((l) => l.url.includes("/api/asistencia/aprobaciones"));
    expect(post?.init?.method).toBe("POST");
    // 🔴 El `?empresa=` viaja: con él la ruta rechaza cualquier código ajeno.
    expect(post?.url).toContain("empresa=vistana");
    expect(JSON.parse(String(post?.init?.body))).toEqual({
      decision: "si",
      dias: [{ codigo: "17", fecha: "2026-08-31", minutos: 150 }],
    });
  });

  it("volver a tocar el que está prendido lo APAGA (vuelve a pendiente)", async () => {
    sessionStorage.setItem("cxc_role", "admin");
    const llamadas = servir(base({ decisionesExtra: { "17|2026-08-31": "si" } }));
    montar(<ReporteTab />);
    await abrirPersona();
    fireEvent.click(screen.getByRole("button", { name: `Sí a ${ETIQUETA}` }));
    await waitFor(() => {
      expect(llamadas.some((l) => l.url.includes("/api/asistencia/aprobaciones"))).toBe(true);
    });
    const post = llamadas.find((l) => l.url.includes("/api/asistencia/aprobaciones"));
    expect(JSON.parse(String(post?.init?.body)).decision).toBeNull();
  });

  it("con «Todas» no se manda `?empresa=`: la ruta decide con el alcance", async () => {
    sessionStorage.setItem("cxc_role", "admin");
    const llamadas = servir(base());
    montar(<ReporteTab empresa="todas" />);
    await abrirPersona();
    fireEvent.click(screen.getByRole("button", { name: `No a ${ETIQUETA}` }));
    await waitFor(() => {
      expect(llamadas.some((l) => l.url.includes("/api/asistencia/aprobaciones"))).toBe(true);
    });
    expect(llamadas.find((l) => l.url.includes("/aprobaciones"))?.url).not.toContain("empresa=");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C. OPTIMISTA Y REVERSIBLE
// ─────────────────────────────────────────────────────────────────────────────

describe("C · si el servidor dice que no, la pantalla vuelve", () => {
  it("🔴 la decisión se pinta en el acto y se REVIERTE si el POST falla", async () => {
    sessionStorage.setItem("cxc_role", "admin");
    servir(base(), [], "/api/asistencia/aprobaciones");
    montar(<ReporteTab />);
    await abrirPersona();
    const si = () => screen.getByRole("button", { name: `Sí a ${ETIQUETA}` });
    expect(si().getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(si());
    // Optimista: se prende antes de que conteste el servidor.
    expect(si().getAttribute("aria-pressed")).toBe("true");
    // Y vuelve, porque el servidor lo rechazó.
    await waitFor(() => expect(si().getAttribute("aria-pressed")).toBe("false"));
    expect(await screen.findByText("No es de tu empresa")).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// D. CONTROL — la pestaña Aprobaciones no se tocó, y no hay lógica duplicada
// ─────────────────────────────────────────────────────────────────────────────

describe("D · control", () => {
  it("🔴 el Reporte usa el MISMO componente de botones que Aprobaciones", () => {
    const reporte = fs.readFileSync(path.join(RAIZ, "src/app/asistencia/ReporteTab.tsx"), "utf8");
    expect(reporte).toContain('import { BotonesSiNo } from "./aprobaciones/BotonesSiNo"');
  });

  it("🔴 el Reporte NO rehace la cuenta de qué se aprueba: no importa `diasConExtra`", () => {
    const reporte = fs.readFileSync(path.join(RAIZ, "src/app/asistencia/ReporteTab.tsx"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/[^\n]*/g, "");
    for (const prohibido of ["diasConExtra", "clasificarDia", "recargoDomingoFeriado"]) {
      expect(reporte.includes(prohibido), `ReporteTab rehace ${prohibido}`).toBe(false);
    }
  });

  it("🔴 la pestaña Aprobaciones sigue existiendo y sigue decidiendo igual", () => {
    const tab = fs.readFileSync(path.join(RAIZ, "src/app/asistencia/AprobacionesTab.tsx"), "utf8");
    expect(tab).toContain("/api/asistencia/aprobaciones");
    // Sus dos vistas siguen montando los MISMOS botones, con el mismo `decidir`.
    for (const f of ["PorDia.tsx", "PorColaborador.tsx"]) {
      const vista = fs.readFileSync(path.join(RAIZ, "src/app/asistencia/aprobaciones", f), "utf8");
      expect(vista).toContain("BotonesSiNo");
      // Y siguen siendo las únicas que ofrecen el domingo y el feriado trabajados.
      expect(vista).toContain("ChipTipo");
    }
  });
});

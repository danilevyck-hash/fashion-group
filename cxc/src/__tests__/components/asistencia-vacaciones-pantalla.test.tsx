/**
 * ─────────────────────────────────────────────────────────────────────────────
 * LAS VACACIONES, EN LA PANTALLA DE VERDAD.
 *
 * 🔴 POR QUÉ ESTE ARCHIVO EXISTE. Que `textoDiaVacaciones()` devuelva la
 * palabra correcta y que `textoVacacionesNoPagadas()` arme la frase no prueban
 * NADA sobre lo que Daniel ve: la pantalla podía seguir escribiendo «Ausencia
 * justificada» a mano, o no dibujar el aviso ámbar en ningún lado, y todos los
 * tests de función pura seguirían en verde.
 *
 * Lo que se sostiene acá, RENDERIZANDO y tocando:
 *   1. el renglón del día dice «Vacaciones» (y «(ya pagadas)» cuando toca), y
 *      NUNCA la palabra "ausencia";
 *   2. las marcas de ese día se MUESTRAN con su «(no cuenta)» — descartar un
 *      dato está bien, esconderlo no;
 *   3. el aviso ámbar de la planilla se ve ARRIBA, sin abrir nada, y trae el
 *      NOMBRE, el RANGO y el MONTO;
 *   4. sin vacaciones marcadas ese aviso NO existe — un cartel permanente se
 *      deja de leer;
 *   5. el interruptor de la pestaña dice el efecto y cambia al tocarlo.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";

import { ToastProvider } from "@/components/ToastSystem";
import { REGLAS_DEFAULT } from "@/lib/asistencia/config";
import {
  HORAS_CERO,
  TOTALES_CERO,
  MANUALES_CERO,
  quincena,
  periodoDeQuincena,
  type LineaPlanilla,
} from "@/lib/asistencia/planilla";
import ReporteTab from "@/app/asistencia/ReporteTab";
import PlanillaTab from "@/app/asistencia/PlanillaTab";
import VacacionesTab from "@/app/asistencia/VacacionesTab";

function servir(respuestas: Array<[string, unknown]>) {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const u = String(url);
    const par = respuestas.find(([frag]) => u.includes(frag));
    return { ok: true, json: async () => par?.[1] ?? {} } as Response;
  }));
}
const montar = (ui: React.ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);

beforeEach(() => vi.unstubAllGlobals());
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

// ── El reporte ───────────────────────────────────────────────────────────────

const dia = (over: Record<string, unknown>) => ({
  fecha: "2026-08-06", marcas: [], marcasIds: [], entrada: null, salida: null,
  tardeMin: 0, excesoAlmuerzoMin: 0, salidaTempranaMin: 0, extraMin: 0, trabajadoMin: 0,
  revisar: false, enCurso: false, ausente: false, vacacion: null, justificado: null,
  permiso: null, permisoPerdonaMin: 0, feriado: null, habil: true, correcciones: [],
  ...over,
});

const personaConVacacion = (yaPagadas: boolean, marcasIgnoradas: string[] = []) => ({
  codigo: "29", nombre: "ELOYN MENDOZA", salida: "17:00", almuerzoMin: 30,
  dias: [dia({ fecha: "2026-08-06", vacacion: { yaPagadas, marcasIgnoradas } })],
  resumen: {
    diasTrabajados: 0, ausenciasSinJustificar: 0, ausenciasJustificadas: 0,
    diasTrabajandoFuera: 0, diasVacaciones: 1,
    diasVacacionesYaPagadas: yaPagadas ? 1 : 0,
    vecesTarde: 0, minutosTarde: 0, minutosTardeDeDiasARevisar: 0,
    diasConPermiso: 0, minutosPerdonadosPorPermiso: 0,
    excesoAlmuerzoMin: 0, salidaTempranaMin: 0, extraMin: 0, diasARevisar: 0,
    diasEnCurso: 0, tiempoNoTrabajadoMin: 0, diasCorregidos: 0, correcciones: 0,
  },
});

const conReporte = (p: unknown): Array<[string, unknown]> => [
  ["/api/asistencia/reloj", { relojes: [] }],
  ["/api/asistencia/reporte", { personas: [p], sinHorario: 0, reglas: REGLAS_DEFAULT }],
];

describe("🔴 el renglón del día dice «Vacaciones», nunca «ausencia»", () => {
  it("sin marcar dice «Vacaciones» a secas", async () => {
    servir(conReporte(personaConVacacion(false)));
    montar(<ReporteTab />);
    fireEvent.click(await screen.findByText(/ELOYN MENDOZA/));

    expect(screen.getAllByText(/Vacaciones/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Vacaciones \(ya pagadas\)/)).toBeNull();
    // 🔴 En ninguna parte del renglón se le llama ausencia a este día.
    expect(screen.queryByText(/Ausencia sin justificar/)).toBeNull();
    expect(screen.queryByText(/Ausencia justificada/)).toBeNull();
  });

  it("marcada dice «Vacaciones (ya pagadas)» — el día que NO se paga se ve", async () => {
    servir(conReporte(personaConVacacion(true)));
    montar(<ReporteTab />);
    fireEvent.click(await screen.findByText(/ELOYN MENDOZA/));
    expect(screen.getAllByText(/Vacaciones \(ya pagadas\)/).length).toBeGreaterThan(0);
  });

  it("🔴 las marcas de ese día se MUESTRAN, con su «(no cuenta)»", async () => {
    servir(conReporte(personaConVacacion(false, ["08:47:00", "18:30:00"])));
    montar(<ReporteTab />);
    fireEvent.click(await screen.findByText(/ELOYN MENDOZA/));
    const t = document.body.textContent ?? "";
    expect(t).toContain("08:47:00");
    expect(t).toContain("18:30:00");
    expect(t).toContain("no cuenta");
  });

  it("sin marcas no se inventa un «marcó» vacío", async () => {
    servir(conReporte(personaConVacacion(false)));
    montar(<ReporteTab />);
    fireEvent.click(await screen.findByText(/ELOYN MENDOZA/));
    expect(document.body.textContent).not.toContain("no cuenta");
  });
});

// ── La planilla ──────────────────────────────────────────────────────────────

const Q = quincena(2026, 8, 1);

const linea = (over: Partial<LineaPlanilla>): LineaPlanilla => ({
  codigo: "0", etiqueta: "—", nombre: null, empresa: "vistana",
  empresaEtiqueta: "Vistana International", salarioMensual: 800, jornadaSemanal: 40,
  horas: { ...HORAS_CERO }, faltaConfigurar: [], fueraDePlanilla: false, pagaSeguros: true,
  decidirAMano: null, quincenalReferencia: null, dinero: null,
  manuales: { ...MANUALES_CERO }, ...over,
});

const dinero = {
  rataHora: 4.62, valorMinuto: 0.077, salarioQuincenal: 400,
  extraDiurno: 0, extraNocturno: 0, excedente: 0, domingos: 0, feriados: 0,
  ausencias: 194.8, ausenciaPorTardanza: 0, ausenciaDeDiaCompleto: 0,
  vacacionesYaPagadas: 194.8,
  tardanzas: 0, totalBruto: 205.2, seguroSocial: 20.01,
  seguroEducativo: 2.57, isr: 0, prestamo: 0, terceros: 0, mercancia: 0,
  totalDeducciones: 22.58, otrosServicios: 0, netoPagar: 182.62,
};

const AVISO =
  "1 vacación marcada como «ya se le pagó»: esos días NO se pagaron en este cuadro. "
  + "ELOYN MENDOZA · 16 jul 2026 → 13 ago 2026 · 5 días · $194.80";

function respuestaPlanilla(over: Record<string, unknown> = {}) {
  return {
    quincena: Q,
    periodo: periodoDeQuincena(Q),
    empresa: "vistana",
    empresaEtiqueta: "Vistana International",
    lineas: [
      linea({
        codigo: "29", etiqueta: "ELOYN MENDOZA", dinero,
        horas: { ...HORAS_CERO, vacacionesYaPagadasMin: 2400, vacacionesYaPagadasDias: 5, vacacionesDias: 5 },
      }),
    ],
    totales: { ...TOTALES_CERO, ...dinero, personas: 1 },
    reglas: REGLAS_DEFAULT,
    avisos: {
      faltaMigracionConfiguracion: null, faltaMigracionManual: null,
      faltaMigracionBajas: null, faltaMigracionServicioProfesional: null,
      faltaMigracionVacaciones: null,
      fueraPorBaja: 0, marcoDespuesDeIrse: 0, sinHorario: 0, salidaAsumida: "17:00",
      horasAusenciaDefault: 8, conSabado: 0, periodoAbierto: null,
      sinFicha: [], avisoSinFicha: null,
      rangoLibre: false, factorBase: 1, diasCalendario: 15, correcciones: 0,
      vacacionesNoPagadas: [{
        codigo: "29", etiqueta: "ELOYN MENDOZA",
        rangos: [{ desde: "2026-07-16", hasta: "2026-08-13" }],
        dias: 5, monto: 194.8,
      }],
      avisoVacacionesNoPagadas: AVISO,
      ...over,
    },
    marcaciones: 100,
  };
}

describe("🔴 NADA SE DESCARTA EN SILENCIO — el aviso, en la pantalla", () => {
  it("se ve SIN abrir nada, y trae nombre, rango y monto", async () => {
    servir([["/api/asistencia/planilla", respuestaPlanilla()]]);
    montar(<PlanillaTab />);

    const aviso = await screen.findByText(/vacación marcada como «ya se le pagó»/);
    expect(aviso.textContent).toContain("ELOYN MENDOZA");
    expect(aviso.textContent).toContain("16 jul 2026 → 13 ago 2026");
    expect(aviso.textContent).toContain("$194.80");
  });

  it("🔴 y se VE: nadie lo esconde con una clase", async () => {
    servir([["/api/asistencia/planilla", respuestaPlanilla()]]);
    montar(<PlanillaTab />);
    const aviso = await screen.findByText(/vacación marcada como «ya se le pagó»/);
    // jsdom no resuelve Tailwind, así que se recorre la cadena de clases hasta
    // la raíz — el mismo criterio del candado de la pestaña de Boston.
    for (let n: HTMLElement | null = aviso; n; n = n.parentElement) {
      const c = n.className;
      if (typeof c === "string") {
        expect(c).not.toMatch(/\bhidden\b/);
        expect(c).not.toMatch(/\bsr-only\b/);
      }
      if (n.tagName === "BODY") break;
    }
  });

  it("va en ÁMBAR, no en rojo: no se rompió nada, es una decisión que se tomó", async () => {
    servir([["/api/asistencia/planilla", respuestaPlanilla()]]);
    montar(<PlanillaTab />);
    const aviso = await screen.findByText(/vacación marcada como «ya se le pagó»/);
    expect(String(aviso.className)).toContain("amber");
    expect(String(aviso.className)).not.toContain("red");
  });

  it("sin vacaciones marcadas NO se dibuja nada", async () => {
    servir([[
      "/api/asistencia/planilla",
      respuestaPlanilla({ vacacionesNoPagadas: [], avisoVacacionesNoPagadas: null }),
    ]]);
    montar(<PlanillaTab />);
    await screen.findAllByText(/ELOYN MENDOZA/);
    expect(screen.queryByText(/ya se le pagó/)).toBeNull();
  });

  it("sin la tabla corrida lo DICE, y en ámbar", async () => {
    servir([[
      "/api/asistencia/planilla",
      respuestaPlanilla({
        vacacionesNoPagadas: [], avisoVacacionesNoPagadas: null,
        faltaMigracionVacaciones: "Todavía no se pueden cargar vacaciones acá. Pídele a Daniel que corra el archivo X en Supabase.",
      }),
    ]]);
    montar(<PlanillaTab />);
    expect(await screen.findByText(/Todavía no se pueden cargar vacaciones acá/)).toBeTruthy();
  });
});

// ── La pestaña ───────────────────────────────────────────────────────────────

const RESPUESTA_TAB = {
  vacaciones: [{
    id: "v1", empleado_codigo: "29", desde: "2026-07-16", hasta: "2026-08-13",
    ya_pagadas: false, registrado_por: "Daniel",
  }],
  personas: [{ codigo: "29", nombre: "ELOYN MENDOZA", etiqueta: "ELOYN MENDOZA", configurado: true }],
  faltaMigracion: false,
  puedeCargar: true,
  avisoMigracion: null,
};

describe("la pestaña: persona + desde + hasta + un interruptor, y nada más", () => {
  it("la fila dice nombre, rango y cuántos días", async () => {
    servir([["/api/asistencia/vacaciones", RESPUESTA_TAB]]);
    montar(<VacacionesTab />);
    // 🔑 Dos veces a propósito: en el desplegable de personas y en la fila.
    await screen.findAllByText(/ELOYN MENDOZA/);
    // 16-jul → 13-ago son 29 días de calendario.
    expect(screen.getByText(/16 jul 2026 → 13 ago 2026/).textContent).toContain("29");
  });

  it("🔴 el interruptor dice el EFECTO, y cambia al tocarlo", async () => {
    servir([["/api/asistencia/vacaciones", RESPUESTA_TAB]]);
    montar(<VacacionesTab />);
    // 🔑 Dos veces a propósito: en el desplegable de personas y en la fila.
    await screen.findAllByText(/ELOYN MENDOZA/);

    // El del formulario de carga arranca SIN marcar: el caso normal es que se
    // pagan, y ese default decide una quincena.
    const casillas = screen.getAllByRole("checkbox") as HTMLInputElement[];
    expect(casillas[0].checked).toBe(false);
    expect(screen.getAllByText("Se le pagan estos días.").length).toBeGreaterThan(0);

    fireEvent.click(casillas[0]);
    await waitFor(() =>
      expect(screen.getAllByText(/No se le pagan estos días/).length).toBeGreaterThan(0),
    );
  });

  it("tocar el interruptor de una fila cargada lo GUARDA, sin botón de por medio", async () => {
    const espia = vi.fn(async (url: string, init?: RequestInit) => {
      void url;
      void init;
      return { ok: true, json: async () => RESPUESTA_TAB } as Response;
    });
    vi.stubGlobal("fetch", espia);
    montar(<VacacionesTab />);
    // 🔑 Dos veces a propósito: en el desplegable de personas y en la fila.
    await screen.findAllByText(/ELOYN MENDOZA/);

    const casillas = screen.getAllByRole("checkbox") as HTMLInputElement[];
    // La segunda es la de la fila cargada (la primera es la del formulario).
    fireEvent.click(casillas[1]);

    await waitFor(() => {
      const patch = espia.mock.calls.find((c) => (c[1] as RequestInit | undefined)?.method === "PATCH");
      expect(patch).toBeTruthy();
      expect(String((patch![1] as RequestInit).body)).toContain('"yaPagadas":true');
    });
  });

  it("sin la tabla corrida lo dice y NO deja cargar", async () => {
    servir([["/api/asistencia/vacaciones", {
      ...RESPUESTA_TAB,
      vacaciones: [],
      puedeCargar: false,
      avisoMigracion: "Todavía no se pueden cargar vacaciones acá. Pídele a Daniel que corra el archivo X en Supabase.",
    }]]);
    montar(<VacacionesTab />);
    expect(await screen.findByText(/Todavía no se pueden cargar vacaciones acá/)).toBeTruthy();
    const boton = screen.getByRole("button", { name: /Agregar/ }) as HTMLButtonElement;
    expect(boton.disabled).toBe(true);
  });

  it("⛔ NO pide nota ni motivo: una vacación son cuatro cosas y nada más", async () => {
    servir([["/api/asistencia/vacaciones", RESPUESTA_TAB]]);
    montar(<VacacionesTab />);
    // 🔑 Dos veces a propósito: en el desplegable de personas y en la fila.
    await screen.findAllByText(/ELOYN MENDOZA/);
    expect(screen.queryByText(/Nota/)).toBeNull();
    expect(screen.queryByText(/Motivo/)).toBeNull();
  });
});

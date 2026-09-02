/**
 * ─────────────────────────────────────────────────────────────────────────────
 * CERRAR LA QUINCENA — LA PANTALLA. (4-sep-2026)
 *
 * El backend ya existe y está probado al centavo (`asistencia-planilla-guardada`
 * y `planilla-guardada-route`, 36 mutaciones cazadas). Acá se prueba lo ÚNICO
 * que aquellos no pueden ver: que la persona que arma la planilla pueda hacer el
 * recorrido entero y entienda en qué estado está su cuadro.
 *
 *     elegir período → [Generar] → BORRADOR → revisar → [Cerrar quincena]
 *                                                   → CERRADA → [Reabrir]
 *
 * 🔴 LOS CUATRO ESTADOS SE VEN DISTINTO, y esa es la mitad del trabajo: un
 * borrador que se ve igual que una quincena cerrada es cómo alguien paga dos
 * veces o no paga nunca.
 *
 * 🔴 Y NADA SE RECALCULA POR DEBAJO. Escribir un monto a mano o aprobar un
 * préstamo NO vuelve a pedir el cuadro: lo marca viejo y aparece «Regenerar».
 * Antes se recargaba entero, o sea que los números se movían solos debajo de
 * quien los estaba revisando.
 *
 * 🩸 EL DOBLE DEL SELECTOR DE RANGO ES OBLIGATORIO acá y va en ESTE archivo:
 * `next/dynamic` no resuelve bajo vitest (el calendario se queda en su
 * `loading` para siempre) y `vi.mock` se iza POR ARCHIVO, así que desde un
 * helper importado no funciona. El doble dibuja `accion` porque el control real,
 * en modo `inline`, pone ahí el botón «Generar».
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor, within } from "@testing-library/react";

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
import { MIGRACION_PLANILLA_GUARDADA } from "@/lib/asistencia/planilla-guardada";
import PlanillaTab from "@/app/asistencia/PlanillaTab";

// ─────────────────────────────────────────────────────────────────────────────
// El doble del control de rango. `inline` viaja al DOM para poder afirmar lo
// que Daniel pidió: el calendario a la vista antes de generar, plegado después.
vi.mock("@/components/ui/RangoFechas", () => ({
  __esModule: true,
  default: ({ desde, hasta, vacio, inline, sugerido, onChange, accion }: {
    desde: string; hasta: string; vacio?: boolean; inline?: boolean;
    sugerido?: string | null;
    onChange: (d: string, h: string) => void;
    accion?: React.ReactNode;
  }) => (
    <div
      data-testid="rango" data-inline={inline ? "si" : "no"}
      data-desde={desde} data-hasta={hasta} data-sugerido={sugerido ?? ""}
    >
      <button type="button" onClick={() => onChange(desde, hasta)}>
        {vacio ? "Elige el período" : `${desde} – ${hasta}`}
      </button>
      <button type="button" data-testid="elegir-julio" onClick={() => onChange("2026-07-01", "2026-07-15")}>
        elegir julio
      </button>
      {accion}
    </div>
  ),
  ultimoRango: () => null,
}));

const Q = quincena(2026, 8, 1); // 1 → 15 de agosto de 2026

const dinero = {
  rataHora: 4.62, valorMinuto: 0.077, salarioQuincenal: 400, baseSeguros: null,
  extraDiurno: 0, extraNocturno: 0, excedente: 0, domingos: 0, feriados: 0,
  ausencias: 0, ausenciaPorTardanza: 0, ausenciaDeDiaCompleto: 0,
  vacacionesYaPagadas: 0, tardanzas: 0, totalBruto: 400, seguroSocial: 39,
  seguroEducativo: 5, isr: 0, prestamo: 0, terceros: 0, mercancia: 0,
  totalDeducciones: 44, otrosServicios: 0, netoPagar: 356,
};

const AVISOS = {
  faltaMigracionConfiguracion: null, faltaMigracionManual: null,
  faltaMigracionBajas: null, faltaMigracionServicioProfesional: null,
  faltaMigracionVacaciones: null, faltaMigracionAprobaciones: null,
  faltaMigracionReparto: null, repartosRechazados: [], avisoRepartoRechazado: null,
  fueraPorBaja: 0, marcoDespuesDeIrse: 0, sinHorario: 0, salidaAsumida: "17:00",
  horasAusenciaDefault: 8, conSabado: 0, periodoAbierto: null,
  sinFicha: [], avisoSinFicha: null,
  vacacionesNoPagadas: [], avisoVacacionesNoPagadas: null,
  extraSinAprobar: [], avisoExtraSinAprobar: null,
  rangoLibre: false, factorBase: 1, diasCalendario: 15,
};

const linea = (over: Partial<LineaPlanilla> = {}): LineaPlanilla => ({
  codigo: "22", etiqueta: "ALEJANDRA CAMAÑO", nombre: "ALEJANDRA CAMAÑO",
  empresa: "confecciones_boston", empresaEtiqueta: "Confecciones Boston",
  salarioMensual: 800, jornadaSemanal: 40, horas: { ...HORAS_CERO },
  faltaConfigurar: [], fueraDePlanilla: false, pagaSeguros: true,
  decidirAMano: null, quincenalReferencia: null, dinero,
  manuales: { ...MANUALES_CERO, isr: 25.5 },
  ...over,
});

const CUADRO = {
  quincena: Q,
  periodo: periodoDeQuincena(Q),
  empresa: "confecciones_boston",
  empresaEtiqueta: "Confecciones Boston",
  lineas: [linea()],
  totales: { ...TOTALES_CERO, ...dinero, personas: 1 },
  reglas: REGLAS_DEFAULT,
  prestamos: [],
  avisos: AVISOS,
};

/** Una quincena YA CERRADA, como la devuelve el GET. */
const CERRADA = {
  id: "11111111-1111-1111-1111-111111111111",
  empresa: "confecciones_boston",
  desde: "2026-08-01", hasta: "2026-08-15", quincena: "2026-08-1",
  etiqueta: "1 ago 2026 al 15 ago 2026",
  version: 1, estado: "cerrada",
  cerradaPor: "Angela", cerradaEn: "2026-09-03T21:12:00.000Z",
  reabiertaPor: null, reabiertaEn: null, motivoReabrir: null,
  personas: 1, totalBruto: 400, totalDeducciones: 44, totalNeto: 356, factorBase: 1,
};

/** Otra cerrada que PISA el rango sin ser la misma. */
const PISA = { ...CERRADA, id: "22222222-2222-2222-2222-222222222222", desde: "2026-07-28", hasta: "2026-08-10", etiqueta: "28 jul 2026 al 10 ago 2026" };

const BORRADOR = { ok: true, estado: "borrador", cerrada: null, solapadas: [], historial: [], aviso: null };

interface Llamada { url: string; init?: RequestInit }
type Respuesta = { status?: number; body: unknown };

/** Un `fetch` que contesta por URL + método y guarda todo lo que salió. */
function servir(guion: (url: string, init?: RequestInit) => Respuesta) {
  const llamadas: Llamada[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    llamadas.push({ url: String(url), init });
    const r = guion(String(url), init);
    const status = r.status ?? 200;
    return { ok: status >= 200 && status < 300, status, json: async () => r.body } as Response;
  }));
  return llamadas;
}

/** El guion de siempre: cuadro con gente, período en borrador. */
const guionBase = (cierre: unknown = BORRADOR) =>
  (url: string): Respuesta =>
    url.includes("planilla-guardada") ? { body: cierre } : { body: CUADRO };

const montar = () => render(<ToastProvider><PlanillaTab /></ToastProvider>);

/** Lo que hace la persona: elegir el período y tocar Generar. */
function generar() {
  fireEvent.click(screen.getAllByRole("button", { name: /Elige el período/ })[0]);
  fireEvent.click(screen.getAllByRole("button", { name: /^Generar$/ })[0]);
}

const cuadroEnPantalla = () => screen.findAllByText(/ALEJANDRA CAMAÑO/);

beforeEach(() => {
  vi.unstubAllGlobals();
  // 🔑 Fecha FIJA, como todo el módulo: la pantalla abre en la quincena en
  // curso, y con el reloj de verdad el rango que se pide cambiaría cada 15 días.
  vi.setSystemTime(new Date("2026-08-10T15:00:00Z"));
  // 🔴 Cerrar es de admin y contabilidad. El rol sale de `sessionStorage`, igual
  // que en el resto del sistema.
  sessionStorage.setItem("cxc_role", "admin");
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); sessionStorage.clear(); });

// ═════════════════════════════════════════════════════════════════════════════
describe("🔴 el calendario a la vista, y el cuadro solo cuando se pide", () => {
  it("antes de generar, el calendario está ABIERTO EN LÍNEA", async () => {
    servir(guionBase());
    montar();
    expect(screen.getByTestId("rango").getAttribute("data-inline")).toBe("si");
  });

  it("🔴 elegir el período NO pide el cuadro: hay que tocar Generar", async () => {
    const llamadas = servir(guionBase());
    montar();
    fireEvent.click(screen.getAllByRole("button", { name: /Elige el período/ })[0]);
    await new Promise((r) => setTimeout(r, 20));
    // ⚠️ `planilla?` con el signo: la pantalla SÍ pregunta al montar qué hay
    // cerrado (para recomendar el inicio), y esa URL también empieza con
    // `/api/asistencia/planilla`. Lo que no puede pasar todavía es el CUADRO.
    expect(llamadas.filter((c) => c.url.includes("/api/asistencia/planilla?"))).toEqual([]);
    fireEvent.click(screen.getAllByRole("button", { name: /^Generar$/ })[0]);
    await cuadroEnPantalla();
    expect(llamadas.some((c) => c.url.includes("/api/asistencia/planilla?"))).toBe(true);
  });

  it("al generar se pregunta TAMBIÉN si ese período ya está cerrado", async () => {
    const llamadas = servir(guionBase());
    montar();
    generar();
    await waitFor(() => {
      // La del período pedido es la que lleva fechas (la de montar solo lleva
      // la empresa: es la que recomienda por dónde empezar).
      const g = llamadas.find((c) => c.url.includes("planilla-guardada") && c.url.includes("desde="));
      expect(g).toBeTruthy();
      expect(g!.url).toContain("empresa=");
      expect(g!.url).toContain("desde=2026-08-01");
      expect(g!.url).toContain("hasta=2026-08-15");
    });
  });

  it("🔴 generado, el calendario se PLIEGA — la tabla necesita el ancho", async () => {
    servir(guionBase());
    montar();
    generar();
    await cuadroEnPantalla();
    expect(screen.getByTestId("rango").getAttribute("data-inline")).toBe("no");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("🔴 BORRADOR — todavía no se guardó nada", () => {
  it("lo dice, y ofrece cerrar la quincena", async () => {
    servir(guionBase());
    montar();
    generar();
    await cuadroEnPantalla();
    expect(screen.getByText(/Todavía no está cerrada/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cerrar quincena" })).toBeTruthy();
  });

  it("🔴 a la SECRETARIA no se le dibuja el botón de cerrar (lo firma contabilidad)", async () => {
    sessionStorage.setItem("cxc_role", "secretaria");
    servir(guionBase());
    montar();
    generar();
    await cuadroEnPantalla();
    // Ve el cuadro entero y sabe en qué estado está…
    expect(screen.getByText(/Todavía no está cerrada/)).toBeTruthy();
    // …pero no firma el pago.
    expect(screen.queryByRole("button", { name: "Cerrar quincena" })).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("🔴 CERRAR — confirma, y no manda un solo monto", () => {
  it("pregunta antes (es irreversible) y dice QUÉ se va a cerrar", async () => {
    servir(guionBase());
    montar();
    generar();
    await cuadroEnPantalla();
    fireEvent.click(screen.getByRole("button", { name: "Cerrar quincena" }));
    const dialogo = await screen.findByRole("dialog");
    // La confirmación trae los números: sin ellos nadie se da cuenta de que
    // tiene la empresa equivocada elegida.
    expect(dialogo.textContent).toContain("Confecciones Boston · 1 ago 2026 al 15 ago 2026");
    expect(dialogo.textContent).toContain("neto a pagar");
    expect(dialogo.textContent).toContain("356.00");
  });

  it("🔴 el POST manda empresa y fechas — NINGÚN monto", async () => {
    const llamadas = servir((url, init) => {
      if (url.includes("planilla-guardada")) {
        return init?.method === "POST"
          ? { body: { ok: true, id: CERRADA.id, version: 1 } }
          : { body: BORRADOR };
      }
      return { body: CUADRO };
    });
    montar();
    generar();
    await cuadroEnPantalla();
    fireEvent.click(screen.getByRole("button", { name: "Cerrar quincena" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Cerrar quincena" }));

    await waitFor(() => {
      const post = llamadas.find((c) => c.init?.method === "POST");
      expect(post).toBeTruthy();
      const body = JSON.parse(String(post!.init!.body)) as Record<string, unknown>;
      expect(body).toEqual({ empresa: "confecciones_boston", desde: "2026-08-01", hasta: "2026-08-15" });
      // 🔴 Nada de plata viaja desde el navegador: la ruta recalcula y congela.
      for (const campo of ["netoPagar", "totales", "lineas", "totalNeto"]) {
        expect(body).not.toHaveProperty(campo);
      }
    });
  });

  it("cerrada, la pantalla lo dice: quién, cuándo y cuánto quedó congelado", async () => {
    let yaCerro = false;
    servir((url, init) => {
      if (url.includes("planilla-guardada")) {
        if (init?.method === "POST") { yaCerro = true; return { body: { ok: true, id: CERRADA.id, version: 1 } }; }
        return { body: yaCerro ? { ok: true, estado: "cerrada", cerrada: CERRADA, solapadas: [], historial: [CERRADA], aviso: null } : BORRADOR };
      }
      return { body: CUADRO };
    });
    montar();
    generar();
    await cuadroEnPantalla();
    fireEvent.click(screen.getByRole("button", { name: "Cerrar quincena" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Cerrar quincena" }));

    const cartel = (await screen.findByText(/Quincena cerrada/)).closest("div")!.parentElement!;
    expect(cartel.textContent).toContain("Angela");
    expect(cartel.textContent).toContain("3 sep 2026, 4:12 p.m.");
    expect(cartel.textContent).toContain("356.00");
    // Y ya no se ofrece cerrar otra vez.
    expect(screen.queryByRole("button", { name: "Cerrar quincena" })).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("🔴 LOS FRENOS Y EL SOLAPAMIENTO SE VEN DISTINTO", () => {
  const FRENO = {
    tipo: "horas-extra",
    personas: 1,
    quienes: ["BRICEIDA MONTERO"],
    texto:
      "1 persona tiene horas extra sin aprobar (BRICEIDA MONTERO · 332.00 min). "
      // 1-sep-2026: el texto de pantalla pasó a tuteo neutro (sin voseo) — candado en `nada-de-voseo.test.ts`.
      + "Ve a la pestaña «Aprobaciones», aprueba o deja sin aprobar esas horas, y vuelve a cerrar.",
  };

  it("un freno se muestra con nombre y con la salida: ir a Aprobaciones", async () => {
    servir((url, init) => {
      if (url.includes("planilla-guardada")) {
        return init?.method === "POST"
          ? { status: 409, body: { ok: false, error: "No se puede cerrar", frenos: [FRENO] } }
          : { body: BORRADOR };
      }
      return { body: CUADRO };
    });
    montar();
    generar();
    await cuadroEnPantalla();
    fireEvent.click(screen.getByRole("button", { name: "Cerrar quincena" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Cerrar quincena" }));

    expect(await screen.findByText(/No se puede cerrar la quincena todavía/)).toBeTruthy();
    expect(screen.getByText(/BRICEIDA MONTERO/)).toBeTruthy();
    const ir = screen.getByRole("link", { name: /Ir a Aprobaciones/ });
    expect(ir.getAttribute("href")).toBe("/asistencia?tab=aprobaciones");
  });

  it("🔴 un solapamiento NOMBRA la quincena que estorba y deja ir a verla", async () => {
    const llamadas = servir((url) =>
      url.includes("planilla-guardada")
        ? { body: { ok: true, estado: "cerrada", cerrada: null, solapadas: [PISA], historial: [PISA], aviso: null } }
        : { body: CUADRO });
    montar();
    generar();
    await cuadroEnPantalla();

    expect(await screen.findByText(/se pisan con una quincena ya cerrada/)).toBeTruthy();
    // Dos veces a propósito: en el texto que explica y en el botón que lleva.
    expect(screen.getAllByText(/28 jul 2026 al 10 ago 2026/).length).toBeGreaterThan(0);
    // No se puede cerrar: sería pagar los mismos días dos veces.
    expect((screen.getByRole("button", { name: "Cerrar quincena" }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: /Ver la del 28 jul 2026 al 10 ago 2026/ }));
    await waitFor(() => {
      expect(llamadas.some((c) => c.url.includes("desde=2026-07-28") && c.url.includes("hasta=2026-08-10"))).toBe(true);
    });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("⚠️ falta correr la migración: es ÁMBAR, y la pantalla sigue entera", () => {
  it("dice el nombre del archivo y no dibuja el botón de cerrar", async () => {
    const aviso =
      "Todavía no se puede cerrar la quincena: falta preparar la base de datos. "
      + `Pídele a Daniel que corra el archivo ${MIGRACION_PLANILLA_GUARDADA} en Supabase.`;
    servir(guionBase({ ok: true, estado: "borrador", cerrada: null, solapadas: [], historial: [], aviso }));
    montar();
    generar();
    // 🔴 El cuadro se calcula, se ve y se puede imprimir igual.
    await cuadroEnPantalla();
    expect(screen.getByText(new RegExp(MIGRACION_PLANILLA_GUARDADA))).toBeTruthy();
    expect((screen.getByRole("button", { name: "Cerrar quincena" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getAllByRole("button", { name: "Excel" })[0] as HTMLButtonElement).disabled).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("🔴 REABRIR — con motivo obligatorio", () => {
  const cerrada = () => guionBase({ ok: true, estado: "cerrada", cerrada: CERRADA, solapadas: [], historial: [CERRADA], aviso: null });

  it("el botón está, y la ventana no deja seguir sin escribir el porqué", async () => {
    servir(cerrada());
    montar();
    generar();
    await cuadroEnPantalla();
    fireEvent.click(await screen.findByRole("button", { name: "Reabrir" }));
    const dialogo = await screen.findByRole("dialog");

    const confirmar = within(dialogo).getByRole("button", { name: "Reabrir la quincena" }) as HTMLButtonElement;
    expect(confirmar.disabled).toBe(true);
    // Espacios no son un motivo: la misma regla que la ruta y el CHECK.
    fireEvent.change(within(dialogo).getByRole("textbox"), { target: { value: "   " } });
    expect((within(dialogo).getByRole("button", { name: "Reabrir la quincena" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("con motivo, manda el PATCH con el id y el motivo", async () => {
    const llamadas = servir((url, init) => {
      if (url.includes("planilla-guardada")) {
        return init?.method === "PATCH"
          ? { body: { ok: true, id: CERRADA.id } }
          : { body: { ok: true, estado: "cerrada", cerrada: CERRADA, solapadas: [], historial: [CERRADA], aviso: null } };
      }
      return { body: CUADRO };
    });
    montar();
    generar();
    await cuadroEnPantalla();
    fireEvent.click(await screen.findByRole("button", { name: "Reabrir" }));
    const dialogo = await screen.findByRole("dialog");
    fireEvent.change(within(dialogo).getByRole("textbox"), { target: { value: "faltó la incapacidad de Briceida" } });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Reabrir la quincena" }));

    await waitFor(() => {
      const patch = llamadas.find((c) => c.init?.method === "PATCH");
      expect(patch).toBeTruthy();
      expect(JSON.parse(String(patch!.init!.body))).toEqual({
        id: CERRADA.id, motivo: "faltó la incapacidad de Briceida",
      });
    });
  });

  it("🔴 con la quincena cerrada, los montos a mano quedan APAGADOS", async () => {
    servir(cerrada());
    montar();
    generar();
    await cuadroEnPantalla();
    const apagados = await screen.findAllByPlaceholderText("cerrada");
    expect(apagados.length).toBeGreaterThan(0);
    expect((apagados as HTMLInputElement[]).every((i) => i.disabled)).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("🔴 DESACTUALIZADA — nada se recalcula por debajo", () => {
  it("escribir un monto a mano NO vuelve a pedir el cuadro: lo marca viejo", async () => {
    const llamadas = servir(guionBase());
    montar();
    generar();
    await cuadroEnPantalla();
    const cuadrosPedidos = () => llamadas.filter((c) => c.url.includes("/api/asistencia/planilla?")).length;
    const antes = cuadrosPedidos();

    const isr = screen.getAllByDisplayValue("25.5")[0] as HTMLInputElement;
    fireEvent.change(isr, { target: { value: "30" } });
    fireEvent.blur(isr);

    // Se guardó…
    await waitFor(() => expect(llamadas.some((c) => c.init?.method === "POST")).toBe(true));
    await new Promise((r) => setTimeout(r, 30));
    // …y NO se volvió a pedir el cuadro.
    expect(cuadrosPedidos()).toBe(antes);
    // Se dice, y se ofrece rehacerlo a mano.
    expect(screen.getByText(/Los números que ves son de antes/)).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /^Regenerar$/ }).length).toBeGreaterThan(0);
    // Y no se puede cerrar un cuadro que ya no es el que se está mirando.
    expect(screen.queryByRole("button", { name: "Cerrar quincena" })).toBeNull();
  });

  it("Regenerar lo vuelve a pedir y el cartel se va", async () => {
    const llamadas = servir(guionBase());
    montar();
    generar();
    await cuadroEnPantalla();
    const isr = screen.getAllByDisplayValue("25.5")[0] as HTMLInputElement;
    fireEvent.change(isr, { target: { value: "30" } });
    fireEvent.blur(isr);
    await screen.findByText(/Los números que ves son de antes/);

    const antes = llamadas.filter((c) => c.url.includes("/api/asistencia/planilla?")).length;
    fireEvent.click(screen.getAllByRole("button", { name: /^Regenerar$/ })[0]);
    await waitFor(() => {
      expect(llamadas.filter((c) => c.url.includes("/api/asistencia/planilla?")).length).toBe(antes + 1);
    });
    await waitFor(() => expect(screen.queryByText(/Los números que ves son de antes/)).toBeNull());
  });

  it("🔴 cambiar la empresa también deja el cuadro viejo — no se recarga solo", async () => {
    const llamadas = servir(guionBase());
    montar();
    generar();
    await cuadroEnPantalla();
    const antes = llamadas.filter((c) => c.url.includes("/api/asistencia/planilla?")).length;

    const select = screen.getByRole("combobox") as HTMLSelectElement;
    const otra = [...select.options].map((o) => o.value).find((v) => v !== select.value)!;
    fireEvent.change(select, { target: { value: otra } });

    await screen.findByText(/Cambiaste el período o la empresa/);
    expect(llamadas.filter((c) => c.url.includes("/api/asistencia/planilla?")).length).toBe(antes);
    expect(screen.queryByRole("button", { name: "Cerrar quincena" })).toBeNull();
  });
});


// ═════════════════════════════════════════════════════════════════════════════
// 🔴 EL INICIO RECOMENDADO: EL DÍA DESPUÉS DE LA ÚLTIMA CERRADA
//
// Daniel, textual: *«después de cerrar la primera quincena, el recomendado de
// inicio debe de ser el día siguiente que cerró la quincena pasada»*. Es lo que
// evita las dos formas de equivocarse: dejar días sin pagar, y pisar una
// quincena ya pagada (que el servidor rechaza al cerrar).
describe("🔴 el inicio sugerido después de cerrar", () => {
  /** El historial de la empresa, como lo devuelve el GET sin fechas. */
  const conHistorial = (historial: unknown[]) => (url: string): Respuesta =>
    url.includes("planilla-guardada")
      ? { body: { ...BORRADOR, historial } }
      : { body: CUADRO };

  it("propone el día siguiente al `hasta` de la última cerrada, y lo dice", async () => {
    servir(conHistorial([CERRADA]));  // cerrada del 1 al 15 de agosto
    montar();
    const aviso = await screen.findByText(/última quincena cerrada/);
    expect(aviso.textContent).toContain("15 ago 2026");
    expect(aviso.textContent).toContain("16 ago 2026");
    // El calendario abre ahí y lo marca.
    await waitFor(() => {
      expect(screen.getByTestId("rango").getAttribute("data-desde")).toBe("2026-08-16");
      expect(screen.getByTestId("rango").getAttribute("data-sugerido")).toBe("2026-08-16");
    });
  });

  it("🔴 es una SUGERENCIA: no queda elegido y no se pide ningún cuadro", async () => {
    const llamadas = servir(conHistorial([CERRADA]));
    montar();
    await screen.findByText(/última quincena cerrada/);
    // Nadie eligió todavía: sigue el cartel del vacío y Generar apagado.
    expect(screen.getByText(/Elige el período que vas a pagar/)).toBeTruthy();
    expect((screen.getAllByRole("button", { name: /^Generar$/ })[0] as HTMLButtonElement).disabled).toBe(true);
    expect(llamadas.filter((c) => c.url.includes("/api/asistencia/planilla?"))).toEqual([]);
  });

  it("una REABIERTA no cuenta: no pagó nada, así que no propone nada", async () => {
    servir(conHistorial([{ ...CERRADA, estado: "reabierta" }]));
    montar();
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.queryByText(/última quincena cerrada/)).toBeNull();
    expect(screen.getByTestId("rango").getAttribute("data-sugerido")).toBe("");
  });

  it("sin ninguna cerrada, no se sugiere nada (la pantalla queda como hoy)", async () => {
    servir(conHistorial([]));
    montar();
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.queryByText(/última quincena cerrada/)).toBeNull();
  });

  it("toma la MÁS RECIENTE cuando hay varias cerradas", async () => {
    servir(conHistorial([
      CERRADA,
      { ...CERRADA, id: "otra", desde: "2026-08-16", hasta: "2026-08-31", etiqueta: "16 ago 2026 al 31 ago 2026" },
    ]));
    montar();
    const aviso = await screen.findByText(/última quincena cerrada/);
    expect(aviso.textContent).toContain("31 ago 2026");
    expect(aviso.textContent).toContain("1 sep 2026");
  });

  it("elegido el período, la sugerencia deja de marcarse (ya decidió la persona)", async () => {
    servir(conHistorial([CERRADA]));
    montar();
    await screen.findByText(/última quincena cerrada/);
    fireEvent.click(screen.getAllByRole("button", { name: /Elige el período/ })[0]);
    await waitFor(() => expect(screen.getByTestId("rango").getAttribute("data-sugerido")).toBe(""));
  });

  it("generado el cuadro, el calendario se pliega y el aro ya no está", async () => {
    servir(conHistorial([CERRADA]));
    montar();
    await waitFor(() => expect(screen.getByTestId("rango").getAttribute("data-sugerido")).toBe("2026-08-16"));
    generar();
    await cuadroEnPantalla();
    // La píldora es el OTRO sitio donde vive el control: también sin aro.
    expect(screen.getByTestId("rango").getAttribute("data-inline")).toBe("no");
    expect(screen.getByTestId("rango").getAttribute("data-sugerido")).toBe("");
  });

  it("🔴 y NO le pisa el período a quien eligió otro", async () => {
    servir(conHistorial([CERRADA]));
    montar();
    await waitFor(() => expect(screen.getByTestId("rango").getAttribute("data-desde")).toBe("2026-08-16"));
    // La persona elige julio a mano, contra la recomendación.
    fireEvent.click(screen.getByTestId("elegir-julio"));
    await new Promise((r) => setTimeout(r, 40));
    // La sugerencia no vuelve a moverle las fechas.
    expect(screen.getByTestId("rango").getAttribute("data-desde")).toBe("2026-07-01");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// ⚠️ NADA DE VOSEO — ni en la pantalla ni en los comentarios.
//
// Daniel, textual: *«no soy argentino, ni a mi ni en el sistema pongas palabras
// argentinos, somos latinoamericanos normal»*. Vio «Elegí el período» y dijo que
// se dice «Elige el período». Es español latinoamericano neutro, con tuteo.
describe("⚠️ el módulo habla en tuteo latinoamericano", () => {
  const RIOPLATENSE = [
    "elegí", "escribí", "tocá", "revisá", "guardá", "cerrá", "fijate", "andá",
    "aprobá", "volvé", "reabrí", "mirá", "poné", "tenés", "podés", "querés", "sabés",
  ];
  const ARCHIVOS = [
    "src/app/asistencia/PlanillaTab.tsx",
    "src/components/ui/RangoFechas.tsx",
    "src/components/ui/CalendarioRango.tsx",
  ];

  it.each(ARCHIVOS)("%s no tiene una sola forma rioplatense", async (rel) => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(rel, "utf-8").toLowerCase();
    for (const palabra of RIOPLATENSE) {
      expect(src.includes(palabra), `${rel} dice «${palabra}»`).toBe(false);
    }
  });
});

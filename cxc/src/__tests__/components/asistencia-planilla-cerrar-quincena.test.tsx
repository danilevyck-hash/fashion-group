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
// 🩸 LOS NOMBRES SE MUESTRAN CAPITALIZADOS DESDE EL 10-SEP-2026, y por eso los
// buscadores de este archivo van sin distinguir mayúsculas. Daniel: *«no me
// gustan los nombres en planilla de los usuarios todo en mayúscula, arréglalo a
// capitalización»*. Lo GUARDADO sigue en mayúsculas y ningún número cambia —
// solo cómo se dibuja— así que lo que estos candados protegen (que la persona
// aparezca en pantalla, y en qué grupo) no cambió: cambió la grafía.
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor, within, act } from "@testing-library/react";

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
// 🔴 24-sep-2026: el rótulo de la barra sale del módulo puro del rediseño.
import { rotuloDelPeriodo } from "@/lib/asistencia/pantalla-2026-09";

// ── 🔴 EL DOBLE DEL ROUTER (24-sep-2026) ────────────────────────────────────
// Desde que la quincena y el corte viajan en la dirección (`plQuincena`,
// `plCorte`, ver `pestanas-vivas.ts`), `PlanillaTab` usa `useUrlState`. Acá se
// renderiza el componente suelto, sin el router de la app: este doble es el
// mismo que ya usan los otros tests de Asistencia.
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


/* ─────────────────────────────────────────────────────────────────────────────
 * 🩸 ACÁ VIVÍA EL DOBLE DE `RangoFechas`, y se fue el 15-sep-2026.
 *
 * Daniel, textual: *«si la quincena es fija, que no haya opción de rango, solo
 * las opciones»*. La Planilla ya no monta el calendario: se elige con CUATRO
 * botones (las dos quincenas del mes anterior y las dos del mes en curso), así
 * que no hay nada que doblar. Todo lo que este archivo probaba —generar,
 * cerrar, reabrir, los frenos, el solapamiento— se sigue probando igual; lo
 * único que cambió es cómo se elige el período.
 * ────────────────────────────────────────────────────────────────────────── */

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

/* ── 🩸 CAMBIÓ DE DIRECCIÓN EL 24-sep-2026 ──────────────────────────────────
 *
 * La quincena se elegía con CUATRO botones («1 – 15 ago», «16 – 30 jul»…). Con
 * el rediseño (`ASISTENCIA_PANTALLA_2026_09`) la pone el SELECTOR ÚNICO del
 * módulo —«‹ 16 – 30 sep 2026 ›»—, que vive en `?desde=&hasta=` y comparte clave
 * y memoria con Asistencia, Aprobaciones y Préstamos › Movimientos.
 *
 * 🔴 LO QUE NO CAMBIÓ: solo se pagan QUINCENAS (el selector de la Planilla no
 * lleva calendario), el cuadro NO se dibuja solo —hay que tocar «Generar»— y lo
 * que se le pide al servidor es el MISMO `desde`/`hasta`/`corte` de siempre.
 */

/** Abre la Planilla ya parada en una quincena, que es como llega de verdad. */
function montarEn(desde: string, hasta: string) {
  URL_PLANILLA = `desde=${desde}&hasta=${hasta}`;
  return montar();
}
/** Lo que dice la barra ahora mismo. */
const enLaBarra = (desde: string, hasta: string) =>
  screen.getByText(rotuloDelPeriodo(desde, hasta));
/** La flecha «‹»: una quincena para atrás. */
const quincenaAtras = () =>
  fireEvent.click(screen.getByRole("button", { name: "Quincena anterior" }));

/** Lo que hace la persona: tocar Generar.
 *  ⚠️ El reloj está fijo en el 10-ago-2026, así que la pantalla abre en
 *  «1 – 15 ago» — el mismo rango que antes se elegía tocando su botón. */
function generar() {
  fireEvent.click(screen.getAllByRole("button", { name: /^Generar$/ })[0]);
}

const cuadroEnPantalla = () => screen.findAllByText(/ALEJANDRA CAMAÑO/i);

/** 🔴 SE ESPERA A LA RESPUESTA, NO SE CUENTAN MILISEGUNDOS (19-sep-2026).
 *  Para las afirmaciones que dicen «esto NO aparece» hace falta saber que la
 *  respuesta YA se aplicó — si no, el verde sería por no haber llegado todavía.
 *  Se espera a que el pedido esté hecho y se vacía la cola de microtareas, que
 *  es por donde contesta el doble de `fetch`: sin contar ms, y sin depender de
 *  lo rápida que sea la máquina. */
async function respuestaAplicada(llamadas: Llamada[], parte: string) {
  await waitFor(() => expect(llamadas.some((c) => c.url.includes(parte))).toBe(true));
  await act(async () => { await Promise.resolve(); });
}

beforeEach(() => {
  vi.unstubAllGlobals();
  // 🔑 Fecha FIJA, como todo el módulo: la pantalla abre en la quincena en
  // curso, y con el reloj de verdad el rango que se pide cambiaría cada 15 días.
  vi.setSystemTime(new Date("2026-08-10T15:00:00Z"));
  // 🔴 Cerrar es de admin y contabilidad. El rol sale de `sessionStorage`, igual
  // que en el resto del sistema.
  sessionStorage.setItem("cxc_role", "admin");
  // 🔴 24-sep-2026: la dirección del período es COMPARTIDA, así que un caso que
  // la deja escrita le cambiaría la quincena al siguiente.
  URL_PLANILLA = "";
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); sessionStorage.clear(); });

// ═════════════════════════════════════════════════════════════════════════════
describe("🔴 el calendario a la vista, y el cuadro solo cuando se pide", () => {
  /* 🩸 CAMBIÓ DE DIRECCIÓN EL 15-sep-2026. Este caso exigía que existiera «Otro
   * rango ⌄» con el calendario detrás. Daniel: *«si la quincena es fija, que no
   * haya opción de rango, solo las opciones»* — de ahí salían los rangos que
   * prorratean el sueldo, apagan los montos a mano y dejan cabeceras que no son
   * quincenas. Ahora se prueba lo contrario: que no hay calendario, y que las
   * opciones son CUATRO. */
  it("🩸 la quincena se elige con la BARRA, y NO hay calendario", async () => {
    servir(guionBase());
    montar();
    // Abre en la quincena en curso (el reloj está en el 10-ago-2026) y lo dice
    // entero, sin tocar nada. 🔄 15-sep-2026: el rótulo nunca dice «31».
    expect(enLaBarra("2026-08-01", "2026-08-15")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Quincena anterior" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Quincena siguiente" })).toBeTruthy();
    // 🩸 Los cuatro botones se retiraron.
    for (const r of ["1 – 15 jul", "16 – 30 jul", "1 – 15 ago", "16 – 30 ago"]) {
      expect(screen.queryByRole("button", { name: r })).toBeNull();
    }
    // 🔴 Y ni rastro del rango libre: acá solo se pagan quincenas.
    expect(screen.queryByText("Otro rango")).toBeNull();
    expect(screen.queryByTestId("rango")).toBeNull();
    expect(screen.queryByRole("button", { name: "Elegir un día o un rango" })).toBeNull();
  });

  it("🔴 «›» no lleva al futuro: la quincena que todavía no empezó no se ofrece", () => {
    servir(guionBase());
    montar();
    // El 10 de agosto, «16 – 30 ago» todavía no empezó.
    expect((screen.getByRole("button", { name: "Quincena siguiente" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Quincena anterior" }) as HTMLButtonElement).disabled).toBe(false);
  });

  /* CONTROL: la quincena del mes ANTERIOR no es decorativa — se puede elegir y
   * pide su propio cuadro. Sin esto, en octubre nadie podría cerrar septiembre. */
  it("🔴 la quincena del mes anterior se puede pedir de verdad", async () => {
    const llamadas = servir(guionBase());
    montarEn("2026-07-16", "2026-07-30");
    fireEvent.click(screen.getAllByRole("button", { name: /^Generar$/ })[0]);
    await waitFor(() => {
      const c = llamadas.find((x) => x.url.includes("/api/asistencia/planilla?"));
      expect(c).toBeTruthy();
      expect(c!.url).toContain("desde=2026-07-16");
      expect(c!.url).toContain("hasta=2026-07-30");
    });
  });

  it("🔴 en un mes de 31 días la pantalla DICE que el 31 no paga sueldo pero sí resta (15-sep-2026)", () => {
    // Daniel: *«el día 31 no se paga, pero si no viene o llega tarde se
    // descuenta»*. Acá estamos en agosto (31 días), así que el aviso sale. El
    // CONTROL —que en un mes de 30 NO sale— vive en
    // `planilla-elegir-quincena.test.tsx`, que monta la misma pantalla en
    // septiembre. Ver `dia-31.ts`.
    servir(guionBase());
    // En la primera quincena de agosto no hay ningún 31 de por medio: no se dice.
    montar();
    expect(enLaBarra("2026-08-01", "2026-08-15")).toBeTruthy();
    expect(screen.queryByText(/El 31 no paga sueldo/)).toBeNull();
    cleanup();
    // En la SEGUNDA, sí.
    servir(guionBase());
    montarEn("2026-08-16", "2026-08-30");
    expect(
      screen.getByText("El 31 no paga sueldo, pero sus ausencias, tardanzas, salidas tempranas y horas extra sí entran."),
    ).toBeTruthy();
  });

  it("🔴 abrir la pantalla NO pide el cuadro: hay que tocar Generar", async () => {
    const llamadas = servir(guionBase());
    montar();
    // 🩸 CAMBIÓ DE DIRECCIÓN EL 24-sep-2026: antes había que tocar la quincena
    // y este caso probaba que ese toque no pedía nada. Hoy la quincena viene
    // PUESTA, así que la regla se prueba en su forma más fuerte: **montar la
    // pantalla tampoco pide el cuadro**. La plata no se dibuja sola.
    // Se vacía la cola de microtareas —por ahí saldría el pedido del cuadro—
    // en vez de contar 20 ms.
    await act(async () => { await Promise.resolve(); });
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

  /* 🩸 15-sep-2026: decía «generado, el calendario se PLIEGA — la tabla necesita
   * el ancho». Ya no hay calendario que plegar; lo que se protege —que la tabla
   * arranque con el ancho entero— se prueba mejor así. */
  it("🔴 generado, arriba quedan solo los botones: nada que ocupe el ancho", async () => {
    servir(guionBase());
    montar();
    generar();
    await cuadroEnPantalla();
    expect(screen.queryByTestId("rango")).toBeNull();
    expect(screen.queryByText("Otro rango")).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("🔴 BORRADOR — todavía no se guardó nada", () => {
  // ⚠️ 11-sep-2026: la caja «Todavía no está cerrada / Esto es un borrador…» se
  // fue con el mockup «Antes de cerrar»: lo dice el ENCABEZADO de la lista
  // («Antes de cerrar · borrador, …»). El botón «Cerrar quincena» pasó a la fila
  // de arriba, a la derecha. Cambió dónde se lee, no la regla.
  it("lo dice, y ofrece cerrar la quincena", async () => {
    servir(guionBase());
    montar();
    generar();
    await cuadroEnPantalla();
    expect(screen.getByText(/Antes de cerrar · borrador/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cerrar quincena" })).toBeTruthy();
  });

  it("🔴 a la SECRETARIA no se le dibuja el botón de cerrar (lo firma contabilidad)", async () => {
    sessionStorage.setItem("cxc_role", "secretaria");
    servir(guionBase());
    montar();
    generar();
    await cuadroEnPantalla();
    // Ve el cuadro entero y sabe en qué estado está…
    expect(screen.getByText(/Antes de cerrar · borrador/)).toBeTruthy();
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
      // 🩸 EL CUERPO GANÓ `corte` EL 10-SEP-2026 (planilla unida). No es plata:
      // es la fecha hasta la que se leyó el reloj (día 13/28), y va en `null`
      // sin el interruptor —que es este caso—. La regla que este candado
      // protege NO cambió: NINGÚN monto viaja; la ruta recalcula y congela.
      expect(body).toEqual({ empresa: "confecciones_boston", desde: "2026-08-01", hasta: "2026-08-15", corte: null });
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
    expect(screen.getByText(/BRICEIDA MONTERO/i)).toBeTruthy();
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
    // ⚠️ 11-sep-2026: Excel, PDF y Comprobantes viven en «Descargar ⌄».
    expect((screen.getByRole("button", { name: /^Descargar/ }) as HTMLButtonElement).disabled).toBe(false);
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
    // Se espera al cartel de «viejo», que es lo que la pantalla hace en lugar
    // de recargar. Sin esperarlo, lo de abajo mediría una pantalla a medias.
    await screen.findByText(/Los números que ves son de antes/);
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
    // 🔴 10-sep-2026 (noche): la empresa ya no se elige en la Planilla sino en
    // el selector de todo el módulo, que se la pasa como prop. La regla no
    // cambió: cambiarla deja el cuadro viejo y no recarga sola.
    const vista = render(<ToastProvider><PlanillaTab empresa="confecciones_boston" /></ToastProvider>);
    generar();
    await cuadroEnPantalla();
    const antes = llamadas.filter((c) => c.url.includes("/api/asistencia/planilla?")).length;

    vista.rerender(<ToastProvider><PlanillaTab empresa="vistana" /></ToastProvider>);

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
    /* 🩸 15-sep-2026: acá se comprobaba que el CALENDARIO abriera en el 16 y lo
     * marcara con un aro. Ya no hay calendario (Daniel: *«si la quincena es
     * fija, que no haya opción de rango»*), así que la recomendación es una
     * frase y nada más — y la frase manda a los botones de arriba. */
    expect(aviso.textContent).toContain("la quincena que sigue arriba");
    expect(screen.queryByTestId("rango")).toBeNull();
  });

  it("🔴 es una SUGERENCIA: no mueve el período y no se pide ningún cuadro", async () => {
    const llamadas = servir(conHistorial([CERRADA]));
    montar();
    await screen.findByText(/última quincena cerrada/);
    // 🩸 CAMBIÓ DE DIRECCIÓN EL 24-sep-2026: decía «Elige el período que vas a
    // pagar» porque la quincena arrancaba sin elegir. Hoy viene puesta por el
    // selector del módulo, y el vacío dice lo único que falta de verdad.
    // 🔴 LA REGLA NO CAMBIÓ, y son las dos que importan: la sugerencia **no le
    // mueve el período a nadie** y **no pide ningún cuadro**.
    expect(enLaBarra("2026-08-01", "2026-08-15")).toBeTruthy();
    expect(screen.getByText("Esta quincena todavía no se generó")).toBeTruthy();
    expect(llamadas.filter((c) => c.url.includes("/api/asistencia/planilla?"))).toEqual([]);
  });

  it("una REABIERTA no cuenta: no pagó nada, así que no propone nada", async () => {
    const llamadas = servir(conHistorial([{ ...CERRADA, estado: "reabierta" }]));
    montar();
    await respuestaAplicada(llamadas, "planilla-guardada");
    expect(screen.queryByText(/última quincena cerrada/)).toBeNull();
  });

  it("sin ninguna cerrada, no se sugiere nada (la pantalla queda como hoy)", async () => {
    const llamadas = servir(conHistorial([]));
    montar();
    await respuestaAplicada(llamadas, "planilla-guardada");
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

  it("🩸 mover la quincena no borra la sugerencia, pero tampoco se la deja pisar", async () => {
    // 🩸 CAMBIÓ DE DIRECCIÓN EL 24-sep-2026: la sugerencia se iba en cuanto la
    // persona tocaba un botón de quincena, porque «tocar un botón» era la señal
    // de que ya había decidido. Con el selector único la quincena viene puesta
    // desde que se entra, así que esa señal dejó de existir: la sugerencia se va
    // cuando se GENERA el cuadro (el caso de abajo lo sostiene).
    //
    // 🔴 LO QUE ESTE CASO PROTEGE, y no cambió: la sugerencia **no le pisa el
    // período a quien ya se movió**.
    servir(conHistorial([CERRADA]));
    montar();
    await screen.findByText(/última quincena cerrada/);
    quincenaAtras();
    await waitFor(() => expect(enLaBarra("2026-07-16", "2026-07-30")).toBeTruthy());
    expect(enLaBarra("2026-07-16", "2026-07-30")).toBeTruthy();
  });

  it("generado el cuadro, la recomendación ya no está", async () => {
    servir(conHistorial([CERRADA]));
    montar();
    await screen.findByText(/última quincena cerrada/);
    generar();
    await cuadroEnPantalla();
    expect(screen.queryByText(/última quincena cerrada/)).toBeNull();
  });

  it("🔴 y NO le pisa la quincena a quien eligió otra", async () => {
    servir(conHistorial([CERRADA]));
    montar();
    await screen.findByText(/última quincena cerrada/);
    // La persona se va a julio a mano, contra la recomendación.
    quincenaAtras();
    quincenaAtras();
    // La recomendación ya llegó (se esperó su cartel arriba): se espera a que
    // la pantalla reaccione al toque, no a que pasen 40 ms.
    await waitFor(() => expect(enLaBarra("2026-07-01", "2026-07-15")).toBeTruthy());
    // La recomendación no vuelve a moverle nada: la barra sigue en julio.
    expect(enLaBarra("2026-07-01", "2026-07-15")).toBeTruthy();
    expect(screen.queryByText(rotuloDelPeriodo("2026-08-01", "2026-08-15"))).toBeNull();
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

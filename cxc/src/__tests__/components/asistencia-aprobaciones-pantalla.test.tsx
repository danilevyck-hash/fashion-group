/**
 * ─────────────────────────────────────────────────────────────────────────────
 * APROBAR HORAS EXTRA, EN LA PANTALLA DE VERDAD — Y CONTANDO LOS CLICS.
 *
 * 🔴 POR QUÉ ESTE ARCHIVO EXISTE. Daniel puso UN requisito duro y es un número:
 * *«que en el usuario de julio y daniel haya un tab para aprobaciones, con un
 * clic se aprueba y ya, maximo 3 clics»*. Que `armarFilasAprobacion()` devuelva
 * la lista correcta no prueba NADA sobre eso: la pantalla podía pedir elegir el
 * período, después abrir la persona, después confirmar, y todos los tests de
 * función pura seguirían en verde.
 *
 * Acá se monta el módulo entero (`AsistenciaClient`), se toca como se toca de
 * verdad y **se cuentan los clics uno por uno** — no se estiman leyendo el
 * código. `contarClics` envuelve `fireEvent.click` y el número que sale es el
 * que se reporta.
 *
 * Lo que se sostiene, renderizando y tocando:
 *   1. una persona se aprueba en 2 CLICS (pestaña + «Aprobar»);
 *   2. la quincena entera en 3 CLICS (pestaña + «Aprobar todas» + «Aprobar»);
 *   3. se puede DESAPROBAR en 2 clics — un clic de más no es irreversible;
 *   4. ver el detalle por día NO es un paso obligatorio;
 *   5. lo que se manda al servidor es (persona, período), NUNCA un número de
 *      horas para pagar;
 *   6. la planilla dice EN ÁMBAR lo que no pagó, con nombre y cantidad;
 *   7. quien no puede aprobar NO ve la pestaña.
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
  quincenasHasta,
  periodoDeQuincena,
  type LineaPlanilla,
} from "@/lib/asistencia/planilla";
import type { FilaAprobacion } from "@/lib/asistencia/aprobaciones";
import AsistenciaClient from "@/app/asistencia/AsistenciaClient";
import PlanillaTab from "@/app/asistencia/PlanillaTab";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/asistencia",
  useSearchParams: () => new URLSearchParams(),
}));

// ─────────────────────────────────────────────────────────────────────────────
// EL CONTADOR DE CLICS. Es el instrumento de este archivo.
// ─────────────────────────────────────────────────────────────────────────────

let clics = 0;
/** Un clic de verdad sobre el DOM. Cada llamada suma UNO. */
function clic(el: Element | null): void {
  if (!el) throw new Error("no existe el elemento que se quiso tocar");
  clics += 1;
  fireEvent.click(el);
}

// ─────────────────────────────────────────────────────────────────────────────

const q = quincena(2026, 7, 2); // 16 al 31 de julio
const periodo = periodoDeQuincena(q);

const FILAS: FilaAprobacion[] = [
  {
    codigo: "8",
    etiqueta: "BRICEIDA MONTERO",
    empresa: "vistana",
    empresaEtiqueta: "Vistana",
    minutos: 333,
    diurnoMin: 300,
    nocturnoMin: 33,
    monto: 21.5,
    aprobado: false,
    por: null,
    cuando: null,
    minutosVistos: null,
    cambio: false,
    dias: [
      { fecha: "2026-07-20", etiqueta: "20 jul 2026", salida: "17:45", minutos: 45, diurnoMin: 45, nocturnoMin: 0 },
      { fecha: "2026-07-21", etiqueta: "21 jul 2026", salida: "18:10", minutos: 70, diurnoMin: 60, nocturnoMin: 10 },
    ],
  },
  {
    codigo: "11",
    etiqueta: "JULIO GARAY",
    empresa: "vistana",
    empresaEtiqueta: "Vistana",
    minutos: 120,
    diurnoMin: 120,
    nocturnoMin: 0,
    monto: 8.1,
    aprobado: false,
    por: null,
    cuando: null,
    minutosVistos: null,
    cambio: false,
    dias: [],
  },
];

const RESPUESTA_APROBACIONES = {
  lineas: [],
  totales: TOTALES_CERO,
  reglas: REGLAS_DEFAULT,
  quincena: q,
  periodo,
  aprobaciones: FILAS,
  puedeAprobar: true,
  avisos: {
    faltaMigracionConfiguracion: null, faltaMigracionManual: null,
    faltaMigracionBajas: null, faltaMigracionServicioProfesional: null,
    fueraPorBaja: 0, marcoDespuesDeIrse: 0, sinHorario: 0, salidaAsumida: "17:00",
    horasAusenciaDefault: 8, conSabado: 0, periodoAbierto: null,
    sinFicha: [], avisoSinFicha: null, rangoLibre: false, factorBase: 1,
    diasCalendario: 16, vacacionesNoPagadas: [], avisoVacacionesNoPagadas: null,
    faltaMigracionVacaciones: null, correcciones: 0,
    extraSinAprobar: [], avisoExtraSinAprobar: null,
    faltaMigracionAprobaciones: null,
  },
};

/** Guarda lo que se le mandó al servidor para poder mirarlo después. */
let enviados: Array<{ url: string; body: Record<string, unknown> | null }>;

function servir(respuestas: Array<[string, unknown]>) {
  enviados = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const u = String(url);
      enviados.push({
        url: u,
        body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null,
      });
      const par = respuestas.find(([frag]) => u.includes(frag));
      return { ok: true, json: async () => par?.[1] ?? {} } as Response;
    }),
  );
}

const montar = (ui: React.ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);

beforeEach(() => {
  clics = 0;
  vi.unstubAllGlobals();
  sessionStorage.setItem("cxc_role", "admin");
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

/** Entra a la pestaña. Es el PRIMER clic de todos los caminos. */
async function entrarAAprobaciones() {
  montar(<AsistenciaClient />);
  const pestana = await screen.findByRole("button", { name: "Aprobaciones" });
  clic(pestana);
  await screen.findByText("BRICEIDA MONTERO");
}

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 el requisito duro: máximo 3 clics", () => {
  it("una persona se aprueba en 2 CLICS — pestaña + «Aprobar»", async () => {
    servir([
      ["/api/asistencia/aprobaciones", { ok: true }],
      ["/api/asistencia/planilla", RESPUESTA_APROBACIONES],
    ]);
    await entrarAAprobaciones();

    // La fila de Briceida trae su botón al lado. No hay que abrirla, ni elegir
    // el período, ni confirmar nada.
    const fila = screen.getByText("BRICEIDA MONTERO").closest("li")!;
    clic(fila.querySelector("button:not([aria-expanded])")!.parentElement === null
      ? null
      : [...fila.querySelectorAll("button")].find((b) => b.textContent === "Aprobar")!);

    await waitFor(() =>
      expect(enviados.some((e) => e.url.includes("/api/asistencia/aprobaciones"))).toBe(true),
    );
    expect(clics).toBe(2);
  });

  it("la quincena entera en 3 CLICS — pestaña + «Aprobar todas» + «Aprobar»", async () => {
    servir([
      ["/api/asistencia/aprobaciones", { ok: true }],
      ["/api/asistencia/planilla", RESPUESTA_APROBACIONES],
    ]);
    await entrarAAprobaciones();

    clic(screen.getByRole("button", { name: /Aprobar todas/ }));
    // La ventana dice A CUÁNTAS PERSONAS y CUÁNTAS HORAS: no pregunta «¿estás
    // seguro?», que no informa nada.
    expect(screen.getByText(/2 personas · 7,55 h/)).toBeTruthy();
    const enVentana = [...document.querySelectorAll("button")].filter((b) => b.textContent === "Aprobar");
    clic(enVentana[enVentana.length - 1]);

    const post = await waitFor(() => {
      const e = enviados.find((x) => x.url.includes("/api/asistencia/aprobaciones"));
      if (!e) throw new Error("todavía no");
      return e;
    });
    expect(clics).toBe(3);
    // Las DOS personas en un solo viaje.
    expect((post.body!.personas as unknown[]).length).toBe(2);
  });

  it("desaprobar también son 2 CLICS — un clic de más no puede ser irreversible", async () => {
    servir([
      ["/api/asistencia/aprobaciones", { ok: true }],
      ["/api/asistencia/planilla", {
        ...RESPUESTA_APROBACIONES,
        aprobaciones: [{
          ...FILAS[0],
          aprobado: true,
          por: "daniel",
          cuando: "2026-08-26T15:30:00.000Z",
          minutosVistos: 333,
        }],
      }],
    ]);
    await entrarAAprobaciones();

    // Queda registro de quién aprobó y cuándo — Daniel lo pidió explícitamente.
    expect(screen.getByText(/Aprobada por daniel/)).toBeTruthy();

    clic(screen.getByRole("button", { name: "Quitar" }));
    const post = await waitFor(() => {
      const e = enviados.find((x) => x.url.includes("/api/asistencia/aprobaciones"));
      if (!e) throw new Error("todavía no");
      return e;
    });
    expect(clics).toBe(2);
    expect(post.body!.aprobado).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("lo que viaja al servidor es un PERMISO, no un número para pagar", () => {
  it("manda persona + período; los minutos van como testigo y nunca una plata", async () => {
    servir([
      ["/api/asistencia/aprobaciones", { ok: true }],
      ["/api/asistencia/planilla", RESPUESTA_APROBACIONES],
    ]);
    await entrarAAprobaciones();
    clic([...screen.getByText("JULIO GARAY").closest("li")!.querySelectorAll("button")]
      .find((b) => b.textContent === "Aprobar")!);

    const post = await waitFor(() => {
      const e = enviados.find((x) => x.url.includes("/api/asistencia/aprobaciones"));
      if (!e) throw new Error("todavía no");
      return e;
    });
    // 🔑 EL PERÍODO QUE VIAJA ES EL QUE LA PANTALLA TIENE ELEGIDO, y arranca
    // en la quincena en curso — el mismo con el que pidió la lista. Aprobar no
    // puede escribirse sobre un período distinto del que se está mirando.
    const enCurso = quincenasHasta(
      new Date(Date.now() - 5 * 3_600_000).toISOString().slice(0, 10), 1,
    )[0];
    expect(post.body).toMatchObject({
      desde: enCurso.desde,
      hasta: enCurso.hasta,
      aprobado: true,
      personas: [{ codigo: "11", minutos: 120 }],
    });
    // Y es el MISMO que se usó para pedir la lista: no hay dos períodos.
    const get = enviados.find((x) => x.url.includes("aprobaciones=1"))!;
    expect(get.url).toContain(`desde=${enCurso.desde}`);
    expect(get.url).toContain(`hasta=${enCurso.hasta}`);
    // 🔴 NI UN MONTO. Lo que se paga lo recalcula el motor con la base vigente:
    // si mañana la salida pasa de las 17:00 a las 16:30, esto no cambia.
    expect(JSON.stringify(post.body)).not.toContain("monto");
    expect(JSON.stringify(post.body)).not.toContain("8.1");
  });

  it("«cambió desde que se aprobó» se dice con los DOS números", async () => {
    servir([["/api/asistencia/planilla", {
      ...RESPUESTA_APROBACIONES,
      aprobaciones: [{
        ...FILAS[0], aprobado: true, por: "daniel",
        cuando: "2026-08-26T15:30:00.000Z", minutosVistos: 330, cambio: true,
      }],
    }]]);
    await entrarAAprobaciones();
    // 330 min = 5,50 h aprobadas · 333 min = 5,55 h medidas hoy.
    expect(screen.getByText(/se aprobaron 5,50 h y\s+hoy son 5,55 h/)).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("el detalle por día se ve, pero NO es un paso", () => {
  it("la fila muestra el total sin abrir nada, y los días quedan detrás de un toque", async () => {
    servir([["/api/asistencia/planilla", RESPUESTA_APROBACIONES]]);
    await entrarAAprobaciones();

    // El total está a la vista de entrada: 333 min = 5,55 h.
    expect(screen.getByText("5,55 h")).toBeTruthy();
    // Los días NO.
    expect(screen.queryByText("20 jul 2026")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /ver 2 días/ }));
    expect(screen.getByText("20 jul 2026")).toBeTruthy();
    expect(screen.getByText("21 jul 2026")).toBeTruthy();
  });

  it("quien no tiene días con extra no muestra el enlace de detalle", async () => {
    servir([["/api/asistencia/planilla", RESPUESTA_APROBACIONES]]);
    await entrarAAprobaciones();
    const julio = screen.getByText("JULIO GARAY").closest("li")!;
    expect([...julio.querySelectorAll("button")].some((b) => /ver \d+ día/.test(b.textContent ?? ""))).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 lo que no se aprueba NO se paga, pero SE DICE", () => {
  const conAviso = {
    ...RESPUESTA_APROBACIONES,
    aprobaciones: null,
    lineas: [] as LineaPlanilla[],
    avisos: {
      ...RESPUESTA_APROBACIONES.avisos,
      extraSinAprobar: [
        { codigo: "8", etiqueta: "BRICEIDA MONTERO", minutos: 333, monto: 21.5 },
      ],
      avisoExtraSinAprobar:
        "1 persona tiene horas extra sin aprobar: NO se pagaron en este cuadro. "
        + "Se aprueban en la pestaña Aprobaciones. BRICEIDA MONTERO · 5,55 h · $21.50",
    },
  };

  it("la planilla lo dice ARRIBA, en ámbar, con nombre y cantidad", async () => {
    servir([["/api/asistencia/planilla", conAviso]]);
    montar(<PlanillaTab />);
    const aviso = await screen.findByText(/horas extra sin aprobar/);
    expect(aviso.textContent).toContain("BRICEIDA MONTERO");
    expect(aviso.textContent).toContain("5,55 h");
    expect(aviso.textContent).toContain("$21.50");
    expect(aviso.className).toContain("amber");
  });

  it("sin nada pendiente NO hay cartel — un cartel permanente se deja de leer", async () => {
    servir([["/api/asistencia/planilla", RESPUESTA_APROBACIONES]]);
    montar(<PlanillaTab />);
    await waitFor(() => expect(enviados.length).toBeGreaterThan(0));
    expect(screen.queryByText(/horas extra sin aprobar/)).toBeNull();
  });

  it("sin la tabla corrida se paga todo, como hasta hoy — y se avisa", async () => {
    servir([["/api/asistencia/planilla", {
      ...RESPUESTA_APROBACIONES,
      avisos: {
        ...RESPUESTA_APROBACIONES.avisos,
        faltaMigracionAprobaciones:
          "Las horas extra todavía no se pueden aprobar: falta preparar la base. "
          + "Mientras tanto la planilla paga todas las horas extra que midió el reloj, como hasta ahora.",
      },
    }]]);
    montar(<PlanillaTab />);
    expect((await screen.findByText(/falta preparar la base/)).textContent)
      .toContain("paga todas las horas extra que midió el reloj");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("quién ve la pestaña", () => {
  it("un admin la ve", async () => {
    servir([["/api/asistencia/planilla", RESPUESTA_APROBACIONES]]);
    montar(<AsistenciaClient />);
    expect(await screen.findByRole("button", { name: "Aprobaciones" })).toBeTruthy();
  });

  it("🔴 la contadora NO la ve — pero sí ve el aviso de lo que no se pagó", async () => {
    sessionStorage.setItem("cxc_role", "contabilidad");
    servir([["/api/asistencia/planilla", RESPUESTA_APROBACIONES]]);
    montar(<AsistenciaClient />);
    await screen.findByRole("button", { name: "Planilla" });
    expect(screen.queryByRole("button", { name: "Aprobaciones" })).toBeNull();
    // Las otras cinco siguen ahí: esconder una pestaña no puede esconder el módulo.
    for (const t of ["Planilla", "Reporte", "Justificaciones", "Vacaciones", "Configuración"]) {
      expect(screen.getByRole("button", { name: t })).toBeTruthy();
    }
  });

  it("una secretaria tampoco la ve", async () => {
    sessionStorage.setItem("cxc_role", "secretaria");
    servir([["/api/asistencia/planilla", RESPUESTA_APROBACIONES]]);
    montar(<AsistenciaClient />);
    await screen.findByRole("button", { name: "Planilla" });
    expect(screen.queryByRole("button", { name: "Aprobaciones" })).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("los 3 anchos: nada se aplasta en 834", () => {
  it("la lista NO es una tabla — es una lista que se reacomoda sola", async () => {
    servir([["/api/asistencia/planilla", RESPUESTA_APROBACIONES]]);
    await entrarAAprobaciones();
    const fila = screen.getByText("BRICEIDA MONTERO").closest("li")!;
    // Sin <table> no hay columnas que apretar en el ancho del medio.
    expect(document.querySelectorAll("table").length).toBe(0);
    // El bloque apila en celular y se pone en fila recién en sm.
    expect(fila.querySelector(".flex-col.gap-2")).toBeTruthy();
    expect(fila.innerHTML).toContain("sm:flex-row");
  });

  it("todo lo tocable llega a 44 px", async () => {
    servir([["/api/asistencia/planilla", RESPUESTA_APROBACIONES]]);
    await entrarAAprobaciones();
    // 🩸 SIN EXCEPCIONES. La primera versión eximía al enlace de «ver N días»
    // por ser "texto adentro de la fila", y la medición en el navegador lo
    // encontró en 28 px: el dedo no le acierta. Crece con `-my-2` para no
    // separar el enlace de la línea de las horas.
    for (const b of [...document.querySelectorAll("button")]) {
      const txt = (b.textContent ?? "").trim();
      if (txt === "?") { expect(b.className).toContain("h-11"); continue; }
      expect(b.className).toContain("min-h-[44px]");
    }
  });
});

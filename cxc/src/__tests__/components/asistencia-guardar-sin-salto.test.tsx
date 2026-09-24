/**
 * ─────────────────────────────────────────────────────────────────────────────
 * 🔴 GUARDAR UNA HORA NO BORRA LA TABLA NI SALTA ARRIBA (24-sep-2026)
 *
 * Daniel: *«guardo una hora y se me sale de la pantalla»*.
 *
 * 🩸 EL DEFECTO, medido: al guardar se llamaba `cargar()`, que prende
 * `cargando`, y la tabla estaba condicionada a `!cargando` — o sea que **se
 * desarmaba entera** y en su lugar quedaba una línea de «Cargando…». La página
 * pasaba de medir varias pantallas de alto a medir una línea, así que el
 * teléfono quedaba arriba de todo. Las lecturas de esa misma recarga tardaron
 * **2.031 ms + 1.108 ms + 996 ms** medidas contra producción: segundos, no
 * décimas.
 *
 * 🩸 Y había un segundo defecto encima: con «Solo a revisar» prendido, si la
 * corrección dejaba al colaborador sin días por revisar, **su fila salía de la
 * tabla**. Ahí no es una sensación: la fila ya no está.
 *
 * Lo que este candado exige:
 *   A. La regla pura del anclaje: lo filtrado más los anclados, EN SU ORDEN.
 *   B. En la pantalla: al guardar la tabla se queda dibujada, sin «Cargando…»,
 *      con una pastilla FIJA que no mueve un píxel de la página.
 *   C. La fila recién corregida no desaparece, y dice por qué se queda.
 *   D. Falla ABIERTA: con el interruptor apagado, lo de antes.
 *
 * 🔴 NINGÚN NÚMERO CAMBIA Y EL GUARDADO NO SE TOCA: sigue siendo el MISMO
 * `POST /api/asistencia/correcciones/dia`, con motivo obligatorio y la
 * corrección por encima de la marcación del reloj.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import fs from "fs";
import path from "path";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";

import { ToastProvider } from "@/components/ToastSystem";
import { REGLAS_DEFAULT } from "@/lib/asistencia/config";
import { GUARDAR_EL_DIA } from "@/lib/asistencia/editar-el-dia";
import { ROTULO_SOLO_A_REVISAR } from "@/lib/asistencia/solo-a-revisar";
import {
  ASISTENCIA_GUARDAR_SIN_SALTO, ROTULO_ANCLADA, TEXTO_ACTUALIZANDO,
  ancladosQueSeQuedan, conAnclados,
} from "@/lib/asistencia/pestanas-vivas";

const RAIZ = process.cwd();
const puro = (f: string) =>
  fs.readFileSync(path.join(RAIZ, "src", f), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");

// ─────────────────────────────────────────────────────────────────────────────
// A. LA REGLA PURA
// ─────────────────────────────────────────────────────────────────────────────

const P = (codigo: string) => ({ codigo });
const TODAS = [P("16"), P("26"), P("43")];

describe("A · lo filtrado más los anclados, en su orden", () => {
  it("🔴 el que el filtro se llevó vuelve, EN SU LUGAR de la lista", () => {
    const filtradas = [P("16"), P("43")];
    const out = conAnclados(filtradas, TODAS, new Set(["26"]), true);
    expect(out.map((p) => p.codigo)).toEqual(["16", "26", "43"]);
  });

  it("sin anclados no se toca nada: la misma lista filtrada", () => {
    const filtradas = [P("16")];
    expect(conAnclados(filtradas, TODAS, new Set(), true).map((p) => p.codigo)).toEqual(["16"]);
  });

  it("un anclado que YA está en lo filtrado no se duplica", () => {
    const out = conAnclados(TODAS, TODAS, new Set(["26"]), true);
    expect(out.map((p) => p.codigo)).toEqual(["16", "26", "43"]);
  });

  it("un anclado que ya no está en la lista entera (cambió el período) no aparece", () => {
    const out = conAnclados([P("16")], [P("16")], new Set(["999"]), true);
    expect(out.map((p) => p.codigo)).toEqual(["16"]);
  });

  it("🔴 con el interruptor APAGADO, lo filtrado tal cual: la fila se va, como antes", () => {
    const out = conAnclados([P("16")], TODAS, new Set(["26"]), false);
    expect(out.map((p) => p.codigo)).toEqual(["16"]);
  });

  it("el chip «listo» es SOLO para el que se quedó por anclado", () => {
    expect([...ancladosQueSeQuedan([P("16")], new Set(["26", "16"]))]).toEqual(["26"]);
    expect([...ancladosQueSeQuedan(TODAS, new Set(["26"]))]).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B y C. EN LA PANTALLA
// ─────────────────────────────────────────────────────────────────────────────

let URL_ACTUAL = "";
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn((u: string) => { URL_ACTUAL = String(u).split("?")[1] ?? ""; }),
    replace: vi.fn((u: string) => { URL_ACTUAL = String(u).split("?")[1] ?? ""; }),
    refresh: vi.fn(), prefetch: vi.fn(),
  }),
  usePathname: () => "/asistencia",
  useSearchParams: () => new URLSearchParams(URL_ACTUAL),
}));

import ReporteTab from "@/app/asistencia/ReporteTab";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); URL_ACTUAL = ""; });

const dia = (over: Record<string, unknown>) => ({
  fecha: "2026-09-01", marcas: [], marcasIds: [], repetidas: [], entrada: null, salida: null,
  tardeMin: 0, excesoAlmuerzoMin: 0, salidaTempranaMin: 0, extraMin: 0, trabajadoMin: 0,
  revisar: false, salidaSospechosa: false, enCurso: false, fueraDeVigencia: false,
  ausente: false, vacacion: null, justificado: null, permiso: null, permisoRango: null,
  permisoPerdonaMin: 0, permisoPerdonaSalidaMin: 0, permisoPerdonaAlmuerzoMin: 0,
  feriado: null, habil: true, correcciones: [], ...over,
});

const resumen = (over: Record<string, unknown> = {}) => ({
  diasTrabajados: 1, ausenciasSinJustificar: 0, ausenciasJustificadas: 0,
  diasTrabajandoFuera: 0, diasVacaciones: 0, diasVacacionesYaPagadas: 0,
  vecesTarde: 0, minutosTarde: 0, minutosTardeDeDiasARevisar: 0,
  diasConPermiso: 0, minutosPerdonadosPorPermiso: 0,
  minutosPerdonadosTarde: 0, minutosPerdonadosSalidaTemprana: 0, minutosPerdonadosAlmuerzo: 0,
  excesoAlmuerzoMin: 0, salidaTempranaMin: 0, extraMin: 0, diasARevisar: 0,
  diasEnCurso: 0, tiempoNoTrabajadoMin: 0, diasCorregidos: 0, correcciones: 0,
  ...over,
});

/** ANTES: le falta una marca, así que «Solo a revisar» la deja. */
const ANTES = {
  personas: [
    {
      codigo: "26", nombre: "YULISSA JUAREZ", salida: "17:00", almuerzoMin: 30,
      dias: [dia({ marcas: ["08:00:00"], marcasIds: ["m1"], revisar: true })],
      resumen: resumen({ diasARevisar: 1, tiempoNoTrabajadoMin: 5 }),
    },
    {
      codigo: "16", nombre: "ANDREA PEREZ", salida: "17:00", almuerzoMin: 30,
      dias: [dia({ marcas: ["08:00:00"], marcasIds: ["m9"], revisar: true })],
      resumen: resumen({ diasARevisar: 1, tiempoNoTrabajadoMin: 9 }),
    },
  ],
  sinHorario: 0, reglas: REGLAS_DEFAULT, correccionesDisponible: true,
};

/** DESPUÉS: Yulissa quedó con las cuatro marcas → el filtro la sacaría. */
const DESPUES = {
  ...ANTES,
  personas: [
    {
      ...ANTES.personas[0],
      dias: [dia({ marcas: ["08:00:00", "12:00:00", "13:00:00", "17:00:00"], marcasIds: ["m1", null, null, null] })],
      resumen: resumen({ diasARevisar: 0, tiempoNoTrabajadoMin: 5, diasCorregidos: 1 }),
    },
    ANTES.personas[1],
  ],
};

/**
 * El arnés: la SEGUNDA lectura del reporte —la de después de guardar— queda
 * colgada hasta que el test la suelta. Así se puede mirar la pantalla en el
 * instante exacto en que antes desaparecía la tabla.
 */
function servir() {
  let vueltas = 0;
  let soltar: (() => void) | null = null;
  const llamadas: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const u = String(url);
    llamadas.push(u);
    if (u.includes("/api/asistencia/reporte")) {
      vueltas += 1;
      if (vueltas === 1) return { ok: true, status: 200, json: async () => ANTES } as Response;
      await new Promise<void>((res) => { soltar = res; });
      return { ok: true, status: 200, json: async () => DESPUES } as Response;
    }
    if (u.includes("/correcciones/motivos")) return { ok: true, json: async () => ({ motivos: [] }) } as Response;
    if (u.includes("/correcciones/dia")) {
      return { ok: true, status: 200, json: async () => ({ ok: true, aplicados: 1, errores: [] }) } as Response;
    }
    return { ok: true, status: 200, json: async () => ({ relojes: [], justificaciones: [], personas: [] }) } as Response;
  }));
  return { llamadas, soltar: () => { soltar?.(); }, listaParaSoltar: () => soltar !== null };
}

const montar = () => render(<ToastProvider><ReporteTab /></ToastProvider>);
const camposHora = () => Array.from(document.querySelectorAll('input[type="time"]')) as HTMLInputElement[];

/** Prende «Solo a revisar», abre a Yulissa, corrige una hora y guarda. */
async function corregirYGuardar() {
  fireEvent.click(await screen.findByRole("button", { name: ROTULO_SOLO_A_REVISAR }));
  fireEvent.click(await screen.findByText("Yulissa Juarez"));
  fireEvent.click(await screen.findByText("08:00:00"));
  await waitFor(() => expect(camposHora().length).toBeGreaterThan(0));
  fireEvent.change(camposHora()[1], { target: { value: "12:00" } });
  fireEvent.change(
    document.querySelector('input[placeholder="Escribe el motivo…"]') as HTMLInputElement,
    { target: { value: "se le olvidó marcar" } },
  );
  fireEvent.click(screen.getByRole("button", { name: GUARDAR_EL_DIA }));
}

describe("B · la tabla se queda dibujada mientras llegan los datos nuevos", () => {
  it("🔴 al guardar NO aparece «Cargando…» ni desaparece la tabla", async () => {
    const arnes = servir();
    montar();
    await corregirYGuardar();

    // La segunda lectura ya está en vuelo y colgada: éste es el instante en el
    // que antes la pantalla se quedaba en una línea.
    await waitFor(() => expect(arnes.listaParaSoltar()).toBe(true));
    expect(screen.queryByText("Cargando…")).toBeNull();
    expect(document.querySelector("table")).not.toBeNull();
    expect(screen.getByText("Andrea Perez")).toBeTruthy();

    // 🔴 El aviso es una pastilla FIJA: fuera del flujo, no mueve un píxel.
    const pastilla = screen.getByText(TEXTO_ACTUALIZANDO);
    expect(pastilla.className).toContain("fixed");

    arnes.soltar();
    await waitFor(() => expect(screen.queryByText(TEXTO_ACTUALIZANDO)).toBeNull());
  });

  it("🔴 el guardado no cambia: UN POST a `correcciones/dia`", async () => {
    const arnes = servir();
    montar();
    await corregirYGuardar();
    await waitFor(() => {
      expect(arnes.llamadas.filter((u) => u.includes("/correcciones/dia"))).toHaveLength(1);
    });
    arnes.soltar();
  });
});

describe("C · la fila recién corregida no desaparece", () => {
  it("🔴 con «Solo a revisar» prendido, Yulissa se queda y dice por qué", async () => {
    const arnes = servir();
    montar();
    await corregirYGuardar();
    await waitFor(() => expect(arnes.listaParaSoltar()).toBe(true));
    arnes.soltar();

    // Ya no tiene días a revisar, y aun así sigue en la tabla, con el chip.
    await waitFor(() => expect(screen.getByText(ROTULO_ANCLADA)).toBeTruthy());
    expect(screen.getByText("Yulissa Juarez")).toBeTruthy();
    // La otra sigue igual y sin chip: el anclaje es de quien se corrigió.
    expect(screen.getByText("Andrea Perez")).toBeTruthy();
    expect(screen.getAllByText(ROTULO_ANCLADA)).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// D. CONTROL
// ─────────────────────────────────────────────────────────────────────────────

describe("D · el interruptor y lo que NO se tocó", () => {
  it("hoy está prendido", () => {
    expect(ASISTENCIA_GUARDAR_SIN_SALTO).toBe(true);
  });

  it("🔴 la recarga de después de guardar es SILENCIOSA, y la de siempre no", () => {
    const tab = puro("app/asistencia/ReporteTab.tsx");
    expect(tab).toContain("guardadoElDia(p.codigo)");
    expect(tab).toContain("void cargar(true)");
    // 🩸 El `onGuardadoElDia={() => void cargar()}` de antes es el defecto.
    expect(tab).not.toMatch(/onGuardadoElDia=\{\(\) => void cargar\(\)\}/);
  });

  it("🔴 la regla del anclaje vive en el módulo PURO", () => {
    const tab = puro("app/asistencia/ReporteTab.tsx");
    expect(tab).toContain("conAnclados(");
    expect(tab).toContain("ancladosQueSeQuedan(");
  });
});

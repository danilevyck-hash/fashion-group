/**
 * ─────────────────────────────────────────────────────────────────────────────
 * 🔴 LOS CINCO ARREGLOS DE PANTALLA DE ASISTENCIA (16-sep-2026)
 *
 * Ninguno mueve plata: los cinco cambian lo que se VE. Daniel, textual, uno por
 * uno:
 *
 *   1. *«arregla la manera de seleccionar en el calendario que se ve raro,
 *      tiene que ser normal, facil»* → Hoy · Ayer · Esta quincena · Quincena
 *      pasada, y el calendario se queda para lo demás.
 *   2. *«si estoy en asistencia y voy a planilla y vuelvo se me resetea
 *      asistencia, quiero q se quede»* → el período vive en `?desde=&hasta=`.
 *   3. *«debería de haber un link directo para ir al problema»* → el aviso de
 *      la hora de salida NOMBRA a cada uno, con enlace a su ficha.
 *   4. dos marcas y la segunda a mediodía → se avisa, como un «Revisar» más.
 *   5. preguntado si la columna «Extras» tenía que decir lo medido Y lo
 *      aprobado: *«Si»*.
 *
 * 🔴 POR QUÉ SE RENDERIZA Y NO SE PRUEBA LA FUNCIÓN PURA SOLA: que
 * `atajosDePeriodo` devuelva cuatro rangos no prueba que la pantalla dibuje
 * cuatro botones, ni que al tocarlos pida ESE período. Lo que se sostiene acá
 * es lo que Daniel ve.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { ToastProvider } from "@/components/ToastSystem";
import { REGLAS_DEFAULT } from "@/lib/asistencia/config";
import { atajosDePeriodo, atajoActivo } from "@/lib/asistencia/atajos-periodo";
import { periodoInicial, urlTraePeriodo } from "@/lib/asistencia/periodo-en-la-url";
import {
  salidaSospechosa, SALIDA_SOSPECHOSA_MIN, TEXTO_SALIDA_SOSPECHOSA,
} from "@/lib/asistencia/salida-sospechosa";
import {
  repartirExtras, textoExtrasDecididas, tituloExtrasDecididas, EXTRAS_SIN_DECIDIR,
} from "@/lib/asistencia/extras-decididas";
import { claveDia, type Decision } from "@/lib/asistencia/aprobaciones";

// 🔴 EL ACOMODO NUEVO ESTÁ PRENDIDO EN PRODUCCIÓN desde el 11-sep-2026, así que
// el enlace a la ficha existe. `vi.hoisted` corre ANTES de los imports: el
// interruptor se lee al importar el módulo y sin esto quedaría apagado.
vi.hoisted(() => { process.env.NEXT_PUBLIC_PERSONA_EN_EL_CENTRO = "1"; });

let URL_ACTUAL = "";
const REEMPLAZOS: string[] = [];
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn((u: string) => { REEMPLAZOS.push(String(u)); }),
    refresh: vi.fn(), prefetch: vi.fn(),
  }),
  usePathname: () => "/asistencia",
  useSearchParams: () => new URLSearchParams(URL_ACTUAL),
}));

import ReporteTab from "@/app/asistencia/ReporteTab";

// ── El arnés ─────────────────────────────────────────────────────────────────

const PEDIDOS: string[] = [];
function servir(respuestas: Array<[string, unknown]>) {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const u = String(url);
    PEDIDOS.push(u);
    const par = respuestas.find(([frag]) => u.includes(frag));
    return { ok: true, json: async () => par?.[1] ?? {} } as Response;
  }));
}
const montar = (ui: React.ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);

const dia = (over: Record<string, unknown>) => ({
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
  diasTrabajados: 1, ausenciasSinJustificar: 0, ausenciasJustificadas: 0,
  diasTrabajandoFuera: 0, diasVacaciones: 0, diasVacacionesYaPagadas: 0,
  vecesTarde: 0, minutosTarde: 0, minutosTardeDeDiasARevisar: 0,
  diasConPermiso: 0, minutosPerdonadosPorPermiso: 0,
  minutosPerdonadosTarde: 0, minutosPerdonadosSalidaTemprana: 0, minutosPerdonadosAlmuerzo: 0,
  excesoAlmuerzoMin: 0, salidaTempranaMin: 0, extraMin: 0, diasARevisar: 0,
  diasEnCurso: 0, tiempoNoTrabajadoMin: 0, diasCorregidos: 0, correcciones: 0,
  ...over,
});

const persona = (over: Record<string, unknown> = {}) => ({
  codigo: "16", nombre: "ANDREA PEREZ", salida: "17:00", almuerzoMin: 30,
  dias: [dia({})], resumen: resumen(), ...over,
});

const respuesta = (over: Record<string, unknown> = {}) => [
  ["/api/asistencia/reloj", { relojes: [] }],
  ["/api/asistencia/reporte", {
    personas: [persona()], sinHorario: 0, sinHorarioLista: [], reglas: REGLAS_DEFAULT,
    decisionesExtra: {}, ...over,
  }],
] as Array<[string, unknown]>;

beforeEach(() => { URL_ACTUAL = ""; PEDIDOS.length = 0; REEMPLAZOS.length = 0; try { localStorage.clear(); } catch { /* jsdom */ } });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const ultimoPedido = () => PEDIDOS.filter((u) => u.includes("/api/asistencia/reporte")).at(-1) ?? "";

// ─────────────────────────────────────────────────────────────────────────────
describe("1. 🔴 LOS ATAJOS DEL PERÍODO — un toque, no dos en un calendario", () => {
  it("son cuatro, en orden, y las quincenas salen de la MISMA función que la Planilla", () => {
    const a = atajosDePeriodo("2026-09-16");
    expect(a.map((x) => x.clave)).toEqual(["hoy", "ayer", "quincena", "quincena-pasada"]);
    expect(a[0]).toMatchObject({ desde: "2026-09-16", hasta: "2026-09-16" });
    expect(a[1]).toMatchObject({ desde: "2026-09-15", hasta: "2026-09-15" });
    // 16-sep cae en la SEGUNDA quincena de septiembre, que paga hasta el 30.
    expect(a[2]).toMatchObject({ desde: "2026-09-16", hasta: "2026-09-30" });
    expect(a[3]).toMatchObject({ desde: "2026-09-01", hasta: "2026-09-15" });
    expect(a[2].rotulo).toContain("16 – 30 sep");
  });

  it("🔑 el 1 de enero la quincena pasada es la SEGUNDA de diciembre", () => {
    const a = atajosDePeriodo("2027-01-01");
    expect(a[2]).toMatchObject({ desde: "2027-01-01", hasta: "2027-01-15" });
    expect(a[3].desde).toBe("2026-12-16");
    expect(a[1]).toMatchObject({ desde: "2026-12-31", hasta: "2026-12-31" });
  });

  it("⚠️ el 31 —que no se paga— no deja la pantalla sin los dos botones", () => {
    const a = atajosDePeriodo("2026-08-31");
    expect(a).toHaveLength(4);
    expect(a[2].desde).toBe("2026-08-16");
  });

  it("el botón prendido se decide por igualdad EXACTA de las dos fechas", () => {
    const a = atajosDePeriodo("2026-09-16");
    expect(atajoActivo(a, "2026-09-16", "2026-09-16")).toBe("hoy");
    expect(atajoActivo(a, "2026-09-01", "2026-09-15")).toBe("quincena-pasada");
    expect(atajoActivo(a, "2026-09-02", "2026-09-15")).toBeNull();
    // 🩸 Y las DOS fechas tienen que coincidir: un rango que empieza igual pero
    // termina antes NO es esa quincena, y prender el botón sería afirmar que se
    // está mirando un período que no se está mirando.
    expect(atajoActivo(a, "2026-09-01", "2026-09-10")).toBeNull();
    expect(atajoActivo(a, "2026-09-16", "2026-09-20")).toBeNull();
  });

  it("🔴 EN LA PANTALLA: los cuatro botones están, y tocar uno pide ESE período", async () => {
    servir(respuesta());
    montar(<ReporteTab />);
    await waitFor(() => expect(ultimoPedido()).toContain("/api/asistencia/reporte"));

    const hoy = screen.getByRole("button", { name: "Hoy" });
    const ayer = screen.getByRole("button", { name: "Ayer" });
    expect(screen.getByRole("button", { name: /^Esta quincena · / })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Quincena pasada · / })).toBeTruthy();

    fireEvent.click(ayer);
    const a = atajosDePeriodo(new Date().toISOString().slice(0, 10));
    await waitFor(() => expect(REEMPLAZOS.join(" ")).toContain("desde="));
    // 🔑 El calendario NO se fue: sigue estando para lo que no es un atajo.
    expect(hoy).toBeTruthy();
    expect(a).toHaveLength(4);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("2. 🔴 EL PERÍODO VIVE EN LA URL — no se resetea al cambiar de pestaña", () => {
  const BASE = { hoy: "2026-09-16", haceCatorce: "2026-09-02" };

  it("manda la URL, después lo recordado, y al final la sugerencia", () => {
    expect(periodoInicial({ url: { desde: "2026-09-01", hasta: "2026-09-15" }, recordado: { desde: "2026-01-01", hasta: "2026-01-31" }, ...BASE }))
      .toEqual({ desde: "2026-09-01", hasta: "2026-09-15" });
    expect(periodoInicial({ url: {}, recordado: { desde: "2026-01-01", hasta: "2026-01-31" }, ...BASE }))
      .toEqual({ desde: "2026-01-01", hasta: "2026-01-31" });
    expect(periodoInicial({ url: {}, recordado: null, ...BASE }))
      .toEqual({ desde: "2026-09-02", hasta: "2026-09-16" });
  });

  it("🩸 media URL o un rango al revés NO se creen: caen en lo de siempre", () => {
    expect(periodoInicial({ url: { desde: "2026-09-01" }, recordado: null, ...BASE }))
      .toEqual({ desde: "2026-09-02", hasta: "2026-09-16" });
    expect(periodoInicial({ url: { desde: "2026-09-15", hasta: "2026-09-01" }, recordado: null, ...BASE }))
      .toEqual({ desde: "2026-09-02", hasta: "2026-09-16" });
    expect(periodoInicial({ url: { desde: "ayer", hasta: "hoy" }, recordado: null, ...BASE }))
      .toEqual({ desde: "2026-09-02", hasta: "2026-09-16" });
    expect(urlTraePeriodo({ desde: "2026-09-15", hasta: "2026-09-01" })).toBe(false);
    expect(urlTraePeriodo({ desde: "2026-09-01", hasta: "2026-09-15" })).toBe(true);
  });

  it("🔴 EN LA PANTALLA: el rango de la URL manda, y se pide ese", async () => {
    URL_ACTUAL = "tab=asistencia&desde=2026-09-01&hasta=2026-09-15";
    servir(respuesta());
    montar(<ReporteTab />);
    await waitFor(() => expect(ultimoPedido()).toContain("desde=2026-09-01"));
    expect(ultimoPedido()).toContain("hasta=2026-09-15");
  });

  it("🔴 sin período en la URL, la pantalla lo ESCRIBE al montar", async () => {
    servir(respuesta());
    montar(<ReporteTab />);
    await waitFor(() => expect(REEMPLAZOS.length).toBeGreaterThan(0));
    // Es lo que hace que volver de Planilla encuentre el mismo período.
    expect(REEMPLAZOS.join(" ")).toMatch(/desde=\d{4}-\d{2}-\d{2}/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("3. 🔴 EL AVISO DE LA HORA DE SALIDA DICE QUIÉN, CON ENLACE", () => {
  it("🩸 antes daba el número y nada más", async () => {
    servir(respuesta({
      sinHorario: 2,
      sinHorarioLista: [
        { codigo: "2", nombre: "ANA TREJOS" },
        { codigo: "306", nombre: "YEISIBETH MUÑOZ" },
      ],
    }));
    montar(<ReporteTab />);
    await waitFor(() => expect(screen.queryByText(/hora de salida/)).toBeTruthy());

    const ana = await screen.findByText(/Ana Trejos/i);
    expect(ana).toBeTruthy();
    expect(screen.getByText(/Yeisibeth Muñoz/i)).toBeTruthy();
    // 🔴 Y el enlace lleva a SU ficha, no a una lista donde haya que buscarla.
    expect(ana.closest("a")?.getAttribute("href")).toBe("/asistencia/colaboradores/2");
  });

  it("⚠️ CONTROL: sin nadie sin horario, el aviso no existe", async () => {
    servir(respuesta({ sinHorario: 0, sinHorarioLista: [] }));
    montar(<ReporteTab />);
    await waitFor(() => expect(ultimoPedido()).toContain("/api/asistencia/reporte"));
    expect(screen.queryByText(/hora de salida/)).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("4. 🔴 DOS MARCAS Y LA SEGUNDA A MEDIODÍA", () => {
  const base = {
    habil: true, enCurso: false, fueraDeVigencia: false, vacacion: null,
  };

  it("🩸 el caso de Andrea: 08:04 y 12:07, 292 minutos antes de su salida", () => {
    expect(salidaSospechosa({ ...base, marcas: ["a", "b"], salidaTempranaMin: 292.47 })).toBe(true);
  });

  it("⚠️ NO es «dos marcas»: sus días 7 y 9 de septiembre están perfectos", () => {
    // Segunda marca a las 17:11 y 17:00 → cero salida temprana.
    expect(salidaSospechosa({ ...base, marcas: ["a", "b"], salidaTempranaMin: 0 })).toBe(false);
  });

  it("🔑 el umbral son dos horas, y el hueco medido lo justifica", () => {
    expect(SALIDA_SOSPECHOSA_MIN).toBe(120);
    // El único caso intermedio medido en 45 días: 58,1 minutos. No avisa.
    expect(salidaSospechosa({ ...base, marcas: ["a", "b"], salidaTempranaMin: 58.1 })).toBe(false);
    // Y el más chico de los raros: 179,7. Avisa.
    expect(salidaSospechosa({ ...base, marcas: ["a", "b"], salidaTempranaMin: 179.7 })).toBe(true);
    // El borde exacto NO avisa: es «más de», no «al menos».
    expect(salidaSospechosa({ ...base, marcas: ["a", "b"], salidaTempranaMin: 120 })).toBe(false);
  });

  it("con 4 marcas, o con un número impar, esta regla se calla", () => {
    expect(salidaSospechosa({ ...base, marcas: ["a", "b", "c", "d"], salidaTempranaMin: 300 })).toBe(false);
    // Los impares ya los avisa `marcas-impares.ts`: dos avisos del mismo día
    // serían dos carteles para un solo problema.
    expect(salidaSospechosa({ ...base, marcas: ["a", "b", "c"], salidaTempranaMin: 300 })).toBe(false);
    expect(salidaSospechosa({ ...base, marcas: ["a"], salidaTempranaMin: 300 })).toBe(false);
  });

  it("🔴 el día que no terminó, el que no es hábil, el que no era suyo y la vacación NO avisan", () => {
    expect(salidaSospechosa({ ...base, marcas: ["a", "b"], salidaTempranaMin: 300, enCurso: true })).toBe(false);
    expect(salidaSospechosa({ ...base, marcas: ["a", "b"], salidaTempranaMin: 300, habil: false })).toBe(false);
    expect(salidaSospechosa({ ...base, marcas: ["a", "b"], salidaTempranaMin: 300, fueraDeVigencia: true })).toBe(false);
    expect(salidaSospechosa({ ...base, marcas: ["a", "b"], salidaTempranaMin: 300, vacacion: {} })).toBe(false);
  });

  it("🔴 EN LA PANTALLA: se ve como un «Revisar» más, en la fila del día", async () => {
    servir(respuesta({
      personas: [persona({
        dias: [dia({ marcas: ["08:04:03", "12:07:32"], entrada: "08:04:03", salida: "12:07:32", salidaTempranaMin: 292.47, salidaSospechosa: true, revisar: true })],
        resumen: resumen({ salidaTempranaMin: 292.47, tiempoNoTrabajadoMin: 292.47, diasARevisar: 1 }),
      })],
    }));
    montar(<ReporteTab />);
    fireEvent.click(await screen.findByText(/Andrea Perez/i));
    expect(await screen.findByText(TEXTO_SALIDA_SOSPECHOSA)).toBeTruthy();
  });

  it("⚠️ CONTROL: sin la bandera, el chip no está", async () => {
    servir(respuesta({
      personas: [persona({
        dias: [dia({ marcas: ["08:04:03", "17:11:00"], entrada: "08:04:03", salida: "17:11:00" })],
      })],
    }));
    montar(<ReporteTab />);
    fireEvent.click(await screen.findByText(/Andrea Perez/i));
    expect(screen.queryByText(TEXTO_SALIDA_SOSPECHOSA)).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("5. 🔴 LA COLUMNA «EXTRAS» DICE CUÁNTO ESTÁ APROBADO", () => {
  const dec = (pares: Array<[string, Decision]>): ReadonlyMap<string, Decision> =>
    new Map(pares.map(([f, d]) => [claveDia("17", f), d]));

  it("🩸 Kener Hernández (17): lo medido se reparte entre las tres decisiones", () => {
    const dias = [
      { fecha: "2026-08-26", extraMin: 254.05 },
      { fecha: "2026-08-27", extraMin: 72.45 },
    ];
    const e = repartirExtras("17", dias, dec([["2026-08-26", "si"], ["2026-08-27", "no"]]));
    expect(e.aprobadoMin).toBeCloseTo(254.05, 6);
    expect(e.rechazadoMin).toBeCloseTo(72.45, 6);
    expect(e.pendienteMin).toBe(0);
    // 🔴 Y las tres SUMAN el total: no es una segunda cuenta.
    expect(e.aprobadoMin + e.rechazadoMin + e.pendienteMin).toBeCloseTo(326.5, 6);
    expect(textoExtrasDecididas(e)).toBe("254 aprobados · 72 rechazados");
  });

  it("⚠️ sin fila es PENDIENTE — es lo que significa no haber decidido", () => {
    const e = repartirExtras("17", [{ fecha: "2026-09-01", extraMin: 100 }], new Map());
    expect(e).toEqual({ aprobadoMin: 0, rechazadoMin: 0, pendienteMin: 100 });
    // Con TODO pendiente la línea no se dibuja: serían los mismos minutos de
    // arriba dichos dos veces.
    expect(textoExtrasDecididas(e)).toBeNull();
  });

  it("🔴 lo PENDIENTE se dice, y primero: es lo único que frena el cierre", () => {
    const e = repartirExtras("17", [
      { fecha: "2026-09-01", extraMin: 314 },
      { fecha: "2026-09-02", extraMin: 118 },
      { fecha: "2026-09-03", extraMin: 46 },
    ], dec([["2026-09-02", "si"], ["2026-09-03", "no"]]));
    expect(textoExtrasDecididas(e)).toBe("314 sin decidir · 118 aprobados · 46 rechazados");
    expect(tituloExtrasDecididas(e)).toContain("paga solo lo aprobado: 118 min");
  });

  it("sin horas extra no hay nada que decir", () => {
    expect(textoExtrasDecididas(EXTRAS_SIN_DECIDIR)).toBeNull();
    expect(repartirExtras("17", [{ fecha: "2026-09-01", extraMin: 0 }], new Map())).toEqual(EXTRAS_SIN_DECIDIR);
  });

  it("🔴 EN LA PANTALLA: la celda dice los minutos medidos Y lo decidido", async () => {
    servir(respuesta({
      personas: [persona({
        codigo: "17", nombre: "KENNER HERNANDEZ",
        dias: [
          dia({ fecha: "2026-08-26", extraMin: 254.05, marcas: ["08:00:00", "21:14:03"] }),
          dia({ fecha: "2026-08-27", extraMin: 72.45, marcas: ["08:00:00", "18:12:27"] }),
        ],
        resumen: resumen({ extraMin: 326.5 }),
      })],
      decisionesExtra: { "17|2026-08-26": "si", "17|2026-08-27": "no" },
    }));
    montar(<ReporteTab />);
    await screen.findByText(/Kenner Hernandez/i);
    expect(await screen.findByText("254 aprobados · 72 rechazados")).toBeTruthy();
  });

  it("⚠️ CONTROL: sin decisiones la celda muestra el número solo, como siempre", async () => {
    servir(respuesta({
      personas: [persona({
        codigo: "17", nombre: "KENNER HERNANDEZ",
        dias: [dia({ fecha: "2026-08-26", extraMin: 326.5, marcas: ["08:00:00", "21:14:03"] })],
        resumen: resumen({ extraMin: 326.5 }),
      })],
      decisionesExtra: {},
    }));
    montar(<ReporteTab />);
    await screen.findByText(/Kenner Hernandez/i);
    expect(screen.queryByText(/aprobados/)).toBeNull();
    expect(screen.queryByText(/rechazados/)).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("lo que la pantalla NO puede escribir a mano", () => {
  const puro = (ruta: string) =>
    require("node:fs").readFileSync(ruta, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

  it("los cuatro textos salen de módulos puros, no del `.tsx`", () => {
    const tsx = puro("src/app/asistencia/ReporteTab.tsx");
    expect(tsx).toMatch(/atajosDePeriodo\(/);
    expect(tsx).toMatch(/periodoInicial\(/);
    expect(tsx).toMatch(/TEXTO_SALIDA_SOSPECHOSA/);
    expect(tsx).toMatch(/textoExtrasDecididas\(/);
    // 🔑 El enlace a la ficha sale del módulo, no de una ruta escrita a mano
    // (la vieja `/asistencia/personas/…` solo vive en el redirect).
    expect(tsx).toMatch(/rutaDePersona\(x\.codigo\)/);
    // 🩸 El período era `useState`: por eso se reseteaba al cambiar de pestaña.
    expect(tsx).not.toMatch(/useState\(llegada\.rango/);
  });

  it("🔴 la ruta devuelve QUIÉNES son y las decisiones ya tomadas", () => {
    const ts = puro("src/app/api/asistencia/reporte/route.ts");
    expect(ts).toMatch(/sinHorarioLista,/);
    expect(ts).toMatch(/decisionesExtra,/);
    // La decisión sale de la MISMA lectura que usa la planilla.
    expect(ts).toMatch(/leerAprobaciones\(desde, hasta\)/);
  });

  it("🔴 `salida-sospechosa` NO toca `revisar` ni ningún minuto", () => {
    const ts = require("node:fs").readFileSync("src/lib/asistencia/salida-sospechosa.ts", "utf8");
    // No importa nada del motor ni de la planilla: es una pregunta, no una cuenta.
    expect(ts).not.toMatch(/^import /m);
    const motor = puro("src/lib/asistencia/reporte.ts");
    // El veredicto viaja en SU campo, nunca dentro de `revisar`.
    // 🔴 18-sep-2026: `buenas`, no `crudas` — la repetida ya se olvidó antes
    // de contar (`marca-repetida.ts`). La regla «no tiene 4» no cambió.
    expect(motor).toMatch(/const revisar = !enCurso && buenas\.length !== 4;/);
    expect(motor).toMatch(/salidaSospechosa: sospechosa/);
  });
});

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * 🔴 MARCACIONES, AGRUPADAS POR DÍA (25-sep-2026) — el candado
 *
 * Daniel, sobre el mockup: *«hazlo minimalista, user friendly; ya sabes que
 * tienes que usar scroll down en vez de chips con cada persona»*.
 *
 * 🩸 LO QUE HABÍA, medido el 25-sep-2026 contra producción: **37 marcas de
 * teléfono**, de cinco personas y cuatro días. La pantalla las ponía en **37
 * renglones sueltos SIN columna de fecha**, con dos filas de chips —seis
 * colaboradores y cinco días— para saber de cuál era cada uno. En el celular,
 * **cuatro filas de botones** antes de la primera hora. **32 de las 37 llegaron
 * al instante** y aun así cada una gastaba una celda diciéndolo.
 *
 * Lo que este candado exige:
 *
 *   1. SIN CHIPS. UN solo desplegable, «Colaborador: todos», al lado del
 *      período. Sin filtro de día y sin filtro de empresa —la empresa la manda
 *      el selector del módulo—.
 *   2. EL DÍA ES EL ENCABEZADO, y dentro UNA fila por colaborador con sus
 *      marcas en orden: «Entrada 08:59 · Almuerzo 18:01 – 18:01 · Salida 18:01».
 *   3. EL LUGAR, UNA vez por fila y en palabras: «Paso Canoas · 46 km de la
 *      tienda». El código de mapa se va; sin referencia, solo el nombre; sin
 *      nombre, «—».
 *   4. EL ATRASO SOLO SI LO HUBO, y 🔴 NUNCA con la palabra «llegó»: se dice
 *      «se envió». Hay barrido.
 *   5. LA COLUMNA «APARATO» SE VA, y queda un aviso ROJO en la fila solo cuando
 *      dos colaboradores marcaron con el mismo teléfono ese día.
 *   6. LA NOTA DEL PIE PASA A UN ⓘ, y tocar la fila abre las fotos y el mapa.
 *   7. NINGÚN NÚMERO CAMBIA: las mismas horas y la MISMA cuenta del atraso.
 *   8. CON EL INTERRUPTOR APAGADO vuelve la pantalla de chips, entera.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, waitFor, fireEvent } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  AVISO_MISMO_TELEFONO, COLUMNAS_POR_DIA, MARCACIONES_POR_DIA,
  NOTA_SOLO_SE_MIRA, ROTULO_TODOS, VERBO_ENVIO, avisoDelTramo, detalleEnLaHoja, diasDeMarcaciones,
  distanciaDeLaTienda, fechaDelDia, lugarDeLaFila, lugarEnPalabras,
  sinCodigoDeMapa, tramoDeLaMarca, tramosDelDia,
  AVISO_SIN_ALMUERZO, MINUTOS_ANTES_DE_LA_SALIDA, avisosDelDia,
  partesDelLugarDeLaFila, segundaEsSalida,
  claveDelLugar, hayColumnaLugar, juntarRepetidas, lugarDelDia, marcasDeLaHoja,
} from "@/lib/asistencia/marcaciones-por-dia";
import { SEGUNDOS_MARCA_REPETIDA } from "@/lib/asistencia/marca-repetida";
import { SALIDA_SOSPECHOSA_MIN } from "@/lib/asistencia/salida-sospechosa";
import { CLASE_BARRA_PEGAJOSA } from "@/lib/ui/barra-pegajosa";
import { SIN_LUGAR } from "@/lib/asistencia/lugar-de-marca";
import { cuantoDespues, demoraEnPalabras } from "@/lib/asistencia/marcaciones-pestana";
import { marcasDeAparatoCompartido, type MarcaDeTelefono } from "@/app/asistencia/marcaciones/logica";

// ── La dirección, como en el resto de los candados de Asistencia ────────────
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

import MarcacionesTab from "@/app/asistencia/MarcacionesTab";

const RAIZ = process.cwd();
const leer = (p: string) => readFileSync(resolve(RAIZ, p), "utf8");

const TAB = "src/app/asistencia/MarcacionesTab.tsx";
const REGLA = "src/lib/asistencia/marcaciones-por-dia.ts";
const DE_ANTES = "src/app/asistencia/marcaciones/PantallaDeAntes.tsx";

const DESDE = "2026-09-16";
const HASTA = "2026-09-30";

/** Con el dedo (celular) o con el mouse (computadora). */
function aparato(celular: boolean) {
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: celular && q.includes("coarse"),
    media: q, onchange: null,
    addListener: vi.fn(), removeListener: vi.fn(),
    addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
  }));
}

/** Una marca del teléfono, con lo que la ruta manda de verdad. */
function marca(
  p: Partial<MarcaDeTelefono> & { id: string; codigo: string; ocurrioEn: string },
): MarcaDeTelefono {
  return {
    nombre: "ANA TREJOS",
    tipo: "entrada",
    creadoEn: p.ocurrioEn,
    sinSenal: false,
    horaTelefono: null,
    tieneFoto: true,
    lat: 8.4,
    lng: -82.4,
    precisionM: 12,
    aparatoId: "aaaaaa11bbbb",
    empresaKey: "american_classic",
    // 🔑 El caso REAL de producción: el servicio de mapas antepone el código
    // «G5P6+2GH» porque el punto no cae sobre un negocio con nombre.
    lugar: {
      texto: "G5P6+2GH, Paso Canoas · a 46,4 km",
      nombre: "G5P6+2GH, Paso Canoas",
      metros: 46_400,
      enLaTienda: false,
    },
    ...p,
  };
}

/**
 * 🔴 EL DÍA DE ANA DEL jue 24 sep, tal como lo trae la base: cuatro marcas, dos
 * mandadas sin señal, la entrada con **9 h** de atraso y la salida con **6 min**.
 * Es el renglón del mockup, letra por letra.
 */
const DIA_DE_ANA: MarcaDeTelefono[] = [
  marca({
    id: "1", codigo: "2", ocurrioEn: "2026-09-24T13:59:00.000Z",
    sinSenal: true, creadoEn: "2026-09-24T22:59:00.000Z",
  }),
  marca({ id: "2", codigo: "2", ocurrioEn: "2026-09-24T23:01:00.000Z", tipo: "salida" }),
  marca({ id: "3", codigo: "2", ocurrioEn: "2026-09-24T23:01:30.000Z" }),
  marca({
    id: "4", codigo: "2", ocurrioEn: "2026-09-24T23:01:40.000Z", tipo: "salida",
    sinSenal: true, creadoEn: "2026-09-24T23:07:40.000Z",
  }),
];

/** Y el de Ángel, el día siguiente: una sola marca y nada que contar. */
const DIA_DE_ANGEL: MarcaDeTelefono[] = [
  marca({
    id: "10", codigo: "9", nombre: "ANGEL PIZZA", ocurrioEn: "2026-09-25T13:50:00.000Z",
    lugar: { texto: "San Pablo Viejo · a 4,2 km", nombre: "San Pablo Viejo", metros: 4_200, enLaTienda: false },
  }),
];

function servir(marcas: MarcaDeTelefono[], hayColumnasNuevas = true) {
  const llamadas: Array<{ url: string; metodo: string }> = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    llamadas.push({ url: u, metodo: String(init?.method ?? "GET").toUpperCase() });
    if (u.includes("/api/asistencia/marcaciones")) {
      return { ok: true, status: 200, json: async () => ({ marcas, hayColumnasNuevas }) } as Response;
    }
    return { ok: true, status: 200, json: async () => ({ url: null, lat: null, lng: null }) } as Response;
  }));
  return llamadas;
}

/** Espera a que la lista esté pintada. */
const yaSalio = () => waitFor(() => expect(screen.getAllByText(/Entrada/).length).toBeGreaterThan(0));

/**
 * ⚠️ `ModalOverlay` lee `window.localStorage` (la barra lateral plegada). En
 * este runtime de node no existe, y la hoja de fotos reventaba al abrirse. Se
 * le pone uno mínimo: no es parte de lo que este candado prueba.
 */
function almacenMinimo() {
  if (typeof window === "undefined" || window.localStorage) return;
  const m = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, String(v)),
      removeItem: (k: string) => void m.delete(k),
      clear: () => m.clear(),
      key: () => null,
      length: 0,
    },
  });
}

beforeEach(() => {
  URL_ACTUAL = `desde=${DESDE}&hasta=${HASTA}`;
  aparato(false);
  almacenMinimo();
  try { sessionStorage.clear(); window.localStorage.clear(); } catch { /* modo privado */ }
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

// ═════════════════════════════════════════════════════════════════════════════
// 1 · SIN CHIPS: UN SOLO DESPLEGABLE
// ═════════════════════════════════════════════════════════════════════════════

describe("🔴 1 · sin chips: arriba quedan el período y UN desplegable", () => {
  it("hoy está PRENDIDO (si no, lo de abajo no probaría nada)", () => {
    expect(MARCACIONES_POR_DIA).toBe(true);
    expect(leer(REGLA)).toMatch(/export const MARCACIONES_POR_DIA = true;/);
  });

  it("🩸 un solo `<select>` —el de colaborador— y ni un chip de día o de empresa", async () => {
    servir([...DIA_DE_ANA, ...DIA_DE_ANGEL]);
    render(<MarcacionesTab empresa="todas" />);
    await yaSalio();

    const selects = document.querySelectorAll("select");
    expect(selects).toHaveLength(1);
    expect(screen.getByRole("combobox", { name: "Colaborador" })).toBeTruthy();
    expect(screen.getByText(ROTULO_TODOS)).toBeTruthy();

    // 🩸 Los dos chips que se fueron: «Todos los días» y el de cada persona.
    expect(screen.queryByText("Todos los días")).toBeNull();
    expect(screen.queryByRole("button", { name: "Ana Trejos" })).toBeNull();
    // Y ninguna fila de empresa: eso lo manda el selector del módulo.
    for (const e of ["Boston", "Vistana", "Fashion Wear", "Multifashion"]) {
      expect(`${e}:${screen.queryByRole("button", { name: e }) !== null}`).toBe(`${e}:false`);
    }
  });

  // ⚠️ 29-sep-2026 (28a, aprobado por Daniel): el conteo «5 marcas» / «1 marca
  // de 5» se fue de arriba. El desplegable sigue filtrando; se prueba por lo que
  // se DIBUJA, no por el pie.
  it("el desplegable filtra (y arriba ya no hay conteo)", async () => {
    servir([...DIA_DE_ANA, ...DIA_DE_ANGEL]);
    render(<MarcacionesTab empresa="todas" />);
    await yaSalio();
    expect(screen.queryByText(/\d+ marcas?( de \d+)?$/)).toBeNull();
    expect(screen.getByText("jue 24 sep")).toBeTruthy();

    fireEvent.change(screen.getByRole("combobox", { name: "Colaborador" }), { target: { value: "9" } });
    await waitFor(() => expect(screen.queryByText("jue 24 sep")).toBeNull());
    expect(screen.getByText("vie 25 sep")).toBeTruthy();
    // El día de Ana deja de dibujarse entero: encabezado y fila.
    expect(screen.queryByText("jue 24 sep")).toBeNull();
    expect(screen.queryByRole("cell", { name: /Ana Trejos/ })).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2 · EL DÍA ES EL ENCABEZADO, Y DENTRO UNA FILA POR PERSONA
// ═════════════════════════════════════════════════════════════════════════════

describe("🔴 2 · agrupado por día, una fila por colaborador", () => {
  it("las cuatro marcas se leen como TRES tramos, con el almuerzo junto", () => {
    expect([0, 1, 2, 3].map(tramoDeLaMarca)).toEqual(["entrada", "almuerzo", "almuerzo", "salida"]);
    const cuatro = [
      marca({ id: "a", codigo: "2", ocurrioEn: "2026-09-24T13:59:00.000Z" }),
      marca({ id: "b", codigo: "2", ocurrioEn: "2026-09-24T17:00:00.000Z" }),
      marca({ id: "c", codigo: "2", ocurrioEn: "2026-09-24T18:00:00.000Z" }),
      marca({ id: "d", codigo: "2", ocurrioEn: "2026-09-24T23:01:00.000Z" }),
    ];
    expect(tramosDelDia(cuatro).map((x) => `${x.rotulo} ${x.horas}`)).toEqual([
      "Entrada 08:59", "Almuerzo 12:00 – 13:00", "Salida 18:01",
    ]);
    // ⚠️ 29-sep-2026 (25a, aprobado por Daniel): el día de Ana se leía
    // «Almuerzo 18:01 – 18:01 · Salida 18:01». Sus tres últimas están a 30 y 40 s
    // de la de 18:01:00, y la planilla las olvida: ahora es UNA marca ×3.
    const t = tramosDelDia(DIA_DE_ANA);
    expect(t.map((x) => `${x.rotulo} ${x.horas}`)).toEqual(["Entrada 08:59", "Almuerzo 18:01"]);
    expect(t[1].partes).toEqual([{ hora: "18:01", veces: 3 }]);
  });

  it("🔴 el día más reciente arriba, y dentro por nombre", () => {
    const d = diasDeMarcaciones([...DIA_DE_ANA, ...DIA_DE_ANGEL]);
    expect(d.map((x) => x.dia)).toEqual(["2026-09-25", "2026-09-24"]);
    expect(d[0].rotulo).toBe("vie 25 sep");
    expect(d[1].rotulo).toBe("jue 24 sep");
    expect(d[1].filas).toHaveLength(1);
    expect(d[1].filas[0].nombre).toBe("Ana Trejos");
  });

  it("se dibuja el encabezado del día y la fila entera", async () => {
    servir([...DIA_DE_ANA, ...DIA_DE_ANGEL]);
    render(<MarcacionesTab empresa="todas" />);
    await yaSalio();

    expect(screen.getByText("vie 25 sep")).toBeTruthy();
    expect(screen.getByText("jue 24 sep")).toBeTruthy();
    // 1-oct-2026, Daniel: nombres normales de ERP («["Colaborador", "Sus marcas del día", "Lugar"]» → «["Colaborador", "Marcaciones", "Lugar"]»).
    expect([...COLUMNAS_POR_DIA]).toEqual(["Colaborador", "Marcaciones", "Lugar"]);
    // ⚠️ 29-sep-2026 (26a): cada día tiene UNA fila, su lugar sube a la fecha y
    // la columna «Lugar» no se dibuja. Las otras dos, sí.
    for (const c of COLUMNAS_POR_DIA.slice(0, 2)) {
      expect(screen.getAllByRole("columnheader", { name: c }).length).toBeGreaterThan(0);
    }
    expect(screen.queryByRole("columnheader", { name: "Lugar" })).toBeNull();
    // 🔴 Las horas son las de PANAMÁ (UTC−5 fijo). (25a: las repetidas de las
    // 18:01 se juntan en «18:01 ×3».)
    expect(screen.getByText("08:59")).toBeTruthy();
    expect(screen.getByText("18:01")).toBeTruthy();
    // 🩸 Y la fecha ya NO se busca tocando un chip: sale de encabezado.
    expect(fechaDelDia("2026-09-25")).toBe("vie 25 sep");
  });

  it("🩸 de 37 renglones sueltos a una fila por persona y día", () => {
    // Cinco marcas, dos personas, dos días → DOS renglones, no cinco.
    const d = diasDeMarcaciones([...DIA_DE_ANA, ...DIA_DE_ANGEL]);
    expect(d.reduce((n, x) => n + x.filas.length, 0)).toBe(2);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3 · EL LUGAR, UNA VEZ POR FILA Y EN PALABRAS
// ═════════════════════════════════════════════════════════════════════════════

describe("🔴 3 · el lugar, en palabras y sin el código de mapa", () => {
  it("🩸 «G5P6+2GH, Paso Canoas» se lee «Paso Canoas»", () => {
    expect(sinCodigoDeMapa("G5P6+2GH, Paso Canoas")).toBe("Paso Canoas");
    expect(sinCodigoDeMapa("G5P6+2GH Paso Canoas")).toBe("Paso Canoas");
    // Un nombre de verdad no se toca.
    expect(sinCodigoDeMapa("City Mall David")).toBe("City Mall David");
    // Y un texto que es SOLO el código no se convierte en un lugar inventado.
    expect(sinCodigoDeMapa("G5P6+2GH")).toBe("");
  });

  it("la distancia se dice redondeada, y solo cuando hay contra qué medir", () => {
    expect(distanciaDeLaTienda(46_400)).toBe("46 km de la tienda");
    expect(distanciaDeLaTienda(4_200)).toBe("4 km de la tienda");
    expect(distanciaDeLaTienda(350)).toBe("350 m de la tienda");
    expect(distanciaDeLaTienda(null)).toBeNull();
    expect(distanciaDeLaTienda(0)).toBeNull();
  });

  it("🔴 sin referencia, solo el nombre; sin nombre, «—»", () => {
    expect(lugarEnPalabras({ nombre: "G5P6+2GH, Paso Canoas", metros: 46_400 }))
      .toBe("Paso Canoas · 46 km de la tienda");
    expect(lugarEnPalabras({ nombre: "City Mall David", metros: null })).toBe("City Mall David");
    expect(lugarEnPalabras({ nombre: null, metros: 46_400 })).toBe("46 km de la tienda");
    expect(lugarEnPalabras({ nombre: null, metros: null })).toBe(SIN_LUGAR);
    expect(SIN_LUGAR).toBe("—");
  });

  it("se escribe UNA vez por fila, no una por marca", async () => {
    expect(lugarDeLaFila(DIA_DE_ANA)).toBe("Paso Canoas · 46 km de la tienda");
    servir(DIA_DE_ANA);
    render(<MarcacionesTab empresa="todas" />);
    await yaSalio();
    // Cuatro marcas, UN lugar dibujado.
    // ⚠️ 29-sep-2026 (audit aprobado por Daniel, 17a): el lugar se dibuja en DOS
    // partes —dirección truncable y distancia en gris— y el texto entero queda
    // en el `title`. Se cuenta por el `title`, no por un texto de corrido.
    expect(document.querySelectorAll('[title="Paso Canoas · 46 km de la tienda"]')).toHaveLength(1);
    expect(screen.getAllByText("Paso Canoas")).toHaveLength(1);
    // 🩸 Y el código de mapa no aparece por ningún lado de la lista.
    expect(screen.queryByText(/G5P6\+2GH/)).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4 · EL ATRASO SOLO SI LO HUBO — Y NUNCA «LLEGÓ»
// ═════════════════════════════════════════════════════════════════════════════

describe("🔴 4 · «se envió», nunca «llegó»", () => {
  // ⚠️ 29-sep-2026 (27a, aprobado por Daniel): la línea gris «sin señal: la
  // entrada se envió 9 h después · la salida, 6 min después» salió de la fila.
  // Lo mismo lo dice el punto gris (su `title`) y la hoja. «se envió» sigue.
  it("el punto dice el atraso de SU marca, con «se envió»", () => {
    const t = tramosDelDia(DIA_DE_ANA);
    expect(t[0].aviso).toBe("Sin señal: se envió 9 h después");
    // Varias marcas en el tramo: cada atraso lleva su hora.
    expect(t[1].aviso).toBe("Sin señal: 18:01 se envió 6 min después");
    expect(VERBO_ENVIO).toBe("se envió");
  });

  it("🩸 sin atraso NO se escribe nada — 32 de las 37 medidas llegaron al instante", async () => {
    expect(avisoDelTramo(DIA_DE_ANGEL)).toBeNull();
    servir(DIA_DE_ANGEL);
    render(<MarcacionesTab empresa="todas" />);
    await yaSalio();
    expect(screen.queryByText("al instante")).toBeNull();
    expect(screen.queryByText(/se envió/)).toBeNull();
    expect(document.querySelectorAll("[title^='Sin señal']")).toHaveLength(0);
  });

  it("sin señal y sin atraso, el punto dice solo «Sin señal»", () => {
    const uno = [marca({ id: "77", codigo: "2", ocurrioEn: "2026-09-24T13:59:00.000Z", sinSenal: true })];
    expect(avisoDelTramo(uno)).toBe("Sin señal");
  });

  it("🔴 BARRIDO: la palabra «llegó» no está en la pantalla nueva ni en su regla", () => {
    for (const f of [TAB, REGLA]) {
      const src = leer(f)
        // El barrido mira el CÓDIGO y los textos, no las notas del encabezado,
        // que explican justamente por qué la palabra está prohibida.
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/[^\n]*/g, "");
      expect(`${f}:${/lleg[oó]/i.test(src)}`).toBe(`${f}:false`);
    }
  });

  it("🔑 y el punto gris de «sin señal» no es una pastilla que empuje el renglón", async () => {
    servir(DIA_DE_ANA);
    render(<MarcacionesTab empresa="todas" />);
    await yaSalio();
    expect(screen.getAllByLabelText(/^Sin señal/).length).toBe(2);
    // ⚠️ 29-sep-2026 (27a): «sin señal» ya no es texto en la fila — solo el
    // `title` del punto.
    expect(screen.queryByText(/sin señal/i)).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 5 · SE FUE «APARATO»; QUEDA EL AVISO ROJO
// ═════════════════════════════════════════════════════════════════════════════

describe("🔴 5 · la columna «Aparato» se va, el aviso rojo se queda", () => {
  it("la tabla ya no tiene ni columna «Aparato» ni «Llegó»", async () => {
    servir(DIA_DE_ANA);
    render(<MarcacionesTab empresa="todas" />);
    await yaSalio();
    expect(screen.queryByRole("columnheader", { name: "Aparato" })).toBeNull();
    expect(screen.queryByRole("columnheader", { name: "Llegó" })).toBeNull();
    expect([...COLUMNAS_POR_DIA]).not.toContain("Aparato");
  });

  it("🔴 dos colaboradores con UN teléfono el mismo día: aviso en las dos filas", async () => {
    const compartido: MarcaDeTelefono[] = [
      marca({ id: "20", codigo: "2", nombre: "ANA TREJOS", ocurrioEn: "2026-09-24T13:58:00.000Z", aparatoId: "zzzzzz99yyyy" }),
      marca({ id: "21", codigo: "7", nombre: "CINDY DE GRACIA", ocurrioEn: "2026-09-24T14:00:00.000Z", aparatoId: "zzzzzz99yyyy" }),
    ];
    servir(compartido);
    render(<MarcacionesTab empresa="todas" />);
    await yaSalio();
    expect(screen.getAllByText(AVISO_MISMO_TELEFONO)).toHaveLength(2);
  });

  it("y con un teléfono por persona, ningún aviso", async () => {
    const propios: MarcaDeTelefono[] = [
      marca({ id: "30", codigo: "2", ocurrioEn: "2026-09-24T13:58:00.000Z", aparatoId: "aaaaaa11bbbb" }),
      marca({ id: "31", codigo: "7", nombre: "CINDY DE GRACIA", ocurrioEn: "2026-09-24T14:00:00.000Z", aparatoId: "cccccc22dddd" }),
    ];
    servir(propios);
    render(<MarcacionesTab empresa="todas" />);
    await yaSalio();
    expect(screen.queryByText(AVISO_MISMO_TELEFONO)).toBeNull();
  });

  it("🩸 dos marcas SIN sello no son «el mismo teléfono»", () => {
    const sinSello: MarcaDeTelefono[] = [
      marca({ id: "40", codigo: "2", ocurrioEn: "2026-09-24T13:58:00.000Z", aparatoId: null }),
      marca({ id: "41", codigo: "7", nombre: "CINDY DE GRACIA", ocurrioEn: "2026-09-24T14:00:00.000Z", aparatoId: null }),
    ];
    const d = diasDeMarcaciones(sinSello, marcasDeAparatoCompartido(sinSello));
    expect(d[0].filas.every((f) => !f.mismoTelefono)).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 6 · LA NOTA EN UN ⓘ, Y LA FILA ABRE LAS FOTOS
// ═════════════════════════════════════════════════════════════════════════════

describe("🔴 6 · la nota va a la hoja y la fila abre la hoja del día", () => {
  // ⚠️ 29-sep-2026 (28a, aprobado por Daniel): arriba quedan solo período ·
  // calendario · «Colaborador: todos». El ⓘ se fue; su frase NO se pierde: va
  // al pie de la hoja que abre la fila.
  it("arriba no hay ⓘ; la nota cierra la hoja", async () => {
    servir(DIA_DE_ANA);
    render(<MarcacionesTab empresa="todas" />);
    await yaSalio();
    expect(screen.queryByText("ⓘ")).toBeNull();
    expect(screen.queryByLabelText(NOTA_SOLO_SE_MIRA)).toBeNull();
    fireEvent.click(screen.getByRole("cell", { name: /Ana Trejos/ }));
    await waitFor(() => expect(screen.getByText(NOTA_SOLO_SE_MIRA)).toBeTruthy());
    expect(NOTA_SOLO_SE_MIRA).toContain("Aquí solo se mira");
  });

  it("🔴 tocar la fila abre las fotos y el mapa de ESE día, con sus cuatro marcas", async () => {
    servir(DIA_DE_ANA);
    render(<MarcacionesTab empresa="todas" />);
    await yaSalio();
    fireEvent.click(screen.getByRole("cell", { name: /Ana Trejos/ }));
    await waitFor(() => expect(screen.getByText("Ana Trejos · jue 24 sep")).toBeTruthy());
    // Las cuatro marcas del día, una debajo de la otra.
    expect(screen.getAllByText(/8:59 a\. m\.|6:01 p\. m\./).length).toBeGreaterThan(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 7 · EL CELULAR: LA MISMA AGRUPACIÓN, EN TARJETAS
// ═════════════════════════════════════════════════════════════════════════════

describe("🔴 7 · en el celular, el día manda y no hay cuatro filas de botones", () => {
  it("una tarjeta por colaborador bajo el encabezado del día", async () => {
    aparato(true);
    servir([...DIA_DE_ANA, ...DIA_DE_ANGEL]);
    render(<MarcacionesTab empresa="todas" />);
    await yaSalio();

    expect(screen.getByText("vie 25 sep")).toBeTruthy();
    expect(screen.getByText("jue 24 sep")).toBeTruthy();
    // 🩸 El día ya NO se repite en la esquina de cada tarjeta.
    expect(screen.getAllByText("jue 24 sep")).toHaveLength(1);
    // No hay tabla en el celular: son renglones, que no se arrastran de lado.
    expect(screen.queryByRole("table")).toBeNull();
    // Y un solo desplegable, como en la computadora.
    expect(document.querySelectorAll("select")).toHaveLength(1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 8 · NINGÚN NÚMERO CAMBIA
// ═════════════════════════════════════════════════════════════════════════════

describe("🔑 8 · ningún número se movió", () => {
  it("el atraso sale de la MISMA cuenta que la pantalla de antes", () => {
    const casos: Array<[string, string]> = [
      ["2026-09-24T13:59:00.000Z", "2026-09-24T22:59:00.000Z"],
      ["2026-09-24T23:01:40.000Z", "2026-09-24T23:07:40.000Z"],
      ["2026-09-24T13:59:00.000Z", "2026-09-24T14:00:00.000Z"],
    ];
    for (const [a, b] of casos) {
      const cuanto = cuantoDespues(a, b);
      // Una sola cuenta con dos redacciones: la de antes es la de hoy con verbo.
      expect(demoraEnPalabras(a, b)).toBe(cuanto ? `llegó ${cuanto}` : "al instante");
    }
    expect(cuantoDespues("2026-09-24T13:59:00.000Z", "2026-09-24T22:59:00.000Z")).toBe("9 h después");
    expect(cuantoDespues("2026-09-24T13:59:00.000Z", "2026-09-24T14:00:00.000Z")).toBeNull();
  });

  it("🔴 esta pantalla SOLO mira: ni un POST, PUT, PATCH o DELETE", () => {
    for (const f of [TAB, REGLA]) {
      const src = leer(f);
      expect(src.length).toBeGreaterThan(1000);
      for (const m of ["POST", "PUT", "PATCH", "DELETE"]) {
        expect(`${f}:${src.includes(`method: "${m}"`)}`).toBe(`${f}:false`);
      }
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 9 · EL INTERRUPTOR
// ═════════════════════════════════════════════════════════════════════════════

describe("🔴 9 · con MARCACIONES_POR_DIA apagado vuelve la pantalla de chips", () => {
  it("la pantalla de antes se conserva ENTERA, con sus seis columnas", () => {
    const antes = leer(DE_ANTES);
    expect(antes.length).toBeGreaterThan(5000);
    expect(antes).toContain("COLUMNAS_MARCACIONES");
    expect(antes).toContain("CHIP_TODOS_LOS_DIAS");
    // Y la pestaña la llama cuando el interruptor está apagado.
    expect(leer(TAB)).toContain("if (!MARCACIONES_POR_DIA) return <MarcacionesDeAntes");
  });

  it("apagado, se dibuja la de chips y no el encabezado del día", async () => {
    vi.resetModules();
    vi.doMock("@/lib/asistencia/marcaciones-por-dia", async () => {
      const real = await vi.importActual<typeof import("@/lib/asistencia/marcaciones-por-dia")>(
        "@/lib/asistencia/marcaciones-por-dia",
      );
      return { ...real, MARCACIONES_POR_DIA: false };
    });
    const { default: Tab } = await import("@/app/asistencia/MarcacionesTab");

    servir(DIA_DE_ANA);
    render(<Tab empresa="todas" />);
    await waitFor(() => expect(screen.getByRole("table")).toBeTruthy());
    // Los chips vuelven, y con ellos las seis columnas.
    expect(screen.getByRole("button", { name: "Todos los días" })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Aparato" })).toBeTruthy();

    vi.doUnmock("@/lib/asistencia/marcaciones-por-dia");
    vi.resetModules();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 10 · AUDIT DEL 29-sep-2026 (aprobado por Daniel): 16a · 17a · 4a
// ═════════════════════════════════════════════════════════════════════════════

describe("🔴 10 · 16a — el encabezado UNA vez, pegado bajo el de la app", () => {
  it("con dos días, el encabezado sale UNA vez y cada día solo con su fecha", async () => {
    // ⚠️ 29-sep-2026 (26a): con la columna «Lugar» presente (Ángel el jue en
    // otro sitio que Ana), las tres salen una vez.
    const otroLugar = marca({
      id: "11", codigo: "9", nombre: "ANGEL PIZZA", ocurrioEn: "2026-09-24T13:50:00.000Z",
      lugar: { texto: "x", nombre: "San Pablo Viejo", metros: 4_200, enLaTienda: false },
    });
    servir([...DIA_DE_ANA, ...DIA_DE_ANGEL, otroLugar]);
    render(<MarcacionesTab empresa="todas" />);
    await yaSalio();
    for (const c of COLUMNAS_POR_DIA) {
      expect(`${c}:${screen.getAllByRole("columnheader", { name: c }).length}`).toBe(`${c}:1`);
    }
    // Una sola tabla y UN encabezado.
    expect(screen.getAllByRole("table")).toHaveLength(1);
    expect(document.querySelectorAll("thead")).toHaveLength(1);
    expect(screen.getByText("vie 25 sep")).toBeTruthy();
    expect(screen.getByText("jue 24 sep")).toBeTruthy();
  });

  it("🔑 se pega con la clase de la casa (debajo del encabezado medido), nunca con `sticky top-0`", async () => {
    servir(DIA_DE_ANA);
    render(<MarcacionesTab empresa="todas" />);
    await yaSalio();
    for (const th of screen.getAllByRole("columnheader")) {
      expect(th.className).toContain(CLASE_BARRA_PEGAJOSA);
    }
    const src = leer(TAB);
    expect(src).not.toMatch(/sticky top-0/);
    // Sin la caja de scroll lateral: con ella el encabezado se pega a la caja.
    expect(src).not.toMatch(/<ScrollableTable/);
  });
});

describe("🔴 11 · 17a — el lugar no repite la distancia y no se parte", () => {
  const sinNombre = (metros: number | null) => [
    marca({
      id: "50", codigo: "2", ocurrioEn: "2026-09-24T13:59:00.000Z",
      // 🩸 El caso real: sin dirección guardada, `texto` ES la distancia.
      lugar: { texto: "a 46,4 km", nombre: null, metros, enLaTienda: false },
    }),
  ];

  it("🩸 sin dirección: «46 km de la tienda», no «a 46,4 km · 46 km de la tienda»", () => {
    expect(lugarDeLaFila(sinNombre(46_400))).toBe("46 km de la tienda");
    expect(partesDelLugarDeLaFila(sinNombre(46_400))).toEqual({ nombre: "", distancia: "46 km de la tienda" });
    // Sin nombre ni referencia, «—»: `texto` no se usa de nombre.
    expect(lugarDeLaFila(sinNombre(null))).toBe(SIN_LUGAR);
  });

  it("con dirección: la dirección truncable con su `title` y la distancia aparte, sin partirse", async () => {
    const conCalle = [
      marca({
        id: "60", codigo: "2", ocurrioEn: "2026-09-24T13:59:00.000Z",
        lugar: { texto: "x", nombre: "Calle del Cerro 453-43, David", metros: 780, enLaTienda: false },
      }),
    ];
    expect(partesDelLugarDeLaFila(conCalle)).toEqual({
      nombre: "Calle del Cerro 453-43, David", distancia: "780 m de la tienda",
    });
    servir(conCalle);
    render(<MarcacionesTab empresa="todas" />);
    await yaSalio();
    const calle = screen.getByText("Calle del Cerro 453-43, David");
    expect(calle.className).toContain("truncate");
    expect(calle.parentElement?.getAttribute("title")).toBe("Calle del Cerro 453-43, David · 780 m de la tienda");
    const lejos = screen.getByText("780 m de la tienda");
    expect(lejos.className).toContain("whitespace-nowrap");
    expect(lejos.className).toContain("text-gray-400");
  });
});

describe("🔴 12 · 4a — dos marcas y la 2.ª a su hora de salida se lee SALIDA", () => {
  // Paso Canoas: entrada 08:59, y 18:00 (su salida) como segunda marca.
  const dos = (segunda: string, salidaHorario: string | null = "18:00") => [
    marca({ id: "70", codigo: "2", ocurrioEn: "2026-09-24T13:59:00.000Z", salidaHorario }),
    marca({ id: "71", codigo: "2", ocurrioEn: segunda, tipo: "salida", salidaHorario }),
  ];

  it("🔑 X es el MISMO umbral de «Revisar salida» (120 min), no un número nuevo", () => {
    expect(MINUTOS_ANTES_DE_LA_SALIDA).toBe(SALIDA_SOSPECHOSA_MIN);
    expect(MINUTOS_ANTES_DE_LA_SALIDA).toBe(120);
  });

  it("🩸 «Entrada 08:59 · Almuerzo 18:00» pasa a «Entrada 08:59 · Salida 18:00» + «sin almuerzo marcado»", () => {
    const d = dos("2026-09-24T23:00:00.000Z");
    expect(segundaEsSalida(d)).toBe(true);
    expect(tramosDelDia(d).map((t) => `${t.rotulo} ${t.horas}`)).toEqual(["Entrada 08:59", "Salida 18:00"]);
    expect(avisosDelDia(d)).toEqual([AVISO_SIN_ALMUERZO]);
  });

  it("los bordes: 120 min antes SÍ es salida; 121 min antes, se lee como antes", () => {
    expect(segundaEsSalida(dos("2026-09-24T21:00:00.000Z"))).toBe(true); // 16:00
    expect(segundaEsSalida(dos("2026-09-24T20:59:00.000Z"))).toBe(false); // 15:59
    // Andrea Pérez: 12:07 con salida 17:00 → sigue siendo lo de antes.
    const andrea = dos("2026-09-24T17:07:00.000Z", "17:00");
    expect(tramosDelDia(andrea).map((t) => t.rotulo)).toEqual(["Entrada", "Almuerzo"]);
    expect(avisosDelDia(andrea)).toEqual([]);
  });

  it("⚠️ sin hora de salida configurada NO se adivina: se lee como antes", () => {
    const d = dos("2026-09-24T23:00:00.000Z", null);
    expect(segundaEsSalida(d)).toBe(false);
    expect(tramosDelDia(d).map((t) => t.rotulo)).toEqual(["Entrada", "Almuerzo"]);
  });

  it("con 3 o 4 marcas la regla no aplica", () => {
    expect(segundaEsSalida(DIA_DE_ANA.map((m) => ({ ...m, salidaHorario: "18:00" })))).toBe(false);
  });

  // ⚠️ 29-sep-2026 (25a, aprobado por Daniel): «N marcas en el mismo minuto»
  // se fue: esas marcas ahora se JUNTAN como las cuenta la planilla y lo dice el
  // ×N. Ver el bloque 13.

  it("en pantalla: el aviso ámbar sale en la fila y la hoja dice «Salida»", async () => {
    servir(dos("2026-09-24T23:00:00.000Z"));
    render(<MarcacionesTab empresa="todas" />);
    await yaSalio();
    const aviso = screen.getByText(AVISO_SIN_ALMUERZO);
    expect(aviso.className).toContain("amber");
    expect(screen.queryByText(/Almuerzo/)).toBeNull();
    fireEvent.click(screen.getByRole("cell", { name: /Ana Trejos/ }));
    await waitFor(() => expect(screen.getByText("Ana Trejos · jue 24 sep")).toBeTruthy());
    expect(screen.queryByText(/Salida a almuerzo/)).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 13 · 25a (29-sep-2026, aprobado por Daniel): las repetidas se juntan COMO LAS
// CUENTA LA PLANILLA — «Entrada 09:00 · Salida 18:00 ×3»
// ═════════════════════════════════════════════════════════════════════════════

describe("🔴 13 · 25a — las marcas repetidas se juntan con la regla de la planilla", () => {
  // El caso del mockup: el dedo tocó tres veces al irse.
  const triple = [
    marca({ id: "80", codigo: "2", ocurrioEn: "2026-09-24T14:00:00.000Z", salidaHorario: "18:00" }),
    marca({ id: "81", codigo: "2", ocurrioEn: "2026-09-24T23:00:05.000Z", salidaHorario: "18:00" }),
    marca({ id: "82", codigo: "2", ocurrioEn: "2026-09-24T23:00:20.000Z", salidaHorario: "18:00" }),
    marca({ id: "83", codigo: "2", ocurrioEn: "2026-09-24T23:00:40.000Z", salidaHorario: "18:00" }),
  ];

  it("🩸 «Almuerzo 18:00 – 18:00 · Salida 18:00» pasa a «Salida 18:00 ×3»", () => {
    const t = tramosDelDia(triple);
    expect(t.map((x) => `${x.rotulo} ${x.partes.map((p) => p.hora + (p.veces > 1 ? ` ×${p.veces}` : "")).join(" – ")}`))
      .toEqual(["Entrada 09:00", "Salida 18:00 ×3"]);
    // Dos marcas que cuentan y la 2.ª a su hora de salida: la regla 4a sigue.
    expect(avisosDelDia(triple)).toEqual([AVISO_SIN_ALMUERZO]);
  });

  it("🔑 el umbral es el de la planilla: 60 s EXACTOS se juntan, 61 no", () => {
    expect(SEGUNDOS_MARCA_REPETIDA).toBe(60);
    const par = (seg: number) => [
      marca({ id: "p1", codigo: "2", ocurrioEn: "2026-09-24T23:00:00.000Z" }),
      marca({ id: "p2", codigo: "2", ocurrioEn: new Date(Date.parse("2026-09-24T23:00:00.000Z") + seg * 1000).toISOString() }),
    ];
    expect(juntarRepetidas(par(60)).veces).toEqual([2]);
    expect(juntarRepetidas(par(61)).veces).toEqual([1, 1]);
    // Contra la última que CUENTA: 0 · 50 · 100 s deja dos, no una.
    const tres = [0, 50, 100].map((s, i) => marca({
      id: `t${i}`, codigo: "2", ocurrioEn: new Date(Date.parse("2026-09-24T23:00:00.000Z") + s * 1000).toISOString(),
    }));
    expect(juntarRepetidas(tres).veces).toEqual([2, 1]);
  });

  it("🔴 la regla NO se copia: la regla de la pantalla le pregunta a `marca-repetida.ts`", () => {
    const src = leer(REGLA);
    expect(src).toMatch(/import \{[^}]*olvidarRepetidas[^}]*\} from "@\/lib\/asistencia\/marca-repetida"/);
    // Y se le pregunta con SU umbral: sin un segundo número pasado a mano.
    expect(src).toMatch(/olvidarRepetidas\([^,)]*\)/);
    expect(src).not.toMatch(/olvidarRepetidas\([^)]*,/);
  });

  it("en pantalla: «×3» en gris y ya no hay aviso «mismo minuto»", async () => {
    servir(triple);
    render(<MarcacionesTab empresa="todas" />);
    await yaSalio();
    const x3 = screen.getByText("×3");
    expect(x3.className).toContain("text-gray-400");
    expect(screen.queryByText(/mismo minuto/)).toBeNull();
    expect(screen.queryByText(/Almuerzo/)).toBeNull();
  });

  it("🔴 la hoja trae las CUATRO marcas crudas; la repetida dice su porqué como el reporte", async () => {
    expect(marcasDeLaHoja(triple)).toEqual([
      { indice: 0, repetida: null },
      { indice: 3, repetida: null },
      { indice: 3, repetida: "repetida, 15 s después de 18:00:05 — no cuenta" },
      { indice: 3, repetida: "repetida, 35 s después de 18:00:05 — no cuenta" },
    ]);
    servir(triple);
    render(<MarcacionesTab empresa="todas" />);
    await yaSalio();
    fireEvent.click(screen.getByRole("cell", { name: /Ana Trejos/ }));
    await waitFor(() => expect(screen.getByText("Ana Trejos · jue 24 sep")).toBeTruthy());
    expect(screen.getAllByText(/^Salida /)).toHaveLength(3);
    expect(screen.getByText("repetida, 35 s después de 18:00:05 — no cuenta")).toBeTruthy();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 14 · 26a (29-sep-2026, aprobado por Daniel): el lugar solo cuando cambia
// ═════════════════════════════════════════════════════════════════════════════

describe("🔴 14 · 26a — el lugar va UNA vez al lado de la fecha y la fila solo si difiere", () => {
  const en = (id: string, codigo: string, nombre: string | null, metros: number | null, quien = "ANA TREJOS") =>
    marca({
      id, codigo, nombre: quien, ocurrioEn: "2026-09-24T13:59:00.000Z",
      lugar: { texto: "x", nombre, metros, enLaTienda: false },
    });

  it("🔑 «mismo lugar» = lo que se LEE: nombre sin código de mapa y distancia redondeada", () => {
    const k = (n: string | null, m: number | null) => claveDelLugar({
      nombre: sinCodigoDeMapa(n), distancia: distanciaDeLaTienda(m),
    });
    expect(k("G5P6+2GH, Paso Canoas", 46_200)).toBe(k("paso  canoas", 46_400));
    expect(k("Paso Canoas", 46_400)).not.toBe(k("Paso Canoas", 12_000));
    expect(k(null, null)).toBe("");
  });

  it("el lugar del día: el que más filas comparten (≥ 2, sin empate), o el de la única fila", () => {
    expect(lugarDelDia(["a"])).toBe("a");
    expect(lugarDelDia(["a", "a", "b"])).toBe("a");
    expect(lugarDelDia(["a", "b"])).toBe(""); // empate
    expect(lugarDelDia(["a", ""])).toBe(""); // una sola fila con lugar de dos
    expect(lugarDelDia(["", ""])).toBe("");
  });

  it("todas desde el mismo lugar: va en la fecha y la columna «Lugar» desaparece", async () => {
    const dia = [en("1", "2", "Paso Canoas", 46_400), en("2", "7", "Paso Canoas", 46_200, "CINDY DE GRACIA")];
    const d = diasDeMarcaciones(dia);
    expect(d[0].lugar?.texto).toBe("Paso Canoas · 46 km de la tienda");
    expect(d[0].filas.every((f) => !f.lugarEnLaFila)).toBe(true);
    expect(hayColumnaLugar(d)).toBe(false);

    servir(dia);
    render(<MarcacionesTab empresa="todas" />);
    await yaSalio();
    expect(screen.getAllByText("Paso Canoas")).toHaveLength(1);
    expect(screen.queryByRole("columnheader", { name: "Lugar" })).toBeNull();
  });

  it("🔴 una fila que difiere escribe SU lugar; las demás no lo repiten", async () => {
    const dia = [
      en("1", "2", "Paso Canoas", 46_400),
      en("2", "7", "Paso Canoas", 46_400, "CINDY DE GRACIA"),
      en("3", "9", "San Pablo Viejo", 4_200, "ANGEL PIZZA"),
    ];
    const d = diasDeMarcaciones(dia);
    expect(d[0].lugar?.nombre).toBe("Paso Canoas");
    expect(d[0].filas.map((f) => `${f.nombre}:${f.lugarEnLaFila}`)).toEqual([
      "Ana Trejos:false", "Angel Pizza:true", "Cindy de Gracia:false",
    ]);

    servir(dia);
    render(<MarcacionesTab empresa="todas" />);
    await yaSalio();
    expect(screen.getByRole("columnheader", { name: "Lugar" })).toBeTruthy();
    expect(screen.getAllByText("Paso Canoas")).toHaveLength(1);
    expect(screen.getAllByText("San Pablo Viejo")).toHaveLength(1);
  });

  it("⚠️ una fila SIN lugar en un día que sí tiene uno dice «—» (callarse diría que estuvo ahí)", () => {
    const d = diasDeMarcaciones([
      en("1", "2", "Paso Canoas", 46_400),
      en("2", "7", "Paso Canoas", 46_400, "CINDY DE GRACIA"),
      en("3", "9", null, null, "ANGEL PIZZA"),
    ]);
    const angel = d[0].filas.find((f) => f.codigo === "9")!;
    expect(angel.lugarEnLaFila).toBe(true);
    expect(angel.lugar).toBe(SIN_LUGAR);
  });

  it("🔴 ninguna fila del período con lugar (el reloj): no hay columna ni nada al lado de la fecha", async () => {
    const reloj = [en("1", "2", null, null), en("2", "7", null, null, "CINDY DE GRACIA")];
    const d = diasDeMarcaciones(reloj);
    expect(d[0].lugar).toBeNull();
    expect(hayColumnaLugar(d)).toBe(false);
    servir(reloj);
    render(<MarcacionesTab empresa="todas" />);
    await yaSalio();
    expect(screen.queryByRole("columnheader", { name: "Lugar" })).toBeNull();
    expect(screen.queryByText(SIN_LUGAR)).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 15 · 27a (29-sep-2026, aprobado por Daniel): cada fila = un renglón
// ═════════════════════════════════════════════════════════════════════════════

describe("🔴 15 · 27a — la línea gris sale de la fila; queda el punto y la hoja", () => {
  it("la fila no lleva línea de atraso; el punto lo dice en su `title`", async () => {
    servir(DIA_DE_ANA);
    render(<MarcacionesTab empresa="todas" />);
    await yaSalio();
    expect(screen.queryByText(/se envió/)).toBeNull();
    const punto = document.querySelector("[title='Sin señal: se envió 9 h después']");
    expect(punto).toBeTruthy();
    // Un renglón: la celda de marcas no tiene un bloque debajo.
    const celda = screen.getAllByRole("cell").find((c) => c.textContent?.includes("Entrada"))!;
    expect(celda.querySelectorAll("div")).toHaveLength(0);
  });

  it("🔴 el detalle vive en la hoja, con «se envió» y nunca «llegó»", async () => {
    expect(detalleEnLaHoja(DIA_DE_ANA[0])).toBe("Marcada sin señal · se envió 9 h después");
    expect(detalleEnLaHoja(DIA_DE_ANGEL[0])).toBe("Marcada con señal · al instante");
    servir(DIA_DE_ANA);
    render(<MarcacionesTab empresa="todas" />);
    await yaSalio();
    fireEvent.click(screen.getByRole("cell", { name: /Ana Trejos/ }));
    await waitFor(() => expect(screen.getByText("Marcada sin señal · se envió 9 h después")).toBeTruthy());
    expect(screen.queryByText(/lleg[oó]/)).toBeNull();
  });
});

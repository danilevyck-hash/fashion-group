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
  ARTICULO_TRAMO, AVISO_MISMO_TELEFONO, COLUMNAS_POR_DIA, MARCACIONES_POR_DIA,
  NOTA_SOLO_SE_MIRA, ROTULO_TODOS, VERBO_ENVIO, detalleDelDia, diasDeMarcaciones,
  distanciaDeLaTienda, fechaDelDia, frasesDeEnvio, lugarDeLaFila, lugarEnPalabras,
  sinCodigoDeMapa, tramoDeLaMarca, tramosDelDia,
} from "@/lib/asistencia/marcaciones-por-dia";
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

  it("el desplegable filtra, y el pie sigue a lo que se ve", async () => {
    servir([...DIA_DE_ANA, ...DIA_DE_ANGEL]);
    render(<MarcacionesTab empresa="todas" />);
    await yaSalio();
    expect(screen.getByText("5 marcas")).toBeTruthy();

    fireEvent.change(screen.getByRole("combobox", { name: "Colaborador" }), { target: { value: "9" } });
    await waitFor(() => expect(screen.getByText("1 marca de 5")).toBeTruthy());
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
    const t = tramosDelDia(DIA_DE_ANA);
    expect(t.map((x) => `${x.rotulo} ${x.horas}`)).toEqual([
      "Entrada 08:59", "Almuerzo 18:01 – 18:01", "Salida 18:01",
    ]);
  });

  it("🔴 el día más reciente arriba, y dentro por nombre", () => {
    const d = diasDeMarcaciones([...DIA_DE_ANA, ...DIA_DE_ANGEL]);
    expect(d.map((x) => x.dia)).toEqual(["2026-09-25", "2026-09-24"]);
    expect(d[0].rotulo).toBe("vie 25 sep");
    expect(d[1].rotulo).toBe("jue 24 sep");
    expect(d[1].filas).toHaveLength(1);
    expect(d[1].filas[0].nombre).toBe("Ana Trejos");
  });

  it("se dibuja el encabezado del día y la fila entera, con TRES columnas", async () => {
    servir([...DIA_DE_ANA, ...DIA_DE_ANGEL]);
    render(<MarcacionesTab empresa="todas" />);
    await yaSalio();

    expect(screen.getByText("vie 25 sep")).toBeTruthy();
    expect(screen.getByText("jue 24 sep")).toBeTruthy();
    expect([...COLUMNAS_POR_DIA]).toEqual(["Colaborador", "Sus marcas del día", "Lugar"]);
    for (const c of COLUMNAS_POR_DIA) {
      expect(screen.getAllByRole("columnheader", { name: c }).length).toBeGreaterThan(0);
    }
    // 🔴 Las horas son las de PANAMÁ (UTC−5 fijo) y el almuerzo va de corrido.
    expect(screen.getByText("08:59")).toBeTruthy();
    expect(screen.getByText("18:01 – 18:01")).toBeTruthy();
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
    expect(screen.getAllByText("Paso Canoas · 46 km de la tienda")).toHaveLength(1);
    // 🩸 Y el código de mapa no aparece por ningún lado de la lista.
    expect(screen.queryByText(/G5P6\+2GH/)).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4 · EL ATRASO SOLO SI LO HUBO — Y NUNCA «LLEGÓ»
// ═════════════════════════════════════════════════════════════════════════════

describe("🔴 4 · «se envió», nunca «llegó»", () => {
  it("la frase del mockup, letra por letra", () => {
    expect(detalleDelDia(DIA_DE_ANA)).toBe(
      "sin señal: la entrada se envió 9 h después · la salida, 6 min después",
    );
    expect(VERBO_ENVIO).toBe("se envió");
    expect(ARTICULO_TRAMO.entrada).toBe("la entrada");
  });

  it("🔴 el verbo se escribe UNA vez; el resto va con coma", () => {
    expect(frasesDeEnvio([
      { articulo: "la entrada", cuanto: "9 h después" },
      { articulo: "la salida", cuanto: "6 min después" },
    ])).toBe("la entrada se envió 9 h después · la salida, 6 min después");
  });

  it("🩸 sin atraso NO se escribe nada — 32 de las 37 medidas llegaron al instante", async () => {
    expect(detalleDelDia(DIA_DE_ANGEL)).toBeNull();
    servir(DIA_DE_ANGEL);
    render(<MarcacionesTab empresa="todas" />);
    await yaSalio();
    expect(screen.queryByText("al instante")).toBeNull();
    expect(screen.queryByText(/se envió/)).toBeNull();
  });

  it("sin señal y sin atraso, la línea dice solo «sin señal»", () => {
    const uno = [marca({ id: "77", codigo: "2", ocurrioEn: "2026-09-24T13:59:00.000Z", sinSenal: true })];
    expect(detalleDelDia(uno)).toBe("sin señal");
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
    expect(screen.getAllByLabelText("sin señal").length).toBe(2);
    // El texto «sin señal» solo vive en la línea gris de abajo, no en un chip.
    expect(screen.getAllByText(/^sin señal:/)).toHaveLength(1);
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

describe("🔴 6 · la nota pasa a un ⓘ y la fila abre la hoja del día", () => {
  it("la nota del pie no gasta un renglón: va en el título del ⓘ", async () => {
    servir(DIA_DE_ANA);
    render(<MarcacionesTab empresa="todas" />);
    await yaSalio();
    const info = screen.getByLabelText(NOTA_SOLO_SE_MIRA);
    expect(info.textContent).toBe("ⓘ");
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

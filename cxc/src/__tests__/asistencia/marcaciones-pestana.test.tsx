/**
 * ─────────────────────────────────────────────────────────────────────────────
 * 🔴 LA PESTAÑA «MARCACIONES», EN LA PANTALLA (25-sep-2026)
 *
 * Lo que este candado exige, y por qué cada cosa:
 *
 *   1. LA VE `admin` Y NADIE MÁS — ni en la barra ni escribiendo `?tab=`.
 *      Cada marca trae una selfie y una ubicación: dónde estuvo una persona y
 *      qué cara tenía. Esconder la pestaña no cerraría nada, así que la lista
 *      de roles es UNA y la leen la pantalla y la ruta.
 *   2. EN EL CELULAR, UNA TARJETA POR COLABORADOR Y POR DÍA, con el LUGAR
 *      escrito una sola vez cuando todas las marcas cayeron en el mismo sitio
 *      —y repetido cuando no, que es el día que hay que mirar—.
 *   3. EN LA COMPUTADORA, LAS SEIS COLUMNAS, con «—» en Aparato cuando la marca
 *      no trae sello y «al instante» cuando llegó sin demora.
 *   4. CON `MARCACIONES_PESTANA` APAGADO LA PESTAÑA NO EXISTE, ni por la URL, y
 *      Asistencia vuelve a tener exactamente las pestañas de antes.
 *   5. DESDE AQUÍ NO SALE UNA SOLA ESCRITURA: barrido sobre los archivos de la
 *      pestaña que prohíbe POST, PUT, PATCH y DELETE.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { ToastProvider } from "@/components/ToastSystem";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  CLAVE_MARCACIONES, MARCACIONES_PESTANA, MARCACIONES_ROLES, ROTULO_MARCACIONES,
  demoraEnPalabras, vePestanaMarcaciones,
} from "@/lib/asistencia/marcaciones-pestana";
import { pestanasDeAsistencia } from "@/lib/asistencia/persona-en-el-centro";
import { vePestana } from "@/lib/asistencia/roles";
import {
  CHIP_MISMO_APARATO, COLUMNAS_MARCACIONES, SIN_APARATO, lugarComunDelDia,
  marcasDeAparatoCompartido, selloCorto, tarjetasDeMarcaciones,
  type MarcaDeTelefono,
} from "@/app/asistencia/marcaciones/logica";

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
import AsistenciaClient from "@/app/asistencia/AsistenciaClient";

const RAIZ = process.cwd();
const leer = (p: string) => readFileSync(resolve(RAIZ, p), "utf8");

const TAB = "src/app/asistencia/MarcacionesTab.tsx";
const LOGICA = "src/app/asistencia/marcaciones/logica.ts";

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
function marca(p: Partial<MarcaDeTelefono> & { id: string; codigo: string; ocurrioEn: string }): MarcaDeTelefono {
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
    lugar: { texto: "City Mall David", metros: 20, enLaTienda: true },
    ...p,
  };
}

/** El día de Ana: cuatro marcas, todas en el mismo lugar. */
const MISMO_LUGAR: MarcaDeTelefono[] = [
  marca({ id: "1", codigo: "2", ocurrioEn: "2026-09-24T13:17:00.000Z" }),
  marca({ id: "2", codigo: "2", ocurrioEn: "2026-09-24T17:00:00.000Z", tipo: "salida" }),
  marca({ id: "3", codigo: "2", ocurrioEn: "2026-09-24T18:00:00.000Z" }),
  marca({ id: "4", codigo: "2", ocurrioEn: "2026-09-24T22:30:00.000Z", tipo: "salida" }),
];

/** El día de Ángel: la vuelta cayó en otro lado. */
const LUGARES_DISTINTOS: MarcaDeTelefono[] = [
  marca({
    id: "10", codigo: "9", nombre: "ANGEL PEREZ", ocurrioEn: "2026-09-23T13:05:00.000Z",
    lugar: { texto: "City Mall David", metros: 15, enLaTienda: true },
  }),
  marca({
    id: "11", codigo: "9", nombre: "ANGEL PEREZ", ocurrioEn: "2026-09-23T23:05:00.000Z", tipo: "salida",
    lugar: { texto: "Vía Interamericana, David · a 46,7 km", metros: 46_700, enLaTienda: false },
    // 🔴 Y llegó nueve horas tarde: es el caso real de producción.
    creadoEn: "2026-09-24T08:05:00.000Z",
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
    if (u.includes("/api/asistencia/marcacion-foto")) {
      return { ok: true, status: 200, json: async () => ({ url: null, lat: null, lng: null }) } as Response;
    }
    return {
      ok: true, status: 200,
      json: async () => ({
        empresas: null, personas: [], fichas: [], relojes: [], motivos: [],
        justificaciones: [], aprobaciones: [], resumen: {}, sinHorario: 0,
      }),
    } as Response;
  }));
  return llamadas;
}

beforeEach(() => {
  URL_ACTUAL = `desde=${DESDE}&hasta=${HASTA}`;
  aparato(false);
  try { sessionStorage.clear(); localStorage.clear(); } catch { /* modo privado */ }
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

// ═════════════════════════════════════════════════════════════════════════════
// 1 · QUIÉN LA VE
// ═════════════════════════════════════════════════════════════════════════════

const OTROS_ROLES = ["secretaria", "contabilidad", "gerente_boston", "bodega", "vendedor"] as const;

describe("🔴 la pestaña Marcaciones es de `admin` y de nadie más", () => {
  it("`vePestana` la abre para admin y la cierra para los otros cinco roles", () => {
    expect(vePestana("admin", CLAVE_MARCACIONES)).toBe(true);
    for (const rol of OTROS_ROLES) {
      expect(`${rol}:${vePestana(rol, CLAVE_MARCACIONES)}`).toBe(`${rol}:false`);
    }
  });

  it("la lista de roles es UNA, y la pantalla no escribe otra", () => {
    expect([...MARCACIONES_ROLES]).toEqual(["admin"]);
    // 🔑 `roles.ts` se lo pregunta al módulo puro; no repite la lista.
    const roles = leer("src/lib/asistencia/roles.ts");
    expect(roles).toContain("vePestanaMarcaciones");
    expect(vePestanaMarcaciones("admin")).toBe(true);
    expect(vePestanaMarcaciones("secretaria")).toBe(false);
  });

  it("va al FINAL: el aterrizaje de nadie se mueve", () => {
    for (const personaEnElCentro of [true, false]) {
      const claves = pestanasDeAsistencia({ personaEnElCentro, planillaUnida: true }).map(([k]) => k);
      expect(claves[claves.length - 1]).toBe(CLAVE_MARCACIONES);
      expect(claves[0]).not.toBe(CLAVE_MARCACIONES);
    }
  });

  it("se DIBUJA para admin y NO para secretaria", async () => {
    servir([]);
    sessionStorage.setItem("cxc_role", "admin");
    render(<ToastProvider><AsistenciaClient /></ToastProvider>);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: ROTULO_MARCACIONES })).toBeTruthy();
    });

    cleanup();
    servir([]);
    sessionStorage.setItem("cxc_role", "secretaria");
    render(<ToastProvider><AsistenciaClient /></ToastProvider>);
    // La barra ya está pintada: si la pestaña saliera, saldría aquí.
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Planilla" })).toBeTruthy();
    });
    expect(screen.queryByRole("button", { name: ROTULO_MARCACIONES })).toBeNull();
  });

  it("`?tab=marcaciones` con un rol que NO es admin no la abre", async () => {
    URL_ACTUAL = `tab=${CLAVE_MARCACIONES}&desde=${DESDE}&hasta=${HASTA}`;
    const llamadas = servir(MISMO_LUGAR);
    sessionStorage.setItem("cxc_role", "secretaria");
    render(<ToastProvider><AsistenciaClient /></ToastProvider>);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Planilla" })).toBeTruthy();
    });
    expect(screen.queryByRole("button", { name: ROTULO_MARCACIONES })).toBeNull();
    // Y lo que de verdad importa: no se le pidió una sola marca al servidor.
    expect(llamadas.some((l) => l.url.includes("/api/asistencia/marcaciones"))).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2 · EL CELULAR: UNA TARJETA POR COLABORADOR Y POR DÍA
// ═════════════════════════════════════════════════════════════════════════════

describe("🔴 en el celular, una tarjeta por colaborador y por día", () => {
  it("agrupa por (colaborador, día) y rotula las marcas por su ORDEN", () => {
    const t = tarjetasDeMarcaciones(MISMO_LUGAR);
    expect(t).toHaveLength(1);
    expect(t[0].marcas.map((m) => m.rotulo)).toEqual([
      "Entrada", "Salida a almuerzo", "Vuelta de almuerzo", "Salida",
    ]);
  });

  it("🔴 el LUGAR se escribe UNA sola vez cuando todas coinciden", async () => {
    aparato(true);
    servir(MISMO_LUGAR);
    render(<MarcacionesTab empresa="todas" />);
    await waitFor(() => expect(screen.getAllByText("Entrada").length).toBeGreaterThan(0));
    expect(lugarComunDelDia(MISMO_LUGAR)).toBe("City Mall David");
    expect(screen.getAllByText("City Mall David")).toHaveLength(1);
  });

  it("🔴 y se REPITE cuando una marca cayó en otro lado", async () => {
    aparato(true);
    servir(LUGARES_DISTINTOS);
    render(<MarcacionesTab empresa="todas" />);
    await waitFor(() => expect(screen.getAllByText("Entrada").length).toBeGreaterThan(0));
    expect(lugarComunDelDia(LUGARES_DISTINTOS)).toBeNull();
    // Cada marca dice el suyo: dos lugares distintos, uno por renglón.
    expect(screen.getAllByText("City Mall David")).toHaveLength(1);
    expect(screen.getAllByText(/Vía Interamericana, David/)).toHaveLength(1);
  });

  it("el chip gris de demora sale SOLO en la marca que llegó tarde", async () => {
    aparato(true);
    servir(LUGARES_DISTINTOS);
    render(<MarcacionesTab empresa="todas" />);
    await waitFor(() => expect(screen.getAllByText("Entrada").length).toBeGreaterThan(0));
    expect(screen.getAllByText("llegó 9 h después")).toHaveLength(1);
    // La otra llegó al instante, y de eso no se dice nada en la tarjeta.
    expect(screen.queryByText("al instante")).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3 · LA COMPUTADORA: SEIS COLUMNAS
// ═════════════════════════════════════════════════════════════════════════════

describe("🔴 en la computadora, las seis columnas", () => {
  it("son exactamente estas, en este orden", () => {
    expect([...COLUMNAS_MARCACIONES]).toEqual([
      "Hora", "Colaborador", "Marca", "Lugar", "Llegó", "Aparato",
    ]);
  });

  it("se dibujan las seis, con la hora de PANAMÁ", async () => {
    servir(MISMO_LUGAR);
    render(<MarcacionesTab empresa="todas" />);
    await waitFor(() => expect(screen.getByRole("table")).toBeTruthy());
    for (const c of COLUMNAS_MARCACIONES) {
      expect(screen.getByRole("columnheader", { name: c })).toBeTruthy();
    }
    // 13:17 UTC es 08:17 en Panamá (UTC−5 fijo), no las 13:17 ni las 09:17.
    expect(screen.getByText("08:17")).toBeTruthy();
    // 🔑 Y cada fila trae SEIS celdas: sacar una columna del cuerpo —aunque el
    // encabezado siga— deja la tabla corrida y este caso lo dice.
    for (const fila of screen.getAllByRole("row").slice(1)) {
      expect(fila.querySelectorAll("td")).toHaveLength(COLUMNAS_MARCACIONES.length);
    }
    // 🔴 La columna «Marca» dice qué marca es, por su ORDEN en el día — no
    // «entrada / salida / entrada / salida», que es lo único que guarda la base.
    for (const rotulo of ["Entrada", "Salida a almuerzo", "Vuelta de almuerzo", "Salida"]) {
      expect(screen.getAllByRole("cell", { name: rotulo })).toHaveLength(1);
    }
  });

  it("🔴 «—» en Aparato cuando la marca no trae sello", async () => {
    servir([marca({ id: "99", codigo: "2", ocurrioEn: "2026-09-24T13:17:00.000Z", aparatoId: null })]);
    render(<MarcacionesTab empresa="todas" />);
    await waitFor(() => expect(screen.getByRole("table")).toBeTruthy());
    expect(selloCorto(null)).toBe(SIN_APARATO);
    expect(screen.getAllByText(SIN_APARATO).length).toBeGreaterThan(0);
  });

  it("🔴 «al instante» cuando la demora es menor a 2 minutos", async () => {
    expect(demoraEnPalabras("2026-09-24T13:17:00.000Z", "2026-09-24T13:18:00.000Z")).toBe("al instante");
    servir(MISMO_LUGAR);
    render(<MarcacionesTab empresa="todas" />);
    await waitFor(() => expect(screen.getByRole("table")).toBeTruthy());
    expect(screen.getAllByText("al instante")).toHaveLength(MISMO_LUGAR.length);
  });

  // 🔴 DOS PERSONAS, UN SOLO TELÉFONO: es justo lo que Daniel quiere ver.
  it("🔴 el mismo aparato en dos colaboradores del mismo día se marca con un chip", async () => {
    const compartido: MarcaDeTelefono[] = [
      marca({ id: "20", codigo: "2", nombre: "ANA TREJOS", ocurrioEn: "2026-09-24T13:58:00.000Z", aparatoId: "zzzzzz99yyyy" }),
      marca({ id: "21", codigo: "7", nombre: "CINDY DE GRACIA", ocurrioEn: "2026-09-24T14:00:00.000Z", aparatoId: "zzzzzz99yyyy" }),
    ];
    servir(compartido);
    render(<MarcacionesTab empresa="todas" />);
    await waitFor(() => expect(screen.getByRole("table")).toBeTruthy());
    expect(screen.getAllByText(CHIP_MISMO_APARATO)).toHaveLength(2);
  });

  it("y con un teléfono por persona, ningún chip", async () => {
    const propios: MarcaDeTelefono[] = [
      marca({ id: "30", codigo: "2", ocurrioEn: "2026-09-24T13:58:00.000Z", aparatoId: "aaaaaa11bbbb" }),
      marca({ id: "31", codigo: "7", nombre: "CINDY DE GRACIA", ocurrioEn: "2026-09-24T14:00:00.000Z", aparatoId: "cccccc22dddd" }),
    ];
    servir(propios);
    render(<MarcacionesTab empresa="todas" />);
    await waitFor(() => expect(screen.getByRole("table")).toBeTruthy());
    expect(screen.queryByText(CHIP_MISMO_APARATO)).toBeNull();
  });

  // 🔴 SIN SELLO NO SE ACUSA A NADIE: `null` nunca es igual a `null`. Sin esto,
  // las 8.175 marcas viejas saldrían todas «del mismo teléfono».
  it("🩸 dos marcas SIN sello no son «el mismo teléfono»", async () => {
    const sinSello: MarcaDeTelefono[] = [
      marca({ id: "40", codigo: "2", ocurrioEn: "2026-09-24T13:58:00.000Z", aparatoId: null }),
      marca({ id: "41", codigo: "7", nombre: "CINDY DE GRACIA", ocurrioEn: "2026-09-24T14:00:00.000Z", aparatoId: null }),
    ];
    expect(marcasDeAparatoCompartido(sinSello).size).toBe(0);
    servir(sinSello);
    render(<MarcacionesTab empresa="todas" />);
    await waitFor(() => expect(screen.getByRole("table")).toBeTruthy());
    expect(screen.queryByText(CHIP_MISMO_APARATO)).toBeNull();
  });

  it("el sello se ve corto y reconocible, nunca entero", () => {
    expect(selloCorto("aaaaaa11bbbb")).toBe("aaaaaa");
    expect(selloCorto("corto")).toBe(SIN_APARATO); // no es un sello válido
  });

  it("el pie sigue al filtro, con la regla común de la casa", async () => {
    servir([...MISMO_LUGAR, ...LUGARES_DISTINTOS]);
    render(<MarcacionesTab empresa="todas" />);
    await waitFor(() => expect(screen.getByRole("table")).toBeTruthy());
    expect(screen.getByText("6 marcas")).toBeTruthy();
    // 🔑 El pie se importa, no se vuelve a escribir.
    expect(leer(TAB)).toContain('from "@/lib/ui/pie-de-lista"');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4 · EL INTERRUPTOR
// ═════════════════════════════════════════════════════════════════════════════

describe("🔴 con MARCACIONES_PESTANA apagado, la pestaña no existe", () => {
  it("hoy está prendido (si no, lo de abajo no probaría nada)", () => {
    expect(MARCACIONES_PESTANA).toBe(true);
  });

  it("apagado: ni en la lista, ni por la URL, y Asistencia vuelve a lo de antes", async () => {
    vi.resetModules();
    vi.doMock("@/lib/asistencia/marcaciones-pestana", async () => {
      const real = await vi.importActual<typeof import("@/lib/asistencia/marcaciones-pestana")>(
        "@/lib/asistencia/marcaciones-pestana",
      );
      return {
        ...real,
        MARCACIONES_PESTANA: false,
        vePestanaMarcaciones: () => false,
      };
    });

    const { pestanasDeAsistencia: pest } = await import("@/lib/asistencia/persona-en-el-centro");
    const { vePestana: ve } = await import("@/lib/asistencia/roles");

    for (const personaEnElCentro of [true, false]) {
      const claves = pest({ personaEnElCentro, planillaUnida: true }).map(([k]) => k);
      expect(`${personaEnElCentro}:${claves.includes(CLAVE_MARCACIONES)}`).toBe(`${personaEnElCentro}:false`);
    }
    // Y ni escribiendo la dirección: ni siquiera `admin` la ve.
    expect(ve("admin", CLAVE_MARCACIONES)).toBe(false);

    // Las siete de antes, en su orden, sin una de más ni una de menos.
    expect(pest({ personaEnElCentro: false, planillaUnida: true }).map(([k]) => k)).toEqual([
      "reporte", "planilla", "prestamos", "justificaciones", "vacaciones", "aprobaciones", "configuracion",
    ]);

    vi.doUnmock("@/lib/asistencia/marcaciones-pestana");
    vi.resetModules();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 5 · DESDE AQUÍ NO SE ESCRIBE NADA
// ═════════════════════════════════════════════════════════════════════════════

describe("🔴 la pestaña Marcaciones SOLO mira", () => {
  const ARCHIVOS = [TAB, LOGICA];

  it("el barrido mira los archivos de verdad (si no, no miró nada)", () => {
    for (const a of ARCHIVOS) expect(leer(a).length).toBeGreaterThan(1000);
  });

  it("ni un POST, PUT, PATCH o DELETE", () => {
    for (const a of ARCHIVOS) {
      const src = leer(a);
      for (const metodo of ["POST", "PUT", "PATCH", "DELETE"]) {
        expect(`${a}:${src.includes(`method: "${metodo}"`)}`).toBe(`${a}:false`);
        expect(`${a}:${src.includes(`method: '${metodo}'`)}`).toBe(`${a}:false`);
      }
    }
  });

  it("no hay un botón que corrija, borre o justifique", () => {
    const src = leer(TAB);
    for (const palabra of ["Corregir", "Eliminar", "Borrar", "Justificar", "Guardar"]) {
      expect(`${palabra}:${src.includes(`>${palabra}`)}`).toBe(`${palabra}:false`);
    }
  });

  it("la única lectura es la ruta de marcaciones y la de la foto", async () => {
    const llamadas = servir(MISMO_LUGAR);
    render(<MarcacionesTab empresa="todas" />);
    await waitFor(() => expect(screen.getByRole("table")).toBeTruthy());
    expect(llamadas.length).toBeGreaterThan(0);
    for (const l of llamadas) {
      expect(`${l.url}:${l.metodo}`).toBe(`${l.url}:GET`);
      expect(l.url.startsWith("/api/asistencia/marcaci")).toBe(true);
    }
  });

  it("reusa la MISMA hoja del reporte, no escribe otra", () => {
    // 🩸 El archivo se llamaba `SelfieMarcacionModal.tsx` y se renombró el
    // 25-sep-2026: son fotos DEL LUGAR, no selfies (Daniel, 24-sep-2026: *«sus
    // fotos son del lugar, no de su cara»*). Sigue siendo UNA sola hoja para las
    // dos pantallas, que es lo que este candado sostiene.
    expect(leer(TAB)).toContain('from "./FotosDeLaMarcaModal"');
    expect(leer(TAB)).not.toContain("SelfieMarcacionModal");
  });
});

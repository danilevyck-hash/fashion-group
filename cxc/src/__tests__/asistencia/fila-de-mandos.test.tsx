/**
 * ─────────────────────────────────────────────────────────────────────────────
 * 🔴 LA FILA DE MANDOS DE ASISTENCIA — los cinco arreglos del 25-sep-2026
 *
 * Daniel, textual, mirando la pantalla en producción:
 *
 *   *«otra vez calendario chueco. Estos botones no me gusta cómo los hiciste en
 *    Asistencia: quita el Solo a revisar, la flecha cámbiala a descargar o
 *    flecha para abajo, los 3 puntitos no hacen nada. Reloj Multifashion y
 *    Boston ¿puedes merge en una y que Traer ahora al tocar sea a los dos? y que
 *    esté en el mismo panel de arriba junto a las otras para no ocupar mucho
 *    espacio sucio»*
 *
 * Y, sobre la Planilla y sobre el día abierto de un colaborador:
 *
 *   *«ese mensaje no tiene que decir desde el 28 si ya está en el calendario;
 *    debería decir desde cuándo lee (la última apertura, día después); y algo
 *    minimalista que se sepa que es el cierre del reloj»*
 *   *«¿estas informaciones se pueden resumir? quitar lo obvio, para no ensuciar
 *    tanto la pantalla»*
 *
 * 🔴 NINGÚN NÚMERO CAMBIA. Nada de acá toca un minuto, un centavo ni lo que se
 * le manda al servidor: `pantalla-no-mueve-un-numero.test.ts` sigue vigente.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import fs from "fs";
import path from "path";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";

import { ToastProvider } from "@/components/ToastSystem";
import { REGLAS_DEFAULT } from "@/lib/asistencia/config";
import { armarReporte } from "@/lib/asistencia/reporte";
import { DESCARGAR } from "@/lib/asistencia/pantalla-2026-09";
import { ROTULO_SOLO_A_REVISAR, PARAM_SOLO_A_REVISAR } from "@/lib/asistencia/solo-a-revisar";
import {
  PC_NO_RECOGIO, RELOJ_DE_EMPRESAS, TRAER_AHORA, avisoDeLaPastilla, relojesDeLaEmpresa,
  textoDeLaPastilla, textoPedidoEnviado,
} from "@/lib/asistencia/relojes-en-la-fila";
import { VER_FOTOS, lineaDelDia, textoRepetidas } from "@/lib/asistencia/linea-del-dia";
import { lineaCorteDelReloj, PREFIJO_CORTE } from "@/lib/asistencia/corte-del-reloj";
import { calcularPosicionDesplegable } from "@/lib/ui/posicion-desplegable";
import { ANCHO_CALENDARIO, ANCHO_DIA_CALENDARIO, COLUMNAS_CALENDARIO } from "@/components/ui/RangoFechas";

const RAIZ = process.cwd();
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");
/** El archivo SIN comentarios: un barrido mira lo que se DIBUJA, no lo que se
 *  cuenta en una nota (que es justo donde se explica lo que se retiró). */
const puro = (rel: string) =>
  leer(rel).replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

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
vi.mock("@/lib/asistencia/exportar", () => ({
  construirExcel: () => ({}), construirPdf: () => ({ save: vi.fn() }),
}));
vi.mock("@/lib/excel-export", () => ({ downloadWorkbook: vi.fn() }));

import ReporteTab from "@/app/asistencia/ReporteTab";

const DESDE = "2026-09-16";
const HASTA = "2026-09-30";

/** Dos colaboradores con números de verdad, salidos del MOTOR. */
const PERSONAS = (() => {
  const marca = (cod: string, dia: string, hhmm: string) => ({
    empleado_codigo: cod, empleado_nombre: null, ocurrio_en: `${dia}T${hhmm}-05:00`,
  });
  return armarReporte({
    marcaciones: [
      marca("2", "2026-09-22", "08:17:00"), marca("2", "2026-09-22", "12:00:00"),
      marca("2", "2026-09-22", "13:00:00"), marca("2", "2026-09-22", "17:00:00"),
      marca("303", "2026-09-22", "08:00:00"), marca("303", "2026-09-22", "12:00:00"),
      marca("303", "2026-09-22", "13:00:00"), marca("303", "2026-09-22", "18:30:00"),
    ],
    horarios: [
      { empleado_codigo: "2", entrada: "08:00", salida: "17:00", almuerzo_minutos: 60 },
      { empleado_codigo: "303", entrada: "08:00", salida: "18:30", almuerzo_minutos: 60 },
    ],
    justificaciones: [], feriados: new Map(), desde: "2026-09-22", hasta: "2026-09-22",
    reglas: REGLAS_DEFAULT,
    nombres: new Map([["2", "ANA TREJOS"], ["303", "JAILINE QUISPE"]]),
  });
})();

const RESPUESTA = {
  personas: PERSONAS, sinHorario: 0, reglas: REGLAS_DEFAULT, correccionesDisponible: true,
};

const RELOJES_AL_DIA = [
  { dispositivo: "reloj cboston", salud: "al_dia", titulo: "x", detalle: null, pedidoPendiente: false, pedidoSinRespuesta: false, leidoHasta: null, minutosSinNoticias: 3 },
  { dispositivo: "reloj acs", salud: "al_dia", titulo: "y", detalle: null, pedidoPendiente: false, pedidoSinRespuesta: false, leidoHasta: null, minutosSinNoticias: 2 },
];

function servir(relojes: unknown[] = RELOJES_AL_DIA, pedidos?: string[]) {
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    if (u.includes("/api/asistencia/reporte")) {
      return { ok: true, status: 200, json: async () => RESPUESTA } as Response;
    }
    if (u.includes("/api/asistencia/reloj")) {
      if (init?.method === "POST") {
        pedidos?.push(JSON.parse(String(init.body)).dispositivo);
        return { ok: true, status: 200, json: async () => ({ ok: true }) } as Response;
      }
      return { ok: true, status: 200, json: async () => ({ relojes }) } as Response;
    }
    return { ok: true, status: 200, json: async () => ({ relojes: [], motivos: [], justificaciones: [], personas: [] }) } as Response;
  }));
}

/** Con el dedo o con el mouse. `aparatoDeQuienMira` pregunta por `pointer: coarse`. */
function aparato(celular: boolean) {
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: celular && q.includes("coarse"),
    media: q, onchange: null,
    addListener: vi.fn(), removeListener: vi.fn(),
    addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
  }));
}

beforeEach(() => {
  URL_ACTUAL = `desde=${DESDE}&hasta=${HASTA}`;
  try { localStorage.clear(); } catch { /* modo privado */ }
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); URL_ACTUAL = ""; });

const montar = (empresa = "todas") =>
  render(<ToastProvider><ReporteTab empresa={empresa} /></ToastProvider>);

// ─────────────────────────────────────────────────────────────────────────────
// 1 · EL CALENDARIO CHUECO
// ─────────────────────────────────────────────────────────────────────────────
describe("1 · el calendario entra entero, a cualquier ancho", () => {
  /**
   * 🩸 MEDIDO en Chromium: el panel pedía 332 px y, con `box-sizing: border-box`,
   * quedaban 306 de contenido para una grilla de 7 × 44 = 308. Y las celdas NO se
   * encogen (son `<td>` de 44 px fijos), así que la columna del DOMINGO se salía.
   * Con la barra de scroll clásica —la de Windows, que es lo que hay en la
   * oficina— se iban otros ~15 px: 17 de los 44 de la última columna.
   */
  const PADDING = 12 * 2;
  const BORDE = 1 * 2;
  const BARRA = 16;

  it("🔴 el ancho del panel alcanza para las 7 columnas, el padding, el borde y la barra", () => {
    expect(ANCHO_DIA_CALENDARIO * COLUMNAS_CALENDARIO).toBe(308);
    expect(ANCHO_CALENDARIO - PADDING - BORDE - BARRA).toBeGreaterThanOrEqual(308);
    // 🩸 Lo que había antes —332 px— NO alcanzaba, y por eso este candado existe.
    expect(332 - PADDING - BORDE - BARRA).toBeLessThan(308);
  });

  it("🔴 a 390, 768, 1024 y 1440 el panel cabe en la pantalla Y le quedan 308 px de grilla", () => {
    for (const ancho of [390, 768, 1024, 1440]) {
      const pos = calcularPosicionDesplegable(
        // El 📅 de la fila de mandos: 44 px, pegado a la izquierda del panel.
        { top: 200, bottom: 244, left: 190, width: 44 },
        { width: ancho, height: 900 },
        { ancho: ANCHO_CALENDARIO, altoDeseado: 420 },
      );
      // Nunca se sale por ningún borde.
      expect(pos.left).toBeGreaterThanOrEqual(8);
      expect(pos.left + pos.width).toBeLessThanOrEqual(ancho - 8);
      // Y el contenido alcanza para las siete columnas enteras.
      expect(pos.width - PADDING - BORDE - BARRA).toBeGreaterThanOrEqual(308);
    }
  });

  it("🔴 y el cuerpo del desplegable lleva su propio deslizamiento, por si algún día aprieta", () => {
    const rf = leer("src/components/ui/RangoFechas.tsx");
    expect(rf).toContain('<div className="flex justify-center overflow-x-auto">{cuerpo()}</div>');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2 · «SOLO A REVISAR» SALE DE LA FILA, PERO NO SE BORRA
// ─────────────────────────────────────────────────────────────────────────────
describe("2 · «Solo a revisar» se va de la fila de mandos", () => {
  it("🔴 no está entre los mandos: vive en el encabezado de SU columna", async () => {
    aparato(false); servir(); montar();
    await screen.findByText("Ana Trejos");
    const chip = screen.getByRole("button", { name: ROTULO_SOLO_A_REVISAR });
    // 🔴 El chip es del encabezado de la tabla, no de la fila de mandos.
    expect(chip.closest("th")).not.toBeNull();
    expect(chip.textContent).toContain("A revisar");
  });

  it("🔴 sigue filtrando y sigue escribiendo `?revisar=1`", async () => {
    aparato(false); servir(); montar();
    await screen.findByText("Ana Trejos");
    fireEvent.click(screen.getByRole("button", { name: ROTULO_SOLO_A_REVISAR }));
    await waitFor(() => expect(URL_ACTUAL).toContain(`${PARAM_SOLO_A_REVISAR}=1`));
  });

  it("🔴 y `?revisar=1` en la dirección sigue abriendo la pantalla filtrada", async () => {
    URL_ACTUAL = `desde=${DESDE}&hasta=${HASTA}&${PARAM_SOLO_A_REVISAR}=1`;
    aparato(false); servir(); montar();
    // Ninguna de las dos tiene días a revisar: el filtro deja la tabla vacía y
    // lo dice, que es lo que hacía antes.
    expect(await screen.findByText(/Nadie tiene días a revisar/)).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3 · LA FLECHA PASA A SER «DESCARGAR»
// ─────────────────────────────────────────────────────────────────────────────
describe("3 · «Descargar», con su nombre y su flecha hacia abajo", () => {
  it("🔴 el botón dice «Descargar» y ofrece Excel y PDF", async () => {
    aparato(false); servir(); montar();
    await screen.findByText("Ana Trejos");
    expect(DESCARGAR).toBe("Descargar");
    const boton = screen.getByRole("button", { name: DESCARGAR });
    expect(boton).toBeTruthy();
    fireEvent.click(boton);
    expect(screen.getByRole("menuitem", { name: /Excel/ })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: /PDF/ })).toBeTruthy();
  });

  it("🔴 en el celular es el MISMO botón", async () => {
    aparato(true); servir(); montar();
    await screen.findByText("Ana Trejos");
    expect(screen.getByRole("button", { name: DESCARGAR })).toBeTruthy();
  });

  it("🩸 el «⇧» hacia arriba no vuelve", () => {
    const rep = puro("src/app/asistencia/ReporteTab.tsx");
    expect(rep).not.toContain("⇧");
    expect(rep).not.toContain("Bajar Excel o PDF");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4 · EL «···» QUE NO HACÍA NADA
// ─────────────────────────────────────────────────────────────────────────────
describe("4 · el «···» se quitó porque no quedó nada adentro", () => {
  it("🔴 no hay ningún «···» en el reporte, ni vacío ni lleno", () => {
    const rep = puro("src/app/asistencia/ReporteTab.tsx");
    expect((rep.match(/···/g) ?? []).length).toBe(0);
    expect(rep).not.toContain('aria-label="Los relojes"');
    expect(rep).not.toContain("relojesAbiertos");
  });

  it("🔴 y el estado que lo acompañaba se fue con él", () => {
    expect(puro("src/app/asistencia/EstadoReloj.tsx")).not.toContain("escondidoSiTodoBien");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5 · LOS DOS RELOJES, UNA PASTILLA Y UN «TRAER AHORA»
// ─────────────────────────────────────────────────────────────────────────────
describe("5 · una sola pastilla de relojes en la fila de mandos", () => {
  it("🔴 con todos al día: verde, y dice hace cuánto (el más viejo manda)", () => {
    expect(textoDeLaPastilla(RELOJES_AL_DIA as never)).toBe("Relojes al día · hace 3 minutos");
    expect(textoDeLaPastilla([
      { dispositivo: "reloj cboston", salud: "al_dia", minutosSinNoticias: 3 },
    ])).toBe("Reloj de Boston al día · hace 3 minutos");
    expect(textoDeLaPastilla([])).toBe("");
  });

  it("🔴 con uno mal, NOMBRA solo al que falla", () => {
    expect(textoDeLaPastilla([
      { dispositivo: "reloj cboston", salud: "al_dia", minutosSinNoticias: 2 },
      { dispositivo: "reloj acs", salud: "callado", minutosSinNoticias: 130 },
    ])).toBe("Reloj de Multifashion sin señal hace 2 horas");
    expect(textoDeLaPastilla([
      { dispositivo: "reloj cboston", salud: "callado", minutosSinNoticias: 130 },
      { dispositivo: "reloj acs", salud: "con_error", minutosSinNoticias: 1 },
    ])).toBe("Reloj de Multifashion y Reloj de Boston no se pudo leer");
  });

  it("🔴 el pedido que la PC no recogió se sigue diciendo, con las mismas palabras", () => {
    expect(avisoDeLaPastilla([{ dispositivo: "reloj acs", salud: "callado" }])).toBeNull();
    expect(avisoDeLaPastilla([
      { dispositivo: "reloj acs", salud: "callado", pedidoSinRespuesta: true },
    ])).toBe(PC_NO_RECOGIO);
  });

  it("🔴 qué relojes le tocan a cada empresa: lista escrita a mano, medida contra producción", () => {
    expect(RELOJ_DE_EMPRESAS["reloj cboston"]).toEqual(["confecciones_boston", "vistana", "fashion_wear"]);
    expect(RELOJ_DE_EMPRESAS["reloj acs"]).toEqual(["american_classic"]);
    const dos = [{ dispositivo: "reloj cboston" }, { dispositivo: "reloj acs" }];
    expect(relojesDeLaEmpresa(dos, null).length).toBe(2);
    expect(relojesDeLaEmpresa(dos, "american_classic")).toEqual([{ dispositivo: "reloj acs" }]);
    expect(relojesDeLaEmpresa(dos, "vistana")).toEqual([{ dispositivo: "reloj cboston" }]);
    // 🔴 FALLA ABIERTA: un reloj desconocido no se esconde, y si el filtro no
    // deja ninguno se muestran todos.
    expect(relojesDeLaEmpresa([{ dispositivo: "reloj nuevo" }], "vistana").length).toBe(1);
    expect(relojesDeLaEmpresa([{ dispositivo: "reloj acs" }], "vistana").length).toBe(1);
  });

  it("🔴 la pastilla vive en la fila de mandos, no en una caja aparte", async () => {
    aparato(false); servir(); montar();
    await screen.findByText("Ana Trejos");
    const pastilla = await screen.findByText("Relojes al día · hace 3 minutos");
    const mandos = screen.getByRole("button", { name: DESCARGAR }).closest("div.flex.flex-wrap");
    expect(mandos?.contains(pastilla)).toBe(true);
  });

  it("🔴 UN «Traer ahora» le deja el pedido a LOS DOS, con las llamadas de siempre", async () => {
    aparato(false);
    const pedidos: string[] = [];
    servir([
      { dispositivo: "reloj cboston", salud: "callado", titulo: "x", detalle: null, pedidoPendiente: false, pedidoSinRespuesta: false, leidoHasta: null, minutosSinNoticias: 130 },
      { dispositivo: "reloj acs", salud: "callado", titulo: "y", detalle: null, pedidoPendiente: false, pedidoSinRespuesta: false, leidoHasta: null, minutosSinNoticias: 130 },
    ], pedidos);
    montar();
    fireEvent.click(await screen.findByRole("button", { name: new RegExp(TRAER_AHORA) }));
    await waitFor(() => expect(pedidos.length).toBe(2));
    expect(new Set(pedidos)).toEqual(new Set(["reloj cboston", "reloj acs"]));
    // 🔴 El acuse nombra a quiénes salió. ⚠️ NO dice cuántas marcas trajo: el
    // POST solo deja el pedido en el buzón.
    expect(textoPedidoEnviado(["reloj acs"])).toContain("Reloj de Multifashion");
    expect(textoPedidoEnviado(["reloj acs", "reloj cboston"])).toContain("a los 2 relojes");
    expect(textoPedidoEnviado(["reloj acs"])).not.toMatch(/\d+ marca/);
  });

  it("🔴 con la empresa filtrada, solo su reloj", async () => {
    aparato(false); servir();
    montar("american_classic");
    expect(await screen.findByText(/Reloj de Multifashion al día/)).toBeTruthy();
    expect(screen.queryByText(/Reloj de Boston/)).toBeNull();
  });

  it("🩸 las dos cajas amarillas de ancho completo se fueron del cuerpo", () => {
    const rep = puro("src/app/asistencia/ReporteTab.tsx");
    // Con el interruptor PRENDIDO queda UNA sola instancia, y es la pastilla.
    const prendido = rep.split("ASISTENCIA_PANTALLA_2026_09 ? (")[1]?.split("\n      ) : (")[0] ?? "";
    expect((prendido.match(/<EstadoReloj/g) ?? []).length).toBe(1);
    expect(prendido.slice(prendido.indexOf("<EstadoReloj"), prendido.indexOf("<EstadoReloj") + 60)).toContain("resumen");
    // ⚠️ El camino APAGADO conserva las dos cajas de siempre, intacto.
    expect((rep.match(/<EstadoReloj/g) ?? []).length).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6 · LA LÍNEA DEL CORTE DEL RELOJ, EN LA PLANILLA
// ─────────────────────────────────────────────────────────────────────────────
describe("6 · «Corte del reloj · lee del 14 al 28 sep»", () => {
  it("🔴 con cierre anterior, el desde es el día SIGUIENTE a su corte", () => {
    const l = lineaCorteDelReloj({
      desde: "2026-09-16", hasta: "2026-09-30", corte: "2026-09-28",
      ultimoCorteCerrado: "2026-09-13",
    });
    expect(l?.texto).toBe(`${PREFIJO_CORTE} · lee del 14 al 28 sep`);
    expect(l?.desdeQueLee).toBe("2026-09-14");
    // La cola va al ⓘ, con la frase de SIEMPRE.
    expect(l?.nota).toBe("Del 29 al 30 se paga normal y se ajusta en la siguiente.");
  });

  it("🔴 sin cierre anterior, el desde es el inicio de la quincena", () => {
    const l = lineaCorteDelReloj({
      desde: "2026-09-16", hasta: "2026-09-30", corte: "2026-09-28", ultimoCorteCerrado: null,
    });
    expect(l?.texto).toBe(`${PREFIJO_CORTE} · lee del 16 al 28 sep`);
  });

  it("🔴 con el corte vacío (la ×), se lee hasta el fin de la medición", () => {
    const l = lineaCorteDelReloj({
      desde: "2026-09-16", hasta: "2026-09-30", corte: "", ultimoCorteCerrado: "2026-09-13",
    });
    expect(l?.texto).toBe(`${PREFIJO_CORTE} · lee del 14 al 30 sep`);
    expect(l?.nota).toBeNull();
    // Agosto paga hasta el 30 y el reloj llega al 31: la misma regla de siempre.
    expect(lineaCorteDelReloj({
      desde: "2026-08-16", hasta: "2026-08-30", corte: "", ultimoCorteCerrado: null,
    })?.texto).toBe(`${PREFIJO_CORTE} · lee del 16 al 31 ago`);
  });

  it("🔴 el mes se dice UNA vez si es el mismo, y las dos si cambia", () => {
    expect(lineaCorteDelReloj({
      desde: "2026-09-16", hasta: "2026-09-30", corte: "2026-09-28",
      ultimoCorteCerrado: "2026-08-25",
    })?.texto).toBe(`${PREFIJO_CORTE} · lee del 26 ago al 28 sep`);
  });

  it("🔴 un cierre más nuevo que el corte no produce «del 29 al 28»", () => {
    const l = lineaCorteDelReloj({
      desde: "2026-09-01", hasta: "2026-09-15", corte: "2026-09-13",
      ultimoCorteCerrado: "2026-09-30",
    });
    expect(l?.texto).toBe(`${PREFIJO_CORTE} · lee hasta el 13 sep`);
  });

  it("🔴 un período que no sirve no produce una frase a medias", () => {
    expect(lineaCorteDelReloj({ desde: "", hasta: "2026-09-30", corte: "" })).toBeNull();
  });

  it("🩸 «· cambiar» se retiró: el calendario está al lado", () => {
    expect(leer("src/app/asistencia/PlanillaTab.tsx")).not.toContain("CAMBIAR_EL_CORTE");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7 · UNA SOLA LÍNEA DEBAJO DEL DÍA
// ─────────────────────────────────────────────────────────────────────────────
describe("7 · el día abierto se resume en una línea", () => {
  it("🔴 sin nada que decir, NO se dibuja nada", () => {
    expect(lineaDelDia({ marcas: [], repetidas: 0 })).toBeNull();
    expect(lineaDelDia({})).toBeNull();
  });

  it("🔴 sin señal y con atraso, en una frase — y nunca la palabra «llegó»", () => {
    const l = lineaDelDia({
      marcas: [
        { sinSenal: true, atrasoMin: 180, conFoto: true },
        { sinSenal: false, atrasoMin: 1, conFoto: true },
      ],
      repetidas: 0,
    });
    expect(l?.texto).toBe("Teléfono · sin señal, enviada 3 h después");
    expect(l?.texto.toLowerCase()).not.toContain("lleg");
    expect(l?.verFotos).toBe(true);
    expect(l?.llamaLaAtencion).toBe(true);
  });

  it("🔴 el atraso que se dice es el MAYOR del día, y por debajo de 5 min no se dice", () => {
    expect(lineaDelDia({ marcas: [{ atrasoMin: 2, conFoto: true }] })?.texto).toBe("Teléfono");
    expect(lineaDelDia({
      marcas: [{ atrasoMin: 2 }, { atrasoMin: 95 }],
    })?.texto).toBe("Teléfono · enviada 1 h 35 min después");
  });

  it("🔴 las repetidas se CUENTAN, no se listan", () => {
    expect(textoRepetidas(1)).toBe("1 repetida");
    expect(textoRepetidas(2)).toBe("2 repetidas");
    // Sin marcas del teléfono, la línea es solo el conteo.
    expect(lineaDelDia({ marcas: [], repetidas: 2 })?.texto).toBe("2 repetidas");
    expect(lineaDelDia({ marcas: [{ conFoto: true }], repetidas: 1 })?.texto)
      .toBe("Teléfono · 1 repetida");
  });

  it("🔴 una marca deshecha se dice, no se esconde", () => {
    expect(lineaDelDia({ marcas: [{ quitada: true, conFoto: true }] })?.texto)
      .toBe("Teléfono · 1 deshecha");
  });

  it("🔴 «ver fotos» sale UNA vez, y ya no se llama «selfie» en ninguna parte", () => {
    expect(VER_FOTOS).toBe("ver fotos");
    const rep = leer("src/app/asistencia/ReporteTab.tsx");
    const prendido = rep.slice(rep.indexOf("ASISTENCIA_PANTALLA_2026_09 ? (\n        resumenDelDia"));
    expect(prendido.slice(0, 1200)).not.toContain("Ver la selfie");
    expect(fs.existsSync(path.join(RAIZ, "src/app/asistencia/SelfieMarcacionModal.tsx"))).toBe(false);
    expect(fs.existsSync(path.join(RAIZ, "src/app/asistencia/FotosDeLaMarcaModal.tsx"))).toBe(true);
  });

  it("🔴 el Excel NO cambió: sigue llevando cada repetida con su explicación", () => {
    const exportar = leer("src/lib/asistencia/exportar.ts");
    expect(exportar).toContain("textoTodasLasMarcasConRepetidas");
  });
});

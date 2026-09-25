/**
 * ─────────────────────────────────────────────────────────────────────────────
 * 🔴 QUIEN NO MARCÓ EN EL PERÍODO APARECE IGUAL (24-sep-2026)
 *
 * 🩸 EL DEFECTO, medido contra producción: la lista de la pestaña Asistencia se
 * armaba **solo con quien tiene marcas en el período** (`reporte.ts:784`), así
 * que **Yeisibeth Muñoz (306, Multifashion)** —activa, ingreso 16-ene-2026, 5
 * marcas en toda su historia— no existía para la quincena del 1 al 15 de
 * septiembre, y **María V. Bethancourth (49, Confecciones Boston)** tampoco
 * para la quincena en curso. Daniel no podía arreglarles las horas a mano.
 *
 * 🔴 LA FILA GRIS SOLO INFORMA. Medido en `armarPlanilla`: a quien no tiene
 * reporte se le da `HORAS_CERO` y, con la ficha completa y sin explicación, la
 * línea sale con «no marcó ni un día en esta quincena» y **`dinero: null`** —
 * o sea que la planilla **no le cobra una sola ausencia**. La pantalla no
 * puede decir otra cosa que el pago: sus días salen en cero y **ninguno es
 * ausencia**.
 *
 * Lo que este candado exige:
 *   A. La regla pura de a quién se agrega, y a quién no.
 *   B. El motor: sale en la lista, con días para tocar y SIN ausencias.
 *   C. La planilla no se mueve: medida, y el motor sin la lista da lo mismo.
 *   D. En la pantalla: sale en gris, lo dice, se abre y se puede corregir; y
 *      el Excel y el PDF la llevan igual que la pantalla.
 *   E. Falla ABIERTA: con el interruptor apagado, la lista de siempre.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";

import { ToastProvider } from "@/components/ToastSystem";
import { REGLAS_DEFAULT } from "@/lib/asistencia/config";
import { armarReporte } from "@/lib/asistencia/reporte";
import { armarPlanilla, FALTA } from "@/lib/asistencia/planilla";
import {
  NOTA_SIN_MARCAS, TEXTO_DIA_SIN_MARCAS, TEXTO_SIN_MARCAS, avisoSinMarcas, codigosSinMarcas,
  esSinMarcas, ASISTENCIA_SIN_MARCAS_VISIBLE,
} from "@/lib/asistencia/sin-marcas";

// ─────────────────────────────────────────────────────────────────────────────
// A. LA REGLA PURA
// ─────────────────────────────────────────────────────────────────────────────

const FICHAS = [
  { codigo: "306", nombre: "YEISIBETH MUÑOZ" },
  { codigo: "49", nombre: "MARIA V. BETHANCOURTH" },
  { codigo: "26", nombre: "YULISSA JUAREZ" },
  { codigo: "9999", nombre: null },
];

const llamar = (over: Record<string, unknown> = {}) =>
  codigosSinMarcas({
    fichas: FICHAS,
    conMarcas: new Set(["26"]),
    fueraDeVigencia: new Set(),
    ignorados: new Set(["9999"]),
    activo: true,
    ...over,
  });

describe("A · a quién se agrega", () => {
  it("🔴 salen los que no marcaron: Yeisibeth y María V.", () => {
    expect(llamar().sort()).toEqual(["306", "49"]);
  });

  it("🔴 el que SÍ marcó no se agrega: ya sale, y con sus números", () => {
    expect(llamar()).not.toContain("26");
  });

  it("🔴 el que no estaba trabajando en el rango NO se agrega", () => {
    // Es la MISMA regla que ya saca a los demás (`fecha_ingreso`/`fecha_salida`),
    // y la pantalla la cuenta aparte con su propia línea.
    expect(llamar({ fueraDeVigencia: new Set(["306"]) })).toEqual(["49"]);
  });

  it("🔴 un código escondido tampoco", () => {
    expect(llamar()).not.toContain("9999");
  });

  it("el buscador también los filtra, por nombre y por código", () => {
    expect(llamar({ q: "yeisibeth" })).toEqual(["306"]);
    expect(llamar({ q: "49" })).toEqual(["49"]);
    expect(llamar({ q: "nadie" })).toEqual([]);
  });

  it("la página de UNA persona trae solo a esa", () => {
    expect(llamar({ soloCodigo: "306" })).toEqual(["306"]);
    expect(llamar({ soloCodigo: "26" })).toEqual([]);
  });

  it("🔴 con el interruptor APAGADO no se agrega a nadie: la lista de siempre", () => {
    expect(llamar({ activo: false })).toEqual([]);
  });

  it("el aviso de arriba cuenta bien, y en cero no se dibuja", () => {
    expect(avisoSinMarcas(0)).toBeNull();
    expect(avisoSinMarcas(-1)).toBeNull();
    expect(avisoSinMarcas(1)).toContain("1 colaborador");
    expect(avisoSinMarcas(2)).toContain("2 colaboradores");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B y C. EL MOTOR Y LA PLANILLA
// ─────────────────────────────────────────────────────────────────────────────

const DESDE = "2026-09-01";
const HASTA = "2026-09-04";   // mar a vie: cuatro días hábiles
const COD = "306";

const correr = (sinMarcas?: ReadonlySet<string>) =>
  armarReporte({
    marcaciones: [],
    horarios: [],
    justificaciones: [],
    feriados: new Map(),
    desde: DESDE,
    hasta: HASTA,
    reglas: REGLAS_DEFAULT,
    nombres: new Map([[COD, "YEISIBETH MUÑOZ"]]),
    ...(sinMarcas ? { sinMarcas } : {}),
  });

describe("B · el motor la pone en la lista, y su veredicto queda suspendido", () => {
  it("🔴 sin la lista NO sale: es el defecto que se está arreglando", () => {
    expect(correr()).toHaveLength(0);
  });

  it("🔴 con la lista sale, con el nombre del directorio y la bandera puesta", () => {
    const [p] = correr(new Set([COD]));
    expect(p.codigo).toBe(COD);
    expect(p.nombre).toBe("YEISIBETH MUÑOZ");
    expect(esSinMarcas(p)).toBe(true);
  });

  it("🔴 tiene días —para poder tocarlos— y NINGUNO es ausencia", () => {
    const [p] = correr(new Set([COD]));
    expect(p.dias.length).toBeGreaterThan(0);
    expect(p.dias.every((d) => d.ausente === false)).toBe(true);
    expect(p.dias.every((d) => d.revisar === false)).toBe(true);
    expect(p.dias.every((d) => d.marcas.length === 0)).toBe(true);
  });

  it("🔴 su resumen va en CERO: no suma ni resta un minuto a ningún total", () => {
    const [p] = correr(new Set([COD]));
    expect(p.resumen.ausenciasSinJustificar).toBe(0);
    expect(p.resumen.diasTrabajados).toBe(0);
    expect(p.resumen.minutosTarde).toBe(0);
    expect(p.resumen.tiempoNoTrabajadoMin).toBe(0);
    expect(p.resumen.extraMin).toBe(0);
    expect(p.resumen.diasARevisar).toBe(0);
  });

  it("🔑 un código que SÍ marcó no se toca aunque venga en la lista", () => {
    const [p] = armarReporte({
      marcaciones: [
        { empleado_codigo: COD, empleado_nombre: null, ocurrio_en: "2026-09-01T13:00:00Z" },
        { empleado_codigo: COD, empleado_nombre: null, ocurrio_en: "2026-09-01T22:00:00Z" },
      ],
      horarios: [], justificaciones: [], feriados: new Map(),
      desde: DESDE, hasta: HASTA, reglas: REGLAS_DEFAULT,
      sinMarcas: new Set([COD]),
    });
    expect(esSinMarcas(p)).toBe(false);
    expect(p.resumen.diasTrabajados).toBe(1);
  });
});

describe("C · la planilla no se mueve", () => {
  const FICHA = {
    codigo: COD, nombre: "YEISIBETH MUÑOZ", salarioMensual: 550,
    jornadaSemanal: 44, empresa: "american_classic",
  };

  it("🔴 MEDIDO: a quien no marcó la planilla NO le cobra ni una ausencia", () => {
    const [l] = armarPlanilla({
      personas: [], fichas: new Map([[COD, FICHA]]), jornadaDiariaMin: () => 480, reglas: REGLAS_DEFAULT,
    });
    // Sin explicación y con la ficha completa: va a «Tú decides», sin pago
    // calculado — y sin un solo dólar de descuento por ausencia.
    expect(l.faltaConfigurar).toContain(FALTA.sinMarcaciones);
    expect(l.dinero).toBeNull();
    expect(l.horas.ausenciaDias).toBe(0);
    expect(l.horas.ausenciaMin).toBe(0);
  });

  it("🔴 el cuadro de la planilla no recibe la lista: da lo mismo que antes", () => {
    // La ruta de la planilla NO pasa `sinMarcas`; acá se comprueba que el motor
    // sin esa opción devuelve exactamente lo de siempre.
    const sin = correr();
    const con = correr(new Set([COD]));
    expect(sin).toHaveLength(0);
    expect(con).toHaveLength(1);
    expect(JSON.stringify(sin)).toBe("[]");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// D. EN LA PANTALLA
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

const excelRecibio = vi.fn();
const pdfRecibio = vi.fn();
vi.mock("@/lib/asistencia/exportar", () => ({
  construirExcel: (arg: { personas: unknown[] }) => { excelRecibio(arg); return {}; },
  construirPdf: (arg: { personas: unknown[] }) => { pdfRecibio(arg); return { save: vi.fn() }; },
}));
vi.mock("@/lib/excel-export", () => ({ downloadWorkbook: vi.fn() }));

import { ARREGLAR_EL_DIA, OTRO_MOTIVO, rotuloGuardar } from "@/lib/asistencia/panel-del-dia";
import ReporteTab from "@/app/asistencia/ReporteTab";

afterEach(() => {
  cleanup(); vi.unstubAllGlobals(); URL_ACTUAL = "";
  excelRecibio.mockClear(); pdfRecibio.mockClear();
});

/** Lo que el servidor manda: una persona con marcas y una sin ninguna. */
const RESPUESTA = (() => {
  const [conMarcas] = armarReporte({
    marcaciones: [
      { empleado_codigo: "26", empleado_nombre: null, ocurrio_en: "2026-09-01T13:00:00Z" },
      { empleado_codigo: "26", empleado_nombre: null, ocurrio_en: "2026-09-01T22:00:00Z" },
    ],
    horarios: [], justificaciones: [], feriados: new Map(),
    desde: DESDE, hasta: HASTA, reglas: REGLAS_DEFAULT,
    nombres: new Map([["26", "YULISSA JUAREZ"]]),
  });
  const [sinMarcas] = correr(new Set([COD]));
  return {
    personas: [conMarcas, sinMarcas],
    sinHorario: 0, reglas: REGLAS_DEFAULT, correccionesDisponible: true,
  };
})();

function servir(datos: unknown = RESPUESTA) {
  const llamadas: Array<{ url: string; init?: RequestInit }> = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    llamadas.push({ url: u, init });
    if (u.includes("/api/asistencia/reporte")) return { ok: true, status: 200, json: async () => datos } as Response;
    if (u.includes("/correcciones/dia")) {
      return { ok: true, status: 200, json: async () => ({ ok: true, aplicados: 1, errores: [] }) } as Response;
    }
    return { ok: true, status: 200, json: async () => ({ relojes: [], motivos: [], justificaciones: [], personas: [] }) } as Response;
  }));
  return llamadas;
}
const montar = () => render(<ToastProvider><ReporteTab /></ToastProvider>);
const camposHora = () => Array.from(document.querySelectorAll('input[type="time"]')) as HTMLInputElement[];

describe("D · en la pantalla sale, lo dice y se puede corregir", () => {
  it("🔴 la fila está, con su chip, y arriba se dice cuántos son", async () => {
    servir();
    montar();
    await screen.findByText("Yeisibeth Muñoz");
    expect(screen.getByText(TEXTO_SIN_MARCAS)).toBeTruthy();
    expect(screen.getByText(avisoSinMarcas(1) as string)).toBeTruthy();
  });

  it("🔴 la fila va en GRIS, sin sacarla de la lista", async () => {
    servir();
    montar();
    const fila = (await screen.findByText("Yeisibeth Muñoz")).closest("tr") as HTMLTableRowElement;
    expect(fila.className).toContain("text-gray-500");
  });

  it("🔴 se abre, dice que la planilla no le descuenta nada, y tiene días para tocar", async () => {
    servir();
    montar();
    fireEvent.click(await screen.findByText("Yeisibeth Muñoz"));
    expect(await screen.findByText(NOTA_SIN_MARCAS)).toBeTruthy();
    // Sus días hábiles están dibujados: el martes 1 de septiembre, por ejemplo.
    expect(screen.getByText((_t, el) => el?.tagName === "TD"
      && el.textContent?.trim().endsWith("1 sep") === true)).toBeTruthy();
    // 🔴 Y NINGUNO dice «Ausencia sin justificar»: la planilla no se la cobra.
    expect(screen.getAllByText(TEXTO_DIA_SIN_MARCAS).length).toBeGreaterThan(0);
    expect(screen.queryByText("Ausencia sin justificar")).toBeNull();
  });

  it("🔴 se le puede AGREGAR una hora por la puerta de siempre, con motivo", async () => {
    const llamadas = servir();
    montar();
    fireEvent.click(await screen.findByText("Yeisibeth Muñoz"));
    // Un día sin una sola marca se abre por «Arreglar el día», que es la
    // MISMA puerta de siempre: el editor en la fila, con motivo obligatorio.
    // 🔴 25-sep-2026: «Arreglar el día» SE QUEDA justo acá —es el único día que
    // no dibuja ni una hora ni un hueco que tocar— y abre la casilla de la
    // ENTRADA. El porqué a mano se pide por «Otro…» (`panel-del-dia.ts`).
    fireEvent.click(screen.getAllByRole("button", { name: ARREGLAR_EL_DIA })[0]);
    await waitFor(() => expect(camposHora().length).toBeGreaterThan(0));
    fireEvent.change(camposHora()[0], { target: { value: "08:00" } });
    fireEvent.click(screen.getByRole("button", { name: OTRO_MOTIVO }));
    fireEvent.change(
      await screen.findByPlaceholderText("Escribe el motivo…"),
      { target: { value: "se le olvidó marcar" } },
    );
    fireEvent.click(screen.getByRole("button", { name: rotuloGuardar() }));

    await waitFor(() => {
      expect(llamadas.filter((l) => l.url.includes("/correcciones/dia"))).toHaveLength(1);
    });
    const body = JSON.parse(String(llamadas.find((l) => l.url.includes("/correcciones/dia"))?.init?.body));
    // 🔴 EL FORMATO DE LO QUE SE GUARDA NO CAMBIA: mismo cuerpo de siempre.
    expect(body.codigo).toBe(COD);
    expect(body.motivo).toBe("se le olvidó marcar");
    expect(body.cambios).toHaveLength(1);
    expect(body.cambios[0]).toMatchObject({ tipo: "agregar", marcacionId: null, hora: "08:00:00" });
  });

  it("🔴 el Excel y el PDF la llevan igual que la pantalla", async () => {
    // 🩸 CAMBIÓ DE DIRECCIÓN EL 24-sep-2026: «Excel» y «PDF» eran dos botones
    // sueltos del panel de arriba; con el rediseño viven detrás de un botón, que
    // desde el 25-sep-2026 dice «Descargar». 🔴 Lo que se baja no cambió: es lo
    // que está en pantalla.
    const abrirDescargas = () =>
      fireEvent.click(screen.getByRole("button", { name: "Descargar" }));
    servir();
    montar();
    await screen.findByText("Yeisibeth Muñoz");
    abrirDescargas();
    fireEvent.click(screen.getByRole("menuitem", { name: /Excel/ }));
    await waitFor(() => expect(excelRecibio).toHaveBeenCalled());
    const aExcel = excelRecibio.mock.calls[0][0] as { personas: Array<{ codigo: string }> };
    expect(aExcel.personas.map((p) => p.codigo)).toContain(COD);

    abrirDescargas();
    fireEvent.click(screen.getByRole("menuitem", { name: /PDF/ }));
    await waitFor(() => expect(pdfRecibio).toHaveBeenCalled());
    const aPdf = pdfRecibio.mock.calls[0][0] as { personas: Array<{ codigo: string }> };
    expect(aPdf.personas.map((p) => p.codigo)).toContain(COD);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// E. CONTROL
// ─────────────────────────────────────────────────────────────────────────────

describe("E · el interruptor", () => {
  it("hoy está prendido", () => {
    expect(ASISTENCIA_SIN_MARCAS_VISIBLE).toBe(true);
  });
});

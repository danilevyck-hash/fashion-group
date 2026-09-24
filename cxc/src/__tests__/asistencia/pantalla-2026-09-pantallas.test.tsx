/**
 * ─────────────────────────────────────────────────────────────────────────────
 * 🔴 EL REDISEÑO DE ASISTENCIA, EN LA PANTALLA (24-sep-2026)
 *
 * Lo que se dibuja de verdad: la fila única de mandos, la tabla sin la columna
 * «Sale», los avisos plegados, la tarjeta del celular, la portada y la «×» del
 * corte. La regla vive en los módulos PUROS (`pantalla-2026-09.ts` y
 * `celular-asistencia.ts`); acá se comprueba que la pantalla la aplica.
 *
 * 🔴 NINGÚN NÚMERO CAMBIA: eso lo prueba `pantalla-no-mueve-un-numero.test.ts`.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";

import { ToastProvider } from "@/components/ToastSystem";
import { REGLAS_DEFAULT } from "@/lib/asistencia/config";
import { armarReporte } from "@/lib/asistencia/reporte";
import {
  PORTADA_PANTALLAS, SIN_NADA_QUE_REVISAR, datosDeLaTarjeta, lineaDeDias, pieDelCelular,
} from "@/lib/asistencia/celular-asistencia";
import { rotuloDeAvisos } from "@/lib/asistencia/pantalla-2026-09";

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
import PortadaCelular from "@/app/asistencia/PortadaCelular";

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

function servir(datos: unknown = RESPUESTA) {
  const llamadas: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const u = String(url);
    llamadas.push(u);
    if (u.includes("/api/asistencia/reporte")) return { ok: true, status: 200, json: async () => datos } as Response;
    return { ok: true, status: 200, json: async () => ({ relojes: [], motivos: [], justificaciones: [], personas: [], fichas: [], aprobaciones: [] }) } as Response;
  }));
  return llamadas;
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

const montarReporte = () => render(<ToastProvider><ReporteTab empresa="american_classic" /></ToastProvider>);

// ─────────────────────────────────────────────────────────────────────────────
// A · LA COMPUTADORA — una fila de mandos y diez columnas
// ─────────────────────────────────────────────────────────────────────────────

describe("A · Asistencia en la computadora", () => {
  it("🔴 el selector único dice la quincena, con sus dos flechas y el calendario", async () => {
    aparato(false); servir(); montarReporte();
    await screen.findByText("Ana Trejos");
    expect(screen.getByText("16 – 30 sep 2026")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Quincena anterior" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Quincena siguiente" })).toBeTruthy();
    // ⚠️ `RangoFechas` dibuja su botón DOS veces —uno para el escritorio y otro
    // para el teléfono, uno escondido por CSS— desde antes de este rediseño.
    expect(screen.getAllByRole("button", { name: "Elegir un día o un rango" }).length).toBeGreaterThan(0);
  });

  it("🩸 los cuatro atajos «Hoy · Ayer · Esta quincena · Quincena pasada» ya no se dibujan", async () => {
    aparato(false); servir(); montarReporte();
    await screen.findByText("Ana Trejos");
    expect(screen.queryByRole("button", { name: "Hoy" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Ayer" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Esta quincena/ })).toBeNull();
  });

  it("🔴 «‹» pide EL PERÍODO de la quincena anterior, sin inventar fechas", async () => {
    aparato(false); const llamadas = servir(); montarReporte();
    await screen.findByText("Ana Trejos");
    llamadas.length = 0;
    fireEvent.click(screen.getByRole("button", { name: "Quincena anterior" }));
    await waitFor(() => {
      expect(URL_ACTUAL).toContain("desde=2026-09-01");
      expect(URL_ACTUAL).toContain("hasta=2026-09-15");
    });
  });

  it("🔴 la lupa, «Solo a revisar», compartir y los relojes: una sola fila de mandos", async () => {
    aparato(false); servir(); montarReporte();
    await screen.findByText("Ana Trejos");
    expect(screen.getByRole("button", { name: "Buscar colaborador" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Solo a revisar" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Bajar Excel o PDF" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Los relojes" })).toBeTruthy();
    // 🔴 Excel y PDF no se perdieron: viven detrás del ícono de compartir.
    expect(screen.queryByRole("button", { name: /^Excel/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Bajar Excel o PDF" }));
    expect(screen.getByRole("menuitem", { name: /Excel/ })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: /PDF/ })).toBeTruthy();
  });

  it("🔴 el buscador aparece al tocar la lupa, y sigue filtrando contra el servidor", async () => {
    aparato(false); const llamadas = servir(); montarReporte();
    await screen.findByText("Ana Trejos");
    expect(screen.queryByPlaceholderText("Buscar colaborador")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Buscar colaborador" }));
    const campo = screen.getByPlaceholderText("Buscar colaborador");
    fireEvent.change(campo, { target: { value: "jailine" } });
    await waitFor(() => expect(llamadas.some((u) => u.includes("q=jailine"))).toBe(true));
  });

  it("🔴 la tabla perdió la columna «Sale» — de once a diez", async () => {
    aparato(false); servir(); montarReporte();
    await screen.findByText("Ana Trejos");
    const encabezados = Array.from(document.querySelectorAll("thead th")).map((th) => th.textContent?.trim());
    expect(encabezados).not.toContain("Sale");
    expect(encabezados.length).toBe(10);
  });

  it("🔴 el código va DELANTE del nombre y la salida sale en burbuja — el dato no se perdió", async () => {
    aparato(false); servir(); montarReporte();
    const celda = (await screen.findByText("Ana Trejos")).closest("td") as HTMLTableCellElement;
    const texto = celda.textContent ?? "";
    expect(texto.indexOf("2")).toBeLessThan(texto.indexOf("Ana Trejos"));
    expect(celda.querySelector('[title="Hora de salida de su ficha"]')?.textContent).toBe("17:00");
    const otra = screen.getByText("Jailine Quispe").closest("td") as HTMLTableCellElement;
    expect(otra.querySelector('[title="Hora de salida de su ficha"]')?.textContent).toBe("18:30");
  });

  it("🔴 los avisos se pliegan en UNA línea que dice cuántos son, y se abren", async () => {
    aparato(false);
    servir({ ...RESPUESTA, sinHorario: 2, sinHorarioLista: [{ codigo: "9", nombre: null }] });
    montarReporte();
    await screen.findByText("Ana Trejos");
    const linea = screen.getByText(rotuloDeAvisos(1) as string);
    expect(linea).toBeTruthy();
    fireEvent.click(linea);
    expect(await screen.findByText(
      (_t, el) => el?.tagName === "P" && (el.textContent ?? "").includes("su hora de salida"),
      {}, { timeout: 3000 },
    )).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B · EL CELULAR — una tarjeta por colaborador
// ─────────────────────────────────────────────────────────────────────────────

describe("B · Asistencia en el celular", () => {
  it("🔴 cada colaborador es una tarjeta: nada se desliza de lado", async () => {
    aparato(true); servir(); montarReporte();
    await screen.findByText("Ana Trejos");
    // La caja de la tabla ya no arrastra: en 356 px la tabla medía 888.
    const caja = (screen.getByText("Ana Trejos").closest("table") as HTMLElement).parentElement!;
    expect(caja.className).not.toContain("overflow-x-auto");
    // Y los encabezados de columna no se dibujan: cada dato lleva su palabra.
    expect(document.querySelector("thead")?.className).toContain("hidden");
  });

  it("🔴 la tarjeta dice días, hora de salida y lo que falló — con los MISMOS números", async () => {
    aparato(true); servir(); montarReporte();
    await screen.findByText("Ana Trejos");
    expect(screen.getByText(lineaDeDias(1, "17:00"))).toBeTruthy();
    // Ana llegó 17 minutos tarde: la tarjeta lo dice con el mismo formato.
    expect(screen.getByText(/1 tardanza de 17\.00 min/)).toBeTruthy();
    // Jailine no tiene nada: se dice en verde, nunca con un cero.
    expect(screen.getByText(SIN_NADA_QUE_REVISAR)).toBeTruthy();
  });

  it("🔴 el pie dice lo mismo que la tabla, en una línea", async () => {
    aparato(true); servir(); montarReporte();
    await screen.findByText("Ana Trejos");
    expect(screen.getByText(pieDelCelular({ colaboradores: 2, ausencias: 0, minutosTarde: 17 }))).toBeTruthy();
  });

  it("🔴 tocar la tarjeta abre EL MISMO detalle de días de siempre", async () => {
    aparato(true); servir(); montarReporte();
    fireEvent.click(await screen.findByText("Ana Trejos"));
    expect(await screen.findByText((_t, el) => el?.tagName === "TD"
      && el.textContent?.trim().endsWith("22 sep") === true)).toBeTruthy();
  });

  it("🔴 la línea de los relojes se ve, porque sin ella los números están incompletos", async () => {
    aparato(true);
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const u = String(url);
      if (u.includes("/api/asistencia/reporte")) return { ok: true, status: 200, json: async () => RESPUESTA } as Response;
      if (u.includes("/api/asistencia/reloj")) {
        return { ok: true, status: 200, json: async () => ({ relojes: [
          { dispositivo: "reloj acs", salud: "al_dia", titulo: "Las marcaciones están entrando solas", detalle: null, pedidoPendiente: false, pedidoSinRespuesta: false, leidoHasta: null },
          { dispositivo: "reloj cboston", salud: "al_dia", titulo: "Las marcaciones están entrando solas", detalle: null, pedidoPendiente: false, pedidoSinRespuesta: false, leidoHasta: null },
        ] }) } as Response;
      }
      return { ok: true, status: 200, json: async () => ({ motivos: [], justificaciones: [], personas: [] }) } as Response;
    }));
    montarReporte();
    expect(await screen.findByText("Los relojes están al día")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Traer ahora/ })).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C · LA PORTADA DEL CELULAR
// ─────────────────────────────────────────────────────────────────────────────

describe("C · la portada", () => {
  const PESTANAS = [
    ["colaboradores", "Colaboradores"],
    ["asistencia", "Asistencia"],
    ["aprobaciones", "Aprobaciones"],
    ["planilla", "Planilla"],
    ["prestamos", "Préstamos"],
  ] as const;

  function montarPortada(onAbrir = vi.fn()) {
    render(
      <PortadaCelular
        pestanas={PESTANAS}
        empresa="american_classic"
        opciones={[{ clave: "american_classic", etiqueta: "Multifashion" }]}
        onEmpresa={vi.fn()}
        desde={DESDE}
        hasta={HASTA}
        onAbrir={onAbrir}
      />,
    );
    return onAbrir;
  }

  it("🔴 las CINCO pestañas son cinco filas, con el período arriba", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) } as Response)));
    montarPortada();
    expect(screen.getByText(PORTADA_PANTALLAS)).toBeTruthy();
    expect(screen.getByText("16 – 30 sep 2026")).toBeTruthy();
    for (const [, rotulo] of PESTANAS) expect(screen.getByRole("button", { name: new RegExp(rotulo) })).toBeTruthy();
  });

  it("🔴 tocar una fila abre ESA pestaña — ninguna pantalla nueva", () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) } as Response)));
    const onAbrir = montarPortada();
    fireEvent.click(screen.getByRole("button", { name: /Aprobaciones/ }));
    expect(onAbrir).toHaveBeenCalledWith("aprobaciones");
  });

  it("🔴 los números son los de verdad: salen de las MISMAS rutas de cada pestaña", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const u = String(url);
      if (u.includes("/api/asistencia/configuracion")) {
        return { ok: true, status: 200, json: async () => ({ resumen: { total: 44, sinConfigurar: 1 } }) } as Response;
      }
      if (u.includes("/api/asistencia/prestamos-deuda")) {
        return { ok: true, status: 200, json: async () => ({ fichas: [{ empresa: "american_classic", saldo: 3642.72 }] }) } as Response;
      }
      return { ok: true, status: 200, json: async () => ({ aprobaciones: [] }) } as Response;
    }));
    montarPortada();
    expect(await screen.findByText("44")).toBeTruthy();
    expect(await screen.findByText("1 sin ficha")).toBeTruthy();
    expect(await screen.findByText("$3,642.72")).toBeTruthy();
  });

  it("🔴 sin respuesta NO se inventa un cero: la fila se queda sin número", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) } as Response)));
    montarPortada();
    await waitFor(() => expect(screen.getByRole("button", { name: /Colaboradores/ }).textContent).not.toContain("0"));
  });

  it("y el módulo la abre SOLO en el celular y SOLO sin `?tab=`", () => {
    const src = require("fs").readFileSync(
      require("path").join(process.cwd(), "src/app/asistencia/AsistenciaClient.tsx"), "utf8",
    ) as string;
    expect(src).toContain("ASISTENCIA_PANTALLA_2026_09 && celular && !hayTab");
    // 🔑 El parámetro CRUDO, no `useUrlState`: la diferencia entre «no eligió
    // nada» y «eligió la primera» es justamente lo que decide esta pantalla.
    expect(src).toContain('sp?.get("tab")');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// D · LA TARJETA, EN EL MÓDULO PURO
// ─────────────────────────────────────────────────────────────────────────────

describe("D · lo que dice la tarjeta", () => {
  it("lo que falló va en su orden, con el mismo formato de la tabla", () => {
    expect(datosDeLaTarjeta({
      ausenciasSinJustificar: 3, vecesTarde: 1, minutosTarde: 16.85, extraMin: 0, diasARevisar: 3,
    }).map((d) => d.texto)).toEqual(["3 ausencias", "1 tardanza de 16.85 min", "3 a revisar"]);
  });
  it("sin nada que mirar lo dice en verde, nunca con ceros", () => {
    const d = datosDeLaTarjeta({
      ausenciasSinJustificar: 0, vecesTarde: 0, minutosTarde: 0, extraMin: 0, diasARevisar: 0,
    });
    expect(d).toHaveLength(1);
    expect(d[0].texto).toBe(SIN_NADA_QUE_REVISAR);
    expect(d[0].tono).toBe("verde");
  });
  it("quien no cobra horas extra no muestra minutos de extra", () => {
    const d = datosDeLaTarjeta(
      { ausenciasSinJustificar: 0, vecesTarde: 0, minutosTarde: 0, extraMin: 120, diasARevisar: 0 },
      { cuentaHorasExtra: false },
    );
    expect(d[0].texto).toBe(SIN_NADA_QUE_REVISAR);
  });
  it("sin hora de salida configurada no se inventa una", () => {
    expect(lineaDeDias(6, null)).toBe("6 días");
    expect(lineaDeDias(1, "18:30")).toBe("1 día · sale 18:30");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// E · EL RELOJ: LIMPIO CUANDO TODO ESTÁ BIEN, A LA VISTA CUANDO NO
// ─────────────────────────────────────────────────────────────────────────────

function servirRelojes(relojes: unknown[]) {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const u = String(url);
    if (u.includes("/api/asistencia/reporte")) return { ok: true, status: 200, json: async () => RESPUESTA } as Response;
    if (u.includes("/api/asistencia/reloj")) return { ok: true, status: 200, json: async () => ({ relojes }) } as Response;
    return { ok: true, status: 200, json: async () => ({ motivos: [], justificaciones: [], personas: [] }) } as Response;
  }));
}

const RELOJ = (salud: string, titulo: string) => ({
  dispositivo: `reloj ${salud}`, salud, titulo, detalle: null,
  pedidoPendiente: false, pedidoSinRespuesta: false, leidoHasta: null,
});

describe("E · el reloj en la computadora", () => {
  it("🔴 con TODOS al día no se dibuja: está a un toque, en el «···»", async () => {
    aparato(false);
    servirRelojes([RELOJ("al_dia", "Las marcaciones están entrando solas")]);
    montarReporte();
    await screen.findByText("Ana Trejos");
    expect(screen.queryByText("Las marcaciones están entrando solas")).toBeNull();
    expect(screen.queryByRole("button", { name: /Traer ahora/ })).toBeNull();
  });

  it("🔴 y se ve SIN tocar nada en cuanto uno no está entrando — los números de abajo están incompletos", async () => {
    aparato(false);
    servirRelojes([
      RELOJ("al_dia", "Las marcaciones están entrando solas"),
      RELOJ("callado", "Hace 3 horas que no entra una marcación"),
    ]);
    montarReporte();
    expect(await screen.findByText("Hace 3 horas que no entra una marcación")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /Traer ahora/ }).length).toBeGreaterThan(0);
  });

  it("🔴 el «···» lo abre igual cuando todo está bien", async () => {
    aparato(false);
    servirRelojes([RELOJ("al_dia", "Las marcaciones están entrando solas")]);
    montarReporte();
    await screen.findByText("Ana Trejos");
    fireEvent.click(screen.getByRole("button", { name: "Los relojes" }));
    expect(await screen.findByText("Las marcaciones están entrando solas")).toBeTruthy();
  });
});

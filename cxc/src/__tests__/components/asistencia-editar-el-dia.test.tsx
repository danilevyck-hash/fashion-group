/**
 * ─────────────────────────────────────────────────────────────────────────────
 * EL DÍA COMPLETO SE ARREGLA EN LA FILA — EN LA PANTALLA DE VERDAD (19-sep-2026).
 *
 * La regla pura y el servidor están en `lib/asistencia-editar-el-dia.test.ts`.
 * Acá se renderiza `ReporteTab` con datos y se mira lo que la contadora ve:
 * tocar una hora vuelve la celda escribible, se arreglan las cuatro a la vez,
 * hay UN porqué y UN botón, y se manda UNA sola petición con todo el día.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor, within } from "@testing-library/react";

import { ToastProvider } from "@/components/ToastSystem";
import { REGLAS_DEFAULT } from "@/lib/asistencia/config";
import { MOTIVOS_JUSTIFICACION } from "@/lib/asistencia/motivos";
import { GUARDAR_EL_DIA } from "@/lib/asistencia/editar-el-dia";
// 🔄 25-sep-2026: Daniel pidió que tocar una hora abra SOLO esa casilla
// (`panel-del-dia.ts`). Lo que este archivo cuida —que se edite EN LA FILA sin
// ventana, que haya UN porqué y UN botón, que la hora igual no viaje, que
// editar no obligue a deshacer y que «Deshacer» se quede— no cambió: lo que se
// reescribió es cuántas casillas se abren de un toque. El rótulo del botón sale
// del módulo (`rotuloGuardar`) para que el candado siga los dos estados del
// interruptor sin cablear un texto.
import { ARREGLAR_EL_DIA, OTRO_MOTIVO, rotuloGuardar } from "@/lib/asistencia/panel-del-dia";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/asistencia",
  useSearchParams: () => new URLSearchParams(""),
}));

import ReporteTab from "@/app/asistencia/ReporteTab";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

type Llamada = { url: string; init?: RequestInit };
function servir(respuestas: Array<[string, unknown]>, llamadas: Llamada[] = []) {
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    llamadas.push({ url: u, init });
    const par = respuestas.find(([frag]) => u.includes(frag));
    return { ok: true, status: 200, json: async () => par?.[1] ?? {} } as Response;
  }));
  return llamadas;
}
const montar = (ui: React.ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);

const dia = (over: Record<string, unknown>) => ({
  fecha: "2026-08-31", marcas: [], marcasIds: [], entrada: null, salida: null,
  tardeMin: 0, excesoAlmuerzoMin: 0, salidaTempranaMin: 0, extraMin: 0, trabajadoMin: 0,
  revisar: false, ausente: false, justificado: null, feriado: null, habil: true,
  correcciones: [], repetidas: [], ...over,
});

/** Un día de CUATRO marcas, el 82 % de los días: la fila normal. */
const CUATRO = dia({
  fecha: "2026-08-31",
  marcas: ["08:04:11", "12:01:00", "13:00:00", "17:30:02"],
  marcasIds: ["m1", "m2", "m3", "m4"],
  tardeMin: 4.18,
});

/** Un día con UNA sola marca: le faltan tres (el caso más común de todos). */
const UNA = dia({
  fecha: "2026-09-01",
  marcas: ["08:00:00"],
  marcasIds: ["m1"],
  revisar: true,
});

/** Un día con una hora YA corregida: editarla no puede pedir deshacer antes. */
const CORREGIDO = dia({
  fecha: "2026-09-02",
  marcas: ["08:00:00", "17:00:00"],
  marcasIds: ["m1", "m2"],
  correcciones: [{
    id: "cVieja", hora: "08:00:00", relojHora: "08:14:22", agregada: false,
    quitada: false, motivo: "el reloj se adelantó", creadaPor: "yulissa",
    creadaEn: "2026-09-02T14:00:00Z",
  }],
});

const PERSONA = {
  codigo: "26", nombre: "YULISSA JUAREZ", salida: "17:00", almuerzoMin: 30,
  dias: [CUATRO, UNA, CORREGIDO],
  resumen: {
    diasTrabajados: 3, ausenciasSinJustificar: 0, ausenciasJustificadas: 0, diasTrabajandoFuera: 0,
    vecesTarde: 1, minutosTarde: 4.18, minutosTardeDeDiasARevisar: 0,
    excesoAlmuerzoMin: 0, salidaTempranaMin: 0, tiempoNoTrabajadoMin: 4.18, extraMin: 0,
    diasARevisar: 1, diasCorregidos: 1,
  },
};

const base = (over: Record<string, unknown> = {}): Array<[string, unknown]> => [
  ["/api/asistencia/reloj", { relojes: [] }],
  ["/api/asistencia/justificaciones", { justificaciones: [], personas: [], motivos: MOTIVOS_JUSTIFICACION }],
  ["/correcciones/motivos", { motivos: ["Se le olvidó marcar", "Reloj sin internet"] }],
  ["/api/asistencia/correcciones/dia", { ok: true, aplicados: 1, errores: [] }],
  ["/api/asistencia/reporte", {
    personas: [PERSONA], sinHorario: 0, reglas: REGLAS_DEFAULT,
    correccionesDisponible: true, ...over,
  }],
];

async function abrirPersona() {
  fireEvent.click(await screen.findByText("Yulissa Juarez"));
  await screen.findByText("lun 31 ago");
}
/** La fila del día que empieza con esa fecha corta («mié 2 sep»). */
const filaDe = (fecha: string) =>
  screen.getByText((_t, el) => el?.tagName === "TD" && el.textContent?.trim().endsWith(fecha) === true
    && el.getAttribute("colspan") === null)
    .closest("tr") as HTMLTableRowElement;
const camposHora = () =>
  // 🔑 SOLO las cuatro casillas de HORA (`aria-label="Hora m0"`…): desde el
  // 24-sep-2026 el editor trae además el campo «Hoy entraba a las», que es otra
  // cosa y tiene su propio candado (`entrada-autorizada.test.ts`).
  Array.from(document.querySelectorAll('input[type="time"][aria-label^="Hora "]')) as HTMLInputElement[];

// ─────────────────────────────────────────────────────────────────────────────
// A. TOCAR UNA HORA ABRE EL EDITOR EN LA MISMA FILA — sin ventana
// ─────────────────────────────────────────────────────────────────────────────

describe("A · se edita en la fila, no en una ventana", () => {
  it("antes de tocar nada no hay campos escribibles ni botón de guardar", async () => {
    servir(base());
    montar(<ReporteTab />);
    await abrirPersona();
    expect(camposHora()).toHaveLength(0);
    expect(screen.queryByRole("button", { name: rotuloGuardar() })).toBeNull();
  });

  it("🔴 tocar una hora la vuelve escribible AHÍ MISMO, y solo esa (25-sep-2026)", async () => {
    servir(base());
    montar(<ReporteTab />);
    await abrirPersona();
    fireEvent.click(screen.getByText("08:04:11"));
    // UN campo, el de la hora que se tocó. Y ninguna ventana encima.
    await waitFor(() => expect(camposHora()).toHaveLength(1));
    expect(camposHora()[0].value).toBe("08:04:11");
    expect(screen.queryByText(/el reloj marcó/)).toBeNull();
    // Las otras tres siguen siendo horas tocables: tocar otra cambia de casilla.
    fireEvent.click(screen.getByText("13:00:00"));
    await waitFor(() => expect(camposHora()[0].value).toBe("13:00:00"));
    expect(camposHora()).toHaveLength(1);
  });

  it("🔴 tocar un HUECO también abre el editor: la marca que falta es el caso común", async () => {
    servir(base());
    montar(<ReporteTab />);
    await abrirPersona();
    const fila = filaDe("1 sep");
    // Ese día tiene UNA marca: las otras tres columnas son huecos («—»).
    fireEvent.click(within(fila).getAllByRole("button", { name: "—" })[0]);
    await waitFor(() => expect(camposHora()).toHaveLength(1));
    // 🔄 25-sep-2026: se abre el HUECO que se tocó, no las cuatro casillas.
    expect(camposHora()).toHaveLength(1);
    expect(camposHora()[0].value).toBe("");
  });

  it("un solo día se edita a la vez, y «Cancelar» lo cierra sin guardar nada", async () => {
    const llamadas = servir(base());
    montar(<ReporteTab />);
    await abrirPersona();
    fireEvent.click(screen.getByText("08:04:11"));
    await waitFor(() => expect(camposHora()).toHaveLength(1));
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(camposHora()).toHaveLength(0));
    expect(llamadas.filter((l) => l.init?.method === "POST")).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B. UN PORQUÉ, UN BOTÓN, UNA PETICIÓN CON TODO EL DÍA
// ─────────────────────────────────────────────────────────────────────────────

describe("B · un porqué y un botón para todo el día", () => {
  it("🔴 el botón está apagado sin porqué y DICE qué falta", async () => {
    servir(base());
    montar(<ReporteTab />);
    await abrirPersona();
    fireEvent.click(screen.getByText("08:04:11"));
    await waitFor(() => expect(camposHora()).toHaveLength(1));
    const guardar = () => screen.getByRole("button", { name: rotuloGuardar() }) as HTMLButtonElement;
    // Sin cambios: no hay nada que hacer, y se dice.
    expect(guardar().disabled).toBe(true);
    expect(screen.getByText("Todavía no cambiaste nada")).toBeTruthy();
    fireEvent.change(camposHora()[0], { target: { value: "08:00" } });
    expect(guardar().disabled).toBe(true);
    expect(screen.getByText("Falta: el porqué")).toBeTruthy();
  });

  it("los motivos más usados se piden UNA vez y tocar uno escribe en el campo", async () => {
    const llamadas = servir(base());
    montar(<ReporteTab />);
    await abrirPersona();
    fireEvent.click(screen.getByText("08:04:11"));
    await waitFor(() => expect(camposHora()).toHaveLength(1));
    // Una sola lectura de motivos para toda la pantalla, no una por fila.
    expect(llamadas.filter((l) => l.url.includes("/correcciones/motivos"))).toHaveLength(1);
    // 🔄 25-sep-2026: los más usados siguen valiendo; viven bajo «Otro…», al
    // lado del motivo que aplica a la casilla que se tocó.
    fireEvent.click(screen.getByRole("button", { name: OTRO_MOTIVO }));
    const chip = await screen.findByRole("button", { name: "Se le olvidó marcar" });
    fireEvent.click(chip);
    const porque = document.querySelector('input[placeholder="Escribe el motivo…"]') as HTMLInputElement;
    expect(porque.value).toBe("Se le olvidó marcar");
  });

  it("🔴 la casilla tocada viaja en UNA sola petición, con UN motivo, y la hora IGUAL no viaja", async () => {
    const llamadas = servir(base());
    montar(<ReporteTab />);
    await abrirPersona();
    fireEvent.click(screen.getByText("08:04:11"));
    await waitFor(() => expect(camposHora()).toHaveLength(1));
    // 🔴 NADA SE APLICA SOLO. Escribir la MISMA hora que ya valía no es un
    // cambio: el botón se queda apagado y lo dice.
    fireEvent.change(camposHora()[0], { target: { value: "08:04" } });
    expect((screen.getByRole("button", { name: rotuloGuardar() }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("Todavía no cambiaste nada")).toBeTruthy();

    // 🔄 25-sep-2026: se arregla UNA casilla por vez, así que la petición lleva
    // UN cambio —el de la hora que se tocó— y ni una de las otras tres.
    fireEvent.change(camposHora()[0], { target: { value: "08:00" } });
    fireEvent.click(screen.getByRole("button", { name: OTRO_MOTIVO }));
    fireEvent.change(
      await screen.findByPlaceholderText("Escribe el motivo…"),
      { target: { value: "el reloj se adelantó" } },
    );
    fireEvent.click(screen.getByRole("button", { name: rotuloGuardar() }));

    await waitFor(() => {
      expect(llamadas.filter((l) => l.url.includes("/correcciones/dia"))).toHaveLength(1);
    });
    const post = llamadas.find((l) => l.url.includes("/correcciones/dia"));
    const body = JSON.parse(String(post?.init?.body));
    expect(body.codigo).toBe("26");
    expect(body.fecha).toBe("2026-08-31");
    expect(body.motivo).toBe("el reloj se adelantó");
    expect(body.cambios).toHaveLength(1);
    // 🔑 08:04:11 → «08:00»: la hora:minuto CAMBIÓ, así que los segundos del
    // reloj no se arrastran y va :00. Es la regla de `completarSegundos`.
    expect(body.cambios[0]).toMatchObject({ clave: "m0", marcacionId: "m1", hora: "08:00:00" });
  });

  it("🔴 editar una hora YA corregida no pide deshacer antes: reemplaza la anterior", async () => {
    const llamadas = servir(base());
    montar(<ReporteTab />);
    await abrirPersona();
    const fila = filaDe("2 sep");
    fireEvent.click(within(fila).getByText("08:00:00"));
    await waitFor(() => expect(camposHora().length).toBeGreaterThan(0));
    fireEvent.change(camposHora()[0], { target: { value: "08:10" } });
    fireEvent.click(screen.getByRole("button", { name: OTRO_MOTIVO }));
    fireEvent.change(
      await screen.findByPlaceholderText("Escribe el motivo…"),
      { target: { value: "era la 8:10" } },
    );
    fireEvent.click(screen.getByRole("button", { name: rotuloGuardar() }));
    await waitFor(() => {
      expect(llamadas.filter((l) => l.url.includes("/correcciones/dia"))).toHaveLength(1);
    });
    const body = JSON.parse(String(llamadas.find((l) => l.url.includes("/correcciones/dia"))?.init?.body));
    expect(body.cambios[0]).toMatchObject({ marcacionId: "m1", reemplaza: "cVieja", hora: "08:10:00" });
    // Y NO se llamó al DELETE de deshacer: ese viaje es el que se ahorró.
    expect(llamadas.filter((l) => l.init?.method === "DELETE")).toHaveLength(0);
  });

  it("quitar una marca del reloj viaja con `quitar` y sin hora", async () => {
    const llamadas = servir(base());
    montar(<ReporteTab />);
    await abrirPersona();
    // 🔄 25-sep-2026: «Quitar» sale SOLO en la casilla abierta. Se toca la
    // marca que sobra (12:01:00) y se quita ahí.
    fireEvent.click(screen.getByText("12:01:00"));
    await waitFor(() => expect(camposHora()).toHaveLength(1));
    const quitar = screen.getAllByRole("button", { name: "Quitar" });
    expect(quitar).toHaveLength(1);
    fireEvent.click(quitar[0]);
    fireEvent.click(screen.getByRole("button", { name: OTRO_MOTIVO }));
    fireEvent.change(
      await screen.findByPlaceholderText("Escribe el motivo…"),
      { target: { value: "marcó dos veces" } },
    );
    fireEvent.click(screen.getByRole("button", { name: rotuloGuardar() }));
    await waitFor(() => {
      expect(llamadas.filter((l) => l.url.includes("/correcciones/dia"))).toHaveLength(1);
    });
    const body = JSON.parse(String(llamadas.find((l) => l.url.includes("/correcciones/dia"))?.init?.body));
    expect(body.cambios).toEqual([
      { clave: "m1", tipo: "quitar", marcacionId: "m2", reemplaza: null, hora: null },
    ]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C. «DESHACER» SE QUEDA, PARA LO YA GUARDADO
// ─────────────────────────────────────────────────────────────────────────────

describe("C · deshacer lo ya guardado", () => {
  it("🔴 la línea de la corrección tiene «Deshacer», y llama al DELETE de siempre", async () => {
    const llamadas = servir(base());
    montar(<ReporteTab />);
    await abrirPersona();
    const deshacer = await screen.findByRole("button", { name: "Deshacer" });
    fireEvent.click(deshacer);
    await waitFor(() => {
      const del = llamadas.find((l) => l.init?.method === "DELETE");
      expect(del?.url).toContain("/api/asistencia/correcciones?id=cVieja");
    });
  });

  it("sin poder corregir (falta la migración) no hay editor ni «Deshacer»", async () => {
    servir(base({ correccionesDisponible: false }));
    montar(<ReporteTab />);
    await abrirPersona();
    fireEvent.click(screen.getByText("08:04:11"));
    expect(camposHora()).toHaveLength(0);
    expect(screen.queryByRole("button", { name: "Deshacer" })).toBeNull();
    // 🔴 Y NI EL HUECO NI EL ENLACE SE OFRECEN: un control que siempre falla es
    // peor que no tenerlo. El día de una sola marca tiene tres huecos, y con la
    // migración sin correr NINGUNO es tocable.
    const fila = filaDe("1 sep");
    expect(within(fila).queryAllByRole("button", { name: "—" })).toHaveLength(0);
    expect(within(fila).queryByRole("button", { name: ARREGLAR_EL_DIA })).toBeNull();
  });
});

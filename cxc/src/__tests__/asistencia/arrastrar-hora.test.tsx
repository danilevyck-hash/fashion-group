/**
 * ─────────────────────────────────────────────────────────────────────────────
 * 🔴 ARRASTRAR UNA HORA DE COLUMNA (25-sep-2026).
 *
 * En el detalle del colaborador, la hora se agarra y se suelta en su columna:
 * la marca suelta de la línea de abajo, y también una hora que ya está en una
 * columna. Al soltar, la casilla de destino se abre con la hora puesta, el
 * porqué se escribe solo y quedan «Guardar · Cancelar». **Soltar no guarda.**
 *
 * 🔴 EL CANDADO QUE MÁS IMPORTA es el de la sección C: **lo que viaja al
 * servidor es IDÉNTICO al de teclear la hora a mano**. Arrastrar cambia cómo se
 * captura, no qué se guarda: mismo `POST /api/asistencia/correcciones/dia`,
 * mismo cuerpo, mismos cambios, nada nuevo en la base.
 *
 * La regla pura vive en `lib/asistencia/arrastrar-hora.ts`; el motor de qué se
 * escribe sigue siendo `editar-el-dia.ts` y NO se tocó.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";

import { ToastProvider } from "@/components/ToastSystem";
import { REGLAS_DEFAULT } from "@/lib/asistencia/config";
import { MOTIVOS_JUSTIFICACION } from "@/lib/asistencia/motivos";
import { casillasDelDia, planDelDia, type EscritoEnCasilla } from "@/lib/asistencia/editar-el-dia";
import {
  AVISO_DESORDEN, AVISO_MISMA_COLUMNA, AVISO_NO_ES_DEL_RELOJ, MOTIVO_ARRASTRE,
  avisoOcupada, columnasDespues, enOrden, escritoDelArrastre, puedeSoltar,
  rotuloMoverAqui, type HoraArrastrada,
} from "@/lib/asistencia/arrastrar-hora";

// ─────────────────────────────────────────────────────────────────────────────
// El interruptor se prende y se apaga desde acá, para poder comparar las DOS
// pantallas en el mismo archivo. Del módulo real solo se reemplaza el valor del
// interruptor; la regla recibe ese mismo valor por su parámetro `activo`.
// ─────────────────────────────────────────────────────────────────────────────
let arrastrePrendido = true;
vi.mock("@/lib/asistencia/arrastrar-hora", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/asistencia/arrastrar-hora")>();
  type Opts = Record<string, unknown>;
  return {
    ...real,
    get ARRASTRAR_HORA() { return arrastrePrendido; },
    puedeSoltar: (o: Opts) => real.puedeSoltar({ ...o, activo: o.activo ?? arrastrePrendido } as never),
  };
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/asistencia",
  useSearchParams: () => new URLSearchParams(""),
}));

import ReporteTab from "@/app/asistencia/ReporteTab";

beforeEach(() => { arrastrePrendido = true; });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

// ═════════════════════════════════════════════════════════════════════════════
// LOS DATOS — el jueves 17 de septiembre de Esmer Cruz, el del mockup: TRES
// marcas donde van cuatro. La del medio (13:14:49) baja a la línea de abajo.
// ═════════════════════════════════════════════════════════════════════════════

const ENTRADA = "07:53:34";
const SUELTA = "13:14:49";
const SALIDA = "13:48:07";

const dia = (over: Record<string, unknown>) => ({
  fecha: "2026-09-17", marcas: [], marcasIds: [], entrada: null, salida: null,
  tardeMin: 0, excesoAlmuerzoMin: 0, salidaTempranaMin: 0, extraMin: 0, trabajadoMin: 0,
  revisar: false, ausente: false, justificado: null, feriado: null, habil: true,
  correcciones: [], repetidas: [], ...over,
});

const EL_DIA = dia({
  fecha: "2026-09-17",
  marcas: [ENTRADA, SUELTA, SALIDA],
  marcasIds: ["mEnt", "mMed", "mSal"],
  revisar: true,
});

const PERSONA = (dias: unknown[] = [EL_DIA]) => ({
  codigo: "12", nombre: "ESMER CRUZ", salida: "16:30", almuerzoMin: 30,
  dias,
  resumen: {
    diasTrabajados: 1, ausenciasSinJustificar: 0, ausenciasJustificadas: 0, diasTrabajandoFuera: 0,
    vecesTarde: 0, minutosTarde: 0, minutosTardeDeDiasARevisar: 0,
    excesoAlmuerzoMin: 0, salidaTempranaMin: 0, tiempoNoTrabajadoMin: 0, extraMin: 0,
    diasARevisar: 1, diasCorregidos: 0,
  },
});

type Llamada = { url: string; init?: RequestInit };
function servir(llamadas: Llamada[] = []) {
  const respuestas: Array<[string, unknown]> = [
    ["/api/asistencia/reloj", { relojes: [] }],
    ["/api/asistencia/justificaciones", { justificaciones: [], personas: [], motivos: MOTIVOS_JUSTIFICACION }],
    ["/correcciones/motivos", { motivos: [] }],
    ["/api/asistencia/correcciones/dia", { ok: true, aplicados: 2, errores: [] }],
    ["/api/asistencia/reporte", {
      personas: [PERSONA()], sinHorario: 0, reglas: REGLAS_DEFAULT, correccionesDisponible: true,
    }],
  ];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    llamadas.push({ url: u, init });
    const par = respuestas.find(([frag]) => u.includes(frag));
    return { ok: true, status: 200, json: async () => par?.[1] ?? {} } as Response;
  }));
  return llamadas;
}
const montar = (ui: React.ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);

async function abrirPersona() {
  fireEvent.click(await screen.findByText("Esmer Cruz"));
  await screen.findByText("jue 17 sep");
}

/** Un `dataTransfer` de mentira: jsdom no trae uno. */
const bandeja = () => ({
  setData: vi.fn(), getData: () => "", effectAllowed: "", dropEffect: "",
});

/** La celda (`<td>`) de la columna `c`, contando desde «Entrada». */
function celdaDeColumna(c: number): HTMLElement {
  const fila = screen.getByText("jue 17 sep").closest("tr") as HTMLElement;
  const celdas = Array.from(fila.querySelectorAll("td"));
  // La primera celda es la fecha; de ahí salen las cuatro columnas del día.
  return celdas[1 + c] as HTMLElement;
}

/** Agarra la hora `texto` y la suelta en la columna `c`. */
function arrastrar(texto: string, c: number) {
  const dataTransfer = bandeja();
  const origen = screen.getByText(texto);
  fireEvent.dragStart(origen, { dataTransfer });
  const destino = celdaDeColumna(c);
  fireEvent.dragOver(destino, { dataTransfer });
  fireEvent.drop(destino, { dataTransfer });
}

const camposHora = () =>
  Array.from(document.querySelectorAll('input[type="time"][aria-label^="Hora "]')) as HTMLInputElement[];

// ═════════════════════════════════════════════════════════════════════════════
// A · LA REGLA PURA — qué movimiento vale
// ═════════════════════════════════════════════════════════════════════════════

/** Las tres marcas del día de Esmer, ya repartidas como las ve la pantalla. */
const HORAS_POR_COLUMNA = [ENTRADA, null, null, SALIDA] as const;
const LA_SUELTA: HoraArrastrada = { clave: "m1", hora: SUELTA, columna: null, esDelReloj: true };
const LA_SALIDA: HoraArrastrada = { clave: "m2", hora: SALIDA, columna: 3, esDelReloj: true };

describe("A · la regla pura", () => {
  it("🔴 una marca SUELTA se puede soltar en una columna vacía", () => {
    expect(puedeSoltar({ origen: LA_SUELTA, destino: 1, horasPorColumna: HORAS_POR_COLUMNA }))
      .toEqual({ ok: true });
    expect(puedeSoltar({ origen: LA_SUELTA, destino: 2, horasPorColumna: HORAS_POR_COLUMNA }))
      .toEqual({ ok: true });
  });

  it("🔴 y lo que se escribe son DOS cosas: la hora en el destino y el origen vacío", () => {
    expect(escritoDelArrastre(LA_SUELTA, 1)).toEqual([
      ["v1", { hora: SUELTA, quitar: false }],
      ["m1", { hora: "", quitar: true }],
    ]);
  });

  it("🔴 una hora que ya está en una columna se mueve a otra: 13:48 de «Salida» a «Vuelve»", () => {
    expect(puedeSoltar({ origen: LA_SALIDA, destino: 2, horasPorColumna: HORAS_POR_COLUMNA }))
      .toEqual({ ok: true });
    expect(columnasDespues(HORAS_POR_COLUMNA, LA_SALIDA, 2))
      .toEqual([ENTRADA, null, SALIDA, null]);
  });

  it("🔴 NO se suelta en una columna que ya tiene hora — una hora por columna", () => {
    expect(puedeSoltar({ origen: LA_SUELTA, destino: 3, horasPorColumna: HORAS_POR_COLUMNA }))
      .toEqual({ ok: false, aviso: avisoOcupada(3) });
    expect(avisoOcupada(3)).toContain("Salida");
  });

  it("🔴 NO se suelta si el día queda desordenado", () => {
    // La salida marcada a las 13:14 y una suelta a las 13:48: ponerla en
    // «Sale almz.» dejaría el almuerzo DESPUÉS de la salida.
    const horas = [ENTRADA, null, null, SUELTA] as const;
    const tarde: HoraArrastrada = { clave: "m1", hora: SALIDA, columna: null, esDelReloj: true };
    expect(puedeSoltar({ origen: tarde, destino: 1, horasPorColumna: horas }))
      .toEqual({ ok: false, aviso: AVISO_DESORDEN });
    expect(enOrden([ENTRADA, SALIDA, null, SUELTA])).toBe(false);
    expect(enOrden([ENTRADA, SUELTA, null, SALIDA])).toBe(true);
  });

  it("🔴 soltar donde ya está no es mover", () => {
    expect(puedeSoltar({ origen: LA_SALIDA, destino: 3, horasPorColumna: HORAS_POR_COLUMNA }))
      .toEqual({ ok: false, aviso: AVISO_MISMA_COLUMNA });
  });

  it("🔴 una hora AGREGADA a mano no se mueve: se deshace su corrección", () => {
    const aMano: HoraArrastrada = { ...LA_SUELTA, esDelReloj: false };
    expect(puedeSoltar({ origen: aMano, destino: 1, horasPorColumna: HORAS_POR_COLUMNA }))
      .toEqual({ ok: false, aviso: AVISO_NO_ES_DEL_RELOJ });
  });

  it("apagado, no se suelta nada", () => {
    expect(puedeSoltar({
      origen: LA_SUELTA, destino: 1, horasPorColumna: HORAS_POR_COLUMNA, activo: false,
    }).ok).toBe(false);
  });

  it("el rótulo sin ratón nombra la hora cuando hay más de una suelta", () => {
    expect(rotuloMoverAqui(SUELTA, 1)).toBe("Mover aquí la marca suelta");
    expect(rotuloMoverAqui(SUELTA, 2)).toBe(`Mover aquí ${SUELTA}`);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// B · LA PANTALLA
// ═════════════════════════════════════════════════════════════════════════════

describe("B · arrastrar en el Reporte", () => {
  it("🔴 la suelta se agarra y se suelta en «Sale almz.»: la casilla queda con la hora", async () => {
    servir();
    montar(<ReporteTab />);
    await abrirPersona();
    arrastrar(SUELTA, 1);
    await waitFor(() => expect(camposHora()).toHaveLength(1));
    expect(camposHora()[0].getAttribute("aria-label")).toBe("Hora v1");
    expect(camposHora()[0].value).toBe(SUELTA);
  });

  it("🔴 y el porqué se escribe solo, con «Guardar» y «Cancelar»", async () => {
    servir();
    montar(<ReporteTab />);
    await abrirPersona();
    arrastrar(SUELTA, 1);
    await waitFor(() => expect(camposHora()).toHaveLength(1));
    const porque = document.querySelector('input[placeholder="Escribe el motivo…"]') as HTMLInputElement;
    expect(porque.value).toBe(MOTIVO_ARRASTRE);
    expect(screen.getByRole("button", { name: "Guardar" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeTruthy();
  });

  it("🔴 soltar NO guarda: hasta tocar «Guardar» no se llama al servidor", async () => {
    const llamadas = servir();
    montar(<ReporteTab />);
    await abrirPersona();
    arrastrar(SUELTA, 1);
    await waitFor(() => expect(camposHora()).toHaveLength(1));
    expect(llamadas.filter((l) => l.url.includes("/correcciones/dia"))).toHaveLength(0);
  });

  it("🔴 una hora que ya está en una columna se mueve a otra", async () => {
    servir();
    montar(<ReporteTab />);
    await abrirPersona();
    arrastrar(SALIDA, 2);
    await waitFor(() => expect(camposHora()).toHaveLength(1));
    expect(camposHora()[0].getAttribute("aria-label")).toBe("Hora v2");
    expect(camposHora()[0].value).toBe(SALIDA);
  });

  it("🔴 soltar en una columna ocupada NO escribe nada y DICE por qué", async () => {
    servir();
    montar(<ReporteTab />);
    await abrirPersona();
    arrastrar(SUELTA, 3);
    await screen.findByText(avisoOcupada(3));
    expect(camposHora()).toHaveLength(0);
  });

  it("🔴 lo mismo SIN RATÓN: la casilla ofrece «Mover aquí la marca suelta»", async () => {
    servir();
    montar(<ReporteTab />);
    await abrirPersona();
    // Se toca el hueco de «Sale almz.» y la casilla se abre, vacía.
    fireEvent.click(screen.getAllByRole("button", { name: "—" })[0]);
    await waitFor(() => expect(camposHora()).toHaveLength(1));
    expect(camposHora()[0].value).toBe("");
    fireEvent.click(screen.getByRole("button", { name: rotuloMoverAqui(SUELTA, 1) }));
    await waitFor(() => expect(camposHora()[0].value).toBe(SUELTA));
    const porque = document.querySelector('input[placeholder="Escribe el motivo…"]') as HTMLInputElement;
    expect(porque.value).toBe(MOTIVO_ARRASTRE);
  });

  it("apagado, la hora NO se puede agarrar y todo queda como hoy", async () => {
    arrastrePrendido = false;
    servir();
    montar(<ReporteTab />);
    await abrirPersona();
    expect(screen.getByText(SUELTA).getAttribute("draggable")).toBeNull();
    expect(screen.getByText(SALIDA).getAttribute("draggable")).toBeNull();
    // Y tocar la hora sigue abriendo su casilla, como siempre.
    fireEvent.click(screen.getByText(SALIDA));
    await waitFor(() => expect(camposHora()).toHaveLength(1));
    expect(camposHora()[0].value).toBe(SALIDA);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// C · 🔴 LO QUE VIAJA AL SERVIDOR ES LO DE SIEMPRE
// ═════════════════════════════════════════════════════════════════════════════

describe("C · el payload es IDÉNTICO al de teclear la hora a mano", () => {
  /** El mismo movimiento, hecho a mano: se teclea la hora y se toca «Quitar». */
  const A_MANO = new Map<string, EscritoEnCasilla>([
    ["v1", { hora: SUELTA, quitar: false }],
    ["m1", { hora: "", quitar: true }],
  ]);

  it("🔴 el plan del arrastre es el MISMO objeto que el de teclearlo", () => {
    const casillas = casillasDelDia({
      marcas: EL_DIA.marcas as string[],
      marcasIds: EL_DIA.marcasIds as string[],
      correcciones: [],
    });
    const arrastrado = planDelDia(casillas, new Map(escritoDelArrastre(LA_SUELTA, 1)));
    const tecleado = planDelDia(casillas, A_MANO);
    expect(arrastrado).toEqual(tecleado);
  });

  it("🔴 y el cuerpo del POST no trae un solo campo nuevo", async () => {
    const llamadas = servir();
    montar(<ReporteTab />);
    await abrirPersona();
    arrastrar(SUELTA, 1);
    await waitFor(() => expect(camposHora()).toHaveLength(1));
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() =>
      expect(llamadas.filter((l) => l.url.includes("/correcciones/dia")).length).toBe(1));

    const envio = llamadas.find((l) => l.url.includes("/correcciones/dia"))!;
    const cuerpo = JSON.parse(String(envio.init?.body ?? "{}"));
    expect(Object.keys(cuerpo).sort()).toEqual(["cambios", "codigo", "fecha", "motivo"]);
    expect(cuerpo.codigo).toBe("12");
    expect(cuerpo.fecha).toBe("2026-09-17");
    expect(cuerpo.motivo).toBe(MOTIVO_ARRASTRE);

    const casillas = casillasDelDia({
      marcas: EL_DIA.marcas as string[],
      marcasIds: EL_DIA.marcasIds as string[],
      correcciones: [],
    });
    // 🔴 Los cambios son, uno por uno, los de teclear la hora y tocar «Quitar».
    expect(cuerpo.cambios).toEqual(planDelDia(casillas, A_MANO).cambios);
    expect(cuerpo.cambios).toEqual([
      { clave: "m1", tipo: "quitar", marcacionId: "mMed", reemplaza: null, hora: null },
      { clave: "v1", tipo: "agregar", marcacionId: null, reemplaza: null, hora: SUELTA },
    ]);
  });
});

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * 🔴 EL PANEL DEL DÍA ABRE SOLO LA CASILLA QUE SE TOCÓ (25-sep-2026).
 *
 * Daniel, mirando el miércoles 23 de septiembre de Ana Trejos, textual:
 * *«al hacer clic en una hora, que solo se abra el panel de esa casilla y no
 * toda»*; *«¿es necesario saber ahí Teléfono · sin señal…? ¿y ver fotos si ya
 * está en Marcaciones?»*; *«también hay botón de Arreglar día, ¿doble
 * entrada?»*.
 *
 * Acá se renderiza el `ReporteTab` de verdad y se mira lo que la contadora ve.
 * La regla pura vive en `lib/asistencia/panel-del-dia.ts`; el motor de qué se
 * escribe sigue siendo `editar-el-dia.ts` y NO se tocó.
 *
 * 🔴 EL CANDADO QUE MÁS IMPORTA es el último: **lo que viaja al servidor es
 * IDÉNTICO** con el interruptor prendido y apagado. Esto cambia una pantalla,
 * no una corrección.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";

import { ToastProvider } from "@/components/ToastSystem";
import { REGLAS_DEFAULT } from "@/lib/asistencia/config";
import { MOTIVOS_JUSTIFICACION } from "@/lib/asistencia/motivos";
import { avisoEntradaTemprana } from "@/lib/asistencia/entrada-autorizada";
import {
  ARREGLAR_EL_DIA, MOTIVO_DE_LA_CASILLA, NOTA_NO_SE_BORRA_NADA, OTRO_MOTIVO,
  TEXTO_REVISAR, chipRevisar, lineaDelReporte, motivoDeLaCasilla, motivosLibres,
  seMuestraEntradaAutorizada, seOfreceArreglarElDia,
} from "@/lib/asistencia/panel-del-dia";
import { TEXTO_SALIDA_SOSPECHOSA } from "@/lib/asistencia/salida-sospechosa";
import { VER_FOTOS } from "@/lib/asistencia/linea-del-dia";

// ─────────────────────────────────────────────────────────────────────────────
// El interruptor se prende y se apaga desde acá, para poder comparar las DOS
// pantallas en el mismo archivo. El módulo real se importa entero: lo único que
// se reemplaza es el valor del interruptor, y cada función pura recibe ese
// mismo valor por su parámetro `activo` (que es como está escrita la regla).
// ─────────────────────────────────────────────────────────────────────────────
let panelPrendido = true;
vi.mock("@/lib/asistencia/panel-del-dia", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/asistencia/panel-del-dia")>();
  type Opts = Record<string, unknown>;
  const con = (o: Opts) => ({ ...o, activo: o.activo ?? panelPrendido });
  return {
    ...real,
    get PANEL_DEL_DIA_2026_09() { return panelPrendido; },
    rotuloGuardar: (activo?: boolean) => real.rotuloGuardar(activo ?? panelPrendido),
    lineaDelReporte: (o: Opts) => real.lineaDelReporte(con(o) as never),
    chipRevisar: (o: Opts) => real.chipRevisar(con(o) as never),
    seMuestraEntradaAutorizada: (o: Opts) => real.seMuestraEntradaAutorizada(con(o) as never),
    seOfreceArreglarElDia: (o: Opts) => real.seOfreceArreglarElDia(con(o) as never),
  };
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/asistencia",
  useSearchParams: () => new URLSearchParams(""),
}));

import ReporteTab from "@/app/asistencia/ReporteTab";

beforeEach(() => { panelPrendido = true; });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

// ─────────────────────────────────────────────────────────────────────────────
// LOS DATOS — el día de Ana Trejos que Daniel tenía en pantalla.
// ─────────────────────────────────────────────────────────────────────────────

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
  fecha: "2026-09-23", marcas: [], marcasIds: [], entrada: null, salida: null,
  tardeMin: 0, excesoAlmuerzoMin: 0, salidaTempranaMin: 0, extraMin: 0, trabajadoMin: 0,
  revisar: false, ausente: false, justificado: null, feriado: null, habil: true,
  correcciones: [], repetidas: [], ...over,
});

/** El 23-sep de Ana: entrada y salida marcadas, el almuerzo en blanco. */
const EL_DIA = dia({
  fecha: "2026-09-23",
  marcas: ["08:59:08", "18:00:48"],
  marcasIds: ["mEnt", "mSal"],
  revisar: true,
});

/** Un día de CUATRO marcas: la fila normal, el 82 % de los días. */
const CUATRO = dia({
  fecha: "2026-09-22",
  marcas: ["08:04:11", "12:01:00", "13:00:00", "17:30:02"],
  marcasIds: ["m1", "m2", "m3", "m4"],
});

const PERSONA = (dias: unknown[] = [CUATRO, EL_DIA]) => ({
  codigo: "40", nombre: "ANA TREJOS", salida: "18:00", almuerzoMin: 30,
  dias,
  resumen: {
    diasTrabajados: 2, ausenciasSinJustificar: 0, ausenciasJustificadas: 0, diasTrabajandoFuera: 0,
    vecesTarde: 0, minutosTarde: 0, minutosTardeDeDiasARevisar: 0,
    excesoAlmuerzoMin: 0, salidaTempranaMin: 0, tiempoNoTrabajadoMin: 0, extraMin: 0,
    diasARevisar: 1, diasCorregidos: 0,
  },
});

const base = (over: Record<string, unknown> = {}, dias?: unknown[]): Array<[string, unknown]> => [
  ["/api/asistencia/reloj", { relojes: [] }],
  ["/api/asistencia/justificaciones", { justificaciones: [], personas: [], motivos: MOTIVOS_JUSTIFICACION }],
  // 🩸 Estos cuatro son los que Daniel vio juntos: los motivos más usados de 90
  // días, mal escritos y sin orden, ofrecidos toque la casilla que se toque.
  ["/correcciones/motivos", { motivos: [
    "no marco salida", "no marco salida almuerzo", "no marco Entrada", "no marco salida de almuerzo",
  ] }],
  ["/api/asistencia/correcciones/dia", { ok: true, aplicados: 1, errores: [] }],
  ["/api/asistencia/reporte", {
    personas: [PERSONA(dias)], sinHorario: 0, reglas: REGLAS_DEFAULT,
    correccionesDisponible: true, ...over,
  }],
];

async function abrirPersona() {
  fireEvent.click(await screen.findByText("Ana Trejos"));
  await screen.findByText("mié 23 sep");
}
const camposHora = () =>
  Array.from(document.querySelectorAll('input[type="time"][aria-label^="Hora "]')) as HTMLInputElement[];

// ═════════════════════════════════════════════════════════════════════════════
// A · UNA CASILLA A LA VEZ
// ═════════════════════════════════════════════════════════════════════════════

describe("A · tocar una hora abre SOLO esa casilla", () => {
  it("🔴 con cuatro marcas, tocar la salida deja UN campo escribible, el de la salida", async () => {
    servir(base());
    montar(<ReporteTab />);
    await abrirPersona();
    fireEvent.click(screen.getByText("17:30:02"));
    await waitFor(() => expect(camposHora()).toHaveLength(1));
    expect(camposHora()[0].getAttribute("aria-label")).toBe("Hora m3");
    expect(camposHora()[0].value).toBe("17:30:02");
    // Las otras tres siguen siendo horas tocables, no campos.
    expect(screen.getByText("08:04:11").tagName).toBe("BUTTON");
    expect(screen.getByText("12:01:00").tagName).toBe("BUTTON");
  });

  it("🔴 tocar otra hora CAMBIA de casilla: sigue habiendo una sola abierta", async () => {
    servir(base());
    montar(<ReporteTab />);
    await abrirPersona();
    fireEvent.click(screen.getByText("17:30:02"));
    await waitFor(() => expect(camposHora()).toHaveLength(1));
    fireEvent.click(screen.getByText("08:04:11"));
    await waitFor(() => expect(camposHora()[0].getAttribute("aria-label")).toBe("Hora m0"));
    expect(camposHora()).toHaveLength(1);
  });

  it("🔴 «Quitar» sale SOLO en la casilla abierta, nunca en las otras tres", async () => {
    servir(base());
    montar(<ReporteTab />);
    await abrirPersona();
    fireEvent.click(screen.getByText("17:30:02"));
    await waitFor(() => expect(camposHora()).toHaveLength(1));
    expect(screen.getAllByRole("button", { name: "Quitar" })).toHaveLength(1);
  });

  it("🔴 tocar un HUECO abre esa casilla: el almuerzo sin marcar del 23-sep", async () => {
    servir(base());
    montar(<ReporteTab />);
    await abrirPersona();
    // El día de Ana tiene dos marcas: las dos del medio son huecos («—»).
    const huecos = screen.getAllByRole("button", { name: "—" });
    expect(huecos.length).toBeGreaterThan(0);
    fireEvent.click(huecos[0]);
    await waitFor(() => expect(camposHora()).toHaveLength(1));
    expect(camposHora()[0].value).toBe("");
  });

  it("apagado, tocar una hora abre LAS CUATRO — la pantalla de antes, intacta", async () => {
    panelPrendido = false;
    servir(base());
    montar(<ReporteTab />);
    await abrirPersona();
    fireEvent.click(screen.getByText("17:30:02"));
    await waitFor(() => expect(camposHora()).toHaveLength(4));
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// B · EL MOTIVO QUE APLICA A ESA CASILLA
// ═════════════════════════════════════════════════════════════════════════════

describe("B · los motivos son de la casilla, no del día", () => {
  it("🔴 los cuatro rótulos, parejos y en el orden de las columnas", () => {
    expect([...MOTIVO_DE_LA_CASILLA]).toEqual([
      "No marcó entrada",
      "No marcó salida a almuerzo",
      "No marcó vuelta de almuerzo",
      "No marcó salida",
    ]);
    expect(motivoDeLaCasilla(0)).toBe("No marcó entrada");
    expect(motivoDeLaCasilla(3)).toBe("No marcó salida");
    // Una marca suelta, fuera de las cuatro columnas: no tiene motivo propio.
    expect(motivoDeLaCasilla(null)).toBeNull();
    expect(motivoDeLaCasilla(4)).toBeNull();
  });

  it("🔴 el mismo motivo no se ofrece dos veces, aunque esté escrito distinto", () => {
    // «no marco salida» y «No marcó salida» son la MISMA clave.
    expect(motivosLibres(["no marco salida", "Se fue al banco"], "No marcó salida"))
      .toEqual(["Se fue al banco"]);
  });

  it("🔴 tocar la SALIDA ofrece «No marcó salida», y ninguno de los otros tres", async () => {
    servir(base());
    montar(<ReporteTab />);
    await abrirPersona();
    fireEvent.click(screen.getByText("17:30:02"));
    await screen.findByRole("button", { name: "No marcó salida" });
    expect(screen.queryByRole("button", { name: "No marcó entrada" })).toBeNull();
    expect(screen.queryByRole("button", { name: "No marcó salida a almuerzo" })).toBeNull();
    expect(screen.queryByRole("button", { name: "No marcó vuelta de almuerzo" })).toBeNull();
    // 🩸 Y los cuatro frecuentes mal escritos NO están: viven bajo «Otro…».
    expect(screen.queryByRole("button", { name: "no marco salida almuerzo" })).toBeNull();
  });

  it("🔴 tocar la ENTRADA ofrece «No marcó entrada»", async () => {
    servir(base());
    montar(<ReporteTab />);
    await abrirPersona();
    fireEvent.click(screen.getByText("08:04:11"));
    await screen.findByRole("button", { name: "No marcó entrada" });
    expect(screen.queryByRole("button", { name: "No marcó salida" })).toBeNull();
  });

  it("🔴 «Otro…» abre el campo libre con los más usados de 90 días", async () => {
    servir(base());
    montar(<ReporteTab />);
    await abrirPersona();
    fireEvent.click(screen.getByText("17:30:02"));
    await screen.findByRole("button", { name: OTRO_MOTIVO });
    expect(screen.queryByPlaceholderText("Escribe el motivo…")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: OTRO_MOTIVO }));
    await screen.findByPlaceholderText("Escribe el motivo…");
    expect(screen.getByRole("button", { name: "no marco salida almuerzo" })).toBeTruthy();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// C · «HOY ENTRABA A LAS» — SOLO EN LA ENTRADA Y SOLO DESDE 30 MINUTOS
// ═════════════════════════════════════════════════════════════════════════════

describe("C · la entrada autorizada es de la Entrada", () => {
  it("🔴 el umbral no se mueve: 29 min no avisa, 30 sí (regla ya construida)", () => {
    const comun = { entradaProgSeg: 10 * 3600, umbralMin: 30, tieneAutorizacion: false, activo: true };
    expect(avisoEntradaTemprana({ ...comun, entSeg: 10 * 3600 - 29 * 60 })).toBeNull();
    expect(avisoEntradaTemprana({ ...comun, entSeg: 10 * 3600 - 30 * 60 })).toBe(30);
  });

  it("🔴 la regla: solo la columna 0, y solo con aviso o con autorización puesta", () => {
    expect(seMuestraEntradaAutorizada({ columna: 0, entradaTempranaMin: 61, activo: true })).toBe(true);
    expect(seMuestraEntradaAutorizada({ columna: 3, entradaTempranaMin: 61, activo: true })).toBe(false);
    expect(seMuestraEntradaAutorizada({ columna: 0, entradaTempranaMin: null, activo: true })).toBe(false);
    expect(seMuestraEntradaAutorizada({
      columna: 0, entradaTempranaMin: null, tieneEntradaAutorizada: true, activo: true,
    })).toBe(true);
  });

  it("🔴 en pantalla: sale al tocar la entrada de un día con aviso, y no al tocar la salida", async () => {
    const conAviso = dia({
      fecha: "2026-09-22", marcas: ["08:59:00", "18:00:00"], marcasIds: ["a", "b"],
      entradaTempranaMin: 61,
    });
    servir(base({}, [conAviso]));
    montar(<ReporteTab />);
    fireEvent.click(await screen.findByText("Ana Trejos"));
    await screen.findByText("mar 22 sep");

    fireEvent.click(screen.getByText("08:59:00"));
    await screen.findByText("Hoy entraba a las");

    fireEvent.click(screen.getByText("18:00:00"));
    await waitFor(() => expect(screen.queryByText("Hoy entraba a las")).toBeNull());
  });

  it("🔴 en un día SIN aviso no se dibuja, ni tocando la entrada", async () => {
    servir(base());
    montar(<ReporteTab />);
    await abrirPersona();
    fireEvent.click(screen.getByText("08:04:11"));
    await screen.findByRole("button", { name: "No marcó entrada" });
    expect(screen.queryByText("Hoy entraba a las")).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// D · LA LÍNEA DEL TELÉFONO SE VA DEL REPORTE
// ═════════════════════════════════════════════════════════════════════════════

const MARCA_TELEFONO = {
  id: "t1", hora: "8:59", horaLarga: "8:59 a. m.",
  detalle: "Marcada sin señal · el teléfono la envió 22:11",
  relojCorrido: null, quitada: false, tieneFoto: true, lat: 9.1, lng: -79.5,
  sinSenal: true, atrasoMin: 792,
  // 🔑 `conFoto` es como la regla pura ve «hay algo que abrir»; la pantalla lo
  // arma de `tieneFoto || lat !== null`.
  conFoto: true,
};

describe("D · lo del teléfono vive en Marcaciones, no en el Reporte", () => {
  it("🔴 la regla: con el panel prendido no se dice ni «Teléfono» ni «ver fotos»", () => {
    const linea = lineaDelReporte({ marcas: [MARCA_TELEFONO], repetidas: 0, activo: true });
    expect(linea).toBeNull();
    // Apagado sigue diciendo todo, palabra por palabra.
    const antes = lineaDelReporte({ marcas: [MARCA_TELEFONO], repetidas: 0, activo: false });
    expect(antes?.texto).toContain("Teléfono");
    expect(antes?.verFotos).toBe(true);
  });

  it("🔴 lo que no vive en ninguna otra pantalla SE QUEDA: las repetidas", () => {
    const linea = lineaDelReporte({ marcas: [MARCA_TELEFONO], repetidas: 2, activo: true });
    expect(linea?.texto).toBe("2 repetidas");
    expect(linea?.verFotos).toBe(false);
  });

  it("🔴 en pantalla: el día del teléfono ya no dice «sin señal» ni «ver fotos»", async () => {
    servir(base({ marcasTelefono: { "40|2026-09-23": [MARCA_TELEFONO] } }));
    montar(<ReporteTab />);
    await abrirPersona();
    expect(screen.queryByText(/sin señal/)).toBeNull();
    expect(screen.queryByText(/enviada/)).toBeNull();
    expect(screen.queryByRole("button", { name: VER_FOTOS })).toBeNull();
  });

  it("apagado, la línea del teléfono sigue ahí", async () => {
    panelPrendido = false;
    servir(base({ marcasTelefono: { "40|2026-09-23": [MARCA_TELEFONO] } }));
    montar(<ReporteTab />);
    await abrirPersona();
    expect(screen.getByRole("button", { name: VER_FOTOS })).toBeTruthy();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// E · UN SOLO CHIP «REVISAR», Y LA NOTA EN UN ⓘ
// ═════════════════════════════════════════════════════════════════════════════

describe("E · un chip, y la nota en un ⓘ", () => {
  it("🔴 con las dos causas sale UN chip, y el título junta los dos porqués", () => {
    const chip = chipRevisar({
      revisar: true, salidaSospechosa: true, tituloSalida: "Solo hay 2 marcas…", activo: true,
    });
    expect(chip?.texto).toBe(TEXTO_REVISAR);
    expect(chip?.titulo).toContain("4 marcas");
    expect(chip?.titulo).toContain("Solo hay 2 marcas…");
    expect(chipRevisar({ revisar: false, salidaSospechosa: false, activo: true })).toBeNull();
  });

  it("🔴 en pantalla no hay dos chips ámbar: «Revisar salida» ya no existe", async () => {
    const sospechoso = dia({
      fecha: "2026-09-22", marcas: ["08:04:00", "12:07:00"], marcasIds: ["a", "b"],
      revisar: true, salidaSospechosa: true, salidaTempranaMin: 292,
    });
    servir(base({}, [sospechoso]));
    montar(<ReporteTab />);
    fireEvent.click(await screen.findByText("Ana Trejos"));
    await screen.findByText("mar 22 sep");
    expect(screen.queryByText(TEXTO_SALIDA_SOSPECHOSA)).toBeNull();
    expect(screen.getAllByText(TEXTO_REVISAR)).toHaveLength(1);
  });

  it("🔴 la nota «No se borra nada…» no ocupa la pantalla: se lee al tocar el ⓘ", async () => {
    servir(base());
    montar(<ReporteTab />);
    await abrirPersona();
    fireEvent.click(screen.getByText("17:30:02"));
    const info = await screen.findByRole("button", { name: "Qué pasa al guardar" });
    expect(screen.queryByText(NOTA_NO_SE_BORRA_NADA)).toBeNull();
    // El texto no cambia una letra: vive en el `title` y sale al tocarlo.
    expect(info.getAttribute("title")).toBe(NOTA_NO_SE_BORRA_NADA);
    fireEvent.click(info);
    await screen.findByText(NOTA_NO_SE_BORRA_NADA);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// F · «ARREGLAR EL DÍA» — LA SEGUNDA PUERTA
// ═════════════════════════════════════════════════════════════════════════════

describe("F · «Arreglar el día» queda donde no hay hora que tocar", () => {
  it("🔴 la regla: con marcas, no; sin marcas, sí", () => {
    expect(seOfreceArreglarElDia({ marcas: 4, activo: true })).toBe(false);
    expect(seOfreceArreglarElDia({ marcas: 2, activo: true })).toBe(false);
    expect(seOfreceArreglarElDia({ marcas: 0, activo: true })).toBe(true);
    // Apagado sale siempre, como hoy.
    expect(seOfreceArreglarElDia({ marcas: 4, activo: false })).toBe(true);
  });

  it("🔴 un día con horas ya no ofrece el botón: cada hora y cada hueco es la puerta", async () => {
    servir(base({}, [CUATRO]));
    montar(<ReporteTab />);
    fireEvent.click(await screen.findByText("Ana Trejos"));
    await screen.findByText("mar 22 sep");
    expect(screen.queryByRole("button", { name: ARREGLAR_EL_DIA })).toBeNull();
  });

  it("🔴 el día SIN NI UNA MARCA sí lo ofrece, y abre la casilla de la Entrada", async () => {
    const sinMarcas = dia({ fecha: "2026-09-22", marcas: [], marcasIds: [] });
    servir(base({}, [sinMarcas]));
    montar(<ReporteTab />);
    fireEvent.click(await screen.findByText("Ana Trejos"));
    await screen.findByText("mar 22 sep");
    fireEvent.click(screen.getByRole("button", { name: ARREGLAR_EL_DIA }));
    await waitFor(() => expect(camposHora()).toHaveLength(1));
    expect(camposHora()[0].getAttribute("aria-label")).toBe("Hora v0");
    expect(screen.getByRole("button", { name: "No marcó entrada" })).toBeTruthy();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// G · 🔴 LO QUE SE GUARDA ES EXACTAMENTE LO MISMO
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Se hace la MISMA corrección con el interruptor prendido y apagado —cambiar la
 * hora de salida del día de cuatro marcas, con el mismo porqué escrito a mano— y
 * se comparan los dos cuerpos que salieron. Si no son iguales, esto dejó de ser
 * un cambio de pantalla.
 */
async function corregirLaSalidaYDevolverElCuerpo(): Promise<unknown> {
  const llamadas = servir(base({}, [CUATRO]));
  montar(<ReporteTab />);
  fireEvent.click(await screen.findByText("Ana Trejos"));
  await screen.findByText("mar 22 sep");

  fireEvent.click(screen.getByText("17:30:02"));
  await waitFor(() => expect(camposHora().length).toBeGreaterThan(0));
  const campo = camposHora().find((i) => i.getAttribute("aria-label") === "Hora m3")!;
  fireEvent.change(campo, { target: { value: "18:15:00" } });

  // El porqué, escrito a mano en los dos casos. Prendido hay que pedir «Otro…».
  const otro = screen.queryByRole("button", { name: OTRO_MOTIVO });
  if (otro) fireEvent.click(otro);
  const libre = await screen.findByPlaceholderText("Escribe el motivo…");
  fireEvent.change(libre, { target: { value: "se le olvidó marcar" } });

  const guardar = screen.getByRole("button", { name: /^Guardar/ });
  await waitFor(() => expect((guardar as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(guardar);

  await waitFor(() => {
    expect(llamadas.some((l) => l.url.includes("/correcciones/dia") && l.init?.method === "POST")).toBe(true);
  });
  const post = llamadas.find((l) => l.url.includes("/correcciones/dia") && l.init?.method === "POST")!;
  return JSON.parse(String(post.init?.body));
}

describe("G · lo que viaja al servidor no cambió", () => {
  it("🔴 el cuerpo del POST es IDÉNTICO con el panel prendido y apagado", async () => {
    panelPrendido = true;
    const prendido = await corregirLaSalidaYDevolverElCuerpo();
    cleanup();
    vi.unstubAllGlobals();

    panelPrendido = false;
    const apagado = await corregirLaSalidaYDevolverElCuerpo();

    expect(prendido).toEqual(apagado);
    // Y es lo de siempre: el día, el porqué y UN cambio sobre la marca tocada.
    expect(prendido).toEqual({
      codigo: "40",
      fecha: "2026-09-22",
      motivo: "se le olvidó marcar",
      cambios: [{
        clave: "m3", tipo: "corregir", marcacionId: "m4", reemplaza: null, hora: "18:15:00",
      }],
    });
  });
});

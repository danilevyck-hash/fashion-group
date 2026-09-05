// ─────────────────────────────────────────────────────────────────────────────
// CANDADO — el Depurador valida EN LA PANTALLA y no borra el trabajo hecho
// (4-sep-2026). Es el único módulo donde un número mal escrito termina DENTRO
// de Switch (50-60 corridas/mes).
//
// Lo que se vigila, montando el DepuradorClient REAL con un Excel de verdad:
//   1. 🔴 El divisor se valida en la pantalla con el MISMO guard de las rutas
//      API (validarDivisor, vía mensajeDivisorEnPantalla): `70` en vez de
//      `0.70` marca el campo, dice «Debe estar entre 0.10 y 1.00. ¿Quisiste
//      poner 0.70?» y APAGA la descarga — el Excel 100× mal ya no puede bajar.
//      Se bloquea la DESCARGA, nunca el tecleo. Vale para el input global y
//      para los de fórmula por marca (cada modo bloquea solo con SUS divisores).
//   2. La tasa de impuesto es una lista de dos — Daniel, textual: «solo
//      existen esas dos» — 7% → «07» y Exento (0%) → «0», SIEMPRE como TEXTO
//      en el Excel (el cero adelante se pierde si viaja como número).
//   3. 🔴 Los precios escritos a mano se conservan al re-procesar (Daniel:
//      «y también consérvalos»), pegados por REFERENCIA de artículo — nunca
//      por índice de fila: si las filas se mueven, el precio sigue en SU
//      artículo. Se dice en pantalla y borrarlos es un botón, no automático.
//   4. CONTROL: con datos válidos el Excel sale IDÉNTICO al de siempre —
//      los mismos 25 encabezados de OUT_COLS y los mismos valores.
//   5. La configuración se recuerda entre corridas (fg_last_* / useLastUsed);
//      el archivo no. 🔴 El MES/AÑO de la temporada NO se recuerda (4-sep-2026):
//      arranca SIEMPRE en el mes actual de Panamá — recordarlo haría que el 1
//      de septiembre siguiera diciendo agosto, y ese dato entra a Switch.
//   6. 🔴 La compañía se RECONOCE de la marca del archivo (Daniel: «¿para qué
//      elegir la compañía si la puede detectar?»): CK → Vistana. «cambiar» la
//      sobreescribe; con marcas de DOS compañías se dice y no se adivina.
//   7. 🔴 El archivo que viaja al Historial es EL MISMO blob que bajó al disco
//      (bytes idénticos por construcción: una sola escritura).
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { SWRConfig } from "swr";
import DepuradorClient from "@/app/productos/cargar/DepuradorClient";
import { OUT_COLS, processRows, buildAoa, calcPrecio, type SheetRow } from "@/lib/depurador/logic";
import { mensajeDivisorEnPantalla } from "@/lib/depurador/divisor";
import XLSXReal from "xlsx-js-style";

// Captura de descargas: la descarga real va por `saveAs` (file-saver) desde el
// 4-sep-2026 — los bytes se generan UNA vez y el mismo blob viaja al Historial.
// xlsx-js-style queda 100% REAL: lo que se abre acá es el archivo descargado.
const { descargas } = vi.hoisted(() => ({
  descargas: [] as { blob: Blob; nombre: string }[],
}));
vi.mock("file-saver", () => ({
  saveAs: (blob: Blob, nombre: string) => { descargas.push({ blob, nombre }); },
}));

const XLSX = XLSXReal;

// 🔒 La fecha del test es FIJA: 15-jun-2026 (Panamá). La temporada tiene que
// arrancar en 2026-06 SIN mirar localStorage. Se fakea SOLO Date para que los
// timers reales (debounce de 300 ms, waitFor) sigan andando.
const AHORA = new Date("2026-06-15T18:00:00.000Z");

// 🩸 El jsdom de este repo expone localStorage sin métodos: se reemplaza por un
// almacén real en memoria (mismo patrón de comisiones-configuracion-pantalla).
const almacenReal = (): Storage => {
  const datos = new Map<string, string>();
  return {
    getItem: (k: string) => (datos.has(k) ? datos.get(k)! : null),
    setItem: (k: string, v: string) => { datos.set(k, String(v)); },
    removeItem: (k: string) => { datos.delete(k); },
    clear: () => datos.clear(),
    key: (i: number) => [...datos.keys()][i] ?? null,
    get length() { return datos.size; },
  } as unknown as Storage;
};

// Catálogo de descripciones: todas las del archivo de prueba YA catalogadas,
// para que la alarma de descripciones nuevas no bloquee la descarga.
const CATALOGO = {
  "CK Jeans": ["Men-T-Shirts S/S", "Men-Polos S/S", "Men-Shirts Woven L/S"],
  "TH Menswear": ["Men-Polos S/S"],
};

const respuesta = (data: unknown): Response =>
  ({ ok: true, json: async () => data }) as unknown as Response;

// Excel del proveedor: cabecera reconocible por processRows + N artículos.
const CABECERA: SheetRow = ["REFERENCIA", "EAN", "FACT", "P_CATEGORY", "TALLA", "CANTIDAD", "COSTO", "PRECIO2", "MARCA", "PROVEEDOR"];
const FILA_A: SheetRow = ["ART-A", "111111", "F-9", "Men-T-Shirts S/S", "M", 5, 10, 20, "CK Jeans", "Prov X"];
const FILA_B: SheetRow = ["ART-B", "222222", "F-9", "Men-Polos S/S", "M", 3, 20, 30, "CK Jeans", "Prov X"];
const FILA_Z: SheetRow = ["ART-Z", "333333", "F-9", "Men-Shirts Woven L/S", "M", 2, 30, 40, "CK Jeans", "Prov X"];
// Marca de OTRA compañía (TH → Fashion Wear) para el caso de archivo mixto.
const FILA_TH: SheetRow = ["ART-T", "444444", "F-9", "Men-Polos S/S", "M", 4, 15, 25, "TH Menswear", "Prov X"];

function archivo(nombre: string, filas: SheetRow[]): File {
  const ws = XLSX.utils.aoa_to_sheet(filas);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "PEDIDO_TXT");
  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  // Solo se usan .name y .arrayBuffer() — es todo lo que el componente lee.
  return { name: nombre, arrayBuffer: async () => buf } as unknown as File;
}

// 🩸 El caché global de SWR sobrevive entre tests: sin proveedor propio, el
// catálogo llega ya cacheado en el PRIMER render y el archivo se procesaría
// antes de que la config recordada hidrate — cosa que en producción no pasa
// (el archivo siempre se suelta después). Caché nuevo por render.
type OnDownloaded = NonNullable<Parameters<typeof DepuradorClient>[0]["onDownloaded"]>;
const conCache = (file: File, onDownloaded?: OnDownloaded) => (
  <SWRConfig value={{ provider: () => new Map() }}>
    <DepuradorClient injectedFile={file} onDownloaded={onDownloaded} />
  </SWRConfig>
);

async function montar(file: File, onDownloaded?: OnDownloaded) {
  const utils = render(conCache(file, onDownloaded));
  await waitFor(() => expect(screen.getByText(/estilos/)).toBeTruthy());
  return utils;
}

const botonDescargar = () => screen.getByRole("button", { name: /Descargar plantilla|Generando/ }) as HTMLButtonElement;

async function descargar(): Promise<(typeof descargas)[number]> {
  const antes = descargas.length;
  fireEvent.click(botonDescargar());
  await waitFor(() => expect(descargas.length).toBe(antes + 1));
  return descargas[descargas.length - 1];
}

/** Abre el archivo DESCARGADO (los bytes del blob) con la librería real. */
async function wbDe(d: (typeof descargas)[number]) {
  const buf = await d.blob.arrayBuffer();
  return XLSX.read(buf, { type: "array" }) as { Sheets: Record<string, Record<string, { t?: string; v?: unknown }>> };
}

async function aoaDe(d: (typeof descargas)[number]): Promise<(string | number)[][]> {
  const wb = await wbDe(d);
  const crudo = XLSX.utils.sheet_to_json(wb.Sheets["upload"], { header: 1, raw: true, defval: "" }) as (string | number)[][];
  // Filas normalizadas al ancho de la plantilla (sheet_to_json recorta colas vacías).
  return crudo.map((f) => Array.from({ length: OUT_COLS.length }, (_, i) => (f[i] === undefined ? "" : f[i])));
}

/** Abre el desplegable «cambiar» y elige una compañía por su etiqueta. */
async function cambiarCompania(label: string) {
  fireEvent.click(screen.getByRole("button", { name: "Cambiar compañía" }));
  const opcion = await screen.findByRole("option", { name: label });
  fireEvent.click(opcion);
}

beforeEach(() => {
  descargas.length = 0;
  vi.useFakeTimers({ now: AHORA, toFake: ["Date"] });
  Object.defineProperty(window, "localStorage", { value: almacenReal(), configurable: true });
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const u = String(input);
    if (u.includes("descripciones")) return respuesta({ catalogo: CATALOGO });
    if (u.includes("rubro-formulas") || u.includes("tienda")) return respuesta({ rows: [] });
    if (u.includes("formulas")) return respuesta({ rows: [] });
    return respuesta({});
  }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

/* ═══ 1 · el módulo puro del mensaje (reusa validarDivisor) ═══════════════════ */

describe("mensajeDivisorEnPantalla — el mismo guard de las rutas, en la pantalla", () => {
  it("70 (el bug que originó el guard) → mensaje con la sugerencia ÷100", () => {
    expect(mensajeDivisorEnPantalla("70")).toBe("Debe estar entre 0.10 y 1.00. ¿Quisiste poner 0.70?");
  });
  it("0.70, 0 (sin fórmula), 1.00 (vender al costo) y vacío son válidos", () => {
    expect(mensajeDivisorEnPantalla("0.70")).toBeNull();
    expect(mensajeDivisorEnPantalla("0")).toBeNull();
    expect(mensajeDivisorEnPantalla("1.00")).toBeNull();
    expect(mensajeDivisorEnPantalla("")).toBeNull();
    expect(mensajeDivisorEnPantalla(0.63)).toBeNull(); // el margen real más agresivo
  });
  it("0.09 (bajo el piso) → mensaje SIN la pregunta: ÷100 no cae en rango", () => {
    const msg = mensajeDivisorEnPantalla("0.09");
    expect(msg).toBe("Debe estar entre 0.10 y 1.00.");
    expect(msg).not.toContain("¿Quisiste");
  });
  it("25 → sugiere 0.25; -1 y basura → mensaje sin pregunta", () => {
    expect(mensajeDivisorEnPantalla("25")).toBe("Debe estar entre 0.10 y 1.00. ¿Quisiste poner 0.25?");
    expect(mensajeDivisorEnPantalla("-1")).toBe("Debe estar entre 0.10 y 1.00.");
    expect(mensajeDivisorEnPantalla("abc")).toBe("Debe estar entre 0.10 y 1.00.");
  });
});

/* ═══ 2 · el divisor bloquea la DESCARGA en la pantalla ═══════════════════════ */

describe("divisor en la pantalla — campo en rojo, mensaje y descarga apagada", () => {
  it("global: 70 → mensaje + descarga apagada; 0.70 → descarga encendida; 0 y 1.00 válidos; 0.09 inválido", async () => {
    await montar(archivo("a.xlsx", [CABECERA, FILA_A, FILA_B]));
    fireEvent.click(screen.getByRole("button", { name: /Una fórmula para todo/ }));
    const divisor = screen.getByLabelText("Divisor") as HTMLInputElement;

    // válido de entrada (0.73 default)
    await waitFor(() => expect(botonDescargar().disabled).toBe(false));

    fireEvent.change(divisor, { target: { value: "70" } });
    expect(screen.getByText("Debe estar entre 0.10 y 1.00. ¿Quisiste poner 0.70?")).toBeTruthy();
    expect(divisor.getAttribute("aria-invalid")).toBe("true");
    expect(botonDescargar().disabled).toBe(true);
    // «Aplicar a todo» tampoco puede meter el 70 al cálculo
    expect((screen.getByRole("button", { name: "Aplicar a todo" }) as HTMLButtonElement).disabled).toBe(true);

    // el tecleo NO se traba: se corrige el valor y todo vuelve
    fireEvent.change(divisor, { target: { value: "0.70" } });
    expect(screen.queryByText(/Debe estar entre/)).toBeNull();
    expect(botonDescargar().disabled).toBe(false);

    fireEvent.change(divisor, { target: { value: "0" } });
    expect(botonDescargar().disabled).toBe(false);
    fireEvent.change(divisor, { target: { value: "1.00" } });
    expect(botonDescargar().disabled).toBe(false);

    fireEvent.change(divisor, { target: { value: "0.09" } });
    expect(screen.getByText("Debe estar entre 0.10 y 1.00.")).toBeTruthy();
    expect(botonDescargar().disabled).toBe(true);
  });

  it("por marca: 70 en el divisor de la marca apaga la descarga y su Guardar; en modo global ese 70 no bloquea", async () => {
    await montar(archivo("a.xlsx", [CABECERA, FILA_A]));
    const divisorMarca = screen.getByLabelText("Divisor CK Jeans") as HTMLInputElement;
    fireEvent.change(divisorMarca, { target: { value: "70" } });
    expect(screen.getByText(/¿Quisiste poner 0\.70\?/)).toBeTruthy();
    expect(botonDescargar().disabled).toBe(true);
    expect((screen.getByRole("button", { name: /Guardar fórmula|Guardar cambios/ }) as HTMLButtonElement).disabled).toBe(true);

    // El modo global no come de las fórmulas por marca: no bloquea por ellas.
    fireEvent.click(screen.getByRole("button", { name: /Una fórmula para todo/ }));
    await waitFor(() => expect(botonDescargar().disabled).toBe(false));

    // De vuelta al modo por marca, el 70 sigue bloqueando hasta corregirlo.
    fireEvent.click(screen.getByRole("button", { name: /Fórmula guardada por marca/ }));
    expect(botonDescargar().disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Divisor CK Jeans"), { target: { value: "0.7" } });
    expect(botonDescargar().disabled).toBe(false);
  });
});

/* ═══ 3 · la tasa es una lista de dos, y sale como TEXTO ══════════════════════ */

describe("tasa de impuesto — «solo existen esas dos»", () => {
  it("el select ofrece exactamente 7% («07») y Exento (0%) («0»), con 7% por defecto", async () => {
    await montar(archivo("a.xlsx", [CABECERA, FILA_A]));
    const sel = screen.getByLabelText("Tasa de impuesto") as HTMLSelectElement;
    const opciones = within(sel).getAllByRole("option") as HTMLOptionElement[];
    expect(opciones.map((o) => o.value)).toEqual(["07", "0"]);
    expect(opciones.map((o) => o.textContent)).toEqual(["7%", "Exento (0%)"]);
    expect(sel.value).toBe("07");
  });

  it("7% baja como «07» TEXTO (celda t:'s', nunca número)", async () => {
    await montar(archivo("a.xlsx", [CABECERA, FILA_A]));
    const celda = XLSX.utils.encode_cell({ r: 1, c: OUT_COLS.indexOf("Tasa de Impuesto *") });
    const wb = await wbDe(await descargar());
    expect(wb.Sheets["upload"][celda]).toMatchObject({ t: "s", v: "07" });
  });

  it("Exento baja como «0» TEXTO (celda t:'s' — como número el exento se perdería)", async () => {
    // Se abre YA en Exento (lo recordado), así la corrida entera usa esa tasa
    // sin depender de esperar un re-proceso a mitad del test.
    window.localStorage.setItem("fg_last_depurador_tasa", "0");
    await montar(archivo("a.xlsx", [CABECERA, FILA_A]));
    expect((screen.getByLabelText("Tasa de impuesto") as HTMLSelectElement).value).toBe("0");
    const celda = XLSX.utils.encode_cell({ r: 1, c: OUT_COLS.indexOf("Tasa de Impuesto *") });
    const wb = await wbDe(await descargar());
    expect(wb.Sheets["upload"][celda]).toMatchObject({ t: "s", v: "0" });
  });
});

/* ═══ 4 · los precios a mano sobreviven, pegados por REFERENCIA ═══════════════ */

describe("precios escritos a mano — se conservan y viajan con su artículo", () => {
  it("cambiar factor/tasa/temporada/compañía conserva el precio a mano y lo dice en pantalla", async () => {
    await montar(archivo("a.xlsx", [CABECERA, FILA_A, FILA_B]));
    fireEvent.change(screen.getByLabelText("Precio ART-B"), { target: { value: "99" } });

    // factor (tecleado: reprocesa al blur, no en cada tecla). El renglón de
    // «se conservó» lo escribe el re-proceso, así que esperarlo garantiza que
    // el re-proceso YA corrió y aun así el precio sigue.
    fireEvent.change(screen.getByLabelText("Factor costo CIF"), { target: { value: "1.2" } });
    fireEvent.blur(screen.getByLabelText("Factor costo CIF"));
    await waitFor(() => expect(screen.getByText(/1 precio escrito a mano se conservó/)).toBeTruthy());
    expect(screen.getByText("factor 1.2")).toBeTruthy();
    expect((screen.getByLabelText("Precio ART-B") as HTMLInputElement).value).toBe("99");

    // tasa y temporada (reprocesan al momento) + compañía (no reprocesa)
    fireEvent.change(screen.getByLabelText("Tasa de impuesto"), { target: { value: "0" } });
    await waitFor(() => expect(screen.getByText("tasa 0")).toBeTruthy());
    fireEvent.change(screen.getByLabelText("Temporada"), { target: { value: "2026-11" } });
    await waitFor(() => expect(screen.getByText("2026-11")).toBeTruthy());
    await cambiarCompania("Fashion Wear");
    expect((screen.getByLabelText("Precio ART-B") as HTMLInputElement).value).toBe("99");

    // y el precio bajó al Excel en la fila de SU artículo
    const aoa = await aoaDe(await descargar());
    const filaB = aoa.find((f) => f[0] === "ART-B")!;
    expect(filaB[OUT_COLS.indexOf("Precio *")]).toBe(99);
  });

  it("🔴 el precio va pegado a la REFERENCIA: si el artículo cambia de fila, el precio lo sigue (nunca por índice)", async () => {
    const { rerender } = await montar(archivo("a.xlsx", [CABECERA, FILA_A, FILA_B]));
    // ART-B es la fila índice 1
    fireEvent.change(screen.getByLabelText("Precio ART-B"), { target: { value: "99" } });

    // Archivo nuevo: ART-Z entra primero y ART-B pasa al índice 2. Con edits por
    // índice, el 99 caería en ART-A — el precio en el artículo EQUIVOCADO.
    rerender(conCache(archivo("b.xlsx", [CABECERA, FILA_Z, FILA_A, FILA_B])));
    await waitFor(() => expect(screen.getByLabelText("Precio ART-Z")).toBeTruthy());
    expect((screen.getByLabelText("Precio ART-B") as HTMLInputElement).value).toBe("99");
    expect((screen.getByLabelText("Precio ART-A") as HTMLInputElement).value).not.toBe("99");
    expect((screen.getByLabelText("Precio ART-Z") as HTMLInputElement).value).not.toBe("99");
    expect(screen.getByText(/1 precio escrito a mano se conservó/)).toBeTruthy();
  });

  it("un artículo que salió del archivo conserva su precio por si vuelve", async () => {
    const { rerender } = await montar(archivo("a.xlsx", [CABECERA, FILA_A, FILA_B]));
    fireEvent.change(screen.getByLabelText("Precio ART-B"), { target: { value: "99" } });

    // ART-B sale del archivo…
    rerender(conCache(archivo("b.xlsx", [CABECERA, FILA_A])));
    await waitFor(() => expect(screen.queryByLabelText("Precio ART-B")).toBeNull());
    // …y no estorba: el aviso no cuenta precios de artículos ausentes.
    expect(screen.queryByText(/se conserv/)).toBeNull();

    // ART-B vuelve → su precio también.
    rerender(conCache(archivo("c.xlsx", [CABECERA, FILA_B, FILA_A])));
    await waitFor(() => expect(screen.getByLabelText("Precio ART-B")).toBeTruthy());
    expect((screen.getByLabelText("Precio ART-B") as HTMLInputElement).value).toBe("99");
  });

  it("el botón «Borrarlos todos» sí los borra (y solo él)", async () => {
    await montar(archivo("a.xlsx", [CABECERA, FILA_A, FILA_B]));
    fireEvent.change(screen.getByLabelText("Precio ART-B"), { target: { value: "99" } });
    fireEvent.change(screen.getByLabelText("Factor costo CIF"), { target: { value: "1.2" } });
    fireEvent.blur(screen.getByLabelText("Factor costo CIF"));
    await waitFor(() => expect(screen.getByText(/se conservó/)).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Borrarlos todos" }));
    expect((screen.getByLabelText("Precio ART-B") as HTMLInputElement).value).not.toBe("99");
    expect(screen.queryByText(/se conserv/)).toBeNull();
  });
});

/* ═══ 5 · CONTROL: con datos válidos el Excel sale IDÉNTICO al de hoy ═════════ */

describe("CONTROL — mismos 25 encabezados y mismos valores que el pipeline de siempre", () => {
  it("modo por marca (default, sin fórmulas): el AOA descargado == processRows + buildAoa", async () => {
    // Config determinista: la fecha del test es FIJA (15-jun-2026), así que la
    // temporada arranca en 2026-06 → mesIdx 5, año 2026.
    const filas: SheetRow[] = [CABECERA, FILA_A, FILA_B];
    await montar(archivo("a.xlsx", filas));
    const aoa = await aoaDe(await descargar());

    // El pipeline de SIEMPRE (logic.ts intacto): sin fórmula → precio vacío.
    // La compañía reconocida (CK → Vistana) pone su proveedor fijo, igual que
    // lo ponía elegirla en el selector viejo — el CONTROL lo refleja.
    const esperado = processRows(filas, { mesIdx: 5, anio: "2026", tasa: "07", factor: "1.1" });
    const aoaEsperado = buildAoa(esperado.rows.map((r) => ({
      ...r,
      cols: { ...r.cols, "Precio *": null, "Proveedor *": "American Designer Fashion" },
    }))).map((f) => f.map((v) => v));

    expect(aoa[0]).toEqual([...OUT_COLS]);
    expect(aoa.length).toBe(aoaEsperado.length);
    for (let i = 0; i < aoa.length; i++) {
      // TEXT_COLS fuerza a string las 3 primeras al descargar — igual que siempre.
      const esp = aoaEsperado[i].map((v, c) => (i > 0 && c <= 2 ? String(v) : v));
      expect(aoa[i]).toEqual(esp);
    }
  });

  it("modo global 0.73 + 2: los precios del Excel son los de calcPrecio de siempre", async () => {
    await montar(archivo("a.xlsx", [CABECERA, FILA_A, FILA_B]));
    fireEvent.click(screen.getByRole("button", { name: /Una fórmula para todo/ }));
    fireEvent.click(screen.getByRole("button", { name: "Aplicar a todo" }));
    const aoa = await aoaDe(await descargar());
    const iPrecio = OUT_COLS.indexOf("Precio *");
    const iCif = OUT_COLS.indexOf("Costo CIF *");
    for (const fila of aoa.slice(1)) {
      const esperado = calcPrecio(Number(fila[iCif]), { divisor: 0.73, extra: 2, redondeo: "int" });
      expect(fila[iPrecio]).toBe(esperado);
    }
    // 11 ÷ 0.73 = 15.06… → TECHO 16 + 2 = 18 (el número de siempre, a mano)
    expect(aoa.find((f) => f[0] === "ART-A")![iPrecio]).toBe(18);
  });
});

/* ═══ 6 · la pantalla abre como quedó la última vez (menos temporada/compañía) ═ */

describe("configuración recordada (fg_last_* / useLastUsed)", () => {
  it("tasa, factor y modo de precio se releen de localStorage", async () => {
    window.localStorage.setItem("fg_last_depurador_tasa", "0");
    window.localStorage.setItem("fg_last_depurador_factor", "1.2");
    window.localStorage.setItem("fg_last_depurador_precio_modo", "global");
    window.localStorage.setItem("fg_last_depurador_formula_global", JSON.stringify({ divisor: "0.63", extra: 3, redondeo: "half" }));

    await montar(archivo("a.xlsx", [CABECERA, FILA_A]));
    expect((screen.getByLabelText("Tasa de impuesto") as HTMLSelectElement).value).toBe("0");
    expect((screen.getByLabelText("Factor costo CIF") as HTMLInputElement).value).toBe("1.2");
    // modo global recordado → su panel está dibujado, con la fórmula aplicada
    expect((screen.getByLabelText("Divisor") as HTMLInputElement).value).toBe("0.63");
    // y el precio ya se calcula con ella: CIF 12 (10 × 1.2) ÷ 0.63 = 19.05 → 19.5 (half) + 3 = 22.5
    expect((screen.getByLabelText("Precio ART-A") as HTMLInputElement).value).toBe("22.5");
  });

  it("un divisor global recordado INVÁLIDO no se revive: quedan los defaults", async () => {
    window.localStorage.setItem("fg_last_depurador_precio_modo", "global");
    window.localStorage.setItem("fg_last_depurador_formula_global", JSON.stringify({ divisor: "70", extra: 2, redondeo: "int" }));
    await montar(archivo("a.xlsx", [CABECERA, FILA_A]));
    expect((screen.getByLabelText("Divisor") as HTMLInputElement).value).toBe("0.73");
    expect(botonDescargar().disabled).toBe(false);
  });

  it("🔴 la TEMPORADA arranca en el mes actual de Panamá y NO se recuerda", async () => {
    // Un localStorage viejo con mes/año (el mecanismo retirado) NO puede mover
    // la temporada: el 1 de septiembre no puede seguir diciendo agosto.
    window.localStorage.setItem("fg_last_depurador_mes", "0");
    window.localStorage.setItem("fg_last_depurador_anio", "2024");
    await montar(archivo("a.xlsx", [CABECERA, FILA_A]));
    expect((screen.getByLabelText("Temporada") as HTMLInputElement).value).toBe("2026-06");
    // El valor real al lado del campo, y en el Excel.
    expect(screen.getByText("Junio 2026 → 2026-06")).toBeTruthy();
    const aoa = await aoaDe(await descargar());
    expect(aoa[1][OUT_COLS.indexOf("Temporada")]).toBe("2026-06");
  });

  it("editar la temporada vale para ESTA corrida y no deja rastro en localStorage", async () => {
    await montar(archivo("a.xlsx", [CABECERA, FILA_A]));
    fireEvent.change(screen.getByLabelText("Temporada"), { target: { value: "2026-12" } });
    await waitFor(() => expect(screen.getByText("2026-12")).toBeTruthy());
    const aoa = await aoaDe(await descargar());
    expect(aoa[1][OUT_COLS.indexOf("Temporada")]).toBe("2026-12");
    // Nada de la temporada quedó recordado.
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i)!;
      if (/mes|anio|temporada/i.test(k)) {
        expect(window.localStorage.getItem(k), `${k} no debería recordar la temporada`).not.toContain("2026-12");
      }
    }
  });
});

/* ═══ 7 · la compañía se RECONOCE, no se elige ════════════════════════════════ */

describe("compañía reconocida de la marca del archivo — «¿para qué elegirla si la puede detectar?»", () => {
  it("CK → Vistana International, con la marca y el archivo en la línea", async () => {
    await montar(archivo("pedido-ck.xlsx", [CABECERA, FILA_A, FILA_B]));
    expect(screen.getByText(/Vistana International/)).toBeTruthy();
    expect(screen.getByText(/· CK Jeans/)).toBeTruthy();
    expect(screen.getByText("pedido-ck.xlsx")).toBeTruthy();
    // Ya no existe el selector viejo de empresa.
    expect(screen.queryByLabelText("Empresa destino")).toBeNull();
  });

  it("la reconocida alimenta el Excel: proveedor fijo de Vistana", async () => {
    await montar(archivo("a.xlsx", [CABECERA, FILA_A]));
    const aoa = await aoaDe(await descargar());
    expect(aoa[1][OUT_COLS.indexOf("Proveedor *")]).toBe("American Designer Fashion");
  });

  it("«cambiar» abre las 6 compañías y la elegida SOBREESCRIBE (proveedor y historial)", async () => {
    const descargasHist: { empresa: string }[] = [];
    await montar(archivo("a.xlsx", [CABECERA, FILA_A]), (p) => descargasHist.push(p));
    fireEvent.click(screen.getByRole("button", { name: "Cambiar compañía" }));
    const lista = await screen.findByRole("listbox", { name: "Compañía" });
    const opciones = within(lista).getAllByRole("option").map((o) => o.textContent);
    expect(opciones).toEqual([
      "Vistana International", "Fashion Wear", "Fashion Shoes",
      "Active Wear", "Active Shoes", "Multifashion",
    ]);
    fireEvent.click(screen.getByRole("option", { name: "Fashion Shoes" }));
    expect(screen.getByText(/Fashion Shoes/)).toBeTruthy();

    const aoa = await aoaDe(await descargar());
    expect(aoa[1][OUT_COLS.indexOf("Proveedor *")]).toBe("American Fashion Wear, SA");
    expect(descargasHist[0].empresa).toBe("Fashion Shoes");
  });

  it("🔴 marcas de DOS compañías: se dice en pantalla y NO se adivina", async () => {
    await montar(archivo("mixto.xlsx", [CABECERA, FILA_A, FILA_TH]));
    expect(screen.getByText(/marcas de 2 compañías/)).toBeTruthy();
    expect(screen.getByText(/Vistana International y Fashion Wear/)).toBeTruthy();
    expect(screen.getByText("Elige la compañía")).toBeTruthy();
    // Elegir a mano resuelve (no se bloquea en silencio).
    await cambiarCompania("Vistana International");
    expect(screen.queryByText("Elige la compañía")).toBeNull();
  });

  it("la compañía NO se recuerda entre corridas: la del archivo manda", async () => {
    const { rerender } = await montar(archivo("a.xlsx", [CABECERA, FILA_A]));
    await cambiarCompania("Active Wear");
    expect(window.localStorage.getItem("fg_last_depurador_empresa")).toBeNull();
    // Otro archivo → se reconoce de nuevo (la elección a mano no se arrastra).
    rerender(conCache(archivo("b.xlsx", [CABECERA, FILA_B])));
    await waitFor(() => expect(screen.getByText("b.xlsx")).toBeTruthy());
    expect(screen.getByText(/Vistana International/)).toBeTruthy();
  });
});

/* ═══ 8 · el Historial recibe EL MISMO archivo que bajó ═══════════════════════ */

describe("historial — el blob que viaja es el que se descargó (bytes idénticos)", () => {
  it("onDownloaded lleva el MISMO blob de saveAs, con su nombre y los totales", async () => {
    const hist: Parameters<OnDownloaded>[0][] = [];
    await montar(archivo("a.xlsx", [CABECERA, FILA_A, FILA_B]), (p) => hist.push(p));
    const d = await descargar();

    expect(hist).toHaveLength(1);
    expect(hist[0].archivo).toBeTruthy();
    // El mismo OBJETO: una sola escritura, cero re-generación.
    expect(hist[0].archivo!.blob).toBe(d.blob);
    expect(hist[0].archivo!.nombre).toBe(d.nombre);
    expect(hist[0].empresa).toBe("Vistana International");
    expect(hist[0].cantidad_estilos).toBe(2);
    // Y los bytes son un .xlsx real que se abre.
    const aoa = await aoaDe(d);
    expect(aoa[0]).toEqual([...OUT_COLS]);
  });
});

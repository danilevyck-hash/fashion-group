// ─────────────────────────────────────────────────────────────────────────────
// CANDADO — el divisor se valida EN LA PANTALLA en LOS TRES caminos
// (4-sep-2026). Hasta hoy solo el Depurador CK/TH validaba al teclear; Reebok
// y Facturas Tienda dejaban pasar un 70 en vez de 0.70 — y ese Excel entra a
// Switch con los costos 100× mal. El guard es el MISMO de las rutas API
// (validarDivisor vía mensajeDivisorEnPantalla, cero copias): campo rojo,
// mensaje «Debe estar entre 0.10 y 1.00. ¿Quisiste poner 0.70?» y la DESCARGA
// apagada — nunca el tecleo.
//
// Y el Historial nuevo, del lado de estos dos caminos:
//   · 🔴 la Plantilla Switch de Reebok SÍ registra el historial, con el MISMO
//     blob que bajó (Daniel: «el historial solo quiero los excel para switch»);
//   · 🔴 el pedido para cliente de Reebok NO lo registra;
//   · Facturas Tienda registra con compañía «Multifashion» y su mismo blob.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { SWRConfig } from "swr";
import ReebokClient from "@/app/productos/cargar/ReebokClient";
import FacturasTiendaClient from "@/app/productos/cargar/FacturasTiendaClient";
import type { SheetRow } from "@/lib/depurador/logic";
import XLSXReal from "xlsx-js-style";

// saveAs capturado (la plantilla Switch y la factura de tienda bajan por ahí);
// writeFile capturado (el pedido para cliente de Reebok sin fotos baja por ahí).
const { guardados, escritos } = vi.hoisted(() => ({
  guardados: [] as { blob: Blob; nombre: string }[],
  escritos: [] as string[],
}));
vi.mock("file-saver", () => ({
  saveAs: (blob: Blob, nombre: string) => { guardados.push({ blob, nombre }); },
}));
vi.mock("xlsx-js-style", async (importOriginal) => {
  const real = (await importOriginal()) as Record<string, unknown> & { default?: Record<string, unknown> };
  const XLSX = (real.default ?? real) as Record<string, unknown>;
  const patched = { ...XLSX, writeFile: (_wb: unknown, nombre: string) => { escritos.push(nombre); } };
  return { ...real, default: patched };
});

const XLSX = XLSXReal;

const respuesta = (data: unknown): Response =>
  ({ ok: true, json: async () => data }) as unknown as Response;

function archivoDe(nombre: string, filas: SheetRow[]): File {
  const ws = XLSX.utils.aoa_to_sheet(filas);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Hoja1");
  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return { name: nombre, arrayBuffer: async () => buf } as unknown as File;
}

// ── Reebok: Book4 real en miniatura (headers en la 2.ª fila, como el de producción) ──
function archivoReebok(): File {
  const hdr = ["Order", "ClientName", "PO NAME", "New Article", "Old Article ", "SKU", "PREPACK FTW", "Name", "Department",
    "CAMPAÑAS", "PRIORIDAD", "OptionName", "CurveName", "CATEGORY", "AGE GROUP", "COLOR NAME", "GENDER", "SELL-IN QUARTER",
    "SPORTS CATEGORY", "Talla", "RRP", "WholesalePrice", "PREVENTA", "DROP", "FW26 FINAL", "JULIO", "COMENTARIOS", "DELIVERY", "UBICACIÓN"];
  const fila: SheetRow = new Array(29).fill(null);
  fila[2] = "VIC"; fila[3] = "100000015"; fila[5] = "100000015-9"; fila[7] = "CLUB C 85"; fila[8] = "FOOTWEAR";
  fila[13] = "SHOES"; fila[14] = "Adult"; fila[16] = "MEN"; fila[19] = 9; fila[20] = 84.95; fila[21] = 42.9; fila[25] = 7;
  return archivoDe("book4.xlsx", [[], hdr, fila]);
}

// ── Facturas Tienda: factura formato A (.xls) mínima, la misma del candado de
// la plantilla de Switch ──
function archivoTienda(): File {
  const HA = ["CODIGO", "CODIGO BARRA", "REFERENCIA", "DESCRIPCION", "MARCA", "RUBRO", "SUB RUBRO",
    "UNIDAD DE MEDIDA", "PROVEEDOR", "CANTIDAD", "PRECIO"];
  return archivoDe("factura.xlsx", [
    ["N. Interno: 11-000001"],
    [],
    HA,
    ["C1", "7000000000003", "R3", "Men-Polos S/S", "TH Menswear", "Men", "Polos S/S", "PIEZA", "American Fashion Wear, SA", 4, 12.5],
  ]);
}

const CATALOGO = { "TH Menswear": ["Men-Polos S/S"] };

beforeEach(() => {
  guardados.length = 0;
  escritos.length = 0;
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
});

type Payload = {
  empresa: string; marca: string; cantidad_estilos: number;
  total_unidades: number; total_costo: number;
  archivo?: { blob: Blob; nombre: string };
};

/* ═══ Reebok ══════════════════════════════════════════════════════════════════ */

describe("Reebok — el divisor valida en la pantalla y solo la plantilla Switch va al historial", () => {
  async function montarReebok(hist?: Payload[]) {
    render(<ReebokClient injectedFile={archivoReebok()} onDownloaded={hist ? (p) => hist.push(p) : undefined} />);
    await waitFor(() => expect(screen.getAllByText(/artículos/).length).toBeGreaterThan(0));
  }

  const botonDescarga = () =>
    screen.getByRole("button", { name: /Descargar plantilla Switch|Descargar pedido|Generando|Achicando/ }) as HTMLButtonElement;

  it("70 en el divisor del Precio elegido → mensaje, campo inválido, descarga y Guardar apagados", async () => {
    await montarReebok();
    const divisorA = screen.getByLabelText("Divisor Precio A") as HTMLInputElement;
    expect(botonDescarga().disabled).toBe(false);

    fireEvent.change(divisorA, { target: { value: "70" } });
    expect(screen.getByText("Debe estar entre 0.10 y 1.00. ¿Quisiste poner 0.70?")).toBeTruthy();
    expect(divisorA.getAttribute("aria-invalid")).toBe("true");
    expect(botonDescarga().disabled).toBe(true);
    // El Guardar de ESA fila también se apaga (el 70 no puede llegar a la tabla).
    const filaA = divisorA.closest("div.py-1\\.5") as HTMLElement;
    const guardarA = Array.from(filaA.querySelectorAll("button")).find((b) => /Guardar/.test(b.textContent ?? ""))!;
    expect((guardarA as HTMLButtonElement).disabled).toBe(true);

    // El tecleo no se traba: corregir revive todo.
    fireEvent.change(divisorA, { target: { value: "0.70" } });
    expect(screen.queryByText(/Debe estar entre/)).toBeNull();
    expect(botonDescarga().disabled).toBe(false);
  });

  it("en plantilla Switch bloquea SOLO el Precio elegido; en el pedido bloquean A y B", async () => {
    await montarReebok();
    // Salida default = Plantilla Switch con Precio A. Un 70 en B no la alimenta.
    fireEvent.change(screen.getByLabelText("Divisor Precio B"), { target: { value: "70" } });
    expect(botonDescarga().disabled).toBe(false);
    // El pedido para cliente lleva Precio A y B: ahí el 70 de B sí bloquea.
    fireEvent.click(screen.getByRole("button", { name: "Pedido para cliente" }));
    expect(botonDescarga().disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Divisor Precio B"), { target: { value: "0.8" } });
    expect(botonDescarga().disabled).toBe(false);
  });

  it("🔴 la plantilla Switch registra el historial con el MISMO blob; el pedido para cliente NO", async () => {
    const hist: Payload[] = [];
    await montarReebok(hist);

    // Plantilla Switch (salida default) → saveAs + historial con el mismo blob.
    fireEvent.click(botonDescarga());
    await waitFor(() => expect(guardados.length).toBe(1));
    expect(hist).toHaveLength(1);
    expect(hist[0].empresa).toBe("Active Shoes");
    expect(hist[0].archivo!.blob).toBe(guardados[0].blob);
    expect(guardados[0].nombre).toMatch(/^Plantilla_Switch_ActiveShoes_\d{4}-\d{2}\.xlsx$/);
    // Y el blob es el Excel que bajó: se abre y trae la fila 1 de la plantilla.
    const wb = XLSX.read(await guardados[0].blob.arrayBuffer(), { type: "array" });
    expect(XLSX.utils.sheet_to_json(wb.Sheets["upload"], { header: 1 })[0]).toContain("Código *");

    // Pedido para cliente → baja (writeFile) pero NO registra historial.
    fireEvent.click(screen.getByRole("button", { name: "Pedido para cliente" }));
    fireEvent.click(botonDescarga());
    await waitFor(() => expect(escritos.length).toBe(1));
    expect(escritos[0]).toMatch(/^Pedido_ActiveShoes_/);
    expect(hist).toHaveLength(1); // sigue en 1: el pedido no se guarda
    expect(guardados).toHaveLength(1);
  });
});

/* ═══ Facturas Tienda ═════════════════════════════════════════════════════════ */

describe("Facturas Tienda — el divisor valida en la pantalla y el historial lleva el mismo blob", () => {
  async function montarTienda(hist?: Payload[]) {
    render(
      <SWRConfig value={{ provider: () => new Map() }}>
        <FacturasTiendaClient injectedFile={archivoTienda()} onDownloaded={hist ? (p) => hist.push(p) : undefined} />
      </SWRConfig>
    );
    await waitFor(() => expect(screen.getAllByText(/artículos/).length).toBeGreaterThan(0));
  }

  const botonDescarga = () =>
    screen.getByRole("button", { name: /Descargar plantilla|Descargar ZIP|Generando/ }) as HTMLButtonElement;

  it("70 en el divisor de la marca → mensaje, campo inválido, descarga y Guardar apagados", async () => {
    await montarTienda();
    const divisor = screen.getByLabelText(/^Divisor /) as HTMLInputElement;
    expect(botonDescarga().disabled).toBe(false);

    fireEvent.change(divisor, { target: { value: "70" } });
    expect(screen.getByText("Debe estar entre 0.10 y 1.00. ¿Quisiste poner 0.70?")).toBeTruthy();
    expect(divisor.getAttribute("aria-invalid")).toBe("true");
    expect(botonDescarga().disabled).toBe(true);
    expect((screen.getByRole("button", { name: /Guardar fórmula|Guardar cambios/ }) as HTMLButtonElement).disabled).toBe(true);

    // El tecleo no se traba.
    fireEvent.change(divisor, { target: { value: "0.7" } });
    expect(screen.queryByText(/Debe estar entre/)).toBeNull();
    expect(botonDescarga().disabled).toBe(false);
  });

  it("la descarga registra el historial como «Multifashion» con el MISMO blob que bajó", async () => {
    const hist: Payload[] = [];
    await montarTienda(hist);
    fireEvent.click(botonDescarga());
    await waitFor(() => expect(guardados.length).toBe(1));
    expect(hist).toHaveLength(1);
    expect(hist[0].empresa).toBe("Multifashion");
    expect(hist[0].archivo!.blob).toBe(guardados[0].blob);
    expect(guardados[0].nombre).toMatch(/^PLANT_TIENDA_.*\.xlsx$/);
    const wb = XLSX.read(await guardados[0].blob.arrayBuffer(), { type: "array" });
    expect(XLSX.utils.sheet_to_json(wb.Sheets["upload"], { header: 1 })[0]).toContain("Código *");
  });
});

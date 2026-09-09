// ─────────────────────────────────────────────────────────────────────────────
// COMISIONES — LA FLECHITA ↓, MONTADA (8-sep-2026). Lo que solo se ve pintando
// la pantalla: dónde aparece la flecha, dónde NO, qué dice su menú, y que tocar
// el número sigue abriendo el detalle exactamente como antes.
//
// Ningún número se mueve: la prueba contra producción está en
// `scripts/_medir-comisiones-flecha.mjs`.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within, cleanup, fireEvent, waitFor, act } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/comisiones",
}));

// Las descargas de Excel escriben un archivo: se cambian por espías para poder
// afirmar QUÉ alcance se pidió sin tocar el disco.
const excelUna = vi.fn();
const excelVarias = vi.fn();
vi.mock("@/lib/ventas/comisionExcel", async (original) => {
  const real = await original<typeof import("@/lib/ventas/comisionExcel")>();
  return {
    ...real,
    exportComisionDetalle: (...a: unknown[]) => { excelUna(...a); return Promise.resolve(); },
    exportComisionDetalleVarias: (...a: unknown[]) => { excelVarias(...a); return Promise.resolve(); },
    exportComisionesConsolidado: vi.fn(() => Promise.resolve()),
  };
});

import { ComisionesConsolidadoView } from "@/components/ventas/ComisionesConsolidadoView";

const REYNALDO = "REYNALDO ESPINOSA";

/** Septiembre 2026, medido contra producción: la fila con un solo número. */
const CONSOLIDADO = {
  empresas: [
    {
      empresa_key: "fashion_shoes",
      // bruto $60,00 · descuento $1.573,08 · neto −$1.513,08
      vendedores: [{ vendedor: REYNALDO, base: 12000, base_cobro: 0, comision_total: -1513.08, descuento: 1573.08, se_paga: true }],
    },
    {
      empresa_key: "active_shoes",
      // La celda en CERO: dice «—» y por lo tanto NO lleva flecha.
      vendedores: [{ vendedor: REYNALDO, base: 0, base_cobro: 0, comision_total: 0, descuento: 0, se_paga: true }],
    },
    {
      empresa_key: "vistana",
      vendedores: [
        { vendedor: REYNALDO, base: 8000, base_cobro: 0, comision_total: 41.77, descuento: 0, se_paga: true },
        { vendedor: "EDWIN", base: 8000, base_cobro: 0, comision_total: 70.69, descuento: 0, se_paga: true },
      ],
    },
  ],
};

const DETALLE = {
  empresa_key: "vistana", year: 2026, mes: 9, vendedor: "EDWIN",
  tasa_venta: 0.005, tasa_cobro: 0.005,
  ventas: [{ fecha: "2026-09-03", cliente: "City Mall", secuencial: "11-000003022", tipo: "Factura", subtotal: 1000, pct_utilidad: 30 }],
  cobros: [], ventas_base: 1000, cobros_base: 0,
  comision_venta: 70.69, comision_cobro: 0, comision_total: 70.69,
};

const almacenReal = () => {
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

beforeEach(() => {
  excelUna.mockClear();
  excelVarias.mockClear();
  Object.defineProperty(window, "localStorage", { value: almacenReal(), configurable: true, writable: true });
  Object.defineProperty(window, "sessionStorage", { value: almacenReal(), configurable: true, writable: true });
  sessionStorage.setItem("cxc_role", "admin");
  vi.stubGlobal("print", vi.fn());
  vi.stubGlobal("fetch", async (url: RequestInfo | URL) => {
    const u = String(url);
    const cuerpo = u.includes("/consolidado")
      ? CONSOLIDADO
      : u.includes("/detalle")
        ? DETALLE
        : u.includes("/descuentos")
          ? { descuentos: [] }
          : {};
    return new Response(JSON.stringify(cuerpo), { status: 200, headers: { "content-type": "application/json" } });
  });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const filaDe = async (nombre: string) => {
  const tabla = await screen.findByRole("table");
  return within(tabla).getByText(nombre).closest("tr")! as HTMLTableRowElement;
};
const celdaCon = (fila: HTMLElement, texto: string) =>
  within(fila).getAllByRole("cell").find((c) => c.textContent?.includes(texto))!;

// ═══ 1 · Dónde aparece y dónde NO ═══════════════════════════════════════════

describe("🔴 la flechita solo donde hay algo que bajar", () => {
  it("la celda con número la lleva; la que dice «—», no", () => {
    render(<ComisionesConsolidadoView year={2026} mes={9} />);
    return waitFor(async () => {
      const fila = await filaDe("Reynaldo Espinosa");
      const conNumero = celdaCon(fila, "−$1,513.08");
      expect(within(conNumero).getByRole("button", { name: /Descargar/ })).toBeTruthy();

      const enGuion = within(fila).getAllByRole("cell").find((c) => c.textContent?.trim() === "—")!;
      expect(within(enGuion).queryByRole("button")).toBeNull();
    });
  });

  it("🔴 y la columna Total tiene la suya", async () => {
    render(<ComisionesConsolidadoView year={2026} mes={9} />);
    const fila = await filaDe("Reynaldo Espinosa");
    const flechas = within(fila).getAllByRole("button", { name: /Descargar/ });
    // Fashion Shoes + Vistana + el Total = 3 (Active Shoes está en guion).
    expect(flechas.length).toBe(3);
    expect(flechas.some((b) => (b.getAttribute("aria-label") ?? "").includes("Todas las empresas"))).toBe(true);
  });

  it("⚠️ con «Todo el año» NO hay flechas: el reporte por vendedor es de un mes", async () => {
    render(<ComisionesConsolidadoView year={2026} mes={0} />);
    await screen.findByRole("table");
    expect(screen.queryAllByRole("button", { name: /Descargar/ }).length).toBe(0);
  });
});

// ═══ 2 · Qué dice el menú ═══════════════════════════════════════════════════

describe("🔴 el menú dice de quién, de qué y ofrece los dos formatos", () => {
  it("dos líneas: PDF y Excel, con el encabezado del alcance", async () => {
    render(<ComisionesConsolidadoView year={2026} mes={9} />);
    const fila = await filaDe("Reynaldo Espinosa");
    const celda = celdaCon(fila, "−$1,513.08");
    fireEvent.click(within(celda).getByRole("button", { name: /Descargar/ }));

    const menu = await screen.findByRole("menu");
    expect(menu.textContent).toContain("Reynaldo Espinosa · Fashion Shoes · Septiembre");
    expect(within(menu).getByRole("menuitem", { name: /Descargar en PDF/ })).toBeTruthy();
    expect(within(menu).getByRole("menuitem", { name: /Descargar en Excel/ })).toBeTruthy();
  });

  it("el de la columna Total dice «Todas las empresas»", async () => {
    render(<ComisionesConsolidadoView year={2026} mes={9} />);
    const fila = await filaDe("Reynaldo Espinosa");
    const total = celdaCon(fila, "−$1,471.31");
    fireEvent.click(within(total).getByRole("button", { name: /Descargar/ }));
    const menu = await screen.findByRole("menu");
    expect(menu.textContent).toContain("Reynaldo Espinosa · Todas las empresas · Septiembre");
  });
});

// ═══ 3 · El alcance de cada flecha ══════════════════════════════════════════

describe("🔴 tres alcances: una empresa · las de esa persona", () => {
  it("la flecha de una CELDA baja UNA sola empresa", async () => {
    render(<ComisionesConsolidadoView year={2026} mes={9} />);
    const fila = await filaDe("Reynaldo Espinosa");
    const celda = celdaCon(fila, "−$1,513.08");
    fireEvent.click(within(celda).getByRole("button", { name: /Descargar/ }));
    const menu = await screen.findByRole("menu");
    await act(async () => {
      fireEvent.click(within(menu).getByRole("menuitem", { name: /Descargar en Excel/ }));
    });
    await waitFor(() => expect(excelUna).toHaveBeenCalledTimes(1));
    // Una empresa = el archivo de UNA hoja de siempre, nunca el de varias.
    expect(excelVarias).not.toHaveBeenCalled();
    expect(excelUna.mock.calls[0][1]).toBe("Fashion Shoes");
  });

  it("🔴 la flecha del TOTAL baja TODAS las empresas de esa persona, en un archivo", async () => {
    render(<ComisionesConsolidadoView year={2026} mes={9} />);
    const fila = await filaDe("Reynaldo Espinosa");
    const total = celdaCon(fila, "−$1,471.31");
    fireEvent.click(within(total).getByRole("button", { name: /Descargar/ }));
    const menu = await screen.findByRole("menu");
    await act(async () => {
      fireEvent.click(within(menu).getByRole("menuitem", { name: /Descargar en Excel/ }));
    });
    await waitFor(() => expect(excelVarias).toHaveBeenCalledTimes(1));
    // Las DOS empresas con número (Active Shoes está en guion y no entra).
    const hojas = excelVarias.mock.calls[0][0] as { empresaNombre: string }[];
    expect(hojas.map((h) => h.empresaNombre)).toEqual(["Vistana", "Fashion Shoes"]);
    // Y es UN archivo, no uno por empresa.
    expect(excelUna).not.toHaveBeenCalled();
  });

  it("el PDF de una celda monta el MISMO papel del detalle e imprime", async () => {
    render(<ComisionesConsolidadoView year={2026} mes={9} />);
    const fila = await filaDe("Edwin");
    const celda = celdaCon(fila, "$70.69");
    fireEvent.click(within(celda).getByRole("button", { name: /Descargar/ }));
    const menu = await screen.findByRole("menu");
    await act(async () => {
      fireEvent.click(within(menu).getByRole("menuitem", { name: /Descargar en PDF/ }));
    });
    await waitFor(() => expect(document.querySelector("#print-document")).toBeTruthy());
    // El papel es el de siempre: la factura LARGA (se concilia contra Switch).
    expect(document.querySelector("#print-document")!.textContent).toContain("11-000003022");
    expect(window.print).toHaveBeenCalled();
  });
});

describe("🔴 el archivo dice cuál de los tres alcances es", () => {
  it("el PDF del TOTAL se llama «Todas», no como el de una empresa", async () => {
    const tituloOriginal = document.title;
    render(<ComisionesConsolidadoView year={2026} mes={9} />);
    const fila = await filaDe("Reynaldo Espinosa");
    const total = celdaCon(fila, "−$1,471.31");
    fireEvent.click(within(total).getByRole("button", { name: /Descargar/ }));
    const menu = await screen.findByRole("menu");
    await act(async () => {
      fireEvent.click(within(menu).getByRole("menuitem", { name: /Descargar en PDF/ }));
    });
    // Chrome nombra el PDF con el `document.title`: eso es el nombre del archivo.
    await waitFor(() => expect(document.title).toBe("Comisión-Reynaldo-Espinosa-Todas-2026-09"));
    document.title = tituloOriginal;
  });

  it("y el de una CELDA lleva la empresa en el nombre", async () => {
    const tituloOriginal = document.title;
    render(<ComisionesConsolidadoView year={2026} mes={9} />);
    const fila = await filaDe("Edwin");
    const celda = celdaCon(fila, "$70.69");
    fireEvent.click(within(celda).getByRole("button", { name: /Descargar/ }));
    const menu = await screen.findByRole("menu");
    await act(async () => {
      fireEvent.click(within(menu).getByRole("menuitem", { name: /Descargar en PDF/ }));
    });
    await waitFor(() => expect(document.title).toBe("Comisión-Edwin-Vistana-2026-09"));
    document.title = tituloOriginal;
  });
});

// ═══ 4 · Lo que NO cambió ═══════════════════════════════════════════════════

describe("🔴 tocar el número sigue abriendo el detalle", () => {
  it("la celda abre el detalle inline, igual que antes de la flecha", async () => {
    render(<ComisionesConsolidadoView year={2026} mes={9} />);
    const fila = await filaDe("Edwin");
    const celda = celdaCon(fila, "$70.69");
    await act(async () => { fireEvent.click(celda); });
    await waitFor(() => expect(document.querySelector('[data-comision-detalle="inline"]')).toBeTruthy());
    expect(celda.getAttribute("aria-current")).toBe("true");
  });

  it("🔴 y tocar la FLECHA no abre el detalle: son dos caminos, no uno", async () => {
    render(<ComisionesConsolidadoView year={2026} mes={9} />);
    const fila = await filaDe("Edwin");
    const celda = celdaCon(fila, "$70.69");
    await act(async () => {
      fireEvent.click(within(celda).getByRole("button", { name: /Descargar/ }));
    });
    expect(await screen.findByRole("menu")).toBeTruthy();
    expect(document.querySelector('[data-comision-detalle="inline"]')).toBeNull();
  });
});

// ═══ 5 · El botón de arriba: las 6 empresas ════════════════════════════════

describe("🔴 «Descargar el mes en PDF» trae las 6 empresas", () => {
  it("el papel del mes lista las SEIS columnas, no una", async () => {
    let correr: (() => void) | null = null;
    render(
      <ComisionesConsolidadoView
        year={2026}
        mes={9}
        onPdf={(api) => { correr = api ? api.run : null; }}
      />,
    );
    const tabla = await screen.findByRole("table");
    // El pie que se VE en la pantalla, para exigir que el papel diga lo mismo.
    const pieEnPantalla = tabla.querySelector("tfoot")!.textContent!.trim();

    await waitFor(() => expect(correr).not.toBeNull());
    await act(async () => { correr!(); });

    const papel = await waitFor(() => document.querySelector("#print-document") as HTMLElement);
    const encabezados = [...papel.querySelectorAll("thead th")].map((t) => t.textContent);
    expect(encabezados).toEqual([
      "Vendedor", "Vistana", "Fashion Wear", "Fashion Shoes",
      "Active Shoes", "Active Wear", "Joystep", "Total",
    ]);
    // 🔴 Y CADA FILA TRAE LAS OCHO CELDAS: si el papel se armara con una sola
    // empresa, acá saldrían 3 y el archivo sería otra cosa con el mismo nombre.
    const cuerpo = [...papel.querySelectorAll("tbody tr")];
    expect(cuerpo.length).toBeGreaterThan(0);
    for (const tr of cuerpo) expect(tr.querySelectorAll("td").length).toBe(8);
    // Y los números son los de la matriz: Reynaldo en Fashion Shoes y en Vistana.
    const reynaldo = cuerpo.find((tr) => tr.textContent?.includes("Reynaldo Espinosa"))!;
    const celdas = [...reynaldo.querySelectorAll("td")].map((td) => td.textContent);
    expect(celdas).toEqual([
      "Reynaldo Espinosa", "$41.77", "$0.00", "−$1,513.08",
      "$0.00", "$0.00", "$0.00", "−$1,471.31",
    ]);

    // 🔴 Y EL PIE DEL PAPEL ES EL MISMO DE LA PANTALLA, celda por celda: si el
    // papel se armara de otra suma, acá se vería. (−$1,400.62 = Reynaldo
    // −1.471,31 + Edwin 70,69.)
    expect(papel.querySelector("tfoot")!.textContent!.trim()).toBe(pieEnPantalla);
    expect(pieEnPantalla).toContain("−$1,400.62");
    expect(window.print).toHaveBeenCalled();
  });
});

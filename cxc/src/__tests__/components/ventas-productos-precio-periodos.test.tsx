// ─────────────────────────────────────────────────────────────────────────────
// CANDADO DE CONDUCTA de Ventas › Productos: precio promedio + los 4 períodos.
//
// 🔴 LO QUE ESTE ARCHIVO EXISTE PARA CAZAR: que "agregué la columna" y "agregué
// los períodos" sea, en los hechos, un <th> que nadie puede tocar y un
// desplegable que no cambia lo que se pide. Que compile no prueba nada.
//
// Por eso acá NO hay barridos de texto sobre el archivo fuente —un barrido
// estático pasa borrando los comentarios primero—: se RENDERIZA la pantalla, se
// TOCAN los encabezados y el selector, y se mira qué quedó dibujado y qué URL
// se pidió.
//
// Las cuatro cosas que se prueban tocando:
//   1. Precio prom. sale de venta ÷ unidades, y sin unidades netas NO es cero.
//   2. Tocar "Precio prom." REORDENA las filas (no solo pinta una flechita).
//   3. Cambiar el período cambia LO QUE SE PIDE, y pide su comparativo `previo=1`.
//   4. Si la ventana de comparación vino VACÍA, la pantalla lo DICE.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor, within } from "@testing-library/react";
import { ProductosView } from "@/components/ventas/ProductosView";
import type { ProductosResponse } from "@/lib/ventas/productos";

vi.mock("next/navigation", () => ({
  usePathname: () => "/ventas",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

// Radix Select necesita estas tres APIs del navegador que jsdom no trae. Sin
// ellas el desplegable no abre y el test "pasa" sin haber tocado nada.
beforeAll(() => {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  window.HTMLElement.prototype.hasPointerCapture = vi.fn(() => false) as never;
  window.HTMLElement.prototype.releasePointerCapture = vi.fn();
  window.HTMLElement.prototype.setPointerCapture = vi.fn();
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

// ── Fixture: tres descripciones con precios promedio MUY distintos ───────────
// El orden por venta (el default) NO coincide con el orden por precio promedio:
// si coincidieran, un "ordenar" que no hiciera nada pasaría el test igual.
const PRODUCTOS = [
  { descripcion: "CAMISA POLO", num_codigos: 3, cantidad: 1000, venta: 9000, costo: 5400, margen: 0.4 },   // $9.00
  { descripcion: "SANDALIA", num_codigos: 2, cantidad: 100, venta: 5000, costo: 3000, margen: 0.4 },        // $50.00
  { descripcion: "DEVUELTO", num_codigos: 1, cantidad: 0, venta: 300, costo: 100, margen: 0.667 },          // sin precio
];

function respuesta(over: Partial<ProductosResponse> = {}): ProductosResponse {
  return {
    empresa: "fashion_wear",
    year: 2026,
    mes: null,
    periodo: "ytd",
    desde: "2026-01-01",
    hasta: "2026-08-24",
    comparativo: { desde: "2025-01-01", hasta: "2025-12-31" },
    meses: [1, 2, 3],
    totales: { venta: 14300, costo: 8500, margen: 0.4056 },
    productos: PRODUCTOS,
    ...over,
  };
}

let urlsPedidas: string[] = [];
/** Qué devuelve la llamada del COMPARATIVO (`previo=1`). */
let productosPrevios: ProductosResponse["productos"] = [
  { descripcion: "CAMISA POLO", num_codigos: 3, cantidad: 900, venta: 8000, costo: 4800, margen: 0.4 },
  { descripcion: "SANDALIA", num_codigos: 2, cantidad: 90, venta: 4500, costo: 2700, margen: 0.4 },
];

beforeEach(() => {
  urlsPedidas = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    urlsPedidas.push(String(url));
    if (String(url).includes("/codigos")) {
      return json({
        codigos: [
          { codigo: "A-1", descripcion: "CAMISA POLO", cantidad: 800, venta: 8000, costo: 4800, margen: 0.4 },
          { codigo: "A-2", descripcion: "CAMISA POLO", cantidad: 200, venta: 1000, costo: 600, margen: 0.4 },
        ],
      });
    }
    const previo = String(url).includes("previo=1");
    const periodo = (new URL(String(url), "http://x").searchParams.get("periodo") ?? "ytd") as never;
    return json(respuesta(previo ? { productos: productosPrevios } : { periodo }));
  }));
});

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function json(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}

/** Las descripciones en el orden en que están dibujadas AHORA. */
function ordenEnPantalla(): string[] {
  return [...document.querySelectorAll("tr[data-fila-producto]")]
    .map(tr => tr.getAttribute("data-fila-producto") ?? "");
}

function celda(fila: string, col: string): string {
  const tr = document.querySelector(`tr[data-fila-producto="${fila}"]`);
  return (tr?.querySelector(`[data-col="${col}"]`)?.textContent ?? "").trim();
}

async function pintada() {
  await waitFor(() => expect(ordenEnPantalla().length).toBe(3));
}

/** Abre un Radix Select por su valor actual y elige la opción por texto. */
async function elegirEnSelector(valorActual: string | RegExp, opcion: string | RegExp) {
  const trigger = screen.getByText(valorActual).closest("button");
  expect(trigger, `no encontré el selector "${valorActual}"`).toBeTruthy();
  fireEvent.keyDown(trigger!, { key: "ArrowDown" });
  const item = await screen.findByRole("option", { name: opcion });
  fireEvent.click(item);
}

describe("1 · la columna Precio prom. dice venta ÷ unidades", () => {
  it("cada fila trae su precio promedio, con el formato de plata de la casa", async () => {
    render(<ProductosView selectedYear={2026} />);
    await pintada();
    expect(celda("CAMISA POLO", "precio")).toBe("$9.00");
    expect(celda("SANDALIA", "precio")).toBe("$50.00");
  });

  it("un grupo sin unidades netas muestra '—', NO $0.00", async () => {
    // Un "$0.00" se lee como "lo regalé". La devolución neta no tiene precio.
    render(<ProductosView selectedYear={2026} />);
    await pintada();
    expect(celda("DEVUELTO", "precio")).toBe("—");
  });

  it("las columnas que ya estaban siguen diciendo lo mismo", async () => {
    render(<ProductosView selectedYear={2026} />);
    await pintada();
    expect(celda("CAMISA POLO", "cantidad")).toBe("1,000");
    expect(celda("CAMISA POLO", "venta")).toBe("$9,000.00");
    expect(celda("CAMISA POLO", "margen")).toBe("40.0%");
    expect(celda("CAMISA POLO", "codigos")).toBe("3");
  });

  it("el desplegable de códigos también trae el precio de cada código", async () => {
    render(<ProductosView selectedYear={2026} />);
    await pintada();
    fireEvent.click(document.querySelector('tr[data-fila-producto="CAMISA POLO"]')!);
    const tabla = await waitFor(() => {
      const t = document.querySelector("[data-drill-codigos]");
      expect(t).toBeTruthy();
      return t as HTMLElement;
    });
    // A-1: 8000/800 = $10.00 · A-2: 1000/200 = $5.00
    expect(within(tabla).getByText("$10.00")).toBeTruthy();
    expect(within(tabla).getByText("$5.00")).toBeTruthy();
  });
});

describe("2 · tocar el encabezado REORDENA de verdad", () => {
  it("por precio promedio: la sandalia sube por encima de la camisa", async () => {
    render(<ProductosView selectedYear={2026} />);
    await pintada();
    // Default = venta desc: la camisa ($9.000) va antes que la sandalia ($5.000).
    expect(ordenEnPantalla()).toEqual(["CAMISA POLO", "SANDALIA", "DEVUELTO"]);

    fireEvent.click(screen.getByRole("button", { name: /Precio prom\./ }));
    // Por precio desc: sandalia $50 · camisa $9 · devuelto sin precio, al final.
    await waitFor(() => expect(ordenEnPantalla()).toEqual(["SANDALIA", "CAMISA POLO", "DEVUELTO"]));
  });

  it("un segundo toque invierte el orden (no lo deja quieto)", async () => {
    render(<ProductosView selectedYear={2026} />);
    await pintada();
    const th = screen.getByRole("button", { name: /Precio prom\./ });
    fireEvent.click(th);
    await waitFor(() => expect(ordenEnPantalla()[0]).toBe("SANDALIA"));
    fireEvent.click(th);
    await waitFor(() => expect(ordenEnPantalla()).toEqual(["DEVUELTO", "CAMISA POLO", "SANDALIA"]));
  });

  it("las otras tres columnas siguen ordenando como siempre", async () => {
    render(<ProductosView selectedYear={2026} />);
    await pintada();
    fireEvent.click(screen.getByRole("button", { name: /^Cant/ }));
    await waitFor(() => expect(ordenEnPantalla()).toEqual(["CAMISA POLO", "SANDALIA", "DEVUELTO"]));
    fireEvent.click(screen.getByRole("button", { name: /^Venta/ }));
    await waitFor(() => expect(ordenEnPantalla()).toEqual(["CAMISA POLO", "SANDALIA", "DEVUELTO"]));
    fireEvent.click(screen.getByRole("button", { name: /Margen/ }));
    await waitFor(() => expect(ordenEnPantalla()[0]).toBe("DEVUELTO")); // margen 66,7%
  });
});

describe("3 · el selector de período cambia LO QUE SE PIDE", () => {
  it("arranca en el año en curso y pide su comparativo", async () => {
    render(<ProductosView selectedYear={2026} />);
    await pintada();
    expect(urlsPedidas.some(u => u.includes("periodo=ytd") && !u.includes("previo"))).toBe(true);
    expect(urlsPedidas.some(u => u.includes("periodo=ytd") && u.includes("previo=1"))).toBe(true);
  });

  it("ofrece los cuatro períodos de Daniel, con esos nombres", async () => {
    render(<ProductosView selectedYear={2026} />);
    await pintada();
    const trigger = screen.getByText("Año en curso").closest("button")!;
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    for (const nombre of ["Año en curso", "Últimos 6 meses", "Últimos 12 meses", "Año pasado"]) {
      expect(await screen.findByRole("option", { name: nombre })).toBeTruthy();
    }
  });

  it("el mes suelto que ya existía NO desapareció", async () => {
    render(<ProductosView selectedYear={2026} />);
    await pintada();
    const trigger = screen.getByText("Año en curso").closest("button")!;
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    expect(await screen.findByRole("option", { name: "Feb 2026" })).toBeTruthy();
  });

  it("elegir 'Últimos 12 meses' pide periodo=12m y su previo=1", async () => {
    render(<ProductosView selectedYear={2026} />);
    await pintada();
    urlsPedidas = [];
    await elegirEnSelector("Año en curso", "Últimos 12 meses");
    await waitFor(() => {
      expect(urlsPedidas.some(u => u.includes("periodo=12m") && !u.includes("previo"))).toBe(true);
      expect(urlsPedidas.some(u => u.includes("periodo=12m") && u.includes("previo=1"))).toBe(true);
    });
    // Y NO manda un mes suelto pegado que contradiga la ventana relativa.
    expect(urlsPedidas.every(u => !u.includes("mes="))).toBe(true);
  });

  it("elegir un mes vuelve a periodo=ytd + mes=N (el camino de siempre)", async () => {
    render(<ProductosView selectedYear={2026} />);
    await pintada();
    urlsPedidas = [];
    await elegirEnSelector("Año en curso", "Mar 2026");
    await waitFor(() => {
      expect(urlsPedidas.some(u => u.includes("periodo=ytd") && u.includes("mes=3"))).toBe(true);
    });
  });

  it("el rótulo del Δ deja de mentir un año cuando la ventana es relativa", async () => {
    render(<ProductosView selectedYear={2026} />);
    await pintada();
    expect(screen.getByText("Δ 2025")).toBeTruthy();
    await elegirEnSelector("Año en curso", "Últimos 6 meses");
    await waitFor(() => expect(screen.getByText("Δ año ant.")).toBeTruthy());
  });

  it("las DOS fechas del período están en pantalla (un rótulo relativo solo, no)", async () => {
    render(<ProductosView selectedYear={2026} />);
    await pintada();
    const resumen = document.querySelector("[data-resumen-productos]")!;
    expect(resumen.textContent).toContain("Del 1 ene 2026 al 24 ago 2026");
    expect(resumen.textContent).toContain("Δ contra 1 ene 2025 – 31 dic 2025");
  });

  it("el total de piezas y el precio promedio del período están arriba", async () => {
    render(<ProductosView selectedYear={2026} />);
    await pintada();
    const resumen = document.querySelector("[data-resumen-productos]")!;
    expect(resumen.textContent).toContain("1,100 piezas");    // 1000 + 100 + 0
    expect(resumen.textContent).toContain("$13.00");           // 14.300 / 1.100
  });

  it("el renglón de Venta/Margen de siempre quedó intacto", async () => {
    render(<ProductosView selectedYear={2026} />);
    await pintada();
    const p = document.querySelector("[data-totales-productos]")!;
    expect(p.textContent).toBe("Venta $14,300.00·Margen 40.6%");
  });
});

describe("3b · el desplegable de códigos hereda el período elegido", () => {
  it("con 'Últimos 12 meses', los códigos se piden con periodo=12m", async () => {
    // Sin esto los códigos de adentro suman OTRA ventana que la fila de arriba:
    // el desplegable no cuadra con su propio total y nadie sabe cuál miente.
    render(<ProductosView selectedYear={2026} />);
    await pintada();
    await elegirEnSelector("Año en curso", "Últimos 12 meses");
    await waitFor(() => expect(urlsPedidas.some(u => u.includes("periodo=12m"))).toBe(true));
    urlsPedidas = [];
    fireEvent.click(document.querySelector('tr[data-fila-producto="CAMISA POLO"]')!);
    await waitFor(() => {
      const drill = urlsPedidas.filter(u => u.includes("/codigos"));
      expect(drill.length).toBeGreaterThan(0);
      expect(drill.every(u => u.includes("periodo=12m"))).toBe(true);
    });
  });

  it("con un mes suelto, los códigos se piden con ese mes", async () => {
    render(<ProductosView selectedYear={2026} />);
    await pintada();
    await elegirEnSelector("Año en curso", "Mar 2026");
    await waitFor(() => expect(urlsPedidas.some(u => u.includes("mes=3"))).toBe(true));
    urlsPedidas = [];
    fireEvent.click(document.querySelector('tr[data-fila-producto="CAMISA POLO"]')!);
    await waitFor(() => {
      const drill = urlsPedidas.filter(u => u.includes("/codigos"));
      expect(drill.length).toBeGreaterThan(0);
      expect(drill.every(u => u.includes("mes=3") && u.includes("periodo=ytd"))).toBe(true);
    });
  });
});

describe("4 · un período sin comparativo lo DICE, no inventa un porcentaje", () => {
  it("con la ventana anterior vacía sale el aviso", async () => {
    productosPrevios = [];
    render(<ProductosView selectedYear={2026} />);
    await pintada();
    const aviso = await waitFor(() => {
      const el = document.querySelector("[data-sin-comparativo]");
      expect(el).toBeTruthy();
      return el as HTMLElement;
    });
    expect(aviso.textContent).toContain("no tiene");
    expect(aviso.textContent).toContain("1 ene 2025");
  });

  it("con comparativo real NO aparece el aviso", async () => {
    productosPrevios = [
      { descripcion: "CAMISA POLO", num_codigos: 3, cantidad: 900, venta: 8000, costo: 4800, margen: 0.4 },
    ];
    render(<ProductosView selectedYear={2026} />);
    await pintada();
    await waitFor(() => expect(celda("CAMISA POLO", "delta")).toBe("+13%"));
    expect(document.querySelector("[data-sin-comparativo]")).toBeNull();
  });
});

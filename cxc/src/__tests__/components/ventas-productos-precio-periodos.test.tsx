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
import { readFileSync } from "fs";
import path from "path";

// ─────────────────────────────────────────────────────────────────────────────
// 🩸 EN JSDOM LOS DOS LAYOUTS EXISTEN A LA VEZ, y hay que decir cuál se mira.
//
// Desde el 25-ago-2026 esta pantalla tiene TABLA (desde `sm`) y TARJETAS (en
// celular): Daniel a 390 px sólo veía Venta y Margen y pidió ver también las
// piezas y el precio promedio. En el navegador se ve UNO de los dos; en jsdom
// no hay CSS, así que los dos están montados y un `screen.getByRole` suelto
// encuentra DOS botones "Precio prom." y falla por ambigüedad.
//
// Por eso los candados de la tabla preguntan DENTRO de `[data-vista="tabla"]` y
// los de las tarjetas dentro de `[data-vista="tarjetas"]`. No es una molestia
// del test: con dos layouts, "el botón de ordenar" ya no es una sola cosa, y un
// candado que no dice cuál mira estaría probando el azar del orden del DOM.
//
// 🔑 `data-vista` es FIJO, NO la clase del breakpoint: `.sm\:hidden` deja de
// existir en cuanto el corte se mueve y el `querySelector` devolvería null.
// `enTabla()` y `enTarjetas()` REVIENTAN si el layout no está, que es lo único
// que impide que un candado "pase" sin haber mirado nada.
// ─────────────────────────────────────────────────────────────────────────────
function layout(vista: "tabla" | "tarjetas") {
  const el = document.querySelector(`[data-vista="${vista}"]`);
  if (!el) throw new Error(`no está el layout data-vista="${vista}" — el candado no miró nada`);
  return within(el as HTMLElement);
}
const enTabla = () => layout("tabla");
const enTarjetas = () => layout("tarjetas");

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
    totales: { venta: 14300, costo: 8500, margen: 0.4056 },
    productos: PRODUCTOS,
    ...over,
  };
}

let urlsPedidas: string[] = [];
/** Cuando true, la llamada del comparativo (`previo=1`) responde 500 — o sea el
 *  tropiezo de red que hacía salir el catálogo entero como "Nuevo". */
let fallarComparativo = false;
/** Un `aviso` INVENTADO en la respuesta del servidor. Ya no existe en el tipo:
 *  el candado 9 lo inyecta a mano justamente para exigir que, aunque llegara,
 *  la pantalla no lo dibuje. Ver el encabezado de ese bloque. */
let avisoDeLaFila: { otra: string; codigo: string }[] = [];
/** Qué devuelve el desplegable en «Quién lo compra». `null` = no se pudo. */
let clientesDelDrill: unknown = [
  { cliente_switch_id: 1, cliente_nombre: "City Mall Paso Canoa", cantidad: 750, venta: 6750 },
  { cliente_switch_id: 2, cliente_nombre: "Golden Mall", cantidad: 250, venta: 2250 },
];
/** Qué devuelve la llamada del COMPARATIVO (`previo=1`). */
let productosPrevios: ProductosResponse["productos"] = [
  { descripcion: "CAMISA POLO", num_codigos: 3, cantidad: 900, venta: 8000, costo: 4800, margen: 0.4 },
  { descripcion: "SANDALIA", num_codigos: 2, cantidad: 90, venta: 4500, costo: 2700, margen: 0.4 },
];

beforeEach(() => {
  urlsPedidas = [];
  fallarComparativo = false;
  avisoDeLaFila = [];
  clientesDelDrill = [
    { cliente_switch_id: 1, cliente_nombre: "City Mall Paso Canoa", cantidad: 750, venta: 6750 },
    { cliente_switch_id: 2, cliente_nombre: "Golden Mall", cantidad: 250, venta: 2250 },
  ];
  productosPrevios = [
    { descripcion: "CAMISA POLO", num_codigos: 3, cantidad: 900, venta: 8000, costo: 4800, margen: 0.4 },
    { descripcion: "SANDALIA", num_codigos: 2, cantidad: 90, venta: 4500, costo: 2700, margen: 0.4 },
  ];
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    urlsPedidas.push(String(url));
    if (fallarComparativo && String(url).includes("previo=1")) {
      return { ok: false, status: 500, json: async () => ({}) } as unknown as Response;
    }
    if (String(url).includes("/codigos")) {
      return json({
        codigos: [
          { codigo: "A-1", descripcion: "CAMISA POLO", cantidad: 800, venta: 8000, costo: 4800, margen: 0.4 },
          { codigo: "A-2", descripcion: "CAMISA POLO", cantidad: 200, venta: 1000, costo: 600, margen: 0.4 },
        ],
        clientes: clientesDelDrill,
      });
    }
    const previo = String(url).includes("previo=1");
    const periodo = (new URL(String(url), "http://x").searchParams.get("periodo") ?? "ytd") as never;
    if (previo) return json(respuesta({ productos: productosPrevios }));
    // El `aviso` viajaba en la fila de NIVEL 1. Ya no lo manda nadie; se
    // inyecta acá para que el candado 9 pueda exigir que, si volviera a
    // llegar, la pantalla siga sin dibujarlo.
    const productos = PRODUCTOS.map(p =>
      p.descripcion === "CAMISA POLO" && avisoDeLaFila.length > 0
        ? ({ ...p, aviso: avisoDeLaFila } as typeof p)
        : p,
    );
    return json(respuesta({ periodo, productos }));
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
    // 🔑 El desplegable abre en «Quién lo compra» desde el 25-ago-2026 (es lo
    // que pidió Daniel). Los códigos NO se perdieron: están a un toque, en su
    // pestaña — y esta prueba lo comprueba tocándola.
    render(<ProductosView selectedYear={2026} />);
    await pintada();
    fireEvent.click(document.querySelector('tr[data-fila-producto="CAMISA POLO"]')!);
    await waitFor(() => enTabla().getByRole("tab", { name: /Códigos/ }));
    fireEvent.click(enTabla().getByRole("tab", { name: /Códigos/ }));
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

    fireEvent.click(enTabla().getByRole("button", { name: /Precio prom\./ }));
    // Por precio desc: sandalia $50 · camisa $9 · devuelto sin precio, al final.
    await waitFor(() => expect(ordenEnPantalla()).toEqual(["SANDALIA", "CAMISA POLO", "DEVUELTO"]));
  });

  it("un segundo toque invierte el orden (no lo deja quieto)", async () => {
    render(<ProductosView selectedYear={2026} />);
    await pintada();
    const th = enTabla().getByRole("button", { name: /Precio prom\./ });
    fireEvent.click(th);
    await waitFor(() => expect(ordenEnPantalla()[0]).toBe("SANDALIA"));
    fireEvent.click(th);
    await waitFor(() => expect(ordenEnPantalla()).toEqual(["DEVUELTO", "CAMISA POLO", "SANDALIA"]));
  });

  it("las otras tres columnas siguen ordenando como siempre", async () => {
    render(<ProductosView selectedYear={2026} />);
    await pintada();
    fireEvent.click(enTabla().getByRole("button", { name: /^Cant/ }));
    await waitFor(() => expect(ordenEnPantalla()).toEqual(["CAMISA POLO", "SANDALIA", "DEVUELTO"]));
    fireEvent.click(enTabla().getByRole("button", { name: /^Venta/ }));
    await waitFor(() => expect(ordenEnPantalla()).toEqual(["CAMISA POLO", "SANDALIA", "DEVUELTO"]));
    fireEvent.click(enTabla().getByRole("button", { name: /Margen/ }));
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

  // ⛔ ACÁ VIVÍA «el mes suelto que ya existía NO desapareció», y el candado
  // CAMBIÓ DE DIRECCIÓN el 25-ago-2026. Daniel, textual, mirando el
  // desplegable: *"solo dejame las 4 primeras, las otras quítamelas que sobran,
  // nunca te las pedí"*. O sea que el test viejo fijaba justo lo que él mandó
  // sacar. Ahora se exige lo contrario: que NINGÚN mes vuelva a la lista.
  it("⛔ los 12 meses sueltos NO vuelven al desplegable", async () => {
    render(<ProductosView selectedYear={2026} />);
    await pintada();
    const trigger = screen.getByText("Año en curso").closest("button")!;
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    // Se espera a que la lista esté pintada antes de afirmar una ausencia: sin
    // esto, "no hay ningún mes" se cumpliría con el desplegable todavía vacío.
    expect(await screen.findByRole("option", { name: "Últimos 6 meses" })).toBeTruthy();
    const opciones = screen.getAllByRole("option").map(o => (o.textContent ?? "").trim());
    expect(opciones).toEqual([
      "Año en curso",
      "Últimos 6 meses",
      "Últimos 12 meses",
      "Año pasado",
    ]);
    expect(opciones.some(t => /^(Ene|Feb|Mar|Abr|May|Jun|Jul|Ago|Sep|Oct|Nov|Dic)\b/.test(t))).toBe(false);
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

  it("⛔ la pantalla ya no manda `mes=` en ninguna de sus peticiones", async () => {
    // El servidor SIGUE aceptando `?mes=6` (un marcador viejo tiene que seguir
    // contestando lo mismo — hay candado en la ruta). Lo que se retiró es que
    // la PANTALLA lo pida.
    render(<ProductosView selectedYear={2026} />);
    await pintada();
    let actual = "Año en curso";
    for (const periodo of ["Últimos 6 meses", "Últimos 12 meses", "Año pasado"]) {
      urlsPedidas = [];
      await elegirEnSelector(actual, periodo);
      await waitFor(() => expect(urlsPedidas.length).toBeGreaterThan(0));
      expect(urlsPedidas.every(u => !u.includes("mes="))).toBe(true);
      // «Año pasado» se dibuja como «Año 2025» una vez elegido.
      actual = periodo === "Año pasado" ? "Año 2025" : periodo;
    }
  });

  // La "Δ" se fue del rótulo: es notación de matemática en una tabla que mira
  // gente que no la conoce. Lo que NO cambió es que el año deje de mentir.
  it("el rótulo de la columna de cambio deja de mentir un año cuando la ventana es relativa", async () => {
    render(<ProductosView selectedYear={2026} />);
    await pintada();
    expect(screen.getByText("vs 2025")).toBeTruthy();
    await elegirEnSelector("Año en curso", "Últimos 6 meses");
    await waitFor(() => expect(screen.getByText("vs año ant.")).toBeTruthy());
    expect(screen.queryByText(/^Δ/)).toBeNull();
  });

  it("las DOS fechas del período están en pantalla (un rótulo relativo solo, no)", async () => {
    render(<ProductosView selectedYear={2026} />);
    await pintada();
    const resumen = document.querySelector("[data-resumen-productos]")!;
    expect(resumen.textContent).toContain("Del 1 ene 2026 al 24 ago 2026");
    expect(resumen.textContent).toContain("comparado con 1 ene 2025 – 31 dic 2025");
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

  it("con «Año pasado», los códigos se piden con ese período y sin mes", async () => {
    render(<ProductosView selectedYear={2026} />);
    await pintada();
    await elegirEnSelector("Año en curso", "Año pasado");
    await waitFor(() => expect(urlsPedidas.some(u => u.includes("periodo=anio_pasado"))).toBe(true));
    urlsPedidas = [];
    fireEvent.click(document.querySelector('tr[data-fila-producto="CAMISA POLO"]')!);
    await waitFor(() => {
      const drill = urlsPedidas.filter(u => u.includes("/codigos"));
      expect(drill.length).toBeGreaterThan(0);
      expect(drill.every(u => u.includes("periodo=anio_pasado") && !u.includes("mes="))).toBe(true);
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

// ─────────────────────────────────────────────────────────────────────────────
// 5 · EL PERÍODO ELEGIDO SE CONSERVA — cambiar empresa o año no lo borra
//
// 🩸 Estabas mirando "Últimos 12 meses", cambiabas de empresa (o el año de
// arriba) y la pantalla volvía sola a "Año en curso" y te vaciaba el buscador,
// sin avisar. En la empresa era un `setPeriodo("ytd") + setSearch("")` puesto
// "por las dudas" (el motivo real era el MES, que puede no existir en la
// combinación nueva); en el año era el `key={selectedYear}` de VentasShell, que
// REMONTA la vista entera y le tira todo el estado.
// ─────────────────────────────────────────────────────────────────────────────

describe("5 · el período elegido se conserva", () => {
  it("cambiar de EMPRESA no vuelve a «Año en curso»", async () => {
    render(<ProductosView selectedYear={2026} />);
    await pintada();
    await elegirEnSelector("Año en curso", "Últimos 12 meses");
    await waitFor(() => expect(urlsPedidas.some(u => u.includes("periodo=12m"))).toBe(true));

    urlsPedidas = [];
    await elegirEnSelector(/Vistana|Fashion Wear|Active/, "Active Shoes");
    await waitFor(() => expect(urlsPedidas.length).toBeGreaterThan(0));
    expect(urlsPedidas.every(u => u.includes("periodo=12m"))).toBe(true);
    expect(urlsPedidas.some(u => u.includes("periodo=ytd"))).toBe(false);
  });

  it("cambiar de EMPRESA no borra lo que estabas buscando", async () => {
    render(<ProductosView selectedYear={2026} />);
    await pintada();
    const buscador = screen.getByPlaceholderText(/Buscar descripción/);
    fireEvent.change(buscador, { target: { value: "SANDALIA" } });
    await waitFor(() => expect(ordenEnPantalla()).toEqual(["SANDALIA"]));

    await elegirEnSelector(/Vistana|Fashion Wear|Active/, "Active Shoes");
    await waitFor(() => expect(urlsPedidas.some(u => u.includes("empresa=active_shoes"))).toBe(true));
    expect((buscador as HTMLInputElement).value).toBe("SANDALIA");
  });

  it("cambiar el AÑO de arriba tampoco lo borra: la vista ya no se remonta", async () => {
    const { rerender } = render(<ProductosView selectedYear={2026} />);
    await pintada();
    await elegirEnSelector("Año en curso", "Últimos 6 meses");
    await waitFor(() => expect(urlsPedidas.some(u => u.includes("periodo=6m"))).toBe(true));

    urlsPedidas = [];
    rerender(<ProductosView selectedYear={2025} />);
    await waitFor(() => expect(urlsPedidas.length).toBeGreaterThan(0));
    expect(urlsPedidas.every(u => u.includes("periodo=6m"))).toBe(true);
  });

  it("🔴 VentasShell ya no remonta Productos al cambiar el año", () => {
    const shell = readFileSync(
      path.join(process.cwd(), "src/app/ventas/VentasShell.tsx"), "utf8",
    )
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n").map(l => l.replace(/(^|[^:])\/\/.*$/, "$1")).join("\n");
    expect(shell).toContain("<ProductosView selectedYear={selectedYear} />");
    expect(shell).not.toMatch(/<ProductosView\s+key=/);
  });

  // ⛔ ACÁ VIVÍA «el MES que no existe en la combinación nueva SÍ se suelta».
  // Ese candado cuidaba el guard que miraba `data.meses`, y el guard MURIÓ con
  // los meses sueltos (Daniel: *"solo dejame las 4 primeras, las otras
  // quítamelas que sobran, nunca te las pedí"*). Sin meses en el selector no
  // hay ninguna elección que pueda quedar inválida al cambiar de empresa, así
  // que no queda nada que cuidar. Lo que ese mismo cambio trajo y SÍ sigue
  // vivo son los dos candados de arriba: cambiar de empresa no te devuelve al
  // año en curso ni te borra el buscador.
});

// ─────────────────────────────────────────────────────────────────────────────
// 6 · «NO SE PUDO CARGAR» NO ES «NO HUBO VENTAS»
//
// 🩸 Si la consulta del período anterior FALLABA, `prevVenta` quedaba vacío,
// cada renglón salía "Nuevo" en verde y NO salía ningún aviso: el cartel ámbar
// solo miraba el caso "vino vacía". O sea que un tropiezo de red mostraba el
// catálogo entero como si fuera todo estreno, y se leía como un dato.
// ─────────────────────────────────────────────────────────────────────────────

describe("6 · la pantalla distingue «falló» de «no había nada»", () => {
  it("si el comparativo VINO VACÍO, el aviso es ámbar y los renglones dicen «Nuevo»", async () => {
    productosPrevios = [];
    render(<ProductosView selectedYear={2026} />);
    await pintada();
    await waitFor(() => expect(document.querySelector("[data-sin-comparativo]")).toBeTruthy());
    expect(document.querySelector("[data-comparativo-fallo]")).toBeNull();
    expect(celda("CAMISA POLO", "delta")).toBe("Nuevo");
  });

  it("🔴 si el comparativo FALLÓ, la pantalla lo DICE y no hay ni un «Nuevo»", async () => {
    fallarComparativo = true;
    render(<ProductosView selectedYear={2026} />);
    await pintada();
    await waitFor(() => expect(document.querySelector("[data-comparativo-fallo]")).toBeTruthy());
    const aviso = document.querySelector("[data-comparativo-fallo]")!;
    expect(aviso.textContent).toContain("No se pudo cargar");
    // El aviso del OTRO caso no aparece: son dos cosas distintas.
    expect(document.querySelector("[data-sin-comparativo]")).toBeNull();
    for (const d of ["CAMISA POLO", "SANDALIA", "DEVUELTO"]) {
      expect(celda(d, "delta"), `${d} sigue diciendo "Nuevo" con la consulta caída`).toBe("—");
    }
    expect(document.body.textContent).not.toContain("Nuevo");
  });

  it("el aviso del fallo ofrece reintentar — es lo único accionable", async () => {
    fallarComparativo = true;
    render(<ProductosView selectedYear={2026} />);
    await pintada();
    await waitFor(() => expect(document.querySelector("[data-comparativo-fallo]")).toBeTruthy());
    const boton = within(document.querySelector("[data-comparativo-fallo]") as HTMLElement)
      .getByRole("button", { name: /Reintentar/ });
    fallarComparativo = false;
    urlsPedidas = [];
    fireEvent.click(boton);
    await waitFor(() => expect(document.querySelector("[data-comparativo-fallo]")).toBeNull());
    expect(celda("CAMISA POLO", "delta")).not.toBe("—");
  });

  it("⚠️ los números de la tabla NO cambian por que el comparativo falle", async () => {
    fallarComparativo = true;
    render(<ProductosView selectedYear={2026} />);
    await pintada();
    expect(celda("CAMISA POLO", "venta")).toBe("$9,000.00");
    expect(celda("SANDALIA", "precio")).toBe("$50.00");
    expect(document.querySelector("[data-totales-productos]")!.textContent)
      .toContain("$14,300.00");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7 · EL AÑO DE ARRIBA NO MANDA SOBRE LOS PERÍODOS RELATIVOS — y la pantalla
//     lo dice. Había DOS controles de tiempo y ninguno aclaraba cuál gana:
//     "Últimos 12 meses" se cuenta desde HOY y el servidor ni mira el año.
// ─────────────────────────────────────────────────────────────────────────────

describe("7 · la pantalla avisa cuando el año de arriba no aplica", () => {
  it("con un período relativo lo DICE, con el año a la vista", async () => {
    render(<ProductosView selectedYear={2026} />);
    await pintada();
    expect(document.querySelector("[data-anio-no-aplica]")).toBeNull();

    await elegirEnSelector("Año en curso", "Últimos 12 meses");
    await waitFor(() => expect(document.querySelector("[data-anio-no-aplica]")).toBeTruthy());
    const aviso = document.querySelector("[data-anio-no-aplica]")!;
    expect(aviso.textContent).toContain("2026");
    expect(aviso.textContent).toContain("Últimos 12 meses");
    expect(aviso.textContent).toContain("se cuenta desde hoy");
  });

  it("con «Año en curso» el aviso NO está: ahí el año sí manda", async () => {
    // (Antes esto volvía por un mes suelto; los meses ya no están en el
    // selector, así que se vuelve por «Año en curso», que es el otro período
    // donde el año de arriba SÍ manda.)
    render(<ProductosView selectedYear={2026} />);
    await pintada();
    await elegirEnSelector("Año en curso", "Últimos 6 meses");
    await waitFor(() => expect(document.querySelector("[data-anio-no-aplica]")).toBeTruthy());
    await elegirEnSelector("Últimos 6 meses", "Año en curso");
    await waitFor(() => expect(document.querySelector("[data-anio-no-aplica]")).toBeNull());
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8 · QUIÉN LO COMPRA — conducta, no texto
//
// 🩸 ESTE BLOQUE EXISTE PORQUE DOS MUTACIONES SOBREVIVIERON: borrar el bloque
// de clientes del desplegable, y hacer que la lista vacía AFIRME "no lo compra
// nadie". Ninguna prueba de función pura ni de ruta puede verlas — hay que
// desplegar la fila y leer lo que quedó dibujado.
// ─────────────────────────────────────────────────────────────────────────────

describe("8 · el desplegable dice QUIÉN lo compra", () => {
  async function desplegar() {
    render(<ProductosView selectedYear={2026} />);
    await pintada();
    fireEvent.click(document.querySelector('tr[data-fila-producto="CAMISA POLO"]')!);
    return waitFor(() => {
      const t = document.querySelector("[data-drill-clientes]");
      expect(t, "no se dibujó la lista de clientes").toBeTruthy();
      return t as HTMLElement;
    });
  }

  it("abre en «Quién lo compra» y lista los clientes, del que más compra al que menos", async () => {
    const tabla = await desplegar();
    const filas = [...tabla.querySelectorAll("tr")].map(tr => (tr.textContent ?? "").replace(/\s+/g, " ").trim());
    expect(filas[0]).toContain("City Mall Paso Canoa");
    expect(filas[1]).toContain("Golden Mall");
    // El % se mide contra la SUMA DE LA LISTA: 6750/9000 = 75%.
    expect(filas[0]).toContain("75.0%");
    expect(filas[1]).toContain("25.0%");
  });

  it("y el pie dice cuántas piezas y cuánta venta son", async () => {
    await desplegar();
    const pie = document.querySelector("[data-pie-clientes]")!.textContent ?? "";
    expect(pie).toContain("2");
    expect(pie).toContain("1,000");        // 750 + 250 piezas
    expect(pie).toContain("$9,000.00");    // 6750 + 2250
  });

  it("🔴 sin detalle NO afirma que no lo compra nadie", async () => {
    clientesDelDrill = [];
    render(<ProductosView selectedYear={2026} />);
    await pintada();
    fireEvent.click(document.querySelector('tr[data-fila-producto="CAMISA POLO"]')!);
    const texto = await waitFor(() => {
      const t = document.body.textContent ?? "";
      expect(t).toContain("Todavía no tenemos el detalle");
      return t;
    });
    // Fashion Wear está terminando de bajar su detalle: decir "no lo compra
    // nadie" sería una respuesta falsa dicha con toda seguridad.
    expect(texto).not.toContain("No lo compra nadie");
    expect(texto).not.toMatch(/no lo compra nadie/i);
  });

  it("si la lectura FALLÓ lo dice distinto de «no hay»", async () => {
    clientesDelDrill = null;
    render(<ProductosView selectedYear={2026} />);
    await pintada();
    fireEvent.click(document.querySelector('tr[data-fila-producto="CAMISA POLO"]')!);
    await waitFor(() => {
      expect(document.body.textContent).toContain("No se pudo cargar quién lo compra");
    });
    expect(document.body.textContent).not.toContain("Todavía no tenemos el detalle");
  });

  it("los códigos NO se perdieron: están en su pestaña, a un toque", async () => {
    await desplegar();
    expect(document.querySelector("[data-drill-codigos]")).toBeNull();
    fireEvent.click(enTabla().getByRole("tab", { name: /Códigos/ }));
    await waitFor(() => expect(document.querySelector("[data-drill-codigos]")).toBeTruthy());
    // Y la lista de clientes deja de estar: son dos pestañas, no dos bloques.
    expect(document.querySelector("[data-drill-clientes]")).toBeNull();
  });

  it("una descripción de UN SOLO código también se despliega", async () => {
    // 🩸 Antes `num_codigos <= 1` cortaba el despliegue. En Joystep y Active
    // Wear las descripciones que más venden son justo de un código.
    render(<ProductosView selectedYear={2026} />);
    await pintada();
    fireEvent.click(document.querySelector('tr[data-fila-producto="DEVUELTO"]')!);
    await waitFor(() => expect(document.querySelector("[data-drill-clientes]")).toBeTruthy());
  });

  it("cambiar de pestaña NO cierra el desplegable", async () => {
    await desplegar();
    fireEvent.click(enTabla().getByRole("tab", { name: /Códigos/ }));
    await waitFor(() => expect(document.querySelector("[data-drill-codigos]")).toBeTruthy());
    // Si el clic se propagara a la fila, el toggle la cerraría al instante.
    expect(enTabla().queryByRole("tab", { name: /Quién lo compra/ })).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 9 · EL AVISO DE «CÓDIGO MAL CLASIFICADO» YA NO SALE
//
// ⚠️ ESTE CANDADO CAMBIÓ DE DIRECCIÓN, y queda escrito por qué. Hasta el #597
// exigía lo contrario: que la fila dijera «Revisar: A-1 también está en
// «CAMISETA»» cuando un código vivía bajo dos categorías reales del catálogo
// aprobado. Salía en 18 renglones de 2.074.
//
// 🔴 Daniel mandó sacarlo el 25-ago-2026. El aviso nació para que él revisara
// esos 5 códigos en Switch; YA LOS REVISÓ y decidió, textual: *"si lo más
// reciente es 17-ago alguien lo pasó a Flip Flop, entonces es Flip Flop"*. La
// clasificación que Switch tiene HOY es la correcta: no queda nada que
// corregir, y el cartel pedía una acción ya tomada.
//
// 🩸 EL CANDADO SE INVIERTE, NO SE BORRA. Borrarlo dejaría el hueco abierto: el
// próximo que toque esta pantalla podría redibujarlo sin que nada se ponga
// rojo. Acá se exige que NO salga NI SIQUIERA CUANDO EL SERVIDOR LO MANDA —
// que es más fuerte que mirar la respuesta pelada, porque caza el redibujo.
//
// ⛔ LO QUE NO SE TOCÓ, y tiene su propio candado abajo: la AGRUPACIÓN por el
// nombre más reciente (el producto sigue en UN renglón) y todos los números.
// ─────────────────────────────────────────────────────────────────────────────

describe("9 · el aviso de código mal clasificado ya no existe", () => {
  async function pantalla() {
    render(<ProductosView selectedYear={2026} />);
    await pintada();
  }

  it("🔴 sin aviso en la respuesta no se dibuja nada", async () => {
    avisoDeLaFila = [];
    await pantalla();
    expect(document.querySelector("[data-aviso-clasificacion]")).toBeNull();
  });

  it("🔴 Y AUNQUE EL SERVIDOR LO MANDE, la pantalla NO lo dibuja", async () => {
    avisoDeLaFila = [{ otra: "CAMISETA", codigo: "A-1" }];
    await pantalla();
    expect(document.querySelector("[data-aviso-clasificacion]")).toBeNull();
    // Ni por el ancla ni por el texto: el rótulo tampoco puede volver con otro
    // atributo. La celda de la descripción es el nombre y nada más.
    const fila = document.querySelector('tr[data-fila-producto="CAMISA POLO"]')!;
    const texto = (fila.querySelector('[data-col="descripcion"]')!.textContent ?? "").replace(/\s+/g, " ").trim();
    expect(texto).toBe("CAMISA POLO");
    expect(document.body.textContent).not.toContain("también está en");
  });

  it("no queda ni un rastro ámbar en ninguna fila", async () => {
    avisoDeLaFila = [{ otra: "CAMISETA", codigo: "A-1" }];
    await pantalla();
    for (const fila of document.querySelectorAll("tr[data-fila-producto]")) {
      expect(fila.querySelector('[class*="amber"]')).toBeNull();
    }
  });

  // 🩸 SE MIRA EL HTML DE LA FILA, ATRIBUTOS INCLUIDOS, y no sólo el texto.
  // La reposición más silenciosa del aviso no es un <p>: es un `title` en la
  // celda — el globito al pasar el mouse. Eso no toca `textContent` y un
  // candado que sólo lea el texto lo dejaría pasar entero.
  it("🔴 ni escondido en un `title`, un `aria-label` o cualquier atributo", async () => {
    avisoDeLaFila = [{ otra: "CAMISETA", codigo: "A-1" }];
    await pantalla();
    for (const fila of document.querySelectorAll("tr[data-fila-producto]")) {
      const html = fila.outerHTML.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
      expect(html).not.toContain("tambien esta en");
      expect(html).not.toContain("revisar:");
      expect(html).not.toContain("amber");
      expect(html).not.toContain("aviso");
    }
  });

  it("⚠️ sacarlo NO TOCÓ UN SOLO NÚMERO de la fila", async () => {
    avisoDeLaFila = [];
    await pantalla();
    const sinAviso = {
      venta: celda("CAMISA POLO", "venta"),
      cantidad: celda("CAMISA POLO", "cantidad"),
      margen: celda("CAMISA POLO", "margen"),
      precio: celda("CAMISA POLO", "precio"),
      total: document.querySelector("[data-totales-productos]")!.textContent,
    };
    cleanup();
    avisoDeLaFila = [{ otra: "CAMISETA", codigo: "A-1" }];
    await pantalla();
    expect({
      venta: celda("CAMISA POLO", "venta"),
      cantidad: celda("CAMISA POLO", "cantidad"),
      margen: celda("CAMISA POLO", "margen"),
      precio: celda("CAMISA POLO", "precio"),
      total: document.querySelector("[data-totales-productos]")!.textContent,
    }).toEqual(sinAviso);
  });

  it("⚠️ y el desplegable «Quién lo compra» abre igual que siempre", async () => {
    avisoDeLaFila = [{ otra: "CAMISETA", codigo: "A-1" }];
    await pantalla();
    fireEvent.click(document.querySelector('tr[data-fila-producto="CAMISA POLO"]')!);
    await waitFor(() => expect(document.querySelector("[data-drill-clientes]")).toBeTruthy());
    const tabla = document.querySelector("[data-drill-clientes]")!;
    expect([...tabla.querySelectorAll("tr")]).toHaveLength(2);
    expect(tabla.textContent).toContain("City Mall Paso Canoa");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 10 · LAS TARJETAS DE CELULAR — los cuatro números que la tabla no mostraba.
//
// 🩸 QUÉ VINO A ARREGLAR. A 390 px la tabla dibujaba Descripción · Venta ·
// Margen %: `Cant` y `Precio prom.` viven bajo `sm` porque una columna más
// agrega arrastre en iPhone (medido). Daniel, textual: *"solo veo sort venta y
// margen. Quiero ver cantidad también y precio de venta promedio."*
//
// 🔴 LO QUE ESTE BLOQUE EXISTE PARA CAZAR:
//   · que la tarjeta pierda las PIEZAS o el PRECIO PROM. (o sea, que el cambio
//     no haya servido para nada);
//   · que la tarjeta diga un número DISTINTO del de la tabla — el peor final:
//     dos pantallas del mismo dato que no coinciden;
//   · que el ORDEN desaparezca en celular (sin encabezado no hay dónde tocar) o
//     que quede con menos de los cuatro criterios;
//   · que el desplegable deje de abrirse desde la tarjeta;
//   · que las tarjetas se dibujen en ESCRITORIO, o la tabla en celular.
// ─────────────────────────────────────────────────────────────────────────────

/** El texto de un dato de la tarjeta, por el mismo `col` que usa la tabla. */
function tarjeta(descripcion: string, col: string): string {
  const li = document.querySelector(`li[data-tarjeta-producto="${descripcion}"]`);
  expect(li, `no está la tarjeta de ${descripcion}`).toBeTruthy();
  return (li!.querySelector(`[data-tarjeta-col="${col}"]`)?.textContent ?? "").trim();
}

describe("10 · las tarjetas de celular", () => {
  it("🔴 la tarjeta trae los CUATRO números, PIEZAS y PRECIO PROM. incluidos", async () => {
    render(<ProductosView selectedYear={2026} />);
    await pintada();
    expect(tarjeta("CAMISA POLO", "cantidad")).toBe("1,000");
    expect(tarjeta("CAMISA POLO", "venta")).toBe("$9,000.00");
    expect(tarjeta("CAMISA POLO", "precio")).toBe("$9.00");
    expect(tarjeta("CAMISA POLO", "margen")).toBe("40.0%");
  });

  it("🔴 y dice EXACTAMENTE lo mismo que la tabla, celda por celda", async () => {
    render(<ProductosView selectedYear={2026} />);
    await pintada();
    // Las tres filas x los cuatro números. Si la tarjeta tuviera su propio
    // formateador o su propio redondeo, esto cae.
    for (const d of ["CAMISA POLO", "SANDALIA", "DEVUELTO"]) {
      for (const col of ["cantidad", "venta", "precio", "margen"]) {
        expect(tarjeta(d, col), `${d}/${col}`).toBe(celda(d, col));
      }
    }
  });

  it("hay una tarjeta por fila, con las mismas descripciones y en el mismo orden", async () => {
    render(<ProductosView selectedYear={2026} />);
    await pintada();
    const enTarjetasOrden = [...document.querySelectorAll("li[data-tarjeta-producto]")]
      .map(li => li.getAttribute("data-tarjeta-producto"));
    expect(enTarjetasOrden).toEqual(ordenEnPantalla());
  });

  it("🔴 los CUATRO criterios de orden están disponibles en celular", async () => {
    render(<ProductosView selectedYear={2026} />);
    await pintada();
    const chips = [...document.querySelectorAll("[data-orden-chip]")]
      .map(b => b.getAttribute("data-orden-chip"));
    expect(chips).toEqual(["cantidad", "venta", "precio", "margen"]);
  });

  it("🔴 tocar un chip REORDENA de verdad, y el segundo toque invierte", async () => {
    render(<ProductosView selectedYear={2026} />);
    await pintada();
    expect(ordenEnPantalla()).toEqual(["CAMISA POLO", "SANDALIA", "DEVUELTO"]);
    const precio = document.querySelector('[data-orden-chip="precio"]')!;
    fireEvent.click(precio);
    await waitFor(() => expect(ordenEnPantalla()).toEqual(["SANDALIA", "CAMISA POLO", "DEVUELTO"]));
    fireEvent.click(precio);
    await waitFor(() => expect(ordenEnPantalla()).toEqual(["DEVUELTO", "CAMISA POLO", "SANDALIA"]));
  });

  it("el chip activo dice para qué lado va, y es UNO solo", async () => {
    render(<ProductosView selectedYear={2026} />);
    await pintada();
    // Arranca en Venta ▼, igual que la tabla: un segundo estado de orden en
    // celular sería un segundo criterio esperando divergir del primero.
    const activos = () => [...document.querySelectorAll('[data-orden-chip][aria-pressed="true"]')];
    expect(activos()).toHaveLength(1);
    expect(activos()[0].getAttribute("data-orden-chip")).toBe("venta");
    expect(activos()[0].textContent).toContain("▼");
    fireEvent.click(document.querySelector('[data-orden-chip="cantidad"]')!);
    await waitFor(() => expect(activos()[0].getAttribute("data-orden-chip")).toBe("cantidad"));
    expect(activos()).toHaveLength(1);
  });

  it("⚠️ el orden es UNO SOLO: tocar el chip mueve también el encabezado de la tabla", async () => {
    render(<ProductosView selectedYear={2026} />);
    await pintada();
    fireEvent.click(document.querySelector('[data-orden-chip="cantidad"]')!);
    await waitFor(() =>
      expect(enTabla().getByRole("button", { name: /^Cant/ }).textContent).toContain("▼"));
    // Y al revés: tocar el encabezado mueve el chip.
    fireEvent.click(enTabla().getByRole("button", { name: /Precio prom\./ }));
    await waitFor(() =>
      expect(document.querySelector('[data-orden-chip="precio"]')!.getAttribute("aria-pressed")).toBe("true"));
  });

  it("🔴 el desplegable abre DESDE LA TARJETA, con «Quién lo compra» y «Códigos»", async () => {
    render(<ProductosView selectedYear={2026} />);
    await pintada();
    const li = document.querySelector('li[data-tarjeta-producto="CAMISA POLO"]') as HTMLElement;
    fireEvent.click(li.querySelector("button")!);
    await waitFor(() => expect(within(li).queryByRole("tab", { name: /Quién lo compra/ })).toBeTruthy());
    expect(within(li).queryByRole("tab", { name: /Códigos/ })).toBeTruthy();
    await waitFor(() => expect(li.querySelector("[data-drill-clientes]")).toBeTruthy());
    expect(li.textContent).toContain("City Mall Paso Canoa");
    // Y los códigos siguen a un toque, dentro de la MISMA tarjeta.
    fireEvent.click(within(li).getByRole("tab", { name: /Códigos/ }));
    await waitFor(() => expect(li.querySelector("[data-drill-codigos]")).toBeTruthy());
  });

  it("🩸 el layout se marca con `data-vista` FIJO, no con la clase del corte", async () => {
    render(<ProductosView selectedYear={2026} />);
    await pintada();
    // Si esto se buscara por `.sm\\:hidden`, mover el corte devolvería null y
    // cualquier medidor compararía CERO celdas pasando en verde.
    const tabla = document.querySelector('[data-vista="tabla"]')!;
    const tarjetas = document.querySelector('[data-vista="tarjetas"]')!;
    expect(tabla, "falta data-vista=tabla").toBeTruthy();
    expect(tarjetas, "falta data-vista=tarjetas").toBeTruthy();
    // La TABLA va primera en el DOM: los candados de siempre preguntan con
    // `document.querySelector` y tienen que seguir cayendo sobre ella.
    expect(tabla.compareDocumentPosition(tarjetas) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Y cada uno se esconde en el ancho del otro: la tabla desde `sm`, las
    // tarjetas debajo. Es lo único que se puede afirmar sin CSS en jsdom.
    expect(tabla.className).toContain("hidden");
    expect(tabla.className).toContain("sm:block");
    expect(tarjetas.closest("div")!.className).toContain("sm:hidden");
  });
});

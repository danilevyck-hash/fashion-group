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
//   3. Cambiar el período (que desde el 11-sep-2026 LLEGA POR PROP desde el
//      selector único de Ventas) cambia LO QUE SE PIDE, y pide su comparativo
//      `previo=1`.
//   4. Si la ventana de comparación vino VACÍA, la pantalla lo DICE.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor, within } from "@testing-library/react";
import { ProductosView } from "@/components/ventas/ProductosView";
import type { ProductosResponse } from "@/lib/ventas/productos";

// 🔴 EL PERÍODO LLEGA POR PROP (11-sep-2026). Esta pantalla ya no tiene su
// desplegable «Período»: lo manda el selector ÚNICO de arriba de Ventas y
// `ProductosView` recibe `{ periodo, anioEnCurso }` (`lib/ventas/periodo.ts`).
const ANIO_2026 = { tipo: "anio", anio: 2026 } as const;
const ULTIMOS_12 = { tipo: "ultimos", n: 12 } as const;
const ULTIMOS_6 = { tipo: "ultimos", n: 6 } as const;
const ANIO_2025 = { tipo: "anio", anio: 2025 } as const;
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
    render(<ProductosView periodo={ANIO_2026} anioEnCurso={2026} />);
    await pintada();
    expect(celda("CAMISA POLO", "precio")).toBe("$9.00");
    expect(celda("SANDALIA", "precio")).toBe("$50.00");
  });

  it("un grupo sin unidades netas muestra '—', NO $0.00", async () => {
    // Un "$0.00" se lee como "lo regalé". La devolución neta no tiene precio.
    render(<ProductosView periodo={ANIO_2026} anioEnCurso={2026} />);
    await pintada();
    expect(celda("DEVUELTO", "precio")).toBe("—");
  });

  it("las columnas que ya estaban siguen diciendo lo mismo", async () => {
    render(<ProductosView periodo={ANIO_2026} anioEnCurso={2026} />);
    await pintada();
    expect(celda("CAMISA POLO", "cantidad")).toBe("1,000");
    expect(celda("CAMISA POLO", "venta")).toBe("$9,000.00");
    // 🔁 Sin decimal desde el 5-sep-2026 (diccionario § 0, #5). El VALOR no se
    // movió: 0,4 sigue siendo 0,4.
    expect(celda("CAMISA POLO", "margen")).toBe("40%");
    expect(celda("CAMISA POLO", "codigos")).toBe("3");
  });

  it("el desplegable de códigos también trae el precio de cada código", async () => {
    // 🔑 El desplegable abre en «Quién lo compra» desde el 25-ago-2026 (es lo
    // que pidió Daniel). Los códigos NO se perdieron: están a un toque, en su
    // pestaña — y esta prueba lo comprueba tocándola.
    render(<ProductosView periodo={ANIO_2026} anioEnCurso={2026} />);
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
    render(<ProductosView periodo={ANIO_2026} anioEnCurso={2026} />);
    await pintada();
    // Default = venta desc: la camisa ($9.000) va antes que la sandalia ($5.000).
    expect(ordenEnPantalla()).toEqual(["CAMISA POLO", "SANDALIA", "DEVUELTO"]);

    fireEvent.click(enTabla().getByRole("button", { name: /Precio prom\./ }));
    // Por precio desc: sandalia $50 · camisa $9 · devuelto sin precio, al final.
    await waitFor(() => expect(ordenEnPantalla()).toEqual(["SANDALIA", "CAMISA POLO", "DEVUELTO"]));
  });

  it("un segundo toque invierte el orden (no lo deja quieto)", async () => {
    render(<ProductosView periodo={ANIO_2026} anioEnCurso={2026} />);
    await pintada();
    const th = enTabla().getByRole("button", { name: /Precio prom\./ });
    fireEvent.click(th);
    await waitFor(() => expect(ordenEnPantalla()[0]).toBe("SANDALIA"));
    fireEvent.click(th);
    await waitFor(() => expect(ordenEnPantalla()).toEqual(["DEVUELTO", "CAMISA POLO", "SANDALIA"]));
  });

  it("las otras tres columnas siguen ordenando como siempre", async () => {
    render(<ProductosView periodo={ANIO_2026} anioEnCurso={2026} />);
    await pintada();
    fireEvent.click(enTabla().getByRole("button", { name: /^Cant/ }));
    await waitFor(() => expect(ordenEnPantalla()).toEqual(["CAMISA POLO", "SANDALIA", "DEVUELTO"]));
    fireEvent.click(enTabla().getByRole("button", { name: /^Venta/ }));
    await waitFor(() => expect(ordenEnPantalla()).toEqual(["CAMISA POLO", "SANDALIA", "DEVUELTO"]));
    fireEvent.click(enTabla().getByRole("button", { name: /Margen/ }));
    await waitFor(() => expect(ordenEnPantalla()[0]).toBe("DEVUELTO")); // margen 66,7%
  });
});

describe("3 · el período cambia LO QUE SE PIDE", () => {
  // ⛔ ACÁ VIVÍAN «ofrece los cuatro períodos de Daniel, con esos nombres» y
  // «los 12 meses sueltos NO vuelven al desplegable». Los DOS cambiaron de
  // dirección el 11-sep-2026: el desplegable «Período» de esta pantalla SE
  // RETIRÓ (Daniel, con el mockup: *«un solo selector arriba… que manda en las
  // tres pestañas»*). El período llega por prop desde `VentasShell` y esta
  // pantalla no dibuja ningún selector de tiempo. Lo que SÍ sigue vivo —y se
  // prueba abajo— es que cada período pide su ventana y su `previo=1`, y que
  // nada manda `mes=`. El CONTROL de que no volvió el desplegable está en
  // `ventas-productos-selector-unico.test.tsx`.
  it("arranca en el año en curso y pide su comparativo", async () => {
    render(<ProductosView periodo={ANIO_2026} anioEnCurso={2026} />);
    await pintada();
    expect(urlsPedidas.some(u => u.includes("periodo=ytd") && u.includes("year=2026") && !u.includes("previo"))).toBe(true);
    expect(urlsPedidas.some(u => u.includes("periodo=ytd") && u.includes("previo=1"))).toBe(true);
  });

  it("⛔ la pantalla NO dibuja ningún selector de período propio", async () => {
    render(<ProductosView periodo={ANIO_2026} anioEnCurso={2026} />);
    await pintada();
    expect(document.querySelector("[data-selector-periodo]")).toBeNull();
    expect(screen.queryByText("Año en curso")).toBeNull();
    expect(screen.queryByText("Año pasado")).toBeNull();
    expect(screen.queryByText(">Período<")).toBeNull();
  });

  it("«Últimos 12 meses» por prop pide periodo=12m y su previo=1", async () => {
    const { rerender } = render(<ProductosView periodo={ANIO_2026} anioEnCurso={2026} />);
    await pintada();
    urlsPedidas = [];
    rerender(<ProductosView periodo={ULTIMOS_12} anioEnCurso={2026} />);
    await waitFor(() => {
      expect(urlsPedidas.some(u => u.includes("periodo=12m") && !u.includes("previo"))).toBe(true);
      expect(urlsPedidas.some(u => u.includes("periodo=12m") && u.includes("previo=1"))).toBe(true);
    });
    // Y NO manda un mes suelto pegado que contradiga la ventana relativa.
    expect(urlsPedidas.every(u => !u.includes("mes="))).toBe(true);
  });

  it("«Año 2025» por prop pide periodo=ytd con year=2025, sin mes", async () => {
    // 🔴 «Año pasado» ya no existe como opción: un año cerrado llega como
    // `{ tipo: "anio", anio: 2025 }` y se pide `ytd` de ESE año — que es
    // exactamente el rango que `anio_pasado` calculaba (1-ene a 31-dic).
    const { rerender } = render(<ProductosView periodo={ANIO_2026} anioEnCurso={2026} />);
    await pintada();
    urlsPedidas = [];
    rerender(<ProductosView periodo={ANIO_2025} anioEnCurso={2026} />);
    await waitFor(() => expect(urlsPedidas.some(u => u.includes("periodo=ytd") && u.includes("year=2025"))).toBe(true));
    expect(urlsPedidas.every(u => !u.includes("mes=") && !u.includes("anio_pasado"))).toBe(true);
  });

  it("⛔ la pantalla ya no manda `mes=` en ninguna de sus peticiones", async () => {
    // El servidor SIGUE aceptando `?mes=6` (un marcador viejo tiene que seguir
    // contestando lo mismo — hay candado en la ruta). Lo que se retiró es que
    // la PANTALLA lo pida.
    const { rerender } = render(<ProductosView periodo={ANIO_2026} anioEnCurso={2026} />);
    await pintada();
    for (const periodo of [ULTIMOS_6, ULTIMOS_12, ANIO_2025]) {
      urlsPedidas = [];
      rerender(<ProductosView periodo={periodo} anioEnCurso={2026} />);
      await waitFor(() => expect(urlsPedidas.length).toBeGreaterThan(0));
      expect(urlsPedidas.every(u => !u.includes("mes="))).toBe(true);
    }
  });

  // La "Δ" se fue del rótulo: es notación de matemática en una tabla que mira
  // gente que no la conoce. Lo que NO cambió es que el año deje de mentir.
  it("el rótulo de la columna de cambio deja de mentir un año cuando la ventana es relativa", async () => {
    const { rerender } = render(<ProductosView periodo={ANIO_2026} anioEnCurso={2026} />);
    await pintada();
    expect(screen.getByText("vs 2025")).toBeTruthy();
    rerender(<ProductosView periodo={ULTIMOS_6} anioEnCurso={2026} />);
    await waitFor(() => expect(screen.getByText("vs año ant.")).toBeTruthy());
    expect(screen.queryByText(/^Δ/)).toBeNull();
  });

  it("las DOS fechas del período están en pantalla (un rótulo relativo solo, no)", async () => {
    render(<ProductosView periodo={ANIO_2026} anioEnCurso={2026} />);
    await pintada();
    const resumen = document.querySelector("[data-resumen-productos]")!;
    expect(resumen.textContent).toContain("Del 1 ene 2026 al 24 ago 2026");
    expect(resumen.textContent).toContain("comparado con 1 ene 2025 – 31 dic 2025");
  });

  it("el total de piezas y el precio promedio del período están arriba", async () => {
    render(<ProductosView periodo={ANIO_2026} anioEnCurso={2026} />);
    await pintada();
    const resumen = document.querySelector("[data-resumen-productos]")!;
    expect(resumen.textContent).toContain("1,100 piezas");    // 1000 + 100 + 0
    expect(resumen.textContent).toContain("$13.00");           // 14.300 / 1.100
  });

  it("el renglón de Venta/Margen de siempre quedó intacto", async () => {
    render(<ProductosView periodo={ANIO_2026} anioEnCurso={2026} />);
    await pintada();
    const p = document.querySelector("[data-totales-productos]")!;
    expect(p.textContent)// 🔁 Sin decimal desde el 5-sep-2026 (40,6% → 41%, redondeado).
      .toBe("Venta $14,300.00·Margen 41%");
  });
});

describe("3b · el desplegable de códigos hereda el período elegido", () => {
  it("con «Últimos 12 meses», los códigos se piden con periodo=12m", async () => {
    // Sin esto los códigos de adentro suman OTRA ventana que la fila de arriba:
    // el desplegable no cuadra con su propio total y nadie sabe cuál miente.
    const { rerender } = render(<ProductosView periodo={ANIO_2026} anioEnCurso={2026} />);
    await pintada();
    rerender(<ProductosView periodo={ULTIMOS_12} anioEnCurso={2026} />);
    await waitFor(() => expect(urlsPedidas.some(u => u.includes("periodo=12m"))).toBe(true));
    await pintada();
    urlsPedidas = [];
    fireEvent.click(document.querySelector('tr[data-fila-producto="CAMISA POLO"]')!);
    await waitFor(() => {
      const drill = urlsPedidas.filter(u => u.includes("/codigos"));
      expect(drill.length).toBeGreaterThan(0);
      expect(drill.every(u => u.includes("periodo=12m"))).toBe(true);
    });
  });

  it("con «Año 2025», los códigos se piden con ese año y sin mes", async () => {
    const { rerender } = render(<ProductosView periodo={ANIO_2026} anioEnCurso={2026} />);
    await pintada();
    rerender(<ProductosView periodo={ANIO_2025} anioEnCurso={2026} />);
    await waitFor(() => expect(urlsPedidas.some(u => u.includes("year=2025"))).toBe(true));
    await pintada();
    urlsPedidas = [];
    fireEvent.click(document.querySelector('tr[data-fila-producto="CAMISA POLO"]')!);
    await waitFor(() => {
      const drill = urlsPedidas.filter(u => u.includes("/codigos"));
      expect(drill.length).toBeGreaterThan(0);
      expect(drill.every(u => u.includes("periodo=ytd") && u.includes("year=2025") && !u.includes("mes="))).toBe(true);
    });
  });
});

describe("4 · un período sin comparativo lo DICE, no inventa un porcentaje", () => {
  it("con la ventana anterior vacía sale el aviso", async () => {
    productosPrevios = [];
    render(<ProductosView periodo={ANIO_2026} anioEnCurso={2026} />);
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
    render(<ProductosView periodo={ANIO_2026} anioEnCurso={2026} />);
    await pintada();
    await waitFor(() => expect(celda("CAMISA POLO", "delta")).toBe("+13%"));
    expect(document.querySelector("[data-sin-comparativo]")).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5 · EL PERÍODO ELEGIDO SE CONSERVA — cambiar empresa no lo borra
//
// 🩸 Estabas mirando "Últimos 12 meses", cambiabas de empresa y la pantalla
// volvía sola a "Año en curso" y te vaciaba el buscador, sin avisar. Era un
// `setPeriodo("ytd") + setSearch("")` puesto "por las dudas".
//
// 🔁 11-sep-2026: el período ya no es estado de esta pantalla —llega por prop
// desde el selector único de Ventas—, así que «cambiar de empresa no vuelve al
// año» se prueba pidiendo la ventana por prop y cambiando la empresa. Y el
// candado del `key={selectedYear}` de VentasShell cambió de forma: el shell
// monta `<ProductosView periodo={periodo} anioEnCurso={anioEnCurso} />` sin
// `key`, así que cambiar el período tampoco remonta la vista.
// ─────────────────────────────────────────────────────────────────────────────

describe("5 · el período elegido se conserva", () => {
  it("cambiar de EMPRESA no vuelve al año en curso", async () => {
    const { rerender } = render(<ProductosView periodo={ANIO_2026} anioEnCurso={2026} />);
    await pintada();
    rerender(<ProductosView periodo={ULTIMOS_12} anioEnCurso={2026} />);
    await waitFor(() => expect(urlsPedidas.some(u => u.includes("periodo=12m"))).toBe(true));

    urlsPedidas = [];
    await elegirEnSelector(/Vistana|Fashion Wear|Active/, "Active Shoes");
    await waitFor(() => expect(urlsPedidas.length).toBeGreaterThan(0));
    expect(urlsPedidas.every(u => u.includes("periodo=12m"))).toBe(true);
    expect(urlsPedidas.some(u => u.includes("periodo=ytd"))).toBe(false);
  });

  it("cambiar de EMPRESA no borra lo que estabas buscando", async () => {
    render(<ProductosView periodo={ANIO_2026} anioEnCurso={2026} />);
    await pintada();
    const buscador = screen.getByPlaceholderText(/Buscar descripción/);
    fireEvent.change(buscador, { target: { value: "SANDALIA" } });
    await waitFor(() => expect(ordenEnPantalla()).toEqual(["SANDALIA"]));

    await elegirEnSelector(/Vistana|Fashion Wear|Active/, "Active Shoes");
    await waitFor(() => expect(urlsPedidas.some(u => u.includes("empresa=active_shoes"))).toBe(true));
    expect((buscador as HTMLInputElement).value).toBe("SANDALIA");
  });

  it("cambiar el PERÍODO de arriba tampoco borra el buscador: la vista no se remonta", async () => {
    const { rerender } = render(<ProductosView periodo={ANIO_2026} anioEnCurso={2026} />);
    await pintada();
    const buscador = screen.getByPlaceholderText(/Buscar descripción/);
    fireEvent.change(buscador, { target: { value: "SANDALIA" } });
    await waitFor(() => expect(ordenEnPantalla()).toEqual(["SANDALIA"]));

    urlsPedidas = [];
    rerender(<ProductosView periodo={ULTIMOS_6} anioEnCurso={2026} />);
    await waitFor(() => expect(urlsPedidas.length).toBeGreaterThan(0));
    expect(urlsPedidas.every(u => u.includes("periodo=6m"))).toBe(true);
    expect((buscador as HTMLInputElement).value).toBe("SANDALIA");
  });

  it("🔴 VentasShell monta Productos con el período por prop y sin `key`", () => {
    const shell = readFileSync(
      path.join(process.cwd(), "src/app/ventas/VentasShell.tsx"), "utf8",
    )
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n").map(l => l.replace(/(^|[^:])\/\/.*$/, "$1")).join("\n");
    expect(shell).toContain("<ProductosView periodo={periodo} anioEnCurso={anioEnCurso} />");
    expect(shell).not.toMatch(/<ProductosView\s+key=/);
    expect(shell).not.toContain("<ProductosView selectedYear=");
  });

  // ⛔ ACÁ VIVÍA «el MES que no existe en la combinación nueva SÍ se suelta».
  // Ese candado cuidaba el guard que miraba `data.meses`, y el guard MURIÓ con
  // los meses sueltos (Daniel: *"solo dejame las 4 primeras, las otras
  // quítamelas que sobran, nunca te las pedí"*). Sin meses en el selector no
  // hay ninguna elección que pueda quedar inválida al cambiar de empresa, así
  // que no queda nada que cuidar.
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
    render(<ProductosView periodo={ANIO_2026} anioEnCurso={2026} />);
    await pintada();
    await waitFor(() => expect(document.querySelector("[data-sin-comparativo]")).toBeTruthy());
    expect(document.querySelector("[data-comparativo-fallo]")).toBeNull();
    expect(celda("CAMISA POLO", "delta")).toBe("Nuevo");
  });

  it("🔴 si el comparativo FALLÓ, la pantalla lo DICE y no hay ni un «Nuevo»", async () => {
    fallarComparativo = true;
    render(<ProductosView periodo={ANIO_2026} anioEnCurso={2026} />);
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
    render(<ProductosView periodo={ANIO_2026} anioEnCurso={2026} />);
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
    render(<ProductosView periodo={ANIO_2026} anioEnCurso={2026} />);
    await pintada();
    expect(celda("CAMISA POLO", "venta")).toBe("$9,000.00");
    expect(celda("SANDALIA", "precio")).toBe("$50.00");
    expect(document.querySelector("[data-totales-productos]")!.textContent)
      .toContain("$14,300.00");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7 · ⛔ EL AVISO «el año de arriba no se aplica» SE FUE (cambió de dirección
//     el 11-sep-2026). Existía porque había DOS controles de tiempo en la misma
//     pantalla (el año de la barra y el «Período» propio) y ninguno decía cuál
//     mandaba; encima mandaba a elegir «un mes» en un selector que no existía
//     desde el 24-ago-2026. Con UN solo selector no hay nada que aclarar: ahora
//     el candado exige que el aviso NO exista con ningún período.
// ─────────────────────────────────────────────────────────────────────────────

describe("7 · ⛔ el aviso «el año de arriba no se aplica» no existe con ningún período", () => {
  it("ni con el año, ni con una ventana, ni con un año cerrado", async () => {
    const { rerender } = render(<ProductosView periodo={ANIO_2026} anioEnCurso={2026} />);
    await pintada();
    expect(document.querySelector("[data-anio-no-aplica]")).toBeNull();

    for (const periodo of [ULTIMOS_12, ULTIMOS_6, ANIO_2025]) {
      urlsPedidas = [];
      rerender(<ProductosView periodo={periodo} anioEnCurso={2026} />);
      await waitFor(() => expect(urlsPedidas.length).toBeGreaterThan(0));
      await pintada();
      expect(document.querySelector("[data-anio-no-aplica]")).toBeNull();
      expect(document.body.textContent).not.toContain("no se aplica a este período");
      expect(document.body.textContent).not.toContain("se cuenta desde hoy");
    }
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
    render(<ProductosView periodo={ANIO_2026} anioEnCurso={2026} />);
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
    // 🔁 5-sep-2026: la tabla hija tiene AHORA SU PROPIA CABECERA, así que la
    // primera `<tr>` es el encabezado. Es el arreglo del defecto más grande de
    // este encargo: la última columna mostraba la PARTICIPACIÓN bajo el
    // encabezado «Margen %» heredado de la tabla de arriba (ver
    // `productos-columna-no-hereda-encabezado.test.tsx`).
    const encabezado = (tabla.querySelector("thead tr")?.textContent ?? "").replace(/\s+/g, " ").trim();
    expect(encabezado).toContain("% del total");
    expect(encabezado).not.toContain("Margen");

    // ⚠️ `:scope >` y no `"tbody tr"` a secas: esta tabla vive DENTRO de un
    // `<td>` de la tabla madre, así que su propia `<thead><tr>` también es
    // descendiente del `<tbody>` de arriba y un selector suelto la traería.
    const filas = [...tabla.querySelectorAll(":scope > tbody > tr")].map(tr => (tr.textContent ?? "").replace(/\s+/g, " ").trim());
    expect(filas[0]).toContain("City Mall Paso Canoa");
    expect(filas[1]).toContain("Golden Mall");
    // El % se mide contra la SUMA DE LA LISTA: 6750/9000 = 75%.
    // 🔁 Sin decimal desde el 5-sep-2026 (diccionario § 0, #5).
    expect(filas[0]).toContain("75%");
    expect(filas[1]).toContain("25%");
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
    render(<ProductosView periodo={ANIO_2026} anioEnCurso={2026} />);
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
    render(<ProductosView periodo={ANIO_2026} anioEnCurso={2026} />);
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
    render(<ProductosView periodo={ANIO_2026} anioEnCurso={2026} />);
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
    render(<ProductosView periodo={ANIO_2026} anioEnCurso={2026} />);
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
    // 🔁 Tres desde el 5-sep-2026: la cabecera PROPIA de la tabla hija + los
    // dos clientes. Ver el arreglo de la columna que heredaba el encabezado.
    expect([...tabla.querySelectorAll(":scope > tbody > tr")]).toHaveLength(2);
    expect([...tabla.querySelectorAll(":scope > thead > tr")]).toHaveLength(1);
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
    render(<ProductosView periodo={ANIO_2026} anioEnCurso={2026} />);
    await pintada();
    expect(tarjeta("CAMISA POLO", "cantidad")).toBe("1,000");
    expect(tarjeta("CAMISA POLO", "venta")).toBe("$9,000.00");
    expect(tarjeta("CAMISA POLO", "precio")).toBe("$9.00");
    // 🔁 Sin decimal desde el 5-sep-2026 (diccionario § 0, #5).
    expect(tarjeta("CAMISA POLO", "margen")).toBe("40%");
  });

  it("🔴 y dice EXACTAMENTE lo mismo que la tabla, celda por celda", async () => {
    render(<ProductosView periodo={ANIO_2026} anioEnCurso={2026} />);
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
    render(<ProductosView periodo={ANIO_2026} anioEnCurso={2026} />);
    await pintada();
    const enTarjetasOrden = [...document.querySelectorAll("li[data-tarjeta-producto]")]
      .map(li => li.getAttribute("data-tarjeta-producto"));
    expect(enTarjetasOrden).toEqual(ordenEnPantalla());
  });

  it("🔴 los CUATRO criterios de orden están disponibles en celular", async () => {
    render(<ProductosView periodo={ANIO_2026} anioEnCurso={2026} />);
    await pintada();
    const chips = [...document.querySelectorAll("[data-orden-chip]")]
      .map(b => b.getAttribute("data-orden-chip"));
    expect(chips).toEqual(["cantidad", "venta", "precio", "margen"]);
  });

  it("🔴 tocar un chip REORDENA de verdad, y el segundo toque invierte", async () => {
    render(<ProductosView periodo={ANIO_2026} anioEnCurso={2026} />);
    await pintada();
    expect(ordenEnPantalla()).toEqual(["CAMISA POLO", "SANDALIA", "DEVUELTO"]);
    const precio = document.querySelector('[data-orden-chip="precio"]')!;
    fireEvent.click(precio);
    await waitFor(() => expect(ordenEnPantalla()).toEqual(["SANDALIA", "CAMISA POLO", "DEVUELTO"]));
    fireEvent.click(precio);
    await waitFor(() => expect(ordenEnPantalla()).toEqual(["DEVUELTO", "CAMISA POLO", "SANDALIA"]));
  });

  it("el chip activo dice para qué lado va, y es UNO solo", async () => {
    render(<ProductosView periodo={ANIO_2026} anioEnCurso={2026} />);
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
    render(<ProductosView periodo={ANIO_2026} anioEnCurso={2026} />);
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
    render(<ProductosView periodo={ANIO_2026} anioEnCurso={2026} />);
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
    render(<ProductosView periodo={ANIO_2026} anioEnCurso={2026} />);
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

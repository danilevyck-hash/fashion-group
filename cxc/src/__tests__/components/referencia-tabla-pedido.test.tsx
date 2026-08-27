// ─────────────────────────────────────────────────────────────────────────────
// CANDADO del MODO PEDIDO de Ventas › Referencia (12-ago-2026).
//
// 🔴 EL RIESGO REAL NO ES LA MATEMÁTICA (eso lo cubren los tests de los módulos
// puros): es el DESPACHO. Que con varios códigos pegados salga la TABLA y no 50
// tarjetas; que las filas vayan EN EL ORDEN EN QUE SE PEGARON (Daniel las lee
// con su Excel al lado — un orden alfabético lo obliga a buscar fila por fila);
// que tocar una fila abra el detalle AHÍ MISMO sin perder el orden; y que el
// Excel baje esa misma lista ordenada. Nada de eso lo puede ver un test de
// función pura — acá se RENDERIZA la vista real y se toca.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

import { ReferenciaView } from "@/components/ventas/ReferenciaView";
import { ordenarComoPegado } from "@/lib/ventas/referencia";
import type { ArticuloCompras, ComprasApiResp } from "@/lib/ventas/compras";

vi.mock("next/navigation", () => ({
  usePathname: () => "/ventas",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/hooks/useSidebarCollapsed", () => ({
  useSidebarCollapsed: () => false,
  readSidebarCollapsed: () => false,
}));

// El Excel se espía: lo que importa es CON QUÉ LISTA se llama.
const exportSpy = vi.fn();
vi.mock("@/lib/ventas/referencia-excel", async (importOriginal) => {
  const real = (await importOriginal()) as Record<string, unknown>;
  return { ...real, exportComprasToExcel: (...args: unknown[]) => exportSpy(...args) };
});

function articulo(codigo: string, over: Partial<ArticuloCompras> = {}): ArticuloCompras {
  return {
    empresa: "vistana",
    codigo,
    descripcion: `DESC ${codigo}`,
    compras: [
      {
        empresa: "vistana",
        codigo,
        fecha: "2025-10-23",
        documento: `DOC-${codigo}`,
        proveedor: "PROV",
        articulo: codigo,
        unidades: 120,
        costos: { cif: 8.47, fob: 8.47, fobOrigen: "igual-al-cif", lista: 13.5 },
      },
    ],
    serie: [
      { mes: "2025-11", unidades: 12, venta: 162 },
      { mes: "2025-12", unidades: 24, venta: 324 },
      { mes: "2026-03", unidades: 36, venta: 486 },
      { mes: "2026-05", unidades: 24, venta: 324 },
    ],
    comprasFueraDeVentana: 0,
    cuadre: { comprado: 120, vendido: 96, existencia: 24, residuo: 0, ajusteConfiable: false },
    stockSinRespaldo: 0,
    vendidoAntes: 0,
    vendidoDeMas: 0,
    sinCompraRegistrada: false,
    existencia: 24,
    precioEtiqueta: 13.5,
    catalogoSyncedAt: null,
    ...over,
  };
}

/** La respuesta llega ORDENADA ALFABÉTICAMENTE (así la manda el route) — la
 *  vista es la que tiene que reordenarla como se pegó.
 *
 *  ZZZ999001 es el AGOTADO de la captura de Daniel (acá con 120 u): llegó en
 *  oct-2025 y su última venta fue dic-2025 → 3 meses (inclusive) — al corte
 *  2026-08 lleva 10 meses en bodega y la celda tiene que decir 3 igual, con el
 *  % REAL (100%), no un "90%" congelado (Daniel: *"como stock 0 y vendido
 *  90%?"*). */
const RESP: ComprasApiResp = {
  hoyMes: "2026-08",
  hoy: "2026-08-12",
  articulos: [
    articulo("AAA111001"),
    articulo("CVM253CR02001"),
    articulo("ZZZ999001", {
      existencia: 0,
      serie: [
        { mes: "2025-11", unidades: 60, venta: 810 },
        { mes: "2025-12", unidades: 60, venta: 810 },
      ],
      cuadre: { comprado: 120, vendido: 120, existencia: 0, residuo: 0, ajusteConfiable: false },
    }),
  ],
  noEncontrados: [],
  comprasDisponibles: true,
  infoDisponible: true,
};

// Pegado en un orden que NO es el alfabético: la Z primero.
const PEGADO = "ZZZ999001 AAA111001 CVM253CR02001";

async function buscarPegado(texto = PEGADO, resp = RESP) {
  render(<ReferenciaView />);
  fireEvent.change(screen.getByRole("textbox"), { target: { value: texto } });
  fireEvent.click(screen.getAllByRole("button", { name: /Buscar/ })[0]);
  await screen.findAllByText("CVM253CR02001");
}

beforeEach(() => {
  exportSpy.mockClear();
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => RESP }) as unknown as Response));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("modo pedido — la tabla", () => {
  it("🔴 varios códigos pegados → TABLA (una fila por color), no tarjetas apiladas", async () => {
    await buscarPegado();
    // Las columnas del mockup aprobado (12-ago-2026): VENDIDO · MESES en vez
    // de "90% en" — Daniel: "va el 29%" no decía cuánto tiempo llevaba.
    for (const col of ["Código", "Compré", "Vendí", "Stock", "Vendido", "Meses", "Margen", "Últ. compra"]) {
      expect(screen.getAllByText(col).length, `falta la columna "${col}"`).toBeGreaterThan(0);
    }
    expect(screen.queryByText("90% en")).toBeNull();
    // Sin detalle abierto, los grandes de la tarjeta no están montados ("en
    // bodega" es el pie del Stock grande y solo existe en el cuerpo).
    expect(screen.queryByText("en bodega")).toBeNull();
  });

  it("🔴 AGOTADO dice su % REAL y los meses hasta la ÚLTIMA VENTA, en negro; el VIVO dice su % actual y sus meses, en gris", async () => {
    await buscarPegado();
    const celdasDe = (codigo: string) => {
      const fila = screen.getAllByText(codigo)[0].closest("tr")!;
      const tds = [...fila.querySelectorAll("td")];
      return { vendido: tds[4], meses: tds[5] };
    };
    // ZZZ999001 se agotó: vendió TODO (100%, lo real — no un "90%" congelado)
    // y su última venta fue a los 3 meses de la llegada. Lleva 10 en bodega:
    // la celda dice 3 igual (la cola no cuenta) y va en NEGRO — dato cerrado.
    const term = celdasDe("ZZZ999001");
    expect(term.vendido.textContent).toBe("100%");
    expect(term.meses.textContent).toBe("3");
    expect(term.vendido.className).toContain("text-gray-900");
    expect(term.meses.className).toContain("text-gray-900");
    // AAA111001 sigue vivo: 96/120 = 80% a los 10 meses de la llegada, en GRIS.
    const vivo = celdasDe("AAA111001");
    expect(vivo.vendido.textContent).toBe("80%");
    expect(vivo.meses.textContent).toBe("10");
    expect(vivo.vendido.className).toContain("text-gray-500");
    expect(vivo.meses.className).toContain("text-gray-500");
  });

  it('🔴 lo que no se puede afirmar dice "—": sin compra con fecha → las dos celdas', async () => {
    const resp: ComprasApiResp = {
      ...RESP,
      articulos: [
        articulo("AAA111001"),
        articulo("RETENCION", {
          compras: [],
          sinCompraRegistrada: true,
          existencia: null,
          cuadre: { comprado: null, vendido: 40, existencia: null, residuo: null, ajusteConfiable: false },
        }),
      ],
    };
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => resp }) as unknown as Response));
    render(<ReferenciaView />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "RETENCION AAA111001" } });
    fireEvent.click(screen.getAllByRole("button", { name: /Buscar/ })[0]);
    await screen.findAllByText("RETENCION");
    const fila = screen.getAllByText("RETENCION")[0].closest("tr")!;
    const tds = [...fila.querySelectorAll("td")];
    expect(tds[4].textContent).toBe("—"); // Vendido
    expect(tds[5].textContent).toBe("—"); // Meses
  });

  it("🔴 las filas van EN EL ORDEN EN QUE SE PEGARON, no en el alfabético del route", async () => {
    await buscarPegado();
    const codigos = [...document.querySelectorAll("tbody td:first-child")].map(
      (td) => td.querySelector("span")?.textContent ?? "",
    );
    expect(codigos).toEqual(["ZZZ999001", "AAA111001", "CVM253CR02001"]);
  });

  it("🔴 tocar una fila abre el detalle AHÍ MISMO — el cuerpo REAL de la tarjeta — y el orden no se pierde", async () => {
    await buscarPegado();
    fireEvent.click(screen.getAllByText("AAA111001")[0].closest("tr")!);
    // El detalle es CuerpoArticulo: los cuatro grandes + la línea del ritmo + la plata.
    expect(screen.getAllByText("Compré").length).toBeGreaterThan(1); // th + dt
    expect(screen.getAllByText("en bodega").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Vendo 9.6 u por mes · En 10 meses va el 80%").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Precio prom").length).toBeGreaterThan(0);
    // Y las filas siguen todas, en el mismo orden.
    const codigos = [...document.querySelectorAll("tbody td:first-child")].map(
      (td) => td.querySelector("span")?.textContent ?? "",
    );
    expect(codigos).toEqual(["ZZZ999001", "AAA111001", "CVM253CR02001"]);
    // Tocar otra vez la cierra (acordeón).
    fireEvent.click(screen.getAllByText("AAA111001")[0].closest("tr")!);
    expect(screen.queryByText("en bodega")).toBeNull();
  });

  it("🔴 Stock 0 va en rojo — es la fila que decide una compra", async () => {
    await buscarPegado();
    const fila = screen.getAllByText("ZZZ999001")[0].closest("tr")!;
    const celdas = [...fila.querySelectorAll("td")];
    const stock = celdas[3];
    expect(stock.textContent).toBe("0");
    expect(stock.className).toContain("text-red-700");
  });

  it("🔴 el Excel baja LA MISMA lista, en el orden pegado", async () => {
    await buscarPegado();
    fireEvent.click(screen.getAllByRole("button", { name: /Bajar a Excel/ })[0]);
    expect(exportSpy).toHaveBeenCalledTimes(1);
    const lista = exportSpy.mock.calls[0][0] as ArticuloCompras[];
    expect(lista.map((a) => a.codigo)).toEqual(["ZZZ999001", "AAA111001", "CVM253CR02001"]);
  });

  it("🔴 UN solo código sigue mostrando la tarjeta completa, no la tabla", async () => {
    const resp: ComprasApiResp = { ...RESP, articulos: [articulo("CVM253CR02001")] };
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => resp }) as unknown as Response));
    render(<ReferenciaView />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "CVM253CR02001" } });
    fireEvent.click(screen.getAllByRole("button", { name: /Buscar/ })[0]);
    await screen.findAllByText("CVM253CR02001");
    // Tarjeta: los grandes montados de una; tabla: ni una celda th.
    expect(screen.getAllByText("en bodega").length).toBeGreaterThan(0);
    expect(document.querySelector("thead")).toBeNull();
  });

  it("🔴 COMPRÉ · VENDÍ de la fila son de la ÚLTIMA LLEGADA, y dicen lo MISMO que la ficha que se abre debajo", async () => {
    // El caso de la captura (4G5004G001): 36 u en oct-2025 vendidas TODAS,
    // bodega en 0 dic-feb, 36 más en mar-2026 y 25 vendidas. La tabla decía
    // 72 · 61 (el histórico) mientras la misma fila decía "69% · 5" de la
    // última llegada — Daniel: *"que sea coherente"*.
    const conDosLlegadas = articulo("4G5004G001", {
      compras: [
        ["2026-03-29", "C", 36],
        ["2025-10-05", "A", 30],
        ["2025-10-05", "B", 6],
      ].map(([fecha, doc, unidades]) => ({
        empresa: "vistana",
        codigo: "4G5004G001",
        fecha: fecha as string,
        documento: doc as string,
        proveedor: "PROV",
        articulo: "4G5004G001",
        unidades: unidades as number,
        costos: { cif: 4, fob: 4, fobOrigen: "igual-al-cif" as const, lista: 10 },
      })),
      serie: [
        { mes: "2025-10", unidades: 12, venta: 120 },
        { mes: "2025-11", unidades: 24, venta: 240 },
        { mes: "2026-04", unidades: 6, venta: 60 },
        { mes: "2026-05", unidades: 18, venta: 180 },
        { mes: "2026-06", unidades: 1, venta: 10 },
      ],
      cuadre: { comprado: 72, vendido: 61, existencia: 12, residuo: -1, ajusteConfiable: false },
      stockSinRespaldo: 1,
      existencia: 12,
      precioEtiqueta: 10,
    });
    const resp: ComprasApiResp = { ...RESP, articulos: [articulo("AAA111001"), conDosLlegadas] };
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => resp }) as unknown as Response));
    render(<ReferenciaView />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "4G5004G001 AAA111001" } });
    fireEvent.click(screen.getAllByRole("button", { name: /Buscar/ })[0]);
    await screen.findAllByText("4G5004G001");

    const fila = () => screen.getAllByText("4G5004G001")[0].closest("tr")!;
    const celdas = () => [...fila().querySelectorAll("td")].map((td) => td.textContent);
    // Compré · Vendí · Stock · Vendido · Meses
    expect(celdas()[1]).toBe("36"); // no 72
    expect(celdas()[2]).toBe("25"); // no 61
    expect(celdas()[3]).toBe("12"); // la existencia REAL, sin recortar
    expect(celdas()[4]).toBe("68%"); // 25 vendidas de las 37 que hubo (25 + 12)
    expect(celdas()[5]).toBe("5");

    // Y el detalle que se abre al tocar dice EXACTAMENTE lo mismo.
    fireEvent.click(fila());
    expect(screen.getAllByText("el 68% de lo que hubo").length).toBeGreaterThan(0);
    expect(screen.getAllByText("72 u en total · 61 vendidas").length).toBeGreaterThan(0);
    const dds = [...document.querySelectorAll("dd")].map((d) => (d.textContent ?? "").replace(/\s+/g, ""));
    expect(dds.slice(0, 4)).toEqual(["36u", "25u", "12u", "5"]);
  });

  it('🩸 vendido > comprado (44D202G110): la celda dice 103%, NO "—", y coincide con la ficha de abajo', async () => {
    // Daniel, con captura: *"PORQUE NO SALE PORCENTAJE?"*. La tabla decía
    // "VENDIDO —" (la vieja regla de "no afirmable") mientras su propia ficha,
    // tres centímetros más abajo, decía "el 103% de lo comprado". Este test es
    // el que caza esa contradicción: lee la celda Y el pie de Vendí del
    // detalle abierto, y exige el MISMO número.
    const conDeMas = articulo("44D202G110", {
      compras: [
        {
          empresa: "vistana",
          codigo: "44D202G110",
          fecha: "2025-10-28",
          documento: "DOC-44D",
          proveedor: "PROV",
          articulo: "44D202G110",
          unidades: 64,
          costos: { cif: 17.6, fob: 17.6, fobOrigen: "igual-al-cif" as const, lista: 24 },
        },
      ],
      serie: [
        { mes: "2025-11", unidades: 32, venta: 704 },
        { mes: "2025-12", unidades: 14, venta: 308 },
        { mes: "2026-06", unidades: 20, venta: 440 },
      ],
      cuadre: { comprado: 64, vendido: 66, existencia: 0, residuo: -2, ajusteConfiable: false },
      vendidoDeMas: 2,
      existencia: 0,
      precioEtiqueta: 24,
    });
    const resp: ComprasApiResp = { ...RESP, articulos: [articulo("AAA111001"), conDeMas] };
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => resp }) as unknown as Response));
    render(<ReferenciaView />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "44D202G110 AAA111001" } });
    fireEvent.click(screen.getAllByRole("button", { name: /Buscar/ })[0]);
    await screen.findAllByText("44D202G110");

    const fila = () => screen.getAllByText("44D202G110")[0].closest("tr")!;
    const celdas = () => [...fila().querySelectorAll("td")].map((td) => td.textContent);
    expect(celdas()[1]).toBe("64"); // Compré
    expect(celdas()[2]).toBe("66"); // Vendí
    // 🩸 Antes decía "—", después 103%, y desde el 25-ago-2026 dice 100%: el %
    // se mide contra lo que hubo (66 vendidas + 0 en bodega). Lo que este
    // candado protege no es el número: es que la tabla y la ficha NO discrepen.
    expect(celdas()[4]).toBe("100%");
    expect(celdas()[4]).not.toBe("—");

    // Y la ficha que se abre al tocar dice EXACTAMENTE el mismo porcentaje,
    // con el aviso de descuadre explicando las 2 unidades de más.
    fireEvent.click(fila());
    expect(screen.getAllByText("el 100% de lo que hubo").length).toBeGreaterThan(0);
    expect(
      screen.getAllByText("Se vendieron 2 unidades más de las que llegaron según los ingresos registrados.")
        .length,
    ).toBeGreaterThan(0);
  });

  it("la tabla scrollea ELLA SOLA: las filas viven dentro de un overflow-x-auto", async () => {
    await buscarPegado();
    const tabla = document.querySelector("tbody")!.closest("div");
    expect(tabla?.className).toContain("overflow-x-auto");
  });

  it("🔴 margenVisible:false (vendedor/bodega): SIN columna Margen, y el detalle tampoco lo dibuja — lo demás queda", async () => {
    // Daniel: *"quita margen, lo demas dejalo"*. El servidor decide y la vista
    // obedece: ni la columna en la tabla ni el "margen X%" en la fila de plata.
    const resp: ComprasApiResp = { ...RESP, margenVisible: false };
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => resp }) as unknown as Response));
    render(<ReferenciaView />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: PEGADO } });
    fireEvent.click(screen.getAllByRole("button", { name: /Buscar/ })[0]);
    await screen.findAllByText("CVM253CR02001");

    expect(screen.queryByText("Margen")).toBeNull();
    // Las demás columnas siguen enteras.
    for (const col of ["Código", "Compré", "Vendí", "Stock", "Vendido", "Meses", "Últ. compra"]) {
      expect(screen.getAllByText(col).length, `falta la columna "${col}"`).toBeGreaterThan(0);
    }
    // Abrir el detalle: la fila de plata trae precios y costos, pero NO margen.
    fireEvent.click(screen.getAllByText("AAA111001")[0].closest("tr")!);
    expect(screen.getAllByText("Costo CIF").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Precio prom").length).toBeGreaterThan(0);
    expect(screen.queryByText("margen")).toBeNull();
  });
});

describe("ordenarComoPegado (puro)", () => {
  const arts = [
    { codigo: "AAA", empresa: "vistana" },
    { codigo: "BBB", empresa: "vistana" },
    { codigo: "CCC", empresa: "vistana" },
  ];

  it("ordena por la posición del código en la lista pegada", () => {
    expect(ordenarComoPegado(arts, ["CCC", "AAA", "BBB"]).map((a) => a.codigo)).toEqual(["CCC", "AAA", "BBB"]);
  });

  it("un artículo fuera de la lista va al final, nunca se pierde", () => {
    expect(ordenarComoPegado(arts, ["BBB"]).map((a) => a.codigo)).toEqual(["BBB", "AAA", "CCC"]);
  });

  it("no distingue mayúsculas (el parseo normaliza a MAYÚSCULA)", () => {
    expect(ordenarComoPegado([{ codigo: "aaa", empresa: "v" }], ["AAA"]).map((a) => a.codigo)).toEqual(["aaa"]);
  });
});

// ─── ORDENAR POR COLUMNA (25-ago-2026) ───────────────────────────────────────
//
// 🔴 EL RIESGO NO ES EL COMPARADOR (eso lo cubre `ventas-referencia-orden`):
// es que el ORDEN PEGADO deje de ser el default, o que no se pueda volver a él.
// Por eso acá se RENDERIZA la tabla real y se tocan los encabezados.
describe("modo pedido — ordenar por columna", () => {
  const codigosEnPantalla = () =>
    [...document.querySelectorAll("tbody td:first-child")].map(
      (td) => td.querySelector("span")?.textContent ?? "",
    );
  const encabezado = (titulo: string) =>
    screen.getAllByRole("button", { name: new RegExp(`^${titulo}$`) })[0];

  it("🔴 EL DEFAULT SIGUE SIENDO EL ORDEN PEGADO: sin tocar nada, nada se ordena", async () => {
    await buscarPegado();
    expect(codigosEnPantalla()).toEqual(["ZZZ999001", "AAA111001", "CVM253CR02001"]);
    // Y ningún encabezado se anuncia como ordenado.
    for (const th of document.querySelectorAll("thead th")) {
      expect(th.getAttribute("aria-sort")).toBe("none");
    }
  });

  it("🔴 el ciclo del encabezado: ordena → invierte → VUELVE AL ORDEN PEGADO", async () => {
    await buscarPegado();
    // 1er toque: el texto arranca de la A.
    fireEvent.click(encabezado("Código"));
    expect(codigosEnPantalla()).toEqual(["AAA111001", "CVM253CR02001", "ZZZ999001"]);
    // 2do: se da vuelta.
    fireEvent.click(encabezado("Código"));
    expect(codigosEnPantalla()).toEqual(["ZZZ999001", "CVM253CR02001", "AAA111001"]);
    // 3ro: se sale del override. Sin esto, un toque sin querer dejaría a Daniel
    // sin el orden de su lista para siempre.
    fireEvent.click(encabezado("Código"));
    expect(codigosEnPantalla()).toEqual(["ZZZ999001", "AAA111001", "CVM253CR02001"]);
  });

  it("🔴 los NÚMEROS arrancan de mayor a menor, que es lo que se busca al tocar Stock", async () => {
    await buscarPegado();
    fireEvent.click(encabezado("Stock"));
    // 24 · 24 · 0 — y el empate conserva el orden pegado (AAA antes que CVM).
    expect(codigosEnPantalla()).toEqual(["AAA111001", "CVM253CR02001", "ZZZ999001"]);
    const th = [...document.querySelectorAll("thead th")].find((t) =>
      (t.textContent ?? "").includes("Stock"),
    )!;
    expect(th.getAttribute("aria-sort")).toBe("descending");
    fireEvent.click(encabezado("Stock"));
    expect(th.getAttribute("aria-sort")).toBe("ascending");
  });

  it("🔴 ordenar NO cambia un solo número: la fila dice lo mismo antes y después", async () => {
    await buscarPegado();
    const leer = (codigo: string) =>
      [...screen.getAllByText(codigo)[0].closest("tr")!.querySelectorAll("td")].map((td) => td.textContent);
    const antes = leer("ZZZ999001");
    fireEvent.click(encabezado("Vendido"));
    expect(leer("ZZZ999001")).toEqual(antes);
    fireEvent.click(encabezado("Margen"));
    expect(leer("ZZZ999001")).toEqual(antes);
  });

  it('🔴 los "—" van al FINAL en las dos direcciones: no son "el peor de la lista"', async () => {
    const resp: ComprasApiResp = {
      ...RESP,
      articulos: [
        articulo("AAA111001"),
        articulo("RETENCION", {
          compras: [],
          sinCompraRegistrada: true,
          existencia: null,
          cuadre: { comprado: null, vendido: 40, existencia: null, residuo: null, ajusteConfiable: false },
        }),
      ],
    };
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => resp }) as unknown as Response));
    render(<ReferenciaView />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "RETENCION AAA111001" } });
    fireEvent.click(screen.getAllByRole("button", { name: /Buscar/ })[0]);
    await screen.findAllByText("RETENCION");
    fireEvent.click(encabezado("Meses"));
    expect(codigosEnPantalla()[1]).toBe("RETENCION");
    fireEvent.click(encabezado("Meses"));
    expect(codigosEnPantalla()[1]).toBe("RETENCION");
  });

  it("🔴 el chevron NO es una columna ordenable", async () => {
    await buscarPegado();
    const ths = [...document.querySelectorAll("thead th")];
    const ultimo = ths[ths.length - 1];
    expect(ultimo.textContent).toBe("");
    expect(ultimo.querySelector("button")).toBeNull();
  });

  it("🔴 el detalle abierto sigue abierto y en su fila después de ordenar", async () => {
    await buscarPegado();
    fireEvent.click(screen.getAllByText("AAA111001")[0].closest("tr")!);
    expect(screen.getAllByText("Precio prom").length).toBeGreaterThan(0);
    fireEvent.click(encabezado("Código"));
    expect(screen.getAllByText("Precio prom").length).toBeGreaterThan(0);
    expect(codigosEnPantalla()).toEqual(["AAA111001", "CVM253CR02001", "ZZZ999001"]);
  });

  it("⚠️ el Excel sigue bajando el ORDEN PEGADO aunque la tabla esté ordenada", async () => {
    await buscarPegado();
    fireEvent.click(encabezado("Código"));
    fireEvent.click(screen.getAllByRole("button", { name: /Excel/ })[0]);
    const lista = exportSpy.mock.calls[0][0] as { codigo: string }[];
    expect(lista.map((a) => a.codigo)).toEqual(["ZZZ999001", "AAA111001", "CVM253CR02001"]);
  });
});

// 🔴 EL SORT ORDENA POR LO QUE LA CELDA MUESTRA, NUNCA POR UNA SEGUNDA CUENTA.
// Es el mismo defecto que produjo la contradicción de 44D202G110, con otro
// disfraz: una columna que ordena por un número distinto del que pinta.
describe("modo pedido — ordenar NO puede estrenar una segunda cuenta", () => {
  it("🔴 'Vendido' ordena por el % que se ve (Vendí ÷ lo que hubo), no por Vendí ÷ Compré", async () => {
    // DESC001: compró 100, vendió 50, quedan 30 → 20 se perdieron en un ajuste.
    //   lo que se VE = 50 ÷ 80 = 63%   ·   la cuenta vieja = 50 ÷ 100 = 50%
    // OTRO002: cuadra, así que las dos cuentas dan 55%.
    // Ordenado por lo que se ve, DESC001 va PRIMERO; por la cuenta vieja, último.
    const conAjuste = (codigo: string, vendido: number, existencia: number): ArticuloCompras => ({
      ...articulo(codigo),
      compras: [{ ...articulo(codigo).compras[0], unidades: 100 }],
      serie: [{ mes: "2026-05", unidades: vendido, venta: vendido * 10 }],
      cuadre: { comprado: 100, vendido, existencia, residuo: 100 - vendido - existencia, ajusteConfiable: false },
      existencia,
    });
    const resp: ComprasApiResp = {
      ...RESP,
      articulos: [conAjuste("DESC001", 50, 30), conAjuste("OTRO002", 55, 45)],
    };
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => resp }) as unknown as Response));
    render(<ReferenciaView />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "OTRO002 DESC001" } });
    fireEvent.click(screen.getAllByRole("button", { name: /Buscar/ })[0]);
    await screen.findAllByText("DESC001");
    // Lo que se ve en la celda.
    const celdaVendido = (codigo: string) =>
      [...screen.getAllByText(codigo)[0].closest("tr")!.querySelectorAll("td")][4].textContent;
    expect(celdaVendido("DESC001")).toBe("63%");
    expect(celdaVendido("OTRO002")).toBe("55%");
    // Y el orden respeta ESO.
    fireEvent.click(screen.getAllByRole("button", { name: /^Vendido$/ })[0]);
    const codigos = [...document.querySelectorAll("tbody td:first-child")].map(
      (td) => td.querySelector("span")?.textContent ?? "",
    );
    expect(codigos).toEqual(["DESC001", "OTRO002"]);
  });
});

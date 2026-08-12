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
 *  vista es la que tiene que reordenarla como se pegó. */
const RESP: ComprasApiResp = {
  hoyMes: "2026-08",
  hoy: "2026-08-12",
  articulos: [
    articulo("AAA111001"),
    articulo("CVM253CR02001"),
    articulo("ZZZ999001", {
      existencia: 0,
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
    // Las columnas del mockup aprobado.
    for (const col of ["Código", "Compré", "Vendí", "Stock", "90% en", "Margen", "Últ. compra"]) {
      expect(screen.getAllByText(col).length, `falta la columna "${col}"`).toBeGreaterThan(0);
    }
    // Sin detalle abierto, los grandes de la tarjeta no están montados ("en
    // bodega" es el pie del Stock grande y solo existe en el cuerpo).
    expect(screen.queryByText("en bodega")).toBeNull();
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
    expect(screen.getAllByText("Vendo 9.6 u por mes · En 10 meses va el 80% de la compra").length).toBeGreaterThan(0);
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

  it("la tabla scrollea ELLA SOLA: las filas viven dentro de un overflow-x-auto", async () => {
    await buscarPegado();
    const tabla = document.querySelector("tbody")!.closest("div");
    expect(tabla?.className).toContain("overflow-x-auto");
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

// CANDADO de PRODUCTOS_FILTROS_2026_10 (Daniel, 5-oct-2026): la misma pantalla
// de Productos en Ventas y Multifashion.
//
// 1. Nace apagado.
// 2. Filtrar no inventa números: los grupos de un chip SUMAN el total.
// 3. Departamento sin el prefijo de la marca; género del prefijo de la descripción.
// 4. Las opciones de un chip dependen de lo ya elegido.

import { describe, it, expect } from "vitest";
import {
  PRODUCTOS_FILTROS_2026_10,
  coberturaDe,
  departamentoSinMarca,
  diasDeInventario,
  filtrarArticulos,
  generoDe,
  opcionesDe,
  partesDelCodigo,
  porDescripcion,
  totalesDe,
  type ArticuloVendido,
} from "@/lib/productos/filtros";
import { ventanaDelPeriodo } from "@/components/ventas/usePeriodoProductos";
import { departamentosPorCodigo, articulosMultifashion } from "@/lib/multifashion/productos-filtros";

const a = (codigo: string, descripcion: string, marca: string, unidades: number, venta: number, costo: number, existencia: number | null = null): ArticuloVendido => ({
  codigo, descripcion, unidades, venta, costo, existencia,
  campos: { departamento: departamentoSinMarca(marca), genero: generoDe(descripcion), descripcion },
});

const ARTS: ArticuloVendido[] = [
  a("MW0MW1DW5", "Men-T-Shirts S/S", "TH MENSWEAR", 10, 400, 200, 30),
  a("DM0DM2YBR", "Men-T-Shirts S/S", "TH TOMMY JEANS", 5, 250, 150, 0),
  a("AW0AW3BDS", "Women-Bags", "TH ACCESSORIES", 2, 300, 120, 4),
  a("MW0MW4C87", "Men-Polos S/S", "TH MENSWEAR", 3, 210, 90),
  a("AW0AW5BDS", "Women-Bags", "TH ACCESSORIES", -1, -150, -60), // devolución neta
];

describe("interruptor", () => {
  it("prendido el 5-oct-2026", () => expect(PRODUCTOS_FILTROS_2026_10).toBe(true));
});

describe("los filtros no inventan números", () => {
  const total = totalesDe(ARTS);
  it("total = suma de los códigos (devoluciones restadas)", () => {
    expect(total).toMatchObject({ unidades: 19, venta: 1010, costo: 500, utilidad: 510 });
  });
  it("los departamentos, por separado, suman el total", () => {
    const deps = opcionesDe(ARTS, "departamento", "", {});
    expect(deps).toEqual(["Menswear", "Accessories", "Tommy Jeans"]);
    const suma = deps.reduce((s, d) => s + totalesDe(filtrarArticulos(ARTS, "", { departamento: d })).venta, 0);
    expect(suma).toBe(total.venta);
  });
  it("una descripción con dos departamentos se parte al filtrar", () => {
    const r = porDescripcion(filtrarArticulos(ARTS, "", { departamento: "Tommy Jeans" }));
    expect(r).toEqual([expect.objectContaining({ descripcion: "Men-T-Shirts S/S", venta: 250, existencia: 0 })]);
  });
  it("el 🔍 busca solo por código", () => {
    expect(filtrarArticulos(ARTS, "mw0mw4", {}).map(x => x.codigo)).toEqual(["MW0MW4C87"]);
    expect(filtrarArticulos(ARTS, "polos", {})).toEqual([]);
  });
  it("las opciones dependen de lo elegido", () => {
    expect(opcionesDe(ARTS, "descripcion", "", { genero: "Mujer" })).toEqual(["Women-Bags"]);
  });
});

describe("departamento, género, color y días", () => {
  it("departamento sin el prefijo de la marca", () => {
    expect(departamentoSinMarca("TH MENSWEAR")).toBe("Menswear");
    expect(departamentoSinMarca("CK UNDERWEAR")).toBe("Underwear");
    expect(departamentoSinMarca("TH DISPLAY & PROMO")).toBe("Display & Promo");
    expect(departamentoSinMarca("FOOTWEAR")).toBe("Footwear");
  });
  it("género del prefijo de la descripción, o del subrubro de Switch", () => {
    expect(generoDe("Men-T-Shirts S/S")).toBe("Hombre");
    expect(generoDe("Women Riviera Sandal")).toBe("Mujer");
    expect(generoDe("Boys-Sneakers")).toBe("Niños");
    expect(generoDe("REEBOK MATCH PRIME V2", "SHOES", "FEMALE")).toBe("Mujer");
    expect(generoDe("Adults Active Clog")).toBe("");
  });
  it("el chip de género se esconde si cubre poca venta", () => {
    expect(coberturaDe(ARTS, "genero")).toBe(1);
    expect(coberturaDe([a("X1", "VERSE", "FOOTWEAR", 1, 100, 50)], "genero")).toBe(0);
  });
  it("color = los 3 últimos caracteres del código", () => {
    expect(partesDelCodigo("MW0MW38616DW5")).toEqual({ modelo: "MW0MW38616", color: "DW5" });
    expect(partesDelCodigo("FW0FW06158-DW5")).toEqual({ modelo: "FW0FW06158", color: "DW5" });
  });
  it("días de inventario = existencia ÷ venta diaria", () => {
    expect(diasDeInventario(30, 10, 30)).toBe(90);
    expect(diasDeInventario(5, 0, 30)).toBeNull();
    expect(diasDeInventario(0, 4, 30)).toBe(0);
  });
});

describe("período de Productos en Ventas", () => {
  it("mes, mes en curso, rango y últimos meses, sin pasar de hoy", () => {
    expect(ventanaDelPeriodo({ tipo: "mes", anio: 2026, mes: 9 }, "2026-10-05")).toEqual({ desde: "2026-09-01", hasta: "2026-09-30" });
    expect(ventanaDelPeriodo({ tipo: "mes", anio: 2026, mes: 10 }, "2026-10-05")).toEqual({ desde: "2026-10-01", hasta: "2026-10-05" });
    expect(ventanaDelPeriodo({ tipo: "ultimos", n: 3 }, "2026-10-05")).toEqual({ desde: "2026-08-01", hasta: "2026-10-05" });
    expect(ventanaDelPeriodo({ tipo: "rango", desde: "2026-09-10", hasta: "2026-09-20" }, "2026-10-05")).toEqual({ desde: "2026-09-10", hasta: "2026-09-20" });
  });
});

describe("Multifashion: marca y departamento salen del diccionario", () => {
  it("código → departamento → marca real", () => {
    const deps = departamentosPorCodigo(
      [{ articulo_id: 1, codigo: " TH-CAM ", descripcion: "x", tipo: "FA", cantidad_total: 1, venta_total: 1, costo_total: 0 }],
      new Map([[1, "TH MENSWEAR"]]),
    );
    const [art] = articulosMultifashion(
      [{ clave: "TH-CAM", etiqueta: "TH-CAM", detalle: "Men-Shirts", unidades: 1, venta: 1, costo: 0, utilidad: 1, margen: 1, articulos: 1 }],
      deps,
    );
    expect(art.campos).toEqual({ marca: "Tommy Hilfiger", departamento: "Menswear", genero: "Hombre", descripcion: "Men-Shirts" });
  });
});

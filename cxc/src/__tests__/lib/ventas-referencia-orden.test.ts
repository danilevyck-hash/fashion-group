// ─────────────────────────────────────────────────────────────────────────────
// CANDADO del ORDEN POR COLUMNA de la tabla del modo pedido (25-ago-2026).
//
// 🔴 LO QUE ESTE ARCHIVO PROTEGE ES QUE SE PUEDA VOLVER. El orden por defecto
// es el ORDEN PEGADO —Daniel lee la tabla con su Excel al lado— y el sort es un
// override; el ciclo de tres pasos del encabezado es lo que garantiza que un
// toque sin querer no le deje la lista revuelta para siempre.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import {
  ordenarFilas,
  siguienteOrden,
  type OrdenPedido,
  type ValoresOrden,
} from "@/lib/ventas/referencia-orden";

const fila = (v: Partial<ValoresOrden> & { codigo: string }): ValoresOrden => ({
  compre: 120,
  vendi: 96,
  stock: 24,
  vendido: 0.8,
  meses: 10,
  margen: 0.39,
  ultima: "2025-10-23",
  ...v,
});

describe("siguienteOrden — el ciclo del encabezado", () => {
  it("🔴 ordena → invierte → VUELVE al orden pegado (null)", () => {
    let o: OrdenPedido = null;
    o = siguienteOrden(o, "stock");
    expect(o).toEqual({ col: "stock", dir: "desc" });
    o = siguienteOrden(o, "stock");
    expect(o).toEqual({ col: "stock", dir: "asc" });
    o = siguienteOrden(o, "stock");
    expect(o).toBeNull(); // ← sin esto no hay forma de recuperar el orden pegado
  });

  it("el TEXTO arranca de la A; los NÚMEROS, de mayor a menor", () => {
    expect(siguienteOrden(null, "codigo")).toEqual({ col: "codigo", dir: "asc" });
    expect(siguienteOrden({ col: "codigo", dir: "asc" }, "codigo")).toEqual({ col: "codigo", dir: "desc" });
    expect(siguienteOrden({ col: "codigo", dir: "desc" }, "codigo")).toBeNull();
    for (const col of ["compre", "vendi", "stock", "vendido", "meses", "margen", "ultima"] as const) {
      expect(siguienteOrden(null, col)).toEqual({ col, dir: "desc" });
    }
  });

  it("cambiar de columna arranca el ciclo de la NUEVA, no hereda la dirección", () => {
    expect(siguienteOrden({ col: "stock", dir: "asc" }, "meses")).toEqual({ col: "meses", dir: "desc" });
    expect(siguienteOrden({ col: "stock", dir: "asc" }, "codigo")).toEqual({ col: "codigo", dir: "asc" });
  });
});

describe("ordenarFilas", () => {
  const filas = [
    fila({ codigo: "ZZZ999001", stock: 0, vendido: 1, meses: 3, margen: 0.5 }),
    fila({ codigo: "AAA111001" }),
    fila({ codigo: "CVM253CR02001", stock: 60, vendido: 0.5, meses: 4, margen: 0.1 }),
  ];
  const orden = (o: OrdenPedido) => ordenarFilas(filas, o, (f) => f).map((f) => f.codigo);

  it("🔴 con el orden pegado (null) NO se toca la lista", () => {
    expect(orden(null)).toEqual(["ZZZ999001", "AAA111001", "CVM253CR02001"]);
  });

  it("🔴 NO muta el arreglo que recibe", () => {
    const antes = filas.map((f) => f.codigo);
    ordenarFilas(filas, { col: "stock", dir: "asc" }, (f) => f);
    expect(filas.map((f) => f.codigo)).toEqual(antes);
  });

  it("números, en las dos direcciones", () => {
    expect(orden({ col: "stock", dir: "desc" })).toEqual(["CVM253CR02001", "AAA111001", "ZZZ999001"]);
    expect(orden({ col: "stock", dir: "asc" })).toEqual(["ZZZ999001", "AAA111001", "CVM253CR02001"]);
    expect(orden({ col: "meses", dir: "asc" })).toEqual(["ZZZ999001", "CVM253CR02001", "AAA111001"]);
    expect(orden({ col: "margen", dir: "desc" })).toEqual(["ZZZ999001", "AAA111001", "CVM253CR02001"]);
  });

  it("texto: comparación CRUDA en mayúsculas, sin localeCompare con opciones", () => {
    expect(orden({ col: "codigo", dir: "asc" })).toEqual(["AAA111001", "CVM253CR02001", "ZZZ999001"]);
    expect(orden({ col: "codigo", dir: "desc" })).toEqual(["ZZZ999001", "CVM253CR02001", "AAA111001"]);
    // Un código en minúsculas ordena en su lugar, no al final del alfabeto.
    const mixto = [fila({ codigo: "bbb" }), fila({ codigo: "AAA" }), fila({ codigo: "CCC" })];
    expect(ordenarFilas(mixto, { col: "codigo", dir: "asc" }, (f) => f).map((f) => f.codigo)).toEqual([
      "AAA",
      "bbb",
      "CCC",
    ]);
  });

  it("la fecha de la última compra ordena como texto ISO (más nueva primero)", () => {
    const fechas = [
      fila({ codigo: "A", ultima: "2024-01-05" }),
      fila({ codigo: "B", ultima: "2026-03-29" }),
      fila({ codigo: "C", ultima: "2025-12-01" }),
    ];
    expect(ordenarFilas(fechas, { col: "ultima", dir: "desc" }, (f) => f).map((f) => f.codigo)).toEqual([
      "B",
      "C",
      "A",
    ]);
  });

  it('🔴 los "—" van al FINAL en las DOS direcciones', () => {
    const conHuecos = [
      fila({ codigo: "SIN", stock: null, vendido: null, meses: null, margen: null, ultima: null, compre: null }),
      fila({ codigo: "BAJO", stock: 1, vendido: 0.1, meses: 1, margen: 0.05 }),
      fila({ codigo: "ALTO", stock: 99, vendido: 0.9, meses: 20, margen: 0.6 }),
    ];
    for (const col of ["stock", "vendido", "meses", "margen", "ultima", "compre"] as const) {
      for (const dir of ["asc", "desc"] as const) {
        const r = ordenarFilas(conHuecos, { col, dir }, (f) => f).map((f) => f.codigo);
        expect(r[2], `${col}/${dir} puso el "—" arriba`).toBe("SIN");
      }
    }
  });

  it("🔴 el desempate es el ORDEN PEGADO (el sort es estable)", () => {
    const empatados = [
      fila({ codigo: "TERCERO", stock: 5 }),
      fila({ codigo: "PRIMERO", stock: 5 }),
      fila({ codigo: "SEGUNDO", stock: 5 }),
    ];
    expect(ordenarFilas(empatados, { col: "stock", dir: "desc" }, (f) => f).map((f) => f.codigo)).toEqual([
      "TERCERO",
      "PRIMERO",
      "SEGUNDO",
    ]);
  });

  it("un vendido negativo (más devoluciones que ventas) ordena como el número que es", () => {
    const devs = [fila({ codigo: "A", vendi: 10 }), fila({ codigo: "B", vendi: -5 }), fila({ codigo: "C", vendi: 0 })];
    expect(ordenarFilas(devs, { col: "vendi", dir: "asc" }, (f) => f).map((f) => f.codigo)).toEqual([
      "B",
      "C",
      "A",
    ]);
  });
});

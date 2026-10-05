// 🔴 CANDADO «Rango de fechas» en Ventas › Resumen y Clientes (Daniel, 5-oct-2026).
// 1. El período viaja en la URL (`2026-09-15_2026-09-30`) y solo Resumen y Clientes lo sirven.
// 2. Se compara contra los MISMOS días del año pasado; utilidad y margen solo hasta el último día con costo.
// 3. Clientes: la misma cuenta que `clientes_anio` (código como identidad, NC restan, TCKCTA pasa).
// Medido el 5-oct-2026: septiembre 2026 por rango = la columna de septiembre del Resumen, empresa por empresa.

import { describe, it, expect, vi } from "vitest";
vi.mock("@/lib/supabase-server", () => ({ supabaseServer: {} }));
import { periodoAUrl, periodoDesdeUrl, periodoSirve, etiquetaPeriodo, rotuloVs } from "@/lib/ventas/periodo";
import { armarResumenRango, numerosDelRango, rangoValido } from "@/lib/ventas/rango-ventas";
import { armarFilasRango, nombreNormalizado } from "@/lib/ventas/clientes-rango-server";

const cap = { clientesVentanas: [] as (6 | 12)[] };

describe("el período rango", () => {
  it("ida y vuelta por la URL, y al revés no sirve", () => {
    const p = periodoDesdeUrl("2026-09-15_2026-09-30");
    expect(p).toEqual({ tipo: "rango", desde: "2026-09-15", hasta: "2026-09-30" });
    expect(periodoAUrl(p!)).toBe("2026-09-15_2026-09-30");
    expect(periodoDesdeUrl("2026-09-30_2026-09-15")).toBeNull();
    expect(etiquetaPeriodo(p!)).toBe("15–30 sep");
    expect(rotuloVs(p!, 2025)).toBe("vs 2025");
  });
  it("lo sirven Resumen y Clientes; Productos tiene el suyo", () => {
    const p = periodoDesdeUrl("2026-09-15_2026-09-30")!;
    expect(periodoSirve("resumen", p, cap)).toBe(true);
    expect(periodoSirve("clientes", p, cap)).toBe(true);
    expect(periodoSirve("productos", p, cap)).toBe(false);
  });
  it("sin futuro, sin más de dos años, desde 2022", () => {
    expect(rangoValido("2026-09-01", "2026-09-30", "2026-10-05")).toEqual({ desde: "2026-09-01", hasta: "2026-09-30" });
    expect(rangoValido("2026-10-01", "2026-10-06", "2026-10-05")).toBeNull();
    expect(rangoValido("2021-12-01", "2022-01-05", "2026-10-05")).toBeNull();
    expect(rangoValido("2023-01-01", "2026-01-01", "2026-10-05")).toBeNull();
  });
});

describe("Resumen por rango", () => {
  const r = armarResumenRango({
    desde: "2026-10-01", hasta: "2026-10-05", anterior: { desde: "2025-10-01", hasta: "2025-10-05" },
    empresas: ["vistana", "joystep"],
    ventas: [
      { empresa_key: "vistana", dia: "2026-10-01", monto: 100 },
      { empresa_key: "vistana", dia: "2026-10-05", monto: 50 }, // hoy: sin costo todavía
      { empresa_key: "vistana", dia: "2026-10-02", monto: -10 }, // nota de crédito
    ],
    costos: [{ empresa_key: "vistana", dia: "2026-10-04", monto: 60 }],
    ventasPrevio: [
      { empresa_key: "vistana", dia: "2025-10-01", monto: 80 },
      { empresa_key: "vistana", dia: "2025-10-05", monto: 20 },
    ],
    costosPrevio: [
      { empresa_key: "vistana", dia: "2025-10-02", monto: 40 },
      { empresa_key: "vistana", dia: "2025-10-05", monto: 10 },
    ],
  });
  it("la venta va hasta hoy; la utilidad, hasta el último día con costo", () => {
    expect(r.corteCosto).toBe("2026-10-04");
    expect(r.total.venta).toBe(140);
    expect(r.total.utilidad).toBe(30); // (100 − 10) − 60
    expect(r.total.margen).toBeCloseTo(30 / 90);
    expect(r.total.ventaPrevio).toBe(100);
    expect(r.total.utilidadPrevio).toBe(40); // 80 − 40, sin el 5-oct del año pasado
  });
  it("una empresa sin movimiento no sale; el total es la suma", () => {
    expect(r.filas.map(f => f.empresa_key)).toEqual(["vistana"]);
    expect(numerosDelRango(r.total)[0]).toMatchObject({ rotulo: "Ventas", cambio: "▲ +40%" });
  });
});

describe("Clientes por rango", () => {
  const f = (empresa_key: string, id: number, nombre: string, monto: number, fecha: string, tipo = "Factura") =>
    ({ empresa_key, cliente_switch_id: id, cliente_nombre: nombre, tipo_comprobante: tipo, subtotal_descuento: monto, fecha });
  const codigoDe = new Map([["vistana|1", "D-25"], ["fashion_wear|9", "D-25"], ["vistana|2", "TCKCTA"]]);
  const maestro = new Map([["D-25", { id: "u1", codigo: "D-25", nombre: "Cliente Uno", celular: "60001111", telefono: null }]]);
  const actual = [
    f("vistana", 1, "cliente uno", 100, "2026-09-10T15:00:00Z"),
    f("fashion_wear", 9, "CLIENTE UNO S.A.", 50, "2026-09-12T15:00:00Z"),
    f("vistana", 1, "cliente uno", 20, "2026-09-11T15:00:00Z", "Nota de Crédito"),
    f("vistana", 2, "CONTADO", 30, "2026-09-11T15:00:00Z"),
    f("vistana", 3, "VENTAS", 999, "2026-09-11T15:00:00Z"),
  ];
  const previo = [f("vistana", 1, "cliente uno", 40, "2025-09-10T15:00:00Z")];
  it("quien compró el año pasado y no en el rango sale con $0", () => {
    const filas = armarFilasRango({ actual: [], previo, codigoDe, maestro, empresa: "vistana" });
    expect(filas).toEqual([expect.objectContaining({ cliente_codigo: "D-25", compras_ytd: 0, compras_anio_anterior: 40, delta_vs_2025: -1 })]);
  });
  it("por empresa: la NC resta, el mostrador pasa por código, «VENTAS» se aparta", () => {
    const filas = armarFilasRango({ actual, previo, codigoDe, maestro, empresa: "vistana" });
    expect(filas.map(x => [x.cliente_codigo, x.compras_ytd, x.compras_anio_anterior])).toEqual(
      expect.arrayContaining([["D-25", 80, 40], ["TCKCTA", 30, 0]]),
    );
    expect(filas).toHaveLength(2);
  });
  it("todas: una fila por cliente con su desglose por empresa", () => {
    const d25 = armarFilasRango({ actual, previo, codigoDe, maestro, empresa: null }).find(x => x.cliente_codigo === "D-25")!;
    expect(d25).toMatchObject({ compras_ytd: 130, compras_anio_anterior: 40, empresas_count: 2, empresa: "vistana", whatsapp: "60001111", ultima_compra: "2026-09-12" });
    expect(d25.delta_vs_2025).toBeCloseTo(90 / 40);
  });
  it("el nombre se normaliza como en el SQL", () => {
    expect(nombreNormalizado("  Cliente,  Uno. ")).toBe("CLIENTE UNO");
    expect(nombreNormalizado("")).toBe("(Sin nombre)");
  });
});

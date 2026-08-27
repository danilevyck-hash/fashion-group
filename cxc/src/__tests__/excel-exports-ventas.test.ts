// Tests de los exports Excel de la familia Ventas/Comisiones migrados al
// estilo de la casa (buildReportSheet, hallazgo I11). Cada build* es puro
// (sin DOM); aquí se construye el sheet con fixtures mínimos, se hace
// write→read roundtrip y se verifica: encabezados en la FILA 1, celdas de
// moneda numéricas (t:"n" + MONEY_FMT) y fila de totales.

import { describe, it, expect, vi } from "vitest";
import XLSX from "xlsx-js-style";

// utilidad-cliente importa @/lib/empresa-mapping, que instancia el cliente de
// Supabase server-side (requiere env vars). Solo necesitamos el mapa de nombres.
vi.mock("@/lib/empresa-mapping", () => ({
  EMPRESA_KEY_TO_NAME: { fashion_wear: "Fashion Wear" } as Record<string, string>,
}));

import { workbookFromSheets, MONEY_FMT } from "@/lib/excel-export";
import { buildResumenSheet } from "@/lib/ventas/excel";
import {
  buildComisionDetalleSheet,
  buildComisionesResumenSheet,
  buildComisionesConsolidadoSheet,
  comisionLinea,
  ventasPagables,
  type ComisionDetalle,
  type ComisionResumen,
  type ComisionConsolidado,
} from "@/lib/ventas/comisionExcel";
import { buildUtilidadSheet, type UtilidadClienteResponse } from "@/lib/ventas/utilidad-cliente";
import { buildProductosSheet, periodoSlug, type ProductosResponse } from "@/lib/ventas/productos";
import type { VentasResumen } from "@/components/ventas/types";

// write→read roundtrip: lo que asserteamos es lo que Excel realmente abre.
function roundtrip(sheets: { name: string; ws: XLSX.WorkSheet }[]): XLSX.WorkBook {
  const wb = workbookFromSheets(sheets);
  const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  return XLSX.read(buf, { type: "array", cellNF: true });
}

// Layout de buildReportSheet desde el 27-ago-2026: los ENCABEZADOS van en la
// FILA 1 y no hay NADA arriba de ellos — ni título, ni subtítulo, ni la franja
// separadora de 4 puntos que se veía como una fila escondida.
const HDR = 1; // fila 1-based de headers
const DATA = 2; // primera fila 1-based de data
function totalsRow(nDataRows: number): number {
  return DATA + nDataRows + 1; // 1-based (hay una fila espaciadora antes)
}

describe("excel exports Ventas/Comisiones — estilo de la casa", () => {
  it("resumen de ventas (lib/ventas/excel)", async () => {
    const fixture = {
      year: 2026,
      fecha_corte: "2026-07-04",
      dia_corte_anio_anterior: "2025-07-04",
      empresas: [
        {
          empresa: { nombre: "Fashion Wear" },
          ventas2026: [1000, 2000, null, null, null, null, null, null, null, null, null, null],
          ventas2025: [900, null, null, null, null, null, null, null, null, null, null, null],
          margenPct: 0.3,
        },
      ],
    } as unknown as VentasResumen;

    const ws = await buildResumenSheet(fixture);
    const wb = roundtrip([{ name: "Ventas", ws }]);
    const s = wb.Sheets["Ventas"];

    // headers: Empresa | Ene 2026 | Feb 2026 | Total | Margen% | YTD prev | Δ
    expect(s[`A${HDR}`].v).toBe("Empresa");
    expect(s[`B${HDR}`].v).toBe("Ene 2026");
    expect(s[`C${HDR}`].v).toBe("Feb 2026");
    expect(s[`D${HDR}`].v).toBe("Total");
    expect(s[`E${HDR}`].v).toBe("Margen%");
    expect(String(s[`F${HDR}`].v)).toContain("YTD 2025");
    // celda de moneda numérica
    expect(s[`B${DATA}`].t).toBe("n");
    expect(s[`B${DATA}`].v).toBe(1000);
    expect(s[`B${DATA}`].z).toBe(MONEY_FMT);
    expect(s[`D${DATA}`].v).toBe(3000);
    // fila TOTAL
    const tr = totalsRow(1);
    expect(s[`A${tr}`].v).toBe("TOTAL");
    expect(s[`D${tr}`].t).toBe("n");
    expect(s[`D${tr}`].v).toBe(3000);
  });

  it("comisión detalle (1 hoja, secciones VENTAS/COBROS/CIERRE apiladas)", async () => {
    const d: ComisionDetalle = {
      empresa_key: "fashion_wear",
      year: 2026,
      mes: 6,
      vendedor: "Ana Pérez",
      tasa_venta: 0.01,
      tasa_cobro: 0.005,
      ventas: [{ fecha: "2026-06-05", cliente: "Cliente X", secuencial: "F-001", tipo: "FA", subtotal: 500, pct_utilidad: 25 }],
      cobros: [{ fecha: "2026-06-10", cliente: "Cliente X", monto: 300 }],
      ventas_base: 500,
      cobros_base: 300,
      comision_venta: 5,
      comision_cobro: 1.5,
      comision_total: 6.5,
    };

    const ws = await buildComisionDetalleSheet(d, "Fashion Wear");
    const wb = roundtrip([{ name: "Comisión", ws }]);
    const s = wb.Sheets["Comisión"];

    // Layout apilado (1-based, 1 venta y 1 cobro):
    // 1 título · 2 subtítulo · 3 sep · 4 VENTAS · 5 hdr · 6 venta · 7 total
    // 8 spacer · 9 COBROS · 10 hdr · 11 cobro · 12 total · 13 spacer
    // 14 CIERRE · 15 Ventas · 16 Cobros · 17 Comisión total
    expect(s["A1"].v).toBe("Comisión — Ana Pérez");
    expect(s["A2"].v).toBe("Fashion Wear · Junio 2026");

    // VENTAS — columnas: Fecha · Cliente · Factura · Tipo · Subtotal (SIN % utilidad).
    expect(s["A4"].v).toBe("VENTAS");
    expect(s["A5"].v).toBe("Fecha");
    expect(s["D5"].v).toBe("Tipo");
    expect(s["E5"].v).toBe("Subtotal");
    expect(s["D6"].v).toBe("FA"); // tipo corto
    expect(s["E6"].t).toBe("n");
    expect(s["E6"].v).toBe(500);
    expect(s["E6"].z).toBe(MONEY_FMT);
    expect(s["F6"]).toBeUndefined(); // no hay columna de % utilidad
    expect(s["D7"].v).toBe("Total ventas");
    expect(s["E7"].t).toBe("n");
    expect(s["E7"].v).toBe(500);

    // COBROS
    expect(s["A9"].v).toBe("COBROS");
    expect(s["A10"].v).toBe("Fecha");
    expect(s["C11"].t).toBe("n");
    expect(s["C11"].v).toBe(300);
    expect(s["C11"].z).toBe(MONEY_FMT);
    expect(s["B12"].v).toBe("Total cobros");
    expect(s["C12"].v).toBe(300);

    // CIERRE
    expect(s["A14"].v).toBe("CIERRE");
    expect(s["A15"].v).toBe("Ventas");
    expect(s["B15"].t).toBe("n");
    expect(s["B15"].v).toBe(500);
    expect(s["C15"].v).toBe("× 1.00%");
    expect(s["D15"].v).toBe(5);
    expect(s["A17"].v).toBe("Comisión total");
    expect(s["D17"].t).toBe("n");
    expect(s["D17"].v).toBe(6.5);
  });

  it("comisión detalle con descuentos fijos (subtotal − descuentos = total a pagar)", async () => {
    const d: ComisionDetalle = {
      empresa_key: "fashion_shoes", year: 2026, mes: 6, vendedor: "REINALDO ESPINOSA",
      tasa_venta: 0.01, tasa_cobro: 0.01,
      ventas: [{ fecha: "2026-06-02", cliente: "City Mall", secuencial: "11-2410", tipo: "Factura", subtotal: 5706, pct_utilidad: 26.44 }],
      cobros: [{ fecha: "2026-06-10", cliente: "City Mall", monto: 1000 }],
      ventas_base: 85963, cobros_base: 234878.74,
      comision_venta: 859.63, comision_cobro: 2348.79, comision_total: 3208.42,
    };
    const descuentos = [
      { id: "11111111-1111-1111-1111-111111111111", concepto: "Descuento", monto: 1400, activo: true },
      { id: "22222222-2222-2222-2222-222222222222", concepto: "Descuento de adelanto", monto: 173.08, activo: true },
    ];
    const ws = await buildComisionDetalleSheet(d, "Fashion Shoes", descuentos);
    const wb = roundtrip([{ name: "Comisión", ws }]);
    const s = wb.Sheets["Comisión"];

    // CIERRE: Ventas(15) Cobros(16) Subtotal comisión(17) Desc(18) Desc(19) Total a pagar(20)
    expect(s["A17"].v).toBe("Subtotal comisión");
    expect(s["D17"].v).toBe(3208.42);
    expect(s["A18"].v).toBe("Descuento");
    expect(s["D18"].v).toBe(-1400);
    expect(s["A19"].v).toBe("Descuento de adelanto");
    expect(s["D19"].v).toBe(-173.08);
    expect(s["A20"].v).toBe("Total a pagar");
    expect(s["D20"].t).toBe("n");
    expect(s["D20"].v).toBeCloseTo(1635.34, 2); // 3208.42 − 1400 − 173.08
  });

  // El RPC lista las facturas con utilidad ≤20% con aporte $0.00 para que el
  // vendedor las VEA en pantalla (en gris) y entienda por qué no comisionan.
  // El Excel es el papel de lo PAGABLE: esas filas no van. Como aportan 0, el
  // total no se mueve.
  it("comisión detalle Excel — omite las facturas con aporte $0 y el total no cambia", async () => {
    const d: ComisionDetalle = {
      empresa_key: "vistana", year: 2026, mes: 7, vendedor: "DANIEL LEVY",
      tasa_venta: 0.005, tasa_cobro: 0.005,
      ventas: [
        { fecha: "2026-07-02", cliente: "Dana Mall", secuencial: "11-000002973", tipo: "Factura", subtotal: 1000, pct_utilidad: 30 },
        // Utilidad ≤20% → aporte 0: NO debe salir en el Excel.
        { fecha: "2026-07-03", cliente: "R.J.A.S.A.", secuencial: "11-000002995", tipo: "Factura", subtotal: 0, pct_utilidad: 12.5 },
        { fecha: "2026-07-04", cliente: "City Mall", secuencial: "13-000000800", tipo: "Nota de Crédito", subtotal: -200, pct_utilidad: null },
      ],
      cobros: [{ fecha: "2026-07-10", cliente: "Dana Mall", monto: 500 }],
      ventas_base: 800, cobros_base: 500,
      comision_venta: 4, comision_cobro: 2.5, comision_total: 6.5,
    };

    // El helper es la fuente del filtro (lo comparte el builder).
    expect(ventasPagables(d.ventas).map((v) => v.secuencial))
      .toEqual(["11-000002973", "13-000000800"]);

    const ws = await buildComisionDetalleSheet(d, "Vistana International");
    const wb = roundtrip([{ name: "Comisión", ws }]);
    const s = wb.Sheets["Comisión"];

    // VENTAS: hdr en 5, dos filas (6 y 7), total en 8 — la de $0 no ocupa fila.
    expect(s["A5"].v).toBe("Fecha");
    expect(s["C6"].v).toBe("11-000002973");
    expect(s["C7"].v).toBe("13-000000800");
    expect(s["E7"].v).toBe(-200);
    expect(s["D8"].v).toBe("Total ventas");
    // El secuencial de la factura no pagable no aparece en NINGUNA celda.
    const secuenciales = Object.keys(s)
      .filter((k) => !k.startsWith("!"))
      .map((k) => s[k].v);
    expect(secuenciales).not.toContain("11-000002995");

    // El total sigue siendo la base del RPC (quitar filas de $0 no la mueve) y
    // coincide con la suma de las filas que SÍ quedaron.
    expect(s["E8"].t).toBe("n");
    expect(s["E8"].v).toBe(800);
    expect(Number(s["E6"].v) + Number(s["E7"].v)).toBe(800);
    // CIERRE (15 sección · 16 ventas · 17 cobros · 18 total) intacto.
    expect(s["A18"].v).toBe("Comisión total");
    expect(s["D18"].v).toBe(6.5);
  });

  // Columna nueva de PANTALLA: cuánto comisiona cada línea. Es informativa —
  // el total pagado sale del RPC, que redondea la BASE, no cada documento.
  describe("comisionLinea (columna Comisión del modal)", () => {
    it("aporte × tasa a 2 decimales, con NC negativas y $0 en gris", () => {
      expect(comisionLinea(1000, 0.005)).toBe(5);
      expect(comisionLinea(-200, 0.005)).toBe(-1);
      expect(comisionLinea(0, 0.005)).toBe(0);
      expect(comisionLinea(5706, 0.01)).toBe(57.06);
      expect(comisionLinea(1234.56, 0.005)).toBe(6.17); // 6.1728 → 6.17
    });

    it("la suma de líneas puede diferir del total del RPC (por eso el pie NO la usa)", () => {
      const lineas = [12.345, 12.345];
      const tasa = 0.01;
      const sumaLineas = lineas.reduce((s, n) => s + comisionLinea(n, tasa), 0);
      const base = lineas.reduce((s, n) => s + n, 0); // 24.69
      const totalRpc = Math.round(base * tasa * 100) / 100; // ROUND(0.2469) = 0.25
      expect(sumaLineas).toBeCloseTo(0.24, 2);
      expect(totalRpc).toBe(0.25);
      expect(sumaLineas).not.toBe(totalRpc);
    });
  });

  it("comisiones resumen por empresa", async () => {
    const r: ComisionResumen = {
      empresaKey: "fashion_wear",
      empresaNombre: "Fashion Wear",
      year: 2026,
      mes: 6,
      vendedores: [
        { vendedor: "Ana", base: 100, comision: 1, base_cobro: 50, comision_cobro: 0.5, comision_total: 1.5 },
        { vendedor: "Luis", base: 200, comision: 2, base_cobro: 80, comision_cobro: 0.8, comision_total: 2.8 },
      ],
    };

    const ws = await buildComisionesResumenSheet(r);
    const wb = roundtrip([{ name: "Comisiones", ws }]);
    const s = wb.Sheets["Comisiones"];

    expect(s[`A${HDR}`].v).toBe("Vendedor");
    expect(s[`F${HDR}`].v).toBe("Com. Total");
    expect(s[`B${DATA}`].t).toBe("n");
    expect(s[`B${DATA}`].z).toBe(MONEY_FMT);
    const tr = totalsRow(2);
    expect(s[`A${tr}`].v).toBe("Total");
    expect(s[`B${tr}`].v).toBe(300);
    expect(s[`F${tr}`].t).toBe("n");
    expect(s[`F${tr}`].v).toBeCloseTo(4.3);
  });

  it("comisiones consolidado (todas las empresas)", async () => {
    const c: ComisionConsolidado = {
      year: 2026,
      mes: 6,
      empresas: [
        { key: "fashion_wear", nombre: "Fashion Wear" },
        { key: "vistana", nombre: "Vistana" },
      ],
      vendedores: [{ vendedor: "Ana", porEmpresa: { fashion_wear: 10, vistana: 5 }, total: 15 }],
      sinAsignar: { vendedor: "DEFAULT", porEmpresa: { fashion_wear: 2 }, total: 2 },
    };

    const ws = await buildComisionesConsolidadoSheet(c);
    const wb = roundtrip([{ name: "Consolidado", ws }]);
    const s = wb.Sheets["Consolidado"];

    expect(s[`A${HDR}`].v).toBe("Vendedor");
    expect(s[`B${HDR}`].v).toBe("Fashion Wear");
    expect(s[`D${HDR}`].v).toBe("Total");
    expect(s[`B${DATA}`].t).toBe("n");
    expect(s[`B${DATA}`].v).toBe(10);
    expect(s[`B${DATA}`].z).toBe(MONEY_FMT);
    expect(s[`A${DATA + 1}`].v).toBe("Sin asignar");
    const tr = totalsRow(2);
    expect(s[`A${tr}`].v).toBe("Total");
    expect(s[`B${tr}`].v).toBe(12);
    expect(s[`D${tr}`].v).toBe(17);
  });

  it("utilidad por cliente", async () => {
    const resp: UtilidadClienteResponse = {
      year: 2026,
      // Las SEIS de Fashion Group. El título las cuenta de acá: antes decía "5"
      // escrito a mano mientras la RPC llevaba cinco empresas adentro del SQL
      // con joystep afuera — dos copias de la misma lista, mintiendo juntas.
      empresas: ["vistana", "fashion_wear", "fashion_shoes", "active_shoes", "active_wear", "joystep"],
      totales: { ventas: 1000, costo: 700, utilidad: 300, margen: 0.3 },
      rows: [
        {
          clienteSwitchId: 1, cliente: "Cliente X", empresaKey: "fashion_wear", empresa: "Fashion Wear",
          nDocs: 3, ventas: 1000, costo: 700, utilidad: 300, margen: 0.3,
        },
      ],
    };

    const ws = await buildUtilidadSheet(resp);
    const wb = roundtrip([{ name: "Utilidad por cliente", ws }]);
    const s = wb.Sheets["Utilidad por cliente"];

    expect(s[`A${HDR}`].v).toBe("Cliente");
    expect(s[`D${HDR}`].v).toBe("Ventas");
    expect(s[`D${DATA}`].t).toBe("n");
    expect(s[`D${DATA}`].v).toBe(1000);
    expect(s[`D${DATA}`].z).toBe(MONEY_FMT);
    const tr = totalsRow(1);
    expect(s[`A${tr}`].v).toBe("TOTAL");
    expect(s[`C${tr}`].v).toBe(3);
    expect(s[`F${tr}`].t).toBe("n");
    expect(s[`F${tr}`].v).toBe(300);
  });

  // ── 🔴 EL MARGEN QUE NO SE PUEDE CALCULAR VA VACÍO, NUNCA 0,0% ─────────────
  //
  // 🩸 En pantalla un cliente con venta ≤ 0 (devolución neta) muestra "—". El
  // Excel escribía `margen ?? 0`, o sea 0,0%: un margen REAL que se suma y se
  // promedia con los demás y baja el promedio sin que nadie lo note. Es la
  // MISMA regla que `precioPromedio` ya seguía en Productos.
  it("utilidad · el cliente sin margen calculable deja la celda VACÍA, no 0,0%", async () => {
    const resp: UtilidadClienteResponse = {
      year: 2026,
      empresas: ["vistana", "fashion_wear", "fashion_shoes", "active_shoes", "active_wear", "joystep"],
      totales: { ventas: 1000, costo: 700, utilidad: 300, margen: 0.3 },
      rows: [
        {
          clienteSwitchId: 1, cliente: "CLIENTE BUENO", empresaKey: "vistana", empresa: "Vistana",
          nDocs: 3, ventas: 1200, costo: 800, utilidad: 400, margen: 0.3333,
        },
        {
          // Devolvió más de lo que compró: la venta neta es negativa y el
          // margen no existe. En pantalla se lee "—".
          clienteSwitchId: 2, cliente: "CLIENTE DEVUELVE", empresaKey: "vistana", empresa: "Vistana",
          nDocs: 1, ventas: -200, costo: -100, utilidad: -100, margen: null,
        },
      ],
    };
    const s = roundtrip([{ name: "Utilidad por cliente", ws: await buildUtilidadSheet(resp) }])
      .Sheets["Utilidad por cliente"];
    expect(s[`G${HDR}`].v).toBe("Margen%");
    expect(s[`G${DATA}`].v).toBe(0.3333);         // el que SÍ tiene margen
    expect(s[`G${DATA + 1}`].v).toBe("");          // el que no: VACÍO, no 0
    expect(s[`G${DATA + 1}`].t).not.toBe("n");
  });

  it("utilidad · un TOTAL sin margen calculable también va vacío", async () => {
    const resp: UtilidadClienteResponse = {
      year: 2026,
      empresas: ["vistana"],
      totales: { ventas: -200, costo: -100, utilidad: -100, margen: null },
      rows: [{
        clienteSwitchId: 2, cliente: "CLIENTE DEVUELVE", empresaKey: "vistana", empresa: "Vistana",
        nDocs: 1, ventas: -200, costo: -100, utilidad: -100, margen: null,
      }],
    };
    const s = roundtrip([{ name: "Utilidad por cliente", ws: await buildUtilidadSheet(resp) }])
      .Sheets["Utilidad por cliente"];
    const tr = totalsRow(1);
    expect(s[`G${tr}`].v).toBe("");
  });

  it("productos · el grupo con devolución neta deja el margen VACÍO, no 0,0%", async () => {
    const resp: ProductosResponse = {
      empresa: "fashion_wear",
      year: 2026,
      mes: 6,
      periodo: "ytd",
      desde: "2026-06-01",
      hasta: "2026-06-30",
      meses: [6],
      totales: { venta: 500, costo: 300, margen: 0.4 },
      productos: [
        { descripcion: "CAMISA POLO", num_codigos: 2, cantidad: 10, venta: 500, costo: 300, margen: 0.4 },
        // Sin margen calculable: en pantalla se lee "—".
        { descripcion: "DEVUELTO", num_codigos: 1, cantidad: 0, venta: -40, costo: -20, margen: null },
      ],
    };
    const s = roundtrip([{ name: "Productos", ws: await buildProductosSheet(resp) }]).Sheets["Productos"];
    expect(s[`F${HDR}`].v).toBe("Margen%");
    expect(s[`F${DATA}`].v).toBe(0.4);
    expect(s[`F${DATA + 1}`].v).toBe("");
    expect(s[`F${DATA + 1}`].t).not.toBe("n");
  });

  it("productos · un TOTAL sin margen calculable también va vacío", async () => {
    const resp: ProductosResponse = {
      empresa: "fashion_wear", year: 2026, mes: 6, periodo: "ytd",
      desde: "2026-06-01", hasta: "2026-06-30", meses: [6],
      // Todo el período quedó en devolución neta: no hay margen que mostrar.
      totales: { venta: -40, costo: -20, margen: null },
      productos: [
        { descripcion: "DEVUELTO", num_codigos: 1, cantidad: 0, venta: -40, costo: -20, margen: null },
      ],
    };
    const s = roundtrip([{ name: "Productos", ws: await buildProductosSheet(resp) }]).Sheets["Productos"];
    const tr = totalsRow(1);
    expect(s[`F${tr}`].v).toBe("");
    expect(s[`F${tr}`].t).not.toBe("n");
  });

  it("productos", async () => {
    const resp: ProductosResponse = {
      empresa: "fashion_wear",
      year: 2026,
      mes: 6,
      desde: "2026-06-01",
      hasta: "2026-06-30",
      meses: [6],
      totales: { venta: 500, costo: 300, margen: 0.4 },
      productos: [
        { descripcion: "CAMISA POLO", num_codigos: 2, cantidad: 10, venta: 500, costo: 300, margen: 0.4 },
        // Devolución neta: sin unidades, el precio promedio NO existe.
        { descripcion: "DEVUELTO", num_codigos: 1, cantidad: 0, venta: 40, costo: 20, margen: 0.5 },
      ],
    };

    const ws = await buildProductosSheet(resp);
    const wb = roundtrip([{ name: "Productos", ws }]);
    const s = wb.Sheets["Productos"];

    expect(s[`A${HDR}`].v).toBe("Descripción");
    expect(s[`D${HDR}`].v).toBe("Venta");
    expect(s[`D${DATA}`].t).toBe("n");
    expect(s[`D${DATA}`].v).toBe(500);
    expect(s[`D${DATA}`].z).toBe(MONEY_FMT);
    // Precio prom.: número de verdad (no texto), con formato de plata.
    expect(s[`E${HDR}`].v).toBe("Precio prom.");
    expect(s[`E${DATA}`].t).toBe("n");
    expect(s[`E${DATA}`].v).toBe(50);
    expect(s[`E${DATA}`].z).toBe(MONEY_FMT);
    // Sin unidades netas la celda va VACÍA: un 0 se promedia y se suma.
    expect(s[`E${DATA + 1}`].v).toBe("");
    expect(s[`F${HDR}`].v).toBe("Margen%");
    const tr = totalsRow(2);
    expect(s[`A${tr}`].v).toBe("TOTAL");
    expect(s[`C${tr}`].v).toBe(10);
    expect(s[`D${tr}`].v).toBe(500);
    expect(s[`E${tr}`].v).toBe(50); // 500 / 10
  });

  // 🔴 EL PERÍODO LO DICE EL NOMBRE DEL ARCHIVO, y por eso el título se pudo
  // ir: `productos-fashion_wear-12m-2026.xlsx` guardado en una carpeta sigue
  // diciendo de qué es. Antes lo decían el título Y el archivo; se quedó el
  // que sobrevive a que alguien copie el archivo a otro lado.
  it("productos · el NOMBRE DEL ARCHIVO dice qué período es", () => {
    expect(periodoSlug(null, "12m")).toBe("12m");   // productos-fashion_wear-12m-2026.xlsx
    expect(periodoSlug(6, "ytd")).toBe("06");        // productos-fashion_wear-06-2026.xlsx
    expect(periodoSlug(null, "ytd")).toBe("ytd");    // productos-fashion_wear-ytd-2026.xlsx
  });
});

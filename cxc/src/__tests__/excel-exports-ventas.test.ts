// Tests de los exports Excel de la familia Ventas/Comisiones migrados al
// estilo de la casa (buildReportSheet, hallazgo I11). Cada build* es puro
// (sin DOM); aquí se construye el sheet con fixtures mínimos, se hace
// write→read roundtrip y se verifica: título en A1, headers, celdas de
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
  type ComisionDetalle,
  type ComisionResumen,
  type ComisionConsolidado,
} from "@/lib/ventas/comisionExcel";
import { buildUtilidadSheet, type UtilidadClienteResponse } from "@/lib/ventas/utilidad-cliente";
import { buildProductosSheet, type ProductosResponse } from "@/lib/ventas/productos";
import type { VentasResumen } from "@/components/ventas/types";

// write→read roundtrip: lo que asserteamos es lo que Excel realmente abre.
function roundtrip(sheets: { name: string; ws: XLSX.WorkSheet }[]): XLSX.WorkBook {
  const wb = workbookFromSheets(sheets);
  const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  return XLSX.read(buf, { type: "array", cellNF: true });
}

// Layout de buildReportSheet con subtítulo:
// r0 título · r1 subtítulo · r2 separador · r3 headers · r4.. data ·
// (spacer) · totales. Con N filas de data, totales = fila 4+N+1 (0-based).
const HDR = 4; // fila 1-based de headers
const DATA = 5; // primera fila 1-based de data
function totalsRow(nDataRows: number): number {
  return DATA + nDataRows + 1; // 1-based
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

    expect(s["A1"].v).toBe("FASHION GROUP — Ventas 2026");
    expect(String(s["A2"].v)).toContain("Data actualizada al");
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

    // VENTAS
    expect(s["A4"].v).toBe("VENTAS");
    expect(s["A5"].v).toBe("Fecha");
    expect(s["D5"].v).toBe("Subtotal");
    expect(s["D6"].t).toBe("n");
    expect(s["D6"].v).toBe(500);
    expect(s["D6"].z).toBe(MONEY_FMT);
    expect(s["E6"].v).toBeCloseTo(0.25); // % utilidad como fracción
    expect(s["C7"].v).toBe("Total ventas");
    expect(s["D7"].t).toBe("n");
    expect(s["D7"].v).toBe(500);

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

    expect(s["A1"].v).toBe("Comisiones — Fashion Wear");
    expect(String(s["A2"].v)).toContain("Junio 2026");
    expect(String(s["A2"].v)).toContain("Venta: facturas con utilidad >20%");
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

    expect(s["A1"].v).toBe("Comisiones — Todas las empresas");
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

    expect(s["A1"].v).toBe("FASHION GROUP — Utilidad por cliente · 2026 · 5 empresas B2B");
    expect(String(s["A2"].v)).toContain("Margen 30.0%");
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
      ],
    };

    const ws = await buildProductosSheet(resp);
    const wb = roundtrip([{ name: "Productos", ws }]);
    const s = wb.Sheets["Productos"];

    expect(s["A1"].v).toBe("FASHION GROUP — Productos · Fashion Wear · Jun 2026");
    expect(String(s["A2"].v)).toContain("Venta total $500.00");
    expect(s[`A${HDR}`].v).toBe("Descripción");
    expect(s[`D${HDR}`].v).toBe("Venta");
    expect(s[`D${DATA}`].t).toBe("n");
    expect(s[`D${DATA}`].v).toBe(500);
    expect(s[`D${DATA}`].z).toBe(MONEY_FMT);
    const tr = totalsRow(1);
    expect(s[`A${tr}`].v).toBe("TOTAL");
    expect(s[`C${tr}`].v).toBe(10);
    expect(s[`D${tr}`].v).toBe(500);
  });
});

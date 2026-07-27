import { describe, it, expect } from "vitest";
import XLSX from "xlsx-js-style";
import { workbookFromSheets } from "@/lib/excel-export";
import { buildGuiasSheet } from "@/app/guias/components/excel-guias";
import { buildProveedoresSheet } from "@/app/proveedores/excel-proveedores";
import { buildChequesSheet } from "@/app/cheques/excel-cheques";
import type { Guia } from "@/app/guias/components/types";
import type { ProveedorExportRow } from "@/app/proveedores/excel-proveedores";
import type { ChequeExportRow } from "@/app/cheques/excel-cheques";

// Round-trip: construir la hoja → escribir a buffer → RE-leer con XLSX.read.
// Valida que los builds puros (sin DOM) produzcan workbooks reales con el
// layout estándar del helper: título en A1, subtítulo, separador, headers en
// fila 4 y números como t:"n" (no strings "$1,234.56").
function roundTrip(name: string, ws: XLSX.WorkSheet): XLSX.WorkSheet {
  const wb = workbookFromSheets([{ name, ws }]);
  const buf = XLSX.write(wb, { bookType: "xlsx", type: "buffer" });
  // cellNF:true para que la lectura conserve el numFmt (.z) de las celdas
  const read = XLSX.read(buf, { type: "buffer", cellNF: true });
  expect(read.SheetNames).toEqual([name]);
  return read.Sheets[name];
}

describe("excel-guias — buildGuiasSheet", () => {
  const guias: Guia[] = [
    {
      id: "1", numero: 7, fecha: "2026-07-01", transportista: "Trans Uno",
      placa: "", observaciones: "", total_bultos: 5, item_count: 1, monto_total: 0,
      estado: "Completada", numero_guia_transp: "TX-99",
      guia_items: [{ orden: 1, cliente: "Cliente A", direccion: "", empresa: "Fashion Wear", facturas: "F-1", bultos: 5, numero_guia_transp: "" }],
    },
    {
      id: "2", numero: 8, fecha: "2026-07-02", transportista: "Trans Dos",
      placa: "", observaciones: "", total_bultos: 3, item_count: 1, monto_total: 0,
      estado: "Pendiente Bodega", numero_guia_transp: "",
      guia_items: [{ orden: 1, cliente: "Cliente B", direccion: "", empresa: "Vistana", facturas: "F-2", bultos: 3, numero_guia_transp: "" }],
    },
  ];

  it("round-trip: hoja, título, subtítulo, headers y bultos numéricos", () => {
    const ws = roundTrip("Guías", buildGuiasSheet(guias, "Filtro de prueba"));

    expect(ws.A1.v).toBe("FASHION GROUP — Guías de Transporte");
    expect(ws.A2.v).toBe("Filtro de prueba");
    // Headers en fila 4 (título/subtítulo/separador arriba)
    expect(ws.A4.v).toBe("N° Guía");
    expect(ws.G4.v).toBe("Bultos");
    expect(ws.I4.v).toBe("N° Guía Transp.");
    // Datos
    expect(ws.A5.v).toBe("GT-007");
    expect(ws.B5.v).toBe("01/07/2026");
    expect(ws.H5.v).toBe("Completada");
    // Bultos como número real
    expect(ws.G5.t).toBe("n");
    expect(ws.G5.v).toBe(5);
    // Fila de totales (fila 4 headers + 2 datos + espaciador → fila 8)
    expect(ws.A8.v).toBe("2 guías");
    expect(ws.G8.t).toBe("n");
    expect(ws.G8.v).toBe(8);
  });

  it("subtitle default = Todas las guías", () => {
    const ws = roundTrip("Guías", buildGuiasSheet(guias));
    expect(ws.A2.v).toBe("Todas las guías");
  });
});

describe("excel-proveedores — buildProveedoresSheet", () => {
  const rows: ProveedorExportRow[] = [
    { nombre: "Proveedor Uno", aging_current: 200, aging_watch: 50, aging_overdue: 0, saldo_total: 250, ultimo_pago_dias: 12, empresas_count: 2 },
    { nombre: "Proveedor Dos", aging_current: 0, aging_watch: 0, aging_overdue: 75.25, saldo_total: 75.25, ultimo_pago_dias: null, empresas_count: 1 },
  ];

  it("round-trip: hoja, título, headers y moneda como número", () => {
    const ws = roundTrip("Proveedores", buildProveedoresSheet(rows, "Todo el grupo — 2 proveedores"));

    expect(ws.A1.v).toBe("FASHION GROUP — Proveedores (Cuentas por Pagar)");
    expect(ws.A2.v).toBe("Todo el grupo — 2 proveedores");
    expect(ws.A4.v).toBe("Proveedor");
    // "Comprado YTD" ERA la columna B y se ELIMINÓ (27-jul-2026): el ledger de
    // Switch solo trae lo que todavía se debe. Ahora B es el primer tramo de aging.
    expect(ws.B4.v).toBe("0-90d");
    expect(ws.E4.v).toBe("Por pagar");
    // Moneda: número real con numFmt, no string
    expect(ws.B5.t).toBe("n");
    expect(ws.B5.v).toBe(200);
    expect(ws.B5.z).toBe("$#,##0.00");
    // Último pago: string; null → "—"
    expect(ws.F5.v).toBe("hace 12d");
    expect(ws.F6.v).toBe("—");
    // Totales en fila 8 (headers 4 + 2 datos + espaciador)
    expect(ws.A8.v).toBe("2 proveedores");
    expect(ws.B8.t).toBe("n");
    expect(ws.B8.v).toBeCloseTo(200, 2);
    expect(ws.E8.v).toBeCloseTo(325.25, 2);
    // Candado: ni un encabezado con "YTD" en toda la fila 4.
    for (const col of ["A", "B", "C", "D", "E", "F", "G"]) {
      expect(String(ws[`${col}4`]?.v ?? "")).not.toMatch(/YTD/i);
    }
  });

  it("subtitle default = Todo el grupo", () => {
    const ws = roundTrip("Proveedores", buildProveedoresSheet(rows));
    expect(ws.A2.v).toBe("Todo el grupo");
  });
});

describe("excel-cheques — buildChequesSheet", () => {
  const cheques: ChequeExportRow[] = [
    { cliente: "Cliente X", numero_cheque: "1001", monto: 350.75, fecha_deposito: "2026-07-10", vendedor: "Ana" },
    { cliente: "Cliente Y", numero_cheque: "1002", monto: 120, fecha_deposito: "2026-07-11", vendedor: "" },
    { cliente: "Cliente Z", numero_cheque: "1003", monto: 80.5, fecha_deposito: "2026-07-12", vendedor: "Luis" },
  ];

  it("round-trip: nombre de hoja capitalizado, título, headers y monto numérico", () => {
    const built = buildChequesSheet(cheques, "vencen hoy");
    expect(built.sheetName).toBe("Vencen hoy");
    const ws = roundTrip(built.sheetName, built.ws);

    expect(ws.A1.v).toBe("FASHION GROUP — Cheques");
    // Subtítulo nuevo (banda MID): el filtro aplicado
    expect(ws.A2.v).toBe("Vencen hoy");
    expect(ws.A4.v).toBe("Cliente");
    expect(ws.C4.v).toBe("Monto");
    expect(ws.E4.v).toBe("Vendedor");
    // Datos + moneda como número
    expect(ws.A5.v).toBe("Cliente X");
    expect(ws.C5.t).toBe("n");
    expect(ws.C5.v).toBe(350.75);
    expect(ws.C5.z).toBe("$#,##0.00");
    // Totales en fila 9 (headers 4 + 3 datos + espaciador)
    expect(ws.A9.v).toBe("3 cheques");
    expect(ws.C9.t).toBe("n");
    expect(ws.C9.v).toBeCloseTo(551.25, 2);
  });
});

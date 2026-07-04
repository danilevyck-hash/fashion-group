// Tests del export Excel de catálogos (I11): workbook compartido de pedidos
// (Reebok/Joybees) + sheet "sin foto" del admin Reebok, ambos con la
// estructura estándar del helper y el navy de marca REEBOK_PALETTE (1A2656).
//
// Los estilos se asserten sobre el worksheet EN MEMORIA (antes de write):
// xlsx-js-style no siempre preserva los estilos en el read de vuelta.

import { describe, it, expect } from "vitest";
import XLSX from "xlsx-js-style";
import { buildPedidosWorkbook, type PedidoExportRow } from "../lib/catalogos/pedidos-excel";
import { buildReebokSinFotoWorkbook } from "../lib/catalogos/sinfoto-excel";
import { MONEY_FMT, REEBOK_PALETTE } from "../lib/excel-export";

const A = (r: number, c: number) => XLSX.utils.encode_cell({ r, c });

const NAVY = REEBOK_PALETTE.pri; // 1A2656

// Fixture: 2 pedidos con items (uno del link con datos completos, uno mío sin cliente).
const PEDIDOS: PedidoExportRow[] = [
  {
    origen: "link",
    cliente: "Almacén La Rebaja",
    vendor: "Edwin",
    item_count: 3,
    total: 1234.56,
    created_at: "2026-07-01T14:30:00.000Z",
  },
  {
    origen: "mio",
    cliente: null,
    vendor: null,
    item_count: 1,
    total: 100,
    created_at: "2026-07-02T10:00:00.000Z",
  },
];

// Layout estándar de buildReportSheet con subtítulo:
// r0 título · r1 subtítulo · r2 sep · r3 headers · r4.. datos · spacer · totales
const HDR_ROW = 3;
const DATA_ROW = 4;

describe("buildPedidosWorkbook — Reebok (con Origen)", () => {
  const wb = buildPedidosWorkbook({ titulo: "REEBOK — Pedidos", conOrigen: true, pedidos: PEDIDOS });
  const ws = wb.Sheets["Pedidos"];

  it("hoja única 'Pedidos' con título en banda navy 1A2656", () => {
    expect(wb.SheetNames).toEqual(["Pedidos"]);
    expect(ws[A(0, 0)].v).toBe("REEBOK — Pedidos");
    expect(ws[A(0, 0)].s.fill.fgColor.rgb).toBe(NAVY);
  });

  it("headers correctos con fill navy 1A2656", () => {
    const headers = ["Origen", "Cliente", "Vendedor", "Items", "Total", "Fecha"];
    headers.forEach((h, c) => {
      expect(ws[A(HDR_ROW, c)].v).toBe(h);
      expect(ws[A(HDR_ROW, c)].s.fill.fgColor.rgb).toBe(NAVY);
    });
  });

  it("datos: origen legible, 'Sin nombre' para cliente null, fecha dd/mm/yyyy", () => {
    expect(ws[A(DATA_ROW, 0)].v).toBe("Del link");
    expect(ws[A(DATA_ROW, 1)].v).toBe("Almacén La Rebaja");
    expect(ws[A(DATA_ROW, 5)].v).toBe("01/07/2026");
    expect(ws[A(DATA_ROW + 1, 0)].v).toBe("Mío");
    expect(ws[A(DATA_ROW + 1, 1)].v).toBe("Sin nombre");
  });

  it("moneda como número real con MONEY_FMT y cantidades con z '0'", () => {
    const money = ws[A(DATA_ROW, 4)];
    expect(money.t).toBe("n");
    expect(typeof money.v).toBe("number");
    expect(money.v).toBeCloseTo(1234.56, 2);
    expect(money.z).toBe(MONEY_FMT);

    const items = ws[A(DATA_ROW, 3)];
    expect(items.t).toBe("n");
    expect(items.v).toBe(3);
    expect(items.z).toBe("0");
  });

  it("fila de totales en banda navy 1A2656 (no gris) con la suma correcta", () => {
    // r4-r5 datos, r6 espaciador, r7 totales
    const totRow = DATA_ROW + PEDIDOS.length + 1;
    const label = ws[A(totRow, 3)];
    const total = ws[A(totRow, 4)];
    expect(label.v).toBe("TOTAL");
    expect(label.s.fill.fgColor.rgb).toBe(NAVY);
    expect(total.t).toBe("n");
    expect(total.v).toBeCloseTo(1334.56, 2);
    expect(total.z).toBe(MONEY_FMT);
    expect(total.s.fill.fgColor.rgb).toBe(NAVY);
  });

  it("sobrevive el roundtrip write → read con datos intactos", () => {
    const buf = XLSX.write(wb, { bookType: "xlsx", type: "buffer" });
    const rb = XLSX.read(buf, { type: "buffer" });
    expect(rb.SheetNames).toEqual(["Pedidos"]);
    const rws = rb.Sheets["Pedidos"];
    expect(rws[A(0, 0)].v).toBe("REEBOK — Pedidos");
    expect(rws[A(HDR_ROW, 1)].v).toBe("Cliente");
    expect(rws[A(DATA_ROW, 4)].t).toBe("n");
    expect(rws[A(DATA_ROW, 4)].v).toBeCloseTo(1234.56, 2);
    const totRow = DATA_ROW + PEDIDOS.length + 1;
    expect(rws[A(totRow, 4)].v).toBeCloseTo(1334.56, 2);
  });
});

describe("buildPedidosWorkbook — Joybees (sin Origen)", () => {
  const pedidos: PedidoExportRow[] = PEDIDOS.map(({ origen: _o, ...p }) => p);
  const wb = buildPedidosWorkbook({ titulo: "JOYBEES — Pedidos", conOrigen: false, pedidos });
  const ws = wb.Sheets["Pedidos"];

  it("mismo layout compartido, título propio y 5 columnas (sin Origen)", () => {
    expect(ws[A(0, 0)].v).toBe("JOYBEES — Pedidos");
    expect(ws[A(0, 0)].s.fill.fgColor.rgb).toBe(NAVY);
    const headers = ["Cliente", "Vendedor", "Items", "Total", "Fecha"];
    headers.forEach((h, c) => {
      expect(ws[A(HDR_ROW, c)].v).toBe(h);
      expect(ws[A(HDR_ROW, c)].s.fill.fgColor.rgb).toBe(NAVY);
    });
    expect(ws[A(HDR_ROW, 5)]).toBeUndefined();
  });

  it("moneda numérica y total en banda navy", () => {
    expect(ws[A(DATA_ROW, 3)].t).toBe("n");
    expect(ws[A(DATA_ROW, 3)].z).toBe(MONEY_FMT);
    const totRow = DATA_ROW + pedidos.length + 1;
    expect(ws[A(totRow, 3)].v).toBeCloseTo(1334.56, 2);
    expect(ws[A(totRow, 3)].s.fill.fgColor.rgb).toBe(NAVY);
  });
});

describe("buildReebokSinFotoWorkbook — export 'sin foto' del admin", () => {
  const wb = buildReebokSinFotoWorkbook([
    { sku: "100074688", nombre: "CLASSIC LEATHER", categoria: "Footwear", disponible: 24, existencia: 30 },
    { sku: "100032959", nombre: "GORRA ACTIVE", categoria: "Accessories", disponible: "", existencia: "" },
  ]);
  const ws = wb.Sheets["Sin foto"];

  it("hoja 'Sin foto' con estructura completa: título navy + headers navy", () => {
    expect(wb.SheetNames).toEqual(["Sin foto"]);
    expect(ws[A(0, 0)].v).toBe("REEBOK — Productos sin foto");
    expect(ws[A(0, 0)].s.fill.fgColor.rgb).toBe(NAVY);
    const headers = ["Código", "Descripción", "Categoría", "Disponible", "Existencia"];
    headers.forEach((h, c) => {
      expect(ws[A(HDR_ROW, c)].v).toBe(h);
      expect(ws[A(HDR_ROW, c)].s.fill.fgColor.rgb).toBe(NAVY);
    });
  });

  it("mismas columnas/datos: cantidades numéricas z '0' y vacíos como texto", () => {
    expect(ws[A(DATA_ROW, 0)].v).toBe("100074688");
    expect(ws[A(DATA_ROW, 3)].t).toBe("n");
    expect(ws[A(DATA_ROW, 3)].v).toBe(24);
    expect(ws[A(DATA_ROW, 3)].z).toBe("0");
    expect(ws[A(DATA_ROW + 1, 3)].t).toBe("s");
    expect(ws[A(DATA_ROW + 1, 3)].v).toBe("");
  });

  it("sobrevive el roundtrip write → read", () => {
    const buf = XLSX.write(wb, { bookType: "xlsx", type: "buffer" });
    const rb = XLSX.read(buf, { type: "buffer" });
    const rws = rb.Sheets["Sin foto"];
    expect(rws[A(0, 0)].v).toBe("REEBOK — Productos sin foto");
    expect(rws[A(DATA_ROW, 3)].t).toBe("n");
    expect(rws[A(DATA_ROW, 3)].v).toBe(24);
  });
});

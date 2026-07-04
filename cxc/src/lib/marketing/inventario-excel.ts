// ============================================================================
// Marketing — Excel export del módulo de inventario (por marca)
// ============================================================================
// Registro de gastos (jun 2026): se retiró el reparto 50/50 marca↔empresa
// (FW/Vistana). El Excel ahora muestra:
//   - Hoja 1 "Resumen": 1 fila por tienda con Total Paneles + monto (100%) por
//     marca (columnas dinámicas), fila TOTAL al pie.
//   - Hojas 2..N: una hoja por tienda con detalle por producto (Cantidad,
//     Precio unit, Total) + fila TOTAL.
// ============================================================================

import XLSX from "xlsx-js-style";
import { CASA_PALETTE, MONEY_FMT } from "@/lib/excel-export";
import type {
  EntregaConItems,
  MkInventarioProducto,
  MkMarca,
  MkProyecto,
} from "./types";
import { resumirPorTienda, type FilaResumenTienda } from "./inventario-resumen";

// ---- Estilos compartidos (estilo de la casa I11: navy + Calibri) ----
const BORDER_CASA = {
  top: { style: "thin", color: { rgb: CASA_PALETTE.brd } },
  bottom: { style: "thin", color: { rgb: CASA_PALETTE.brd } },
  left: { style: "thin", color: { rgb: CASA_PALETTE.brd } },
  right: { style: "thin", color: { rgb: CASA_PALETTE.brd } },
};

const HEADER_STYLE = {
  font: { bold: true, color: { rgb: "FFFFFF" }, sz: 10, name: "Calibri" },
  fill: { patternType: "solid", fgColor: { rgb: CASA_PALETTE.pri } },
  alignment: { horizontal: "center", vertical: "center", wrapText: true },
  border: BORDER_CASA,
};

// Fila de totales: banda PRI blanca bold (igual que `tot` del helper).
const TOTAL_STYLE = {
  font: { bold: true, sz: 10, color: { rgb: "FFFFFF" }, name: "Calibri" },
  fill: { patternType: "solid", fgColor: { rgb: CASA_PALETTE.pri } },
  alignment: { vertical: "center" },
  border: BORDER_CASA,
};

function sanitizeSheetName(s: string): string {
  const cleaned = (s || "Hoja").replace(/[\\/:*?[\]]/g, " ").trim();
  return cleaned.slice(0, 31) || "Hoja";
}

function applyStyleToRow(
  ws: XLSX.WorkSheet,
  rowIdx: number,
  cols: number,
  style: Record<string, unknown>,
): void {
  for (let c = 0; c < cols; c++) {
    const addr = XLSX.utils.encode_cell({ r: rowIdx, c });
    const cell = (ws as Record<string, unknown>)[addr] as
      | { s?: unknown }
      | undefined;
    if (cell) cell.s = style;
  }
}

function applyMoneyFmt(
  ws: XLSX.WorkSheet,
  rowStart: number,
  rowEnd: number,
  cols: number[],
): void {
  for (let r = rowStart; r <= rowEnd; r++) {
    for (const c of cols) {
      const addr = XLSX.utils.encode_cell({ r, c });
      const cell = (ws as Record<string, unknown>)[addr] as
        | { t?: string; z?: string }
        | undefined;
      if (cell) {
        cell.t = "n";
        cell.z = MONEY_FMT;
      }
    }
  }
}

// Reemplaza ceros por "—" para consistencia visual.
function setDashOrNumber(
  ws: XLSX.WorkSheet,
  r: number,
  c: number,
  value: number,
  isMoney: boolean,
): void {
  const addr = XLSX.utils.encode_cell({ r, c });
  if (value === 0 || !Number.isFinite(value)) {
    (ws as Record<string, unknown>)[addr] = {
      t: "s",
      v: "—",
      s: { alignment: { horizontal: "center" }, font: { color: { rgb: "9E9E9E" }, name: "Calibri", sz: 10 } },
    };
  } else {
    const cellSpec: { t: "n"; v: number; z?: string } = { t: "n", v: value };
    if (isMoney) cellSpec.z = MONEY_FMT;
    (ws as Record<string, unknown>)[addr] = cellSpec;
  }
}

// ---- Hoja Resumen (Cliente | Total Paneles | $ por marca | Total $) ----
function hojaResumen(
  filas: ReadonlyArray<FilaResumenTienda>,
  marcas: ReadonlyArray<MkMarca>,
): XLSX.WorkSheet {
  const header = [
    "Cliente",
    "Total Paneles",
    ...marcas.map((m) => `$ ${m.nombre}`),
    "Total $",
  ];
  const nCols = header.length;
  const totalCol = nCols - 1;
  const marcaCols = marcas.map((_, i) => 2 + i);

  const aoa: (string | number)[][] = [header];
  for (const f of filas) {
    aoa.push([
      f.tienda,
      f.totalPaneles,
      ...marcas.map((m) => f.montoPorMarca[m.id] ?? 0),
      f.totalMonto,
    ]);
  }
  // Fila TOTAL
  const totalPaneles = filas.reduce((s, f) => s + f.totalPaneles, 0);
  const totalPorMarca = marcas.map((m) =>
    filas.reduce((s, f) => s + (f.montoPorMarca[m.id] ?? 0), 0),
  );
  const totalGeneral = filas.reduce((s, f) => s + f.totalMonto, 0);
  aoa.push(["TOTAL", totalPaneles, ...totalPorMarca, totalGeneral]);

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [
    { wch: 28 },
    { wch: 14 },
    ...marcas.map(() => ({ wch: 16 })),
    { wch: 14 },
  ];
  applyStyleToRow(ws, 0, nCols, HEADER_STYLE);

  // Filas de tiendas: paneles (no money), montos por marca + total (money).
  for (let r = 1; r <= filas.length; r++) {
    const f = filas[r - 1];
    setDashOrNumber(ws, r, 1, f.totalPaneles, false);
    marcas.forEach((m, i) => {
      setDashOrNumber(ws, r, marcaCols[i], f.montoPorMarca[m.id] ?? 0, true);
    });
    setDashOrNumber(ws, r, totalCol, f.totalMonto, true);
  }
  applyMoneyFmt(ws, 1, filas.length, [...marcaCols, totalCol]);

  // Fila TOTAL en banda PRI (estilo de la casa).
  applyStyleToRow(ws, aoa.length - 1, nCols, TOTAL_STYLE);
  applyMoneyFmt(ws, aoa.length - 1, aoa.length - 1, [...marcaCols, totalCol]);

  ws["!freeze"] = { xSplit: 0, ySplit: 1 } as unknown as Record<
    string,
    unknown
  >;
  return ws;
}

// ---- Hoja por tienda: detalle por producto ----
interface FilaDetalleProducto {
  productoNombre: string;
  cantidad: number;
  precioUnitario: number;
  total: number;
}

function hojaTiendaDetalle(
  tienda: string,
  filas: ReadonlyArray<FilaDetalleProducto>,
): XLSX.WorkSheet {
  const header = ["Producto", "Cantidad", "Precio unit", "Total"];
  const aoa: (string | number)[][] = [header];
  for (const f of filas) {
    aoa.push([f.productoNombre, f.cantidad, f.precioUnitario, f.total]);
  }
  const totalCant = filas.reduce((s, f) => s + f.cantidad, 0);
  const totalTotal = filas.reduce((s, f) => s + f.total, 0);
  aoa.push(["TOTAL", totalCant, "", totalTotal]);

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [{ wch: 24 }, { wch: 12 }, { wch: 14 }, { wch: 14 }];
  applyStyleToRow(ws, 0, header.length, HEADER_STYLE);

  for (let r = 1; r <= filas.length; r++) {
    const f = filas[r - 1];
    const addrPrecio = XLSX.utils.encode_cell({ r, c: 2 });
    (ws as Record<string, unknown>)[addrPrecio] = {
      t: "n",
      v: f.precioUnitario,
      z: MONEY_FMT,
    };
    const addrTotal = XLSX.utils.encode_cell({ r, c: 3 });
    (ws as Record<string, unknown>)[addrTotal] = {
      t: "n",
      v: f.total,
      z: MONEY_FMT,
    };
  }
  applyMoneyFmt(ws, 1, filas.length, [2, 3]);

  applyStyleToRow(ws, aoa.length - 1, header.length, TOTAL_STYLE);
  applyMoneyFmt(ws, aoa.length - 1, aoa.length - 1, [3]);

  ws["!freeze"] = { xSplit: 0, ySplit: 1 } as unknown as Record<
    string,
    unknown
  >;

  void tienda;
  return ws;
}

// ---- Construir filas de detalle a partir de una tienda y sus entregas ----
function detalleProductosDeTienda(
  entregas: ReadonlyArray<EntregaConItems>,
  productos: ReadonlyArray<MkInventarioProducto>,
): FilaDetalleProducto[] {
  const productoById = new Map(productos.map((p) => [p.id, p]));
  const acum = new Map<
    string,
    { nombre: string; cantidad: number; precio: number }
  >();
  for (const e of entregas) {
    for (const it of e.items) {
      const prod = productoById.get(it.producto_id);
      if (!prod) continue;
      const existing = acum.get(it.producto_id) ?? {
        nombre: prod.nombre,
        cantidad: 0,
        precio: Number(it.precio_unitario ?? prod.precio),
      };
      let unidades = 0;
      for (const v of Object.values(it.cantidad_por_marca ?? {})) {
        unidades += Number(v ?? 0);
      }
      existing.cantidad += unidades;
      acum.set(it.producto_id, existing);
    }
  }
  const filas: FilaDetalleProducto[] = [];
  for (const v of acum.values()) {
    if (v.cantidad <= 0) continue;
    filas.push({
      productoNombre: v.nombre,
      cantidad: v.cantidad,
      precioUnitario: v.precio,
      total: Math.round(v.cantidad * v.precio * 100) / 100,
    });
  }
  filas.sort((a, b) => a.productoNombre.localeCompare(b.productoNombre, "es"));
  return filas;
}

// ============================================================================
// API pública
// ============================================================================
export function exportarExcelGlobal(args: {
  productos: ReadonlyArray<MkInventarioProducto>;
  entregas: ReadonlyArray<EntregaConItems>;
  proyectos: ReadonlyArray<MkProyecto>;
  marcas: ReadonlyArray<MkMarca>;
}): Uint8Array {
  const { productos, entregas, proyectos, marcas } = args;
  const wb = XLSX.utils.book_new();

  const { filas: filasResumen, marcas: marcasUsadas } = resumirPorTienda(
    entregas,
    proyectos,
    productos,
    marcas,
  );
  XLSX.utils.book_append_sheet(
    wb,
    hojaResumen(filasResumen, marcasUsadas),
    "Resumen",
  );

  const usedNames = new Set<string>(["Resumen"]);
  for (const f of filasResumen) {
    if (f.entregas.length === 0) continue;
    const detalles = detalleProductosDeTienda(f.entregas, productos);
    if (detalles.length === 0) continue;
    let name = sanitizeSheetName(f.tienda);
    let i = 2;
    while (usedNames.has(name)) {
      const suffix = ` (${i++})`;
      name = sanitizeSheetName(f.tienda.slice(0, 31 - suffix.length) + suffix);
    }
    usedNames.add(name);
    XLSX.utils.book_append_sheet(wb, hojaTiendaDetalle(f.tienda, detalles), name);
  }

  return XLSX.write(wb, { bookType: "xlsx", type: "array" }) as Uint8Array;
}

export function exportarExcelTienda(args: {
  productos: ReadonlyArray<MkInventarioProducto>;
  entregas: ReadonlyArray<EntregaConItems>;
  proyecto: MkProyecto;
  marcas: ReadonlyArray<MkMarca>;
}): Uint8Array {
  const { productos, entregas, proyecto, marcas } = args;
  const wb = XLSX.utils.book_new();
  const { filas: filasResumen, marcas: marcasUsadas } = resumirPorTienda(
    entregas,
    [proyecto],
    productos,
    marcas,
  );

  XLSX.utils.book_append_sheet(
    wb,
    hojaResumen(filasResumen, marcasUsadas),
    "Resumen",
  );

  const fila = filasResumen[0];
  if (fila && fila.entregas.length > 0) {
    const detalles = detalleProductosDeTienda(fila.entregas, productos);
    if (detalles.length > 0) {
      const name = sanitizeSheetName(fila.tienda);
      XLSX.utils.book_append_sheet(wb, hojaTiendaDetalle(fila.tienda, detalles), name);
    }
  }
  return XLSX.write(wb, { bookType: "xlsx", type: "array" }) as Uint8Array;
}

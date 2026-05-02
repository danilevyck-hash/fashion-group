// ============================================================================
// Marketing — Excel export del módulo de inventario (formato changalo)
// ============================================================================
// Replica el changalo_muebles.xlsx histórico:
//   - Hoja 1 "Resumen": 1 fila por tienda con cantidades de Paneles y montos
//     repartidos entre Fashion Wear y Vistana, fila TOTAL al pie en amarillo.
//   - Hojas 2..N: una hoja por tienda con detalle por producto (Cant. FW,
//     Cant. Vistana, Precio unit, $ FW, $ Vistana, Total) + fila TOTAL.
// ============================================================================

import XLSX from "xlsx-js-style";
import type {
  EntregaConItems,
  MkInventarioProducto,
  MkProyecto,
} from "./types";
import { resumirPorTienda, type FilaResumenTienda } from "./inventario-resumen";

// ---- Estilos compartidos ----
const HEADER_STYLE = {
  font: { bold: true, color: { rgb: "FFFFFF" }, sz: 11 },
  fill: { patternType: "solid", fgColor: { rgb: "1F1F1F" } },
  alignment: { horizontal: "center", vertical: "center", wrapText: true },
  border: {
    top: { style: "thin", color: { rgb: "BFBFBF" } },
    bottom: { style: "thin", color: { rgb: "BFBFBF" } },
    left: { style: "thin", color: { rgb: "BFBFBF" } },
    right: { style: "thin", color: { rgb: "BFBFBF" } },
  },
};

const TOTAL_AMARILLO_STYLE = {
  font: { bold: true, sz: 11, color: { rgb: "000000" } },
  fill: { patternType: "solid", fgColor: { rgb: "FFE699" } },
  alignment: { vertical: "center" },
  border: {
    top: { style: "thin", color: { rgb: "BFBFBF" } },
    bottom: { style: "thin", color: { rgb: "BFBFBF" } },
    left: { style: "thin", color: { rgb: "BFBFBF" } },
    right: { style: "thin", color: { rgb: "BFBFBF" } },
  },
};

const TOTAL_GRIS_STYLE = {
  font: { bold: true, sz: 10 },
  fill: { patternType: "solid", fgColor: { rgb: "EFEFEF" } },
  alignment: { vertical: "center" },
  border: {
    top: { style: "thin", color: { rgb: "BFBFBF" } },
    bottom: { style: "thin", color: { rgb: "BFBFBF" } },
    left: { style: "thin", color: { rgb: "BFBFBF" } },
    right: { style: "thin", color: { rgb: "BFBFBF" } },
  },
};

const MONEY_FMT = '"$"#,##0.00';

function sanitizeSheetName(s: string): string {
  // Excel: max 31 chars, prohíbe \ / ? * [ ]
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

// Reemplaza ceros por "—" en celdas string. Mantiene los números cero como
// "—" string para que el Excel se vea consistente con el changalo original.
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
      s: { alignment: { horizontal: "center" }, font: { color: { rgb: "9E9E9E" } } },
    };
  } else {
    const cellSpec: { t: "n"; v: number; z?: string } = { t: "n", v: value };
    if (isMoney) cellSpec.z = MONEY_FMT;
    (ws as Record<string, unknown>)[addr] = cellSpec;
  }
}

// ---- Hoja Resumen ----
function hojaResumen(filas: ReadonlyArray<FilaResumenTienda>): XLSX.WorkSheet {
  const header = [
    "Cliente",
    "Paneles FW",
    "Paneles Vistana",
    "Total Paneles",
    "$ Fashion Wear",
    "$ Vistana",
    "Total $",
  ];
  const aoa: (string | number)[][] = [header];
  for (const f of filas) {
    aoa.push([
      f.tienda,
      f.panelesFW,
      f.panelesVistana,
      f.totalPaneles,
      f.montoFW,
      f.montoVistana,
      f.totalMonto,
    ]);
  }
  // Fila TOTAL
  const totalPanelesFW = filas.reduce((s, f) => s + f.panelesFW, 0);
  const totalPanelesV = filas.reduce((s, f) => s + f.panelesVistana, 0);
  const totalPanelesAll = filas.reduce((s, f) => s + f.totalPaneles, 0);
  const totalMontoFW = filas.reduce((s, f) => s + f.montoFW, 0);
  const totalMontoV = filas.reduce((s, f) => s + f.montoVistana, 0);
  const totalMontoAll = filas.reduce((s, f) => s + f.totalMonto, 0);
  aoa.push([
    "TOTAL",
    totalPanelesFW,
    totalPanelesV,
    totalPanelesAll,
    totalMontoFW,
    totalMontoV,
    totalMontoAll,
  ]);

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [
    { wch: 28 }, // Cliente
    { wch: 12 }, // Paneles FW
    { wch: 14 }, // Paneles Vistana
    { wch: 14 }, // Total Paneles
    { wch: 14 }, // $ FW
    { wch: 14 }, // $ Vistana
    { wch: 14 }, // Total $
  ];
  applyStyleToRow(ws, 0, header.length, HEADER_STYLE);

  // Reemplazar 0 por "—" en cantidades y dinero (filas de tiendas, no la TOTAL).
  for (let r = 1; r <= filas.length; r++) {
    const f = filas[r - 1];
    setDashOrNumber(ws, r, 1, f.panelesFW, false);
    setDashOrNumber(ws, r, 2, f.panelesVistana, false);
    setDashOrNumber(ws, r, 3, f.totalPaneles, false);
    setDashOrNumber(ws, r, 4, f.montoFW, true);
    setDashOrNumber(ws, r, 5, f.montoVistana, true);
    setDashOrNumber(ws, r, 6, f.totalMonto, true);
  }

  // Format de moneda en columnas $ (asegura formato si setDashOrNumber dejó número)
  applyMoneyFmt(ws, 1, filas.length, [4, 5, 6]);

  // Fila TOTAL en amarillo (igual que el changalo original).
  applyStyleToRow(ws, aoa.length - 1, header.length, TOTAL_AMARILLO_STYLE);
  // Asegurar formato moneda en celdas TOTAL $
  applyMoneyFmt(ws, aoa.length - 1, aoa.length - 1, [4, 5, 6]);

  // Freeze pane: header siempre visible.
  ws["!freeze"] = { xSplit: 0, ySplit: 1 } as unknown as Record<
    string,
    unknown
  >;
  return ws;
}

// ---- Hoja por tienda: detalle por producto ----
interface FilaDetalleProducto {
  productoNombre: string;
  cantFW: number;
  cantVistana: number;
  precioUnitario: number;
  montoFW: number;
  montoVistana: number;
  total: number;
}

function hojaTiendaDetalle(
  tienda: string,
  filas: ReadonlyArray<FilaDetalleProducto>,
): XLSX.WorkSheet {
  const header = [
    "Producto",
    "Cant. FW",
    "Cant. Vistana",
    "Precio unit",
    "$ FW",
    "$ Vistana",
    "Total",
  ];
  const aoa: (string | number)[][] = [header];
  for (const f of filas) {
    aoa.push([
      f.productoNombre,
      f.cantFW,
      f.cantVistana,
      f.precioUnitario,
      f.montoFW,
      f.montoVistana,
      f.total,
    ]);
  }
  // Fila TOTAL
  const totalCantFW = filas.reduce((s, f) => s + f.cantFW, 0);
  const totalCantV = filas.reduce((s, f) => s + f.cantVistana, 0);
  const totalMontoFW = filas.reduce((s, f) => s + f.montoFW, 0);
  const totalMontoV = filas.reduce((s, f) => s + f.montoVistana, 0);
  const totalTotal = filas.reduce((s, f) => s + f.total, 0);
  aoa.push([
    "TOTAL",
    totalCantFW,
    totalCantV,
    "",
    totalMontoFW,
    totalMontoV,
    totalTotal,
  ]);

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [
    { wch: 22 }, // Producto
    { wch: 12 }, // Cant. FW
    { wch: 14 }, // Cant. Vistana
    { wch: 14 }, // Precio unit
    { wch: 14 }, // $ FW
    { wch: 14 }, // $ Vistana
    { wch: 14 }, // Total
  ];
  applyStyleToRow(ws, 0, header.length, HEADER_STYLE);

  // Celdas con dash o número en cantidades; precio y montos siempre dinero.
  for (let r = 1; r <= filas.length; r++) {
    const f = filas[r - 1];
    setDashOrNumber(ws, r, 1, f.cantFW, false);
    setDashOrNumber(ws, r, 2, f.cantVistana, false);
    setDashOrNumber(ws, r, 4, f.montoFW, true);
    setDashOrNumber(ws, r, 5, f.montoVistana, true);
    // Precio y total siempre numéricos (no dash).
    const addrPrecio = XLSX.utils.encode_cell({ r, c: 3 });
    (ws as Record<string, unknown>)[addrPrecio] = {
      t: "n",
      v: f.precioUnitario,
      z: MONEY_FMT,
    };
    const addrTotal = XLSX.utils.encode_cell({ r, c: 6 });
    (ws as Record<string, unknown>)[addrTotal] = {
      t: "n",
      v: f.total,
      z: MONEY_FMT,
    };
  }
  applyMoneyFmt(ws, 1, filas.length, [3, 4, 5, 6]);

  // Fila TOTAL gris para hojas internas (la amarilla queda solo para Resumen).
  applyStyleToRow(ws, aoa.length - 1, header.length, TOTAL_GRIS_STYLE);
  applyMoneyFmt(ws, aoa.length - 1, aoa.length - 1, [4, 5, 6]);

  // Freeze pane: header.
  ws["!freeze"] = { xSplit: 0, ySplit: 1 } as unknown as Record<
    string,
    unknown
  >;

  // Suprime warning lint de variable sin uso (tienda solo se usa al nombrar la hoja por fuera).
  void tienda;
  return ws;
}

// ---- Construir filas de detalle a partir de una tienda y sus entregas ----
// Categoriza producto y mapea por marca (asumimos las dos marcas FW=Tommy y
// Vistana=Calvin como las únicas usadas en muebles, igual que el seed changalo).
function detalleProductosDeTienda(
  entregas: ReadonlyArray<EntregaConItems>,
  productos: ReadonlyArray<MkInventarioProducto>,
): FilaDetalleProducto[] {
  const productoById = new Map(productos.map((p) => [p.id, p]));
  // Acum por producto.
  const acum = new Map<
    string,
    {
      nombre: string;
      cantFW: number;
      cantVistana: number;
      precio: number;
    }
  >();
  for (const e of entregas) {
    for (const it of e.items) {
      const prod = productoById.get(it.producto_id);
      if (!prod) continue;
      const existing = acum.get(it.producto_id) ?? {
        nombre: prod.nombre,
        cantFW: 0,
        cantVistana: 0,
        precio: Number(it.precio_unitario ?? prod.precio),
      };
      for (const r of it.reparto ?? []) {
        const cant = Number(r.cantidad ?? 0);
        if (!Number.isFinite(cant) || cant <= 0) continue;
        if (r.empresa === "fashion_wear") existing.cantFW += cant;
        else if (r.empresa === "vistana") existing.cantVistana += cant;
        // Empresas distintas (Reebok/Joybees) no aparecen en formato changalo.
      }
      acum.set(it.producto_id, existing);
    }
  }
  const filas: FilaDetalleProducto[] = [];
  for (const v of acum.values()) {
    if (v.cantFW <= 0 && v.cantVistana <= 0) continue;
    filas.push({
      productoNombre: v.nombre,
      cantFW: v.cantFW,
      cantVistana: v.cantVistana,
      precioUnitario: v.precio,
      montoFW: Math.round(v.cantFW * v.precio * 100) / 100,
      montoVistana: Math.round(v.cantVistana * v.precio * 100) / 100,
      total: Math.round((v.cantFW + v.cantVistana) * v.precio * 100) / 100,
    });
  }
  // Orden estable por nombre de producto.
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
}): Uint8Array {
  const { productos, entregas, proyectos } = args;
  const wb = XLSX.utils.book_new();

  // Hoja Resumen.
  const filasResumen = resumirPorTienda(entregas, proyectos, productos);
  XLSX.utils.book_append_sheet(wb, hojaResumen(filasResumen), "Resumen");

  // Una hoja por tienda con sus detalles.
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
}): Uint8Array {
  const { productos, entregas, proyecto } = args;
  const wb = XLSX.utils.book_new();
  const filasResumen = resumirPorTienda(entregas, [proyecto], productos);

  // Hoja Resumen (1 fila + TOTAL).
  XLSX.utils.book_append_sheet(wb, hojaResumen(filasResumen), "Resumen");

  // Hoja con detalle de la única tienda.
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

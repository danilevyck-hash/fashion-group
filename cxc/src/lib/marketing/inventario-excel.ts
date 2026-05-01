// ============================================================================
// Marketing — Excel export del módulo de inventario
// ============================================================================
// Formato global: hoja Resumen + hoja Productos + 1 hoja por tienda.
// Formato por tienda: solo la hoja de esa tienda (productos × marcas).
// ============================================================================

import XLSX from "xlsx-js-style";
import type {
  EntregaConItems,
  MkInventarioProducto,
  MkMarca,
  MkProyecto,
} from "./types";

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

const TOTALES_STYLE = {
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
  // Excel limita nombres de hoja a 31 chars y prohíbe ciertos chars.
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

// ----------------------------------------------------------------------------
// Hoja por tienda: productos × marcas (cantidad + costo)
// ----------------------------------------------------------------------------
function hojaTienda(
  proyecto: MkProyecto,
  entrega: EntregaConItems,
  productos: ReadonlyArray<MkInventarioProducto>,
  marcas: ReadonlyArray<MkMarca>,
): XLSX.WorkSheet {
  const productoById = new Map(productos.map((p) => [p.id, p]));

  // Marcas con cantidades > 0 en esta entrega
  const marcaIdsPresentes = new Set<string>();
  for (const it of entrega.items) {
    for (const [marcaId, cant] of Object.entries(it.cantidad_por_marca ?? {})) {
      if (Number(cant) > 0) marcaIdsPresentes.add(marcaId);
    }
  }
  const marcasUsadas = marcas.filter((m) => marcaIdsPresentes.has(m.id));

  // Header: Producto, Precio, [Cant. <Marca>...] [Costo <Marca>...] Total línea
  const header: string[] = ["Producto", "Precio"];
  for (const m of marcasUsadas) header.push(`Cant. ${m.nombre}`);
  for (const m of marcasUsadas) header.push(`Costo ${m.nombre}`);
  header.push("Costo total");

  const aoa: (string | number)[][] = [header];

  for (const it of entrega.items) {
    const prod = productoById.get(it.producto_id);
    const nombreProd = prod?.nombre ?? "—";
    const precio = Number(it.precio_unitario ?? 0);
    const row: (string | number)[] = [nombreProd, precio];
    let totalLinea = 0;
    // cantidades
    for (const m of marcasUsadas) {
      const c = Number(it.cantidad_por_marca?.[m.id] ?? 0);
      row.push(c);
    }
    // costos
    for (const m of marcasUsadas) {
      const c = Number(it.cantidad_por_marca?.[m.id] ?? 0);
      const costo = precio * c;
      row.push(costo);
      totalLinea += costo;
    }
    row.push(totalLinea);
    aoa.push(row);
  }

  // Fila TOTALES
  const totalesRow: (string | number)[] = ["TOTALES", ""];
  for (const m of marcasUsadas) {
    let cant = 0;
    for (const it of entrega.items) {
      cant += Number(it.cantidad_por_marca?.[m.id] ?? 0);
    }
    totalesRow.push(cant);
  }
  let totalGeneral = 0;
  for (const m of marcasUsadas) {
    const monto = Number(entrega.total_por_marca?.[m.id] ?? 0);
    totalesRow.push(monto);
    totalGeneral += monto;
  }
  totalesRow.push(totalGeneral);
  aoa.push(totalesRow);

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const cols = header.length;
  ws["!cols"] = [
    { wch: 22 }, // Producto
    { wch: 10 }, // Precio
    ...marcasUsadas.map(() => ({ wch: 14 })), // Cant. <Marca>
    ...marcasUsadas.map(() => ({ wch: 14 })), // Costo <Marca>
    { wch: 14 }, // Costo total
  ];

  applyStyleToRow(ws, 0, cols, HEADER_STYLE);
  applyStyleToRow(ws, aoa.length - 1, cols, TOTALES_STYLE);

  const moneyCols: number[] = [1]; // Precio
  // Costos (segunda mitad de columnas dinámicas) + Costo total
  for (let i = 0; i < marcasUsadas.length; i++) {
    moneyCols.push(2 + marcasUsadas.length + i);
  }
  moneyCols.push(cols - 1);
  applyMoneyFmt(ws, 1, aoa.length - 1, moneyCols);

  // Header de info del proyecto en row inicial — mejor que la primera celda
  // diga "Tienda: <nombre>". Lo dejamos como title row arriba si el caller
  // quiere; para mantener simple, usamos solo la tabla.

  return ws;
}

// ----------------------------------------------------------------------------
// Hoja Resumen: 1 fila por tienda × cantidades por marca por producto
// ----------------------------------------------------------------------------
function hojaResumen(
  entregas: ReadonlyArray<EntregaConItems>,
  proyectoById: Map<string, MkProyecto>,
  productos: ReadonlyArray<MkInventarioProducto>,
  marcas: ReadonlyArray<MkMarca>,
): XLSX.WorkSheet {
  // Header: Tienda + para cada producto, columnas por marca usada
  const marcasUsadasGlobal = new Set<string>();
  for (const e of entregas) {
    for (const it of e.items) {
      for (const [m, c] of Object.entries(it.cantidad_por_marca ?? {})) {
        if (Number(c) > 0) marcasUsadasGlobal.add(m);
      }
    }
  }
  const marcasOrden = marcas.filter((m) => marcasUsadasGlobal.has(m.id));

  const header: string[] = ["Tienda"];
  for (const p of productos) {
    for (const m of marcasOrden) {
      header.push(`${p.nombre} - ${m.nombre}`);
    }
  }
  header.push("Total");

  const aoa: (string | number)[][] = [header];

  for (const e of entregas) {
    const proy = e.proyecto_id ? proyectoById.get(e.proyecto_id) : null;
    const tienda =
      proy?.tienda ||
      proy?.nombre ||
      (e.proyecto_id ? "—" : "(sin asignar)");
    const row: (string | number)[] = [tienda];
    for (const p of productos) {
      const item = e.items.find((it) => it.producto_id === p.id);
      for (const m of marcasOrden) {
        const c = Number(item?.cantidad_por_marca?.[m.id] ?? 0);
        row.push(c);
      }
    }
    row.push(Number(e.total ?? 0));
    aoa.push(row);
  }

  // Fila TOTALES: suma por columna
  const totalesRow: (string | number)[] = ["TOTALES"];
  for (let c = 1; c < header.length; c++) {
    let sum = 0;
    for (let r = 1; r < aoa.length; r++) {
      sum += Number(aoa[r][c] ?? 0);
    }
    totalesRow.push(sum);
  }
  aoa.push(totalesRow);

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const cols = header.length;
  ws["!cols"] = [
    { wch: 28 },
    ...Array(cols - 2).fill({ wch: 14 }),
    { wch: 14 },
  ];
  applyStyleToRow(ws, 0, cols, HEADER_STYLE);
  applyStyleToRow(ws, aoa.length - 1, cols, TOTALES_STYLE);
  // La última columna es Total (dinero)
  applyMoneyFmt(ws, 1, aoa.length - 1, [cols - 1]);
  return ws;
}

// ----------------------------------------------------------------------------
// Hoja Productos: catálogo + entregado + disponible + valor
// ----------------------------------------------------------------------------
function hojaProductos(
  productos: ReadonlyArray<MkInventarioProducto>,
  entregas: ReadonlyArray<EntregaConItems>,
): XLSX.WorkSheet {
  const entregadoByProducto = new Map<string, number>();
  for (const e of entregas) {
    for (const it of e.items) {
      let total = 0;
      for (const v of Object.values(it.cantidad_por_marca ?? {})) {
        total += Number(v ?? 0);
      }
      entregadoByProducto.set(
        it.producto_id,
        (entregadoByProducto.get(it.producto_id) ?? 0) + total,
      );
    }
  }

  const header = [
    "Producto",
    "Precio",
    "Comprado",
    "Entregado",
    "Disponible",
    "Valor",
  ];
  const aoa: (string | number)[][] = [header];
  let totalValor = 0;
  let totalEntregado = 0;
  let totalDispo = 0;
  let totalComprado = 0;

  for (const p of productos) {
    const entregado = entregadoByProducto.get(p.id) ?? 0;
    const disponible = Number(p.stock_total ?? 0);
    const comprado = entregado + disponible;
    const valor = Number(p.precio ?? 0) * disponible;
    aoa.push([p.nombre, Number(p.precio ?? 0), comprado, entregado, disponible, valor]);
    totalValor += valor;
    totalEntregado += entregado;
    totalDispo += disponible;
    totalComprado += comprado;
  }
  aoa.push(["TOTALES", "", totalComprado, totalEntregado, totalDispo, totalValor]);

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [
    { wch: 22 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 14 },
  ];
  applyStyleToRow(ws, 0, header.length, HEADER_STYLE);
  applyStyleToRow(ws, aoa.length - 1, header.length, TOTALES_STYLE);
  applyMoneyFmt(ws, 1, aoa.length - 1, [1, 5]);
  return ws;
}

// ----------------------------------------------------------------------------
// API pública
// ----------------------------------------------------------------------------
export function exportarExcelGlobal(args: {
  productos: ReadonlyArray<MkInventarioProducto>;
  entregas: ReadonlyArray<EntregaConItems>;
  proyectos: ReadonlyArray<MkProyecto>;
  marcas: ReadonlyArray<MkMarca>;
}): Uint8Array {
  const { productos, entregas, proyectos, marcas } = args;
  const proyectoById = new Map(proyectos.map((p) => [p.id, p]));
  const wb = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(
    wb,
    hojaResumen(entregas, proyectoById, productos, marcas),
    "Resumen",
  );
  XLSX.utils.book_append_sheet(
    wb,
    hojaProductos(productos, entregas),
    "Productos",
  );
  // Nombres de hoja únicos (Excel no permite duplicados ni > 31 chars).
  const usedNames = new Set<string>(["Resumen", "Productos"]);
  for (const e of entregas) {
    const proy = e.proyecto_id ? proyectoById.get(e.proyecto_id) : null;
    const baseName =
      proy?.tienda || proy?.nombre || `Entrega ${e.id.slice(0, 6)}`;
    let name = sanitizeSheetName(baseName);
    let i = 2;
    while (usedNames.has(name)) {
      const suffix = ` (${i++})`;
      name = sanitizeSheetName(baseName.slice(0, 31 - suffix.length) + suffix);
    }
    usedNames.add(name);
    if (proy) {
      XLSX.utils.book_append_sheet(
        wb,
        hojaTienda(proy as MkProyecto, e, productos, marcas),
        name,
      );
    }
  }
  return XLSX.write(wb, { bookType: "xlsx", type: "array" }) as Uint8Array;
}

export function exportarExcelTienda(args: {
  proyecto: MkProyecto;
  entrega: EntregaConItems;
  productos: ReadonlyArray<MkInventarioProducto>;
  marcas: ReadonlyArray<MkMarca>;
}): Uint8Array {
  const { proyecto, entrega, productos, marcas } = args;
  const wb = XLSX.utils.book_new();
  const name = sanitizeSheetName(
    proyecto.tienda || proyecto.nombre || "Entrega",
  );
  XLSX.utils.book_append_sheet(
    wb,
    hojaTienda(proyecto, entrega, productos, marcas),
    name,
  );
  return XLSX.write(wb, { bookType: "xlsx", type: "array" }) as Uint8Array;
}

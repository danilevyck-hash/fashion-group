// El libro del «Excel de tallas» de un pedido: una hoja, encabezado en la fila 1,
// filtro desde A1 y la fila fija (la pone `workbookBytes`/`workbookBlob`).
import XLSX from "xlsx-js-style";
import { addr, filtroDesdeA1, makeCellStyles } from "@/lib/excel-export";
import type { FilaTallas } from "./armar";

export const COLUMNAS_TALLAS = ["Referencia", "Descripción", "Talla", "Código de barra", "Pares", "Opción"] as const;

/** Amarillo = sin datos del proveedor; naranja = no llena cajas completas. */
export const FONDO = { amarillo: "FFFF00", naranja: "FFC000" } as const;

const esNumero = (s: string) => /^\d+(\.\d+)?$/.test(s);

export function libroDeTallas(filas: readonly FilaTallas[], hoja = "Tallas"): XLSX.WorkBook {
  const { hdr, B } = makeCellStyles();
  const aoa: unknown[][] = [[...COLUMNAS_TALLAS]];
  for (const f of filas) aoa.push([f.referencia, f.descripcion, f.talla, f.codigoBarra, f.pares, f.opcion]);
  const ws: XLSX.WorkSheet = {};
  COLUMNAS_TALLAS.forEach((h, c) => (ws[addr(0, c)] = hdr(h)));

  filas.forEach((f, i) => {
    const r = i + 1;
    const s = {
      font: { sz: 10, name: "Calibri", bold: f.esTotal, color: { rgb: "222222" } },
      border: B,
      ...(f.color ? { fill: { fgColor: { rgb: FONDO[f.color] } } } : {}),
    };
    const texto = (v: string) => ({ v, t: "s" as const, s });
    ws[addr(r, 0)] = texto(f.referencia);
    ws[addr(r, 1)] = texto(f.descripcion);
    ws[addr(r, 2)] = esNumero(f.talla) ? { v: Number(f.talla), t: "n" as const, s } : texto(f.talla);
    // 🔴 El código de barra va como TEXTO: como número Excel lo muestra 8.72E+12.
    ws[addr(r, 3)] = { v: f.codigoBarra, t: "s" as const, z: "@", s };
    ws[addr(r, 4)] = f.pares === null ? texto("") : { v: f.pares, t: "n" as const, z: "0", s };
    ws[addr(r, 5)] = texto(f.opcion);
  });

  ws["!ref"] = `A1:${addr(aoa.length - 1, COLUMNAS_TALLAS.length - 1)}`;
  ws["!autofilter"] = { ref: filtroDesdeA1(aoa) };
  ws["!cols"] = [{ wch: 30 }, { wch: 18 }, { wch: 8 }, { wch: 16 }, { wch: 8 }, { wch: 10 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, hoja.slice(0, 31));
  return wb;
}

// El libro del «Excel de tallas» de un pedido: una hoja, encabezado en la fila 1,
// filtro desde A1 y la fila fija (la pone `workbookBytes`/`workbookBlob`).
import XLSX from "xlsx-js-style";
import { addr, filtroDesdeA1, makeCellStyles } from "@/lib/excel-export";
import type { FilaTallas } from "./armar";
import { TALLAS_FILA_VACIA_2026_11 } from "./interruptores";

export const COLUMNAS_TALLAS = ["Referencia", "Descripción", "Talla", "Código de barra", "Pares", "Opción"] as const;

/** Amarillo = sin datos del proveedor; naranja = no llena cajas completas. */
export const FONDO = { amarillo: "FFFF00", naranja: "FFC000" } as const;

const esNumero = (s: string) => /^\d+(\.\d+)?$/.test(s);

type RenglonExcel = { fila: FilaTallas; negrita: boolean } | null;

/**
 * Los renglones del Excel (`null` = fila vacía). Con `TALLAS_FILA_VACIA_2026_11`:
 * cada «Total» se vuelve una fila vacía, el amarillo lleva la suya después, y la
 * primera fila de cada bloque va en negrita. Apagado = las filas tal cual.
 */
export function renglonesDelExcel(filas: readonly FilaTallas[], filaVacia = TALLAS_FILA_VACIA_2026_11): RenglonExcel[] {
  if (!filaVacia) return filas.map((fila) => ({ fila, negrita: fila.esTotal }));
  const out: RenglonExcel[] = [];
  for (const fila of filas) {
    if (fila.esTotal) {
      out.push(null);
      continue;
    }
    out.push({ fila, negrita: out.length === 0 || out[out.length - 1] === null });
    if (fila.color === "amarillo") out.push(null);
  }
  return out;
}

export function libroDeTallas(filas: readonly FilaTallas[], hoja = "Tallas"): XLSX.WorkBook {
  const { hdr, B } = makeCellStyles();
  const renglones = renglonesDelExcel(filas);
  const aoa: unknown[][] = [[...COLUMNAS_TALLAS], ...renglones.map(() => [])];
  const ws: XLSX.WorkSheet = {};
  COLUMNAS_TALLAS.forEach((h, c) => (ws[addr(0, c)] = hdr(h)));

  renglones.forEach((renglon, i) => {
    if (!renglon) return;
    const { fila: f, negrita } = renglon;
    const r = i + 1;
    const s = {
      font: { sz: 10, name: "Calibri", bold: negrita, color: { rgb: "222222" } },
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

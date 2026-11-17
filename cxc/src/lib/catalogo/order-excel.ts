// ─────────────────────────────────────────────────────────────────────────────
// Excel del comprobante de catálogo (pedido o cotización) — ESPEJO del PDF
// (`order-pdf-core.ts`). Mismo orden y mismas partes: banda de la marca,
// Cliente · Pedido/Cotización · Fecha, la tabla (con «Pedido»/«Preventa» si hay
// preventa), el total con bultos y unidades y la firma de la marca.
//
// Las cuentas NO se hacen aquí: salen de `resolverLineas`, igual que el PDF.
// ⚠️ Lo que el Excel no puede llevar: el logo y la foto de cada producto
// (`xlsx-js-style` no escribe imágenes). La banda lleva el nombre de la marca.
// ─────────────────────────────────────────────────────────────────────────────

import XLSX from "xlsx-js-style";
import { resolverLineas, resumirPedido, type LineaResuelta } from "./lineas-pedido";
import { sortReebokOrderItems } from "@/lib/reebok-order-sort";
import { DOCUMENTO_POR_DEFECTO, etiquetaDocumento } from "@/lib/catalogo/documento-switch";
import type { OrderPdfOpts } from "./order-pdf-core";
import {
  addr, DATE_FMT, makeCellStyles, MONEY_FMT, paletaDeMarca, serialExcel,
  workbookFromSheets, downloadWorkbook,
} from "@/lib/excel-export";

export type OrderExcelOpts = Omit<OrderPdfOpts, "images">;

const NOMBRE_MARCA: Record<OrderExcelOpts["marca"], string> = {
  reebok: "Reebok", joybees: "Joybees", tommy: "Tommy Hilfiger", calvin: "Calvin Klein",
};
/** La MISMA firma que el pie del PDF. */
const FIRMA: Record<OrderExcelOpts["marca"], string> = {
  reebok: "Fashion Group Panamá · Reebok Authorized Distributor",
  joybees: "Fashion Group Panamá · Joybees",
  tommy: "Fashion Group Panamá · Tommy Hilfiger",
  calvin: "Fashion Group Panamá · Calvin Klein",
};
/** Las columnas del PDF, sin la de la foto. */
export const COLUMNAS_EXCEL = ["Producto", "SKU", "Bultos", "Cantidad", "Precio/u", "Subtotal"] as const;
const ANCHOS = [44, 16, 9, 11, 12, 14];
const ULT = COLUMNAS_EXCEL.length - 1;

export function buildOrderExcelWorkbook(opts: OrderExcelOpts): XLSX.WorkBook {
  const { marca, orderNumber, clientName, createdAt, bultoSize } = opts;
  const documentoLabel = opts.documentoLabel || etiquetaDocumento(DOCUMENTO_POR_DEFECTO);
  const items = marca === "reebok" ? sortReebokOrderItems(opts.items) : opts.items;
  const regulares = items.filter((i) => !i.is_preorder);
  const preventa = items.filter((i) => i.is_preorder);
  const resumen = resumirPedido(resolverLineas(items, { bultoSize }));

  const p = paletaDeMarca(marca);
  const { band, hdr, td, tdN, tot } = makeCellStyles(p);
  const ws: XLSX.WorkSheet = {};
  const merges: XLSX.Range[] = [];
  const alto: number[] = [];
  let r = 0;

  // Fila 1: la banda de la marca (en el PDF, el logo).
  band(ws, r, ULT, merges, `${NOMBRE_MARCA[marca]}  ·  Fashion Group · Panamá`, p.pri, 14);
  alto[r] = 26; r++;

  // Fila 2: Cliente · Pedido/Cotización · Fecha — los tres textos del PDF.
  const gris = { font: { sz: 10, color: { rgb: "555555" }, name: "Calibri" } };
  ws[addr(r, 0)] = { v: `Cliente: ${clientName}`, t: "s", s: gris };
  ws[addr(r, 2)] = { v: `${documentoLabel}: ${orderNumber}`, t: "s", s: gris };
  const fecha = new Date(createdAt + (createdAt.includes("T") ? "" : "T12:00:00"));
  ws[addr(r, 4)] = { v: "Fecha:", t: "s", s: { ...gris, alignment: { horizontal: "right" } } };
  ws[addr(r, 5)] = isNaN(fecha.getTime())
    ? { v: "", t: "s" }
    : { v: serialExcel(fecha), t: "n", z: DATE_FMT, s: { ...gris, alignment: { horizontal: "left" } } };
  merges.push({ s: { r, c: 0 }, e: { r, c: 1 } }, { s: { r, c: 2 }, e: { r, c: 3 } });
  alto[r] = 20; r++;
  alto[r] = 8; r++; // aire

  let filtro: string | null = null;
  function tabla(titulo: string | null, lineas: LineaResuelta[]) {
    if (titulo) {
      ws[addr(r, 0)] = { v: titulo, t: "s", s: { font: { bold: true, sz: 11, color: { rgb: "1A1A1A" }, name: "Calibri" } } };
      alto[r] = 20; r++;
    }
    const filaHdr = r;
    COLUMNAS_EXCEL.forEach((h, c) => { ws[addr(r, c)] = hdr(h, c === 2 || c === 3 ? "center" : c >= 4 ? "right" : "left"); });
    alto[r] = 22; r++;
    lineas.forEach((l, i) => {
      const alt = i % 2 === 1;
      ws[addr(r, 0)] = td(l.name, alt);
      ws[addr(r, 1)] = td(l.sku, alt);
      ws[addr(r, 2)] = tdN(l.bultos, alt, { fmt: "0", ha: "center" });
      ws[addr(r, 3)] = tdN(l.piezas, alt, { fmt: "0", ha: "center" });
      ws[addr(r, 4)] = tdN(l.unit_price, alt, { fmt: MONEY_FMT });
      ws[addr(r, 5)] = tdN(l.subtotal, alt, { fmt: MONEY_FMT });
      alto[r] = 18; r++;
    });
    // El filtro va en la PRIMERA tabla (con preventa, la segunda es otro bloque).
    if (!filtro) filtro = `${addr(filaHdr, 0)}:${addr(r - 1, ULT)}`;
  }

  const ctx = { bultoSize };
  if (regulares.length) tabla(preventa.length ? "Pedido" : null, resolverLineas(regulares, ctx));
  if (preventa.length) { alto[r] = 10; r++; tabla("Preventa", resolverLineas(preventa, ctx)); }

  // El total del PDF: «N bultos · M unidades» y el monto. Números reales.
  alto[r] = 8; r++;
  ws[addr(r, 0)] = tot("Total", { ha: "left" });
  ws[addr(r, 1)] = tot("", { ha: "left" });
  ws[addr(r, 2)] = tot(resumen.bultos, { ha: "center", fmt: '0" bultos"' });
  ws[addr(r, 3)] = tot(resumen.piezas, { ha: "center", fmt: '0" unid."' });
  ws[addr(r, 4)] = tot("", { ha: "left" });
  ws[addr(r, 5)] = tot(resumen.total, { fmt: MONEY_FMT });
  alto[r] = 22; r++;
  alto[r] = 8; r++;
  ws[addr(r, 0)] = { v: FIRMA[marca], t: "s", s: { font: { sz: 9, color: { rgb: "A0A0A0" }, name: "Calibri" } } };
  alto[r] = 16; r++;

  ws["!ref"] = `A1:${addr(r - 1, ULT)}`;
  if (filtro) ws["!autofilter"] = { ref: filtro };
  ws["!merges"] = merges;
  ws["!cols"] = ANCHOS.map((wch) => ({ wch }));
  ws["!rows"] = alto.map((h) => ({ hpt: h || 16 }));
  return workbookFromSheets([{ name: documentoLabel.slice(0, 31), ws }]);
}

/** Browser: arma y descarga (sale por `workbookBytes` adentro de `downloadWorkbook`). */
export function downloadCatalogoOrderExcel(opts: OrderExcelOpts & { filename: string }): void {
  downloadWorkbook(buildOrderExcelWorkbook(opts), opts.filename);
}

// ─────────────────────────────────────────────────────────────────────────────
// Excel del comprobante de catálogo (pedido o cotización) — ESPEJO del PDF
// (`order-pdf-core.ts`). Mismo orden y mismas partes: banda de la marca,
// Cliente · Pedido/Cotización · Fecha, la tabla (con «Pedido»/«Preventa» si hay
// preventa), el total con bultos y unidades y la firma de la marca.
//
// Las cuentas NO se hacen aquí: salen de `resolverLineas`, igual que el PDF.
//
// 🔴 LA FOTO DE CADA PRODUCTO (Daniel, 19-nov-2026). `xlsx-js-style` no escribe
// imágenes: el libro lo arma como siempre y después `incrustarFotosEnXlsx`
// (jszip) le pega las fotos en la columna «Foto». Orden obligado: PRIMERO
// `workbookBytes` (panel fijo), DESPUÉS las fotos — ver `ReebokClient.tsx`.
// Una foto que no carga deja su celda vacía; el Excel sale igual.
// ⚠️ El logo de la marca sigue sin ir: la banda lleva el nombre.
// ─────────────────────────────────────────────────────────────────────────────

import XLSX from "xlsx-js-style";
import { resolverLineas, resumirPedido, type LineaResuelta } from "./lineas-pedido";
import { sortReebokOrderItems } from "@/lib/reebok-order-sort";
import { DOCUMENTO_POR_DEFECTO, etiquetaDocumento } from "@/lib/catalogo/documento-switch";
import type { OrderPdfOpts } from "./order-pdf-core";
import type { FotoParaExcel } from "@/lib/depurador/fotos-xlsx";
import {
  addr, DATE_FMT, makeCellStyles, MONEY_FMT, paletaDeMarca, serialExcel,
  workbookFromSheets, workbookBytes, XLSX_MIME,
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
/** Las columnas del PDF, con la foto a la izquierda como en el PDF. */
export const COLUMNAS_EXCEL = ["Foto", "Producto", "SKU", "Bultos", "Cantidad", "Precio/u", "Subtotal"] as const;
/** Columna de la foto (0-based). */
export const COLUMNA_FOTO = 0;
const ANCHOS = [10, 44, 16, 9, 11, 12, 14];
const ULT = COLUMNAS_EXCEL.length - 1;
/** Alto fijo de cada fila de producto (pt) y la caja donde se encaja la foto (px). */
const ALTO_FILA_PT = 48;
const ALTO_FILA_PX = Math.round((ALTO_FILA_PT * 96) / 72); // 64
const ANCHO_COL_FOTO_PX = ANCHOS[COLUMNA_FOTO] * 7 + 5; // 75
const CAJA_FOTO_PX = 56;

/** Fila (0-based) donde va la foto de un producto. */
export interface FilaConFoto { fila: number; url: string; descripcion: string }

function armarLibro(opts: OrderExcelOpts): { wb: XLSX.WorkBook; filasConFoto: FilaConFoto[] } {
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
  const filasConFoto: FilaConFoto[] = [];
  let r = 0;

  // Fila 1: la banda de la marca (en el PDF, el logo).
  band(ws, r, ULT, merges, `${NOMBRE_MARCA[marca]}  ·  Fashion Group · Panamá`, p.pri, 14);
  alto[r] = 26; r++;

  // Fila 2: Cliente · Pedido/Cotización · Fecha — los tres textos del PDF.
  const gris = { font: { sz: 10, color: { rgb: "555555" }, name: "Calibri" } };
  ws[addr(r, 0)] = { v: `Cliente: ${clientName}`, t: "s", s: gris };
  ws[addr(r, 3)] = { v: `${documentoLabel}: ${orderNumber}`, t: "s", s: gris };
  const fecha = new Date(createdAt + (createdAt.includes("T") ? "" : "T12:00:00"));
  ws[addr(r, 5)] = { v: "Fecha:", t: "s", s: { ...gris, alignment: { horizontal: "right" } } };
  ws[addr(r, 6)] = isNaN(fecha.getTime())
    ? { v: "", t: "s" }
    : { v: serialExcel(fecha), t: "n", z: DATE_FMT, s: { ...gris, alignment: { horizontal: "left" } } };
  merges.push({ s: { r, c: 0 }, e: { r, c: 2 } }, { s: { r, c: 3 }, e: { r, c: 4 } });
  alto[r] = 20; r++;
  alto[r] = 8; r++; // aire

  // Las filas de producto son altas por la foto: el texto va centrado en alto.
  const alMedio = <T extends { s: { alignment?: object } }>(c: T): T =>
    ({ ...c, s: { ...c.s, alignment: { ...c.s.alignment, vertical: "center" } } });

  let filtro: string | null = null;
  function tabla(titulo: string | null, lineas: LineaResuelta[]) {
    if (titulo) {
      ws[addr(r, 0)] = { v: titulo, t: "s", s: { font: { bold: true, sz: 11, color: { rgb: "1A1A1A" }, name: "Calibri" } } };
      alto[r] = 20; r++;
    }
    const filaHdr = r;
    COLUMNAS_EXCEL.forEach((h, c) => {
      ws[addr(r, c)] = hdr(h, c === COLUMNA_FOTO || c === 3 || c === 4 ? "center" : c >= 5 ? "right" : "left");
    });
    alto[r] = 22; r++;
    lineas.forEach((l, i) => {
      const alt = i % 2 === 1;
      ws[addr(r, COLUMNA_FOTO)] = td("", alt);
      ws[addr(r, 1)] = alMedio(td(l.name, alt));
      ws[addr(r, 2)] = alMedio(td(l.sku, alt));
      ws[addr(r, 3)] = alMedio(tdN(l.bultos, alt, { fmt: "0", ha: "center" }));
      ws[addr(r, 4)] = alMedio(tdN(l.piezas, alt, { fmt: "0", ha: "center" }));
      ws[addr(r, 5)] = alMedio(tdN(l.unit_price, alt, { fmt: MONEY_FMT }));
      ws[addr(r, 6)] = alMedio(tdN(l.subtotal, alt, { fmt: MONEY_FMT }));
      if (l.image_url) filasConFoto.push({ fila: r, url: l.image_url, descripcion: l.name });
      alto[r] = ALTO_FILA_PT; r++;
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
  ws[addr(r, 2)] = tot("", { ha: "left" });
  ws[addr(r, 3)] = tot(resumen.bultos, { ha: "center", fmt: '0" bultos"' });
  ws[addr(r, 4)] = tot(resumen.piezas, { ha: "center", fmt: '0" unid."' });
  ws[addr(r, 5)] = tot("", { ha: "left" });
  ws[addr(r, 6)] = tot(resumen.total, { fmt: MONEY_FMT });
  alto[r] = 22; r++;
  alto[r] = 8; r++;
  ws[addr(r, 0)] = { v: FIRMA[marca], t: "s", s: { font: { sz: 9, color: { rgb: "A0A0A0" }, name: "Calibri" } } };
  alto[r] = 16; r++;

  ws["!ref"] = `A1:${addr(r - 1, ULT)}`;
  if (filtro) ws["!autofilter"] = { ref: filtro };
  ws["!merges"] = merges;
  ws["!cols"] = ANCHOS.map((wch) => ({ wch }));
  ws["!rows"] = alto.map((h) => ({ hpt: h || 16 }));
  return { wb: workbookFromSheets([{ name: documentoLabel.slice(0, 31), ws }]), filasConFoto };
}

export function buildOrderExcelWorkbook(opts: OrderExcelOpts): XLSX.WorkBook {
  return armarLibro(opts).wb;
}

/** Una foto ya reducida (JPEG) y su tamaño en píxeles; null = no cargó. */
export type CargarFoto = (url: string) => Promise<{ bytes: Uint8Array; ancho: number; alto: number } | null>;

/**
 * Los bytes del .xlsx CON las fotos. Isomorfo: quien llama dice cómo se carga
 * una foto (el navegador con canvas, la prueba con bytes fijos).
 * 🔴 Una foto que falla —o que tira error— deja su celda vacía; nunca tumba el Excel.
 */
export async function orderExcelBytes(opts: OrderExcelOpts, cargarFoto: CargarFoto): Promise<Uint8Array> {
  const { wb, filasConFoto } = armarLibro(opts);
  const bytes = workbookBytes(wb); // primero el panel fijo, después las fotos
  if (filasConFoto.length === 0) return bytes;

  const urls = [...new Set(filasConFoto.map((f) => f.url))];
  const cargadas = new Map<string, Awaited<ReturnType<CargarFoto>>>();
  await Promise.all(urls.map(async (u) => {
    cargadas.set(u, await cargarFoto(u).catch(() => null));
  }));

  const fotos: FotoParaExcel[] = [];
  for (const f of filasConFoto) {
    const c = cargadas.get(f.url);
    if (!c || c.ancho <= 0 || c.alto <= 0) continue;
    const k = Math.min(CAJA_FOTO_PX / c.ancho, CAJA_FOTO_PX / c.alto);
    const w = Math.max(1, Math.round(c.ancho * k));
    const h = Math.max(1, Math.round(c.alto * k));
    fotos.push({
      fila: f.fila, bytes: c.bytes, anchoPx: w, altoPx: h,
      offsetXPx: Math.round((ANCHO_COL_FOTO_PX - w) / 2),
      offsetYPx: Math.round((ALTO_FILA_PX - h) / 2),
      descripcion: f.descripcion,
    });
  }
  if (fotos.length === 0) return bytes;
  try {
    const { incrustarFotosEnXlsx } = await import("@/lib/depurador/fotos-xlsx");
    return await incrustarFotosEnXlsx(bytes, fotos, { columna: COLUMNA_FOTO });
  } catch {
    return bytes; // sin fotos antes que sin Excel
  }
}

/** dataURL JPEG → bytes. */
function bytesDeDataUrl(dataUrl: string): Uint8Array {
  const bin = atob(dataUrl.slice(dataUrl.indexOf(",") + 1));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Browser: arma, pega las fotos (reducidas a 200 px, igual que el PDF) y descarga. */
export async function downloadCatalogoOrderExcel(opts: OrderExcelOpts & { filename: string }): Promise<void> {
  const { loadImageDownscaled } = await import("./foto-reducida");
  const bytes = await orderExcelBytes(opts, async (url) => {
    const f = await loadImageDownscaled(url);
    return f ? { bytes: bytesDeDataUrl(f.dataUrl), ancho: f.ancho, alto: f.alto } : null;
  });
  const ab = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(ab).set(bytes);
  const url = URL.createObjectURL(new Blob([ab], { type: XLSX_MIME }));
  const a = document.createElement("a");
  a.href = url;
  a.download = opts.filename;
  a.click();
  URL.revokeObjectURL(url);
}

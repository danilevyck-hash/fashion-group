import { jsPDF } from "jspdf";
import "jspdf-autotable";
import { supabaseServer } from "@/lib/supabase-server";
import { FG_LOGO_BASE64, FG_LOGO_WIDTH, FG_LOGO_HEIGHT } from "@/lib/pdf-logo";

const TASA_IMPORTACION = 0.10;
const TASA_ITBMS = 0.077;
const FACTOR_TOTAL = 1 + TASA_IMPORTACION + TASA_ITBMS;

const PAGE_W = 216;
const PAGE_H = 279;
const MARGIN = 15;

interface ReclamoItem {
  referencia?: string;
  descripcion?: string;
  talla?: string;
  cantidad?: number;
  precio_unitario?: number;
  motivo?: string;
  nro_factura?: string;
  nro_orden_compra?: string;
}

interface ReclamoFoto {
  storage_path: string;
}

interface ReclamoFull {
  id: string;
  nro_reclamo?: string;
  empresa?: string;
  proveedor?: string;
  marca?: string;
  nro_factura?: string;
  nro_orden_compra?: string;
  fecha_reclamo?: string;
  estado?: string;
  notas?: string;
  reclamo_items?: ReclamoItem[];
  reclamo_fotos?: ReclamoFoto[];
}

function fmt(n: number): string {
  return (n ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(d: string | undefined): string {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

async function downloadFoto(storagePath: string): Promise<{ base64: string; ext: string } | null> {
  try {
    const { data, error } = await supabaseServer.storage.from("reclamo-fotos").download(storagePath);
    if (error || !data) return null;
    const ab = await data.arrayBuffer();
    const base64 = Buffer.from(ab).toString("base64");
    const ext = storagePath.split(".").pop()?.toLowerCase() || "jpeg";
    const norm = ext === "jpg" ? "JPEG" : ext.toUpperCase();
    return { base64, ext: norm };
  } catch {
    return null;
  }
}

function drawCoverHeader(doc: jsPDF, empresa: string, count: number, grandTotal: number) {
  doc.setFillColor(27, 58, 92);
  doc.rect(0, 0, PAGE_W, 26, "F");
  try {
    doc.addImage(FG_LOGO_BASE64, "JPEG", 8, 4, FG_LOGO_WIDTH + 4, FG_LOGO_HEIGHT + 4);
  } catch { /* skip */ }
  const titleX = 8 + FG_LOGO_WIDTH + 4 + 6;
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("FASHION GROUP", titleX, 12);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Resumen de reclamos — ${empresa}`, titleX, 19);

  doc.setTextColor(120, 120, 120);
  doc.setFontSize(9);
  doc.text(`Generado el ${new Date().toLocaleDateString("es-PA")}`, MARGIN, 34);
  doc.text(`${count} reclamo${count === 1 ? "" : "s"}`, MARGIN, 39);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(27, 58, 92);
  doc.text(`Total a acreditar: $${fmt(grandTotal)}`, MARGIN, 44);
  doc.setFont("helvetica", "normal");
}

function drawReclamoSectionHeader(doc: jsPDF, rec: ReclamoFull, startY: number): number {
  doc.setFillColor(27, 58, 92);
  doc.rect(MARGIN, startY, PAGE_W - 2 * MARGIN, 9, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(rec.nro_reclamo || "Reclamo", MARGIN + 3, startY + 6);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`Factura: ${rec.nro_factura || "—"}`, PAGE_W - MARGIN - 3, startY + 6, { align: "right" });
  return startY + 13;
}

function drawMetaBlock(doc: jsPDF, rec: ReclamoFull, startY: number): number {
  doc.setTextColor(60, 60, 60);
  doc.setFontSize(9);
  const col1X = MARGIN;
  const col2X = MARGIN + 70;
  const col3X = MARGIN + 130;

  doc.setFont("helvetica", "bold");
  doc.text("Empresa", col1X, startY);
  doc.text("Proveedor", col2X, startY);
  doc.text("Marca", col3X, startY);
  doc.setFont("helvetica", "normal");
  doc.text(rec.empresa || "—", col1X, startY + 5);
  doc.text(rec.proveedor || "—", col2X, startY + 5);
  doc.text(rec.marca || "—", col3X, startY + 5);

  doc.setFont("helvetica", "bold");
  doc.text("Fecha", col1X, startY + 12);
  doc.text("Orden de Compra", col2X, startY + 12);
  doc.text("Estado", col3X, startY + 12);
  doc.setFont("helvetica", "normal");
  doc.text(fmtDate(rec.fecha_reclamo), col1X, startY + 17);
  doc.text(rec.nro_orden_compra || "—", col2X, startY + 17);
  doc.text(rec.estado || "—", col3X, startY + 17);

  return startY + 24;
}

function drawTotalsBlock(doc: jsPDF, subtotal: number, startY: number): number {
  const total = subtotal * FACTOR_TOTAL;
  const importacion = subtotal * TASA_IMPORTACION;
  const itbms = subtotal * TASA_ITBMS;

  const boxW = (PAGE_W - 2 * MARGIN - 9) / 4;
  const labels = [
    { label: "Subtotal", value: subtotal, dark: false },
    { label: "Importación 10%", value: importacion, dark: false },
    { label: "ITBMS 7%", value: itbms, dark: false },
    { label: "TOTAL", value: total, dark: true },
  ];
  labels.forEach((l, i) => {
    const x = MARGIN + (boxW + 3) * i;
    if (l.dark) {
      doc.setFillColor(27, 58, 92);
      doc.rect(x, startY, boxW, 14, "F");
      doc.setTextColor(170, 170, 170);
    } else {
      doc.setDrawColor(220, 220, 220);
      doc.setFillColor(248, 249, 249);
      doc.rect(x, startY, boxW, 14, "FD");
      doc.setTextColor(120, 120, 120);
    }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.text(l.label.toUpperCase(), x + boxW / 2, startY + 5, { align: "center" });
    doc.setTextColor(l.dark ? 255 : 30, l.dark ? 255 : 30, l.dark ? 255 : 30);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(`$${fmt(l.value)}`, x + boxW / 2, startY + 11, { align: "center" });
  });

  return startY + 18;
}

function drawNotas(doc: jsPDF, notas: string, startY: number): number {
  doc.setTextColor(80, 80, 80);
  doc.setFont("helvetica", "italic");
  doc.setFontSize(9);
  const lines = doc.splitTextToSize(`Notas: ${notas}`, PAGE_W - 2 * MARGIN);
  doc.text(lines, MARGIN, startY);
  return startY + lines.length * 4 + 4;
}

function ensureSpace(doc: jsPDF, cursorY: number, needed: number): number {
  if (cursorY + needed > PAGE_H - MARGIN) {
    doc.addPage();
    return MARGIN;
  }
  return cursorY;
}

export async function buildBulkReclamosPdf(reclamos: ReclamoFull[], empresa: string): Promise<jsPDF> {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter" });

  const grandTotal = reclamos.reduce((acc, r) => {
    const sub = (r.reclamo_items || []).reduce(
      (s, i) => s + (Number(i.cantidad) || 0) * (Number(i.precio_unitario) || 0),
      0,
    );
    return acc + sub * FACTOR_TOTAL;
  }, 0);

  drawCoverHeader(doc, empresa, reclamos.length, grandTotal);

  // Summary table
  const summaryRows = reclamos.map((r) => {
    const items = r.reclamo_items || [];
    const sub = items.reduce((s, i) => s + (Number(i.cantidad) || 0) * (Number(i.precio_unitario) || 0), 0);
    const total = sub * FACTOR_TOTAL;
    return [
      r.nro_reclamo || "",
      fmtDate(r.fecha_reclamo),
      r.nro_factura || "",
      r.estado || "",
      `${items.length}`,
      `$${fmt(total)}`,
    ];
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (doc as any).autoTable({
    startY: 50,
    head: [["N° Reclamo", "Fecha", "Factura", "Estado", "Ítems", "Total"]],
    body: summaryRows,
    styles: { fontSize: 9, cellPadding: 2.5 },
    headStyles: { fillColor: [27, 58, 92], textColor: [255, 255, 255], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [248, 249, 249] },
    columnStyles: {
      0: { cellWidth: 28 },
      1: { cellWidth: 22 },
      2: { cellWidth: 38 },
      3: { cellWidth: 24 },
      4: { halign: "center", cellWidth: 16 },
      5: { halign: "right", cellWidth: "auto" },
    },
  });

  // Per-reclamo full detail pages
  for (const rec of reclamos) {
    doc.addPage();
    let cursorY = MARGIN;

    cursorY = drawReclamoSectionHeader(doc, rec, cursorY);
    cursorY = drawMetaBlock(doc, rec, cursorY);

    const items = rec.reclamo_items || [];
    const subtotal = items.reduce(
      (s, i) => s + (Number(i.cantidad) || 0) * (Number(i.precio_unitario) || 0),
      0,
    );

    cursorY = drawTotalsBlock(doc, subtotal, cursorY);

    if (items.length > 0) {
      cursorY = ensureSpace(doc, cursorY, 30);
      const itemRows = items.map((i) => [
        i.referencia || "",
        i.descripcion || "",
        i.talla || "",
        `${Number(i.cantidad) || 0}`,
        `$${fmt(Number(i.precio_unitario) || 0)}`,
        `$${fmt((Number(i.cantidad) || 0) * (Number(i.precio_unitario) || 0))}`,
        i.motivo || "",
      ]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (doc as any).autoTable({
        startY: cursorY,
        head: [["Código", "Descripción", "Talla", "Cant.", "Precio", "Subtotal", "Motivo"]],
        body: itemRows,
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [27, 58, 92], textColor: [255, 255, 255], fontStyle: "bold" },
        alternateRowStyles: { fillColor: [248, 249, 249] },
        columnStyles: {
          0: { cellWidth: 24 },
          1: { cellWidth: "auto" },
          2: { cellWidth: 14, halign: "center" },
          3: { cellWidth: 12, halign: "right" },
          4: { cellWidth: 18, halign: "right" },
          5: { cellWidth: 20, halign: "right" },
          6: { cellWidth: 32 },
        },
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      cursorY = ((doc as any).lastAutoTable?.finalY ?? cursorY) + 6;
    }

    if (rec.notas && rec.notas.trim()) {
      cursorY = ensureSpace(doc, cursorY, 16);
      cursorY = drawNotas(doc, rec.notas, cursorY);
    }

    const fotos = rec.reclamo_fotos || [];
    if (fotos.length > 0) {
      const downloaded = await Promise.all(fotos.map((f) => downloadFoto(f.storage_path)));
      const valid = downloaded.filter((d): d is { base64: string; ext: string } => d !== null);
      if (valid.length > 0) {
        cursorY = ensureSpace(doc, cursorY, 20);
        doc.setFillColor(46, 94, 142);
        doc.rect(MARGIN, cursorY, PAGE_W - 2 * MARGIN, 8, "F");
        doc.setTextColor(255, 255, 255);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.text(`Evidencia fotográfica — ${rec.nro_reclamo || ""}`, PAGE_W / 2, cursorY + 5.5, { align: "center" });
        cursorY += 14;

        const imgSize = 110;
        for (const photo of valid) {
          cursorY = ensureSpace(doc, cursorY, imgSize + 6);
          const x = (PAGE_W - imgSize) / 2;
          try {
            doc.addImage(`data:image/${photo.ext.toLowerCase()};base64,${photo.base64}`, photo.ext, x, cursorY, imgSize, imgSize);
          } catch { /* skip */ }
          cursorY += imgSize + 6;
        }
      }
    }
  }

  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setTextColor(150);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text(`Fashion Group · Reclamos · ${empresa}`, MARGIN, PAGE_H - 8);
    doc.text(`Página ${i} de ${pageCount}`, PAGE_W - MARGIN, PAGE_H - 8, { align: "right" });
  }

  return doc;
}

export interface BulkSelector {
  reclamo_ids?: string[];
  all_with_filter?: { tab?: string; search?: string };
}

export async function fetchReclamosForEmpresa(empresa: string, sel: BulkSelector): Promise<ReclamoFull[]> {
  if (sel.reclamo_ids && sel.reclamo_ids.length > 0) {
    const { data, error } = await supabaseServer
      .from("reclamos")
      .select("*, reclamo_items(*), reclamo_fotos(*)")
      .eq("empresa", empresa)
      .in("id", sel.reclamo_ids)
      .order("created_at", { ascending: false });
    if (error) throw new Error("Error al cargar reclamos");
    return (data as ReclamoFull[]) || [];
  }

  if (sel.all_with_filter) {
    const tab = sel.all_with_filter.tab || "all";
    const search = (sel.all_with_filter.search || "").trim();
    let query = supabaseServer
      .from("reclamos")
      .select("*, reclamo_items(*), reclamo_fotos(*)")
      .eq("empresa", empresa)
      .order("created_at", { ascending: false });
    if (tab !== "all") query = query.eq("estado", tab);
    if (search) {
      const escaped = search.replace(/[%_,]/g, "\\$&");
      query = query.or(`nro_reclamo.ilike.%${escaped}%,nro_factura.ilike.%${escaped}%`);
    }
    const { data, error } = await query;
    if (error) throw new Error("Error al cargar reclamos");
    return (data as ReclamoFull[]) || [];
  }

  return [];
}

export function reclamoBulkConstants() {
  return { TASA_IMPORTACION, TASA_ITBMS, FACTOR_TOTAL };
}

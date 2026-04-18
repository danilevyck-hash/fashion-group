"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import { useAuth } from "@/lib/hooks/useAuth";
import { Toast, ConfirmModal } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import {
  parseMultiplePackingLists,
  buildIndex,
  validateParsedPL,
  type ParsedPackingList,
  type PLIndexRow,
  type PLValidationError,
  type RawLine,
} from "@/lib/parse-packing-list";

/** Convierte el nombre de empresa tal como está en DB a display legible.
 *  "VISTANA INTERNACIONAL PANAMA" → "Vistana"
 *  "FASHION WEAR" → "Fashion Wear"
 *  "CONFECCIONES BOSTON" → "Confecciones Boston"
 */
function displayEmpresa(raw: string | null | undefined): string {
  if (!raw) return "—";
  const upper = raw.toUpperCase();
  if (upper.includes("VISTANA")) return "Vistana";
  if (upper === "FASHION WEAR") return "Fashion Wear";
  if (upper === "FASHION SHOES") return "Fashion Shoes";
  if (upper === "ACTIVE WEAR") return "Active Wear";
  if (upper === "ACTIVE SHOES") return "Active Shoes";
  if (upper === "JOYSTEP") return "Joystep";
  if (upper === "CONFECCIONES BOSTON") return "Confecciones Boston";
  if (upper === "MULTIFASHION") return "Multifashion";
  return raw
    .toLowerCase()
    .split(/\s+/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

interface PLRecord {
  id: string;
  numero_pl: string;
  empresa: string;
  fecha_entrega: string;
  total_bultos: number;
  total_piezas: number;
  total_estilos: number;
  created_at: string;
}

export default function PackingListsPage() {
  const { authChecked, role } = useAuth({
    moduleKey: "packing-lists",
    allowedRoles: ["admin", "secretaria", "bodega", "director", "vendedor"],
  });

  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Multi-PL preview item
  interface PLPreviewItem {
    parsed: ParsedPackingList;
    index: PLIndexRow[];
    errors: PLValidationError[];
    existsInDB: boolean;
  }

  // State
  const [plList, setPlList] = useState<PLRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [previewItems, setPreviewItems] = useState<PLPreviewItem[]>([]);
  const [savedItems, setSavedItems] = useState<PLPreviewItem[]>([]); // kept after save for PDF download
  const [selectedForDownload, setSelectedForDownload] = useState<Set<string>>(new Set());
  const [expandedPreview, setExpandedPreview] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [empresaFilter, setEmpresaFilter] = useState<string>("all");
  const [debugLogs, setDebugLogs] = useState<string[]>([]);

  const canEdit = role === "admin" || role === "secretaria";

  // Counts por empresa (para KPI inline + tabs) + filtro
  const empresaCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const pl of plList) {
      const key = displayEmpresa(pl.empresa);
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [plList]);

  const filteredPlList = useMemo(() => {
    if (empresaFilter === "all") return plList;
    return plList.filter(p => displayEmpresa(p.empresa) === empresaFilter);
  }, [plList, empresaFilter]);

  // Load history
  const loadList = useCallback(async () => {
    try {
      const res = await fetch("/api/packing-lists");
      if (res.ok) {
        const data = await res.json();
        setPlList(data);
      }
    } catch {
      console.error("Failed to load packing lists");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (authChecked) loadList();
  }, [authChecked, loadList]);

  // PDF extraction — group text items by Y position to reconstruct lines
  async function extractTextFromPDF(file: File): Promise<{ text: string; rawLines: RawLine[] }> {
    const pdfjsLib = await import("pdfjs-dist");
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    let fullText = "";
    const rawLines: RawLine[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      // Group items by Y position to reconstruct lines
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const items = content.items as any[];
      // Collect all Y positions first, then cluster them (within 2px = same line)
      const pdfItems: { x: number; y: number; str: string }[] = [];
      for (const item of items) {
        if (!item.str || !item.str.trim()) continue;
        pdfItems.push({ x: item.transform[4], y: item.transform[5], str: item.str });
      }
      // Sort by Y descending to cluster from top to bottom
      pdfItems.sort((a, b) => b.y - a.y);
      // Cluster Y positions: if two Ys are within 2px, they belong to the same line
      const lineMap = new Map<number, { x: number; str: string }[]>();
      let currentClusterY = -Infinity;
      for (const item of pdfItems) {
        if (Math.abs(item.y - currentClusterY) > 2) {
          currentClusterY = item.y;
        }
        if (!lineMap.has(currentClusterY)) lineMap.set(currentClusterY, []);
        lineMap.get(currentClusterY)!.push({ x: item.x, str: item.str });
      }
      // Sort by Y descending (PDF coordinates: top = higher Y)
      const sortedYs = [...lineMap.keys()].sort((a, b) => b - a);
      for (const y of sortedYs) {
        const lineItems = lineMap.get(y)!.sort((a, b) => a.x - b.x);
        const lineText = lineItems.map(li => li.str).join("  ") + "\n";
        fullText += lineText;
        rawLines.push({
          text: lineText.trimEnd(),
          items: lineItems.map(li => ({ x: li.x, str: li.str })),
        });
      }
      fullText += "\n";
      rawLines.push({ text: "", items: [] });
    }
    return { text: fullText, rawLines };
  }

  // Handle file selection — supports multi-PL PDFs
  async function handleFile(file: File) {
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setToast("Solo se aceptan archivos PDF");
      return;
    }
    setUploading(true);
    setDebugLogs([]); // reset panel por cada nuevo PDF
    try {
      const { text, rawLines } = await extractTextFromPDF(file);
      const collected: string[] = [];
      const onDebugLog = (label: string, data: unknown) => {
        collected.push(`${label}\n${JSON.stringify(data, null, 2)}`);
      };
      const parsedList = parseMultiplePackingLists(text, rawLines, onDebugLog);
      if (collected.length > 0) setDebugLogs(collected);

      if (parsedList.length === 0 || (parsedList.length === 1 && parsedList[0].bultos.length === 0)) {
        setToast("No se detectaron Packing Lists en el PDF. Verifica el formato.");
        setUploading(false);
        return;
      }

      const existingNums = new Set(plList.map(p => p.numero_pl));
      const items: PLPreviewItem[] = parsedList
        .filter(p => p.bultos.length > 0) // skip empty sections
        .map(parsed => ({
          parsed,
          index: buildIndex(parsed),
          errors: validateParsedPL(parsed),
          existsInDB: existingNums.has(parsed.numeroPL),
        }));

      setPreviewItems(items);
      setExpandedPreview(null);
    } catch (err) {
      console.error(err);
      setToast("No se pudo leer el PDF. Intenta con otro archivo.");
    }
    setUploading(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = "";
  }

  // Save all PLs (batch)
  async function saveAllPLs() {
    if (previewItems.length === 0) return;
    setUploading(true);
    try {
      const packingLists = previewItems.map(item => ({
        numeroPL: item.parsed.numeroPL,
        empresa: item.parsed.empresa,
        fechaEntrega: item.parsed.fechaEntrega,
        totalBultos: item.parsed.totalBultos,
        totalPiezas: item.parsed.totalPiezas,
        totalEstilos: item.index.length,
        indexRows: item.index,
      }));

      const res = await fetch("/api/packing-lists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packingLists }),
      });

      if (res.ok) {
        const data = await res.json();
        const justSaved = [...previewItems];
        setSavedItems(justSaved);
        setSelectedForDownload(new Set(justSaved.map(i => i.parsed.numeroPL)));
        setPreviewItems([]);
        const saved = data.totalSaved || 0;
        const failed = data.totalFailed || 0;
        if (failed > 0) {
          const failedPLs = (data.results || []).filter((r: { error?: string }) => r.error).map((r: { numeroPL: string }) => r.numeroPL).join(", ");
          setToast(`${saved} PLs guardados, ${failed} fallaron (${failedPLs})`);
        } else {
          setToast(`${saved} Packing List${saved !== 1 ? "s" : ""} guardado${saved !== 1 ? "s" : ""}`);
        }
        loadList();
      } else {
        const err = await res.json().catch(() => ({}));
        setToast(err.error || "Error al guardar");
      }
    } catch {
      setToast("Error de conexion al guardar");
    }
    setUploading(false);
  }

  // Generate combined PDF for all saved PLs
  async function generateCombinedPDF(items: PLPreviewItem[]) {
    if (items.length === 0) return;
    const { jsPDF } = await import("jspdf");
    const autoTable = (await import("jspdf-autotable")).default;
    const { FG_LOGO_BASE64, FG_LOGO_WIDTH, FG_LOGO_HEIGHT } = await import("@/lib/pdf-logo");

    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter", putOnlyUsedFonts: true, compress: true });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const marginLeft = 14;
    const marginRight = 14;
    const contentRight = pageWidth - marginRight;

    function safe(text: string): string {
      return text.replace(/\u2014/g, "-").replace(/\u2013/g, "-").replace(/\u00B7/g, "-");
    }

    const meses = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];

    for (let plIdx = 0; plIdx < items.length; plIdx++) {
      const item = items[plIdx];
      const pl = item.parsed;
      const index = item.index;

      if (plIdx > 0) doc.addPage();

      // Header
      doc.addImage(FG_LOGO_BASE64, "JPEG", marginLeft, 10, FG_LOGO_WIDTH, FG_LOGO_HEIGHT);
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(0);
      doc.text(safe(`Indice de Estilos por Bulto - PL #${pl.numeroPL}`), marginLeft + FG_LOGO_WIDTH + 4, 16);

      let fechaDisplay = pl.fechaEntrega || "";
      if (fechaDisplay && /^\d{4}-\d{2}-\d{2}$/.test(fechaDisplay)) {
        const [y, m, d] = fechaDisplay.split("-");
        fechaDisplay = `${parseInt(d)} de ${meses[parseInt(m) - 1]} ${y}`;
      }

      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(100);
      doc.text(safe(`${pl.empresa} - ${fechaDisplay ? fechaDisplay + " - " : ""}${index.length} estilos - ${pl.totalPiezas.toLocaleString()} piezas - ${pl.totalBultos} bultos`), marginLeft + FG_LOGO_WIDTH + 4, 22);
      doc.text(safe("Muestra = bulto con talla M o 32 - OS = otro tamaño"), marginLeft + FG_LOGO_WIDTH + 4, 27);
      doc.setTextColor(0);

      let currentY = 34;

      // Section 1: Vista para muestras
      const bultoGroupsMap = new Map<string, { estilo: string; producto: string; isOS: boolean }[]>();
      for (const row of index) {
        if (!row.bultoMuestra) continue;
        if (!bultoGroupsMap.has(row.bultoMuestra)) bultoGroupsMap.set(row.bultoMuestra, []);
        bultoGroupsMap.get(row.bultoMuestra)!.push({ estilo: row.estilo, producto: row.producto, isOS: row.isOS || false });
      }
      for (const styles of bultoGroupsMap.values()) styles.sort((a, b) => a.estilo.localeCompare(b.estilo));
      const sortedBultos = [...bultoGroupsMap.entries()].sort((a, b) => parseInt(a[0]) - parseInt(b[0]));

      if (sortedBultos.length > 0) {
        doc.setFontSize(11);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(30, 58, 95);
        doc.text("Vista para sacar muestras (agrupado por bulto)", marginLeft, currentY);
        currentY += 2;
        doc.setDrawColor(30, 58, 95);
        doc.line(marginLeft, currentY, contentRight, currentY);
        currentY += 4;

        const checkboxSize = 2.8;
        const lineHeight = 4.5;
        const indentX = marginLeft + 6;

        for (const [bultoId, styles] of sortedBultos) {
          const blockHeight = lineHeight + (styles.length * lineHeight) + 3;
          if (currentY + blockHeight > pageHeight - 15) { doc.addPage(); currentY = 15; }

          doc.setDrawColor(150);
          doc.setLineWidth(0.3);
          doc.rect(marginLeft, currentY - checkboxSize + 0.5, checkboxSize, checkboxSize);
          doc.setFontSize(10);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(30, 40, 60);
          doc.text(safe(`Bulto #${bultoId}  -  ${styles.length} muestra${styles.length > 1 ? "s" : ""}`), marginLeft + checkboxSize + 2, currentY);
          currentY += lineHeight + 0.5;

          for (const style of styles) {
            doc.setDrawColor(180);
            doc.rect(indentX, currentY - checkboxSize + 0.5, checkboxSize, checkboxSize);
            doc.setFontSize(9);
            doc.setFont("courier", "normal");
            doc.setTextColor(50);
            doc.text(safe(style.estilo), indentX + checkboxSize + 2, currentY);
            const estiloWidth = doc.getTextWidth(safe(style.estilo));
            doc.setFont("helvetica", "normal");
            doc.setTextColor(100);
            const productoText = safe(` -  ${style.producto}`);
            doc.text(productoText, indentX + checkboxSize + 2 + estiloWidth, currentY);
            if (style.isOS) {
              const productoWidth = doc.getTextWidth(productoText);
              doc.setTextColor(150);
              doc.text("  - OS", indentX + checkboxSize + 2 + estiloWidth + productoWidth, currentY);
            }
            currentY += lineHeight;
          }
          currentY += 1;
          doc.setDrawColor(220);
          doc.setLineWidth(0.2);
          doc.line(marginLeft, currentY, contentRight, currentY);
          currentY += 3;
        }
      }

      // Section 2: Distribución completa
      const groupedRows: { producto: string; rows: PLIndexRow[] }[] = [];
      const sorted = [...index].sort((a, b) => a.producto.localeCompare(b.producto) || a.estilo.localeCompare(b.estilo));
      let currentProduct = "";
      for (const row of sorted) {
        if (row.producto !== currentProduct) {
          currentProduct = row.producto;
          groupedRows.push({ producto: currentProduct, rows: [] });
        }
        groupedRows[groupedRows.length - 1].rows.push(row);
      }

      if (groupedRows.length > 0) {
        currentY += 4;
        if (currentY > pageHeight - 30) { doc.addPage(); currentY = 15; }
        doc.setFontSize(11);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(30, 58, 95);
        doc.text(safe("Distribución completa por estilo"), marginLeft, currentY);
        currentY += 2;
        doc.setDrawColor(30, 58, 95);
        doc.line(marginLeft, currentY, contentRight, currentY);
        currentY += 4;

        const tableBody: (string | { content: string; colSpan?: number; styles?: Record<string, unknown> })[][] = [];
        for (const group of groupedRows) {
          tableBody.push([{ content: safe(group.producto || "SIN PRODUCTO"), colSpan: 3, styles: { fillColor: [210, 215, 225], fontStyle: "bold", fontSize: 9, textColor: [30, 40, 60] } }]);
          for (const row of group.rows) {
            const distParts = Object.entries(row.distribution).map(([bId, pcs]) => `(${bId}: ${pcs})`);
            tableBody.push([safe(row.estilo), String(row.totalPcs), distParts.join("  ")]);
          }
        }

        autoTable(doc, {
          startY: currentY,
          head: [["Estilo", { content: "Total", styles: { halign: "center" } }, "Distribución por Bulto"]],
          body: tableBody,
          headStyles: { fillColor: [30, 58, 95], textColor: 255, fontSize: 8, fontStyle: "bold" },
          styles: { fontSize: 9, cellPadding: 1.5 },
          columnStyles: { 0: { cellWidth: 32, font: "courier" }, 1: { cellWidth: 14, halign: "center" }, 2: { cellWidth: "auto" } },
          alternateRowStyles: { fillColor: [245, 245, 245] },
          margin: { left: marginLeft, right: marginRight, top: 20 },
        });
      }
    }

    // Page numbers
    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(160);
      doc.text(`${i} / ${totalPages}`, pageWidth - marginRight, 8, { align: "right" });
    }

    const pdfBlob = doc.output("blob");
    const url = URL.createObjectURL(pdfBlob);
    const a = document.createElement("a");
    a.href = url;
    const firstPL = items[0].parsed.numeroPL;
    const lastPL = items[items.length - 1].parsed.numeroPL;
    a.download = `PL-${firstPL}-a-${lastPL}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // Delete PL
  async function deletePL(id: string) {
    setDeleting(id);
    try {
      const res = await fetch(`/api/packing-lists/${id}`, { method: "DELETE" });
      if (res.ok) {
        setToast("Packing List eliminado");
        setPlList((prev) => prev.filter((p) => p.id !== id));
      } else {
        setToast("Error al eliminar");
      }
    } catch {
      setToast("Error de conexión");
    }
    setDeleting(null);
  }

  if (!authChecked) return null;

  return (
    <div>
      <AppHeader module="Packing Lists" />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Upload zone — admin/secretaria only */}
        {canEdit && previewItems.length === 0 && (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all ${
              dragOver
                ? "border-teal-500 bg-teal-50"
                : "border-gray-300 hover:border-teal-400 hover:bg-gray-50"
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              onChange={handleFileInput}
              className="hidden"
            />
            <div className="flex flex-col items-center gap-2">
              <svg
                width="40"
                height="40"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={`${dragOver ? "text-teal-500" : "text-gray-400"}`}
              >
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              <p className="text-sm font-medium text-gray-700">
                {uploading ? "Leyendo PDF..." : "Subir PDF de Packing List"}
              </p>
              <p className="text-xs text-gray-400">
                Arrastra el archivo aquí o haz clic para seleccionar
              </p>
            </div>
          </div>
        )}

        {/* Multi-PL Preview section */}
        {previewItems.length > 0 && (
          <div className="space-y-3">
            {/* Summary bar */}
            <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold">{previewItems.length} Packing List{previewItems.length !== 1 ? "s" : ""} detectado{previewItems.length !== 1 ? "s" : ""}</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  {previewItems.reduce((s, i) => s + i.parsed.totalBultos, 0)} bultos - {previewItems.reduce((s, i) => s + i.parsed.totalPiezas, 0).toLocaleString()} piezas - {previewItems.reduce((s, i) => s + i.index.length, 0)} estilos
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={saveAllPLs}
                  disabled={uploading}
                  className="px-5 py-2.5 bg-teal-600 text-white text-sm font-medium rounded-md hover:bg-teal-700 active:scale-[0.97] transition-all disabled:opacity-50 min-h-[44px]"
                >
                  {uploading ? "Guardando..." : `Guardar ${previewItems.length} PL${previewItems.length !== 1 ? "s" : ""}`}
                </button>
                <button
                  onClick={() => { setPreviewItems([]); setDebugLogs([]); }}
                  className="px-4 py-2.5 border border-gray-200 text-gray-600 text-sm rounded-md hover:bg-gray-50 transition-all min-h-[44px]"
                >
                  Cancelar
                </button>
              </div>
            </div>

            {/* Per-PL cards */}
            {previewItems.map((item, idx) => {
              const isOpen = expandedPreview === item.parsed.numeroPL;
              const hasErrors = item.errors.length > 0;
              return (
                <div key={idx} className="border border-gray-200 rounded-lg overflow-hidden">
                  {/* PL header — click to expand */}
                  <button
                    onClick={() => setExpandedPreview(isOpen ? null : item.parsed.numeroPL)}
                    className="w-full flex items-center justify-between px-4 py-3 bg-white hover:bg-gray-50 transition text-left"
                  >
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="text-sm font-bold">PL #{item.parsed.numeroPL || "—"}</span>
                      <span className="text-xs text-gray-500">{item.parsed.empresa}</span>
                      <span className="text-xs text-gray-400">{item.parsed.fechaEntrega}</span>
                      <span className="text-xs text-gray-500">{item.parsed.totalBultos} bultos</span>
                      <span className="text-xs text-gray-500">{item.parsed.totalPiezas.toLocaleString()} pzas</span>
                      <span className="text-xs text-gray-500">{item.index.length} estilos</span>
                      {!hasErrors && item.parsed.totalBultos > 0 && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">OK</span>
                      )}
                      {hasErrors && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">{item.errors.length} error{item.errors.length !== 1 ? "es" : ""}</span>
                      )}
                      {item.existsInDB && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">Ya existe - se actualizara</span>
                      )}
                    </div>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`text-gray-400 transition-transform flex-shrink-0 ${isOpen ? "rotate-180" : ""}`}>
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </button>

                  {/* Expandable detail */}
                  {isOpen && (
                    <div className="px-4 py-3 border-t border-gray-200 space-y-3">
                      {/* Validation */}
                      {hasErrors && (
                        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                          <p className="text-xs font-semibold text-red-700 mb-1">Errores de validacion ({item.errors.length} bultos no cuadran)</p>
                          <div className="text-xs text-red-600 space-y-0.5">
                            {item.errors.map(e => (
                              <p key={e.bultoId}>Bulto {e.bultoId}: PDF dice {e.pdfTotal} piezas, parser calculo {e.parserTotal} (dif: {e.diff})</p>
                            ))}
                          </div>
                        </div>
                      )}
                      {/* Estilos table */}
                      {item.index.length > 0 && (
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="bg-[#1e3a5f] text-white">
                                <th className="text-left px-3 py-2 font-medium text-xs">Estilo</th>
                                <th className="text-right px-3 py-2 font-medium text-xs">Total</th>
                                <th className="text-left px-3 py-2 font-medium text-xs">Muestra</th>
                                <th className="text-left px-3 py-2 font-medium text-xs">Distribucion</th>
                              </tr>
                            </thead>
                            <tbody>
                              {item.index.slice(0, 10).map((row, i) => (
                                <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                                  <td className="px-3 py-1.5 font-mono text-xs">{row.estilo}</td>
                                  <td className="px-3 py-1.5 text-xs text-right tabular-nums">{row.totalPcs}</td>
                                  <td className="px-3 py-1.5 text-xs font-mono text-gray-600">{row.bultoMuestra || "-"}</td>
                                  <td className="px-3 py-1.5 text-xs">
                                    <div className="flex flex-wrap gap-1">
                                      {Object.entries(row.distribution).map(([bultoId, pcs]) => (
                                        <span key={bultoId} className="inline-block px-1.5 py-0.5 rounded text-[11px] bg-gray-100 text-gray-600">({bultoId}: {pcs})</span>
                                      ))}
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {item.index.length > 10 && (
                            <p className="text-xs text-gray-400 mt-2 text-center">Mostrando 10 de {item.index.length} estilos</p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Debug panel temporal — bug parser FW bultos 547946/547949 */}
        {debugLogs.length > 0 && (
          <div className="mt-4 bg-black text-green-300 text-xs font-mono p-3 rounded max-h-96 overflow-auto whitespace-pre-wrap">
            <div className="flex items-center justify-between mb-2 text-green-400">
              <span>[DEBUG] {debugLogs.length} entries</span>
              <button onClick={() => setDebugLogs([])} className="text-green-500 hover:text-green-300">× cerrar</button>
            </div>
            {debugLogs.map((log, i) => (
              <div key={i} className="mb-2 pb-2 border-b border-green-900">{log}</div>
            ))}
          </div>
        )}

        {/* Post-save: select and download PLs */}
        {savedItems.length > 0 && previewItems.length === 0 && (() => {
          const selectedItems = savedItems.filter(i => selectedForDownload.has(i.parsed.numeroPL));
          const allSelected = selectedForDownload.size === savedItems.length;
          return (
            <div className="border border-green-200 rounded-lg overflow-hidden">
              <div className="bg-green-50 px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={() => {
                      if (allSelected) setSelectedForDownload(new Set());
                      else setSelectedForDownload(new Set(savedItems.map(i => i.parsed.numeroPL)));
                    }}
                    className="accent-teal-600 w-4 h-4"
                  />
                  <div>
                    <p className="text-sm font-medium text-green-800">{savedItems.length} PL{savedItems.length !== 1 ? "s" : ""} guardado{savedItems.length !== 1 ? "s" : ""}</p>
                    <p className="text-xs text-green-600">{selectedItems.length} seleccionado{selectedItems.length !== 1 ? "s" : ""} para descargar</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => generateCombinedPDF(selectedItems)}
                    disabled={selectedItems.length === 0}
                    className="flex items-center gap-1.5 px-4 py-2 bg-teal-600 text-white text-sm font-medium rounded-md hover:bg-teal-700 active:scale-[0.97] transition-all disabled:opacity-50 min-h-[44px]"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                    Descargar PDF{selectedItems.length !== 1 ? ` (${selectedItems.length})` : ""}
                  </button>
                  <button onClick={() => setSavedItems([])} className="text-xs text-gray-400 hover:text-gray-600 transition px-2">
                    Cerrar
                  </button>
                </div>
              </div>
              <div className="divide-y divide-gray-100">
                {savedItems.map((item) => {
                  const checked = selectedForDownload.has(item.parsed.numeroPL);
                  return (
                    <label key={item.parsed.numeroPL} className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition cursor-pointer">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          const next = new Set(selectedForDownload);
                          if (checked) next.delete(item.parsed.numeroPL);
                          else next.add(item.parsed.numeroPL);
                          setSelectedForDownload(next);
                        }}
                        className="accent-teal-600 w-3.5 h-3.5"
                      />
                      <span className="text-sm font-medium">PL #{item.parsed.numeroPL}</span>
                      <span className="text-xs text-gray-500">{item.parsed.empresa}</span>
                      <span className="text-xs text-gray-400">{item.parsed.totalBultos} bultos</span>
                      <span className="text-xs text-gray-400">{item.parsed.totalPiezas.toLocaleString()} pzas</span>
                      <span className="text-xs text-gray-400">{item.index.length} estilos</span>
                    </label>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* History */}
        <div>
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <h2 className="text-sm font-semibold">Historial</h2>
            {plList.length > 0 && (
              <p className="text-xs text-gray-400">
                {empresaCounts.map(([e, c], i) => (
                  <span key={e}>
                    {i > 0 && " · "}
                    {e}: {c} PL{c !== 1 ? "s" : ""}
                  </span>
                ))}
                {empresaCounts.length > 1 && ` · Total: ${plList.length}`}
              </p>
            )}
          </div>
          {empresaCounts.length > 1 && (
            <div className="flex gap-2 mb-3 flex-wrap">
              <button
                onClick={() => setEmpresaFilter("all")}
                className={`text-xs px-3 py-1.5 rounded-full border transition ${empresaFilter === "all" ? "bg-black text-white border-black" : "border-gray-200 text-gray-600 hover:border-gray-400"}`}
              >
                Todos <span className="opacity-60">({plList.length})</span>
              </button>
              {empresaCounts.map(([e, c]) => (
                <button
                  key={e}
                  onClick={() => setEmpresaFilter(e)}
                  className={`text-xs px-3 py-1.5 rounded-full border transition ${empresaFilter === e ? "bg-black text-white border-black" : "border-gray-200 text-gray-600 hover:border-gray-400"}`}
                >
                  {e} <span className="opacity-60">({c})</span>
                </button>
              ))}
            </div>
          )}
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-14 rounded-lg bg-gray-50 border border-gray-200 animate-pulse"
                />
              ))}
            </div>
          ) : filteredPlList.length === 0 && plList.length > 0 ? (
            <p className="text-xs text-gray-400 py-8 text-center">No hay PLs de {empresaFilter}</p>
          ) : plList.length === 0 ? (
            <div className="text-center py-12 border border-gray-200 rounded-lg">
              <p className="text-sm text-gray-500">
                No hay packing lists registrados
              </p>
              {canEdit && (
                <p className="text-xs text-gray-400 mt-1">
                  Sube un PDF para comenzar
                </p>
              )}
            </div>
          ) : (
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="text-left px-3 py-2 font-medium text-xs text-gray-500">PL #</th>
                      <th className="text-left px-3 py-2 font-medium text-xs text-gray-500">Empresa</th>
                      <th className="text-left px-3 py-2 font-medium text-xs text-gray-500 hidden sm:table-cell">
                        Fecha Entrega
                      </th>
                      <th className="text-right px-3 py-2 font-medium text-xs text-gray-500">Bultos</th>
                      <th className="text-right px-3 py-2 font-medium text-xs text-gray-500">Piezas</th>
                      <th className="text-right px-3 py-2 font-medium text-xs text-gray-500 hidden sm:table-cell">
                        Estilos
                      </th>
                      <th className="text-left px-3 py-2 font-medium text-xs text-gray-500 hidden lg:table-cell">
                        Creado
                      </th>
                      {canEdit && <th className="px-3 py-2 w-10" />}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPlList.map((pl) => (
                      <tr
                        key={pl.id}
                        className="border-b border-gray-100 last:border-0 hover:bg-gray-50 transition cursor-pointer"
                        onClick={() => router.push(`/packing-lists/${pl.id}`)}
                      >
                        <td className="px-3 py-2.5 font-medium">{pl.numero_pl || "—"}</td>
                        <td className="px-3 py-2.5 text-gray-600">
                          <span className="inline-block px-2 py-0.5 rounded-full text-[11px] bg-teal-50 text-teal-700 border border-teal-100">
                            {displayEmpresa(pl.empresa)}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-gray-600 hidden sm:table-cell">
                          {pl.fecha_entrega || "—"}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{pl.total_bultos}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">
                          {pl.total_piezas.toLocaleString()}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums hidden sm:table-cell">
                          {pl.total_estilos}
                        </td>
                        <td className="px-3 py-2.5 text-gray-400 text-xs hidden lg:table-cell">
                          {new Date(pl.created_at).toLocaleDateString("es-PA", { day: "numeric", month: "short", year: "numeric" })}
                        </td>
                        {canEdit && (
                          <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => setConfirmDeleteId(pl.id)}
                              disabled={deleting === pl.id}
                              className="text-gray-300 hover:text-red-500 transition p-1"
                              title="Eliminar"
                            >
                              <svg
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <polyline points="3 6 5 6 21 6" />
                                <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                              </svg>
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      <Toast message={toast} />
      <ConfirmModal
        open={!!confirmDeleteId}
        onClose={() => setConfirmDeleteId(null)}
        onConfirm={() => {
          if (confirmDeleteId) {
            const id = confirmDeleteId;
            setConfirmDeleteId(null);
            deletePL(id);
          }
        }}
        title="Eliminar Packing List"
        message={(() => {
          const pl = plList.find(p => p.id === confirmDeleteId);
          return pl ? `¿Eliminar PL ${pl.numero_pl || "—"}? No se puede deshacer.` : "";
        })()}
        confirmLabel="Eliminar"
        destructive
      />
    </div>
  );
}

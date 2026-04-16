"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import { useAuth } from "@/lib/hooks/useAuth";
import { Toast } from "@/components/ui";
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
  const [expandedPreview, setExpandedPreview] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const canEdit = role === "admin" || role === "secretaria";

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
    try {
      const { text, rawLines } = await extractTextFromPDF(file);
      const parsedList = parseMultiplePackingLists(text, rawLines);

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
                  onClick={() => setPreviewItems([])}
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

        {/* History */}
        <div>
          <h2 className="text-sm font-semibold mb-3">Historial</h2>
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-14 rounded-lg bg-gray-50 border border-gray-200 animate-pulse"
                />
              ))}
            </div>
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
                    {plList.map((pl) => (
                      <tr
                        key={pl.id}
                        className="border-b border-gray-100 last:border-0 hover:bg-gray-50 transition cursor-pointer"
                        onClick={() => router.push(`/packing-lists/${pl.id}`)}
                      >
                        <td className="px-3 py-2.5 font-medium">{pl.numero_pl || "—"}</td>
                        <td className="px-3 py-2.5 text-gray-600">{pl.empresa || "—"}</td>
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
                              onClick={() => deletePL(pl.id)}
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
    </div>
  );
}

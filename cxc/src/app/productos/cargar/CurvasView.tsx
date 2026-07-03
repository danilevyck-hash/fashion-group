"use client";

// Pestaña "Curvas" — del Excel crudo de Fashion Shoes genera el detalle POR BULTO
// (qué tallas trae cada bulto) para enviárselo al cliente. La secretaria sube el
// archivo, marca las combinaciones referencia+curva que quiere y descarga un
// Excel con una sección por combinación. NO toca el Depurador ni su lógica.

import { useMemo, useRef, useState } from "react";
import { UploadCloud, Download, AlertTriangle, X } from "lucide-react";
import type { NamedSheet } from "@/lib/depurador/logic";
import {
  parseCurvas, pickCurvasSheet, buildCurvasAoa, curvasFilename,
  type Curva, type CurvasResult,
} from "@/lib/depurador/curvas";

const keyDe = (c: Curva) => `${c.referencia}|||${c.codigo}`;

export default function CurvasView() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState("");
  const [result, setResult] = useState<CurvasResult | null>(null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [downloading, setDownloading] = useState(false);

  const handleFile = async (file: File) => {
    setFileName(file.name);
    try {
      const buf = await file.arrayBuffer();
      const XLSX = (await import("xlsx-js-style")).default;
      const wb = XLSX.read(buf, { type: "array" });
      const sheets: NamedSheet[] = wb.SheetNames.map((name: string) => ({
        name,
        rows: XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: null }) as NamedSheet["rows"],
      }));
      const best = pickCurvasSheet(sheets);
      if (!best) throw new Error("No encontré ninguna hoja con datos de curvas (prepack).");
      const r = parseCurvas(best);
      setResult(r);
      setSelected(new Set()); // arranca sin selección
      setError("");
    } catch (err) {
      setResult(null);
      setSelected(new Set());
      setError(err instanceof Error ? err.message : "Error inesperado al leer el archivo.");
    }
  };

  const reset = () => {
    setResult(null);
    setError("");
    setFileName("");
    setSelected(new Set());
    if (inputRef.current) inputRef.current.value = "";
  };

  // Agrupar curvas por referencia para el render (una tarjeta por referencia).
  const porReferencia = useMemo(() => {
    const map = new Map<string, Curva[]>();
    for (const c of result?.curvas ?? []) {
      if (!map.has(c.referencia)) map.set(c.referencia, []);
      map.get(c.referencia)!.push(c);
    }
    return [...map.entries()];
  }, [result]);

  const toggle = (k: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  };
  const allKeys = useMemo(() => (result?.curvas ?? []).map(keyDe), [result]);
  const allSelected = allKeys.length > 0 && allKeys.every((k) => selected.has(k));

  const download = async () => {
    if (!result || selected.size === 0 || downloading) return;
    setDownloading(true);
    try {
      const seleccion = result.curvas.filter((c) => selected.has(keyDe(c)));
      const { aoa, meta } = buildCurvasAoa(seleccion);
      const XLSX = (await import("xlsx-js-style")).default;
      const ws = XLSX.utils.aoa_to_sheet(aoa);

      const range = XLSX.utils.decode_range(ws["!ref"] as string);
      const headerSet = new Set(meta.headerRows);
      for (let R = 0; R <= range.e.r; R++) {
        for (let C = 0; C <= range.e.c; C++) {
          const addr = XLSX.utils.encode_cell({ r: R, c: C });
          if (!ws[addr]) continue;
          if (headerSet.has(R)) {
            ws[addr].s = { font: { bold: true }, border: { bottom: { style: "thin", color: { rgb: "999999" } } } };
          } else if (C === 2) {
            // Código de barra como TEXTO (evita notación científica del EAN).
            ws[addr].t = "s";
            ws[addr].v = String(ws[addr].v);
            ws[addr].z = "@";
          }
        }
      }
      ws["!cols"] = [{ wch: 18 }, { wch: 10 }, { wch: 18 }, { wch: 10 }];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "curvas");
      XLSX.writeFile(wb, curvasFilename(seleccion));
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <div className="mb-5 border-b-2 border-stone-900 pb-4">
        <h2 className="font-serif text-2xl font-semibold tracking-tight text-stone-900">Tallas por bulto</h2>
        <p className="mt-1.5 text-sm text-stone-500">
          Sube el Excel crudo de Fashion Shoes (con CODIGO_PREPACK), marca las curvas que quieres y
          descarga el detalle de tallas por bulto para enviarlo al cliente.
        </p>
      </div>

      {/* Dropzone (mismo patrón del Depurador) */}
      {!result && (
        <label
          onDragEnter={(e) => { e.preventDefault(); setDragging(true); }}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={(e) => { e.preventDefault(); setDragging(false); }}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
          }}
          className={`mb-4 flex cursor-pointer flex-col items-center rounded-xl border-2 border-dashed px-6 py-6 text-center transition ${
            dragging ? "border-teal-600 bg-teal-50" : "border-stone-300 bg-white hover:border-teal-600 hover:bg-teal-50"
          }`}
        >
          <UploadCloud className="mb-2 h-7 w-7 text-teal-800" strokeWidth={1.6} />
          <div className="text-base font-semibold text-stone-900">
            {fileName || "Suelta el archivo aquí o haz clic para buscar"}
          </div>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }}
          />
        </label>
      )}

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {result && (
        <>
          {/* Barra de acciones */}
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <button
              onClick={download}
              disabled={selected.size === 0 || downloading}
              className="flex items-center gap-2 rounded-md bg-black px-5 py-2.5 text-sm font-medium text-white transition-all hover:bg-gray-800 active:scale-[0.97] disabled:opacity-40"
            >
              <Download className="h-4 w-4" strokeWidth={2} />
              {downloading ? "Generando…" : `Descargar Excel (${selected.size})`}
            </button>
            <button
              onClick={() => setSelected(allSelected ? new Set() : new Set(allKeys))}
              className="rounded-md border border-stone-300 bg-white px-4 py-2.5 text-sm font-medium text-stone-700 transition hover:bg-stone-50"
            >
              {allSelected ? "Quitar selección" : "Seleccionar todas"}
            </button>
            <div className="ml-auto flex items-center gap-2 text-xs text-stone-500">
              <span className="max-w-[220px] truncate">{fileName}</span>
              <button onClick={reset} title="Quitar archivo" className="rounded p-1 text-stone-400 transition hover:bg-stone-100 hover:text-stone-700">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {result.warnings.map((w, i) => (
            <div key={i} className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-[13px] text-amber-800">{w}</div>
          ))}

          {/* Una tarjeta por referencia, sus curvas adentro */}
          {porReferencia.map(([ref, curvas]) => (
            <div key={ref} className="mb-4 overflow-hidden rounded-xl border border-stone-200 bg-white">
              <div className="border-b border-stone-200 bg-stone-50 px-4 py-2.5">
                <span className="text-sm font-semibold text-stone-900">{ref}</span>
                {curvas[0]?.estilo && <span className="ml-2 text-[13px] text-stone-500">{curvas[0].estilo}</span>}
              </div>
              {curvas.map((c) => {
                const k = keyDe(c);
                const checked = selected.has(k);
                return (
                  <label
                    key={k}
                    className={`flex cursor-pointer flex-wrap items-center gap-3 border-b border-stone-100 px-4 py-3 transition last:border-b-0 ${
                      checked ? "bg-teal-50/60" : "hover:bg-stone-50"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(k)}
                      className="h-4 w-4 accent-teal-600"
                    />
                    <span className="w-14 text-sm font-semibold text-stone-900">{c.codigo}</span>
                    <span className="text-[13px] text-stone-500 tabular-nums">
                      {c.bultos} bultos · {c.ordXPp} pzs/bulto · {c.totalPiezas} pzs
                    </span>
                    <span className="flex flex-wrap gap-1.5">
                      {c.tallas.map((t) => (
                        <span key={t.talla} className="rounded-md border border-stone-200 bg-stone-50 px-2 py-0.5 font-mono text-[12px] text-stone-700">
                          {t.talla}×{t.porBulto}
                        </span>
                      ))}
                    </span>
                    {!c.cuadra && (
                      <span className="ml-auto flex items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[12px] font-medium text-amber-800">
                        <AlertTriangle className="h-3.5 w-3.5" strokeWidth={2} />
                        No cuadra — revisar
                      </span>
                    )}
                    {!c.cuadra && c.avisos.length > 0 && (
                      <span className="w-full pl-7 text-[12px] text-amber-700">{c.avisos.join(" ")}</span>
                    )}
                  </label>
                );
              })}
            </div>
          ))}
        </>
      )}
    </div>
  );
}

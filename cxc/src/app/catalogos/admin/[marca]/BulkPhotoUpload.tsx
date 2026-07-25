"use client";

import { useMemo, useRef, useState } from "react";
import { validateProductPhoto, uploadProductPhoto } from "./photoUpload";
import type { MarcaUiKey } from "@/lib/catalogo/marcas-ui";

// Subida MASIVA de fotos: soltar/seleccionar muchas a la vez y asignarlas al
// producto cuyo SKU = nombre del archivo. Match case-insensitive con tolerancia
// a sufijos simples ("GH8228 (1).jpg", "GH8228-1.jpg" → GH8228). Preview antes de
// escribir; sin match NO se sube y se lista. Reusa el uploader del catálogo
// (compresión 1600px/JPEG + estado por foto, sin fallos silenciosos).

interface MatchProduct {
  id: string;
  sku: string | null;
  name: string;
  image_url: string | null;
}

type UpStatus = "pending" | "uploading" | "ok" | "error";

interface MatchedItem {
  file: File;
  product: MatchProduct;
  reemplaza: boolean; // el producto ya tenía foto
  status: UpStatus;
  error?: string;
}

interface Assignment {
  matched: MatchedItem[];
  unmatched: { file: File; tried: string }[];
}

// SKU candidato desde el nombre de archivo. Exacto primero; luego tolera sufijos.
function skuCandidates(filename: string): string[] {
  const base = filename.replace(/\.[^.]+$/, "").trim();
  const out: string[] = [];
  const push = (s: string) => { const u = s.trim().toUpperCase(); if (u && !out.includes(u)) out.push(u); };
  push(base);                                   // exacto
  push(base.replace(/\s*\(\d+\)\s*$/, ""));     // "GH8228 (1)" → GH8228
  push(base.replace(/[\s_-]+\d+\s*$/, ""));     // "GH8228-1" / "GH8228_1" / "GH8228 1" → GH8228
  push(base.replace(/\s+/g, ""));               // "GH 8228" → GH8228
  return out;
}

function assign(files: File[], products: MatchProduct[]): Assignment {
  const bySku = new Map<string, MatchProduct>();
  for (const p of products) if (p.sku) bySku.set(p.sku.trim().toUpperCase(), p);

  const matched: MatchedItem[] = [];
  const unmatched: { file: File; tried: string }[] = [];
  const usedFor = new Map<string, File>(); // productId → primer archivo (evita doble asignación)

  for (const file of files) {
    const cands = skuCandidates(file.name);
    const hit = cands.map((c) => bySku.get(c)).find(Boolean);
    if (!hit) { unmatched.push({ file, tried: cands[0] || file.name }); continue; }
    if (usedFor.has(hit.id)) {
      // Dos archivos al mismo producto → el 2do queda sin asignar (evita pisar).
      unmatched.push({ file, tried: `${hit.sku} (ya asignado a ${usedFor.get(hit.id)!.name})` });
      continue;
    }
    usedFor.set(hit.id, file);
    matched.push({ file, product: hit, reemplaza: !!(hit.image_url && hit.image_url.trim()), status: "pending" });
  }
  return { matched, unmatched };
}

export default function BulkPhotoUpload({
  marca, products, onDone, showToast,
}: {
  marca: MarcaUiKey;
  products: MatchProduct[];
  onDone: () => Promise<void>;
  showToast: (msg: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [uploading, setUploading] = useState(false);
  const [done, setDone] = useState(false);

  const counts = useMemo(() => {
    if (!assignment) return { matched: 0, unmatched: 0, reemplaza: 0 };
    return {
      matched: assignment.matched.length,
      unmatched: assignment.unmatched.length,
      reemplaza: assignment.matched.filter((m) => m.reemplaza).length,
    };
  }, [assignment]);

  function ingest(fileList: FileList | null) {
    const all = Array.from(fileList ?? []);
    // Solo imágenes válidas (tipo/tamaño); las inválidas van a "sin match" con motivo.
    const images: File[] = [];
    const rejected: { file: File; tried: string }[] = [];
    for (const f of all) {
      const v = validateProductPhoto(f);
      if (v) rejected.push({ file: f, tried: v });
      else images.push(f);
    }
    const a = assign(images, products);
    a.unmatched.push(...rejected);
    setAssignment(a);
    setDone(false);
  }

  function reset() {
    setAssignment(null);
    setDone(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function handleUpload() {
    if (!assignment || assignment.matched.length === 0 || uploading) return;
    setUploading(true);
    let okCount = 0;
    let errCount = 0;
    // Secuencial: estado por foto, sin saturar la red ni el endpoint.
    for (let i = 0; i < assignment.matched.length; i++) {
      const item = assignment.matched[i];
      setAssignment((prev) => prev ? { ...prev, matched: prev.matched.map((m, j) => j === i ? { ...m, status: "uploading", error: undefined } : m) } : prev);
      try {
        await uploadProductPhoto(marca, { id: item.product.id, sku: item.product.sku || "" }, item.file);
        okCount++;
        setAssignment((prev) => prev ? { ...prev, matched: prev.matched.map((m, j) => j === i ? { ...m, status: "ok" } : m) } : prev);
      } catch (e) {
        errCount++;
        const msg = e instanceof Error ? e.message : "No se pudo subir.";
        setAssignment((prev) => prev ? { ...prev, matched: prev.matched.map((m, j) => j === i ? { ...m, status: "error", error: msg } : m) } : prev);
      }
    }
    setUploading(false);
    setDone(true);
    showToast(errCount === 0 ? `${okCount} fotos subidas` : `${okCount} subidas, ${errCount} con error`);
    await onDone();
  }

  return (
    <div className="mb-6 rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div>
          <h3 className="text-sm font-semibold text-[#1A2656]">Subir fotos masivo</h3>
          <p className="text-xs text-gray-400">El nombre del archivo debe ser el código (SKU). Ej. <span className="font-medium">GH8228.jpg</span></p>
        </div>
        {assignment && (
          <button onClick={reset} disabled={uploading} className="text-xs text-gray-400 hover:text-gray-700 disabled:opacity-50">Limpiar</button>
        )}
      </div>

      {/* Zona de drop / selector */}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => ingest(e.target.files)}
      />
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); ingest(e.dataTransfer.files); }}
        className={`cursor-pointer rounded-lg border-2 border-dashed px-4 py-6 text-center transition ${
          dragOver ? "border-[#1A2656] bg-[#1A2656]/5" : "border-gray-300 hover:border-gray-400"
        }`}
      >
        <svg className="w-7 h-7 mx-auto text-gray-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.9A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 13l3-3m0 0l3 3m-3-3v9" />
        </svg>
        <p className="text-sm text-gray-600 font-medium">Arrastra las fotos aquí o haz clic para seleccionar</p>
        <p className="text-xs text-gray-400 mt-0.5">Puedes soltar muchas a la vez (20+)</p>
      </div>

      {/* Preview de asignación */}
      {assignment && (
        <div className="mt-4">
          <div className="flex flex-wrap gap-2 text-xs mb-3">
            <span className="px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 font-medium">{counts.matched} coinciden</span>
            {counts.reemplaza > 0 && <span className="px-2 py-1 rounded-full bg-amber-50 text-amber-700 font-medium">{counts.reemplaza} reemplazan foto existente</span>}
            {counts.unmatched > 0 && <span className="px-2 py-1 rounded-full bg-red-50 text-red-700 font-medium">{counts.unmatched} sin coincidencia</span>}
          </div>

          {/* Coincidencias */}
          {assignment.matched.length > 0 && (
            <div className="rounded-lg border border-gray-200 divide-y divide-gray-100 max-h-72 overflow-y-auto">
              {assignment.matched.map((m, i) => (
                <div key={i} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <StatusDot status={m.status} />
                  <span className="font-mono text-xs text-gray-500 shrink-0">{m.file.name}</span>
                  <svg className="w-3.5 h-3.5 text-gray-300 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7-7 7M3 12h18" /></svg>
                  <span className="text-[#1A2656] font-medium truncate">{m.product.sku} · {m.product.name}</span>
                  {m.reemplaza && m.status === "pending" && <span className="ml-auto shrink-0 text-[11px] text-amber-600 font-medium">reemplaza</span>}
                  {m.status === "error" && <span className="ml-auto shrink-0 text-[11px] text-[#E4002B]">{m.error}</span>}
                </div>
              ))}
            </div>
          )}

          {/* Sin coincidencia — no se suben */}
          {assignment.unmatched.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-medium text-red-600 mb-1">No se subirán (no coincide ningún producto):</p>
              <ul className="rounded-lg border border-red-100 bg-red-50/40 divide-y divide-red-100 max-h-40 overflow-y-auto">
                {assignment.unmatched.map((u, i) => (
                  <li key={i} className="px-3 py-1.5 text-xs text-red-700 flex items-center justify-between gap-2">
                    <span className="font-mono truncate">{u.file.name}</span>
                    <span className="text-red-400 shrink-0">{u.tried}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Acciones */}
          {!done && (
            <div className="flex items-center gap-3 mt-4">
              <button
                onClick={handleUpload}
                disabled={uploading || assignment.matched.length === 0}
                className="px-5 py-2.5 rounded-md bg-[#1A2656] text-white text-sm font-semibold hover:bg-[#1A2656]/90 active:scale-[0.97] transition disabled:opacity-50"
              >
                {uploading ? "Subiendo…" : `Subir ${assignment.matched.length} foto${assignment.matched.length === 1 ? "" : "s"}`}
              </button>
              {!uploading && <button onClick={reset} className="text-sm text-gray-400 hover:text-gray-700">Cancelar</button>}
            </div>
          )}
          {done && (
            <div className="flex items-center gap-3 mt-4">
              <span className="text-sm text-emerald-700 font-medium">Listo.</span>
              <button onClick={reset} className="text-sm text-gray-500 hover:text-gray-800">Subir más</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatusDot({ status }: { status: UpStatus }) {
  if (status === "uploading") return <span className="w-4 h-4 shrink-0 border-2 border-[#1A2656] border-t-transparent rounded-full animate-spin" />;
  if (status === "ok") return (
    <span className="w-4 h-4 shrink-0 rounded-full bg-emerald-500 flex items-center justify-center">
      <svg width="9" height="7" viewBox="0 0 10 8" fill="none"><path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" /></svg>
    </span>
  );
  if (status === "error") return <span className="w-4 h-4 shrink-0 rounded-full bg-[#E4002B] flex items-center justify-center text-white text-[10px] font-bold leading-none">!</span>;
  return <span className="w-4 h-4 shrink-0 rounded-full border-2 border-gray-300" />;
}

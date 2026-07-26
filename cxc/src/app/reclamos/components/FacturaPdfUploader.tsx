"use client";

import { useRef, useState, type DragEvent } from "react";
import { useToast } from "@/components/ToastSystem";
import { PdfLightbox } from "@/components/ui";

const MAX_MB = 10;

// Campos que la IA puede extraer de la factura (cualquiera puede ser null).
export interface FacturaIAData {
  proveedor: string | null;
  marca: string | null;
  nro_factura: string | null;
  fecha_factura: string | null;
  nro_orden_compra: string | null;
}

interface Props {
  /** Signed URL del PDF ya guardado (habilita "Ver factura"). null si aún no hay. */
  pdfUrl?: string | null;
  /** Path interno del PDF subido (se guarda en reclamos.factura_pdf_path). */
  onUploaded: (path: string) => void;
  /** Campos extraídos por la IA. La IA NUNCA bloquea el flujo. */
  onExtracted: (data: FacturaIAData) => void;
}

// Uploader de PDF de factura para reclamos: sube al bucket privado, llama a la
// IA para pre-llenar la cabecera y deja "Ver factura" si ya hay PDF. Dropzone
// propio en franja compacta (drag-and-drop + click) para que el detalle en
// edición quepa en un pantallazo.
export default function FacturaPdfUploader({ pdfUrl, onUploaded, onExtracted }: Props) {
  const { toast } = useToast();
  const [leyendoIA, setLeyendoIA] = useState(false);
  const [pdfLightbox, setPdfLightbox] = useState<string | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (file: File): Promise<void> => {
    // 1) Signed upload URL al bucket privado.
    const urlRes = await fetch("/api/reclamos/factura-pdf/upload-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename: file.name }),
    });
    if (!urlRes.ok) {
      const e = await urlRes.json().catch(() => null);
      throw new Error(e?.error || "No se pudo preparar la subida del PDF.");
    }
    const { uploadUrl, path } = (await urlRes.json()) as { uploadUrl: string; path: string };

    // 2) Subir el archivo al storage.
    const put = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": "application/pdf" },
      body: file,
    });
    if (!put.ok) throw new Error("No se pudo subir el PDF. Intenta de nuevo.");
    onUploaded(path);

    // 3) Leer con IA (nunca bloquea: si falla, el usuario llena a mano).
    setLeyendoIA(true);
    try {
      const iaRes = await fetch("/api/reclamos/ia/leer-factura", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path }),
      });
      if (iaRes.ok) {
        const data = (await iaRes.json()) as FacturaIAData;
        onExtracted(data);
        toast("Datos pre-llenados con IA. Revísalos.", "success");
      } else {
        toast("No pudimos leer el PDF — llena los campos a mano.", "warning");
      }
    } catch {
      toast("No pudimos leer el PDF — llena los campos a mano.", "warning");
    } finally {
      setLeyendoIA(false);
    }
  };

  function validar(file: File): string | null {
    const esPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    if (!esPdf) return "Ese archivo no es un PDF.";
    if (file.size > MAX_MB * 1024 * 1024) return `El PDF pesa más de ${MAX_MB}MB. Intenta uno más liviano.`;
    return null;
  }

  async function procesar(file: File) {
    const err = validar(file);
    if (err) { toast(err, "error"); return; }
    setSubiendo(true);
    try {
      await handleUpload(file);
    } catch (e) {
      toast(e instanceof Error ? e.message : "No se pudo subir el PDF.", "error");
    } finally {
      setSubiendo(false);
    }
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault(); e.stopPropagation(); setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) procesar(file);
  }
  function onDragOver(e: DragEvent<HTMLDivElement>) { e.preventDefault(); e.stopPropagation(); if (!dragging) setDragging(true); }
  function onDragLeave(e: DragEvent<HTMLDivElement>) { e.preventDefault(); e.stopPropagation(); setDragging(false); }

  return (
    <div className="space-y-2">
      {pdfUrl && (
        <div className="flex items-center justify-between gap-2 rounded-md border border-gray-200 bg-white px-2.5 py-2">
          <span className="text-xs text-gray-600 truncate flex items-center gap-1.5 min-w-0">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-gray-400 shrink-0">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            <span className="truncate">Factura PDF adjunta</span>
          </span>
          <button
            type="button"
            onClick={() => setPdfLightbox(pdfUrl)}
            /* py-1 sobre text-xs dejaba el botón en ~24 px de alto. */
            className="text-xs font-medium text-gray-700 hover:text-black border border-gray-200 rounded px-3 active:scale-[0.97] transition shrink-0 inline-flex items-center justify-center min-h-[44px]"
          >
            Ver factura
          </button>
        </div>
      )}
      {/* Franja compacta: drag-and-drop + click. Reemplaza el dropzone alto del
          PdfUploader de Marketing para que el detalle en edición quepa en un
          pantallazo. Misma lógica de subida + IA (handleUpload). */}
      <div
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        className={`flex items-center gap-2 rounded-md border border-dashed px-3 py-2 transition ${
          dragging ? "border-fuchsia-400 bg-fuchsia-50" : "border-gray-300 bg-white hover:border-gray-400"
        }`}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-gray-400 shrink-0">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
        <span className="text-xs text-gray-500 flex-1 truncate">
          {subiendo
            ? "Subiendo…"
            : dragging
              ? "Suelta el PDF aquí"
              : `Arrastra o elige el PDF de la factura (máx ${MAX_MB}MB)`}
        </span>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) procesar(f); e.target.value = ""; }}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={subiendo}
          /* Medía 102.4×28: en iPhone el único modo de elegir el PDF es este
             botón (no hay drag-and-drop), así que tiene que ser tocable. */
          className="text-xs font-medium border border-gray-200 rounded px-3 text-gray-600 hover:text-black active:scale-[0.97] transition shrink-0 disabled:opacity-50 inline-flex items-center justify-center min-h-[44px]"
        >
          {pdfUrl ? "Reemplazar" : "Elegir archivo"}
        </button>
      </div>
      {leyendoIA && (
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
          Leyendo PDF con IA…
        </div>
      )}
      <PdfLightbox src={pdfLightbox} titulo="Factura" onClose={() => setPdfLightbox(null)} />
    </div>
  );
}

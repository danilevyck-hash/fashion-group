"use client";

import { useCallback, useRef, useState } from "react";
import { UploadCloud } from "lucide-react";
import DepuradorClient from "./DepuradorClient";
import ReebokClient from "./ReebokClient";
import FacturasTiendaClient from "./FacturasTiendaClient";
import type { SheetRow } from "@/lib/depurador/logic";

type Kind = "ckth" | "reebok" | "tienda";

export interface DescargaHistorial {
  empresa: string;
  marca: string;
  cantidad_estilos: number;
  total_unidades: number;
  total_costo: number;
  /** El MISMO archivo que se descargó (bytes idénticos), para el Historial. */
  archivo?: { blob: Blob; nombre: string };
}

interface DispatcherProps {
  onDownloaded?: (payload: DescargaHistorial) => void;
}

/** Punto de entrada único de «Plantilla › Nuevo»: una sola dropzone. Al soltar
 *  el archivo, olfatea los headers y despacha al flujo correcto SIN tocar la
 *  lógica de ninguno — los tres caminos ya no se nombran en pantalla:
 *   · Reebok = headers Book4 (PO NAME + New Article + WholesalePrice).
 *   · Facturas Tienda = .csv (';') o la factura/reporte que reconoce
 *     detectFactura (4-sep-2026 — antes era una pestaña propia).
 *   · Todo lo demás = CK/TH/KL (DepuradorClient). */
export default function DepuradorDispatcher({ onDownloaded }: DispatcherProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [kind, setKind] = useState<Kind>("ckth");
  const [error, setError] = useState("");

  const detect = useCallback(async (f: File) => {
    setBusy(true);
    setError("");
    try {
      // El CSV (';') solo lo come Facturas Tienda: no hace falta abrirlo.
      if (/\.csv$/i.test(f.name)) {
        setKind("tienda");
        setFile(f);
        return;
      }
      const XLSX = (await import("xlsx-js-style")).default;
      const wb = XLSX.read(await f.arrayBuffer(), { type: "array" });
      const { findHeaderRow } = await import("@/lib/depurador/reebok");
      const { detectFactura } = await import("@/lib/depurador/tienda");
      let detected: Kind = "ckth";
      for (const sn of wb.SheetNames) {
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, raw: true, defval: null }) as SheetRow[];
        if (findHeaderRow(rows) !== -1) { detected = "reebok"; break; }
        if (detectFactura(rows)) { detected = "tienda"; break; }
      }
      setKind(detected);
      setFile(f);
    } catch {
      // Si no se puede leer, deja que el flujo CK/TH muestre su propio error.
      setKind("ckth");
      setFile(f);
    } finally {
      setBusy(false);
    }
  }, []);

  const back = () => {
    setFile(null);
    setError("");
    if (inputRef.current) inputRef.current.value = "";
  };

  if (file) {
    if (kind === "reebok") return <ReebokClient injectedFile={file} onReset={back} onDownloaded={onDownloaded} />;
    if (kind === "tienda") return <FacturasTiendaClient injectedFile={file} onReset={back} onDownloaded={onDownloaded} />;
    return <DepuradorClient injectedFile={file} onReset={back} onDownloaded={onDownloaded} />;
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <label
            onDragEnter={(e) => { e.preventDefault(); setDragging(true); }}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={(e) => { e.preventDefault(); setDragging(false); }}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              if (e.dataTransfer.files[0]) detect(e.dataTransfer.files[0]);
            }}
            className={`mb-3 flex cursor-pointer flex-col items-center rounded-xl border-2 border-dashed px-6 py-6 text-center transition ${
              dragging ? "border-teal-600 bg-teal-50" : "border-stone-300 bg-white hover:border-teal-600 hover:bg-teal-50"
            }`}
          >
            <UploadCloud className="mb-2 h-7 w-7 text-teal-800" strokeWidth={1.6} />
            <div className="text-base font-semibold text-stone-900">
              {busy ? "Leyendo archivo…" : "Suelta el archivo aquí o haz clic para buscar"}
            </div>
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => { if (e.target.files?.[0]) detect(e.target.files[0]); }}
            />
          </label>
      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      )}
    </div>
  );
}

"use client";

import { useCallback, useRef, useState } from "react";
import { UploadCloud } from "lucide-react";
import DepuradorClient from "./DepuradorClient";
import ReebokClient from "./ReebokClient";
import FacturasTiendaClient from "./FacturasTiendaClient";
import type { SheetRow } from "@/lib/depurador/logic";
import {
  caminoAProcesar,
  reconocerArchivo,
  TEXTO_NO_RECONOZCO,
  type Camino,
  type Reconocimiento,
} from "@/lib/depurador/reconocer-archivo";
import { TRES_DETALLES } from "@/lib/depurador/tres-detalles";

type Kind = Camino;

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

/** El CSV se reconoce por la extensión: nadie le pregunta nada a las hojas. */
const SIN_DETECTORES = {
  reebokCompra: () => false,
  reebokDespacho: () => false,
  facturaTienda: () => false,
};

/** Punto de entrada único de «Plantilla › Nuevo»: una sola dropzone. Al soltar
 *  el archivo, olfatea los headers y despacha al flujo correcto SIN tocar la
 *  lógica de ninguno — los tres caminos ya no se nombran en pantalla:
 *   · Reebok = la confirmación de compra (headers Book4: PO NAME + New Article +
 *     WholesalePrice) o el despacho (SKU Father + Quantity).
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
  // 🔴 Lo que la caja DICE antes de procesar: qué archivo reconoció y a qué
  // compañía va. `null` mientras no hay nada soltado.
  const [rec, setRec] = useState<Reconocimiento | null>(null);
  const [nombreSoltado, setNombreSoltado] = useState("");

  const detect = useCallback(async (f: File) => {
    setBusy(true);
    setError("");
    setNombreSoltado(f.name);
    try {
      // 🔴 El olfateo es el MISMO de siempre; lo nuevo es que el resultado se
      // DICE y que lo que nadie reconoce no entra a ningún camino.
      let reconocimiento: Reconocimiento;
      if (/\.csv$/i.test(f.name)) {
        // El CSV (';') solo lo come Facturas Tienda: no hace falta abrirlo.
        reconocimiento = reconocerArchivo(f.name, [], SIN_DETECTORES);
      } else {
        const XLSX = (await import("xlsx-js-style")).default;
        const wb = XLSX.read(await f.arrayBuffer(), { type: "array" });
        const { findHeaderRow } = await import("@/lib/depurador/reebok");
        const { findHeaderRowDespacho } = await import("@/lib/depurador/reebok-despacho");
        const { detectFactura } = await import("@/lib/depurador/tienda");
        const hojas = wb.SheetNames.map((sn) => ({
          nombre: sn,
          filas: XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, raw: true, defval: null }) as SheetRow[],
        }));
        // 🔴 Reebok entra por DOS archivos —confirmación de compra y despacho—
        // y los dos van al MISMO flujo. Las preguntas son las de siempre.
        reconocimiento = reconocerArchivo(f.name, hojas, {
          reebokCompra: (rows) => findHeaderRow(rows) !== -1,
          reebokDespacho: (rows) => findHeaderRowDespacho(rows) !== -1,
          facturaTienda: (rows) => detectFactura(rows) !== null,
        });
      }
      setRec(reconocimiento);
      const destino = caminoAProcesar(reconocimiento, TRES_DETALLES);
      // 🔴 Apagado, lo desconocido cae a Calvin/Tommy como antes. Prendido, no
      // se procesa: la caja lo dice y el archivo se queda afuera.
      if (!destino) return;
      setKind(destino);
      setFile(f);
    } catch {
      // No se pudo abrir el archivo. Apagado: que el flujo Calvin/Tommy muestre
      // su propio error, como siempre. Prendido: se dice acá y no se procesa.
      const roto: Reconocimiento = { camino: null, texto: TEXTO_NO_RECONOZCO, empresas: [] };
      setRec(roto);
      const destino = caminoAProcesar(roto, TRES_DETALLES);
      if (!destino) return;
      setKind(destino);
      setFile(f);
    } finally {
      setBusy(false);
    }
  }, []);

  const back = () => {
    setFile(null);
    setError("");
    setRec(null);
    setNombreSoltado("");
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
              {busy
                ? "Leyendo archivo…"
                : TRES_DETALLES && nombreSoltado
                  ? nombreSoltado
                  : "Suelta el archivo aquí o haz clic para buscar"}
            </div>
            {/* 🔴 Qué reconoció, ANTES de procesar. Lo que no reconoce no pasa. */}
            {TRES_DETALLES && !busy && rec && (
              <span
                data-reconocimiento={rec.camino ?? "ninguno"}
                className={`mt-2 inline-block rounded-full px-3 py-1 text-[12px] font-medium ${
                  rec.camino
                    ? "bg-emerald-50 text-emerald-800"
                    : "bg-red-50 text-red-800"
                }`}
              >
                {rec.texto}
              </span>
            )}
            {TRES_DETALLES && !busy && rec && !rec.camino && (
              <span className="mt-1.5 text-[12px] text-stone-500">
                Suelta el Excel del proveedor (Calvin, Tommy, Karl o Reebok) o el reporte de tienda.
              </span>
            )}
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

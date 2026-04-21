"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  MkFactura,
  ProyectoConMarcas,
} from "@/lib/marketing/types";
import { useToast } from "@/components/ToastSystem";
import { AutocompleteInput } from "./AutocompleteInput";
import { PasoInstruccion } from "./PasoInstruccion";
import { PdfUploader, UploadResult } from "./PdfUploader";
import { formatearMonto } from "@/lib/marketing/normalizar";

export interface FacturaFormValues {
  numeroFactura: string;
  fechaFactura: string;
  proveedor: string;
  concepto: string;
  subtotal: number;
  itbms: number;
}

interface FacturaFormProps {
  proyecto: ProyectoConMarcas;
  initial?: Partial<MkFactura>;
  onSubmit: (data: FacturaFormValues, pdfFile?: File) => Promise<void>;
  onCancel?: () => void;
  /**
   * Si se pasa, se invoca cuando el usuario sube el PDF. Debe devolver el path
   * dentro del bucket 'marketing' (o null en error). Con ese path, el form llama
   * al endpoint de IA para pre-llenar campos.
   */
  onUploadPdfForIA?: (file: File) => Promise<string | null>;
}

type ItbmsOption = "0" | "7";

async function fetchProveedorSuggestions(_q: string): Promise<string[]> {
  return [];
}
async function fetchConceptoSuggestions(_q: string): Promise<string[]> {
  return [];
}

function isoHoy(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

interface RespuestaIA {
  numero_factura: string | null;
  fecha_factura: string | null;
  proveedor: string | null;
  concepto: string | null;
  subtotal: number | null;
  itbms_pct: 0 | 7 | null;
}

export function FacturaForm({
  proyecto,
  initial,
  onSubmit,
  onCancel,
  onUploadPdfForIA,
}: FacturaFormProps) {
  const { toast } = useToast();

  const [numeroFactura, setNumeroFactura] = useState<string>(
    initial?.numero_factura ?? "",
  );
  const [fechaFactura, setFechaFactura] = useState<string>(
    initial?.fecha_factura ?? isoHoy(),
  );
  const [proveedor, setProveedor] = useState<string>(initial?.proveedor ?? "");
  const [concepto, setConcepto] = useState<string>(initial?.concepto ?? "");
  const [subtotalStr, setSubtotalStr] = useState<string>(
    initial?.subtotal != null ? String(initial.subtotal) : "",
  );
  const [itbmsOption, setItbmsOption] = useState<ItbmsOption>(() => {
    if (initial?.subtotal && initial?.itbms) {
      const pct = (Number(initial.itbms) / Number(initial.subtotal)) * 100;
      if (pct > 3.5) return "7";
    }
    return "0";
  });
  const [pdfFile, setPdfFile] = useState<File | undefined>(undefined);
  const [pdfSubido, setPdfSubido] = useState(false);
  const [leyendoIA, setLeyendoIA] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const subtotal = Number(subtotalStr) || 0;
  const itbms = useMemo(
    () => (itbmsOption === "7" ? round2(subtotal * 0.07) : 0),
    [subtotal, itbmsOption],
  );
  const total = useMemo(() => round2(subtotal + itbms), [subtotal, itbms]);

  const pasoDatos =
    numeroFactura.trim().length > 0 &&
    fechaFactura.trim().length > 0 &&
    proveedor.trim().length > 0 &&
    concepto.trim().length > 0 &&
    subtotal > 0;

  const puedeGuardar = pasoDatos && !enviando;

  const aplicarRespuestaIA = useCallback((data: RespuestaIA) => {
    if (data.numero_factura) setNumeroFactura(data.numero_factura);
    if (data.fecha_factura) setFechaFactura(data.fecha_factura);
    if (data.proveedor) setProveedor(data.proveedor);
    if (data.concepto) setConcepto(data.concepto);
    if (data.subtotal !== null && Number.isFinite(data.subtotal)) {
      setSubtotalStr(String(data.subtotal));
    }
    if (data.itbms_pct === 7) setItbmsOption("7");
    else if (data.itbms_pct === 0) setItbmsOption("0");
  }, []);

  const handlePdfUpload = async (file: File): Promise<UploadResult> => {
    setPdfFile(file);
    setPdfSubido(true);

    if (onUploadPdfForIA) {
      setLeyendoIA(true);
      try {
        const path = await onUploadPdfForIA(file);
        if (path) {
          const res = await fetch("/api/marketing/ia/leer-factura", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ path }),
          });
          if (res.ok) {
            const data = (await res.json()) as RespuestaIA;
            aplicarRespuestaIA(data);
            toast("Datos pre-llenados con IA. Revísalos.", "success");
          } else {
            toast(
              "No se pudo leer la factura con IA. Llena los campos a mano.",
              "warning",
            );
          }
        }
      } catch {
        toast("Error leyendo con IA. Llena los campos a mano.", "warning");
      } finally {
        setLeyendoIA(false);
      }
    }

    return {
      url: "",
      nombreOriginal: file.name,
      sizeBytes: file.size,
    };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!puedeGuardar) return;
    try {
      setEnviando(true);
      await onSubmit(
        {
          numeroFactura,
          fechaFactura,
          proveedor,
          concepto,
          subtotal,
          itbms,
        },
        pdfFile,
      );
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "No se pudo guardar la factura. Intenta de nuevo.";
      toast(message, "error");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PasoInstruccion
        numero={1}
        titulo="Sube el PDF de la factura"
        descripcion={
          leyendoIA
            ? "Leyendo factura con IA..."
            : "Aceptamos solo PDF, máximo 10MB. La IA pre-llenará los campos."
        }
        completado={pdfSubido}
      >
        <PdfUploader
          onUpload={handlePdfUpload}
          label="Sube el PDF de la factura"
          accept="application/pdf"
          maxSizeMb={10}
        />
        {leyendoIA && (
          <div className="mt-3 flex items-center gap-2 text-sm text-fuchsia-700">
            <svg
              className="animate-spin"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
            Leyendo factura con IA...
          </div>
        )}
      </PasoInstruccion>

      <PasoInstruccion
        numero={2}
        titulo="Revisa o llena los datos de la factura"
        descripcion="Edita lo que la IA no haya leído bien."
        completado={pasoDatos}
      >
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="factura-numero"
                className="block text-sm text-gray-600 mb-1"
              >
                Nº factura<span className="text-red-500 ml-0.5">*</span>
              </label>
              <input
                id="factura-numero"
                type="text"
                value={numeroFactura}
                onChange={(e) => setNumeroFactura(e.target.value)}
                required
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-black focus:outline-none"
              />
            </div>
            <div>
              <label
                htmlFor="factura-fecha"
                className="block text-sm text-gray-600 mb-1"
              >
                Fecha<span className="text-red-500 ml-0.5">*</span>
              </label>
              <input
                id="factura-fecha"
                type="date"
                value={fechaFactura}
                onChange={(e) => setFechaFactura(e.target.value)}
                required
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-black focus:outline-none"
              />
            </div>
          </div>

          <AutocompleteInput
            label="Proveedor"
            value={proveedor}
            onChange={setProveedor}
            fetchSuggestions={fetchProveedorSuggestions}
            required
          />

          <AutocompleteInput
            label="Concepto"
            value={concepto}
            onChange={setConcepto}
            fetchSuggestions={fetchConceptoSuggestions}
            required
          />

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label
                htmlFor="factura-subtotal"
                className="block text-sm text-gray-600 mb-1"
              >
                Subtotal<span className="text-red-500 ml-0.5">*</span>
              </label>
              <input
                id="factura-subtotal"
                type="number"
                min={0}
                step="0.01"
                value={subtotalStr}
                onChange={(e) => setSubtotalStr(e.target.value)}
                required
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm tabular-nums focus:border-black focus:outline-none"
              />
            </div>
            <div>
              <span
                id="factura-itbms-label"
                className="block text-sm text-gray-600 mb-1"
              >
                ITBMS
              </span>
              <div
                role="radiogroup"
                aria-labelledby="factura-itbms-label"
                className="flex rounded-md border border-gray-300 overflow-hidden"
              >
                <button
                  type="button"
                  role="radio"
                  aria-checked={itbmsOption === "0"}
                  onClick={() => setItbmsOption("0")}
                  className={`flex-1 px-3 py-2 text-sm transition ${
                    itbmsOption === "0"
                      ? "bg-black text-white"
                      : "bg-white text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  0%
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={itbmsOption === "7"}
                  onClick={() => setItbmsOption("7")}
                  className={`flex-1 px-3 py-2 text-sm transition border-l border-gray-300 ${
                    itbmsOption === "7"
                      ? "bg-black text-white"
                      : "bg-white text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  7%
                </button>
              </div>
              <div className="text-xs text-gray-500 mt-1 tabular-nums">
                {formatearMonto(itbms)}
              </div>
            </div>
            <div>
              <label
                htmlFor="factura-total"
                className="block text-sm text-gray-600 mb-1"
              >
                Total
              </label>
              <input
                id="factura-total"
                type="text"
                value={formatearMonto(total)}
                readOnly
                tabIndex={-1}
                className="w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm tabular-nums text-gray-700"
              />
              <div className="text-xs text-gray-400 mt-1">
                Subtotal + ITBMS
              </div>
            </div>
          </div>
        </div>
      </PasoInstruccion>

      <PasoInstruccion
        numero={3}
        titulo="Revisa el cobrable por marca y guarda"
        descripcion="El cobrable se calcula sobre el total (subtotal + ITBMS) según el % de cada marca."
      >
        <div className="space-y-1.5">
          {proyecto.marcas.map((m) => {
            const cobrable = (total * m.porcentaje) / 100;
            return (
              <div
                key={m.marca.id}
                className="flex items-center justify-between text-sm"
              >
                <div className="text-gray-700">
                  {m.marca.nombre}{" "}
                  <span className="text-gray-400">({m.porcentaje}%)</span>
                </div>
                <div className="font-mono tabular-nums text-gray-900">
                  {formatearMonto(cobrable)}
                </div>
              </div>
            );
          })}
        </div>
      </PasoInstruccion>

      <div className="flex gap-2 justify-end">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={enviando}
            className="rounded-md border border-gray-300 bg-white text-gray-700 px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
          >
            Cancelar
          </button>
        )}
        <button
          type="submit"
          disabled={!puedeGuardar}
          className="rounded-md bg-black text-white px-3 py-2 text-sm active:scale-[0.97] transition disabled:opacity-50"
        >
          {enviando ? "Guardando…" : "Guardar factura"}
        </button>
      </div>
    </form>
  );
}

export default FacturaForm;

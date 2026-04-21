"use client";

import { useMemo, useState } from "react";
import type {
  MkFactura,
  ProyectoConMarcas,
} from "@/lib/marketing/types";
import { useToast } from "@/components/ToastSystem";
import { AutocompleteInput } from "./AutocompleteInput";
import { PasoInstruccion } from "./PasoInstruccion";
import { PdfUploader, UploadResult } from "./PdfUploader";
import { formatearMonto } from "@/lib/marketing/normalizar";

interface FacturaFormValues {
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
}

// TODO(Fase 3): conectar a /api/marketing/autocomplete
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

export function FacturaForm({
  proyecto,
  initial,
  onSubmit,
  onCancel,
}: FacturaFormProps) {
  const { toast } = useToast();

  const [numeroFactura, setNumeroFactura] = useState<string>(
    initial?.numero_factura ?? ""
  );
  const [fechaFactura, setFechaFactura] = useState<string>(
    initial?.fecha_factura ?? isoHoy()
  );
  const [proveedor, setProveedor] = useState<string>(initial?.proveedor ?? "");
  const [concepto, setConcepto] = useState<string>(initial?.concepto ?? "");
  const [subtotalStr, setSubtotalStr] = useState<string>(
    initial?.subtotal != null ? String(initial.subtotal) : ""
  );
  const [itbmsStr, setItbmsStr] = useState<string>(
    initial?.itbms != null ? String(initial.itbms) : "0"
  );
  const [pdfFile, setPdfFile] = useState<File | undefined>(undefined);
  const [pdfSubido, setPdfSubido] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const subtotal = Number(subtotalStr) || 0;
  const itbms = Number(itbmsStr) || 0;
  const total = subtotal + itbms;

  const pasoDatos = useMemo(() => {
    return (
      numeroFactura.trim().length > 0 &&
      fechaFactura.trim().length > 0 &&
      proveedor.trim().length > 0 &&
      concepto.trim().length > 0 &&
      subtotal > 0
    );
  }, [numeroFactura, fechaFactura, proveedor, concepto, subtotal]);

  const puedeGuardar = pasoDatos && !enviando;

  // El PdfUploader recibe un onUpload que nos da la URL real. Para mantener
  // el contrato "subir al guardar", capturamos el File y solo marcamos
  // completado tras devolver el UploadResult.
  const handlePdfUpload = async (file: File): Promise<UploadResult> => {
    // Guardamos el file para que FacturaForm.onSubmit pueda pasarlo al caller.
    // El caller real de onUpload decidirá si sube en vivo o difiere al submit.
    setPdfFile(file);
    setPdfSubido(true);
    // Devolvemos un stub con el nombre real; el upload real pasa por onSubmit.
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
        pdfFile
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
        descripcion="Aceptamos solo PDF, máximo 10MB."
        completado={pdfSubido}
      >
        <PdfUploader
          onUpload={handlePdfUpload}
          label="Sube el PDF de la factura"
          accept="application/pdf"
          maxSizeMb={10}
        />
      </PasoInstruccion>

      <PasoInstruccion
        numero={2}
        titulo="Llena los datos de la factura"
        descripcion="Número, fecha, proveedor, concepto y montos."
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
              <label
                htmlFor="factura-itbms"
                className="block text-sm text-gray-600 mb-1"
              >
                ITBMS
              </label>
              <input
                id="factura-itbms"
                type="number"
                min={0}
                step="0.01"
                value={itbmsStr}
                onChange={(e) => setItbmsStr(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm tabular-nums focus:border-black focus:outline-none"
              />
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
            </div>
          </div>
        </div>
      </PasoInstruccion>

      <PasoInstruccion
        numero={3}
        titulo="Revisa el cobrable por marca y guarda"
        descripcion="El cobrable se calcula sobre el subtotal según el % de cada marca."
      >
        <div className="space-y-1.5">
          {proyecto.marcas.map((m) => {
            const cobrable = (subtotal * m.porcentaje) / 100;
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

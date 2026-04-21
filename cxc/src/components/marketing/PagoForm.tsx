"use client";

import { useMemo, useState } from "react";
import type { CobranzaConPagos } from "@/lib/marketing/types";
import { useToast } from "@/components/ToastSystem";
import { PasoInstruccion } from "./PasoInstruccion";
import { PdfUploader, UploadResult } from "./PdfUploader";
import { formatearMonto } from "@/lib/marketing/normalizar";

interface PagoFormValues {
  fechaPago: string;
  monto: number;
  referencia: string;
}

interface PagoFormProps {
  cobranza: CobranzaConPagos;
  saldoPendiente: number;
  onSubmit: (data: PagoFormValues, comprobanteFile?: File) => Promise<void>;
  onCancel?: () => void;
}

function isoHoy(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function PagoForm({
  cobranza,
  saldoPendiente,
  onSubmit,
  onCancel,
}: PagoFormProps) {
  const { toast } = useToast();

  const [fechaPago, setFechaPago] = useState<string>(isoHoy());
  const [montoStr, setMontoStr] = useState<string>(saldoPendiente.toFixed(2));
  const [referencia, setReferencia] = useState<string>("");
  const [comprobanteFile, setComprobanteFile] = useState<File | undefined>(
    undefined
  );
  const [enviando, setEnviando] = useState(false);

  const monto = Number(montoStr) || 0;

  const excede = monto > saldoPendiente + 0.0001;
  const pasoMonto = monto > 0 && fechaPago.trim().length > 0 && !excede;
  const puedeGuardar = pasoMonto && !enviando;

  const handleComprobanteUpload = async (file: File): Promise<UploadResult> => {
    setComprobanteFile(file);
    return {
      url: "",
      nombreOriginal: file.name,
      sizeBytes: file.size,
    };
  };

  const comprobanteNombre = useMemo(
    () => comprobanteFile?.name ?? null,
    [comprobanteFile]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!puedeGuardar) return;
    try {
      setEnviando(true);
      await onSubmit(
        { fechaPago, monto, referencia },
        comprobanteFile
      );
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "No se pudo guardar el pago. Intenta de nuevo.";
      toast(message, "error");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 flex items-center justify-between">
        <div className="text-sm text-gray-600">
          Cobranza:{" "}
          <span className="font-mono text-gray-900">{cobranza.numero}</span>
        </div>
        <div className="text-sm text-gray-600">
          Saldo pendiente:{" "}
          <span className="font-mono tabular-nums text-gray-900">
            {formatearMonto(saldoPendiente)}
          </span>
        </div>
      </div>

      <PasoInstruccion
        numero={1}
        titulo="Fecha y monto del pago"
        descripcion="El monto no puede exceder el saldo pendiente."
        completado={pasoMonto}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label
              htmlFor="pago-fecha"
              className="block text-sm text-gray-600 mb-1"
            >
              Fecha del pago<span className="text-red-500 ml-0.5">*</span>
            </label>
            <input
              id="pago-fecha"
              type="date"
              value={fechaPago}
              onChange={(e) => setFechaPago(e.target.value)}
              required
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-black focus:outline-none"
            />
          </div>
          <div>
            <label
              htmlFor="pago-monto"
              className="block text-sm text-gray-600 mb-1"
            >
              Monto<span className="text-red-500 ml-0.5">*</span>
            </label>
            <input
              id="pago-monto"
              type="number"
              min={0}
              step="0.01"
              value={montoStr}
              onChange={(e) => setMontoStr(e.target.value)}
              required
              aria-invalid={excede}
              className={`w-full rounded-md border px-3 py-2 text-sm tabular-nums focus:outline-none ${
                excede
                  ? "border-red-400 focus:border-red-500"
                  : "border-gray-300 focus:border-black"
              }`}
            />
            {excede && (
              <div className="text-xs text-red-600 mt-1">
                El monto excede el saldo pendiente (
                {formatearMonto(saldoPendiente)}).
              </div>
            )}
          </div>
        </div>
      </PasoInstruccion>

      <PasoInstruccion
        numero={2}
        titulo="Referencia del banco (opcional)"
        descripcion="Ej: nº de confirmación de transferencia."
      >
        <input
          type="text"
          value={referencia}
          onChange={(e) => setReferencia(e.target.value)}
          aria-label="Referencia del banco"
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-black focus:outline-none"
        />
      </PasoInstruccion>

      <PasoInstruccion
        numero={3}
        titulo="Sube el comprobante (opcional)"
        descripcion="PDF o imagen del comprobante de pago."
        completado={comprobanteNombre !== null}
      >
        <PdfUploader
          onUpload={handleComprobanteUpload}
          label="Sube el comprobante"
          accept="application/pdf,image/*"
          maxSizeMb={10}
        />
      </PasoInstruccion>

      <PasoInstruccion
        numero={4}
        titulo="Guarda el pago"
        descripcion="Quedará registrado contra esta cobranza."
        accion={{
          label: enviando ? "Guardando…" : "Guardar pago",
          onClick: () => {
            // El submit real pasa por el form.onSubmit; este botón
            // hace submit programático.
            const form = (document.activeElement as HTMLElement)?.closest(
              "form"
            );
            form?.requestSubmit();
          },
          disabled: !puedeGuardar,
          variant: "primary",
        }}
      />

      {onCancel && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={enviando}
            className="rounded-md border border-gray-300 bg-white text-gray-700 px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
          >
            Cancelar
          </button>
        </div>
      )}
    </form>
  );
}

export default PagoForm;

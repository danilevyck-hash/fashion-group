"use client";

import { createPortal } from "react-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "@/components/ToastSystem";
import { useBodyScrollLock } from "@/lib/hooks/useBodyScrollLock";
import { pedirUploadUrl, subirArchivoAStorage } from "./uploadHelpers";
import { etiquetaMes } from "@/lib/marketing/meses";
import { formatearMonto } from "@/lib/marketing/normalizar";
import type { ImpulsadoraConEstado } from "@/lib/marketing/types";

interface Props {
  impulsadora: ImpulsadoraConEstado;
  // Mes inicial "YYYY-MM-01" (default = mes con pago pendiente).
  mesInicial: string;
  onClose: () => void;
  onSaved: () => void;
}

interface ComprobanteSubido {
  path: string;
  tipo: "pdf_factura" | "foto_factura";
  nombreOriginal: string;
  sizeBytes: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export default function RegistrarPagoModal({ impulsadora, mesInicial, onClose, onSaved }: Props) {
  const { toast } = useToast();
  useBodyScrollLock(true);
  // input type="month" usa "YYYY-MM"
  const [mes, setMes] = useState(mesInicial.slice(0, 7));
  const [monto, setMonto] = useState(String(impulsadora.monto_mensual));
  const [comprobante, setComprobante] = useState<ComprobanteSubido | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const mesISO = `${mes}-01`;
  const montoNum = Number(monto) || 0;

  // Distribución por marca según el split (cuadrando centavos en la última).
  const distribucion = useMemo(() => {
    const marcas = impulsadora.marcas;
    let acum = 0;
    return marcas.map((m, i) => {
      const esUltima = i === marcas.length - 1;
      const porcion = esUltima
        ? round2(montoNum - acum)
        : round2((montoNum * m.porcentaje) / 100);
      acum = round2(acum + porcion);
      return { nombre: m.marca.nombre, porcentaje: m.porcentaje, monto: porcion };
    });
  }, [impulsadora.marcas, montoNum]);

  const concepto = `Impulsadora ${impulsadora.nombre} — ${etiquetaMes(mesISO)}`;

  const onFile = async (file: File | null) => {
    if (!file) return;
    const esPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
    if (file.size > 10 * 1024 * 1024) {
      toast("El archivo supera 10MB.", "error");
      return;
    }
    setSubiendo(true);
    try {
      const { uploadUrl, path } = await pedirUploadUrl({ file, impulsadoraId: impulsadora.id });
      await subirArchivoAStorage(uploadUrl, file);
      setComprobante({
        path,
        tipo: esPdf ? "pdf_factura" : "foto_factura",
        nombreOriginal: file.name,
        sizeBytes: file.size,
      });
      toast("Comprobante subido", "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "No se pudo subir el comprobante", "error");
    } finally {
      setSubiendo(false);
    }
  };

  const puedeGuardar = montoNum > 0 && !!comprobante && !subiendo && !guardando;

  const guardar = async () => {
    if (!puedeGuardar || !comprobante) return;
    setGuardando(true);
    try {
      const res = await fetch(`/api/marketing/impulsadoras/${impulsadora.id}/pagos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mes: mesISO,
          monto: montoNum,
          comprobante: {
            path: comprobante.path,
            tipo: comprobante.tipo,
            nombreOriginal: comprobante.nombreOriginal,
            sizeBytes: comprobante.sizeBytes,
          },
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? "No se pudo registrar el pago");
      }
      toast("Pago registrado", "success");
      onSaved();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error al guardar", "error");
    } finally {
      setGuardando(false);
    }
  };

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center animate-[fadeIn_150ms_ease-out]">
      <div className="absolute inset-0 bg-black/40" onClick={() => !guardando && !subiendo && onClose()} />
      <div
        className="relative bg-white w-full sm:max-w-lg sm:rounded-lg rounded-t-2xl max-h-[90vh] overflow-y-auto border border-gray-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">
            Registrar pago — {etiquetaMes(mesISO)}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={guardando || subiendo}
            className="text-gray-500 hover:text-black text-xl leading-none"
          >
            ×
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Mes</label>
              <input
                type="month"
                value={mes}
                onChange={(e) => setMes(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-black focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Monto</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  value={monto}
                  onChange={(e) => setMonto(e.target.value)}
                  className="w-full rounded-md border border-gray-300 pl-7 pr-3 py-2 text-sm tabular-nums focus:border-black focus:outline-none"
                />
              </div>
            </div>
          </div>

          <div>
            <div className="text-sm font-medium text-gray-700 mb-1">Concepto</div>
            <div className="rounded-md bg-gray-50 border border-gray-200 px-3 py-2 text-sm text-gray-600">
              {concepto}
            </div>
          </div>

          <div>
            <div className="text-sm font-medium text-gray-700 mb-2">Distribución por marca</div>
            <div className="rounded-md border border-gray-200 divide-y divide-gray-100">
              {distribucion.map((d) => (
                <div key={d.nombre} className="flex items-center justify-between px-3 py-2 text-sm">
                  <span className="text-gray-700">
                    {d.nombre} <span className="text-gray-400">· {d.porcentaje}%</span>
                  </span>
                  <span className="tabular-nums text-gray-900">{formatearMonto(d.monto)}</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="text-sm font-medium text-gray-700 mb-2">
              Comprobante <span className="text-red-600">*</span>{" "}
              <span className="text-xs font-normal text-gray-400">(foto o PDF, obligatorio)</span>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={(e) => onFile(e.target.files?.[0] ?? null)}
            />
            {comprobante ? (
              <div className="flex items-center justify-between rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm">
                <span className="text-emerald-800 truncate">✓ {comprobante.nombreOriginal}</span>
                <button
                  type="button"
                  onClick={() => setComprobante(null)}
                  disabled={guardando}
                  className="text-gray-500 hover:text-black text-xs shrink-0 ml-3"
                >
                  Cambiar
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={subiendo}
                className="w-full rounded-md border border-dashed border-gray-300 px-3 py-3 text-sm text-gray-600 hover:border-gray-500 hover:text-black transition disabled:opacity-50"
              >
                {subiendo ? "Subiendo…" : "Subir comprobante"}
              </button>
            )}
          </div>
        </div>

        <div className="sticky bottom-0 bg-white border-t border-gray-100 px-6 py-4 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={guardando || subiendo}
            className="text-sm text-gray-600 hover:text-black transition"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={guardar}
            disabled={!puedeGuardar}
            className="rounded-md bg-black text-white px-4 py-2 text-sm active:scale-[0.97] transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {guardando ? "Guardando…" : "Guardar pago"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

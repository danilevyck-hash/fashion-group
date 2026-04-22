"use client";

// Card editable de una factura sin guardar (multi-upload bulk).
// Componente CONTROLADO: el state vive en el caller (FacturasSection).
// Reusa la regla 50/50 fija: el usuario elige qué marcas aplican mediante
// checkboxes — el porcentaje se persiste como 50 en el backend.

import { useEffect, useMemo, useState } from "react";
import type { MkMarca } from "@/lib/marketing/types";

export type EstadoBorrador =
  | { tipo: "ocr-pendiente" }       // PDF subido, esperando OCR
  | { tipo: "ocr-error" }           // OCR falló — usuario llena a mano
  | { tipo: "editando" }            // Listo para editar
  | { tipo: "guardando" }           // En tránsito al backend bulk
  | { tipo: "error"; razon: string }; // El bulk respondió con error para esta card

export interface BorradorFactura {
  cardId: string;
  pdfNombre: string;
  pdfPath: string | null; // null si aún no terminó la subida
  pdfSize: number | null;
  estado: EstadoBorrador;
  // Campos editables
  numeroFactura: string;
  fechaFactura: string;
  proveedor: string;
  concepto: string;
  subtotalStr: string;
  itbmsOption: "0" | "7";
  marcaIds: string[]; // ids seleccionados (regla 50/50)
}

interface Props {
  borrador: BorradorFactura;
  marcasCatalogo: MkMarca[];
  onChange: (cardId: string, patch: Partial<BorradorFactura>) => void;
  onDescartar: (cardId: string) => void;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function formatearMonto(n: number): string {
  return `$${n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function BorradorFacturaCard({
  borrador,
  marcasCatalogo,
  onChange,
  onDescartar,
}: Props) {
  const subtotal = Number(borrador.subtotalStr) || 0;
  const itbms = useMemo(
    () => (borrador.itbmsOption === "7" ? round2(subtotal * 0.07) : 0),
    [subtotal, borrador.itbmsOption],
  );
  const total = useMemo(() => round2(subtotal + itbms), [subtotal, itbms]);

  const estaProcesando =
    borrador.estado.tipo === "ocr-pendiente" ||
    borrador.estado.tipo === "guardando";

  // ── Detección de duplicados (igual flujo que FacturaForm single) ──
  interface Duplicado {
    id: string;
    proyecto_nombre: string;
    es_mismo_proyecto: boolean;
    created_at: string | null;
  }
  const [duplicados, setDuplicados] = useState<Duplicado[]>([]);

  useEffect(() => {
    const num = borrador.numeroFactura.trim();
    const prov = borrador.proveedor.trim();
    if (!num || !prov) {
      setDuplicados([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const qs = new URLSearchParams({
          numero_factura: num,
          proveedor: prov,
        });
        const res = await fetch(
          `/api/marketing/facturas/check-duplicate?${qs.toString()}`,
          { cache: "no-store" },
        );
        if (!res.ok) {
          setDuplicados([]);
          return;
        }
        const data = (await res.json()) as { facturas: Duplicado[] };
        setDuplicados(data.facturas ?? []);
      } catch {
        setDuplicados([]);
      }
    }, 500);
    return () => clearTimeout(t);
  }, [borrador.numeroFactura, borrador.proveedor]);

  function toggleMarca(marcaId: string) {
    const set = new Set(borrador.marcaIds);
    if (set.has(marcaId)) set.delete(marcaId);
    else set.add(marcaId);
    onChange(borrador.cardId, { marcaIds: Array.from(set) });
  }

  // ── Render ──────────────────────────────────────────────────────────────
  // Visual distinto cuando está en edición (borde punteado + fondo amarillo
  // muy ligero) vs cuando está guardando (gris).
  const baseBorder =
    borrador.estado.tipo === "ocr-pendiente"
      ? "border-gray-300"
      : borrador.estado.tipo === "error"
        ? "border-red-300"
        : "border-amber-300";

  const baseBg =
    borrador.estado.tipo === "ocr-pendiente"
      ? "bg-gray-50"
      : borrador.estado.tipo === "error"
        ? "bg-red-50/40"
        : "bg-amber-50/30";

  return (
    <div
      className={`rounded-lg border-2 border-dashed ${baseBorder} ${baseBg} p-4 space-y-3`}
    >
      {/* Header con badge + botón descartar + nombre del PDF */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-semibold">
              Sin guardar
            </span>
            {borrador.estado.tipo === "ocr-pendiente" && (
              <span className="text-[10px] text-gray-500 inline-flex items-center gap-1">
                <Spinner /> Leyendo PDF con IA…
              </span>
            )}
            {borrador.estado.tipo === "ocr-error" && (
              <span className="text-[10px] text-amber-700">
                ⚠ No pudimos leer el PDF — llena los campos a mano
              </span>
            )}
            {borrador.estado.tipo === "guardando" && (
              <span className="text-[10px] text-gray-500 inline-flex items-center gap-1">
                <Spinner /> Guardando…
              </span>
            )}
          </div>
          <div className="text-xs text-gray-600 truncate" title={borrador.pdfNombre}>
            📎 {borrador.pdfNombre}
          </div>
        </div>
        <button
          type="button"
          onClick={() => onDescartar(borrador.cardId)}
          disabled={estaProcesando}
          aria-label="Descartar factura"
          title="Descartar"
          className="text-gray-400 hover:text-red-600 transition disabled:opacity-30 p-1"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Banner de error del bulk save */}
      {borrador.estado.tipo === "error" && (
        <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-800">
          <strong>No se guardó:</strong> {borrador.estado.razon}
        </div>
      )}

      {/* Campos */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">
            Número de factura<span className="text-red-500 ml-0.5">*</span>
          </label>
          <input
            type="text"
            value={borrador.numeroFactura}
            onChange={(e) =>
              onChange(borrador.cardId, { numeroFactura: e.target.value })
            }
            disabled={estaProcesando}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-black focus:outline-none disabled:bg-gray-50"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">
            Fecha<span className="text-red-500 ml-0.5">*</span>
          </label>
          <input
            type="date"
            value={borrador.fechaFactura}
            onChange={(e) =>
              onChange(borrador.cardId, { fechaFactura: e.target.value })
            }
            disabled={estaProcesando}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-black focus:outline-none disabled:bg-gray-50"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs text-gray-500 mb-1">
            Proveedor<span className="text-red-500 ml-0.5">*</span>
          </label>
          <input
            type="text"
            value={borrador.proveedor}
            onChange={(e) =>
              onChange(borrador.cardId, { proveedor: e.target.value })
            }
            disabled={estaProcesando}
            placeholder="Ej: Pintor XYZ"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-black focus:outline-none disabled:bg-gray-50"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs text-gray-500 mb-1">
            Concepto<span className="text-red-500 ml-0.5">*</span>
          </label>
          <input
            type="text"
            value={borrador.concepto}
            onChange={(e) =>
              onChange(borrador.cardId, { concepto: e.target.value })
            }
            disabled={estaProcesando}
            placeholder="Ej: Pintura interior local Albrook"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-black focus:outline-none disabled:bg-gray-50"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">
            Subtotal<span className="text-red-500 ml-0.5">*</span>
          </label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={borrador.subtotalStr}
            onChange={(e) =>
              onChange(borrador.cardId, { subtotalStr: e.target.value })
            }
            disabled={estaProcesando}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm tabular-nums focus:border-black focus:outline-none disabled:bg-gray-50"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">ITBMS</label>
          <select
            value={borrador.itbmsOption}
            onChange={(e) =>
              onChange(borrador.cardId, {
                itbmsOption: e.target.value as "0" | "7",
              })
            }
            disabled={estaProcesando}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm bg-white focus:border-black focus:outline-none disabled:bg-gray-50"
          >
            <option value="0">0% (exento)</option>
            <option value="7">7%</option>
          </select>
        </div>
      </div>

      {/* Total derivado */}
      <div className="flex justify-between text-xs text-gray-600 pt-1 border-t border-gray-200">
        <span>
          Subtotal {formatearMonto(subtotal)} · ITBMS {formatearMonto(itbms)}
        </span>
        <span className="font-semibold text-gray-900">
          Total {formatearMonto(total)}
        </span>
      </div>

      {/* Marcas (checkboxes 50/50) */}
      <div>
        <div className="text-xs text-gray-500 mb-1">
          Marcas que aplican (50% c/u)
          <span className="text-red-500 ml-0.5">*</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          {marcasCatalogo.map((m) => {
            const checked = borrador.marcaIds.includes(m.id);
            const cobrable = total * 0.5;
            return (
              <label
                key={m.id}
                className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md border cursor-pointer transition text-sm ${
                  checked
                    ? "border-black bg-white"
                    : "border-gray-200 bg-white hover:border-gray-300"
                } ${estaProcesando ? "opacity-60" : ""}`}
              >
                <span className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleMarca(m.id)}
                    disabled={estaProcesando}
                    className="accent-black w-3.5 h-3.5"
                  />
                  <span className="text-gray-800">{m.nombre}</span>
                </span>
                {checked && total > 0 && (
                  <span className="text-xs font-mono tabular-nums text-gray-700">
                    {formatearMonto(cobrable)}
                  </span>
                )}
              </label>
            );
          })}
        </div>
        {borrador.marcaIds.length === 0 && (
          <p className="text-[11px] text-red-600 mt-1">
            Selecciona al menos una marca.
          </p>
        )}
      </div>

      {/* Warning duplicados */}
      {duplicados.length > 0 && (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          ⚠ Ya existe esta factura ({borrador.numeroFactura} de &ldquo;
          {borrador.proveedor}&rdquo;) en{" "}
          {duplicados
            .map(
              (d) =>
                `"${d.proyecto_nombre}"${d.es_mismo_proyecto ? " (este mismo)" : ""}`,
            )
            .join(", ")}
          . Al guardar, se permitirá el duplicado y quedará en el log.
        </div>
      )}
    </div>
  );
}

function Spinner() {
  return (
    <svg
      className="animate-spin"
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
    >
      <path d="M12 2a10 10 0 0 1 10 10" />
    </svg>
  );
}

export default BorradorFacturaCard;

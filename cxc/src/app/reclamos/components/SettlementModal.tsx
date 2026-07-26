"use client";

import { useState, useRef } from "react";
import { createPortal } from "react-dom";
import { useBodyScrollLock } from "@/lib/hooks/useBodyScrollLock";
import { useFormModalDismiss } from "@/lib/hooks/useModalDismiss";
import { validateComprobanteFile } from "./fotoUpload";

export interface SettlementInput {
  monto: number;
  nota_credito: string;
  fecha: string;
}

interface Row {
  monto: string;
  nota_credito: string;
  fecha: string;
}

interface Props {
  open: boolean;
  /** Monto reclamado (referencia, para que el usuario compare al capturar). */
  reclamado?: number;
  submitting: boolean;
  title?: string;
  confirmLabel?: string;
  /** true cuando el reclamo aún NO tiene comprobante adjunto: el modal integra
   *  la sección de adjuntar (obligatoria) — un solo modal, un solo submit
   *  (antes eran 2 modales encadenados). */
  requireComprobante?: boolean;
  onClose: () => void;
  /** comprobante viene solo cuando requireComprobante=true. */
  onSubmit: (rows: SettlementInput[], comprobante: File | null) => void;
}

/** Hoy en Panamá (YYYY-MM-DD). */
function hoyPanama(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Panama" }).format(new Date());
}

const money = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function SettlementModal({
  open,
  reclamado,
  submitting,
  title = "Registrar recuperación",
  confirmLabel = "Marcar como Pagado",
  requireComprobante = false,
  onClose,
  onSubmit,
}: Props) {
  useBodyScrollLock(open);
  const [rows, setRows] = useState<Row[]>([{ monto: "", nota_credito: "", fecha: hoyPanama() }]);
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Reset al abrir — EN RENDER, no en un efecto: el modal se queda montado con
  // `open=false`, así que un efecto limpiaría los campos un render TARDE y
  // useFormModalDismiss tomaría su foto sobre los valores viejos (creería que
  // hay cambios sin guardar y ya no dejaría cerrar con clic fuera / Escape).
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setRows([{ monto: "", nota_credito: "", fecha: hoyPanama() }]);
      setError(null);
      setFile(null);
    }
  }

  // Clic fuera + Escape = Cancelar. Si el usuario ya escribió algo (o adjuntó
  // el comprobante), ninguno de los dos cierra: se sale con Cancelar o
  // guardando. Bloqueado mientras se envía, igual que antes.
  const { panelRef, backdrop } = useFormModalDismiss(open, onClose, !submitting);

  if (!open) return null;

  const totalRecuperado = rows.reduce((s, r) => s + (Number(r.monto) || 0), 0);

  const updateRow = (i: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const addRow = () => setRows((rs) => [...rs, { monto: "", nota_credito: "", fecha: hoyPanama() }]);
  const removeRow = (i: number) => setRows((rs) => (rs.length > 1 ? rs.filter((_, idx) => idx !== i) : rs));

  const pickFile = (f: File | null) => {
    if (!f) return;
    const err = validateComprobanteFile(f);
    if (err) { setError(err); return; }
    setError(null);
    setFile(f);
  };

  const confirm = () => {
    if (requireComprobante && !file) {
      setError("Adjunta el comprobante (foto o PDF) — es obligatorio para marcar Pagado.");
      return;
    }
    for (const r of rows) {
      const m = Number(r.monto);
      if (!Number.isFinite(m) || m <= 0) {
        setError("Cada nota de crédito necesita un monto recuperado mayor a 0.");
        return;
      }
      if (!r.fecha) {
        setError("Falta la fecha de alguna recuperación.");
        return;
      }
    }
    setError(null);
    onSubmit(rows.map((r) => ({ monto: Number(r.monto), nota_credito: r.nota_credito.trim(), fecha: r.fecha })), file);
  };

  return createPortal(
    <div
      {...backdrop}
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40"
    >
      <div
        ref={panelRef}
        className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-lg bg-white p-5 shadow-xl"
      >
        <h2 className="text-base font-semibold">{title}</h2>
        {reclamado != null && (
          <p className="mt-0.5 text-xs text-gray-500">
            Reclamado: ${money(reclamado)} · anota cuánto recuperó el proveedor (puede ser parcial).
          </p>
        )}

        {requireComprobante && (
          <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3">
            <div className="text-xs uppercase tracking-[0.05em] text-amber-700 font-medium">
              Comprobante de pago *
            </div>
            <p className="mt-0.5 text-xs text-amber-800">Foto o PDF — obligatorio para marcar Pagado.</p>
            <input
              ref={fileRef}
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
            />
            <button
              onClick={() => fileRef.current?.click()}
              className="mt-2 w-full rounded-md border border-amber-300 bg-white px-3 min-h-[44px] text-sm text-gray-700 hover:border-amber-400 transition"
            >
              {file ? `📎 ${file.name}` : "Adjuntar foto o PDF"}
            </button>
          </div>
        )}

        <div className="mt-4 space-y-4">
          {rows.map((r, i) => (
            <div key={i} className="rounded-md border border-gray-200 p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase tracking-[0.05em] text-gray-400">
                  Nota de crédito {rows.length > 1 ? i + 1 : ""}
                </span>
                {rows.length > 1 && (
                  <button onClick={() => removeRow(i)} className="text-xs text-gray-400 hover:text-red-600 transition">
                    Quitar
                  </button>
                )}
              </div>
              <div className="mt-2 grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs text-gray-500">Monto recuperado *</span>
                  <input
                    type="number" inputMode="decimal" min="0" step="0.01"
                    value={r.monto}
                    onChange={(e) => updateRow(i, { monto: e.target.value })}
                    placeholder="0.00"
                    className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm tabular-nums outline-none focus:border-black transition"
                  />
                </label>
                <label className="block">
                  <span className="text-xs text-gray-500">Fecha *</span>
                  <input
                    type="date"
                    value={r.fecha}
                    onChange={(e) => updateRow(i, { fecha: e.target.value })}
                    className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:border-black transition"
                  />
                </label>
                <label className="col-span-2 block">
                  <span className="text-xs text-gray-500">N° nota de crédito (opcional)</span>
                  <input
                    type="text"
                    value={r.nota_credito}
                    onChange={(e) => updateRow(i, { nota_credito: e.target.value })}
                    placeholder="Ej. 4020000422"
                    className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:border-black transition"
                  />
                </label>
              </div>
            </div>
          ))}
        </div>

        <button onClick={addRow} className="mt-3 text-xs font-medium text-blue-600 hover:underline">
          + Agregar otra nota de crédito
        </button>

        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-gray-500">Total recuperado</span>
          <span className="font-semibold tabular-nums">${money(totalRecuperado)}</span>
        </div>

        {error && <div className="mt-2 text-xs text-red-600">{error}</div>}

        <div className="mt-5 flex gap-3">
          <button
            onClick={() => { if (!submitting) onClose(); }}
            disabled={submitting}
            className="flex-1 rounded-md border border-gray-200 py-2 text-sm hover:bg-gray-50 transition disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={confirm}
            disabled={submitting}
            className="flex-1 rounded-md bg-black py-2 text-sm text-white active:scale-[0.97] transition disabled:opacity-50"
          >
            {submitting ? "Guardando..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useBodyScrollLock } from "@/lib/hooks/useBodyScrollLock";

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
  onClose: () => void;
  onSubmit: (rows: SettlementInput[]) => void;
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
  onClose,
  onSubmit,
}: Props) {
  useBodyScrollLock(open);
  const [rows, setRows] = useState<Row[]>([{ monto: "", nota_credito: "", fecha: hoyPanama() }]);
  const [error, setError] = useState<string | null>(null);

  // Reset al abrir.
  useEffect(() => {
    if (open) {
      setRows([{ monto: "", nota_credito: "", fecha: hoyPanama() }]);
      setError(null);
    }
  }, [open]);

  if (!open) return null;

  const totalRecuperado = rows.reduce((s, r) => s + (Number(r.monto) || 0), 0);

  const updateRow = (i: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const addRow = () => setRows((rs) => [...rs, { monto: "", nota_credito: "", fecha: hoyPanama() }]);
  const removeRow = (i: number) => setRows((rs) => (rs.length > 1 ? rs.filter((_, idx) => idx !== i) : rs));

  const confirm = () => {
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
    onSubmit(rows.map((r) => ({ monto: Number(r.monto), nota_credito: r.nota_credito.trim(), fecha: r.fecha })));
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40"
      onClick={() => { if (!submitting) onClose(); }}
    >
      <div
        className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-lg bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold">{title}</h2>
        {reclamado != null && (
          <p className="mt-0.5 text-xs text-gray-500">
            Reclamado: ${money(reclamado)} · anota cuánto recuperó el proveedor (puede ser parcial).
          </p>
        )}

        <div className="mt-4 space-y-4">
          {rows.map((r, i) => (
            <div key={i} className="rounded-md border border-gray-200 p-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] uppercase tracking-[0.05em] text-gray-400">
                  Nota de crédito {rows.length > 1 ? i + 1 : ""}
                </span>
                {rows.length > 1 && (
                  <button onClick={() => removeRow(i)} className="text-[11px] text-gray-400 hover:text-red-600 transition">
                    Quitar
                  </button>
                )}
              </div>
              <div className="mt-2 grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-[11px] text-gray-500">Monto recuperado *</span>
                  <input
                    type="number" inputMode="decimal" min="0" step="0.01"
                    value={r.monto}
                    onChange={(e) => updateRow(i, { monto: e.target.value })}
                    placeholder="0.00"
                    className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm tabular-nums outline-none focus:border-black transition"
                  />
                </label>
                <label className="block">
                  <span className="text-[11px] text-gray-500">Fecha *</span>
                  <input
                    type="date"
                    value={r.fecha}
                    onChange={(e) => updateRow(i, { fecha: e.target.value })}
                    className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:border-black transition"
                  />
                </label>
                <label className="col-span-2 block">
                  <span className="text-[11px] text-gray-500">N° nota de crédito (opcional)</span>
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

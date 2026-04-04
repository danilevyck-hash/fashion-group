"use client";

import { useEffect } from "react";
import { fmt } from "@/lib/format";

function useEscClose(show: boolean, onClose: () => void) {
  useEffect(() => {
    if (!show) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [show, onClose]);
}

// ── Pago Quincenal Confirm ──────────────────────────────────────────────────
interface PagoConfirmProps {
  show: boolean;
  nombreEmpleado: string;
  deduccionQuincenal: number;
  onClose: () => void;
  onConfirm: () => void;
}

export function PagoQuincenalConfirm({ show, nombreEmpleado, deduccionQuincenal, onClose, onConfirm }: PagoConfirmProps) {
  useEscClose(show, onClose);
  if (!show) return null;
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-lg p-6 max-w-sm w-full mx-4" onClick={e => e.stopPropagation()}>
        <h2 className="font-medium mb-3">Confirmar Pago Quincenal</h2>
        <p className="text-sm text-gray-500">
          ¿Registrar pago quincenal de <strong className="text-black">${fmt(deduccionQuincenal)}</strong> para <strong className="text-black">{nombreEmpleado}</strong>?
        </p>
        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 py-2 border border-gray-200 rounded-md text-sm hover:border-gray-400 transition">Cancelar</button>
          <button onClick={onConfirm} className="flex-1 py-2 bg-emerald-600 text-white rounded-md text-sm hover:bg-emerald-700 transition">Confirmar Pago</button>
        </div>
      </div>
    </div>
  );
}

// ── Delete Employee Confirm ────────────────────────────────────────────────
interface DeleteConfirmProps {
  show: boolean;
  nombreEmpleado: string;
  deleteInput: string;
  onChangeInput: (v: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}

export function DeleteEmpleadoConfirm({ show, nombreEmpleado, deleteInput, onChangeInput, onClose, onConfirm }: DeleteConfirmProps) {
  useEscClose(show, onClose);
  if (!show) return null;
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-lg p-6 max-w-sm w-full mx-4" onClick={e => e.stopPropagation()}>
        <h2 className="font-medium mb-2 text-red-700">Eliminar Empleado</h2>
        <p className="text-sm text-gray-500 mb-4">Esta acción es irreversible. Escribe el nombre del empleado para confirmar:</p>
        <p className="text-sm font-medium mb-2">{nombreEmpleado}</p>
        <input value={deleteInput} onChange={e => onChangeInput(e.target.value)} placeholder="Escribe el nombre..." className="w-full border-b border-gray-200 py-2 text-sm outline-none focus:border-red-500 transition" />
        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 py-2 border border-gray-200 rounded-md text-sm hover:border-gray-400 transition">Cancelar</button>
          <button onClick={onConfirm} disabled={deleteInput !== nombreEmpleado} className="flex-1 py-2 bg-red-600 text-white rounded-md text-sm hover:bg-red-700 transition disabled:opacity-50">
            Eliminar
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Clear History Confirm ──────────────────────────────────────────────────
interface ClearHistoryProps {
  show: boolean;
  movCount: number;
  clearInput: string;
  clearProgress?: string;
  onChangeInput: (v: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}

export function ClearHistoryConfirm({ show, movCount, clearInput, clearProgress, onChangeInput, onClose, onConfirm }: ClearHistoryProps) {
  useEscClose(show, onClose);
  if (!show) return null;
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-lg p-6 max-w-sm w-full mx-4" onClick={e => e.stopPropagation()}>
        <h2 className="font-medium mb-2 text-red-700">Borrar Todo el Historial</h2>
        {clearProgress ? (
          <p className="text-sm text-amber-600 font-medium py-4">{clearProgress}</p>
        ) : (
          <>
            <p className="text-sm text-gray-500 mb-4">
              Esta acción eliminará {movCount} movimiento{movCount > 1 ? "s" : ""} de forma irreversible. Escribe CONFIRMAR para continuar:
            </p>
            <input value={clearInput} onChange={e => onChangeInput(e.target.value)} placeholder='Escribe "CONFIRMAR"' className="w-full border-b border-gray-200 py-2 text-sm outline-none focus:border-red-500 transition" />
            <div className="flex gap-3 mt-6">
              <button onClick={onClose} className="flex-1 py-2 border border-gray-200 rounded-md text-sm hover:border-gray-400 transition">Cancelar</button>
              <button onClick={onConfirm} disabled={clearInput !== "CONFIRMAR"} className="flex-1 py-2 bg-red-600 text-white rounded-md text-sm hover:bg-red-700 transition disabled:opacity-50">
                Borrar Todo
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Force Archive Confirm ──────────────────────────────────────────────────
interface ForceArchiveProps {
  show: boolean;
  saldo: number;
  onClose: () => void;
  onConfirm: () => void;
}

export function ForceArchiveConfirm({ show, saldo, onClose, onConfirm }: ForceArchiveProps) {
  useEscClose(show, onClose);
  if (!show) return null;
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-lg p-6 max-w-sm w-full mx-4" onClick={e => e.stopPropagation()}>
        <h2 className="font-medium mb-2 text-red-700">Forzar Archivado</h2>
        <p className="text-sm text-gray-500 mb-4">
          Este empleado tiene saldo pendiente de <strong className="text-red-600">${fmt(saldo)}</strong>. ¿Confirmas que deseas archivarlo?
        </p>
        <div className="flex gap-3 mt-4">
          <button onClick={onClose} className="flex-1 py-2 border border-gray-200 rounded-md text-sm hover:border-gray-400 transition">Cancelar</button>
          <button onClick={onConfirm} className="flex-1 py-2 bg-red-600 text-white rounded-md text-sm hover:bg-red-700 transition">
            Confirmar Archivado
          </button>
        </div>
      </div>
    </div>
  );
}

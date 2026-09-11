"use client";

import { useEffect, useState } from "react";
import { useBodyScrollLock } from "@/lib/hooks/useBodyScrollLock";
import { fmt, fmtDate } from "@/lib/format";
import { CajaGasto } from "./types";

interface Props {
  open: boolean;
  onClose: () => void;
  deletedGastos: CajaGasto[];
  /** ¿El período está abierto? Solo ahí se puede devolver un gasto. */
  periodoAbierto?: boolean;
  /** Recargar el período cuando uno vuelve. */
  onRestaurado?: () => void;
}

function fmtDeletedAt(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso)
      .toLocaleString("es-PA", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
      .replace(".", "");
  } catch {
    return "—";
  }
}

/**
 * Los gastos eliminados de un período — y cómo devolverlos.
 *
 * 🔄 11-sep-2026 — VUELVE «RESTAURAR». Se había retirado el 7-sep por cero
 * usos, pero el aviso de eliminar siguió prometiéndolo con todas las letras
 * («Podrás restaurarlo desde Gastos eliminados si es un error») y esta
 * pantalla era de solo lectura: la promesa quedó siendo falsa cuatro días.
 * Daniel, textual: *«a) vuelve Restaurar»*. El soft delete ya estaba
 * (`deleted`, `deleted_by`, `deleted_at`); lo único que faltaba era el botón.
 *
 * ⚠️ Solo con el período ABIERTO: devolver un gasto a un período cerrado le
 * cambiaría el total a algo que ya se imprimió. El servidor lo rechaza igual.
 *
 * La columna «Responsable» también se fue: el gasto ya no lleva responsable
 * (es del PERÍODO). En su lugar va el proveedor, que es lo que distingue un
 * recibo de otro.
 */
export default function DeletedGastosModal({
  open,
  onClose,
  deletedGastos,
  periodoAbierto = false,
  onRestaurado,
}: Props) {
  // Lock body scroll mientras está abierto (hook compartido, ref-count).
  useBodyScrollLock(open);

  const [restaurando, setRestaurando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function restaurar(g: CajaGasto) {
    setRestaurando(g.id);
    setError(null);
    try {
      const res = await fetch(`/api/caja/gastos/${g.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restaurar: true }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? "No se pudo devolver el gasto.");
      }
      onRestaurado?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo devolver el gasto.");
    } finally {
      setRestaurando(null);
    }
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Gastos eliminados"
        className="bg-white sm:rounded-lg rounded-t-2xl w-full sm:max-w-3xl sm:mx-4 border border-gray-200 max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h3 className="text-base font-medium">
            Gastos eliminados ({deletedGastos.length})
          </h3>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="text-gray-400 hover:text-black transition p-1 min-h-[44px] min-w-[44px] flex items-center justify-center -mr-2"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </header>

        {error && (
          <p className="px-5 pt-3 text-sm text-red-600">{error}</p>
        )}

        <div className="flex-1 overflow-y-auto">
          {/* El encabezado ya dice "Gastos eliminados (0)": acá alcanza con que
              la lista vacía tenga algo que mirar. */}
          {deletedGastos.length === 0 ? (
            <p className="text-sm text-gray-400 p-8 text-center">Ninguno.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs min-w-[640px]">
                <thead>
                  <tr className="border-b border-gray-200 text-xs uppercase tracking-[0.05em] text-gray-400">
                    <th className="text-left py-2 px-3 font-normal">Fecha</th>
                    <th className="text-left py-2 px-3 font-normal">Descripción</th>
                    <th className="text-left py-2 px-3 font-normal">Proveedor</th>
                    <th className="text-right py-2 px-3 font-normal">Total</th>
                    <th className="text-left py-2 px-3 font-normal">Borrado por</th>
                    <th className="text-left py-2 px-3 font-normal">Borrado cuándo</th>
                    {periodoAbierto && <th className="py-2 px-3"><span className="sr-only">Devolver</span></th>}
                  </tr>
                </thead>
                <tbody>
                  {deletedGastos.map((g) => (
                    <tr key={g.id} className="border-b border-gray-200 hover:bg-gray-50 transition-colors">
                      <td className="py-2 px-3 text-gray-500 whitespace-nowrap">{fmtDate(g.fecha)}</td>
                      <td className="py-2 px-3">{g.descripcion || g.nombre || "—"}</td>
                      <td className="py-2 px-3 text-gray-500">{g.proveedor || "—"}</td>
                      <td className="py-2 px-3 text-right tabular-nums">${fmt(g.total)}</td>
                      <td className="py-2 px-3 text-gray-500">{g.deleted_by_name || "—"}</td>
                      <td className="py-2 px-3 text-gray-500 whitespace-nowrap">{fmtDeletedAt(g.deleted_at)}</td>
                      {periodoAbierto && (
                        <td className="py-2 px-3 text-right">
                          <button
                            type="button"
                            onClick={() => { void restaurar(g); }}
                            disabled={restaurando === g.id}
                            className="text-xs text-gray-700 hover:text-black underline underline-offset-2 min-h-[44px] inline-flex items-center disabled:opacity-50"
                          >
                            {restaurando === g.id ? "Devolviendo…" : "Restaurar"}
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

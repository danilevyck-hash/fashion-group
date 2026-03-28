"use client";

import { fmt, fmtDate } from "@/lib/format";
import { Movimiento, CONCEPTO_COLORS } from "./types";

interface Props {
  sortedMovs: Movimiento[];
  isAdmin: boolean;
  isAdminOrDirector: boolean;
  canEdit: boolean;
  onApprove: (movId: string) => void;
  onEdit: (m: Movimiento) => void;
  onDelete: (movId: string) => void;
}

export default function MovimientoTable({ sortedMovs, isAdmin, isAdminOrDirector, canEdit, onApprove, onEdit, onDelete }: Props) {
  return (
    <div className="mb-8">
      <h2 className="text-[11px] uppercase tracking-[0.05em] text-gray-400 mb-3">Historial de Movimientos</h2>
      {sortedMovs.length === 0 ? (
        <div className="text-center py-12 text-gray-400 text-sm">Sin movimientos registrados</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left py-3 px-4 text-[11px] uppercase tracking-[0.05em] text-gray-400 font-normal">Fecha</th>
                <th className="text-left py-3 px-4 text-[11px] uppercase tracking-[0.05em] text-gray-400 font-normal">Concepto</th>
                <th className="text-right py-3 px-4 text-[11px] uppercase tracking-[0.05em] text-gray-400 font-normal">Monto</th>
                <th className="text-left py-3 px-4 text-[11px] uppercase tracking-[0.05em] text-gray-400 font-normal">Notas</th>
                <th className="text-left py-3 px-4 text-[11px] uppercase tracking-[0.05em] text-gray-400 font-normal">Estado</th>
                <th className="py-3 px-4 text-[11px] uppercase tracking-[0.05em] text-gray-400 font-normal">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {sortedMovs.map((m, i) => (
                <tr key={m.id} className={`${i % 2 === 1 ? "bg-gray-50/50" : ""} hover:bg-gray-50 transition-colors`}>
                  <td className="py-3 px-4 tabular-nums">{fmtDate(m.fecha)}</td>
                  <td className={`py-3 px-4 font-medium ${CONCEPTO_COLORS[m.concepto] || ""}`}>{m.concepto}</td>
                  <td className="py-3 px-4 text-right tabular-nums font-medium">${fmt(m.monto)}</td>
                  <td className="py-3 px-4 text-gray-400 text-xs max-w-[200px] truncate" title={m.notas || ""}>{m.notas || "—"}</td>
                  <td className="py-3 px-4">
                    {m.estado === "aprobado" ? (
                      <span className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded-full">Aprobado</span>
                    ) : (
                      <span className="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full">Pendiente aprobación</span>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-1">
                      {m.estado === "pendiente_aprobacion" && isAdminOrDirector && (
                        <button onClick={() => onApprove(m.id)} className="text-xs bg-green-600 text-white px-3 py-1 rounded-full hover:bg-green-700 transition">Aprobar</button>
                      )}
                      {canEdit && (
                        <button onClick={() => onEdit(m)} className="p-1.5 hover:bg-blue-50 rounded-lg transition text-gray-400 hover:text-blue-500" title="Editar">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
                        </button>
                      )}
                      {isAdmin && (
                        <button onClick={() => onDelete(m.id)} className="p-1.5 hover:bg-red-50 rounded-lg transition text-gray-400 hover:text-red-500" title="Eliminar">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

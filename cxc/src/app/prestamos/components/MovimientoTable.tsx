"use client";

import { fmt, fmtDate } from "@/lib/format";
import { Movimiento, CONCEPTO_COLORS } from "./types";
import { EmptyState, StatusBadge } from "@/components/ui";

interface Props {
  sortedMovs: Movimiento[];
  saldoByMov: Map<string, number>;
  isAdmin: boolean;
  canEdit: boolean;
  canDelete: boolean;
  onApprove: (movId: string) => void;
  onEdit: (m: Movimiento) => void;
  onDelete: (movId: string) => void;
}

const PRESTAMO_CONCEPTOS = ["Préstamo", "Responsabilidad por daño"];

function isCargo(concepto: string) {
  return PRESTAMO_CONCEPTOS.includes(concepto);
}

export default function MovimientoTable({ sortedMovs, saldoByMov, isAdmin, canEdit, canDelete, onApprove, onEdit, onDelete }: Props) {
  const total = sortedMovs.length;
  const hasMixedEstados = sortedMovs.some(m => m.estado !== "aprobado");

  return (
    <div className="mb-6">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-xs uppercase tracking-[0.05em] text-gray-400">Estado de Cuenta</h2>
        {total > 0 && (
          <span className="text-xs text-gray-400 tabular-nums">{total} movimiento{total !== 1 ? "s" : ""}</span>
        )}
      </div>
      {sortedMovs.length === 0 ? (
        <EmptyState title="Sin movimientos registrados" subtitle="Registra el primer movimiento" />
      ) : (
        <div className="overflow-x-auto -mx-4 sm:mx-0">
          <div className="min-w-[700px] px-4 sm:px-0">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white z-10">
              <tr className="border-b border-gray-200">
                <th className="text-left py-3 px-4 text-xs uppercase tracking-[0.05em] text-gray-400 font-normal">Fecha</th>
                <th className="text-left py-3 px-4 text-xs uppercase tracking-[0.05em] text-gray-400 font-normal">Concepto</th>
                <th className="text-left py-3 px-4 text-xs uppercase tracking-[0.05em] text-gray-400 font-normal">Notas</th>
                <th className="text-right py-3 px-4 text-xs uppercase tracking-[0.05em] text-gray-400 font-normal">Monto</th>
                <th className="text-right py-3 px-4 text-xs uppercase tracking-[0.05em] text-gray-400 font-normal">Saldo</th>
                {hasMixedEstados && (
                  <th className="text-left py-3 px-4 text-xs uppercase tracking-[0.05em] text-gray-400 font-normal">Estado</th>
                )}
                <th className="py-3 px-4 text-xs uppercase tracking-[0.05em] text-gray-400 font-normal">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {sortedMovs.map((m, i) => {
                const cargo = isCargo(m.concepto);
                const sign = cargo ? "+" : "−";
                const montoColor = cargo ? "text-red-600" : "text-green-600";
                const saldo = saldoByMov.get(m.id);
                return (
                <tr key={m.id} className={`${i % 2 === 1 ? "bg-gray-50/50" : ""} hover:bg-gray-50 transition-colors`}>
                  <td className="py-3 px-4 tabular-nums">{fmtDate(m.fecha)}</td>
                  <td className={`py-3 px-4 font-medium ${CONCEPTO_COLORS[m.concepto] || ""}`}>{m.concepto}</td>
                  <td className="py-3 px-4 text-gray-400 text-xs max-w-[200px] truncate" title={m.notas || ""}>{m.notas || "—"}</td>
                  <td className={`py-3 px-4 text-right tabular-nums font-medium ${montoColor}`}>{sign}${fmt(m.monto)}</td>
                  <td className="py-3 px-4 text-right tabular-nums font-medium text-gray-700">
                    {saldo !== undefined ? `$${fmt(saldo)}` : <span className="text-gray-300">—</span>}
                  </td>
                  {hasMixedEstados && (
                    <td className="py-3 px-4">
                      <StatusBadge estado={m.estado === "pendiente_aprobacion" ? "En revisión" : m.estado} />
                    </td>
                  )}
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-1">
                      {m.estado === "pendiente_aprobacion" && isAdmin && (
                        <button onClick={() => onApprove(m.id)} className="text-xs bg-green-600 text-white px-3 py-1 rounded-md hover:bg-green-700 transition">Aprobar</button>
                      )}
                      {canEdit && (m.estado !== "aprobado" || (Date.now() - new Date(m.created_at).getTime() < 24 * 60 * 60 * 1000)) && (
                        <button onClick={() => onEdit(m)} className="p-1.5 hover:bg-blue-50 rounded-lg transition text-gray-400 hover:text-blue-500" title="Editar">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
                        </button>
                      )}
                      {canDelete && (
                        <button onClick={() => onDelete(m.id)} className="p-1.5 hover:bg-red-50 rounded-lg transition text-gray-400 hover:text-red-500" title="Eliminar">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </div>
  );
}

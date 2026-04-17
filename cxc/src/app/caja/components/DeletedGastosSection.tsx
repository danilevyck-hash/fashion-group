"use client";

import { useState } from "react";
import { fmt, fmtDate } from "@/lib/format";
import { CajaGasto } from "./types";

interface Props {
  deletedGastos: CajaGasto[];
  isOpen: boolean;
  onRestore: (gasto: CajaGasto) => void;
}

function fmtDeletedAt(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleString("es-PA", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).replace(".", "");
  } catch {
    return "—";
  }
}

export default function DeletedGastosSection({ deletedGastos, isOpen, onRestore }: Props) {
  const [expanded, setExpanded] = useState(false);

  if (deletedGastos.length === 0) return null;

  return (
    <div className="mb-10">
      <button
        onClick={() => setExpanded(!expanded)}
        className="text-[11px] uppercase tracking-[0.05em] text-gray-400 hover:text-black transition flex items-center gap-1 mb-3"
      >
        <span className={`inline-block transition-transform ${expanded ? "rotate-90" : ""}`}>
          ›
        </span>
        Gastos eliminados ({deletedGastos.length})
      </button>

      {expanded && (
        <div className="overflow-x-auto -mx-4 sm:mx-0">
          <div className="min-w-[700px] px-4 sm:px-0">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-200 text-[11px] uppercase tracking-[0.05em] text-gray-400">
                  <th className="text-left py-2 px-3 font-normal">Fecha</th>
                  <th className="text-left py-2 px-3 font-normal">Descripción</th>
                  <th className="text-left py-2 px-3 font-normal">Responsable</th>
                  <th className="text-right py-2 px-3 font-normal">Total</th>
                  <th className="text-left py-2 px-3 font-normal">Borrado por</th>
                  <th className="text-left py-2 px-3 font-normal">Borrado cuándo</th>
                  {isOpen && <th className="py-2 px-3 font-normal"></th>}
                </tr>
              </thead>
              <tbody>
                {deletedGastos.map((g) => (
                  <tr key={g.id} className="border-b border-gray-200 hover:bg-gray-50 transition-colors">
                    <td className="py-2 px-3 text-gray-500">{fmtDate(g.fecha)}</td>
                    <td className="py-2 px-3">{g.descripcion || g.nombre || "—"}</td>
                    <td className="py-2 px-3 text-gray-500">{g.responsable || "—"}</td>
                    <td className="py-2 px-3 text-right tabular-nums">${fmt(g.total)}</td>
                    <td className="py-2 px-3 text-gray-500">{g.deleted_by_name || "—"}</td>
                    <td className="py-2 px-3 text-gray-500">{fmtDeletedAt(g.deleted_at)}</td>
                    {isOpen && (
                      <td className="py-2 px-3 text-right">
                        <button
                          onClick={() => onRestore(g)}
                          className="text-xs text-gray-500 hover:text-black transition border border-gray-200 rounded px-2 py-1 hover:border-gray-400"
                        >
                          Restaurar
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

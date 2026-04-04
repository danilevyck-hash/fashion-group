"use client";

import { fmt } from "@/lib/format";
import { Movimiento, getLast12Quincenas } from "./types";

interface Props {
  movs: Movimiento[];
  deduccionQuincenal: number;
}

export default function DeduccionesHistorial({ movs, deduccionQuincenal }: Props) {
  if (deduccionQuincenal <= 0) return null;

  const tolerance = 3 * 86400000;

  return (
    <div className="mb-8">
      <h2 className="text-[11px] uppercase tracking-[0.05em] text-gray-400 mb-3">Historial de Deducciones (últimos 6 meses)</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-white z-10">
            <tr className="border-b border-gray-200">
              <th className="text-left py-2 px-3 text-[11px] uppercase tracking-[0.05em] text-gray-400 font-normal">Quincena</th>
              <th className="text-right py-2 px-3 text-[11px] uppercase tracking-[0.05em] text-gray-400 font-normal">Esperada</th>
              <th className="text-right py-2 px-3 text-[11px] uppercase tracking-[0.05em] text-gray-400 font-normal">Aplicada</th>
              <th className="text-left py-2 px-3 text-[11px] uppercase tracking-[0.05em] text-gray-400 font-normal">Estado</th>
            </tr>
          </thead>
          <tbody>
            {getLast12Quincenas().map((q, i) => {
              const pago = movs.find(m =>
                m.estado === "aprobado" &&
                (m.concepto === "Pago" || m.concepto === "Abono extra") &&
                new Date(m.fecha + "T12:00:00").getTime() >= q.start.getTime() - tolerance &&
                new Date(m.fecha + "T12:00:00").getTime() <= q.end.getTime() + tolerance
              );
              return (
                <tr key={i} className={i % 2 === 1 ? "bg-gray-50/50" : ""}>
                  <td className="py-2 px-3">{q.label}</td>
                  <td className="py-2 px-3 text-right tabular-nums">${fmt(deduccionQuincenal)}</td>
                  <td className="py-2 px-3 text-right tabular-nums">{pago ? `$${fmt(pago.monto)}` : "—"}</td>
                  <td className="py-2 px-3">
                    {pago
                      ? <span className="text-[10px] bg-green-50 text-green-700 px-1.5 py-0.5 rounded-full">✓</span>
                      : <span className="text-[10px] bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded-full">⚠ No aplicada</span>
                    }
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

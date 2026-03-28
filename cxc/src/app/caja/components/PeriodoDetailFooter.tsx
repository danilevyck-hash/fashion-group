"use client";

import { fmt } from "@/lib/format";
import { CajaPeriodo } from "./types";

interface Props {
  current: CajaPeriodo;
  totalGastado: number;
  isOpen: boolean;
  onPrint: () => void;
  onClose: () => void;
  onAprobarReposicion: (id: string) => void;
  onExportExcel: () => void;
}

export default function PeriodoDetailFooter({
  current,
  totalGastado,
  isOpen,
  onPrint,
  onClose,
  onAprobarReposicion,
  onExportExcel,
}: Props) {
  return (
    <>
      {/* Reposición */}
      {current.estado === "cerrado" && (
        <div className="mt-8 border-t border-gray-100 pt-8 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Reposición de fondos</p>
            <p className="text-sm text-gray-400 mt-0.5">
              Total a reponer: ${fmt(totalGastado)}
            </p>
          </div>
          {!current.repuesto ? (
            <button
              onClick={() => onAprobarReposicion(current.id)}
              className="text-sm bg-black text-white px-6 py-2.5 rounded-full font-medium hover:bg-gray-800 transition"
            >
              Aprobar reposición
            </button>
          ) : (
            <span className="text-sm text-green-600 font-medium">
              ✓ Repuesto el{" "}
              {current.repuesto_at
                ? new Date(current.repuesto_at).toLocaleDateString("es-PA")
                : ""}
            </span>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-6 mt-8">
        <button
          onClick={onPrint}
          className="text-sm bg-black text-white px-6 py-2 rounded-full hover:bg-gray-800 transition"
        >
          Imprimir
        </button>
        <button
          onClick={onExportExcel}
          title="Exportar gastos a Excel"
          className="text-sm text-gray-400 hover:text-black border border-gray-200 px-4 py-2 rounded-full transition"
        >
          ↓ Excel
        </button>
        {isOpen && (
          <button
            onClick={onClose}
            className="text-sm text-gray-400 hover:text-black transition"
          >
            Cerrar Período
          </button>
        )}
      </div>
    </>
  );
}

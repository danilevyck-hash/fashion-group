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
        <div className="mt-8 border-t border-gray-200 pt-8 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Reposición de fondos</p>
            <p className="text-sm text-gray-400 mt-0.5">
              Total a reponer: ${fmt(totalGastado)}
            </p>
          </div>
          {!current.repuesto ? (
            <div>
              <button
                onClick={() => onAprobarReposicion(current.id)}
                title="Reponer = devolver el dinero gastado al fondo de caja"
                className="text-sm bg-black text-white px-6 py-2.5 rounded-md font-medium hover:bg-gray-800 active:scale-[0.97] transition-all"
              >
                Aprobar reposicion
              </button>
              <p className="text-[10px] text-gray-400 mt-1 text-right">Reponer = devolver el dinero gastado al fondo de caja</p>
            </div>
          ) : (
            <span className="text-sm text-green-600 font-medium">
              ✓ Repuesto el{" "}
              {current.repuesto_at
                ? new Date(current.repuesto_at).toLocaleDateString("es-PA", { day: "numeric", month: "short", year: "numeric" }).replace(".", "")
                : ""}
            </span>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-6 mt-8">
        <button
          onClick={onPrint}
          className="text-sm bg-black text-white px-6 py-2 rounded-md hover:bg-gray-800 active:scale-[0.97] transition-all"
        >
          Imprimir
        </button>
        <button
          onClick={onExportExcel}
          title="Exportar gastos a Excel"
          className="text-sm text-gray-400 hover:text-black border border-gray-200 px-4 py-2 rounded-md transition"
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

"use client";

// Nota de criterios de comisión, colapsada tras un disclosure "ⓘ Criterios".
// Compartida por la vista por-empresa y la consolidada.

import { useState } from "react";
import { Info, ChevronDown } from "lucide-react";

export function ComisionesCriterios() {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 text-xs text-gray-600">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left transition hover:bg-gray-100 active:scale-[0.99]"
        aria-expanded={open}
      >
        <Info className="h-4 w-4 shrink-0 text-gray-400" />
        <span className="font-medium text-gray-700">Criterios</span>
        <ChevronDown
          className={`ml-auto h-4 w-4 shrink-0 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <p className="border-t border-gray-200 px-3 py-2.5">
          <b>Venta:</b> facturas con utilidad &gt;20% menos notas de crédito.{" "}
          <b>Cobro:</b> recibos del mes, excluyendo retenciones de ITBMS. Ambas
          excluyen intercompañía y clientes internos, y se asignan al vendedor
          dueño del cliente. Fuente: reportes de Switch.
        </p>
      )}
    </div>
  );
}

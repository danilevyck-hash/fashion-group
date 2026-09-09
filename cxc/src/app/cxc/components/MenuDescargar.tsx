"use client";

import { ENCABEZADO_DESCARGAS } from "@/lib/cxc/descargas";
import { LINEAS_DESCARGA, type FormatoDescarga } from "../hooks/useDescargasCartera";
import type { ClaveDescarga } from "@/lib/cxc/descargas";

interface Props {
  onDescargar: (clave: ClaveDescarga, formato: FormatoDescarga) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 EL MENÚ DE «DESCARGAR» — EL MISMO EN LA COMPUTADORA Y EN EL CELULAR
// (8-sep-2026).
//
//     TODOS LOS CLIENTES
//       Total por cliente          PDF · EXCEL
//       Detallado por compañía     PDF · EXCEL
//
// 🩸 Eran TRES opciones con subtítulo en la computadora (`CSV (Excel)` · `PDF
// Resumen` · `PDF Detallado`) y UNA distinta en el celular (`Descargar CSV`, que
// bajaba otro archivo). Dos pantallas del mismo módulo ofreciendo cosas
// distintas es cómo alguien pide «el Excel» y recibe otro.
//
// 🔴 SIN SUBTÍTULOS. El rótulo dice qué trae; una línea gris explicándolo debajo
// es la explicación que un ERP no necesita.
//
// 🔴 SE FUERON LOS DOS CSV. Daniel: *«en ningún lado quiero exportar CSV, solo
// Excel»*.
// ─────────────────────────────────────────────────────────────────────────────
export default function MenuDescargar({ onDescargar }: Props) {
  return (
    <div role="menu" aria-label="Descargar">
      <div className="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
        {ENCABEZADO_DESCARGAS}
      </div>
      {LINEAS_DESCARGA.map(({ clave, rotulo }) => (
        <div key={clave} className="flex items-center justify-between gap-3 px-3 py-1">
          <span className="text-sm text-gray-800">{rotulo}</span>
          <span className="flex shrink-0 items-center gap-1">
            <BotonFormato label="PDF" onClick={() => onDescargar(clave, "pdf")} rotulo={rotulo} />
            <span className="text-gray-300">·</span>
            <BotonFormato label="EXCEL" onClick={() => onDescargar(clave, "excel")} rotulo={rotulo} />
          </span>
        </div>
      ))}
    </div>
  );
}

/** 44 px de alto: se toca con el dedo en el iPad, no solo con el mouse. */
function BotonFormato({ label, rotulo, onClick }: { label: string; rotulo: string; onClick: () => void }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      aria-label={`${rotulo} en ${label}`}
      className="inline-flex min-h-[44px] items-center rounded-md px-2 text-xs font-semibold text-gray-500 transition hover:bg-gray-100 hover:text-gray-900 active:scale-[0.97]"
    >
      {label}
    </button>
  );
}

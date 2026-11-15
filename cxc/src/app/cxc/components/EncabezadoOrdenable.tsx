"use client";

// ─────────────────────────────────────────────────────────────────────────────
// EL ENCABEZADO DE CXC QUE SE ORDENA CON EL TECLADO (accesibilidad, 15-nov-2026,
// `ACCESIBILIDAD_2026_11`).
//
// 🩸 Antes eran cajas con `onClick`: con Tab no se llegaba, nada decía que se
// podían tocar y la explicación («clic para ordenar») solo salía al pasar el
// ratón. Ahora cada columna es un BOTÓN de verdad, en 14 px, con «días»
// completo, la flecha ↕ cuando no ordena y el anillo azul al llegar con Tab.
// Ordena igual que antes (`toggleSort`): ningún monto ni orden cambia.
// ─────────────────────────────────────────────────────────────────────────────

import { CLASE_CXC_COL_NOMBRE, CLASE_CXC_COL_TOTAL } from "@/lib/ui/revision-110-cxc";
import { AGING } from "@/lib/cxc-aging";
import type { SortKey } from "@/lib/cxc-orden";

interface Props {
  sinSeleccion: boolean;
  todosSeleccionados: boolean;
  onSeleccionarTodos: () => void;
  toggleSort: (key: SortKey) => void;
  sortArrow: (key: SortKey) => string;
}

const BOTON =
  "inline-flex min-h-[32px] items-center gap-1 rounded px-1 -mx-1 hover:text-gray-900 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600";

export default function EncabezadoOrdenable({ sinSeleccion, todosSeleccionados, onSeleccionarTodos, toggleSort, sortArrow }: Props) {
  const col = (key: SortKey, rotulo: string, extra = "") => {
    const flecha = sortArrow(key);
    return (
      <button
        type="button"
        onClick={() => toggleSort(key)}
        aria-label={`Ordenar por ${rotulo}${flecha === "▲" ? ", de menor a mayor" : flecha === "▼" ? ", de mayor a menor" : ""}`}
        className={`${BOTON} ${extra}`}
      >
        {rotulo}
        <span aria-hidden className="inline-block w-3 text-center leading-none">{flecha || "↕"}</span>
      </button>
    );
  };

  return (
    <div className="hidden sm:grid grid-cols-12 gap-2 px-4 py-2 bg-gray-50 border-b border-gray-200 text-sm font-medium text-gray-600 select-none">
      <div className={`${CLASE_CXC_COL_NOMBRE} flex items-center gap-1.5`}>
        {!sinSeleccion && (
          <input
            type="checkbox"
            checked={todosSeleccionados}
            onChange={onSeleccionarTodos}
            aria-label="Seleccionar a todos los de la lista"
            className="shrink-0 h-4 w-4 rounded border-gray-300 accent-black cursor-pointer"
          />
        )}
        {col("name", "Cliente")}
      </div>
      <div className="col-span-2 text-right">{col("current", AGING.current.label)}</div>
      <div className="col-span-2 text-right">{col("watch", AGING.watch.label)}</div>
      <div className="col-span-2 text-right">{col("overdue", AGING.overdue.label, "font-semibold")}</div>
      <div className={`${CLASE_CXC_COL_TOTAL} text-right`}>{col("total", "Total")}</div>
    </div>
  );
}

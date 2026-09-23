"use client";

// El campo «Proveedor» con los ya usados como sugerencia (22-sep-2026, pieza A).
//
// Daniel: *«al escribirlo se sugieren los ya usados»*. Es un campo de TEXTO
// LIBRE con una lista de ayuda debajo — NUNCA una lista cerrada: el proveedor
// nuevo se escribe y se guarda igual. Las sugerencias las arma
// `sugerirProveedores` (puro): por prefijo del NORMALIZADO (sin acentos, sin
// «S.A.», sin mayúsculas), UNA grafía por proveedor, la más usada primero. Así
// «impresora» encuentra «Impresora Comercial, S.A.» y no se ofrecen dos veces
// el mismo con otra puntuación.

import { useMemo, useState } from "react";
import { sugerirProveedores } from "@/lib/marketing/proveedor";

interface Props {
  id: string;
  value: string;
  onChange: (v: string) => void;
  /** Los nombres tal como se guardaron, con repeticiones. */
  historico: readonly string[];
  required?: boolean;
  className?: string;
}

export function ProveedorInput({ id, value, onChange, historico, required, className }: Props) {
  const [abierto, setAbierto] = useState(false);
  const sugerencias = useMemo(() => sugerirProveedores(value, historico), [value, historico]);
  // Si lo tecleado ya es exactamente la única sugerencia, no hay nada que ofrecer.
  const visibles =
    abierto && !(sugerencias.length === 1 && sugerencias[0].nombre === value.trim())
      ? sugerencias
      : [];

  return (
    <div className="relative">
      <input
        id={id}
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setAbierto(true);
        }}
        onFocus={() => setAbierto(true)}
        onBlur={() => setAbierto(false)}
        required={required}
        autoComplete="off"
        role="combobox"
        aria-expanded={visibles.length > 0}
        aria-controls={`${id}-sugerencias`}
        className={className}
      />
      {visibles.length > 0 && (
        <ul
          id={`${id}-sugerencias`}
          role="listbox"
          data-testid="proveedor-sugerencias"
          className="absolute left-0 right-0 z-20 mt-1 max-h-56 overflow-y-auto rounded-md border border-gray-200 bg-white py-1 text-sm"
        >
          {visibles.map((s) => (
            <li key={s.nombre} role="option" aria-selected={false}>
              <button
                type="button"
                /* onMouseDown y no onClick: el blur del input cerraría la
                   lista antes de que el clic llegue al botón. */
                onMouseDown={(e) => {
                  e.preventDefault();
                  onChange(s.nombre);
                  setAbierto(false);
                }}
                className="w-full text-left px-3 min-h-[44px] flex items-center justify-between gap-3 hover:bg-gray-50"
              >
                <span className="truncate text-gray-900">{s.nombre}</span>
                <span className="shrink-0 text-xs text-gray-400 tabular-nums">
                  {s.usos === 1 ? "1 vez" : `${s.usos} veces`}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default ProveedorInput;

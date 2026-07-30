"use client";

import { useRef, useState } from "react";
import DesplegableFlotante from "@/components/ui/DesplegableFlotante";

interface Props {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
  className?: string;
}

/**
 * Combobox de la edición EN LA FILA de GastoTable (camino de texto legacy).
 * Los campos de conjunto cerrado del formulario usan un <select> nativo.
 *
 * 🩸 La lista FLOTA (portal a <body> + fixed) desde el 30-jul-2026. Este es el
 * caso IDÉNTICO al de Guías: la fila vive en un `ScrollableTable`, o sea un
 * `overflow-x-auto`, y `overflow-x: auto` con `overflow-y: visible` computa
 * `overflow-y: auto` → recorta hacia abajo Y se vuelve scrolleable. Medido en
 * el navegador a 834 px, editando la ÚLTIMA fila de gastos y borrando la
 * categoría para ver la lista completa:
 *
 *   62 px de la lista RECORTADOS por `DIV.overflow-x-auto`
 *   el mismo contenedor pasaba de 0 a 62 px scrolleables → la fila que se está
 *   editando se puede ir de la vista, que es la foto que mandó Daniel en Guías
 *
 * Ver `DesplegableFlotante`.
 */
export default function AutocompleteInput({
  value,
  onChange,
  options,
  placeholder,
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const matches = value.length >= 1
    ? options.filter((o) => o.toLowerCase().includes(value.toLowerCase())).slice(0, 8)
    : options.slice(0, 8);

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
        placeholder={placeholder}
        className={className}
      />
      <DesplegableFlotante
        abierto={open && matches.length > 0}
        anclaRef={inputRef}
        marca="caja-categoria"
        // La columna de la tabla da ~110 px y "Alimentación" no entra. Ahora que
        // flota puede ser más ancha que su celda sin empujar nada.
        anchoMinimo={200}
        className="bg-white border border-gray-200 rounded-lg shadow-lg"
      >
        {matches.map((m) => (
          <button
            key={m}
            type="button"
            onMouseDown={() => { onChange(m); setOpen(false); }}
            // 44 px: se toca con el dedo, igual que el resto de los desplegables.
            className="flex w-full items-center text-left px-3 min-h-[44px] text-sm hover:bg-gray-50 transition"
          >
            {m}
          </button>
        ))}
      </DesplegableFlotante>
    </div>
  );
}

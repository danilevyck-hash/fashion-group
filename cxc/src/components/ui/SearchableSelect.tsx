"use client";

import { useRef, useState, type CSSProperties } from "react";
import DesplegableFlotante from "./DesplegableFlotante";

export interface SearchableOption {
  value: string;
  label: string;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  options: SearchableOption[];
  placeholder?: string;
  /** Clase del input (para contextos Tailwind como Cheques). */
  className?: string;
  /** Estilo base del input (para contextos con tokens inline como Caja). */
  style?: CSSProperties;
  /** Estilo extra aplicado SOLO cuando el input tiene foco (Caja: accent + shadow). */
  focusStyle?: CSSProperties;
  ariaLabel?: string;
  /** Item fijo al final del dropdown (ej. "+ Agregar vendedor"). */
  actionLabel?: string;
  onAction?: () => void;
  /** Se llama al perder el foco — útil para marcar el campo como "tocado". */
  onBlur?: () => void;
}

/**
 * Select de conjunto cerrado CON búsqueda. Promovido del patrón de
 * caja/components/AutocompleteInput pero para opciones {value,label} (soporta
 * catálogos por id, ej. responsable/vendedor) y un item de acción opcional.
 *
 * Muestra el label de la opción seleccionada cuando no tiene foco; al enfocar
 * abre el dropdown y permite teclear para filtrar. Emite el `value` elegido.
 *
 * 🩸 La lista FLOTA (portal a <body> + fixed) desde el 30-jul-2026. Era
 * `absolute top-full` dentro del formulario, y sus DOS usos viven en un panel
 * con scroll propio — `flex-1 overflow-y-auto` en el modal de Cheques y en el
 * cajón de Caja. Medido en el navegador con build de producción:
 *
 *   Cheques › Nuevo cheque › Vendedor ...... 34 px recortados @390, 17 @834
 *   Caja › Nuevo gasto › Responsable ....... 228 px recortados @390
 *
 * O sea: en el iPhone, elegir vendedor mostraba una tira de lista y el resto
 * quedaba debajo del borde del formulario. Ver `DesplegableFlotante`.
 */
export default function SearchableSelect({
  value,
  onChange,
  options,
  placeholder,
  className,
  style,
  focusStyle,
  ariaLabel,
  actionLabel,
  onAction,
  onBlur,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedLabel = options.find((o) => o.value === value)?.label ?? "";
  const q = query.trim().toLowerCase();
  const filtered = q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-label={ariaLabel}
        value={open ? query : selectedLabel}
        placeholder={placeholder}
        className={className}
        style={focused && focusStyle ? { ...style, ...focusStyle } : style}
        autoComplete="off"
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          setOpen(true);
          setQuery("");
          setFocused(true);
        }}
        onBlur={() => {
          // Delay para que el onMouseDown del item alcance a dispararse.
          setTimeout(() => setOpen(false), 150);
          setFocused(false);
          onBlur?.();
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setOpen(false);
            (e.target as HTMLInputElement).blur();
          }
        }}
      />
      <DesplegableFlotante
        abierto={open}
        anclaRef={inputRef}
        marca="select-busqueda"
        className="bg-white border border-gray-200 rounded-lg shadow-lg"
      >
        <>
          {filtered.length === 0 && !actionLabel && (
            <div className="px-3 py-2 text-sm text-gray-400">Sin resultados</div>
          )}
          {filtered.map((o) => (
            <button
              key={o.value}
              type="button"
              onMouseDown={() => {
                onChange(o.value);
                setQuery("");
                setOpen(false);
              }}
              // 44 px de alto: son opciones que se tocan con el dedo (Cheques y
              // Caja se usan desde el iPhone). Antes medían 36.
              className={`flex w-full items-center text-left px-3 min-h-[44px] text-sm hover:bg-gray-50 transition ${
                o.value === value ? "bg-gray-50 font-medium" : ""
              }`}
            >
              {o.label}
            </button>
          ))}
          {actionLabel && (
            <button
              type="button"
              onMouseDown={() => {
                setOpen(false);
                setQuery("");
                onAction?.();
              }}
              className="flex w-full items-center text-left px-3 min-h-[44px] text-sm font-medium text-black border-t border-gray-100 hover:bg-gray-50 transition"
            >
              {actionLabel}
            </button>
          )}
        </>
      </DesplegableFlotante>
    </div>
  );
}

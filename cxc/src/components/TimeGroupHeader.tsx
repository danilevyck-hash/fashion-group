"use client";

import { useState } from "react";
import { CLASE_BARRA_PEGAJOSA } from "@/lib/ui/barra-pegajosa";

interface TimeGroupHeaderProps {
  label: string;
  count: number;
  color: string;
  bgColor: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
  /** Number of columns the header should span (for table contexts) */
  colSpan?: number;
  /** Render as table row instead of div */
  asTableRow?: boolean;
}

export default function TimeGroupHeader({
  label,
  count,
  color,
  bgColor,
  defaultOpen = true,
  children,
}: TimeGroupHeaderProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        // 358×38 medidos en Guías. Es la cabecera que colapsa el grupo entero
        // ("Esta semana (15 guías)") y la comparten Guías y Cheques, así que un
        // solo `min-h-[44px]` cubre los dos. Se saca `py-2`: con el min-h y el
        // `items-center` el alto lo pone la caja, no el padding.
        // 🩸 El tope eran 56 px escritos a mano, y el encabezado no
        // mide 56 en ninguna de las dos pantallas: en el escritorio mide ≈70
        // (lleva el breadcrumb) y la cabecera del grupo se le metía encima; en
        // el celular mide ≈46 y quedaba una franja de 10 px por la que se veía
        // pasar la lista. Ahora el tope es el alto MEDIDO del encabezado.
        className={`${CLASE_BARRA_PEGAJOSA} w-full flex items-center gap-3 px-4 min-h-[44px] text-left transition-colors bg-gray-50/90 backdrop-blur-sm border-b border-gray-200`}
      >
        <svg
          className={`w-3 h-3 ${color} transition-transform shrink-0 ${open ? "rotate-90" : ""}`}
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path d="M6 4l8 6-8 6V4z" />
        </svg>
        <span className={`text-sm font-semibold ${color}`}>
          {label}
        </span>
        <span className="text-xs text-gray-400 tabular-nums">
          ({count} {count === 1 ? "guía" : "guías"})
        </span>
      </button>
      {open && children}
    </div>
  );
}

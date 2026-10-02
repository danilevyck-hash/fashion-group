"use client";

// El chip de la fila de filtros v4 (`CATALOGOS_APPLE_2026_10_B`, 2-oct-2026).
// Daniel: «¿los chips y un dropdown con opciones sería más Apple?». UN solo
// componente para los cuatro: «2+ bultos», «Género ▾», «Categoría ▾» y
// «Precio ▾». Dice lo elegido («Women ▾»), se resalta con el filtro puesto y
// los que abren algo llevan la flecha. Compacto: 13 px y 36 de alto, 44 de toque.

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { CHIP_V4 } from "@/lib/catalogo/catalogos-2026-10-b";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  activo: boolean;
  chipActive: string;
  chipInactive: string;
  /** Con flecha = abre un menú o un panel. Sin flecha = se prende y se apaga. */
  conFlecha?: boolean;
  children: ReactNode;
}

const ChipFiltro = forwardRef<HTMLButtonElement, Props>(function ChipFiltro(
  { activo, chipActive, chipInactive, conFlecha = false, children, className, ...resto },
  ref,
) {
  return (
    <button ref={ref} type="button" {...resto}
      className={`${CHIP_V4} gap-1 ${activo ? chipActive : chipInactive}${className ? ` ${className}` : ""}`}>
      <span>{children}</span>
      {conFlecha && (
        <svg className="w-3 h-3 shrink-0 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      )}
    </button>
  );
});

export default ChipFiltro;

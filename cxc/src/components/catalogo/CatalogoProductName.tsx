"use client";

// Nombre del producto de la card — COMPARTIDO por la card plana
// (CatalogoProductCard) y la agrupada (CatalogoGroupedCard), igual que
// CatalogoStockLine: así el bloque no puede derivar entre marcas.
//
// Contrato (Daniel, 25-jul-2026): SIEMPRE una sola línea.
//   · cabe → 14px,
//   · no cabe → se achica progresivamente hasta 11px,
//   · ni a 11px cabe → el CSS lo corta con "…" (clase `truncate` del tema).
// La altura es FIJA (h-5) en las 3 marcas: el nombre nunca puede cambiar el
// alto de la card ni desalinear la fila del grid.
//
// El cómo (canvas + un solo ResizeObserver, cero re-renders) vive en
// @/lib/catalogo/fit-one-line.

import { useEffect, useRef } from "react";
import { ajustarNombreUnaLinea } from "@/lib/catalogo/fit-one-line";

interface CatalogoProductNameProps {
  /** Texto del nombre. */
  nombre: string;
  /** Clases del tema (color por marca + geometría común: leading-5 h-5 truncate). */
  className: string;
}

export default function CatalogoProductName({ nombre, className }: CatalogoProductNameProps) {
  const ref = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    return ajustarNombreUnaLinea(el, nombre);
  }, [nombre]);

  // title: el nombre completo sigue disponible al pasar el mouse cuando se corta.
  return (
    <h3 ref={ref} className={className} title={nombre}>
      {nombre}
    </h3>
  );
}

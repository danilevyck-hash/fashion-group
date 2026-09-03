"use client";

import { TITULO_ULTIMOS_PAGOS } from "@/lib/cxc/ultimos-pagos";

/**
 * El botón «Últimos pagos ›» que abre/cierra el bloque de 3 pagos de UNA fila,
 * SIN expandir la fila. Es el mismo en las tres carteras (CXC escritorio, CXC
 * celular y Boston): un solo botón para que dentro de un mes no haya uno de
 * 44 px y otro de 36.
 *
 * Nació en la pestaña de Boston y se extrajo el 4-sep-2026 cuando el grupo
 * copió su patrón. Daniel, textual, sobre el CXC del grupo: *"lo quiero ahí
 * mismo pero con un botón para expandir, no solo al expandir el card, tendría
 * que hacer dos expandir para verlo"*. Un clic, no dos.
 *
 * ⚠️ Es DIBUJO puro: no sabe de qué cartera es la fila ni pide nada. La lectura
 * de cada cartera va por su propio hook (`useUltimosPagosGrupo` /
 * `useUltimosPagosBoston`) y ese es el candado que no se comparte.
 *
 * Alto táctil de 44 px: se usa desde el celular. `stopPropagation` en el clic
 * Y en el teclado porque vive adentro de filas que se expanden al clic y con
 * Enter/Espacio (la tarjeta de celular es un `role="button"`) — abrir los
 * pagos no es expandir.
 */
export default function BotonUltimosPagos({
  abierto,
  onToggle,
  nombre,
}: {
  abierto: boolean;
  onToggle: () => void;
  /** Nombre del cliente, para el `aria-label`. */
  nombre: string;
}) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
      onKeyDown={(e) => e.stopPropagation()}
      aria-expanded={abierto}
      aria-label={`${TITULO_ULTIMOS_PAGOS} de ${nombre}`}
      className="inline-flex min-h-[44px] shrink-0 items-center gap-1 rounded-md text-xs font-medium text-blue-600 transition active:scale-[0.97] active:opacity-70"
    >
      {TITULO_ULTIMOS_PAGOS}
      <svg width="10" height="10" viewBox="0 0 10 10" className={`transition-transform ${abierto ? "rotate-90" : ""}`} fill="currentColor" aria-hidden><path d="M3 1l5 4-5 4V1z"/></svg>
    </button>
  );
}

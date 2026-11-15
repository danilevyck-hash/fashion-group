import type { KeyboardEvent } from "react";
import { ACCESIBILIDAD_2026_11 } from "@/lib/ui/accesibilidad-2026-11";

/**
 * Accesibilidad (15-nov-2026): lo que se toca y NO es un `<button>` (una fila,
 * una tarjeta, una foto) también se alcanza con Tab y se abre con Enter o la
 * barra espaciadora. Se esparce sobre el elemento: `<div {...clicConTeclado(abrir)} onClick={abrir}>`.
 *
 * `fila: true` para un `<tr>`: no se le cambia el papel (sigue siendo fila de la
 * tabla), solo se le da el foco y las teclas.
 */
export function clicConTeclado(accion: () => void, opts?: { fila?: boolean; nombre?: string }) {
  if (!ACCESIBILIDAD_2026_11) return {};
  return {
    ...(opts?.fila ? {} : { role: "button" as const }),
    ...(opts?.nombre ? { "aria-label": opts.nombre } : {}),
    tabIndex: 0,
    onKeyDown: (e: KeyboardEvent) => {
      if (e.target !== e.currentTarget) return; // un botón de adentro maneja sus propias teclas
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        accion();
      }
    },
  };
}

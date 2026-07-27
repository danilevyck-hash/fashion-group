"use client";

import { ReactNode, useEffect, useRef } from "react";
import { useBodyScrollLock } from "@/lib/hooks/useBodyScrollLock";
import { useAutofocusPrimerCampo } from "@/lib/hooks/useAutofocusPrimerCampo";

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}

/**
 * Panel lateral. ESC + clic en el fondo cierran.
 *
 * 🩸 Tres defectos arreglados en jul-2026 (ver el detalle en
 * `src/lib/hooks/useAutofocusPrimerCampo.ts`):
 *
 * 1. **Robo de foco.** El efecto del autofocus dependía de `onClose`, que los
 *    llamadores pasan inline → identidad nueva por render → el foco saltaba al
 *    ✕ 50 ms después de cada tecla. Ahora el autofocus vive en un hook que
 *    depende solo de `open`, y el Escape lee `onClose` por ref.
 * 2. **Cerrado pero tabulable.** El panel siempre estaba montado y solo
 *    desplazado (`translate-x-full`), así que sus campos seguían en el orden de
 *    tabulación de la página de atrás. Ahora se apaga con `invisible`, que sí
 *    los saca del recorrido del Tab en todos los navegadores. La visibilidad va
 *    en la transición para no cortar la animación de salida.
 * 3. **Pie pegado al borde en iPhone.** Sin `env(safe-area-inset-bottom)` los
 *    botones caían debajo de la barra de gestos.
 */
export default function Drawer({ open, onClose, title, children, footer }: DrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Espejo de `onClose` para que el listener de Escape no dependa de su
  // identidad (los llamadores la pasan inline y cambia en cada render).
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Lock body scroll behind drawer (hook compartido con ref-count).
  useBodyScrollLock(open);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Enfoca el PRIMER CAMPO, nunca el botón ✕ de la cabecera.
  useAutofocusPrimerCampo(open, panelRef);

  return (
    <>
      {/* Overlay */}
      <div
        onClick={onClose}
        aria-hidden="true"
        className={`fixed inset-0 bg-black/30 z-40 transition-opacity duration-200 ${open ? "opacity-100" : "opacity-0 pointer-events-none"}`}
      />
      {/* Panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        aria-hidden={!open}
        // `w-full sm:w-[480px]` dejaba una banda fija de 480 px: en iPad
        // vertical (768) el panel tapaba el 62 % y en horizontal (1024) el 47 %,
        // con el resto de la pantalla oscurecido sin usar. Ahora el ancho
        // acompaña a la pantalla y 480 px pasa a ser el MÍNIMO, no el total.
        className={`fixed top-0 right-0 h-full w-full sm:w-[min(560px,60vw)] lg:w-[480px] bg-white z-50 shadow-xl transition-[transform,visibility] duration-200 ease-out flex flex-col ${open ? "translate-x-0 visible" : "translate-x-full invisible pointer-events-none"}`}
        // El panel arranca en top:0, así que su cabecera (con el ✕) cae debajo
        // de la Dynamic Island en cuanto la PWA use status bar translúcida. Hoy
        // el inset es 0 (`apple-mobile-web-app-status-bar-style: black`) y esto
        // no cambia nada; el día que cambie, el ✕ sigue siendo alcanzable.
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <header className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h2 className="text-base font-medium">{title}</h2>
          <button onClick={onClose} aria-label="Cerrar" className="text-gray-400 hover:text-black transition p-1 min-h-[44px] min-w-[44px] flex items-center justify-center -mr-2">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <footer
            className="border-t border-gray-200 px-5 py-3 bg-white"
            // Sin esto, en iPhone con barra de gestos los botones quedan pegados
            // al borde inferior y se tocan por accidente al deslizar para salir.
            style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
          >
            {footer}
          </footer>
        )}
      </div>
    </>
  );
}

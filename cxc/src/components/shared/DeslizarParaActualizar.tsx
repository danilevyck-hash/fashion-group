"use client";

// El gesto de «deslizar hacia abajo para actualizar», UNO para toda la app
// (montado en el layout). Qué hace lo decide `accionDelGesto()`: el mismo
// «Actualizar» de la pantalla, o la recarga de sus datos. Ver
// `lib/ui/deslizar-para-actualizar.ts`.

import { useEffect, useRef, useState, type RefObject } from "react";
import {
  accionDelGesto,
  distanciaConResistencia,
  DESLIZAR_ACTUALIZA_CON_SWITCH,
  registrarAccionDelGesto,
  UMBRAL_PX,
  type AccionDelGesto,
} from "@/lib/ui/deslizar-para-actualizar";
import { vidrioSobre } from "@/lib/ui/vidrio";

/** Inscribe la acción del gesto mientras `activo`. `ejecutar` y `ocupado` se
 *  leen al momento del gesto (siempre la versión del último render). */
export function useAccionDelGesto(
  tipo: AccionDelGesto["tipo"],
  ref: RefObject<Element>,
  activo: boolean,
  ejecutar: () => void | Promise<void>,
  ocupado: () => boolean = () => false,
): void {
  const ultimo = useRef({ ejecutar, ocupado });
  ultimo.current = { ejecutar, ocupado };
  useEffect(() => {
    if (!DESLIZAR_ACTUALIZA_CON_SWITCH || !activo) return;
    return registrarAccionDelGesto({
      tipo,
      el: () => ref.current,
      ocupado: () => ultimo.current.ocupado(),
      ejecutar: () => ultimo.current.ejecutar(),
    });
  }, [tipo, ref, activo]);
}

/** ¿El dedo empezó donde un deslizar es de la PÁGINA? No en una hoja, un
 *  modal, el encabezado ni una lista con scroll propio que no está arriba. */
function empiezaEnLaPagina(target: EventTarget | null): boolean {
  if (document.querySelector('[aria-modal="true"], [data-bottomsheet-scroll]')) return false;
  if (getComputedStyle(document.body).overflow === "hidden") return false;
  let el = target as HTMLElement | null;
  while (el && el !== document.body) {
    const cs = getComputedStyle(el);
    if (cs.position === "fixed") return false;
    if ((cs.overflowY === "auto" || cs.overflowY === "scroll") && el.scrollHeight > el.clientHeight + 1 && el.scrollTop > 0) {
      return false;
    }
    el = el.parentElement;
  }
  return true;
}

export default function DeslizarParaActualizar() {
  const [jalon, setJalon] = useState(0);
  const [corriendo, setCorriendo] = useState(false);
  const estado = useRef({ inicioY: 0, inicioX: 0, activo: false, decidido: false, distancia: 0, corriendo: false });

  useEffect(() => {
    if (!DESLIZAR_ACTUALIZA_CON_SWITCH) return;
    document.documentElement.setAttribute("data-deslizar", "");
    const s = estado.current;

    const alEmpezar = (e: TouchEvent) => {
      s.activo = false;
      if (s.corriendo || e.touches.length !== 1 || window.scrollY > 0) return;
      const accion = accionDelGesto();
      if (!accion || accion.ocupado() || !empiezaEnLaPagina(e.target)) return;
      s.inicioY = e.touches[0].clientY;
      s.inicioX = e.touches[0].clientX;
      s.activo = true;
      s.decidido = false;
      s.distancia = 0;
    };
    const alMover = (e: TouchEvent) => {
      if (!s.activo) return;
      const dy = e.touches[0].clientY - s.inicioY;
      const dx = e.touches[0].clientX - s.inicioX;
      if (!s.decidido && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
        s.decidido = true;
        // Hacia un lado (fila que se desliza) o hacia arriba (scroll): no es el gesto.
        if (Math.abs(dx) > Math.abs(dy) || dy < 0) s.activo = false;
      }
      if (!s.activo || window.scrollY > 0) {
        s.activo = false;
        s.distancia = 0;
        setJalon(0);
        return;
      }
      s.distancia = distanciaConResistencia(dy);
      setJalon(s.distancia);
    };
    const alSoltar = async () => {
      if (!s.activo) return;
      s.activo = false;
      const accion = s.distancia >= UMBRAL_PX ? accionDelGesto() : null;
      s.distancia = 0;
      setJalon(0);
      if (!accion || accion.ocupado()) return;
      s.corriendo = true;
      setCorriendo(true);
      try {
        await accion.ejecutar();
      } catch {
        // El aviso lo da la acción misma (el toast de «Actualizar»).
      } finally {
        s.corriendo = false;
        setCorriendo(false);
      }
    };

    window.addEventListener("touchstart", alEmpezar, { passive: true });
    window.addEventListener("touchmove", alMover, { passive: true });
    window.addEventListener("touchend", alSoltar, { passive: true });
    window.addEventListener("touchcancel", alSoltar, { passive: true });
    return () => {
      document.documentElement.removeAttribute("data-deslizar");
      window.removeEventListener("touchstart", alEmpezar);
      window.removeEventListener("touchmove", alMover);
      window.removeEventListener("touchend", alSoltar);
      window.removeEventListener("touchcancel", alSoltar);
    };
  }, []);

  if (!DESLIZAR_ACTUALIZA_CON_SWITCH || (jalon <= 4 && !corriendo)) return null;
  const listo = jalon >= UMBRAL_PX;
  const y = corriendo ? UMBRAL_PX : jalon;
  return (
    <div
      aria-hidden
      data-deslizar-indicador
      className={vidrioSobre("pointer-events-none fixed left-1/2 z-[11] flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-white shadow-sm")}
      style={{
        top: "calc(var(--fg-altura-encabezado, 0px) + env(safe-area-inset-top))",
        transform: `translate(-50%, ${y - 40}px)`,
        opacity: corriendo ? 1 : Math.min(1, jalon / UMBRAL_PX),
        transition: jalon === 0 || corriendo ? "transform 200ms ease-out, opacity 200ms" : "none",
      }}
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke={listo || corriendo ? "#2563eb" : "#9ca3af"}
        strokeWidth="2.25"
        strokeLinecap="round"
        className={corriendo ? "animate-spin" : undefined}
        style={corriendo ? undefined : { transform: `rotate(${(jalon / UMBRAL_PX) * 300}deg)` }}
      >
        <path d="M21 12a9 9 0 1 1-6.219-8.56" />
      </svg>
    </div>
  );
}

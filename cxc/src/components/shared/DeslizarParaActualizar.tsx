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

/** ¿Se ve? Una hoja cerrada sigue en el DOM (oculta o con `aria-hidden`). */
function abiertoDeVerdad(el: Element): boolean {
  return !el.closest('[aria-hidden="true"]') && el.getClientRects().length > 0;
}

/** ¿El dedo empezó donde un deslizar es de la PÁGINA? No en una hoja, un
 *  modal, el encabezado ni una lista con scroll propio que no está arriba.
 *  🩸 27-nov-2026: la hoja «Tu cuenta» del avatar (y la de «···») viven
 *  SIEMPRE montadas con `aria-modal`, cerradas; contarlas como abiertas
 *  apagaba el gesto en todas las pantallas del celular. Solo cuenta la que se ve. */
export function empiezaEnLaPagina(target: EventTarget | null): boolean {
  const capas = document.querySelectorAll('[aria-modal="true"], [data-bottomsheet-scroll]');
  if (Array.from(capas).some(abiertoDeVerdad)) return false;
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

/** El indicador de actividad del iPhone: ocho rayitas. Al jalar aparecen una a
 *  una (`llenas` de 0 a 8); al actualizar giran a pasos, como el de iOS. */
function Ruedita({ llenas, girando }: { llenas: number; girando: boolean }) {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" className={girando ? "fg-ruedita-gira" : undefined}>
      {Array.from({ length: 8 }, (_, i) => (
        <rect
          key={i}
          x="12.75"
          y="2"
          width="2.5"
          height="7"
          rx="1.25"
          fill="#6b7280"
          opacity={girando ? 0.25 + (0.75 * (8 - i)) / 8 : i < llenas ? 0.85 : 0}
          transform={`rotate(${i * 45} 14 14)`}
        />
      ))}
    </svg>
  );
}

export default function DeslizarParaActualizar() {
  const [jalon, setJalon] = useState(0);
  const [corriendo, setCorriendo] = useState(false);
  const [saliendo, setSaliendo] = useState(false);
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
        // Vuelve suave: se encoge y se desvanece antes de irse.
        setSaliendo(true);
        setTimeout(() => setSaliendo(false), 260);
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

  if (!DESLIZAR_ACTUALIZA_CON_SWITCH || (jalon <= 4 && !corriendo && !saliendo)) return null;
  // Como en el iPhone: baja con el dedo (con resistencia), las rayitas se
  // completan al llegar al umbral, gira mientras actualiza y vuelve suave.
  const y = corriendo ? UMBRAL_PX : saliendo ? UMBRAL_PX * 0.6 : jalon;
  const llenas = Math.min(8, Math.floor((jalon / UMBRAL_PX) * 8));
  return (
    <div
      aria-hidden
      data-deslizar-indicador
      className="pointer-events-none fixed inset-x-0 mx-auto z-[11] flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white shadow-md"
      style={{
        top: "calc(var(--fg-altura-encabezado, 0px) + env(safe-area-inset-top))",
        transform: `translateY(${y - 34}px) scale(${saliendo ? 0.4 : 1})`,
        opacity: saliendo ? 0 : corriendo ? 1 : Math.min(1, jalon / (UMBRAL_PX * 0.6)),
        transition: corriendo || saliendo ? "transform 250ms ease-out, opacity 250ms ease-out" : "none",
      }}
    >
      <Ruedita llenas={corriendo || saliendo ? 8 : llenas} girando={corriendo} />
    </div>
  );
}

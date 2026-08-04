"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Visor de foto con ZOOM para el catálogo.
//
// 🩸 POR QUÉ. Daniel, desde el iPad: *"¿cómo hago para hacer zoom a la foto del
// catálogo? aparte de apretar la imagen, quiero zoom al apretarla"*. Dos cosas
// se lo impedían:
//
//   1. El visor viejo mostraba la foto con `object-contain` y nada más: se veía
//      del tamaño de la pantalla y no había forma de acercarla.
//   2. **Tocar la foto la CERRABA.** El `onClick` de cerrar vivía en el fondo y
//      la imagen no frenaba la propagación, así que el gesto natural —tocar lo
//      que querés ver— hacía justo lo contrario.
//
// ⚠️ Y EL PELLIZCO DEL NAVEGADOR NO ERA OPCIÓN: `layout.tsx` declara
// `maximumScale: 1`, que en iOS desactiva el zoom de la página entera. Está ahí
// a propósito (evita que iOS haga zoom solo al enfocar un input) y cambiarlo
// afectaría TODAS las pantallas de la app por un problema de una. Por eso el
// zoom se implementa acá adentro, con transform, y el resto no se toca.
//
// Gestos:
//   · un toque en la foto  → acerca/aleja, centrado en DONDE tocaste
//   · pellizcar             → zoom libre (1× a 5×)
//   · arrastrar con zoom    → mover la foto
//   · tocar el fondo o ×    → cerrar
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useBodyScrollLock } from "@/lib/hooks/useBodyScrollLock";

const ZOOM_MIN = 1;
const ZOOM_MAX = 5;
/** A cuánto lleva UN toque. 2,5× alcanza para leer una etiqueta sin perderse. */
const ZOOM_TOQUE = 2.5;

interface Props {
  src: string;
  alt: string;
  onClose: () => void;
}

export default function VisorFoto({ src, alt, onClose }: Props) {
  useBodyScrollLock(true);
  const [escala, setEscala] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const contRef = useRef<HTMLDivElement>(null);

  // Estado del gesto en curso. En refs y no en estado: cambian en cada
  // `touchmove` y meterlos en el render haría perder cuadros.
  const gesto = useRef({
    pinchInicio: 0,
    escalaInicio: 1,
    arrastrando: false,
    x0: 0,
    y0: 0,
    posX0: 0,
    posY0: 0,
    movio: false,
  });

  const cerrar = useCallback(() => {
    setEscala(1);
    setPos({ x: 0, y: 0 });
    onClose();
  }, [onClose]);

  // Escape cierra (escritorio).
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") cerrar(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [cerrar]);

  /** Acerca centrando en el punto tocado, para que no “salte” a otro lado. */
  function alternarZoom(clientX: number, clientY: number) {
    const caja = contRef.current?.getBoundingClientRect();
    if (escala > 1) {
      setEscala(1);
      setPos({ x: 0, y: 0 });
      return;
    }
    const nueva = ZOOM_TOQUE;
    if (caja) {
      // Distancia del toque al centro; al ampliar, se corre en sentido
      // contrario para que ese punto quede a la vista.
      const dx = clientX - (caja.left + caja.width / 2);
      const dy = clientY - (caja.top + caja.height / 2);
      setPos({ x: -dx * (nueva - 1), y: -dy * (nueva - 1) });
    }
    setEscala(nueva);
  }

  function onTouchStart(e: React.TouchEvent) {
    const g = gesto.current;
    g.movio = false;
    if (e.touches.length === 2) {
      const [a, b] = [e.touches[0], e.touches[1]];
      g.pinchInicio = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      g.escalaInicio = escala;
      g.arrastrando = false;
    } else if (e.touches.length === 1) {
      g.arrastrando = escala > 1;
      g.x0 = e.touches[0].clientX;
      g.y0 = e.touches[0].clientY;
      g.posX0 = pos.x;
      g.posY0 = pos.y;
    }
  }

  function onTouchMove(e: React.TouchEvent) {
    const g = gesto.current;
    if (e.touches.length === 2 && g.pinchInicio > 0) {
      const [a, b] = [e.touches[0], e.touches[1]];
      const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      const nueva = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, (d / g.pinchInicio) * g.escalaInicio));
      setEscala(nueva);
      g.movio = true;
      if (nueva === 1) setPos({ x: 0, y: 0 });
    } else if (e.touches.length === 1 && g.arrastrando) {
      const dx = e.touches[0].clientX - g.x0;
      const dy = e.touches[0].clientY - g.y0;
      // 6px de tolerancia: un toque nunca es perfectamente quieto, y sin esto
      // cada toque contaría como arrastre y el zoom por toque no funcionaría.
      if (Math.abs(dx) > 6 || Math.abs(dy) > 6) g.movio = true;
      setPos({ x: g.posX0 + dx, y: g.posY0 + dy });
    }
  }

  function onTouchEnd(e: React.TouchEvent) {
    const g = gesto.current;
    // Un toque limpio (sin arrastre ni pellizco) = alternar zoom.
    if (!g.movio && e.changedTouches.length === 1 && e.touches.length === 0) {
      const t = e.changedTouches[0];
      alternarZoom(t.clientX, t.clientY);
    }
    g.pinchInicio = 0;
    g.arrastrando = false;
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90"
      // Cerrar SOLO al tocar el fondo. El contenedor de la foto frena la
      // propagación: ese fue el bug original.
      onClick={cerrar}
    >
      <div
        ref={contRef}
        className="relative flex h-full w-full items-center justify-center overflow-hidden"
        style={{ touchAction: "none" }}
        onClick={(e) => e.stopPropagation()}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onDoubleClick={(e) => alternarZoom(e.clientX, e.clientY)}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          draggable={false}
          className="max-h-full max-w-full select-none object-contain"
          style={{
            transform: `translate(${pos.x}px, ${pos.y}px) scale(${escala})`,
            // Sin transición durante el gesto: se sentiría con retraso.
            transition: gesto.current.pinchInicio || gesto.current.arrastrando ? "none" : "transform 180ms ease-out",
            cursor: escala > 1 ? "grab" : "zoom-in",
          }}
        />
      </div>

      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); cerrar(); }}
        aria-label="Cerrar"
        className="absolute right-3 top-3 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-black/50 text-2xl leading-none text-white/80 transition active:scale-95 hover:text-white"
        style={{ top: "max(0.75rem, env(safe-area-inset-top))" }}
      >
        &times;
      </button>

      {/* Pista de uso, solo mientras está sin acercar. Se va al primer zoom
          para no tapar la foto. */}
      {escala === 1 && (
        <p className="pointer-events-none absolute inset-x-0 text-center text-xs text-white/60"
           style={{ bottom: "max(1.5rem, env(safe-area-inset-bottom))" }}>
          Toca la foto para acercar · pellizca para más
        </p>
      )}
    </div>,
    document.body,
  );
}

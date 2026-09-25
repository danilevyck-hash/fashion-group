"use client";

// ─────────────────────────────────────────────────────────────────────────────
// El que mira el deslizamiento y mueve la barra (24-sep-2026).
//
// La REGLA no vive acá: vive en `barra-celular.ts`, que es puro y se prueba
// solo. Acá está lo que no se puede probar sin un navegador —el oyente de
// `scroll`, las dos consultas de medio y la variable CSS— y nada más.
//
// 🔴 SOLO EN EL CELULAR. El oyente se prende con `(max-width: 639px)`, el
// mismo corte `sm` de Tailwind que usa todo el encabezado. Al pasar a la
// computadora la barra vuelve a la vista y la medida vuelve a su alto real:
// girar el teléfono o abrir el inspector no puede dejar el encabezado
// escondido para siempre.
//
// ⚠️ EL `scroll` VA CON `passive: true` y se agrupa en un `requestAnimationFrame`:
// esta pantalla está en las 22 páginas y un oyente que bloquee el
// desplazamiento se siente en todas.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState, type RefObject } from "react";
import { VAR_ALTURA_ENCABEZADO } from "@/lib/ui/barra-pegajosa";
import {
  BARRA_QUE_SE_ESCONDE,
  SIN_BARRA_ARRIBA,
  CONSULTA_CELULAR,
  CONSULTA_SIN_MOVIMIENTO,
  ESTADO_BARRA_INICIAL,
  alturaPublicada,
  siguienteEstadoBarra,
  type EstadoBarra,
} from "@/lib/navegacion/barra-celular";

export interface BarraCelular {
  /** `false` = escondida arriba. En la computadora es SIEMPRE `true`. */
  visible: boolean;
  /** El alto medido del encabezado, para correrlo justo lo que mide. */
  altura: number;
  /** El teléfono pidió «reducir movimiento»: se mueve sin animación. */
  sinMovimiento: boolean;
}

/** Un `matchMedia` que no explota donde no existe (pruebas, navegador viejo). */
function consultar(consulta: string): MediaQueryList | null {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return null;
  try {
    return window.matchMedia(consulta);
  } catch {
    return null;
  }
}

/** Escuchar una consulta de medio, con el `addListener` viejo de respaldo. */
function escuchar(mql: MediaQueryList, fn: () => void): () => void {
  if (typeof mql.addEventListener === "function") {
    mql.addEventListener("change", fn);
    return () => mql.removeEventListener("change", fn);
  }
  const viejo = mql as unknown as {
    addListener?: (f: () => void) => void;
    removeListener?: (f: () => void) => void;
  };
  viejo.addListener?.(fn);
  return () => viejo.removeListener?.(fn);
}

export function useBarraCelular(ref: RefObject<HTMLElement | null>): BarraCelular {
  const [visible, setVisible] = useState(true);
  const [altura, setAltura] = useState(0);
  const [sinMovimiento, setSinMovimiento] = useState(false);
  const estado = useRef<EstadoBarra>(ESTADO_BARRA_INICIAL);

  // ── «Reducir movimiento», de la propia pantalla ──
  useEffect(() => {
    const mql = consultar(CONSULTA_SIN_MOVIMIENTO);
    if (!mql) return;
    const leer = () => setSinMovimiento(mql.matches);
    leer();
    return escuchar(mql, leer);
  }, []);

  // ── El deslizamiento, solo hasta `sm` ──
  // 🔴 Con la franja de arriba retirada (`SIN_BARRA_ARRIBA`) no hay nada que
  // esconder en el celular: el oyente de `scroll` ni se prende. Apagar ese
  // interruptor devuelve la barra que se esconde, entera.
  useEffect(() => {
    if (SIN_BARRA_ARRIBA) return;
    if (!BARRA_QUE_SE_ESCONDE) return;
    if (typeof window === "undefined") return;

    const mql = consultar(CONSULTA_CELULAR);
    let soltar: (() => void) | null = null;
    let pedido = 0;

    const medir = () => {
      const el = ref.current;
      const alto = el ? Math.round(el.getBoundingClientRect().height) : 0;
      setAltura(alto);
      return alto;
    };

    const mirar = () => {
      pedido = 0;
      const siguiente = siguienteEstadoBarra(estado.current, window.scrollY, medir());
      if (siguiente === estado.current) return;
      estado.current = siguiente;
      setVisible(siguiente.visible);
    };

    const alDeslizar = () => {
      if (pedido) return;
      pedido = window.requestAnimationFrame(mirar);
    };

    const prender = () => {
      if (soltar) return;
      medir();
      window.addEventListener("scroll", alDeslizar, { passive: true });
      window.addEventListener("resize", alDeslizar, { passive: true });
      soltar = () => {
        window.removeEventListener("scroll", alDeslizar);
        window.removeEventListener("resize", alDeslizar);
      };
      mirar();
    };

    const apagar = () => {
      soltar?.();
      soltar = null;
      if (pedido) window.cancelAnimationFrame(pedido);
      pedido = 0;
      // En la computadora la barra está SIEMPRE: nada de heredar un
      // escondido que la persona ya no puede deshacer con el dedo.
      estado.current = ESTADO_BARRA_INICIAL;
      setVisible(true);
    };

    const decidir = () => {
      if (!mql || mql.matches) prender();
      else apagar();
    };

    decidir();
    const dejarDeEscuchar = mql ? escuchar(mql, decidir) : null;
    return () => {
      dejarDeEscuchar?.();
      apagar();
    };
  }, [ref]);

  // ── La medida que leen las barras pegajosas de contenido ──
  // 🔴 Con la barra escondida pasa a 0 y la barra de filtros de la pantalla
  // sube con ella. Se escribe DESPUÉS de `usePublicarAlturaEncabezado`, que es
  // quien la publica cuando el encabezado cambia de tamaño.
  useEffect(() => {
    if (SIN_BARRA_ARRIBA) return;
    if (!BARRA_QUE_SE_ESCONDE) return;
    if (typeof document === "undefined") return;
    const el = ref.current;
    const alto = el ? Math.round(el.getBoundingClientRect().height) : altura;
    document.documentElement.style.setProperty(
      VAR_ALTURA_ENCABEZADO,
      `${alturaPublicada(visible, alto)}px`,
    );
  }, [visible, altura, ref]);

  return { visible, altura, sinMovimiento };
}

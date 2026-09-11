"use client";

import { useEffect, type RefObject } from "react";
import { VAR_ALTURA_ENCABEZADO, ALTURA_ENCABEZADO_INICIAL } from "@/lib/ui/barra-pegajosa";

/**
 * Mide el encabezado pegajoso y publica su alto en `--fg-altura-encabezado`,
 * para que las barras de contenido se peguen DEBAJO de él (11-sep-2026).
 *
 * 🔑 Se MIDE, no se escribe. El encabezado no tiene un alto fijo: en el
 * escritorio lleva la tira del breadcrumb (≈70 px) y en el celular no (≈46 px),
 * y el acento de 2 px del módulo lo mueve otra vez. Un número escrito a mano
 * es lo que hace que la barra tape el logo en una pantalla y deje una franja
 * blanca en la otra — es exactamente lo que le pasaba al `top-14` de
 * `TimeGroupHeader`.
 *
 * Es el MISMO patrón que ya usa la barra del carrito del catálogo
 * (`CatalogoStickyCartBar`): un `ResizeObserver`, y sin él una sola medición.
 *
 * ⚠️ Se escribe en `document.documentElement` a propósito: la variable tiene
 * que llegar a cualquier barra de la página, esté donde esté en el árbol.
 */
export function usePublicarAlturaEncabezado(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const el = ref.current;
    const raiz = document.documentElement;
    if (!el) return;

    const publicar = () => {
      const alto = el.getBoundingClientRect().height;
      raiz.style.setProperty(VAR_ALTURA_ENCABEZADO, `${Math.round(alto)}px`);
    };

    publicar();

    // Sin ResizeObserver (navegador viejo) queda la medición de arriba: un
    // número real de una sola lectura es mejor que volver a un valor fijo.
    if (typeof ResizeObserver === "undefined") return;

    const ro = new ResizeObserver(publicar);
    ro.observe(el);
    return () => {
      ro.disconnect();
      // Al salir de una pantalla CON encabezado hacia una SIN él (el catálogo
      // público, la pantalla de login), la variable vuelve a 0: si se quedara
      // con el alto viejo, la barra de esa pantalla nacería corrida hacia
      // abajo por un encabezado que ya no está.
      raiz.style.setProperty(VAR_ALTURA_ENCABEZADO, ALTURA_ENCABEZADO_INICIAL);
    };
  }, [ref]);
}

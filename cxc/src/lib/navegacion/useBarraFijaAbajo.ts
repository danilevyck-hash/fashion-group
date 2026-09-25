"use client";

// ─────────────────────────────────────────────────────────────────────────────
// La barra fija de abajo dice cuánto mide, para que el botón flotante se le
// suba encima (24-sep-2026).
//
// 🩸 QUÉ VINO A ARREGLAR. Al sacar la franja de arriba, las tres rayas se
// mudaron a un botón redondo abajo a la derecha. Y justo ahí, en cinco
// portadas del celular, ya vivía un botón negro fijo de ANCHO COMPLETO
// —«Cobrar», «Nuevo reclamo», «Decidir las N», «Pedido»—. Uno tapaba al otro.
//
// 🔴 SUBE EL FLOTANTE, NO SE MUEVE EL BOTÓN NEGRO. El botón negro es la acción
// principal de su pantalla y está centrado a propósito; el flotante es el
// menú, que se usa mucho menos. Entonces la barra publica su alto MEDIDO en
// `--fg-alto-barra-fija` y el flotante se sienta encima con un `max()` de CSS.
//
// 🔑 SE MIDE, NO SE ESCRIBE. Las barras no miden lo mismo entre sí y la de
// Reclamos crece cuando dice cuántos hay seleccionados: un número a mano se
// desactualiza el día que alguien le agrega un renglón.
//
// 🔴 FALLA ABIERTA: una barra que se olvide de llamar a este gancho deja la
// variable en 0 y el flotante vuelve al piso —tapado, sí, pero nunca
// desaparecido—. Al desmontarse la barra, la variable vuelve a 0 sola: si se
// quedara con el alto viejo, el flotante de la pantalla siguiente nacería
// flotando en el aire.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, type RefObject } from "react";
import { VAR_ALTO_BARRA_FIJA } from "@/lib/navegacion/barra-celular";

/**
 * Mide la barra fija de abajo y publica su alto en `--fg-alto-barra-fija`.
 *
 * Mismo patrón que `usePublicarAlturaEncabezado`: un `ResizeObserver`, y sin
 * él una sola medición —un número real leído una vez es mejor que un valor
 * escrito a mano—.
 */
export function usePublicarAltoBarraFija(
  ref: RefObject<HTMLElement | null>,
  /**
   * ¿Está dibujada la barra? Por defecto sí —quien llama a este gancho suele
   * montarse solo cuando la barra existe—. Las que aparecen y desaparecen sin
   * desmontarse (el aviso de instalar la app) lo pasan, y así el alto se vuelve
   * a medir cuando reaparece en vez de quedarse en 0.
   */
  activo = true,
): void {
  useEffect(() => {
    const el = activo ? ref.current : null;
    if (!el || typeof document === "undefined") return;
    const raiz = document.documentElement;

    const publicar = () => {
      const alto = el.getBoundingClientRect().height;
      raiz.style.setProperty(VAR_ALTO_BARRA_FIJA, `${Math.round(alto)}px`);
    };

    publicar();

    if (typeof ResizeObserver === "undefined") {
      return () => raiz.style.setProperty(VAR_ALTO_BARRA_FIJA, "0px");
    }

    const ro = new ResizeObserver(publicar);
    ro.observe(el);
    return () => {
      ro.disconnect();
      raiz.style.setProperty(VAR_ALTO_BARRA_FIJA, "0px");
    };
  }, [ref, activo]);
}

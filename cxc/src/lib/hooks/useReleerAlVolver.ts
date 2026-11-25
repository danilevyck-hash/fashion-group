"use client";

import { useEffect, useRef } from "react";

/**
 * 🔴 LA LISTA SE VUELVE A LEER AL VOLVER A LA VENTANA (25-nov-2026, Daniel:
 * «me paso de una pestaña a otra y no se me actualiza. Tengo que refrescar
 * toda la página, y eso me pasa en todo el sistema»).
 *
 * Causa raíz: las listas que no usan SWR leen la BASE una sola vez, al montar.
 * Quien deja la ventana abierta (bodega con Despachos todo el día) y vuelve
 * desde otra pestaña del navegador u otro programa sigue viendo lo de la
 * mañana. Este gancho es el lugar ÚNICO: al volver (`visibilitychange` →
 * visible o `focus`) llama a `releer`, que debe leer EN SEGUNDO PLANO (sin
 * vaciar la lista, sin «Cargando…», sin tocar filtros ni scroll).
 *
 * ⚠️ `releer` solo lee la BASE de este sistema. NUNCA llama a Switch: entrar a
 * Despachos no llama a Switch (cxc/CLAUDE.md, 7-oct-2026).
 *
 * Interruptor: `RELEER_AL_VOLVER_2026_11`; `false` = cada lista como antes.
 */
export const RELEER_AL_VOLVER_2026_11 = true;

/** `focus` y `visibilitychange` llegan juntos: una sola lectura cada 10 s. */
export const RELEER_AL_VOLVER_MIN_MS = 10_000;

/** ¿Toca releer? Visible y pasado el freno desde la última vez. */
export function debeReleer(visible: boolean, ahora: number, ultima: number): boolean {
  return visible && ahora - ultima >= RELEER_AL_VOLVER_MIN_MS;
}

export function useReleerAlVolver(releer: () => void, activo = true): void {
  const ref = useRef(releer);
  ref.current = releer;
  useEffect(() => {
    if (!RELEER_AL_VOLVER_2026_11 || !activo) return;
    let ultima = Date.now();
    const alVolver = () => {
      const ahora = Date.now();
      if (!debeReleer(document.visibilityState === "visible", ahora, ultima)) return;
      ultima = ahora;
      ref.current();
    };
    document.addEventListener("visibilitychange", alVolver);
    window.addEventListener("focus", alVolver);
    return () => {
      document.removeEventListener("visibilitychange", alVolver);
      window.removeEventListener("focus", alVolver);
    };
  }, [activo]);
}

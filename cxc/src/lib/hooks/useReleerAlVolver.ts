"use client";

import { createContext, useContext, useEffect, useRef } from "react";

/**
 * 🔴 LA LISTA SE VUELVE A LEER AL VOLVER A LA VENTANA (25-nov-2026, Daniel:
 * «me paso de una pestaña a otra y no se me actualiza. Tengo que refrescar
 * toda la página, y eso me pasa en todo el sistema»).
 *
 * Causa raíz: las listas que no usan SWR leen la BASE una sola vez, al montar.
 * Quien deja la ventana abierta (bodega con Despachos todo el día) y vuelve
 * desde otra pestaña del navegador u otro programa sigue viendo lo de la
 * mañana. Y en los módulos que dejan sus pestañas MONTADAS y escondidas
 * (Asistencia), cambiar de pestaña tampoco volvía a leer.
 *
 * Este gancho es el lugar ÚNICO. Llama a `releer` —que debe leer EN SEGUNDO
 * PLANO: sin vaciar la lista, sin «Cargando…», sin tocar filtros ni scroll—:
 *   · al volver a la ventana (`visibilitychange` → visible, o `focus`);
 *   · cuando su pestaña escondida vuelve a verse (`PestanaVisible`).
 *
 * 🔴 NUNCA pisa lo que la persona está escribiendo: si el foco está en un
 * campo de texto o hay una ventana (modal) abierta, no relee (`hayAlgoAMedias`).
 * ⚠️ `releer` solo lee la BASE de este sistema. NUNCA llama a Switch: entrar a
 * Despachos no llama a Switch (cxc/CLAUDE.md, 7-oct-2026).
 *
 * Interruptor: `RELEER_AL_VOLVER_2026_11`; `false` = cada lista como antes.
 */
export const RELEER_AL_VOLVER_2026_11 = true;

/** `focus` y `visibilitychange` llegan juntos: una sola lectura cada 10 s. */
export const RELEER_AL_VOLVER_MIN_MS = 10_000;

/**
 * ¿Esta pestaña se ve? Lo dan los módulos que dejan sus pestañas montadas y
 * escondidas (Asistencia). Sin proveedor, `true`: la pantalla siempre se ve.
 */
export const PestanaVisible = createContext(true);

/** ¿Toca releer? Visible y pasado el freno desde la última vez. */
export function debeReleer(visible: boolean, ahora: number, ultima: number): boolean {
  return visible && ahora - ultima >= RELEER_AL_VOLVER_MIN_MS;
}

const NO_ES_TEXTO = new Set(["button", "submit", "reset", "checkbox", "radio", "range", "file", "hidden", "color"]);

/** ¿La persona está escribiendo o tiene una ventana abierta? Entonces no se relee. */
export function hayAlgoAMedias(doc: Document = document): boolean {
  const el = doc.activeElement as HTMLElement | null;
  if (el) {
    const tag = el.tagName;
    if (tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable) return true;
    if (tag === "INPUT" && !NO_ES_TEXTO.has((el as HTMLInputElement).type)) return true;
  }
  return !!doc.querySelector('[role="dialog"], [aria-modal="true"], dialog[open]');
}

export function useReleerAlVolver(releer: () => void, activo = true): void {
  const ref = useRef(releer);
  ref.current = releer;
  const pestanaVisible = useContext(PestanaVisible);
  const ultima = useRef(Date.now());
  const visibleRef = useRef(pestanaVisible);
  visibleRef.current = pestanaVisible;

  const intentar = useRef(() => {
    const ahora = Date.now();
    if (!debeReleer(document.visibilityState === "visible" && visibleRef.current, ahora, ultima.current)) return;
    if (hayAlgoAMedias()) return;
    ultima.current = ahora;
    ref.current();
  });

  // Al volver a la ventana.
  useEffect(() => {
    if (!RELEER_AL_VOLVER_2026_11 || !activo) return;
    const alVolver = () => intentar.current();
    document.addEventListener("visibilitychange", alVolver);
    window.addEventListener("focus", alVolver);
    return () => {
      document.removeEventListener("visibilitychange", alVolver);
      window.removeEventListener("focus", alVolver);
    };
  }, [activo]);

  // Cuando su pestaña escondida vuelve a verse (no al montar: ahí ya leyó).
  const antes = useRef(pestanaVisible);
  useEffect(() => {
    const eraEscondida = !antes.current;
    antes.current = pestanaVisible;
    if (RELEER_AL_VOLVER_2026_11 && activo && pestanaVisible && eraEscondida) intentar.current();
  }, [pestanaVisible, activo]);
}

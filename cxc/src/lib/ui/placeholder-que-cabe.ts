import { useEffect, useLayoutEffect, useState, type RefObject } from "react";
import { PLACEHOLDER_ENTERO } from "@/lib/ui/revision-110-ajustes";

/** En el servidor no hay qué medir (y `useLayoutEffect` avisa de más). */
const useEfectoAntesDePintar = typeof window === "undefined" ? useEffect : useLayoutEffect;

// ─────────────────────────────────────────────────────────────────────────────
// Revisión 110 · ajustes (1): el texto guía de un buscador NUNCA se corta a
// mitad de palabra. Si «Buscar colaborador» no cabe en el campo, el campo dice
// «Buscar» — nunca «Buscar colaborad».
// ─────────────────────────────────────────────────────────────────────────────

export const PLACEHOLDER_CORTO = "Buscar";

/** Lo que el campo muestra: el texto entero si cabe, si no «Buscar». Puro. */
export function placeholderQueCabe(texto: string, disponible: number, medir: (s: string) => number): string {
  if (!texto || !(disponible > 0)) return texto;
  return medir(texto) <= disponible ? texto : PLACEHOLDER_CORTO;
}

let lienzo: CanvasRenderingContext2D | null | undefined;

/**
 * El texto guía que cabe en `ref`. Se mide con la letra REAL del `::placeholder`
 * (14 px en los compactos) y el ancho real del campo, y se vuelve a medir si el
 * campo cambia de tamaño. Sin navegador (servidor, pruebas) devuelve el entero.
 */
export function usePlaceholderQueCabe(ref: RefObject<HTMLInputElement | null>, texto: string | undefined): string | undefined {
  const [visible, setVisible] = useState(texto);
  useEfectoAntesDePintar(() => {
    const el = ref.current;
    if (!PLACEHOLDER_ENTERO || !el || !texto || typeof ResizeObserver === "undefined" || typeof document === "undefined") {
      setVisible(texto);
      return;
    }
    const medirAhora = () => {
      if (lienzo === undefined) lienzo = document.createElement("canvas").getContext("2d");
      if (!lienzo) return setVisible(texto);
      const cs = getComputedStyle(el);
      let ph: CSSStyleDeclaration | null = null;
      try { ph = getComputedStyle(el, "::placeholder"); } catch { ph = null; }
      lienzo.font = `${ph?.fontWeight || cs.fontWeight} ${ph?.fontSize || cs.fontSize} ${cs.fontFamily}`;
      const disponible = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - 2;
      setVisible(placeholderQueCabe(texto, disponible, (s) => lienzo!.measureText(s).width));
    };
    medirAhora();
    const ro = new ResizeObserver(medirAhora);
    ro.observe(el);
    // La letra de Google llega después: al llegar se vuelve a medir.
    document.fonts?.ready.then(medirAhora).catch(() => {});
    return () => ro.disconnect();
  }, [ref, texto]);
  return visible;
}

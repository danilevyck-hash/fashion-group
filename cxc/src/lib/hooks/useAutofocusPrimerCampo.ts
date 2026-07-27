"use client";

// Enfocar el primer CAMPO de un panel que se acaba de abrir — y solo eso.
//
// 🩸 El bug que originó este archivo (jul-2026). El autofocus del Drawer vivía
// en un efecto que tenía `onClose` entre sus dependencias. Como los llamadores
// pasan `onClose` inline (`onClose={() => {...}}`), su identidad cambia en CADA
// render, así que el efecto se desmontaba y volvía a montarse en cada render —
// y con él su `setTimeout` de 50 ms.
//
// Consecuencia, tal como la reportó Daniel: "al poner clic en n cheques, me
// deja poner un dígito cada clic, esta raro". Tecleás → cambia el estado →
// re-render → el efecto vuelve a correr → 50 ms después alguien se roba el
// foco → la tecla siguiente no llega al campo. Un dígito por clic.
//
// Y era peor que molesto: el selector buscaba el primer elemento enfocable con
// `querySelector("input, select, textarea, button")`, y el PRIMERO del panel no
// es un campo sino el botón ✕ de la cabecera. O sea que el foco terminaba en
// "Cerrar": en iPhone eso además baja el teclado, y un Enter o un Espacio
// disparaban el cierre del formulario y borraban lo escrito.
//
// Las dos mitades del arreglo viven acá:
//   1. El efecto depende SOLO de `open`. La identidad de `onClose` no lo toca.
//   2. Se enfoca el primer CAMPO REAL (input/select/textarea), nunca un botón.
//
// Ojo al mantenerlo: agregar cualquier dependencia que cambie por render
// (`onClose`, un objeto literal, una función inline) reintroduce el bug exacto.
// El candado es `src/__tests__/components/foco-formularios.test.tsx`.

import { useEffect, type RefObject } from "react";

/** Campos que cuentan como "primer campo". Un `button` NO es un campo. */
const SELECTOR_CAMPOS = "input, select, textarea";

/** True si el elemento puede recibir el foco de verdad (visible y habilitado). */
function esEnfocable(el: HTMLElement): boolean {
  if (el.hasAttribute("disabled")) return false;
  if (el.getAttribute("aria-hidden") === "true") return false;
  if (el instanceof HTMLInputElement && el.type === "hidden") return false;
  if (el.tabIndex < 0) return false;
  return true;
}

/**
 * Primer campo enfocable dentro de `root`, en orden de documento.
 * Devuelve `null` si el panel no tiene ningún campo (ej. un panel de solo
 * lectura como el estado de cuenta) — ahí NO hay que enfocar nada, y sobre todo
 * no el botón de cerrar.
 */
export function primerCampoEnfocable(root: HTMLElement | null): HTMLElement | null {
  if (!root) return null;
  const campos = root.querySelectorAll<HTMLElement>(SELECTOR_CAMPOS);
  for (const campo of Array.from(campos)) {
    if (esEnfocable(campo)) return campo;
  }
  return null;
}

/**
 * Enfoca el primer campo del panel cuando `open` pasa a true.
 *
 * @param open      si el panel está abierto
 * @param panelRef  ref al contenedor del panel
 * @param retrasoMs espera antes de enfocar (deja terminar la animación de
 *                  entrada; enfocar durante un `transform` hace saltar el
 *                  scroll en iOS)
 */
export function useAutofocusPrimerCampo(
  open: boolean,
  panelRef: RefObject<HTMLElement>,
  retrasoMs: number = 50,
): void {
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      primerCampoEnfocable(panelRef.current)?.focus();
    }, retrasoMs);
    return () => clearTimeout(t);
    // ⚠️ SOLO `open`. `panelRef` y `retrasoMs` son estables por construcción, y
    // meter acá cualquier valor que cambie por render revive el bug del dígito
    // por clic. Ver el encabezado del archivo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
}

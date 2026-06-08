"use client";

import { useEffect } from "react";

// Lock global del scroll del body con CONTADOR DE REFERENCIAS.
//
// El problema que resuelve: varios modales/sheets apilados (p.ej. en Préstamos
// un BottomSheet con un ConfirmModal encima) cada uno bloqueaba el body por su
// cuenta y se pisaban el estado al cerrar → el scroll quedaba trabado. Con un
// contador global, SOLO el primero en abrir aplica el lock y SOLO el último en
// cerrar lo restaura; los intermedios solo suben/bajan el contador.
//
// Usa el patrón iOS robusto (position:fixed + restaurar scrollY) en vez de
// overflow:hidden: en iOS Safari overflow:hidden no congela el fondo (sigue el
// rubber-band detrás del backdrop).

let lockCount = 0;
let savedScrollY = 0;

function acquire(): void {
  if (typeof document === "undefined") return;
  if (lockCount === 0) {
    savedScrollY = window.scrollY;
    const body = document.body;
    body.style.position = "fixed";
    body.style.top = `-${savedScrollY}px`;
    body.style.left = "0";
    body.style.right = "0";
    body.style.width = "100%";
    body.style.overflow = "hidden";
  }
  lockCount += 1;
}

function release(): void {
  if (typeof document === "undefined") return;
  if (lockCount === 0) return;
  lockCount -= 1;
  if (lockCount === 0) {
    const body = document.body;
    body.style.position = "";
    body.style.top = "";
    body.style.left = "";
    body.style.right = "";
    body.style.width = "";
    body.style.overflow = "";
    window.scrollTo(0, savedScrollY);
  }
}

/**
 * Bloquea el scroll del body mientras `locked` sea true. Seguro para modales
 * apilados gracias al contador de referencias compartido.
 *
 * Para componentes que solo se montan cuando están abiertos (p.ej. ModalOverlay),
 * pasar `true`: el lock se toma al montar y se suelta al desmontar.
 */
export function useBodyScrollLock(locked: boolean): void {
  useEffect(() => {
    if (!locked) return;
    acquire();
    return release;
  }, [locked]);
}

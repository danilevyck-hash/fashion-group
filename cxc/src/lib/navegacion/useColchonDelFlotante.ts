"use client";

// ─────────────────────────────────────────────────────────────────────────────
// El colchón de abajo, para que la última fila no quede bajo el botón redondo
// (24-sep-2026).
//
// 🔴 EL BOTÓN FLOTA ENCIMA DE LA LISTA: no le quita ancho a la página, se le
// pone arriba en la esquina. Lo único que hace falta es que la lista termine
// 76 px antes (56 del botón + 16 del margen + 4 de aire), o el último renglón
// —el que más se toca en una lista larga— nace debajo del botón.
//
// 🔑 SE PONE EN EL `body`, NO EN CADA PANTALLA. Son 21 módulos; una clase que
// se prende y se apaga con el botón es un solo lugar. Y se quita al salir: una
// pantalla sin botón (el catálogo público, el login) no arrastra el colchón.
//
// ⚠️ LO QUE CUESTA, DICHO: en una pantalla más corta que el teléfono esos
// 76 px hacen que la página se pueda deslizar un poquito. Es el precio de que
// la última fila se pueda tocar, y en el teléfono no se ve ninguna barra de
// desplazamiento.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect } from "react";

/** La clase que enciende el colchón. Su cuerpo vive en `globals.css`. */
export const CLASE_COLCHON_FLOTANTE = "fg-con-flotante";

/** Prende el colchón mientras el botón flotante esté en la pantalla. */
export function useColchonDelFlotante(hayFlotante: boolean): void {
  useEffect(() => {
    if (!hayFlotante || typeof document === "undefined") return;
    const cuerpo = document.body;
    cuerpo.classList.add(CLASE_COLCHON_FLOTANTE);
    return () => cuerpo.classList.remove(CLASE_COLCHON_FLOTANTE);
  }, [hayFlotante]);
}

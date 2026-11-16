"use client";

// ─────────────────────────────────────────────────────────────────────────────
// ABRIR SUMA UNA ENTRADA AL HISTORIAL; VOLVER LA CIERRA (16-nov-2026).
//
// El patrón que Caja menuda ya usaba, en un solo lugar:
//   · al abrir, `pushState` (misma dirección, con la marca de quien abrió);
//   · el gesto de volver (`popstate`) cierra;
//   · «Cerrar» / «‹ …» llama a lo que devuelve el gancho, que hace
//     `history.back()` —y si se toca dos veces seguidas, vuelve UNA sola vez—.
//
// 🔑 Si se cierra por otro camino (guardar, elegir, navegar a otra pantalla)
// o el componente se desmonta con la entrada todavía arriba, NO se llama a
// `history.back()`: chocaría con una navegación en curso (`router.push` +
// cerrar en el mismo toque, como el menú ☰). La entrada se marca «muerta» y,
// si alguien vuelve a caer en ella, se salta sola.
// ponytail: sentado encima de una entrada muerta (cerrada sin volver y sin
// navegar), el siguiente gesto de volver no mueve nada una vez. Si molesta,
// usar el `volver` del gancho en ese botón.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useId, useRef } from "react";
import { ATRAS_CIERRA_2026_11 } from "@/lib/ui/atras-cierra-2026-11";

const CLAVE = "fgAtrasCierra";
const MUERTA = "fgAtrasMuerta";

function estado(): Record<string, unknown> | null {
  try {
    const s = window.history.state as unknown;
    return s && typeof s === "object" ? (s as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

let saltoInstalado = false;
function instalarSalto() {
  if (saltoInstalado || typeof window === "undefined") return;
  saltoInstalado = true;
  window.addEventListener("popstate", () => {
    if (estado()?.[MUERTA]) window.history.back();
  });
}

/**
 * @param abierto  si lo que se abre está abierto.
 * @param cerrar   cómo se cierra (el `set…(null)` de siempre).
 * @param activo   apagado = no toca el historial (el comportamiento de antes).
 * @returns `volver(despues?)`: para «Cerrar» / «Cancelar» / «‹ …». Con la
 *          entrada arriba hace `history.back()` y, ya cerrado, corre `despues`.
 */
export function useAtrasCierra(
  abierto: boolean,
  cerrar: () => void,
  activo: boolean = ATRAS_CIERRA_2026_11,
): (despues?: () => void) => void {
  const id = useId();
  const cerrarRef = useRef(cerrar);
  cerrarRef.current = cerrar;
  const saliendo = useRef(false);
  const despuesRef = useRef<(() => void) | undefined>(undefined);
  const encima = useCallback(() => estado()?.[CLAVE] === id, [id]);

  useEffect(() => {
    if (!activo || !abierto) return;
    instalarSalto();
    saliendo.current = false;
    if (!encima()) window.history.pushState({ [CLAVE]: id }, "");
    const alVolver = () => {
      if (encima()) return; // se cerró algo de más arriba: esto sigue abierto
      const despues = despuesRef.current;
      despuesRef.current = undefined;
      saliendo.current = false;
      cerrarRef.current();
      despues?.();
    };
    window.addEventListener("popstate", alVolver);
    return () => {
      window.removeEventListener("popstate", alVolver);
      // Cerrado sin volver, o desmontado: la entrada queda, marcada muerta.
      if (encima()) {
        const { [CLAVE]: _quien, ...resto } = estado() ?? {};
        void _quien;
        window.history.replaceState({ ...resto, [MUERTA]: true }, "");
      }
    };
  }, [abierto, activo, id, encima]);

  return useCallback(
    (despues?: () => void) => {
      if (activo && encima()) {
        if (saliendo.current) return; // doble toque: una sola vuelta
        saliendo.current = true;
        despuesRef.current = despues;
        window.history.back();
        return;
      }
      cerrarRef.current();
      despues?.();
    },
    [activo, encima],
  );
}

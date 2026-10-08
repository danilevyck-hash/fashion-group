"use client";

import { createContext, useContext, useEffect, type ReactNode } from "react";
import { CLAVE_SESION_DEL_NAVEGADOR, otraSesionEnElNavegador } from "@/lib/sesion-entre-pestanas";
import type { SemillaSesion } from "@/lib/sesion-semilla";

/**
 * El contexto por el que la semilla de sesión baja del layout raíz (servidor)
 * a `useAuth` (19-sep-2026). Sin proveedor —los tests, o una página fuera del
 * layout— vale `null`, y el gancho se comporta como siempre: espera al efecto.
 * Detalle en `lib/sesion-semilla.ts`.
 */
const SemillaSesionContext = createContext<SemillaSesion | null>(null);

export function SemillaSesionProvider({ semilla, children }: { semilla: SemillaSesion | null; children: ReactNode }) {
  // Si en otra pestaña entró otra persona, esta pestaña deja de actuar en su
  // nombre: vuelve a «/», que retoma la sesión real (sesion-entre-pestanas.ts).
  // Al volver a la pestaña también se mira, por si el aviso llegó con ella dormida.
  useEffect(() => {
    const revisar = () => {
      try {
        const delNavegador = localStorage.getItem(CLAVE_SESION_DEL_NAVEGADOR);
        if (otraSesionEnElNavegador(delNavegador, sessionStorage.getItem("fg_user_name"))) window.location.replace("/");
      } catch { /* sin almacenamiento: como antes */ }
    };
    const alCambiar = (e: StorageEvent) => { if (e.key === CLAVE_SESION_DEL_NAVEGADOR) revisar(); };
    const alVolver = () => { if (document.visibilityState === "visible") revisar(); };
    window.addEventListener("storage", alCambiar);
    document.addEventListener("visibilitychange", alVolver);
    return () => {
      window.removeEventListener("storage", alCambiar);
      document.removeEventListener("visibilitychange", alVolver);
    };
  }, []);
  return <SemillaSesionContext.Provider value={semilla}>{children}</SemillaSesionContext.Provider>;
}

export function useSemillaSesion(): SemillaSesion | null {
  return useContext(SemillaSesionContext);
}

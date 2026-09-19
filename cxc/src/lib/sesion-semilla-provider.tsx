"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { SemillaSesion } from "@/lib/sesion-semilla";

/**
 * El contexto por el que la semilla de sesión baja del layout raíz (servidor)
 * a `useAuth` (19-sep-2026). Sin proveedor —los tests, o una página fuera del
 * layout— vale `null`, y el gancho se comporta como siempre: espera al efecto.
 * Detalle en `lib/sesion-semilla.ts`.
 */
const SemillaSesionContext = createContext<SemillaSesion | null>(null);

export function SemillaSesionProvider({ semilla, children }: { semilla: SemillaSesion | null; children: ReactNode }) {
  return <SemillaSesionContext.Provider value={semilla}>{children}</SemillaSesionContext.Provider>;
}

export function useSemillaSesion(): SemillaSesion | null {
  return useContext(SemillaSesionContext);
}

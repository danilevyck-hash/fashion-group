"use client";

// ============================================================================
// ¿Se está mirando Marketing desde un celular? (24-sep-2026)
//
// 🔑 SE MONTA UN SOLO ÁRBOL. Con las dos vistas dibujadas a la vez —una
// escondida con `hidden sm:block`— cada nombre de tienda saldría DOS veces en
// el documento y cada `FotosSection` pediría sus fotos dos veces. Por eso el
// aparato se pregunta en un efecto, arranca en `false` (computadora) y la
// pantalla se redibuja si la ventana cambia de tamaño.
//
// ⚠️ Arrancar en `false` es a propósito: en el servidor no hay `matchMedia`, y
// pintar la computadora un tick de más es mejor que pintar el celular y
// cambiarlo.
// ============================================================================

import { useEffect, useState } from "react";
import { HASTA_SM, MARKETING_CELULAR, esPantallaDeCelular } from "@/lib/marketing/celular";

export function useEsCelular(): boolean {
  const [celular, setCelular] = useState(false);
  useEffect(() => {
    if (!MARKETING_CELULAR) return;
    setCelular(esPantallaDeCelular());
    if (typeof window === "undefined") return;
    let mq: MediaQueryList | null = null;
    try {
      mq = window.matchMedia?.(HASTA_SM) ?? null;
    } catch {
      mq = null;
    }
    if (!mq?.addEventListener) return;
    const alCambiar = (e: MediaQueryListEvent) => setCelular(e.matches);
    mq.addEventListener("change", alCambiar);
    return () => mq?.removeEventListener("change", alCambiar);
  }, []);
  return MARKETING_CELULAR && celular;
}

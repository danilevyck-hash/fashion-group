"use client";

// ============================================================================
// ¿Se está mirando Ventas desde un celular? (25-sep-2026)
//
// 🔑 SE MONTA UN SOLO ÁRBOL. Con las dos vistas dibujadas a la vez —una
// escondida con `hidden sm:block`— cada nombre de empresa y cada nombre de
// cliente saldría DOS veces en el documento, y los candados que cuentan
// nombres (`iphone-ancho-nombres`, `iphone-targets-ventas-clientes`)
// empezarían a ver el doble. Es el mismo patrón de Marketing y de Asistencia:
// se pregunta en un efecto, se arranca en `false` y se vuelve a pintar si la
// ventana cambia de tamaño.
//
// ⚠️ Arrancar en `false` es a propósito: en el servidor no hay `matchMedia`, y
// pintar la computadora un instante de más es mejor que pintar el celular y
// cambiarlo.
// ============================================================================

import { useEffect, useState } from "react";
import { HASTA_SM_VENTAS, VENTAS_CELULAR, esPantallaDeCelularVentas } from "@/lib/ventas/celular";

export function useEsCelularVentas(): boolean {
  const [celular, setCelular] = useState(false);
  useEffect(() => {
    if (!VENTAS_CELULAR) return;
    setCelular(esPantallaDeCelularVentas());
    if (typeof window === "undefined") return;
    let mq: MediaQueryList | null = null;
    try {
      mq = window.matchMedia?.(HASTA_SM_VENTAS) ?? null;
    } catch {
      mq = null;
    }
    if (!mq?.addEventListener) return;
    const alCambiar = (e: MediaQueryListEvent) => setCelular(e.matches);
    mq.addEventListener("change", alCambiar);
    return () => mq?.removeEventListener("change", alCambiar);
  }, []);
  return VENTAS_CELULAR && celular;
}

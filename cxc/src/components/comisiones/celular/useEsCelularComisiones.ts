"use client";

// ============================================================================
// ¿Se está mirando Comisiones desde un celular? (25-sep-2026)
//
// 🔑 SE MONTA UN SOLO ÁRBOL. Con las dos vistas dibujadas a la vez —una con
// `hidden lg:block`— cada nombre de vendedor saldría DOS veces en el documento
// y el candado del encabezado (`iphone-comisiones-encabezado`) empezaría a ver
// el doble. Es el mismo patrón de Marketing, Asistencia y Ventas.
//
// ⚠️ Arranca en `false` a propósito: en el servidor no hay `matchMedia`, y
// pintar la computadora un instante de más es mejor que lo contrario.
// ============================================================================

import { useEffect, useState } from "react";
import {
  COMISIONES_CELULAR,
  HASTA_SM_COMISIONES,
  esPantallaDeCelularComisiones,
} from "@/lib/comisiones/celular";

export function useEsCelularComisiones(): boolean {
  const [celular, setCelular] = useState(false);
  useEffect(() => {
    if (!COMISIONES_CELULAR) return;
    setCelular(esPantallaDeCelularComisiones());
    if (typeof window === "undefined") return;
    let mq: MediaQueryList | null = null;
    try {
      mq = window.matchMedia?.(HASTA_SM_COMISIONES) ?? null;
    } catch {
      mq = null;
    }
    if (!mq?.addEventListener) return;
    const alCambiar = (e: MediaQueryListEvent) => setCelular(e.matches);
    mq.addEventListener("change", alCambiar);
    return () => mq?.removeEventListener("change", alCambiar);
  }, []);
  return COMISIONES_CELULAR && celular;
}

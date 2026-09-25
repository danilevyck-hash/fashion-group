"use client";

// ─────────────────────────────────────────────────────────────────────────────
// ¿Se está mirando Referencia desde un celular? (25-sep-2026)
//
// 🔑 SE MONTA UN SOLO ÁRBOL, NUNCA DOS ESCONDIDOS CON CSS. Con la tabla del
// modo pedido y sus tarjetas dibujadas a la vez —una con `hidden sm:block`—
// cada código saldría DOS veces en el documento y los candados que buscan una
// fila por su texto encontrarían la tarjeta. Es el mismo gancho de Ventas
// (`useEsCelularVentas`), con el MISMO corte `sm`.
//
// ⚠️ Arranca en `false` a propósito: en el servidor no hay `matchMedia`, y
// pintar la computadora un instante de más es mejor que pintar el celular y
// tener que cambiarlo.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import { HASTA_SM_VENTAS } from "@/lib/ventas/celular";
import { REFERENCIA_2026_09 } from "@/lib/ventas/referencia-pantalla";

export function useEsCelularReferencia(): boolean {
  const [celular, setCelular] = useState(false);
  useEffect(() => {
    if (!REFERENCIA_2026_09 || typeof window === "undefined") return;
    let mq: MediaQueryList | null = null;
    try {
      mq = window.matchMedia?.(HASTA_SM_VENTAS) ?? null;
    } catch {
      mq = null;
    }
    if (!mq) return;
    setCelular(mq.matches);
    if (!mq.addEventListener) return;
    const alCambiar = (e: MediaQueryListEvent) => setCelular(e.matches);
    mq.addEventListener("change", alCambiar);
    return () => mq?.removeEventListener("change", alCambiar);
  }, []);
  return REFERENCIA_2026_09 && celular;
}

"use client";

// El número rojo del ícono (solo bodega): al abrir la app y cada vez que
// vuelve a primer plano. Ver `lib/globito.ts`.

import { useEffect } from "react";
import { actualizarGlobito } from "@/lib/globito";
import { MANTENER_PRESIONADO_2026_11 } from "@/lib/ui/mantener-presionado-2026-11";

function esBodegaOQuizas(): boolean {
  try {
    const r = window.sessionStorage.getItem("cxc_role");
    return !r || r === "bodega";
  } catch {
    return true;
  }
}

export default function GlobitoPedidos() {
  useEffect(() => {
    if (!MANTENER_PRESIONADO_2026_11 || !("setAppBadge" in navigator)) return;
    const alVolver = () => {
      if (document.visibilityState === "visible" && esBodegaOQuizas() && !location.pathname.startsWith("/login")) void actualizarGlobito();
    };
    alVolver();
    document.addEventListener("visibilitychange", alVolver);
    return () => document.removeEventListener("visibilitychange", alVolver);
  }, []);
  return null;
}

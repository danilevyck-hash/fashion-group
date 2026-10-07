"use client";

// La lista de «Despachado por» es DEL EQUIPO (`guias_despachadores`, Guías ›
// Configuración). La leen el formulario de la guía (interruptor apagado) y el
// DESPACHO de bodega, donde se elige desde el 1-oct-2026. Falla ABIERTA: sin
// red o sin tabla, los de siempre (`DESPACHADORES_BASE`).

import { useEffect, useState } from "react";
import { DESPACHADORES_BASE, listaParaElDesplegable } from "@/lib/guias/despachadores";

export function useDespachadores(activo = true): string[] {
  const [nombres, setNombres] = useState<string[]>([...DESPACHADORES_BASE]);
  useEffect(() => {
    if (!activo) return;
    let cancel = false;
    fetch("/api/guias/despachadores", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancel) return;
        const lista = Array.isArray(d?.nombres) ? (d.nombres as string[]) : [];
        if (lista.length > 0) setNombres(listaParaElDesplegable(lista));
      })
      .catch(() => { /* el desplegable se queda con la lista de siempre */ });
    return () => { cancel = true; };
  }, [activo]);
  return nombres;
}

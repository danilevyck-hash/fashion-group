"use client";

// ─────────────────────────────────────────────────────────────────────────────
// LAS ETIQUETAS PENDIENTES DE LA GUÍA QUE SE ESTÁ ARMANDO — UNA SOLA LECTURA
// (18-sep-2026).
//
// 🔴 POR QUÉ SUBIÓ ACÁ. En la Fase 1 la lista la pedía `EtiquetasPendientes`
// para sí mismo. Con el anti-doble captura la MISMA lista la necesita también
// «Facturas del cliente» —para bloquear la factura que ya tiene etiqueta—, y
// dos lecturas de lo mismo son dos verdades que se pueden separar: basta con
// que una llegue y la otra no para que un panel bloquee y el otro no.
// Una lectura, un dueño (`GuiaForm`), los dos paneles mirando lo mismo.
//
// 🔴 FALLA ABIERTA: sin la migración corrida o sin red, la lista queda vacía,
// no se bloquea nada, la sección de etiquetas no se dibuja y la guía se arma
// exactamente como siempre.
//
// ⚠️ Solo las PENDIENTES: una etiqueta que ya salió en una guía no entra a otra
// ni bloquea nada (de eso habla el aviso «Ya salió en GT-XXX», que avisa y no
// frena).
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import { estaImportada, type EtiquetaFila } from "@/lib/guias/etiquetas";

export function useEtiquetasVivas(activo: boolean): EtiquetaFila[] {
  const [etiquetas, setEtiquetas] = useState<EtiquetaFila[]>([]);

  useEffect(() => {
    if (!activo) return;
    let cancelado = false;
    fetch("/api/guias/etiquetas", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { etiquetas?: EtiquetaFila[] } | null) => {
        if (cancelado || !d || !Array.isArray(d.etiquetas)) return;
        setEtiquetas(d.etiquetas.filter((e) => !estaImportada(e)));
      })
      .catch(() => {
        /* sin lista: nada se bloquea y la guía se arma a mano como siempre */
      });
    return () => {
      cancelado = true;
    };
  }, [activo]);

  return etiquetas;
}

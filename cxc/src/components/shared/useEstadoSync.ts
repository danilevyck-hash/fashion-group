"use client";

import { useEffect, useState } from "react";

export type SyncTable = "facturas" | "estadocuenta" | "recibos" | "proveedores" | "articulo_info";

interface StaleEntry {
  empresa: string;
  last_synced_at: string | null;
}

export interface SyncStatusData {
  last_global: string | null;
  stale: StaleEntry[];
}

// ─────────────────────────────────────────────────────────────────────────────
// 🩸 LA MISMA PANTALLA MONTA ESTE COMPONENTE DOS VECES (12-ago-2026).
//
// Ventas dibuja `ResumenView` (escritorio) y `ResumenViewMobile` (celular) al
// mismo tiempo y esconde una con CSS — pero escondida con `hidden md:block`
// igual se MONTA, así que las dos piden `/api/sync-status` con la MISMA URL, en
// el mismo instante. Medido contra el build de producción: `/api/sync-status`
// ×2 por visita a /ventas, 733 ms sumados. Le pasa lo mismo al CXC
// (`cxc/page.tsx` + `PanelCxcMobile`).
//
// Se comparte la petición EN VUELO por URL: dos montajes en el mismo tick
// esperan la MISMA respuesta. **No hay TTL ni caché de resultado** a propósito —
// con una ventana de tiempo, el refresco tras "Actualizar ahora" (que dispara un
// `focus` inmediatamente después del sync) devolvería lo viejo, que es
// justamente el momento en que este banner tiene que decir la verdad. Apenas la
// respuesta llega, la entrada se borra y el próximo `focus` vuelve a preguntar.
// ─────────────────────────────────────────────────────────────────────────────
const enVuelo = new Map<string, Promise<SyncStatusData>>();

function pedirEstado(url: string): Promise<SyncStatusData> {
  const yaVa = enVuelo.get(url);
  if (yaVa) return yaVa;
  const p = Promise.resolve()
    .then(() => fetch(url, { cache: "no-store" }))
    .then((r) => (r.ok ? (r.json() as Promise<SyncStatusData>) : Promise.reject(r)))
    .finally(() => { enVuelo.delete(url); });
  enVuelo.set(url, p);
  return p;
}

/**
 * La frescura del sync, con el MISMO fetch, foco y sondeo de `<SyncStatus>`.
 * La usa también la línea de frescura (`LineaDeFrescura`, 4-oct-2026).
 */
export function useEstadoSync(tabla: SyncTable, empresasEsperadas: readonly string[]) {
  const [data, setData] = useState<SyncStatusData | null>(null);
  const [error, setError] = useState(false);
  const empresasKey = empresasEsperadas.join(",");

  useEffect(() => {
    let cancelled = false;
    const url = `/api/sync-status?tabla=${tabla}&empresas=${empresasKey}`;

    // Mismo fetch de siempre, extraído para poder re-disparar. No cambia el
    // endpoint ni la lógica de stale — solo permite re-consultar.
    const fetchStatus = () => {
      pedirEstado(url)
        .then((json: SyncStatusData) => {
          if (cancelled) return;
          setData(json);
          setError(false);
        })
        .catch(() => {
          if (cancelled) return;
          setError(true);
        });
    };

    fetchStatus(); // inicial al montar

    // (a) Re-fetch cuando la pestaña vuelve a tener foco — cubre el caso
    //     "disparé un sync y volví a la pestaña": el banner se actualiza solo.
    const onVisible = () => {
      if (document.visibilityState === "visible") fetchStatus();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", fetchStatus);

    // (b) Polling cada 5 min, solo mientras la pestaña está visible (no gasta
    //     requests en background).
    const POLL_MS = 5 * 60 * 1000;
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") fetchStatus();
    }, POLL_MS);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", fetchStatus);
      clearInterval(interval);
    };
  }, [tabla, empresasKey]);

  return { data, error };
}


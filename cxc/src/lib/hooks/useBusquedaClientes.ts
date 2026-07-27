"use client";

// Búsqueda de clientes contra el directorio (clientes_master vía /api/clientes),
// con debounce de 250 ms y cancelación. Extraído para que el selector CERRADO de
// guías y el typeahead libre de Marketing hagan exactamente la misma consulta.

import { useEffect, useState } from "react";

export interface ClienteHit {
  codigo: string;
  nombre: string;
}

/**
 * @param query    lo que el usuario está escribiendo
 * @param activa   false = no buscar (dropdown cerrado). Evita pedir por pedir.
 */
export function useBusquedaClientes(query: string, activa: boolean) {
  const [hits, setHits] = useState<ClienteHit[]>([]);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (!activa || q.length < 2) {
      setHits([]);
      setCargando(false);
      return;
    }
    let cancel = false;
    setCargando(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/clientes?q=${encodeURIComponent(q)}&limit=8`, { cache: "no-store" });
        if (!res.ok) throw new Error();
        const data = (await res.json()) as { clientes?: ClienteHit[] };
        if (!cancel) setHits(Array.isArray(data.clientes) ? data.clientes : []);
      } catch {
        if (!cancel) setHits([]);
      } finally {
        if (!cancel) setCargando(false);
      }
    }, 250);
    return () => {
      cancel = true;
      clearTimeout(t);
    };
  }, [query, activa]);

  return { hits, cargando };
}

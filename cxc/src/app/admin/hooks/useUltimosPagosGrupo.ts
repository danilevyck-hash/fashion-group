"use client";

import { useEffect, useState } from "react";
import type { PagoReciente } from "@/lib/cxc/ultimos-pagos";
import type { EstadoPagos } from "@/components/cxc/UltimosPagos";

/** Lo que devolvió `/api/cxc/ultimos-pagos`: pagos por empresa del grupo. */
type Respuesta = Record<string, PagoReciente[]>;

/**
 * Últimos pagos de un cliente del CXC DEL GRUPO, por empresa.
 *
 * Se pide SOLO cuando `activo` es verdadero (la fila expandida): en escritorio
 * el panel de todos los clientes está montado aunque esté cerrado, y disparar
 * 211 lecturas al cargar la lista sería regalar viajes a la base por nada.
 * Una vez leído, se queda para ese código: cerrar y volver a abrir no vuelve
 * a pedir.
 *
 * ⚠️ Esta ruta es la del GRUPO. La cartera de Boston tiene la suya
 * (`useUltimosPagosBoston`) y no comparten consulta.
 */
export function useUltimosPagosGrupo(codigo: string | null, activo: boolean) {
  const [estado, setEstado] = useState<Respuesta | null | "error">(null);
  const [leido, setLeido] = useState<string | null>(null);

  useEffect(() => {
    if (!activo || !codigo || leido === codigo) return;
    let vivo = true;
    setEstado(null);
    fetch(`/api/cxc/ultimos-pagos?codigo=${encodeURIComponent(codigo)}`, { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(String(r.status));
        const body = (await r.json()) as { porEmpresa?: Respuesta };
        if (vivo) { setEstado(body.porEmpresa ?? {}); setLeido(codigo); }
      })
      .catch(() => { if (vivo) setEstado("error"); });
    return () => { vivo = false; };
  }, [activo, codigo, leido]);

  /** Pagos de UNA empresa: `null` cargando, `"error"`, o la lista (vacía si no hay). */
  const de = (empresaKey: string): EstadoPagos => {
    if (estado === null) return null;
    if (estado === "error") return "error";
    return estado[empresaKey] ?? [];
  };
  return { de };
}

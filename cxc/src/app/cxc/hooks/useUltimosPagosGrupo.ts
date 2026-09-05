"use client";

import { useEffect, useState } from "react";
import type { PagoDelDia } from "@/lib/cxc/pagos-por-fecha";

/** Lo que devuelve `/api/cxc/ultimos-pagos` para el CXC del grupo. */
interface Respuesta {
  porFecha: PagoDelDia[];
}

/**
 * Los últimos pagos de un cliente del CXC DEL GRUPO, agrupados POR FECHA.
 *
 * Se pide SOLO cuando `activo` es verdadero (el panel abierto): en escritorio
 * el panel de los 100 clientes está montado aunque esté cerrado, y disparar
 * 100 lecturas al cargar la lista sería regalar viajes a la base por nada.
 * Una vez leído, se queda para ese código: cerrar y volver a abrir no vuelve
 * a pedir.
 *
 * ⚠️ Esta ruta es la del GRUPO. La cartera de Boston tiene la suya
 * (`useUltimosPagosBoston`) y no comparten consulta.
 */
export function useUltimosPagosGrupo(codigo: string | null, activo: boolean) {
  const [estado, setEstado] = useState<PagoDelDia[] | null | "error">(null);
  const [leido, setLeido] = useState<string | null>(null);

  useEffect(() => {
    if (!activo || !codigo || leido === codigo) return;
    let vivo = true;
    setEstado(null);
    fetch(`/api/cxc/ultimos-pagos?codigo=${encodeURIComponent(codigo)}`, { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(String(r.status));
        const body = (await r.json()) as Partial<Respuesta>;
        if (vivo) { setEstado(body.porFecha ?? []); setLeido(codigo); }
      })
      .catch(() => { if (vivo) setEstado("error"); });
    return () => { vivo = false; };
  }, [activo, codigo, leido]);

  return estado;
}

"use client";

import { useEffect, useState } from "react";
import type { PagoReciente } from "@/lib/cxc/ultimos-pagos";
import type { EstadoPagos } from "@/components/cxc/UltimosPagos";

/**
 * Últimos pagos de UN cliente de la cartera de CONFECCIONES BOSTON.
 *
 * Pide a `/api/cxc/boston/ultimos-pagos` por `cliente_switch_id` — la ruta
 * APARTE, con su propio filtro de empresa. No reutiliza el hook del grupo
 * (`useUltimosPagosGrupo`) ni su ruta: son dos carteras y dos lecturas.
 *
 * Se monta recién cuando el usuario abre el bloque en la pestaña, así que no
 * necesita bandera de `activo`: existir ya es estar activo.
 */
export function useUltimosPagosBoston(clienteSwitchId: number | null): EstadoPagos {
  const [estado, setEstado] = useState<EstadoPagos>(null);

  useEffect(() => {
    if (clienteSwitchId == null) { setEstado("error"); return; }
    let vivo = true;
    setEstado(null);
    fetch(`/api/cxc/boston/ultimos-pagos?cliente=${encodeURIComponent(String(clienteSwitchId))}`, { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(String(r.status));
        const body = (await r.json()) as { pagos?: PagoReciente[] };
        if (vivo) setEstado(body.pagos ?? []);
      })
      .catch(() => { if (vivo) setEstado("error"); });
    return () => { vivo = false; };
  }, [clienteSwitchId]);

  return estado;
}

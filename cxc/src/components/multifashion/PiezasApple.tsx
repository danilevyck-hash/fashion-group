"use client";

// Las piezas de `MULTIFASHION_APPLE_2026_10` (ver `lib/multifashion/apple.ts`):
// lo que requiere atención, ARRIBA y en <Aviso> (sin nada que avisar no se
// dibuja nada), y el número grande de cada pestaña.

import type { ReactNode } from "react";
import useSWR from "swr";
import { Aviso } from "@/components/ui/Aviso";
import { atencionesMultifashion, metaQueNoLlega } from "@/lib/multifashion/apple";
import type { MetaConAvance } from "@/lib/multifashion/metas-lectura";

/** La MISMA clave y la MISMA respuesta que `MetasSubtab`: SWR la pide una vez. */
export function useMetaQueNoLlega(habilitado: boolean): MetaConAvance | null {
  const { data } = useSWR<{ metas: MetaConAvance[] }>(
    habilitado ? "multifashion-metas" : null,
    async () => {
      const r = await fetch("/api/multifashion/metas", { cache: "no-store" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    },
    { revalidateOnFocus: false, dedupingInterval: 60_000, keepPreviousData: true },
  );
  return metaQueNoLlega(data?.metas);
}

export function AtencionMultifashion({
  tiendaAbrio = null,
  meta = null,
  onVerMeta,
  className = "",
}: {
  tiendaAbrio?: string | null;
  meta?: MetaConAvance | null;
  /** «Ver meta» lleva a la tarjeta; sin esto, el aviso va sin acción. */
  onVerMeta?: () => void;
  className?: string;
}) {
  const items = atencionesMultifashion({ tiendaAbrio, meta });
  if (items.length === 0) return null;
  return (
    <div data-elemento="atencion" className={`space-y-2 ${className}`}>
      {items.map((a) => (
        <Aviso
          key={a.clave}
          tono="aviso"
          accion={a.clave === "meta" && onVerMeta ? { texto: "Ver meta", onClick: onVerMeta } : null}
        >
          {a.texto}
        </Aviso>
      ))}
    </div>
  );
}

/**
 * EL número de la pestaña (regla 1): grande y sin negrita (v3.3). En el
 * celular, centrado como el del mes; en la computadora, a la izquierda.
 */
export function NumeroGrande({ monto, linea = null, testId }: { monto: string; linea?: ReactNode; testId?: string }) {
  return (
    <div data-elemento="numero-grande" data-testid={testId} className="text-center sm:text-left">
      <p className="text-[52px] font-light leading-none tracking-tight tabular-nums text-gray-950 sm:text-4xl sm:font-normal">
        {monto}
      </p>
      {linea && <p className="mt-2 text-sm text-gray-600 tabular-nums">{linea}</p>}
    </div>
  );
}

"use client";

import { SWRConfig } from "swr";

/**
 * Caché de datos entre navegaciones (SWR · Fase 0).
 *
 * Provider global, CONSERVADOR e INERTE: no cambia el comportamiento de ningún
 * módulo hasta que un hook llame `useSWR`. Hoy solo CXC lo usa (piloto Fase 1);
 * el resto sigue con su fetch-on-mount intacto.
 *
 * Config global:
 *   - revalidateOnFocus: false  → no spamear refetch al volver a la pestaña en
 *     módulos pesados (cada módulo puede activarlo por-hook si le conviene; CXC
 *     lo activa).
 *   - keepPreviousData: true    → al revalidar, mantener el dato anterior en
 *     pantalla (cero flash blanco al volver a un módulo).
 *
 * La caché vive en memoria a nivel de la app (Map por defecto de SWR) y persiste
 * entre navegaciones del SPA — eso es lo que elimina el re-fetch desde cero al
 * volver a un módulo. La durabilidad offline sigue en offlineCache.ts (Modo
 * viaje), que SWR usa como capa de siembra/persistencia por-módulo.
 */
export default function SWRProvider({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig
      value={{
        revalidateOnFocus: false,
        keepPreviousData: true,
      }}
    >
      {children}
    </SWRConfig>
  );
}

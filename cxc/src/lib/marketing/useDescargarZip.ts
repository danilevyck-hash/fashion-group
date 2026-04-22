"use client";

// Hook compartido para el flujo de descarga ZIP de un proyecto de Marketing.
// Mantiene el estado por id de proyecto para poder renderear varios botones
// independientes en la misma vista (lista de cards). Maneja:
//   - Lock anti-doble-clic.
//   - Etapa actual (tomada del callback de generarZipProyecto).
//   - Estado "éxito" persistido 2 segundos antes de volver a idle.
//   - Toast de error con la razón.

import { useCallback, useRef, useState } from "react";
import { useToast } from "@/components/ToastSystem";
import type { EtapaZip } from "@/lib/marketing/generar-zip";

export type EstadoDescargaZip =
  | { tipo: "trabajando"; etapa: EtapaZip }
  | { tipo: "exito" };

const SUCCESS_HOLD_MS = 2000;

export function useDescargarZip() {
  const { toast } = useToast();
  const [estados, setEstados] = useState<Record<string, EstadoDescargaZip>>({});
  const lockRef = useRef<Set<string>>(new Set());

  const setEstado = (id: string, e: EstadoDescargaZip | null) => {
    setEstados((prev) => {
      const next = { ...prev };
      if (e === null) delete next[id];
      else next[id] = e;
      return next;
    });
  };

  const descargar = useCallback(
    async (id: string) => {
      if (lockRef.current.has(id)) return;
      lockRef.current.add(id);
      setEstado(id, { tipo: "trabajando", etapa: "Descargando facturas..." });
      try {
        const res = await fetch(
          `/api/marketing/proyectos/${id}/datos-zip`,
          { cache: "no-store" },
        );
        if (!res.ok) {
          const err = await res.json().catch(() => null);
          throw new Error(err?.error ?? "No se pudo preparar el ZIP");
        }
        const data = await res.json();
        const { generarZipProyecto } = await import(
          "@/lib/marketing/generar-zip"
        );
        await generarZipProyecto(data, {
          onEtapa: (etapa) => setEstado(id, { tipo: "trabajando", etapa }),
        });
        setEstado(id, { tipo: "exito" });
        setTimeout(() => setEstado(id, null), SUCCESS_HOLD_MS);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Error desconocido";
        toast(`No se pudo generar el ZIP: ${msg}`, "error");
        setEstado(id, null);
      } finally {
        lockRef.current.delete(id);
      }
    },
    [toast],
  );

  return { estados, descargar };
}

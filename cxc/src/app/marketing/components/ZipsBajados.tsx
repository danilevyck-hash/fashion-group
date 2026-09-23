"use client";

// ============================================================================
// «LO QUE YA SE MANDÓ» — la bitácora de ZIPs de un período (22-sep-2026).
//
// 🩸 Desde la pieza (D) cada ZIP que se baja queda anotado en
// `mk_periodos.zips_bajados` y el archivo se guarda en el bucket privado…
// y NINGUNA pantalla lo mostraba. Esta es esa pantalla.
//
// 🔴 SIN ZIPS ANOTADOS NO SE DIBUJA NADA (`hayZipsQueMostrar`). Medido el
// 22-sep-2026: los SEIS períodos tienen la lista vacía, así que hoy esto no
// aparece en ninguna pantalla — aparece con el primer ZIP que alguien baje.
//
// 🔴 EL LINK DURA 30 DÍAS. «Volver a firmar» NO vuelve a armar el ZIP (tarda y
// baja todas las fotos): firma de nuevo el archivo que ya está guardado
// (`POST /api/marketing/zip/firmar-de-nuevo`).
//
// Solo LEE: ni un `update` sale de acá.
// ============================================================================

import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/ToastSystem";
import {
  DIAS_DEL_LINK,
  cuandoSeBajo,
  hayZipsQueMostrar,
  loQueLlevaba,
  quienLoBajo,
  sePuedeVolverAFirmar,
  zipsDelPeriodo,
} from "@/lib/marketing/zips-del-periodo";
import type { RegistroZip } from "@/lib/marketing/periodo-estado";

interface Props {
  /** El período. Sin id (un bucket sin período) no hay nada que listar. */
  periodoId: string | null;
}

export default function ZipsBajados({ periodoId }: Props) {
  const { toast } = useToast();
  const [zips, setZips] = useState<RegistroZip[]>([]);
  const [firmando, setFirmando] = useState<string | null>(null);

  useEffect(() => {
    if (!periodoId) {
      setZips([]);
      return;
    }
    let cancelado = false;
    void (async () => {
      try {
        const res = await fetch(`/api/marketing/periodos/${periodoId}`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json()) as { zips?: unknown };
        if (!cancelado) setZips(zipsDelPeriodo(data?.zips));
      } catch {
        // Falla ABIERTA: sin la bitácora, la pantalla es la de antes.
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [periodoId]);

  const volverAFirmar = useCallback(
    async (path: string) => {
      setFirmando(path);
      try {
        const res = await fetch("/api/marketing/zip/firmar-de-nuevo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paths: [path] }),
        });
        const data = (await res.json().catch(() => null)) as {
          links?: Array<{ url?: string }>;
          error?: string;
        } | null;
        if (!res.ok || !data?.links?.[0]?.url) {
          throw new Error(data?.error ?? "No se pudo volver a firmar el archivo.");
        }
        window.open(data.links[0].url as string, "_blank", "noopener,noreferrer");
        toast(`Link nuevo, sirve ${DIAS_DEL_LINK} días.`, "success");
      } catch (err) {
        toast(err instanceof Error ? err.message : "No se pudo volver a firmar", "error");
      } finally {
        setFirmando(null);
      }
    },
    [toast],
  );

  // 🔴 Nada que decir, nada que dibujar.
  if (!periodoId || !hayZipsQueMostrar(zips)) return null;

  return (
    <section
      className="rounded-lg border border-gray-200 bg-white p-4"
      data-testid="zips-bajados"
    >
      <h2 className="text-sm font-semibold text-gray-900 mb-2">Lo que ya se mandó</h2>
      <ul className="divide-y divide-gray-100">
        {zips.map((z, i) => {
          const quien = quienLoBajo(z);
          return (
            <li
              key={`${z.bajado_en}-${z.archivo_path}-${i}`}
              className="py-2 flex flex-wrap items-center gap-x-3 gap-y-1"
            >
              <span className="text-sm text-gray-900">{cuandoSeBajo(z)}</span>
              {quien && <span className="text-sm text-gray-500">{quien}</span>}
              <span className="text-sm text-gray-500 tabular-nums">{loQueLlevaba(z)}</span>
              {sePuedeVolverAFirmar(z) && (
                <button
                  type="button"
                  onClick={() => void volverAFirmar(z.archivo_path)}
                  disabled={firmando === z.archivo_path}
                  className="ml-auto text-sm text-teal-700 hover:text-teal-900 underline min-h-[44px] -my-2 inline-flex items-center disabled:opacity-50"
                >
                  {firmando === z.archivo_path ? "Firmando…" : "Volver a firmar"}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

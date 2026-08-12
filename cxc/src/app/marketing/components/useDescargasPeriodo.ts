"use client";

// ============================================================================
// Las DOS descargas de un período — el Excel (reporte) y el ZIP de la marca.
//
// 🔴 FUENTE ÚNICA (12-ago-2026). Las usan el inicio (tarjetas por marca) y la
// página de la marca (una sección por período). Antes vivían solo en
// `InicioMarketing`; al ganar la página de la marca sus propios botones
// [ZIP] [Excel] por sección, copiar las funciones habría sido tener dos
// maneras de armar el mismo archivo.
//
// 🔴 LOS ZIP SE BAJAN DE A UNO Y A PROPÓSITO. Nada de disparar varias
// descargas seguidas: Safari en iPhone bloquea la segunda y la tercera, así
// que un "bajar todos" se vería como que el sistema perdió archivos. Los
// botones QUEDAN en pantalla para siempre — un período cerrado se puede
// volver a bajar las veces que haga falta.
// ============================================================================

import { useCallback, useState } from "react";
import { saveAs } from "file-saver";
import { useToast } from "@/components/ToastSystem";

/** Nombre de archivo seguro a partir del título del período. */
function nombreArchivo(etiqueta: string, ext: string): string {
  const limpio = etiqueta
    .replace(/[^\p{L}\p{N} .-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  return `${limpio || "Reporte"}.${ext}`;
}

export function useDescargasPeriodo() {
  const { toast } = useToast();
  const [bajando, setBajando] = useState<string | null>(null);

  // El reporte de un período cerrado. Se baja por fetch y no por un enlace
  // directo: si el servidor contesta un error, un <a> navegaría fuera de la
  // app y le mostraría a la secretaria un JSON en pantalla.
  //
  // `marca` acota el período conjunto legacy ('pvh' junta TH+CK+KL): el chip
  // de Calvin · mid 2026 baja SOLO lo de Calvin. Sin marca (el cierre normal,
  // que ya es por marca) el reporte sale entero.
  const descargarReporte = useCallback(
    async (periodoId: string, etiqueta: string, marca?: string) => {
      try {
        const qs = marca ? `?marca=${encodeURIComponent(marca)}` : "";
        const res = await fetch(
          `/api/marketing/periodos/${periodoId}/reporte${qs}`,
          { cache: "no-store" },
        );
        if (!res.ok) {
          toast("No se pudo bajar el reporte. Intenta de nuevo en unos segundos.", "error");
          return;
        }
        const blob = await res.blob();
        const cd = res.headers.get("Content-Disposition") ?? "";
        const m = /filename\*?=(?:UTF-8'')?"?([^"';]+)"?/i.exec(cd);
        saveAs(blob, m?.[1] ? decodeURIComponent(m[1]) : nombreArchivo(etiqueta, "xlsx"));
        toast("Reporte listo — revisa tu carpeta de descargas.", "success");
      } catch {
        toast("No se pudo bajar el reporte. Verifica tu conexión.", "error");
      }
    },
    [toast],
  );

  /**
   * El ZIP de UNA marca. Sin `periodoId` baja lo que hay abierto hoy, que es
   * el pedido de Daniel: *"si me llegan a pedir que lo quieren por marca? o
   * algun dia me piden solo reporte de una marca?"*.
   */
  const bajarZipMarca = useCallback(
    async (marcaCodigo: string, etiqueta: string, periodoId?: string | null) => {
      const clave = `${marcaCodigo}:${periodoId ?? "abierto"}`;
      setBajando(clave);
      try {
        const res = await fetch("/api/marketing/zip-marca", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            periodoId ? { marcaCodigo, periodoId } : { marcaCodigo },
          ),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => null);
          toast(
            err?.error ?? "No se pudo armar el ZIP. Intenta de nuevo en unos segundos.",
            "error",
          );
          return;
        }
        const blob = await res.blob();
        const cd = res.headers.get("Content-Disposition") ?? "";
        const m = /filename\*?=(?:UTF-8'')?"?([^"';]+)"?/i.exec(cd);
        saveAs(blob, m?.[1] ? decodeURIComponent(m[1]) : nombreArchivo(etiqueta, "zip"));
        toast("ZIP listo — revisa tu carpeta de descargas.", "success");
      } catch {
        toast("No se pudo armar el ZIP. Verifica tu conexión.", "error");
      } finally {
        setBajando(null);
      }
    },
    [toast],
  );

  return { bajando, descargarReporte, bajarZipMarca };
}

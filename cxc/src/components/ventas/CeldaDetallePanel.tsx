"use client";

// Panel lateral del detalle de una celda del heatmap de Ventas.
//
// Reemplaza a los tooltips flotantes que se abrían ENCIMA de la tabla y tapaban
// justo las celdas vecinas que uno quería comparar. Ahora el detalle vive a un
// costado y la tabla queda visible y limpia.
//
// Layout: en desktop/iPad es un panel a la derecha, a lo alto de la pantalla; en
// celular baja como sheet desde abajo (más alcanzable con el pulgar). Se cierra
// con clic fuera, con la X o con Escape.
//
// Patrón de la casa para overlays: createPortal + useBodyScrollLock + fade-in,
// sin autoFocus (iOS abre el teclado y salta el layout).

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useBodyScrollLock } from "@/lib/hooks/useBodyScrollLock";
import { useEscapeClose, useBackdropDismiss } from "@/lib/hooks/useModalDismiss";
import { cn } from "@/lib/utils";
import type { FilaMetrica } from "@/lib/ventas/celda";

/** Contenido del panel: las 3 métricas de una celda, o un bloque libre. */
export type CeldaDetalle =
  | {
      kind: "metricas";
      titulo: string;
      subtitulo: string;
      /** Encabezados de las columnas comparadas. Ej: "Jul 2025" / "Jul 2026". */
      prevPeriod: string;
      curPeriod: string;
      filas: FilaMetrica[];
    }
  | {
      kind: "bloque";
      titulo: string;
      subtitulo: string;
      contenido: ReactNode;
    };

export function CeldaDetallePanel({
  detalle,
  onClose,
}: {
  detalle: CeldaDetalle | null;
  onClose: () => void;
}) {
  const open = detalle !== null;
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);
  useBodyScrollLock(open);
  // Hooks de la casa (#277): Escape + clic fuera del cuadro. El backdrop exige
  // que mousedown Y click hayan caído en él, así un arrastre que empieza dentro
  // del panel no lo cierra.
  useEscapeClose(open, onClose);
  const backdrop = useBackdropDismiss(onClose);

  if (!mounted || !detalle) return null;

  return createPortal(
    <div
      // El fondo va en ESTE div (no en un hijo): useBackdropDismiss exige que el
      // clic haya caído sobre el elemento que lleva los handlers.
      className="fixed inset-0 z-50 flex items-end bg-black/40 sm:items-stretch sm:justify-end animate-[fadeIn_150ms_ease-out]"
      role="dialog"
      aria-modal="true"
      aria-label={`${detalle.titulo} · ${detalle.subtitulo}`}
      {...backdrop}
    >
      <div
        className={cn(
          "relative flex w-full flex-col border-gray-200 bg-white",
          // Celular: sheet desde abajo, con respeto al home indicator.
          "max-h-[85vh] rounded-t-2xl border-t pb-[env(safe-area-inset-bottom)]",
          // iPad / desktop: panel lateral derecho a lo alto.
          "sm:h-full sm:max-h-none sm:w-[380px] sm:rounded-none sm:border-l sm:border-t-0 sm:pb-0",
        )}
      >
        <div className="flex items-start justify-between gap-3 border-b border-gray-200 px-4 py-3.5">
          <div className="min-w-0">
            <p className="truncate font-display text-sm font-semibold text-gray-950">{detalle.titulo}</p>
            <p className="mt-0.5 text-xs text-gray-500">{detalle.subtitulo}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="-mr-1 -mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 active:scale-[0.97]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {detalle.kind === "metricas" ? (
            <TablaMetricas
              filas={detalle.filas}
              prevPeriod={detalle.prevPeriod}
              curPeriod={detalle.curPeriod}
            />
          ) : (
            detalle.contenido
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function TablaMetricas({
  filas, prevPeriod, curPeriod,
}: {
  filas: FilaMetrica[];
  prevPeriod: string;
  curPeriod: string;
}) {
  return (
    <div className="space-y-2.5">
      <div className="grid grid-cols-[auto_1fr_1fr] items-baseline gap-x-3 border-b border-gray-200 pb-2">
        <span className="text-xs font-medium uppercase tracking-wide text-gray-500">Métrica</span>
        <span className="text-right text-xs font-medium uppercase tracking-wide text-gray-500">{prevPeriod}</span>
        <span className="text-right text-xs font-medium uppercase tracking-wide text-gray-700">{curPeriod}</span>
      </div>

      {filas.map((f) => (
        <div
          key={f.mode}
          className={cn(
            "grid grid-cols-[auto_1fr_1fr] items-baseline gap-x-3 rounded-md px-2 py-2",
            f.destacado ? "bg-gray-50" : "",
          )}
        >
          <span className={cn("text-xs", f.destacado ? "font-medium text-gray-950" : "text-gray-500")}>
            {f.label}
          </span>
          <span className="text-right font-mono text-xs tabular-nums text-gray-500">{f.prev}</span>
          <span className="flex flex-col items-end">
            <span className="font-mono text-sm tabular-nums text-gray-950">{f.cur}</span>
            <span
              className={cn(
                "mt-0.5 font-mono text-xs tabular-nums",
                f.tone === "emerald" ? "text-emerald-700" : f.tone === "orange" ? "text-red-600" : "text-gray-500",
              )}
            >
              {f.delta}
            </span>
          </span>
        </div>
      ))}

      <p className="border-t border-gray-200 pt-2.5 text-xs text-gray-500">
        Δ compara contra el mismo período del año anterior. El margen se compara en puntos.
      </p>
    </div>
  );
}

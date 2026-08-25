"use client";

import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import type { Cliente } from "./types";
import { fmtMoney } from "@/lib/ventas/format";
import { formatDeltaRatio, type DeltaTone } from "@/lib/ventas/formatDelta";
import { cn } from "@/lib/utils";

type SortKey = "nombre" | "id" | "empresa" | "ytd" | "delta" | "ultima";
type SortDir = "asc" | "desc";

const TONE_LIGHT: Record<DeltaTone, string> = {
  emerald: "text-emerald-600",
  orange:  "text-red-600",
  stone:   "text-gray-500",
};

interface OtrosClientesDialogProps {
  open: boolean;
  onClose: () => void;
  orphans: Cliente[];
  /** Cuando true (modo "Todas") se muestra la columna Empresa.
   *  Cuando false (filtro empresa específica) se omite. */
  showEmpresaColumn: boolean;
  /** 🔴 Año REAL contra el que compara la columna de cambio. Lo calcula el
   *  servidor junto con el delta y lo baja `ClientesView`. Antes acá decía
   *  "Δ vs 2025" escrito a mano, o sea el mismo defecto que en la tabla de
   *  atrás: con 2025 elegido comparaba contra 2024 y el rótulo decía 2025. */
  anioComparativo: number;
}

export function OtrosClientesDialog({
  open, onClose, orphans, showEmpresaColumn, anioComparativo,
}: OtrosClientesDialogProps) {
  const [sortBy, setSortBy] = useState<SortKey>("ytd");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Cierre con tecla Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const sorted = useMemo(() => {
    const arr = orphans.slice();
    const sign = sortDir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      switch (sortBy) {
        case "nombre":  return a.nombre.localeCompare(b.nombre) * sign;
        case "id":      return a.id.localeCompare(b.id) * sign;
        case "empresa": return a.empresa.localeCompare(b.empresa) * sign;
        case "ytd":     return (a.ytd - b.ytd) * sign;
        case "delta":   return (a.delta - b.delta) * sign;
        case "ultima":  return a.ultimaIso.localeCompare(b.ultimaIso) * sign;
      }
    });
    return arr;
  }, [orphans, sortBy, sortDir]);

  const onSort = (col: SortKey) => {
    if (sortBy === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortBy(col); setSortDir(col === "nombre" || col === "empresa" || col === "id" ? "asc" : "desc"); }
  };

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="otros-clientes-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/40 p-4"
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3.5">
          <div>
            <h2 id="otros-clientes-title" className="font-display text-base font-semibold text-gray-950">
              Otros clientes
            </h2>
            <p className="mt-0.5 text-xs text-gray-500">
              {orphans.length} {orphans.length === 1 ? "cliente sin código maestro" : "clientes sin código maestro"}
              <span className="mx-1.5 text-gray-300">·</span>
              <span data-comparativo-otros>el cambio compara contra el mismo período de {anioComparativo}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="rounded-md p-1 text-gray-500 transition hover:bg-gray-100 hover:text-gray-950"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tabla */}
        <div className="flex-1 overflow-auto">
          <table className="w-full border-collapse">
            <thead className="sticky top-0 z-10">
              <tr className="bg-gray-100">
                <SortHeader col="nombre" align="left"  sortBy={sortBy} sortDir={sortDir} onClick={onSort}>Nombre</SortHeader>
                <SortHeader col="id"     align="left"  sortBy={sortBy} sortDir={sortDir} onClick={onSort}>Código</SortHeader>
                {showEmpresaColumn && (
                  <SortHeader col="empresa" align="left" sortBy={sortBy} sortDir={sortDir} onClick={onSort}>Empresa</SortHeader>
                )}
                <SortHeader col="ytd"    align="right" sortBy={sortBy} sortDir={sortDir} onClick={onSort}>Compras del año</SortHeader>
                <SortHeader col="delta"  align="right" sortBy={sortBy} sortDir={sortDir} onClick={onSort}>vs {anioComparativo}</SortHeader>
                <SortHeader col="ultima" align="right" sortBy={sortBy} sortDir={sortDir} onClick={onSort}>Última compra</SortHeader>
              </tr>
            </thead>
            <tbody>
              {sorted.map(c => {
                const fmt = formatDeltaRatio(c.delta);
                return (
                  <tr key={`${c.empresaKey}-${c.id}-${c.nombre}`} className="border-b border-gray-100">
                    <td className="px-3 py-2.5 text-sm text-gray-950">{c.nombre}</td>
                    <td className="px-3 py-2.5 font-mono text-xs text-gray-500">{c.id || "—"}</td>
                    {showEmpresaColumn && (
                      <td className="px-3 py-2.5 text-xs text-gray-700">{c.empresa}</td>
                    )}
                    <td className="whitespace-nowrap px-3 py-2.5 text-right font-mono text-sm text-gray-950 tabular-nums">
                      {fmtMoney(c.ytd)}
                    </td>
                    <td className={cn(
                      "whitespace-nowrap px-3 py-2.5 text-right font-mono text-xs tabular-nums",
                      TONE_LIGHT[fmt.tone]
                    )}>
                      {fmt.arrow && <span className="mr-1">{fmt.arrow}</span>}
                      {fmt.displayValue}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right font-mono text-xs text-gray-500 tabular-nums">
                      {c.ultima || "—"}
                    </td>
                  </tr>
                );
              })}
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={showEmpresaColumn ? 6 : 5} className="px-3 py-12 text-center text-sm text-gray-500">
                    No hay clientes huérfanos en el filtro actual.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function SortHeader({
  col, align, children, sortBy, sortDir, onClick,
}: {
  col: SortKey; align: "left" | "right"; children: React.ReactNode;
  sortBy: SortKey; sortDir: SortDir; onClick: (c: SortKey) => void;
}) {
  const active = sortBy === col;
  return (
    <th
      onClick={() => onClick(col)}
      className={cn(
        "cursor-pointer select-none whitespace-nowrap border-b border-gray-200 bg-gray-100 px-3 py-2.5 text-xs font-medium uppercase tracking-wide transition",
        align === "right" ? "text-right" : "text-left",
        active ? "text-gray-950" : "text-gray-500 hover:text-gray-700"
      )}
    >
      <span className="inline-flex items-center gap-1">
        {children}
        <span className={cn("text-xs", active ? "opacity-100" : "opacity-35")}>
          {active ? (sortDir === "asc" ? "↑" : "↓") : "↕"}
        </span>
      </span>
    </th>
  );
}

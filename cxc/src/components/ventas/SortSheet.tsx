"use client";

import { useEffect, useState } from "react";
import { useBodyScrollLock } from "@/lib/hooks/useBodyScrollLock";

/**
 * Sheet mobile para picker de ordenamiento. Reemplaza los headers
 * clickeables de la tabla cuando la vista pasa a cards verticales
 * (md-). Mismo patrón de bottom-sheet que ClienteSheet: slide-up,
 * backdrop tap o Escape cierran, sin drag.
 */

export type SortSheetKey = "ultima" | "ytd" | "delta" | "nombre" | "empresa";
export type SortSheetDir = "asc" | "desc";

const OPTIONS: { key: SortSheetKey; label: string }[] = [
  { key: "ultima",  label: "Última compra" },
  { key: "ytd",     label: "Compras del año" },
  { key: "delta",   label: "Cambio vs el año anterior" },
  { key: "nombre",  label: "Cliente (nombre)" },
  { key: "empresa", label: "Empresa" },
];

interface SortSheetProps {
  open: boolean;
  onClose: () => void;
  sortBy: SortSheetKey;
  sortDir: SortSheetDir;
  onChange: (key: SortSheetKey, dir: SortSheetDir) => void;
}

export function SortSheet({ open, onClose, sortBy, sortDir, onChange }: SortSheetProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (open) requestAnimationFrame(() => setVisible(true));
    else setVisible(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // Lock body scroll mientras el sheet está abierto (hook compartido, ref-count).
  useBodyScrollLock(open);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Ordenar lista">
      <div
        className={`absolute inset-0 bg-black/40 transition-opacity duration-300 ${visible ? "opacity-100" : "opacity-0"}`}
        onClick={onClose}
      />
      <div
        className="absolute inset-x-0 bottom-0 flex flex-col rounded-t-2xl bg-white shadow-xl transition-transform duration-300 ease-out"
        style={{ transform: visible ? "translateY(0)" : "translateY(100%)" }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="flex w-full justify-center pt-3 pb-2"
        >
          <div className="h-1 w-10 rounded-full bg-gray-300" />
        </button>

        <div className="px-5 pb-6 pt-1">
          <h2 className="font-display text-base font-medium text-gray-950">Ordenar por</h2>

          <div className="mt-3 divide-y divide-gray-100">
            {OPTIONS.map(opt => {
              const active = sortBy === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => {
                    onChange(opt.key, sortDir);
                    onClose();
                  }}
                  className="flex w-full items-center justify-between py-3.5 text-left text-sm text-gray-950"
                >
                  <span>{opt.label}</span>
                  <span
                    aria-hidden
                    className={`flex h-5 w-5 items-center justify-center rounded-full border ${active ? "border-teal-700" : "border-gray-300"}`}
                  >
                    {active && <span className="h-2.5 w-2.5 rounded-full bg-teal-700" />}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-4">
            <div className="text-xs font-medium uppercase tracking-wide text-gray-500">
              Dirección
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => { onChange(sortBy, "desc"); onClose(); }}
                className={`rounded-md py-3 text-sm font-medium transition ${
                  sortDir === "desc"
                    ? "bg-teal-700 text-white"
                    : "bg-gray-100 text-gray-700"
                }`}
              >
                Descendente
              </button>
              <button
                type="button"
                onClick={() => { onChange(sortBy, "asc"); onClose(); }}
                className={`rounded-md py-3 text-sm font-medium transition ${
                  sortDir === "asc"
                    ? "bg-teal-700 text-white"
                    : "bg-gray-100 text-gray-700"
                }`}
              >
                Ascendente
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

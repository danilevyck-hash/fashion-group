"use client";

import type { ConsolidatedClient } from "@/lib/types";
import { fmt } from "@/lib/format";

function riskInfo(total: number, current: number, watch: number, overdue: number): { border: string; tooltip: string } {
  if (total < 0) return { border: "border-l-blue-400", tooltip: "Saldo a favor: saldo negativo (nota de credito o sobrepago)" };
  if (overdue > 0) return { border: "border-l-red-500", tooltip: "Vencido critico: deuda con mas de 120 dias" };
  if (watch > 0) return { border: "border-l-amber-400", tooltip: "Vencido reciente: deuda con 91 a 120 dias" };
  return { border: "border-l-emerald-500", tooltip: "Por vencer: deuda dentro del plazo (0 a 90 dias)" };
}

interface Props {
  client: ConsolidatedClient;
  isExpanded: boolean;
  onToggle: () => void;
  userRole: string;
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
  onRowContextMenu?: (e: React.MouseEvent) => void;
  /** Menú "···" con acciones de contacto — visible en la fila (touch-friendly). */
  actionsMenu?: React.ReactNode;
  /** El botón «Últimos pagos ›» — abre su bloque SIN expandir el cliente.
   *  Va en la fila CERRADA a propósito: Daniel, textual, *"un botón para
   *  expandir, no solo al expandir el card, tendría que hacer dos expandir
   *  para verlo"*. Un clic, no dos. */
  pagosBoton?: React.ReactNode;
}

export default function ClientRow({ client, isExpanded, onToggle, userRole, isFavorite, onToggleFavorite, onRowContextMenu, actionsMenu, pagosBoton }: Props) {
  const risk = riskInfo(client.total, client.current, client.watch, client.overdue);

  return (
    <>
      <div className={`border-l-4 ${risk.border} group`} data-tooltip={risk.tooltip}>
        {/* 🔴 ACÁ VIVÍA UNA VISTA DE TARJETAS QUE NUNCA SE DIBUJABA (24-ago-2026)
            Estaba detrás de `sm:hidden` (menos de 640 px) y su ÚNICO padre
            —`ClientTable`, dentro de `admin/page.tsx`— vive detrás de
            `hidden md:block` (768 px o más). O sea: los dos tramos no se cruzan
            nunca y esa tarjeta no se pintó jamás, en ningún ancho. La vista de
            celular del CXC de verdad es `PanelCxcMobile`, que es la que se
            mantiene. Con la tarjeta muerta se fueron sus píldoras de estado y su
            grilla de tramos. */}
        {/* Desktop grid layout */}
        <div
          className={`grid grid-cols-12 gap-2 px-4 py-3 text-sm cursor-pointer transition-colors border-b border-gray-200 ${isExpanded ? "bg-gray-50" : "hover:bg-gray-50/70"}`}
          onClick={onToggle}
          onContextMenu={onRowContextMenu}
        >
          <>
            <div className="col-span-4 font-medium truncate flex items-center gap-1.5">
              {onToggleFavorite && (
                <button onClick={(e) => { e.stopPropagation(); onToggleFavorite(); }} className="flex-shrink-0 text-sm leading-none p-2.5 -m-2.5 hover:scale-110 transition-transform">
                  {isFavorite ? <span className="text-amber-400">★</span> : <span className="text-gray-300 group-hover:text-gray-400">☆</span>}
                </button>
              )}
              <svg width="10" height="10" viewBox="0 0 10 10" className={`flex-shrink-0 text-gray-400 transition-transform ${isExpanded ? "rotate-90" : ""}`} fill="currentColor">
                <path d="M3 1l5 4-5 4V1z"/>
              </svg>
              <span className="truncate" title={client.nombre_normalized}>{client.nombre_normalized}</span>
              {/* `-my-3` porque el botón mide 44 px de alto táctil y la fila
                  no tiene que crecer por él. El propio botón frena el clic
                  para que no expanda la fila. */}
              {pagosBoton && <span className="-my-3 shrink-0">{pagosBoton}</span>}
            </div>
            <div className="col-span-2 text-right tabular-nums text-emerald-700">{client.current === 0 ? <span className="text-gray-300">—</span> : fmt(client.current)}</div>
            <div className="col-span-2 text-right tabular-nums text-amber-600">{client.watch === 0 ? <span className="text-gray-300">—</span> : fmt(client.watch)}</div>
            <div className="col-span-2 text-right tabular-nums text-red-600">
              {client.overdue === 0 ? <span className="text-gray-300">—</span> : fmt(client.overdue)}
            </div>
            <div className="col-span-2 text-right tabular-nums font-semibold relative flex items-center justify-end gap-0.5">
              <span>{fmt(client.total)}</span>
              {actionsMenu && <span onClick={(e) => e.stopPropagation()}>{actionsMenu}</span>}
            </div>
          </>
        </div>
      </div>

    </>
  );
}

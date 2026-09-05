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
  /** Abre la hoja «Cobrar» — el ÚNICO camino de cobro de la fila. */
  onCobrar: (client: ConsolidatedClient) => void;
  /** Casilla de selección para mandar a varios. */
  seleccionado: boolean;
  onSeleccionar: (client: ConsolidatedClient) => void;
  /** «no paga hace 298 d» / «nunca ha pagado» — solo con el filtro encendido. */
  avisoSinPagar?: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 «COBRAR» SE VE EN LA FILA, SIN ABRIR NADA (5-sep-2026).
//
// 🩸 Acá vivía el menú "···" con cuatro opciones (estado de cuenta · WhatsApp ·
// enviar correo · copiar mensaje) y la fila además respondía al CLIC DERECHO
// con un menú propio. Tres listas de acciones en tres archivos, ninguna visible
// hasta tocar algo, y el clic derecho ni siquiera existe en el iPad. Las cuatro
// salidas viven ahora dentro de la hoja «Cobrar», que se abre con un botón que
// se VE. Con el "···" se fue también su ancho, que vuelve al nombre.
// ─────────────────────────────────────────────────────────────────────────────
export default function ClientRow({
  client,
  isExpanded,
  onToggle,
  onCobrar,
  seleccionado,
  onSeleccionar,
  avisoSinPagar,
}: Props) {
  const risk = riskInfo(client.total, client.current, client.watch, client.overdue);

  return (
    <div className={`border-l-4 ${risk.border} group`} data-tooltip={risk.tooltip}>
      <div
        className={`grid grid-cols-12 gap-2 px-4 py-3 text-sm cursor-pointer transition-colors border-b border-gray-200 ${isExpanded ? "bg-gray-50" : "hover:bg-gray-50/70"}`}
        onClick={onToggle}
      >
        <div className="col-span-4 font-medium truncate flex items-center gap-1.5 min-w-0">
          <input
            type="checkbox"
            checked={seleccionado}
            onClick={(e) => e.stopPropagation()}
            onChange={() => onSeleccionar(client)}
            aria-label={`Seleccionar a ${client.nombre_normalized}`}
            className="shrink-0 h-4 w-4 rounded border-gray-300 accent-black cursor-pointer"
          />
          <svg width="10" height="10" viewBox="0 0 10 10" className={`flex-shrink-0 text-gray-400 transition-transform ${isExpanded ? "rotate-90" : ""}`} fill="currentColor">
            <path d="M3 1l5 4-5 4V1z"/>
          </svg>
          <span className="truncate" title={client.nombre_normalized}>{client.nombre_normalized}</span>
          {/* Solo con el filtro de «sin pagar» encendido: en las 100 filas
              normales esta línea sería ruido pegado a cada nombre. */}
          {avisoSinPagar && (
            <span className="shrink-0 text-xs text-gray-400 whitespace-nowrap">{avisoSinPagar}</span>
          )}
        </div>
        <div className="col-span-2 text-right tabular-nums text-emerald-700">{client.current === 0 ? <span className="text-gray-300">—</span> : fmt(client.current)}</div>
        <div className="col-span-2 text-right tabular-nums text-amber-600">{client.watch === 0 ? <span className="text-gray-300">—</span> : fmt(client.watch)}</div>
        <div className="col-span-2 text-right tabular-nums text-red-600">
          {client.overdue === 0 ? <span className="text-gray-300">—</span> : fmt(client.overdue)}
        </div>
        <div className="col-span-2 text-right tabular-nums font-semibold flex items-center justify-end gap-2">
          <span>{fmt(client.total)}</span>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onCobrar(client); }}
            className="shrink-0 rounded-md bg-black px-2.5 py-1 text-xs font-medium text-white transition active:scale-[0.97] hover:bg-gray-800"
          >
            Cobrar
          </button>
        </div>
      </div>
    </div>
  );
}

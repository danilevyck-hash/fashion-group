"use client";

import { AGING, AGING_ORDER } from "@/lib/cxc-aging";

// Leyenda / clave de colores del aging, renderizada ARRIBA de la lista
// (entre los KPIs y la tabla). Responde "qué significa cada color".
export default function AgingLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-3 text-[11px] text-gray-500">
      {AGING_ORDER.map((k) => (
        <span key={k} className="inline-flex items-center gap-1.5">
          <span className={`inline-block w-2.5 h-2.5 rounded-full ${AGING[k].dot}`} />
          <span className="font-medium text-gray-700">{AGING[k].label}</span>
          <span className="text-gray-400 tabular-nums">{AGING[k].range}</span>
        </span>
      ))}
    </div>
  );
}

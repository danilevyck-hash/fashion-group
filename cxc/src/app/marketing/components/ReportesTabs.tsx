"use client";

import { useUrlState } from "@/lib/hooks/useUrlState";
import ReportePorMarcaView from "./ReportePorMarcaView";
import ReportePorTiendaView from "./ReportePorTiendaView";
import ReportePorProyectoView from "./ReportePorProyectoView";

type Tab = "marca" | "tienda" | "proyecto";

const TABS: Array<{ value: Tab; label: string; sub: string }> = [
  { value: "marca", label: "Por Marca", sub: "Gasto total por marca" },
  { value: "tienda", label: "Por Tienda", sub: "Gasto por tienda, desglosado por marca" },
  { value: "proyecto", label: "Por Proyecto", sub: "Detalle de cada proyecto" },
];

export function ReportesTabs() {
  // Tab del reporte en la URL (?rep=tienda). Key "rep" para no chocar con
  // vista/proyecto del page ni con el tab del overlay de proyecto.
  const [tab, setTab] = useUrlState<Tab>("rep", "marca");
  const active = TABS.find((t) => t.value === tab) ?? TABS[0];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">
          Reportes de gastos
        </h1>
      </div>
      <div className="flex items-center gap-1 border-b border-gray-200">
        {TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.value
                ? "border-fuchsia-500 text-fuchsia-700"
                : "border-transparent text-gray-500 hover:text-gray-800"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <p className="text-xs text-gray-500">{active.sub}</p>

      {tab === "marca" && <ReportePorMarcaView />}
      {tab === "tienda" && <ReportePorTiendaView />}
      {tab === "proyecto" && <ReportePorProyectoView />}
    </div>
  );
}

export default ReportesTabs;

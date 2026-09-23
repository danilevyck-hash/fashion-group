"use client";

// Reportes de gastos: POR MARCA y POR TIENDA. 🩸 «Por Proyecto» se retiró el
// 22-sep-2026 (pieza C del rediseño): el proyecto dejó de ser el contenedor
// del gasto — Daniel, *«a) Basta la tienda»*—. Un enlace viejo con
// `?rep=proyecto` cae en «Por Marca». «Exportar Excel» también se fue: el
// Excel de una marca vive en el ZIP de su período.

import { useUrlState } from "@/lib/hooks/useUrlState";
import ReportePorMarcaView from "./ReportePorMarcaView";
import ReportePorTiendaView from "./ReportePorTiendaView";

type Tab = "marca" | "tienda";

// El `sub` de cada pestaña se fue (poda de textos, ago-2026): decía lo mismo
// que la pestaña que ya está encendida arriba.
const TABS: Array<{ value: Tab; label: string }> = [
  { value: "marca", label: "Por Marca" },
  { value: "tienda", label: "Por Tienda" },
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
            className={`inline-flex min-h-[44px] items-center px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              active.value === t.value
                ? "border-fuchsia-500 text-fuchsia-700"
                : "border-transparent text-gray-500 hover:text-gray-800"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {active.value === "marca" && <ReportePorMarcaView />}
      {active.value === "tienda" && <ReportePorTiendaView />}
    </div>
  );
}

export default ReportesTabs;

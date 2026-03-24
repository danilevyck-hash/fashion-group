import type { ConsolidatedClient } from "@/lib/types";

function fmt(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

interface Props {
  roleClients: ConsolidatedClient[];
}

export default function KpiCards({ roleClients }: Props) {
  const totalCxc = roleClients.reduce((s, c) => s + c.total, 0);
  const totalCurrent = roleClients.reduce((s, c) => s + c.current, 0);
  const totalWatch = roleClients.reduce((s, c) => s + c.watch, 0);
  const totalOverdue = roleClients.reduce((s, c) => s + c.overdue, 0);
  const criticalClients = roleClients.filter((c) => c.overdue > 0).length;
  const pctCurrent = totalCxc > 0 ? (totalCurrent / totalCxc) * 100 : 0;
  const pctWatch = totalCxc > 0 ? (totalWatch / totalCxc) * 100 : 0;
  const pctOverdue = totalCxc > 0 ? (totalOverdue / totalCxc) * 100 : 0;

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        <div className="border border-gray-200 rounded px-4 py-3">
          <div className="text-xs text-gray-500 uppercase tracking-wide">Total CXC</div>
          <div className="text-xl sm:text-2xl font-bold mt-1">${fmt(totalCxc)}</div>
        </div>
        <div className="border border-red-200 rounded px-4 py-3 bg-red-50">
          <div className="text-xs text-red-600 uppercase tracking-wide">Vencido +121d</div>
          <div className="text-xl sm:text-2xl font-bold mt-1 text-red-700">${fmt(totalOverdue)}</div>
        </div>
        <div className="border border-gray-200 rounded px-4 py-3">
          <div className="text-xs text-gray-500 uppercase tracking-wide">Clientes Criticos</div>
          <div className="text-xl sm:text-2xl font-bold mt-1">{criticalClients}</div>
        </div>
      </div>

      {totalCxc > 0 && (
        <div className="mb-6">
          <div className="flex h-3 rounded overflow-hidden">
            <div className="bg-green-500" style={{ width: `${pctCurrent}%` }} title={`Corriente: ${pctCurrent.toFixed(0)}%`} />
            <div className="bg-yellow-400" style={{ width: `${pctWatch}%` }} title={`Vigilancia: ${pctWatch.toFixed(0)}%`} />
            <div className="bg-red-500" style={{ width: `${pctOverdue}%` }} title={`Vencido: ${pctOverdue.toFixed(0)}%`} />
          </div>
          <div className="flex justify-between text-[10px] text-gray-500 mt-1">
            <span>Corriente {pctCurrent.toFixed(0)}%</span>
            <span>Vigilancia {pctWatch.toFixed(0)}%</span>
            <span>Vencido {pctOverdue.toFixed(0)}%</span>
          </div>
        </div>
      )}
    </>
  );
}

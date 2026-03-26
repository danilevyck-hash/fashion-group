import type { ConsolidatedClient } from "@/lib/types";

function fmt(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

interface Props {
  roleClients: ConsolidatedClient[];
  onFilterOverdue?: () => void;
}

export default function KpiCards({ roleClients, onFilterOverdue }: Props) {
  const totalCxc = roleClients.reduce((s, c) => s + c.total, 0);
  const totalCurrent = roleClients.reduce((s, c) => s + c.current, 0);
  const totalWatch = roleClients.reduce((s, c) => s + c.watch, 0);
  const totalOverdue = roleClients.reduce((s, c) => s + c.overdue, 0);
  const criticalClients = roleClients.filter((c) => c.overdue > 0).length;
  const watchClients = roleClients.filter((c) => c.watch > 0).length;
  const pctCurrent = totalCxc > 0 ? (totalCurrent / totalCxc) * 100 : 0;
  const pctWatch = totalCxc > 0 ? (totalWatch / totalCxc) * 100 : 0;
  const pctOverdue = totalCxc > 0 ? (totalOverdue / totalCxc) * 100 : 0;

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-6">
        {/* Total CXC */}
        <div className="border border-gray-200 rounded-xl px-4 py-4 flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
            </svg>
          </div>
          <div className="min-w-0">
            <div className="text-[11px] text-gray-500 uppercase tracking-wider font-medium">Total CXC</div>
            <div className="text-xl font-semibold mt-0.5 tabular-nums">${fmt(totalCxc)}</div>
            <div className="text-[11px] text-gray-400 mt-0.5">{roleClients.length} clientes activos</div>
          </div>
        </div>

        {/* Corriente */}
        <div className="border border-emerald-200 rounded-xl px-4 py-4 flex items-start gap-3 bg-emerald-50/50">
          <div className="w-9 h-9 rounded-lg bg-emerald-100 flex items-center justify-center flex-shrink-0">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </div>
          <div className="min-w-0">
            <div className="text-[11px] text-emerald-700 uppercase tracking-wider font-medium">Corriente 0-90d</div>
            <div className="text-xl font-semibold mt-0.5 tabular-nums text-emerald-800">${fmt(totalCurrent)}</div>
            <div className="text-[11px] text-emerald-600 mt-0.5">{pctCurrent.toFixed(0)}% del total</div>
          </div>
        </div>

        {/* Vigilancia */}
        <div className="border border-amber-200 rounded-xl px-4 py-4 flex items-start gap-3 bg-amber-50/50">
          <div className="w-9 h-9 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
          </div>
          <div className="min-w-0">
            <div className="text-[11px] text-amber-700 uppercase tracking-wider font-medium">Vigilancia 91-120d</div>
            <div className="text-xl font-semibold mt-0.5 tabular-nums text-amber-800">${fmt(totalWatch)}</div>
            <div className="text-[11px] text-amber-600 mt-0.5">{watchClients} clientes</div>
          </div>
        </div>

        {/* Vencido */}
        <div
          className="border border-red-200 rounded-xl px-4 py-4 flex items-start gap-3 bg-red-50/50 cursor-pointer hover:bg-red-50 transition group"
          onClick={onFilterOverdue}
        >
          <div className="w-9 h-9 rounded-lg bg-red-100 flex items-center justify-center flex-shrink-0">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] text-red-700 uppercase tracking-wider font-medium">Vencido +121d</div>
            <div className="text-xl font-semibold mt-0.5 tabular-nums text-red-800">${fmt(totalOverdue)}</div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-red-600 mt-0.5">{criticalClients} clientes</span>
              <span className="text-[10px] text-red-400 group-hover:text-red-600 transition">Ver todos &rarr;</span>
            </div>
          </div>
        </div>
      </div>

      {/* Aging bar */}
      {totalCxc > 0 && (
        <div className="mb-6">
          <div className="flex h-3.5 rounded-full overflow-hidden gap-0.5">
            <div className="bg-emerald-500 rounded-l-full transition-all" style={{ width: `${pctCurrent}%` }} data-tooltip={`Corriente: $${fmt(totalCurrent)} (${pctCurrent.toFixed(1)}%)`} />
            <div className="bg-amber-400 transition-all" style={{ width: `${pctWatch}%` }} data-tooltip={`Vigilancia: $${fmt(totalWatch)} (${pctWatch.toFixed(1)}%)`} />
            <div className="bg-red-500 rounded-r-full transition-all" style={{ width: `${pctOverdue}%` }} data-tooltip={`Vencido: $${fmt(totalOverdue)} (${pctOverdue.toFixed(1)}%)`} />
          </div>
          <div className="flex justify-between text-xs text-gray-500 mt-1.5">
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500" />Corriente <span className="font-medium">{pctCurrent.toFixed(0)}%</span></span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-400" />Vigilancia <span className="font-medium">{pctWatch.toFixed(0)}%</span></span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-500" />Vencido <span className="font-medium">{pctOverdue.toFixed(0)}%</span></span>
          </div>
        </div>
      )}
    </>
  );
}

import { useMemo } from "react";
import { COMPANIES } from "@/lib/companies";
import type { Company } from "@/lib/companies";
import type { ConsolidatedClient } from "@/lib/types";
import { fmt } from "@/lib/format";

interface Props {
  roleCompanies: Company[];
  roleClients: ConsolidatedClient[];
  companyFilter: string;
  clients: ConsolidatedClient[];
}

export default function CompanySummary({
  roleCompanies,
  roleClients,
  companyFilter,
  clients,
}: Props) {
  const companySummary = useMemo(() => {
    const sums: Record<string, number> = {};
    for (const co of roleCompanies) sums[co.key] = 0;
    for (const c of roleClients) {
      for (const [key, data] of Object.entries(c.companies)) {
        sums[key] = (sums[key] || 0) + data.total;
      }
    }
    return sums;
  }, [roleClients, roleCompanies]);

  const totalAll = Object.values(companySummary).reduce((s, v) => s + v, 0);
  const maxCompanyTotal = Math.max(...Object.values(companySummary), 1);

  const companyOverdue = useMemo(() => {
    const sums: Record<string, number> = {};
    for (const co of roleCompanies) sums[co.key] = 0;
    for (const c of roleClients) {
      for (const [key, data] of Object.entries(c.companies)) {
        if (sums[key] !== undefined) {
          sums[key] += data.d121_180 + data.d181_270 + data.d271_365 + data.mas_365;
        }
      }
    }
    return sums;
  }, [roleClients, roleCompanies]);

  if (roleCompanies.length <= 1) return null;

  return (
    <div className="mb-6 border border-gray-200 rounded-lg px-4 sm:px-5 py-4">
      <div className="mb-3">
        <div className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">
          <span className="sm:hidden">Resumen por empresa</span>
          <span className="hidden sm:inline">CXC por Empresa</span>
        </div>
      </div>

      {/* Mobile: horizontal scrollable compact cards */}
      <div className="flex sm:hidden gap-2.5 overflow-x-auto pb-2 -mx-1 px-1 snap-x snap-mandatory">
        {roleCompanies.map((co) => {
          const val = companySummary[co.key] || 0;
          const overdue = companyOverdue[co.key] || 0;
          return (
            <div
              key={co.key}
              className="flex-shrink-0 w-[140px] snap-start bg-gray-50 rounded-lg px-3 py-2.5 border border-gray-100"
            >
              <div className="text-[11px] font-medium text-gray-600 truncate mb-1.5">{co.name}</div>
              <div className="text-sm font-semibold tabular-nums">${fmt(val)}</div>
              {overdue > 0 && (
                <div className="text-[10px] text-red-500 tabular-nums mt-0.5">
                  Vencido: ${fmt(overdue)}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Desktop: bar chart layout */}
      <div className="hidden sm:block space-y-2.5">
        {roleCompanies.map((co) => {
          const val = companySummary[co.key] || 0;
          const pct = (val / maxCompanyTotal) * 100;
          const sharePct = totalAll > 0 ? ((val / totalAll) * 100).toFixed(0) : "0";
          return (
            <div key={co.key} className="flex items-center gap-3">
              <div className="w-32 text-xs truncate font-medium text-gray-700">{co.name}</div>
              <div className="flex-1 h-5 bg-gray-100 rounded-md overflow-hidden">
                <div className="h-full rounded-md transition-all" style={{ width: `${pct}%`, background: "linear-gradient(90deg, #1e3a5f, #3b82f6)" }} />
              </div>
              <div className="w-28 text-xs text-right tabular-nums font-medium">${fmt(val)}</div>
              <div className="w-10 text-[10px] text-right text-gray-400 tabular-nums">{sharePct}%</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

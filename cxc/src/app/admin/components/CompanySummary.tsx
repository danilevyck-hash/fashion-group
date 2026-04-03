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
  vendorMap: Record<string, Record<string, string>>;
  onSendVendorWhatsApp: (companyKey: string) => void;
}

export default function CompanySummary({
  roleCompanies,
  roleClients,
  companyFilter,
  clients,
  onSendVendorWhatsApp,
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

  if (roleCompanies.length <= 1) return null;

  return (
    <div className="mb-6 border border-gray-200 rounded-lg px-5 py-4">
      <div className="mb-3">
        <div className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">CXC por Empresa</div>
      </div>
      <div className="space-y-2.5">
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
              {co.vendedorPhone ? (
                <button
                  onClick={() => onSendVendorWhatsApp(co.key)}
                  className="text-[10px] text-gray-400 hover:text-emerald-600 transition flex-shrink-0" title={`Enviar a ${co.vendedor}`}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                </button>
              ) : (
                <div className="w-[14px]" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

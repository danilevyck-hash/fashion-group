import { useMemo } from "react";
import { COMPANIES } from "@/lib/companies";
import type { Company } from "@/lib/companies";
import type { ConsolidatedClient } from "@/lib/types";

function fmt(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

interface Props {
  roleCompanies: Company[];
  roleClients: ConsolidatedClient[];
  companyFilter: string;
  clients: ConsolidatedClient[];
  vendorMap: Record<string, Record<string, string>>;
  onSendVendorWhatsApp: (companyKey: string) => void;
  onMassWhatsApp: (companyKey?: string) => void;
}

export default function CompanySummary({
  roleCompanies,
  roleClients,
  companyFilter,
  clients,
  onSendVendorWhatsApp,
  onMassWhatsApp,
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

  const maxCompanyTotal = Math.max(...Object.values(companySummary), 1);

  if (roleCompanies.length <= 1) return null;

  return (
    <div className="mb-6 border border-gray-200 rounded px-4 py-3">
      <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">CXC por Empresa</div>
      <div className="space-y-2">
        {roleCompanies.map((co) => {
          const val = companySummary[co.key] || 0;
          const pct = (val / maxCompanyTotal) * 100;
          return (
            <div key={co.key} className="flex items-center gap-3">
              <div className="w-36 text-xs truncate">{co.name}</div>
              <div className="flex-1 h-4 bg-gray-100 rounded overflow-hidden">
                <div className="h-full bg-black rounded" style={{ width: `${pct}%` }} />
              </div>
              <div className="w-28 text-xs text-right font-medium">${fmt(val)}</div>
              {co.vendedorPhone ? (
                <button
                  onClick={() => onSendVendorWhatsApp(co.key)}
                  className="text-xs border border-green-600 text-green-700 px-2 py-1 rounded hover:bg-green-50 transition whitespace-nowrap"
                >
                  Enviar a {co.vendedor}
                </button>
              ) : (
                <div className="w-24" />
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-3 pt-3 border-t border-gray-100 flex gap-2">
        <button
          onClick={() => onMassWhatsApp(companyFilter !== "all" ? companyFilter : undefined)}
          className="text-xs border border-green-600 text-green-700 px-3 py-1.5 rounded hover:bg-green-50 transition"
        >
          📱 WhatsApp masivo a vencidos {companyFilter !== "all" ? `de ${COMPANIES.find(c => c.key === companyFilter)?.name || ""}` : "(todas)"}
        </button>
      </div>
    </div>
  );
}

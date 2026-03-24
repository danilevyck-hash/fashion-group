import { useState } from "react";
import type { Company } from "@/lib/companies";
import type { ConsolidatedClient } from "@/lib/types";
import ClientRow from "./ClientRow";
import ContactPanel from "./ContactPanel";

type RiskFilter = "all" | "current" | "watch" | "overdue";
type SortKey = "name" | "current" | "watch" | "overdue" | "total";
type SortDir = "asc" | "desc";

interface Props {
  filtered: ConsolidatedClient[];
  roleCompanies: Company[];
  roleClients: ConsolidatedClient[];
  companyFilter: string;
  setCompanyFilter: (v: string) => void;
  riskFilter: RiskFilter;
  setRiskFilter: (v: RiskFilter) => void;
  search: string;
  setSearch: (v: string) => void;
  sortKey: SortKey;
  sortDir: SortDir;
  toggleSort: (key: SortKey) => void;
  sortArrow: (key: SortKey) => string;
  userRole: string;
  clients: ConsolidatedClient[];
  contactLog: Record<string, { date: string; method: string }>;
  onOpenWhatsApp: (client: ConsolidatedClient) => void;
  onOpenEmail: (client: ConsolidatedClient) => void;
  onMarkContacted: (clientName: string, method: string) => void;
  onSaveEdit: (nombre: string, data: { correo: string; telefono: string; celular: string; contacto: string }) => void;
}

export default function ClientTable({
  filtered,
  roleCompanies,
  roleClients,
  companyFilter,
  setCompanyFilter,
  riskFilter,
  setRiskFilter,
  search,
  setSearch,
  sortKey,
  toggleSort,
  sortArrow,
  userRole,
  clients,
  contactLog,
  onOpenWhatsApp,
  onOpenEmail,
  onMarkContacted,
  onSaveEdit,
}: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);

  const countCurrent = roleClients.filter((c) => c.overdue === 0 && c.watch === 0).length;
  const countWatch = roleClients.filter((c) => c.watch > 0).length;
  const countOverdue = roleClients.filter((c) => c.overdue > 0).length;

  return (
    <>
      {/* Filters row */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setRiskFilter("all")}
            className={`px-3 py-1.5 rounded text-sm border transition ${riskFilter === "all" ? "bg-black text-white border-black" : "border-gray-300 text-gray-600 hover:border-black"}`}>
            Todos ({clients.length})
          </button>
          <button onClick={() => setRiskFilter("current")}
            className={`px-3 py-1.5 rounded text-sm border transition ${riskFilter === "current" ? "bg-green-600 text-white border-green-600" : "border-green-300 text-green-700 hover:bg-green-50"}`}>
            Corriente ({countCurrent})
          </button>
          <button onClick={() => setRiskFilter("watch")}
            className={`px-3 py-1.5 rounded text-sm border transition ${riskFilter === "watch" ? "bg-yellow-500 text-white border-yellow-500" : "border-yellow-300 text-yellow-700 hover:bg-yellow-50"}`}>
            Vigilancia ({countWatch})
          </button>
          <button onClick={() => setRiskFilter("overdue")}
            className={`px-3 py-1.5 rounded text-sm border transition ${riskFilter === "overdue" ? "bg-red-600 text-white border-red-600" : "border-red-300 text-red-700 hover:bg-red-50"}`}>
            Vencido ({countOverdue})
          </button>
        </div>
        {roleCompanies.length > 1 && (
          <select
            value={companyFilter}
            onChange={(e) => setCompanyFilter(e.target.value)}
            className="border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-black"
          >
            <option value="all">Todas las empresas</option>
            {roleCompanies.map((co) => (
              <option key={co.key} value={co.key}>{co.name}</option>
            ))}
          </select>
        )}
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar cliente..."
          className="flex-1 border border-gray-300 rounded px-4 py-1.5 text-sm focus:outline-none focus:border-black"
        />
      </div>

      {/* Client table */}
      <div className="border border-gray-200 rounded overflow-hidden">
        {/* Sortable header */}
        {userRole === "david" ? (
        <div className="grid grid-cols-12 gap-1 sm:gap-2 px-3 sm:px-4 py-2 bg-gray-50 text-[10px] sm:text-xs font-medium text-gray-500 uppercase tracking-wide select-none">
          <div className="col-span-4 sm:col-span-3 cursor-pointer hover:text-black" onClick={() => toggleSort("name")}>
            Cliente{sortArrow("name")}
          </div>
          <div className="hidden sm:block col-span-1 text-right">0-30</div>
          <div className="hidden sm:block col-span-1 text-right">31-60</div>
          <div className="hidden sm:block col-span-1 text-right">61-90</div>
          <div className="hidden sm:block col-span-2 text-right cursor-pointer hover:text-black" onClick={() => toggleSort("watch")}>
            91-120{sortArrow("watch")}
          </div>
          <div className="col-span-4 sm:col-span-2 text-right cursor-pointer hover:text-black" onClick={() => toggleSort("overdue")}>
            121d+{sortArrow("overdue")}
          </div>
          <div className="col-span-4 sm:col-span-2 text-right cursor-pointer hover:text-black" onClick={() => toggleSort("total")}>
            Total{sortArrow("total")}
          </div>
        </div>
        ) : (
        <div className="grid grid-cols-12 gap-1 sm:gap-2 px-3 sm:px-4 py-2 bg-gray-50 text-[10px] sm:text-xs font-medium text-gray-500 uppercase tracking-wide select-none">
          <div className="col-span-5 sm:col-span-4 cursor-pointer hover:text-black" onClick={() => toggleSort("name")}>
            Cliente{sortArrow("name")}
          </div>
          <div className="hidden sm:block col-span-2 text-right cursor-pointer hover:text-black" onClick={() => toggleSort("current")}>
            0-90d{sortArrow("current")}
          </div>
          <div className="hidden sm:block col-span-2 text-right cursor-pointer hover:text-black" onClick={() => toggleSort("watch")}>
            91-120d{sortArrow("watch")}
          </div>
          <div className="col-span-3 sm:col-span-2 text-right cursor-pointer hover:text-black" onClick={() => toggleSort("overdue")}>
            121d+{sortArrow("overdue")}
          </div>
          <div className="col-span-4 sm:col-span-2 text-right cursor-pointer hover:text-black" onClick={() => toggleSort("total")}>
            Total{sortArrow("total")}
          </div>
        </div>
        )}

        {filtered.length === 0 && (
          <div className="px-4 py-8 text-center text-sm text-gray-400">Sin resultados</div>
        )}

        {filtered.map((client) => {
          const isExpanded = expanded === client.nombre_normalized;
          return (
            <div key={client.nombre_normalized}>
              <ClientRow
                client={client}
                isExpanded={isExpanded}
                onToggle={() => setExpanded(isExpanded ? null : client.nombre_normalized)}
                userRole={userRole}
              />
              {isExpanded && (
                <ContactPanel
                  client={client}
                  contactLog={contactLog}
                  onOpenWhatsApp={onOpenWhatsApp}
                  onOpenEmail={onOpenEmail}
                  onMarkContacted={onMarkContacted}
                  onSaveEdit={onSaveEdit}
                  companyFilter={companyFilter}
                  roleCompanies={roleCompanies}
                />
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-4 text-xs text-gray-400 text-center">
        {filtered.length} clientes &middot; Politica: 0-90d corriente &middot; 91-120d vigilancia &middot; 121d+ vencido
      </div>
    </>
  );
}

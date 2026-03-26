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

  const filterBtn = (key: RiskFilter, label: string, count: number, activeClasses: string, inactiveClasses: string) => (
    <button onClick={() => setRiskFilter(key)}
      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${riskFilter === key ? activeClasses : inactiveClasses}`}>
      {label} <span className="opacity-60 ml-0.5">{count}</span>
    </button>
  );

  return (
    <>
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="flex gap-1.5 flex-wrap">
          {filterBtn("all", "Todos", clients.length, "bg-gray-900 text-white", "bg-gray-100 text-gray-600 hover:bg-gray-200")}
          {filterBtn("current", "Corriente", countCurrent, "bg-emerald-600 text-white", "bg-emerald-50 text-emerald-700 hover:bg-emerald-100")}
          {filterBtn("watch", "Vigilancia", countWatch, "bg-amber-500 text-white", "bg-amber-50 text-amber-700 hover:bg-amber-100")}
          {filterBtn("overdue", "Vencido", countOverdue, "bg-red-600 text-white", "bg-red-50 text-red-700 hover:bg-red-100")}
        </div>
        {roleCompanies.length > 1 && (
          <select
            value={companyFilter}
            onChange={(e) => setCompanyFilter(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-gray-300 bg-white"
          >
            <option value="all">Todas las empresas</option>
            {roleCompanies.map((co) => <option key={co.key} value={co.key}>{co.name}</option>)}
          </select>
        )}
        {/* Search with icon */}
        <div className="flex-1 relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre, contacto..."
            className="w-full border border-gray-200 rounded-lg pl-9 pr-8 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-gray-300"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          )}
        </div>
      </div>

      {/* Result count */}
      {(search || riskFilter !== "all" || companyFilter !== "all") && (
        <div className="text-xs text-gray-400 mb-2">{filtered.length} de {clients.length} clientes</div>
      )}

      {/* Client table */}
      <div className="border border-gray-200 rounded-xl overflow-hidden">
        {/* Sticky sortable header */}
        {userRole === "david" ? (
        <div className="grid grid-cols-12 gap-1 sm:gap-2 px-3 sm:px-4 py-2.5 bg-gray-50 border-b border-gray-200 text-[10px] sm:text-[11px] font-medium text-gray-500 uppercase tracking-wider select-none sticky top-11 z-[5]">
          <div className="col-span-4 sm:col-span-3 cursor-pointer hover:text-gray-900 transition" onClick={() => toggleSort("name")}>
            Cliente{sortArrow("name")}
          </div>
          <div className="hidden sm:block col-span-1 text-right" data-tooltip="Deuda con 0 a 30 dias">0-30</div>
          <div className="hidden sm:block col-span-1 text-right" data-tooltip="Deuda con 31 a 60 dias">31-60</div>
          <div className="hidden sm:block col-span-1 text-right" data-tooltip="Deuda con 61 a 90 dias">61-90</div>
          <div className="hidden sm:block col-span-2 text-right cursor-pointer hover:text-gray-900 transition" data-tooltip="Vigilancia: 91 a 120 dias" onClick={() => toggleSort("watch")}>
            91-120{sortArrow("watch")}
          </div>
          <div className="col-span-4 sm:col-span-2 text-right cursor-pointer hover:text-gray-900 transition" data-tooltip="Vencido: mas de 121 dias" onClick={() => toggleSort("overdue")}>
            121d+{sortArrow("overdue")}
          </div>
          <div className="col-span-4 sm:col-span-2 text-right cursor-pointer hover:text-gray-900 transition" onClick={() => toggleSort("total")}>
            Total{sortArrow("total")}
          </div>
        </div>
        ) : (
        <div className="grid grid-cols-12 gap-1 sm:gap-2 px-3 sm:px-4 py-2.5 bg-gray-50 border-b border-gray-200 text-[10px] sm:text-[11px] font-medium text-gray-500 uppercase tracking-wider select-none sticky top-11 z-[5]">
          <div className="col-span-5 sm:col-span-4 cursor-pointer hover:text-gray-900 transition" onClick={() => toggleSort("name")}>
            Cliente{sortArrow("name")}
          </div>
          <div className="hidden sm:block col-span-2 text-right cursor-pointer hover:text-gray-900 transition" data-tooltip="Corriente: deuda con 0 a 90 dias" onClick={() => toggleSort("current")}>
            0-90d{sortArrow("current")}
          </div>
          <div className="hidden sm:block col-span-2 text-right cursor-pointer hover:text-gray-900 transition" data-tooltip="Vigilancia: deuda con 91 a 120 dias" onClick={() => toggleSort("watch")}>
            91-120d{sortArrow("watch")}
          </div>
          <div className="col-span-3 sm:col-span-2 text-right cursor-pointer hover:text-gray-900 transition" data-tooltip="Vencido: deuda con mas de 121 dias" onClick={() => toggleSort("overdue")}>
            121d+{sortArrow("overdue")}
          </div>
          <div className="col-span-4 sm:col-span-2 text-right cursor-pointer hover:text-gray-900 transition" onClick={() => toggleSort("total")}>
            Total{sortArrow("total")}
          </div>
        </div>
        )}

        {filtered.length === 0 && (
          <div className="px-4 py-12 text-center">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.5" className="mx-auto mb-3">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <p className="text-sm text-gray-400">Sin resultados</p>
            {search && <p className="text-xs text-gray-300 mt-1">Intenta con otro termino de busqueda</p>}
          </div>
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
                contactLog={contactLog}
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

      <div className="mt-3 text-[11px] text-gray-400 text-center">
        {filtered.length} clientes &middot; Politica: 0-90d corriente &middot; 91-120d vigilancia &middot; 121d+ vencido
      </div>
    </>
  );
}

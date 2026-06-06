"use client";

import { useState, useCallback } from "react";
import type { Company } from "@/lib/companies";
import type { ConsolidatedClient } from "@/lib/types";
import ClientRow from "./ClientRow";
import ContactPanel from "./ContactPanel";
import { AccordionContent, useContextMenu, BottomSheet } from "@/components/ui";
import type { ContextMenuItem } from "@/components/ui";
import { usePersistedState } from "@/lib/hooks/usePersistedState";

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
  contactLog: Record<string, { date: string; method: string }>;
  onOpenEmail: (client: ConsolidatedClient) => void;
  onSaveEdit: (nombre: string, data: { correo: string; telefono: string; celular: string; contacto: string }) => void;
  onQuickMarkContacted: (clientName: string, method: string) => void;
  favorites?: Set<string>;
  onToggleFavorite?: (name: string) => void;
  /** Search and risk filters are now managed by the parent page, hide them here */
  hideSearchAndRiskFilters?: boolean;
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
  toggleSort,
  sortArrow,
  userRole,
  onOpenEmail,
  onSaveEdit,
  favorites,
  onToggleFavorite,
  hideSearchAndRiskFilters,
}: Props) {
  const [expanded, setExpanded] = usePersistedState<string | null>("cxc", "expanded", null);
  const { show: showContextMenu } = useContextMenu();

  // Build context menu items for a CXC client row
  const buildClientContextMenu = useCallback((client: ConsolidatedClient): ContextMenuItem[] => {
    const hasEmail = !!client.correo;
    return [
      {
        label: "Email",
        shortcut: "E",
        icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>,
        onClick: () => onOpenEmail(client),
        hidden: !hasEmail,
        dividerAfter: true,
      },
      {
        label: "Ver en directorio",
        shortcut: "D",
        icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
        onClick: () => { window.open(`/clientes?search=${encodeURIComponent(client.nombre_normalized)}`, "_blank"); },
      },
    ];
  }, [onOpenEmail]);

  // (pagination removed — all clients rendered)


  const countCurrent = roleClients.filter((c) => c.overdue === 0 && c.watch === 0).length;
  const countWatch = roleClients.filter((c) => c.watch > 0).length;
  const countOverdue = roleClients.filter((c) => c.overdue > 0).length;

  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  const activeFilterCount = (riskFilter !== "all" ? 1 : 0) + (companyFilter !== "all" ? 1 : 0);

  const riskTooltips: Record<string, string> = {
    current: "Por vencer — deuda dentro del plazo de crédito (0 a 90 días)",
    watch: "Vencido reciente — deuda con 91 a 120 días sin pagar",
    overdue: "Vencido crítico — deuda con más de 120 días sin pagar",
  };

  const riskSubtitles: Record<string, string> = {
    current: "Por vencer (0-90 días)",
    watch: "Vencido reciente (91-120 días)",
    overdue: "Vencido crítico (+120 días)",
  };

  const filterBtn = (key: RiskFilter, label: string, count: number, activeClasses: string, inactiveClasses: string) => (
    <button onClick={() => setRiskFilter(key)}
      title={riskTooltips[key] || ""}
      className={`px-3 min-h-[44px] rounded-lg text-xs font-medium transition flex flex-col items-center justify-center ${riskFilter === key ? activeClasses : inactiveClasses}`}>
      <span>{label} <span className="opacity-60 ml-0.5">{count}</span></span>
      {riskSubtitles[key] && <span className={`text-[10px] font-normal mt-0.5 ${riskFilter === key ? "opacity-70" : "opacity-50"}`}>{riskSubtitles[key]}</span>}
    </button>
  );

  return (
    <>
      {/* Company filter + mobile filter button (search & risk tabs moved to parent page) */}
      {!hideSearchAndRiskFilters && (
        <>
          {/* Mobile: search bar + filtros button */}
          <div className="flex sm:hidden gap-2 mb-4">
            <div className="flex-1 relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar cliente..."
                className="w-full border border-gray-200 rounded-lg pl-9 pr-8 min-h-[44px] text-sm focus:outline-none focus:ring-1 focus:ring-gray-300"
                onKeyDown={(e) => { if (e.key === "Escape") setSearch(""); }}
              />
              {search && (
                <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              )}
            </div>
            <button
              onClick={() => setMobileFiltersOpen(true)}
              className={`flex items-center gap-1.5 px-4 min-h-[44px] rounded-lg border text-sm font-medium transition flex-shrink-0 ${activeFilterCount > 0 ? "border-blue-300 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
              Filtros{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
            </button>
          </div>

          {/* Mobile filters bottom sheet */}
          <BottomSheet open={mobileFiltersOpen} onClose={() => setMobileFiltersOpen(false)}>
            <div className="px-4 pb-6 space-y-5">
              <div className="text-base font-semibold text-gray-900 pb-2 border-b border-gray-100">Filtros</div>
              <div>
                <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Estado</div>
                <div className="grid grid-cols-2 gap-2">
                  {filterBtn("all", "Todos", roleClients.length, "bg-gray-900 text-white", "bg-gray-100 text-gray-600")}
                  {filterBtn("current", "Por vencer", countCurrent, "bg-emerald-600 text-white", "bg-emerald-50 text-emerald-700")}
                  {filterBtn("watch", "Vencido reciente", countWatch, "bg-amber-500 text-white", "bg-amber-50 text-amber-700")}
                  {filterBtn("overdue", "Vencido crítico", countOverdue, "bg-red-600 text-white", "bg-red-50 text-red-700")}
                </div>
              </div>
              {roleCompanies.length > 1 && (
                <div>
                  <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
                    Empresa
                    <span className="ml-2 normal-case tracking-normal text-[10px] font-normal text-gray-400">Según permisos de tu rol</span>
                  </div>
                  <select
                    value={companyFilter}
                    onChange={(e) => setCompanyFilter(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 min-h-[44px] text-sm focus:outline-none focus:ring-1 focus:ring-gray-300 bg-white"
                  >
                    <option value="all">Todas mis empresas</option>
                    {roleCompanies.map((co) => <option key={co.key} value={co.key}>{co.name}</option>)}
                  </select>
                </div>
              )}
              <button
                onClick={() => setMobileFiltersOpen(false)}
                className="w-full bg-black text-white rounded-lg min-h-[44px] text-sm font-medium hover:bg-gray-800 active:scale-[0.97] transition-all"
              >
                Aplicar filtros
              </button>
            </div>
          </BottomSheet>

          {/* Desktop filters — hidden on mobile */}
          <div className="hidden sm:flex flex-row gap-3 mb-4">
            <div className="flex gap-1.5 flex-wrap">
              {filterBtn("all", "Todos", roleClients.length, "bg-gray-900 text-white", "bg-gray-100 text-gray-600 hover:bg-gray-200")}
              {filterBtn("current", "Por vencer", countCurrent, "bg-emerald-600 text-white", "bg-emerald-50 text-emerald-700 hover:bg-emerald-100")}
              {filterBtn("watch", "Vencido reciente", countWatch, "bg-amber-500 text-white", "bg-amber-50 text-amber-700 hover:bg-amber-100")}
              {filterBtn("overdue", "Vencido crítico", countOverdue, "bg-red-600 text-white", "bg-red-50 text-red-700 hover:bg-red-100")}
            </div>
            {roleCompanies.length > 1 && (
              <select
                value={companyFilter}
                onChange={(e) => setCompanyFilter(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 min-h-[44px] text-xs focus:outline-none focus:ring-1 focus:ring-gray-300 bg-white"
              >
                <option value="all">Todas mis empresas</option>
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
                placeholder="Buscar por nombre, telefono, email..."
                className="w-full border border-gray-200 rounded-lg pl-9 pr-8 min-h-[44px] text-xs focus:outline-none focus:ring-1 focus:ring-gray-300"
                onKeyDown={(e) => { if (e.key === "Escape") setSearch(""); }}
              />
              {search && (
                <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              )}
            </div>
          </div>
        </>
      )}

      {/* Company filter only (when search/risk filters are on parent page) */}
      {hideSearchAndRiskFilters && roleCompanies.length > 1 && (
        <div className="flex items-center gap-3 mb-3">
          <select
            value={companyFilter}
            onChange={(e) => setCompanyFilter(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-gray-300 bg-white"
          >
            <option value="all">Todas mis empresas</option>
            {roleCompanies.map((co) => <option key={co.key} value={co.key}>{co.name}</option>)}
          </select>
        </div>
      )}

      {/* Result count */}
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs text-gray-400">
          {(search || riskFilter !== "all" || companyFilter !== "all") ? `${filtered.length} de ${roleClients.length} clientes` : `${filtered.length} clientes`}
        </div>
      </div>

      {/* Client table */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        {/* Sticky sortable header */}
        {/* Desktop header — hidden on mobile since mobile uses card layout */}
        <div className="hidden sm:grid grid-cols-12 gap-2 px-4 py-2.5 bg-gray-50 border-b border-gray-200 text-[11px] font-medium text-gray-500 uppercase tracking-wider select-none">
          <div className="col-span-4 cursor-pointer hover:text-gray-900 transition" onClick={() => toggleSort("name")}>
            Cliente{sortArrow("name")}
          </div>
          <div className="col-span-2 text-right cursor-pointer hover:text-gray-900 transition" data-tooltip="Corriente: deuda con 0 a 90 dias" onClick={() => toggleSort("current")}>
            0-90d{sortArrow("current")}
          </div>
          <div className="col-span-2 text-right cursor-pointer hover:text-gray-900 transition" data-tooltip="Vigilancia: deuda con 91 a 120 dias" onClick={() => toggleSort("watch")}>
            91-120d{sortArrow("watch")}
          </div>
          <div className="col-span-2 text-right cursor-pointer hover:text-gray-900 transition" data-tooltip="Vencido: deuda con mas de 121 dias" onClick={() => toggleSort("overdue")}>
            121d+{sortArrow("overdue")}
          </div>
          <div className="col-span-2 text-right cursor-pointer hover:text-gray-900 transition" onClick={() => toggleSort("total")}>
            Total{sortArrow("total")}
          </div>
        </div>

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
                  isFavorite={favorites?.has(client.nombre_normalized)}
                  onToggleFavorite={onToggleFavorite ? () => onToggleFavorite(client.nombre_normalized) : undefined}
                  onRowContextMenu={(e) => showContextMenu(e, buildClientContextMenu(client))}
                />
                <AccordionContent open={isExpanded}>
                  <ContactPanel
                    client={client}
                    onSaveEdit={onSaveEdit}
                    companyFilter={companyFilter}
                    roleCompanies={roleCompanies}
                  />
                </AccordionContent>
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

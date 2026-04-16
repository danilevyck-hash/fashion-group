"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { Company } from "@/lib/companies";
import type { ConsolidatedClient } from "@/lib/types";
import { fmt } from "@/lib/format";
import ClientRow from "./ClientRow";
import ContactPanel from "./ContactPanel";
import { AccordionContent, useContextMenu, BottomSheet, Toast, ConfirmModal } from "@/components/ui";
import type { ContextMenuItem } from "@/components/ui";
import { usePersistedState } from "@/lib/hooks/usePersistedState";

type RiskFilter = "all" | "current" | "watch" | "overdue";
type SortKey = "name" | "current" | "watch" | "overdue" | "total" | "follow_up";
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
  onCopyCollectionMsg: (client: ConsolidatedClient) => void;
  onOpenEmail: (client: ConsolidatedClient) => void;
  onMarkContacted: (clientName: string, method: string) => void;
  onSaveEdit: (nombre: string, data: { correo: string; telefono: string; celular: string; contacto: string }) => void;
  onRegisterContact: (clientName: string, data: { resultado_contacto: string; proximo_seguimiento: string; metodo: string }) => Promise<void>;
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
  sortKey,
  toggleSort,
  sortArrow,
  userRole,
  clients,
  contactLog,
  onOpenWhatsApp,
  onCopyCollectionMsg,
  onOpenEmail,
  onMarkContacted,
  onSaveEdit,
  onRegisterContact,
  favorites,
  onToggleFavorite,
  hideSearchAndRiskFilters,
}: Props) {
  const [expanded, setExpanded] = usePersistedState<string | null>("cxc", "expanded", null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedNames, setSelectedNames] = useState<Set<string>>(new Set());
  const cancelledRef = useRef(false);
  const [batchProgress, setBatchProgress] = useState<{ sent: number; total: number } | null>(null);
  const { show: showContextMenu } = useContextMenu();
  const [toast, setToast] = useState<string | null>(null);
  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(null), 3000); }
  const [confirmWA, setConfirmWA] = useState<{ count: number; callback: () => void } | null>(null);

  // Build context menu items for a CXC client row
  const buildClientContextMenu = useCallback((client: ConsolidatedClient): ContextMenuItem[] => {
    const hasPhone = !!(client.celular || client.telefono);
    const hasEmail = !!client.correo;
    return [
      {
        label: "WhatsApp",
        shortcut: "W",
        icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="text-emerald-600"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>,
        onClick: () => { onOpenWhatsApp(client); onMarkContacted(client.nombre_normalized, "whatsapp"); },
        hidden: !hasPhone,
      },
      {
        label: "Email",
        shortcut: "E",
        icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>,
        onClick: () => { onOpenEmail(client); onMarkContacted(client.nombre_normalized, "email"); },
        hidden: !hasEmail,
      },
      {
        label: "Copiar mensaje",
        shortcut: "C",
        icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>,
        onClick: () => onCopyCollectionMsg(client),
        dividerAfter: true,
      },
      {
        label: "Registrar contacto",
        shortcut: "R",
        icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>,
        onClick: () => { setExpanded(client.nombre_normalized); },
      },
      {
        label: "Ver en directorio",
        shortcut: "D",
        icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
        onClick: () => { window.open(`/directorio?search=${encodeURIComponent(client.nombre_normalized)}`, "_blank"); },
      },
    ];
  }, [onOpenWhatsApp, onOpenEmail, onCopyCollectionMsg, onMarkContacted, setExpanded]);

  // (pagination removed — all clients rendered)


  const countCurrent = roleClients.filter((c) => c.overdue === 0 && c.watch === 0).length;
  const countWatch = roleClients.filter((c) => c.watch > 0).length;
  const countOverdue = roleClients.filter((c) => c.overdue > 0).length;

  function toggleSelection(name: string) {
    setSelectedNames((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  }

  function selectAllVisible() {
    setSelectedNames(new Set(filtered.map((c) => c.nombre_normalized)));
  }

  function deselectAll() {
    setSelectedNames(new Set());
  }

  function exitSelectionMode() {
    setSelectionMode(false);
    setSelectedNames(new Set());
  }

  function sendWAToSelected() {
    const selected = filtered.filter((c) => selectedNames.has(c.nombre_normalized));
    const withPhone = selected.filter((c) => c.celular || c.telefono);
    if (withPhone.length === 0) {
      showToast(selected.length > 0 ? "Ninguno de los clientes seleccionados tiene telefono registrado." : "No hay clientes seleccionados.");
      return;
    }

    setConfirmWA({
      count: withPhone.length,
      callback: () => {
        cancelledRef.current = false;
        setBatchProgress({ sent: 0, total: withPhone.length });

        function sendNext(index: number) {
          if (cancelledRef.current) {
            showToast(`Envio cancelado. Se enviaron ${index} de ${withPhone.length} mensajes.`);
            setBatchProgress(null);
            exitSelectionMode();
            return;
          }
          if (index >= withPhone.length) {
            showToast(`Envio completado. Se enviaron ${withPhone.length} mensajes.`);
            setBatchProgress(null);
            exitSelectionMode();
            return;
          }
          const client = withPhone[index];
          onOpenWhatsApp(client);
          onMarkContacted(client.nombre_normalized, "whatsapp");
          setBatchProgress({ sent: index + 1, total: withPhone.length });
          setTimeout(() => sendNext(index + 1), 1500);
        }

        sendNext(0);
      },
    });
  }

  const allVisibleSelected = filtered.length > 0 && filtered.every((c) => selectedNames.has(c.nombre_normalized));
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  const activeFilterCount = (riskFilter !== "all" ? 1 : 0) + (companyFilter !== "all" ? 1 : 0);

  const riskTooltips: Record<string, string> = {
    current: "Al día — deuda con 0 a 90 días",
    watch: "Vigilancia — deuda con 91 a 120 días sin pagar",
    overdue: "Vencido — deuda con más de 121 días sin pagar",
  };

  const riskSubtitles: Record<string, string> = {
    current: "Al dia (0-90 dias)",
    watch: "Atencion (91-120 dias)",
    overdue: "Vencido (121+ dias)",
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
                  {filterBtn("all", "Todos", clients.length, "bg-gray-900 text-white", "bg-gray-100 text-gray-600")}
                  {filterBtn("current", "Corriente", countCurrent, "bg-emerald-600 text-white", "bg-emerald-50 text-emerald-700")}
                  {filterBtn("watch", "Vigilancia", countWatch, "bg-amber-500 text-white", "bg-amber-50 text-amber-700")}
                  {filterBtn("overdue", "Vencido", countOverdue, "bg-red-600 text-white", "bg-red-50 text-red-700")}
                </div>
              </div>
              {roleCompanies.length > 1 && (
                <div>
                  <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Empresa</div>
                  <select
                    value={companyFilter}
                    onChange={(e) => setCompanyFilter(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 min-h-[44px] text-sm focus:outline-none focus:ring-1 focus:ring-gray-300 bg-white"
                  >
                    <option value="all">Todas las empresas</option>
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
              {filterBtn("all", "Todos", clients.length, "bg-gray-900 text-white", "bg-gray-100 text-gray-600 hover:bg-gray-200")}
              {filterBtn("current", "Corriente", countCurrent, "bg-emerald-600 text-white", "bg-emerald-50 text-emerald-700 hover:bg-emerald-100")}
              {filterBtn("watch", "Vigilancia", countWatch, "bg-amber-500 text-white", "bg-amber-50 text-amber-700 hover:bg-amber-100")}
              {filterBtn("overdue", "Vencido", countOverdue, "bg-red-600 text-white", "bg-red-50 text-red-700 hover:bg-red-100")}
            </div>
            {roleCompanies.length > 1 && (
              <select
                value={companyFilter}
                onChange={(e) => setCompanyFilter(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 min-h-[44px] text-xs focus:outline-none focus:ring-1 focus:ring-gray-300 bg-white"
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
            <option value="all">Todas las empresas</option>
            {roleCompanies.map((co) => <option key={co.key} value={co.key}>{co.name}</option>)}
          </select>
        </div>
      )}

      {/* Result count + selection toggle */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <div className="text-xs text-gray-400">
            {(search || riskFilter !== "all" || companyFilter !== "all") ? `${filtered.length} de ${clients.length} clientes` : `${filtered.length} clientes`}
          </div>
          <button
            onClick={() => toggleSort("follow_up")}
            className={`text-xs flex items-center gap-1 px-2 py-1 rounded-md transition ${sortKey === "follow_up" ? "bg-purple-100 text-purple-700 font-medium" : "text-gray-400 hover:text-gray-700"}`}
            title="Ordenar por fecha de próximo seguimiento"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            Seguimiento{sortKey === "follow_up" ? sortArrow("follow_up") : ""}
          </button>
        </div>
        {!selectionMode ? (
          <button onClick={() => setSelectionMode(true)} className="text-xs text-gray-400 hover:text-gray-700 transition flex items-center gap-1">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
            Seleccionar
          </button>
        ) : (
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500 font-medium">{selectedNames.size} seleccionados</span>
            <button onClick={allVisibleSelected ? deselectAll : selectAllVisible} className="text-xs text-gray-400 hover:text-gray-700 transition">
              {allVisibleSelected ? "Deseleccionar" : "Seleccionar todos"}
            </button>
            {selectedNames.size > 0 && !batchProgress && (
              <button onClick={sendWAToSelected} className="text-xs bg-emerald-600 text-white px-3 py-1 rounded-lg hover:bg-emerald-700 transition flex items-center gap-1.5 font-medium">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                Enviar WA ({selectedNames.size})
              </button>
            )}
            {batchProgress && (
              <>
                <span className="text-xs text-emerald-700 font-medium">Enviando {batchProgress.sent} de {batchProgress.total}...</span>
                <button onClick={() => { cancelledRef.current = true; }} className="text-xs bg-red-500 text-white px-3 py-1 rounded-lg hover:bg-red-600 transition font-medium">
                  Cancelar envio
                </button>
              </>
            )}
            {!batchProgress && <button onClick={exitSelectionMode} className="text-xs text-gray-400 hover:text-gray-700 transition">Cancelar</button>}
          </div>
        )}
      </div>

      {/* Client table */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        {/* Sticky sortable header */}
        {/* Desktop header — hidden on mobile since mobile uses card layout */}
        <div className="hidden sm:grid grid-cols-12 gap-2 px-4 py-2.5 bg-gray-50 border-b border-gray-200 text-[11px] font-medium text-gray-500 uppercase tracking-wider select-none">
          {selectionMode && <div className="col-span-1" />}
          <div className={`${selectionMode ? "col-span-3" : "col-span-4"} cursor-pointer hover:text-gray-900 transition`} onClick={() => toggleSort("name")}>
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
            const isSelected = selectedNames.has(client.nombre_normalized);
            return (
              <div key={client.nombre_normalized} className={isSelected ? "bg-emerald-50/50" : ""}>
                <ClientRow
                  client={client}
                  isExpanded={isExpanded}
                  onToggle={() => {
                    if (selectionMode) { toggleSelection(client.nombre_normalized); }
                    else { setExpanded(isExpanded ? null : client.nombre_normalized); }
                  }}
                  userRole={userRole}
                  contactLog={contactLog}
                  selectionMode={selectionMode}
                  isSelected={isSelected}
                  onQuickWA={() => { onOpenWhatsApp(client); onMarkContacted(client.nombre_normalized, "whatsapp"); }}
                  onQuickEmail={() => { onOpenEmail(client); onMarkContacted(client.nombre_normalized, "email"); }}
                  onRegisterContact={(data) => onRegisterContact(client.nombre_normalized, data)}
                  isFavorite={favorites?.has(client.nombre_normalized)}
                  onToggleFavorite={onToggleFavorite ? () => onToggleFavorite(client.nombre_normalized) : undefined}
                  onRowContextMenu={(e) => showContextMenu(e, buildClientContextMenu(client))}
                />
                {!selectionMode && (
                  <AccordionContent open={isExpanded}>
                    <ContactPanel
                      client={client}
                      contactLog={contactLog}
                      onOpenWhatsApp={onOpenWhatsApp}
                      onCopyCollectionMsg={onCopyCollectionMsg}
                      onOpenEmail={onOpenEmail}
                      onSaveEdit={onSaveEdit}
                      onRegisterContact={(data) => onRegisterContact(client.nombre_normalized, data)}
                      companyFilter={companyFilter}
                      roleCompanies={roleCompanies}
                    />
                  </AccordionContent>
                )}
              </div>
            );
          })}
      </div>

      <div className="mt-3 text-[11px] text-gray-400 text-center">
        {filtered.length} clientes &middot; Politica: 0-90d corriente &middot; 91-120d vigilancia &middot; 121d+ vencido
      </div>

      <Toast message={toast} />
      <ConfirmModal
        open={!!confirmWA}
        onClose={() => setConfirmWA(null)}
        onConfirm={() => { confirmWA?.callback(); setConfirmWA(null); }}
        title="Envio masivo de WhatsApp"
        message={`Se abriran ${confirmWA?.count ?? 0} ventanas de WhatsApp. ¿Continuar?`}
        confirmLabel="Enviar"
      />
    </>
  );
}

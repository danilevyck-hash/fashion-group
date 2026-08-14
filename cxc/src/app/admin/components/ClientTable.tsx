"use client";

import { useState, useCallback } from "react";
import type { Company } from "@/lib/companies";
import type { ConsolidatedClient } from "@/lib/types";
import ClientRow from "./ClientRow";
import ContactPanel from "./ContactPanel";
import { AccordionContent, useContextMenu, BottomSheet } from "@/components/ui";
import type { ContextMenuItem } from "@/components/ui";
import OverflowMenu, { type OverflowMenuItem } from "@/components/ui/OverflowMenu";
import { usePersistedState } from "@/lib/hooks/usePersistedState";
import { AGING } from "@/lib/cxc-aging";
import { etiquetaOrden, type RiskFilter, type SortKey, type SortDir } from "@/lib/cxc-orden";

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
  onOpenEmail: (client: ConsolidatedClient) => void;
  onSaveEdit: (nombre: string, data: { correo: string; telefono: string; celular: string; contacto: string }) => void;
  onWhatsApp: (client: ConsolidatedClient) => void;
  onCopyMessage: (client: ConsolidatedClient) => void;
  onOpenEstado: (client: ConsolidatedClient) => void;
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
  sortDir,
  toggleSort,
  sortArrow,
  userRole,
  onOpenEmail,
  onSaveEdit,
  onWhatsApp,
  onCopyMessage,
  onOpenEstado,
  favorites,
  onToggleFavorite,
  hideSearchAndRiskFilters,
}: Props) {
  const [expanded, setExpanded] = usePersistedState<string | null>("cxc", "expanded", null);
  const { show: showContextMenu } = useContextMenu();

  // Menú de CLICK DERECHO (solo escritorio) de una fila del CXC.
  //
  // 🔑 Dice lo MISMO que el menú "···", con las MISMAS palabras: es la misma
  // fila y no puede tener dos vocabularios ni dos juegos de opciones. Por eso
  // "Ver en directorio" también se fue de acá (14-ago-2026): el #550 la retiró
  // del "···" y ésta quedó viva, que es justo la incoherencia que se vino a
  // arreglar. Con ella se fueron su ícono y su `window.open` — no la usaba nadie
  // más (el `?search=` de `/clientes` sigue funcionando para un enlace pegado a
  // mano, pero ya no lo alimenta ninguna pantalla).
  //
  // 🩸 Y no se esconde cuando el cliente no tiene correo: el modal resuelve el
  // destinatario y deja escribirlo si falta (`EnviarEmailModal`), así que el
  // `hidden` era una herencia del viejo `mailto:`. Con una sola opción, ese
  // `hidden` dejaba el click derecho SIN menú alguno en esas filas mientras el
  // "···" de la misma fila sí ofrecía la acción.
  const buildClientContextMenu = useCallback((client: ConsolidatedClient): ContextMenuItem[] => [
    {
      label: "Enviar correo",
      shortcut: "E",
      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>,
      onClick: () => onOpenEmail(client),
    },
  ], [onOpenEmail]);

  // Menú "···" visible en cada fila: las CUATRO cosas que se hacen para cobrar,
  // alcanzables en touch (el menú de click-derecho no existe en iPad).
  //
  // 🔑 Dice "Enviar correo", no "Enviar email" (14-ago-2026): la app se lee en
  // español simple y el resto del módulo ya dice correo (el modal, el botón que
  // manda, el aviso de "Correo enviado"). "Email" era la palabra que quedó.
  //
  // 🔴 Eran 7 y quedaron 4 (14-ago-2026). Se retiraron "Ya contacté · Llamada"
  // y "Ya contacté · Visita" —escribían en `cxc_contact_log` y el resultado no
  // se pintaba en ninguna pantalla; 141 filas, ninguna en los últimos 90 días—
  // y "Ver en directorio". Daniel, textual: *"sobre darle seguimiento no es algo
  // que quiero para ese módulo, llamo al cliente por fuera y ya"*. El
  // seguimiento de cobro NO va a existir acá: no se reemplaza por otra cosa.
  const buildRowMenuItems = useCallback((client: ConsolidatedClient): OverflowMenuItem[] => [
    { label: "Estado de cuenta", onClick: () => onOpenEstado(client) },
    { label: "WhatsApp", onClick: () => onWhatsApp(client) },
    { label: "Enviar correo", onClick: () => onOpenEmail(client) },
    { label: "Copiar mensaje", onClick: () => onCopyMessage(client) },
  ], [onOpenEstado, onWhatsApp, onOpenEmail, onCopyMessage]);

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
      {riskSubtitles[key] && <span className={`text-xs font-normal mt-0.5 ${riskFilter === key ? "opacity-70" : "opacity-50"}`}>{riskSubtitles[key]}</span>}
    </button>
  );

  // Saldo positivo (deuda) en la lista principal; saldo negativo (crédito a
  // favor) en su propia sección al pie, fuera de la lista de cobro.
  const positivos = filtered.filter((c) => c.total >= 0);
  const negativos = filtered.filter((c) => c.total < 0);

  const renderClientRow = (client: ConsolidatedClient) => {
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
          actionsMenu={<OverflowMenu items={buildRowMenuItems(client)} ariaLabel={`Acciones de ${client.nombre_normalized}`} />}
        />
        <AccordionContent open={isExpanded}>
          <ContactPanel
            client={client}
            onSaveEdit={onSaveEdit}
            companyFilter={companyFilter}
            roleCompanies={roleCompanies}
            onOpenEstado={onOpenEstado}
          />
        </AccordionContent>
      </div>
    );
  };

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
                placeholder="Buscar cliente…"
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
                <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Estado</div>
                <div className="grid grid-cols-2 gap-2">
                  {filterBtn("all", "Todos", roleClients.length, "bg-gray-900 text-white", "bg-gray-100 text-gray-600")}
                  {filterBtn("current", AGING.current.label, countCurrent, "bg-emerald-600 text-white", "bg-emerald-50 text-emerald-700")}
                  {filterBtn("watch", AGING.watch.label, countWatch, "bg-amber-500 text-white", "bg-amber-50 text-amber-700")}
                  {filterBtn("overdue", AGING.overdue.label, countOverdue, "bg-red-600 text-white", "bg-red-50 text-red-700")}
                </div>
              </div>
              {roleCompanies.length > 1 && (
                <div>
                  <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                    Empresa
                    <span className="ml-2 normal-case tracking-normal text-xs font-normal text-gray-400">Según permisos de tu rol</span>
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
              {filterBtn("current", AGING.current.label, countCurrent, "bg-emerald-600 text-white", "bg-emerald-50 text-emerald-700 hover:bg-emerald-100")}
              {filterBtn("watch", AGING.watch.label, countWatch, "bg-amber-500 text-white", "bg-amber-50 text-amber-700 hover:bg-amber-100")}
              {filterBtn("overdue", AGING.overdue.label, countOverdue, "bg-red-600 text-white", "bg-red-50 text-red-700 hover:bg-red-100")}
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
                placeholder="Buscar cliente, teléfono, email…"
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

      {/* Result count + orden activo — el texto describe el orden REAL de la
          tabla (píldora o clic en el título de una columna: son el mismo estado). */}
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs text-gray-400">
          {(search || riskFilter !== "all" || companyFilter !== "all") ? `${filtered.length} de ${roleClients.length} clientes` : `${filtered.length} clientes`}
          {" · ordenados por "}{etiquetaOrden(sortKey)}{sortDir === "asc" ? " (de menor a mayor)" : ""}
        </div>
      </div>

      {/* Client table */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        {/* Sticky sortable header */}
        {/* Desktop header — hidden on mobile since mobile uses card layout */}
        <div className="hidden sm:grid grid-cols-12 gap-2 px-4 py-2.5 bg-gray-50 border-b border-gray-200 text-xs font-medium text-gray-500 uppercase tracking-wide select-none">
          <div className="col-span-4 cursor-pointer hover:text-gray-900 transition" onClick={() => toggleSort("name")}>
            Cliente{sortArrow("name")}
          </div>
          <div className="col-span-2 text-right cursor-pointer hover:text-gray-900 transition" data-tooltip="Por vencer (0-90d) · clic para ordenar la lista sin filtrarla" onClick={() => toggleSort("current")}>
            0-90d{sortArrow("current")}
          </div>
          <div className="col-span-2 text-right cursor-pointer hover:text-gray-900 transition" data-tooltip="Vencido reciente (91-120d) · clic para ordenar la lista sin filtrarla" onClick={() => toggleSort("watch")}>
            91-120d{sortArrow("watch")}
          </div>
          <div className="col-span-2 text-right cursor-pointer hover:text-gray-900 transition font-semibold text-gray-600" data-tooltip="Vencido crítico (+120d) · clic para ordenar la lista sin filtrarla" onClick={() => toggleSort("overdue")}>
            121d+{sortArrow("overdue")}
          </div>
          <div className="col-span-2 text-right cursor-pointer hover:text-gray-900 transition" data-tooltip="Saldo total · clic para ordenar la lista sin filtrarla" onClick={() => toggleSort("total")}>
            Total{sortArrow("total")}
          </div>
        </div>

        {filtered.length === 0 && (
          <div className="px-4 py-12 text-center">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.5" className="mx-auto mb-3">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            {/* Una sola línea: "probá con otra búsqueda" no agrega nada a "Sin
                resultados" con el buscador lleno delante. */}
            <p className="text-sm text-gray-400">Sin resultados</p>
          </div>
        )}

        {positivos.map((client) => renderClientRow(client))}
      </div>

      {/* Saldo a favor (crédito): fuera de la lista de cobro principal */}
      {negativos.length > 0 && (
        <div className="mt-6">
          <h3 className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-2">
            Saldo a favor <span className="text-gray-400 font-normal normal-case">({negativos.length})</span>
          </h3>
          <div className="border border-blue-100 rounded-lg overflow-hidden">
            {negativos.map((client) => renderClientRow(client))}
          </div>
        </div>
      )}
    </>
  );
}

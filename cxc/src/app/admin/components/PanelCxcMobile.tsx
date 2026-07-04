"use client";

// Layout mobile-first del Panel CXC. Visible <md, gated por md:hidden.
// El layout desktop existente queda intacto detrás de hidden md:block en
// page.tsx. State filters (riskFilter, search, companyFilter) viven en el
// padre (AdminDashboardInner) y se pasan acá para que persistan al rotar
// entre breakpoints.
//
// Contacto: cada card tiene menú "···" con las MISMAS acciones que la tabla
// desktop (Ya contacté / WhatsApp / email / copiar mensaje) — pedido de Daniel
// 4-jul-2026 (antes se excluía a propósito). El desglose por empresa muestra
// total exacto + último pago, y "Ver facturas pendientes" enlaza a la ficha.

import { useMemo, useState, useEffect, useRef } from "react";
import Link from "next/link";
import type { ConsolidatedClient } from "@/lib/types";
import type { Company } from "@/lib/companies";
import SyncStatus from "@/components/shared/SyncStatus";
import OverflowMenu, { type OverflowMenuItem } from "@/components/ui/OverflowMenu";
import {
  SWITCH_ESTADOCUENTA_EMPRESA_KEYS,
  EMPRESA_KEY_TO_NAME,
} from "@/lib/empresa-mapping";
import { formatCompactCurrency } from "@/lib/ventas/format";
import { fmt } from "@/lib/format";

type RiskFilter = "all" | "current" | "watch" | "overdue";

// "Último pago $X · hace N días" por empresa, o "Sin pagos registrados".
function ultimoPagoLabel(fecha: string | null, monto: number | null): string {
  if (!fecha) return "Sin pagos registrados";
  const d = new Date(fecha + "T00:00:00");
  const days = Math.floor((new Date().getTime() - d.getTime()) / 86400000);
  const rel = days <= 0 ? "hoy" : days === 1 ? "ayer" : `hace ${days} días`;
  return monto != null ? `Último pago $${fmt(monto)} · ${rel}` : `Último pago · ${rel}`;
}

interface PanelCxcMobileProps {
  filtered: ConsolidatedClient[];
  roleClients: ConsolidatedClient[];
  cxcCompanies: Company[];
  search: string;
  setSearch: (v: string) => void;
  riskFilter: RiskFilter;
  setRiskFilter: (v: RiskFilter) => void;
  companyFilter: string;
  setCompanyFilter: (v: string) => void;
  favorites: Set<string>;
  onToggleFavorite: (name: string) => void;
  contactLog?: Record<string, { date: string; method: string }>;
  onQuickMarkContacted: (clientName: string, method: string) => void;
  onOpenEmail: (client: ConsolidatedClient) => void;
  onWhatsApp: (client: ConsolidatedClient) => void;
  onCopyMessage: (client: ConsolidatedClient) => void;
  canExport: boolean;
  onExportarCsv: () => void;
  empresaRestriction: string | null;
}

export default function PanelCxcMobile({
  filtered,
  roleClients,
  cxcCompanies,
  search,
  setSearch,
  riskFilter,
  setRiskFilter,
  companyFilter,
  setCompanyFilter,
  favorites,
  onToggleFavorite,
  onQuickMarkContacted,
  onOpenEmail,
  onWhatsApp,
  onCopyMessage,
  canExport,
  onExportarCsv,
  empresaRestriction,
}: PanelCxcMobileProps) {
  // Totales del resumen de buckets. roleClients aquí ya viene filtrado por
  // empresa (kpiClients en page.tsx): con "Todas" es el universo accesible,
  // con una empresa seleccionada son sólo los buckets de esa empresa. No usa
  // filtered porque los chips muestran "qué hay en cada bucket" sin el filtro
  // de riesgo/búsqueda aplicado.
  const totals = useMemo(() => {
    let total = 0, current = 0, watch = 0, overdue = 0;
    let cCount = 0, wCount = 0, oCount = 0;
    for (const c of roleClients) {
      total += c.total;
      current += c.current;
      watch += c.watch;
      overdue += c.overdue;
      if (c.overdue > 0) oCount++;
      else if (c.watch > 0) wCount++;
      else if (c.total !== 0) cCount++;
    }
    return { total, current, watch, overdue, cCount, wCount, oCount };
  }, [roleClients]);

  // Ordenamiento mobile: favorites primero, luego negativos al final, luego
  // por total desc. Independiente del sortKey/sortDir del desktop para que
  // el helper "ordenados por total" sea siempre cierto en mobile.
  const sortedMobile = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const aFav = favorites.has(a.nombre_normalized) ? 0 : 1;
      const bFav = favorites.has(b.nombre_normalized) ? 0 : 1;
      if (aFav !== bFav) return aFav - bFav;
      const aNeg = a.total < 0 ? 1 : 0;
      const bNeg = b.total < 0 ? 1 : 0;
      if (aNeg !== bNeg) return aNeg - bNeg;
      return b.total - a.total;
    });
  }, [filtered, favorites]);

  const [expandedName, setExpandedName] = useState<string | null>(null);

  // Mismo menú "···" que la tabla desktop (ClientTable.buildRowMenuItems).
  const buildRowMenuItems = (client: ConsolidatedClient): OverflowMenuItem[] => [
    { label: "Ya contacté · Llamada", onClick: () => onQuickMarkContacted(client.nombre_normalized, "llamada") },
    { label: "Ya contacté · Visita", onClick: () => onQuickMarkContacted(client.nombre_normalized, "visita") },
    { label: "WhatsApp", onClick: () => onWhatsApp(client) },
    { label: "Enviar email", onClick: () => onOpenEmail(client), disabled: !client.correo },
    { label: "Copiar mensaje", onClick: () => onCopyMessage(client) },
  ];

  return (
    <div className="md:hidden bg-gray-50">
      <div className="px-4 pt-4 pb-6 space-y-4">
        <MobileHeader
          canExport={canExport}
          onExportar={onExportarCsv}
        />

        <MobileHero total={totals.total} clientCount={roleClients.length} />

        <MobileAgingChips
          totals={{ current: totals.current, watch: totals.watch, overdue: totals.overdue }}
          counts={{ current: totals.cCount, watch: totals.wCount, overdue: totals.oCount }}
          active={riskFilter}
          onChange={setRiskFilter}
        />

        <MobileSearch value={search} onChange={setSearch} />

        <MobileEmpresaSelect
          value={companyFilter}
          onChange={setCompanyFilter}
          options={cxcCompanies}
          disabled={!!empresaRestriction}
        />

        <p className="text-xs text-gray-500">
          {sortedMobile.length} {sortedMobile.length === 1 ? "cliente" : "clientes"} · ordenados por total
        </p>

        {sortedMobile.length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-white px-4 py-8 text-center">
            <p className="text-sm text-gray-500">No hay clientes con estos filtros</p>
            {(search || riskFilter !== "all" || companyFilter !== "all") && (
              <button
                onClick={() => { setSearch(""); setRiskFilter("all"); if (!empresaRestriction) setCompanyFilter("all"); }}
                className="mt-2 text-xs font-medium text-teal-700 active:text-teal-900"
              >
                Limpiar filtros
              </button>
            )}
          </div>
        ) : (
          <ul className="space-y-2">
            {sortedMobile.map(client => {
              const isExpanded = expandedName === client.nombre_normalized;
              return (
                <li key={client.nombre_normalized}>
                  <MobileClientCard
                    client={client}
                    cxcCompanies={cxcCompanies}
                    isFavorite={favorites.has(client.nombre_normalized)}
                    onToggleFavorite={() => onToggleFavorite(client.nombre_normalized)}
                    isExpanded={isExpanded}
                    onToggle={() => setExpandedName(prev => prev === client.nombre_normalized ? null : client.nombre_normalized)}
                    actionsMenu={<OverflowMenu items={buildRowMenuItems(client)} ariaLabel={`Acciones de ${client.nombre_normalized}`} />}
                  />
                </li>
              );
            })}
          </ul>
        )}

        <p className="pt-4 text-center text-xs leading-relaxed text-gray-400">
          Política: 0-90d por vencer · 91-120d vencido reciente · +120d vencido crítico
        </p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Header — título + overflow menu (Cargar / Consolidado / Exportar)
// ─────────────────────────────────────────────────────────────────────────────

function MobileHeader({
  canExport,
  onExportar,
}: {
  canExport: boolean;
  onExportar: () => void;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setOpen(false); }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <header className="flex items-start justify-between gap-3">
      <div>
        <h1 className="font-display text-[22px] font-medium leading-tight tracking-tight text-gray-900">
          Panel CXC
        </h1>
        <SyncStatus
          tabla="estadocuenta"
          empresasEsperadas={SWITCH_ESTADOCUENTA_EMPRESA_KEYS}
          empresaLabels={EMPRESA_KEY_TO_NAME}
          className="mt-0.5"
        />
      </div>
      {canExport && (
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setOpen(o => !o)}
            aria-label="Acciones"
            aria-haspopup="menu"
            aria-expanded={open}
            className="grid h-11 w-11 place-items-center rounded-full text-gray-600 active:bg-gray-200"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/>
            </svg>
          </button>
          {open && (
            <div role="menu" className="absolute right-0 top-12 z-30 w-56 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg">
              <MenuItem label="Exportar CSV" onClick={() => { setOpen(false); onExportar(); }} />
            </div>
          )}
        </div>
      )}
    </header>
  );
}

function MenuItem({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="block w-full px-4 py-3 text-left text-sm text-gray-700 active:bg-gray-100"
    >
      {label}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Hero — total pendiente Stone-900
// ─────────────────────────────────────────────────────────────────────────────

function MobileHero({ total, clientCount }: { total: number; clientCount: number }) {
  return (
    <section className="rounded-xl bg-gray-900 px-5 py-4 text-white shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
        Total pendiente
      </p>
      <p className="mt-1 font-mono text-[36px] font-medium leading-none tracking-tight tabular-nums">
        {formatCompactCurrency(total)}
      </p>
      <p className="mt-2 text-xs text-gray-400">
        {clientCount} {clientCount === 1 ? "cliente" : "clientes"}
      </p>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Aging chips filtros — Por vencer / Vencido reciente / Vencido crítico
// (3 buckets de presentación; los 8 buckets de cxc_aging se siguen agregando
// abajo en el detalle del cliente y la barra muestra el wedge granular).
// ─────────────────────────────────────────────────────────────────────────────

const AGING_THEME = {
  current: {
    label: "Por vencer",
    border: "border-[#0F6E56]",
    text: "text-[#0F6E56]",
    bgActive: "bg-[#0F6E56]/10",
    borderActive: "border-[#0F6E56]",
  },
  watch: {
    label: "Vencido reciente",
    border: "border-[#B45309]",
    text: "text-[#B45309]",
    bgActive: "bg-[#B45309]/10",
    borderActive: "border-[#B45309]",
  },
  overdue: {
    label: "Vencido crítico",
    border: "border-[#A32D2D]",
    text: "text-[#A32D2D]",
    bgActive: "bg-[#A32D2D]/10",
    borderActive: "border-[#A32D2D]",
  },
} as const;

function MobileAgingChips({
  totals,
  counts,
  active,
  onChange,
}: {
  totals: { current: number; watch: number; overdue: number };
  counts: { current: number; watch: number; overdue: number };
  active: RiskFilter;
  onChange: (v: RiskFilter) => void;
}) {
  const items: { key: Exclude<RiskFilter, "all">; value: number; count: number }[] = [
    { key: "current", value: totals.current, count: counts.current },
    { key: "watch", value: totals.watch, count: counts.watch },
    { key: "overdue", value: totals.overdue, count: counts.overdue },
  ];

  return (
    <div className="grid grid-cols-3 gap-2">
      {items.map(({ key, value, count }) => {
        const theme = AGING_THEME[key];
        const isActive = active === key;
        const onClick = () => onChange(isActive ? "all" : key);
        return (
          <button
            key={key}
            type="button"
            onClick={onClick}
            aria-pressed={isActive}
            className={[
              "rounded-xl border-2 px-2.5 py-2.5 text-left transition min-h-[44px]",
              isActive ? `${theme.borderActive} ${theme.bgActive}` : "border-gray-200 bg-white",
            ].join(" ")}
          >
            <p className={`text-xs font-semibold uppercase tracking-wide ${theme.text}`}>
              {theme.label}
            </p>
            <p className={`mt-0.5 font-mono text-sm font-medium tabular-nums ${isActive ? theme.text : "text-gray-900"}`}>
              {formatCompactCurrency(value)}
            </p>
            <p className="mt-0.5 text-xs text-gray-500 tabular-nums">
              {count} {count === 1 ? "cliente" : "clientes"}
            </p>
          </button>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Search + dropdown empresa
// ─────────────────────────────────────────────────────────────────────────────

function MobileSearch({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="relative">
      <svg
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
        width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      >
        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
      <input
        type="search"
        inputMode="search"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="Buscar cliente, tel, email…"
        className="w-full rounded-lg border border-gray-200 bg-white py-2.5 pl-9 pr-3 text-base text-gray-900 placeholder:text-gray-400 focus:border-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-400"
      />
    </div>
  );
}

function MobileEmpresaSelect({
  value,
  onChange,
  options,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Company[];
  disabled: boolean;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        className="w-full appearance-none rounded-lg border border-gray-200 bg-white py-2.5 pl-3 pr-8 text-sm text-gray-900 focus:border-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-400 disabled:opacity-60"
      >
        <option value="all">Todas mis empresas</option>
        {options.map(o => (
          <option key={o.key} value={o.key}>{o.name}</option>
        ))}
      </select>
      <svg
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
        width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      >
        <polyline points="6 9 12 15 18 9"/>
      </svg>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Client card — closed + expanded
// ─────────────────────────────────────────────────────────────────────────────

function worstBucketBorder(client: ConsolidatedClient): string {
  if (client.total < 0) return "border-l-gray-400";
  if (client.overdue > 0) return "border-l-[#A32D2D]";
  if (client.watch > 0) return "border-l-[#B45309]";
  return "border-l-[#0F6E56]";
}

function MobileClientCard({
  client,
  cxcCompanies,
  isFavorite,
  onToggleFavorite,
  isExpanded,
  onToggle,
  actionsMenu,
}: {
  client: ConsolidatedClient;
  cxcCompanies: Company[];
  isFavorite: boolean;
  onToggleFavorite: () => void;
  isExpanded: boolean;
  onToggle: () => void;
  actionsMenu?: React.ReactNode;
}) {
  const borderLeft = worstBucketBorder(client);

  return (
    <article
      className={`overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm border-l-4 ${borderLeft}`}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggle(); } }}
        aria-expanded={isExpanded}
        className="block w-full cursor-pointer text-left active:bg-gray-50"
      >
        <div className="flex items-start justify-between gap-3 px-3 py-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span
                role="button"
                tabIndex={0}
                onClick={e => { e.stopPropagation(); onToggleFavorite(); }}
                onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); onToggleFavorite(); } }}
                aria-label={isFavorite ? "Quitar favorito" : "Marcar favorito"}
                className="shrink-0 cursor-pointer text-base leading-none"
              >
                {isFavorite ? <span className="text-amber-500">★</span> : <span className="text-gray-300">☆</span>}
              </span>
              <span className="truncate text-sm font-medium text-gray-900">
                {client.nombre_normalized}
              </span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="font-mono text-base font-semibold tabular-nums text-gray-900">
              {formatCompactCurrency(client.total)}
            </span>
            {actionsMenu && <span onClick={e => e.stopPropagation()}>{actionsMenu}</span>}
            <svg
              width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              className={`text-gray-400 transition-transform ${isExpanded ? "rotate-180" : ""}`}
            >
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </div>
        </div>

        <div className="flex gap-1.5 px-3 pb-3">
          <BucketChip variant="current" value={client.current} />
          <BucketChip variant="watch" value={client.watch} />
          <BucketChip variant="overdue" value={client.overdue} />
        </div>
      </div>

      {isExpanded && <MobileClientExpanded client={client} cxcCompanies={cxcCompanies} />}
    </article>
  );
}

function BucketChip({
  variant,
  value,
}: {
  variant: "current" | "watch" | "overdue";
  value: number;
}) {
  const theme = AGING_THEME[variant];
  const isZero = value === 0;
  return (
    <div
      className={[
        "flex-1 rounded-md border px-2 py-1 text-center",
        isZero ? "border-gray-200 bg-gray-50" : `${theme.border} ${theme.bgActive}`,
      ].join(" ")}
    >
      <p className={`font-mono text-xs font-medium tabular-nums ${isZero ? "text-gray-300" : theme.text}`}>
        {isZero ? "—" : formatCompactCurrency(value)}
      </p>
      <p className={`text-xs uppercase tracking-wide ${isZero ? "text-gray-300" : theme.text}`}>
        {theme.label}
      </p>
    </div>
  );
}

function MobileClientExpanded({
  client,
  cxcCompanies,
}: {
  client: ConsolidatedClient;
  cxcCompanies: Company[];
}) {
  // `companies[key].nombre` es el nombre del cliente registrado en esa
  // empresa (variante por empresa), NO el nombre de la empresa. El nombre
  // de la empresa se resuelve por key contra el array canónico cxcCompanies
  // (misma fuente que usa el desktop en page.tsx para email/export).
  const nameByKey = useMemo(() => {
    const m: Record<string, string> = {};
    for (const co of cxcCompanies) m[co.key] = co.name;
    return m;
  }, [cxcCompanies]);

  const rows = useMemo(() => {
    return Object.entries(client.companies)
      .filter(([, d]) => d.total !== 0)
      .map(([key, d]) => ({
        key,
        nombre: nameByKey[key] ?? key,
        total: d.total,
        current: d.d0_30 + d.d31_60 + d.d61_90,
        watch: d.d91_120,
        overdue: d.d121_180 + d.d181_270 + d.d271_365 + d.mas_365,
        ultimoPagoFecha: d.ultimoPagoFecha ?? null,
        ultimoPagoMonto: d.ultimoPagoMonto ?? null,
      }))
      .sort((a, b) => b.total - a.total);
  }, [client.companies, nameByKey]);

  // Código del cliente para enlazar a su ficha (misma fuente que el desktop).
  const codigo = useMemo(
    () => Object.values(client.companies).find(c => c?.codigo)?.codigo ?? null,
    [client.companies],
  );

  return (
    <div className="border-t border-gray-100 bg-gray-50 px-3 py-3">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
          Desglose por empresa ({rows.length})
        </p>
        <span className={`shrink-0 font-mono text-xs font-semibold tabular-nums ${client.total < 0 ? "text-gray-500" : "text-gray-900"}`}>
          ${fmt(client.total)}
        </span>
      </div>
      <ul className="divide-y divide-gray-200/70 overflow-hidden rounded-md bg-white">
        {rows.map(row => (
          <li key={row.key} className="px-3 py-2.5">
            <div className="flex items-center justify-between gap-3">
              <span className="truncate text-xs text-gray-700">{row.nombre}</span>
              <span className={`shrink-0 font-mono text-xs font-medium tabular-nums ${row.total < 0 ? "text-gray-500" : "text-gray-900"}`}>
                ${fmt(row.total)}
              </span>
            </div>
            <div className="mt-1.5 flex gap-1">
              <EmpresaBucketMini variant="current" value={row.current} />
              <EmpresaBucketMini variant="watch" value={row.watch} />
              <EmpresaBucketMini variant="overdue" value={row.overdue} />
            </div>
            <p className={`mt-1.5 text-xs ${row.ultimoPagoFecha ? "text-gray-500" : "text-gray-400"}`}>
              {ultimoPagoLabel(row.ultimoPagoFecha, row.ultimoPagoMonto)}
            </p>
          </li>
        ))}
      </ul>
      {codigo && (
        <Link
          href={`/clientes/${encodeURIComponent(codigo)}`}
          className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-blue-600 active:opacity-70"
        >
          Ver facturas pendientes
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
          </svg>
        </Link>
      )}
    </div>
  );
}

function EmpresaBucketMini({
  variant,
  value,
}: {
  variant: "current" | "watch" | "overdue";
  value: number;
}) {
  const theme = AGING_THEME[variant];
  const isZero = value === 0;
  return (
    <span
      className={`flex-1 rounded px-1.5 py-0.5 text-center font-mono text-xs tabular-nums ${theme.bgActive} ${theme.text}`}
      style={isZero ? { opacity: 0.4 } : undefined}
    >
      {isZero ? "—" : formatCompactCurrency(value)}
    </span>
  );
}

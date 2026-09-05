"use client";

// Layout mobile-first del Panel CXC. Visible <lg, gated por lg:hidden.
//
// 🩸 EL CORTE ERA `md` (768) Y EL iPAD VERTICAL CAÍA DEL LADO DE LA GRILLA.
// Medido a 834 con la barra lateral puesta (se lleva 224 px): la grilla de 12
// columnas le dejaba al nombre del cliente 133 px de los 270 que pide, o sea
// "GRUP MEL INTERNATIONAL SA(AGUAS)" al 49 %, y 11 controles por debajo de
// 44 px. Es el mismo corte mal puesto que ya se corrigió en Guías y en
// Reclamos: el ancho que decide no es el de la ventana, es el ÚTIL.
// El layout desktop existente queda intacto detrás de hidden md:block en
// page.tsx. State filters (riskFilter, search, companyFilter) viven en el
// padre (AdminDashboardInner) y se pasan acá para que persistan al rotar
// entre breakpoints.
//
// Contacto: cada card tiene menú "···" con las MISMAS acciones que la tabla
// desktop (estado de cuenta / WhatsApp / correo / copiar mensaje) — pedido de
// Daniel 4-jul-2026 (antes se excluía a propósito). El desglose por empresa
// muestra total exacto + último pago, y "Ver facturas pendientes" enlaza a la
// ficha.

import { useMemo, useState, useEffect, useRef } from "react";
import Link from "next/link";
import type { ConsolidatedClient } from "@/lib/types";
import type { Company } from "@/lib/companies";
import SyncStatus from "@/components/shared/SyncStatus";
import AvisoRechazosSwitch from "@/components/AvisoRechazosSwitch";
import SyncNowButton from "@/components/shared/SyncNowButton";
import OverflowMenu, { type OverflowMenuItem } from "@/components/ui/OverflowMenu";
import UltimosPagosFila from "./UltimosPagosFila";
import BotonUltimosPagos from "@/components/cxc/BotonUltimosPagos";
import {
  CXC_GRUPO_EMPRESA_KEYS,
  EMPRESA_KEY_TO_NAME,
} from "@/lib/empresa-mapping";
import { formatCompactCurrency } from "@/lib/ventas/format";
import { fmt } from "@/lib/format";
import {
  ordenParaRiskFilter,
  ordenarClientes,
  etiquetaOrden,
  type RiskFilter,
} from "@/lib/cxc-orden";
import { AGING, tramoLabel } from "@/lib/cxc-aging";

// "hoy" / "ayer" / "hace N días" — la forma relativa que ya usaba esta pantalla.
function haceCuanto(fecha: string): string {
  const d = new Date(fecha + "T00:00:00");
  const days = Math.floor((new Date().getTime() - d.getTime()) / 86400000);
  return days <= 0 ? "hoy" : days === 1 ? "ayer" : `hace ${days} días`;
}

// "Último pago $X · hace N días" por empresa, o "Sin pagos registrados".
// Sin pago NO se muestra $0.00: un recibo de $0 es una aplicación/cruce, no un
// pago, y decir "$0.00 hace 15 días" es justo el bug que Daniel cazó.
function ultimoPagoLabel(fecha: string | null, monto: number | null): string {
  if (!fecha) return "Sin pagos registrados";
  const rel = haceCuanto(fecha);
  return monto != null ? `Último pago $${fmt(monto)} · ${rel}` : `Último pago · ${rel}`;
}

// "Última compra $X · hace N días" — la última FACTURA, en el MISMO formato que
// el último pago. Sin factura registrada se dice, no se muestra $0 ni una fecha
// vacía.
function ultimaCompraLabel(fecha: string | null, monto: number | null): string {
  if (!fecha) return "Sin compras registradas";
  const rel = haceCuanto(fecha);
  return monto != null ? `Última compra $${fmt(monto)} · ${rel}` : `Última compra · ${rel}`;
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
  onOpenEmail: (client: ConsolidatedClient) => void;
  onWhatsApp: (client: ConsolidatedClient) => void;
  onCopyMessage: (client: ConsolidatedClient) => void;
  onOpenEstado: (client: ConsolidatedClient) => void;
  canExport: boolean;
  onExportarCsv: () => void;
  empresaRestriction: string | null;
  /** Reload de datos tras un "Actualizar ahora" exitoso. */
  onSyncedNow?: () => void;
  /** Lo que el guard dejó afuera de estos totales, ya redactado por el servidor. */
  avisoMontos?: string | null;
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
  onOpenEmail,
  onWhatsApp,
  onCopyMessage,
  onOpenEstado,
  canExport,
  onExportarCsv,
  empresaRestriction,
  onSyncedNow,
  avisoMontos,
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

  // Ordenamiento mobile: negativos al final, y después por el tramo del chip
  // encendido (de mayor a menor); sin chip, por total. Misma regla y mismo
  // comparador que el escritorio (lib/cxc-orden) — en móvil no hay títulos de
  // columna que tocar, así que el chip es el único que manda el orden.
  const orden = useMemo(() => ordenParaRiskFilter(riskFilter), [riskFilter]);
  const sortedMobile = useMemo(() => ordenarClientes(filtered, { orden }), [filtered, orden]);

  const [expandedName, setExpandedName] = useState<string | null>(null);
  // Qué cliente tiene abierto su bloque «Últimos pagos» — INDEPENDIENTE de la
  // tarjeta expandida, uno a la vez, igual que el escritorio y que Boston.
  // Daniel (4-sep-2026), textual: *"un botón para expandir, no solo al
  // expandir el card, tendría que hacer dos expandir para verlo"*.
  const [pagosAbiertos, setPagosAbiertos] = useState<string | null>(null);

  // Mismo menú "···" que la tabla del escritorio (ClientTable.buildRowMenuItems):
  // las MISMAS 4 opciones, con las MISMAS palabras y en el MISMO orden. Las dos
  // "Ya contacté" se retiraron el 14-ago-2026 junto con el seguimiento de cobro,
  // y "Enviar email" pasó a "Enviar correo" el mismo día — ver el comentario
  // largo en ClientTable.
  const buildRowMenuItems = (client: ConsolidatedClient): OverflowMenuItem[] => [
    { label: "Estado de cuenta", onClick: () => onOpenEstado(client) },
    { label: "WhatsApp", onClick: () => onWhatsApp(client) },
    { label: "Enviar correo", onClick: () => onOpenEmail(client) },
    { label: "Copiar mensaje", onClick: () => onCopyMessage(client) },
  ];

  return (
    <div className="lg:hidden bg-gray-50">
      <div className="px-4 pt-4 pb-6 space-y-4">
        <MobileHeader
          canExport={canExport}
          onExportar={onExportarCsv}
          companyFilter={companyFilter}
          onSyncedNow={onSyncedNow}
        />

        {/* Qué se quedó AFUERA del total. Va ARRIBA del número —Daniel:
            *"sigue diciendo $198.296,55 y arriba aparece…"*— y en el celular
            eso importa el doble: es lo único que se ve sin bajar. */}
        <AvisoRechazosSwitch texto={avisoMontos} />

        <MobileHero total={totals.total} />

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
          {sortedMobile.length} {sortedMobile.length === 1 ? "cliente" : "clientes"} · ordenados por {etiquetaOrden(orden.key)}
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
                    isExpanded={isExpanded}
                    onToggle={() => setExpandedName(prev => prev === client.nombre_normalized ? null : client.nombre_normalized)}
                    pagosAbiertos={pagosAbiertos === client.nombre_normalized}
                    onTogglePagos={() => setPagosAbiertos(prev => prev === client.nombre_normalized ? null : client.nombre_normalized)}
                    onOpenEstado={() => onOpenEstado(client)}
                    actionsMenu={<OverflowMenu items={buildRowMenuItems(client)} ariaLabel={`Acciones de ${client.nombre_normalized}`} />}
                  />
                </li>
              );
            })}
          </ul>
        )}
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
  companyFilter,
  onSyncedNow,
}: {
  canExport: boolean;
  onExportar: () => void;
  companyFilter: string;
  onSyncedNow?: () => void;
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
        {/* Sin título grande, igual que el CXC de escritorio (pedido de
            Daniel): "Cuentas por Cobrar" ya lo dice la barra sticky, que en
            celular es lo único que queda en pantalla al hacer scroll. Queda
            sr-only para no dejar la página sin encabezado. */}
        <h1 className="sr-only">Cuentas por Cobrar</h1>
        <SyncStatus
          tabla="estadocuenta"
          empresasEsperadas={CXC_GRUPO_EMPRESA_KEYS}
          empresaLabels={EMPRESA_KEY_TO_NAME}
        />
        {/* "Actualizar ahora" (admin/secretaria) — estadocuenta de la empresa
            del filtro; con "Todas" queda deshabilitado. */}
        <SyncNowButton
          className="mt-2"
          opciones={[{ modulo: "estadocuenta", empresa: companyFilter }]}
          disabledReason={companyFilter === "all" ? "Elige una empresa en el filtro para actualizarla" : null}
          onSuccess={() => onSyncedNow?.()}
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

// El conteo de clientes NO vive acá: unos centímetros más abajo, arriba de la
// lista, está el MISMO número y encima sabe de los filtros. Verlo dos veces era
// leerlo dos veces y creerle a uno de los dos.
function MobileHero({ total }: { total: number }) {
  return (
    <section className="rounded-xl bg-gray-900 px-5 py-4 text-white shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
        Total pendiente
      </p>
      <p className="mt-1 font-mono text-[36px] font-medium leading-none tracking-tight tabular-nums">
        {formatCompactCurrency(total)}
      </p>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Aging chips filtros — los MISMOS tres tramos, con el MISMO nombre que el
// escritorio y el papel (3 buckets de presentación; los 8 buckets de cxc_aging
// se siguen agregando abajo en el detalle del cliente y la barra muestra el
// wedge granular).
//
// 🩸 ACÁ VIVÍA UNA SEGUNDA LISTA DE NOMBRES ("Por vencer" / "Vencido reciente"
// / "Vencido crítico") escrita a mano, mientras el escritorio rotulaba las
// MISMAS píldoras con el rango a secas ("0-90d"). Era el mismo botón con dos
// nombres, y dos listas que nadie podía mantener iguales. Los nombres ahora
// salen de `cxc-aging`; lo único propio del celular son sus colores, que sí son
// de esta pantalla (hexadecimales, no las clases de Tailwind del escritorio).
// ─────────────────────────────────────────────────────────────────────────────

const AGING_THEME = {
  current: {
    border: "border-[#0F6E56]",
    text: "text-[#0F6E56]",
    bgActive: "bg-[#0F6E56]/10",
    borderActive: "border-[#0F6E56]",
  },
  watch: {
    border: "border-[#B45309]",
    text: "text-[#B45309]",
    bgActive: "bg-[#B45309]/10",
    borderActive: "border-[#B45309]",
  },
  overdue: {
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
        // Una sola acción: filtra a los clientes de ese tramo Y los ordena por lo
        // que deben ahí. El apagar/prender lo resuelve el padre (cxc-orden).
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            aria-pressed={isActive}
            className={[
              "rounded-xl border-2 px-2.5 py-2.5 text-left transition min-h-[44px] active:scale-[0.97]",
              isActive ? `${theme.borderActive} ${theme.bgActive}` : "border-gray-300 bg-white",
            ].join(" ")}
          >
            {/* Nombre y rango en dos renglones. A 390 px cada tarjeta mide
                ~118 px: "Vencido reciente 91-120d" en una línea no entra, y
                partir el rango a la mitad sería peor que no ponerlo. El
                `title` lleva el nombre completo, el mismo que dicen el
                escritorio y el papel. */}
            <p className={`text-xs font-semibold uppercase tracking-wide ${theme.text}`} title={tramoLabel(key)}>
              {AGING[key].label}
            </p>
            <p className="mt-0.5 font-mono text-xs tabular-nums text-gray-500">
              {AGING[key].colLabel}
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
        placeholder="Buscar cliente, teléfono, email…"
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
        className="w-full appearance-none rounded-lg border border-gray-200 bg-white min-h-[44px] pl-3 pr-8 text-sm text-gray-900 focus:border-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-400 disabled:opacity-60"
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
  isExpanded,
  onToggle,
  pagosAbiertos,
  onTogglePagos,
  onOpenEstado,
  actionsMenu,
}: {
  client: ConsolidatedClient;
  cxcCompanies: Company[];
  isExpanded: boolean;
  onToggle: () => void;
  /** El bloque «Últimos pagos» de ESTA tarjeta está abierto (sin expandirla). */
  pagosAbiertos: boolean;
  onTogglePagos: () => void;
  onOpenEstado: () => void;
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
        <div className="flex items-start justify-between gap-2 px-3 py-3">
          <div className="min-w-0 flex-1">
            {/* 🩸 Acá vivía la estrella ⭐ (44x44, con su `-ml-3` para que no
                le comiera ancho al nombre). Se fue el 4-sep-2026 con el resto de
                los favoritos: `cxc_favorites` nunca tuvo una fila. El nombre se
                queda con esos 44 px. */}
            <div className="flex items-center gap-0">
              {/* 12px es el PISO de legibilidad y no se baja de ahí. Lo que
                  faltaba para que los nombres largos entren se sacó de la
                  DERECHA (chevron fuera, gaps al mínimo, "···" metido en el
                  padding) y de `tracking-tight`, que aprieta el interletrado
                  sin tocar el cuerpo de la letra. */}
              <span className="truncate text-[12px] font-medium leading-5 tracking-tight text-gray-900">
                {client.nombre_normalized}
              </span>
            </div>
          </div>
          {/* El chevron se eliminó: TODA la fila abre/cierra la card, así que la
              flecha no era una acción sino un adorno — y costaba 22px (14 del
              ícono + 8 del gap) del ancho del nombre. El estado abierto ya se ve
              por el panel desplegado. El "···" conserva sus 44x44 y se mete en
              el padding con `-mr-3`, espejo del `-ml-3` de la estrella. */}
          <div className="flex shrink-0 items-center gap-1">
            <span className="font-mono text-base font-semibold tabular-nums text-gray-900">
              {formatCompactCurrency(client.total)}
            </span>
            {actionsMenu && <span className="-mr-3" onClick={e => e.stopPropagation()}>{actionsMenu}</span>}
          </div>
        </div>

        <div className="flex gap-1.5 px-3 pb-3">
          <BucketChip variant="current" value={client.current} />
          <BucketChip variant="watch" value={client.watch} />
          <BucketChip variant="overdue" value={client.overdue} />
        </div>

        {/* «Últimos pagos ›» en la tarjeta CERRADA, como en la de Boston: un
            toque abre los 3 pagos por empresa SIN expandir el cliente. El
            botón mide 44 px de alto táctil; `-mt-3 -mb-2` para que la tarjeta
            no crezca 44 px por él. El propio botón frena el toque. */}
        <div className="px-3 -mt-3 -mb-2">
          <BotonUltimosPagos abierto={pagosAbiertos} onToggle={onTogglePagos} nombre={client.nombre_normalized} />
        </div>
      </div>

      {/* El ÚNICO lugar del celular donde se dibujan los últimos pagos. Va
          ANTES del panel expandido para que se lea pegado a su botón. Se monta
          solo abierto, así que la lectura se dispara recién al toque. */}
      {pagosAbiertos && (
        <div className="border-t border-gray-100 bg-gray-50 px-3 py-2.5">
          <UltimosPagosFila client={client} companyFilter="all" roleCompanies={cxcCompanies} abierto apilado />
        </div>
      )}

      {isExpanded && <MobileClientExpanded client={client} cxcCompanies={cxcCompanies} onOpenEstado={onOpenEstado} />}
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
      {/* Desglose por tramo DENTRO de la fila de un cliente: acá van los tres
          en 3 columnas de ~100 px, así que se dice el nombre y el rango va en
          el `title`. Los dos salen de `cxc-aging`, la misma lista que rotula
          los botones de filtro, el escritorio y el papel. */}
      <p
        className={`text-xs uppercase tracking-wide ${isZero ? "text-gray-300" : theme.text}`}
        title={tramoLabel(variant)}
      >
        {AGING[variant].label}
      </p>
    </div>
  );
}

function MobileClientExpanded({
  client,
  cxcCompanies,
  onOpenEstado,
}: {
  client: ConsolidatedClient;
  cxcCompanies: Company[];
  onOpenEstado: () => void;
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
        ultimaCompraFecha: d.ultimaCompraFecha ?? null,
        ultimaCompraMonto: d.ultimaCompraMonto ?? null,
      }))
      .sort((a, b) => b.total - a.total);
  }, [client.companies, nameByKey]);

  // Código del cliente para enlazar a su ficha (misma fuente que el desktop).
  const codigo = useMemo(
    () => Object.values(client.companies).find(c => c?.codigo)?.codigo ?? null,
    [client.companies],
  );

  // 🔴 ACÁ VIVIÓ EL BLOQUE «ÚLTIMOS PAGOS» UN DÍA (3-sep → 4-sep-2026), adentro
  // de la tarjeta de cada empresa. Se mudó al botón de la tarjeta CERRADA
  // (`UltimosPagosFila`, montada por `MobileClientCard`): Daniel no quería
  // "dos expandir para verlo". Un solo lugar; acá no se repite.

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
            {/* Crece hacia ABAJO, no a lo ancho: en 390 px una segunda columna
                empujaría la tarjeta y traería arrastre horizontal. */}
            <p className={`mt-0.5 text-xs ${row.ultimaCompraFecha ? "text-gray-500" : "text-gray-400"}`}>
              {ultimaCompraLabel(row.ultimaCompraFecha, row.ultimaCompraMonto)}
            </p>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={onOpenEstado}
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-md bg-black px-3 text-xs font-medium text-white active:scale-[0.97]"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/>
          </svg>
          Estado de cuenta
        </button>
        {codigo && (
          <Link
            href={`/clientes/${encodeURIComponent(codigo)}`}
            // 163×18 medidos: el enlace está DENTRO de la fila expandida, que la
            // primera vuelta no abrió. `-my-3` devuelve el aire que suma el alto
            // táctil para que no separe el bloque de botones de arriba.
            className="inline-flex items-center gap-1 min-h-[44px] -my-3 text-xs font-medium text-blue-600 active:opacity-70"
          >
            Ver facturas pendientes
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
            </svg>
          </Link>
        )}
      </div>
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

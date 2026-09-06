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
import UltimosPagosPorFecha from "./UltimosPagosPorFecha";
import { useUltimosPagosGrupo } from "../hooks/useUltimosPagosGrupo";
import {
  CXC_GRUPO_EMPRESA_KEYS,
  EMPRESA_KEY_TO_NAME,
} from "@/lib/empresa-mapping";
import { formatCompactCurrency } from "@/lib/ventas/format";
import { fmt } from "@/lib/format";
import {
  ordenParaRiskFilter,
  ordenarClientes,
  type RiskFilter,
} from "@/lib/cxc-orden";
import { rotuloSinPagar } from "@/lib/cxc/sin-pagar";
import { AGING, tramoLabel } from "@/lib/cxc-aging";

// 🩸 Acá vivían `haceCuanto`, `ultimoPagoLabel` y `ultimaCompraLabel`: las tres
// líneas de texto que llevaba CADA empresa dentro de la tarjeta abierta. Con
// seis empresas eran 12 renglones de prosa. Esa información se dice ahora en el
// bloque «Últimos pagos» agrupado POR FECHA, que la resume en 3 líneas.

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
  onOpenEstado: (client: ConsolidatedClient) => void;
  /** Abre la hoja «Cobrar» — en celular sube desde abajo (BottomSheet). */
  onCobrar: (client: ConsolidatedClient) => void;
  /** El aviso «N sin pagar hace +90 d», dentro de la tarjeta negra. */
  sinPagar: { cuantos: number; monto: number } | null;
  sinPagarActivo: boolean;
  onToggleSinPagar: () => void;
  /** «no paga hace 298 d» de una tarjeta — solo con el filtro encendido. */
  avisoSinPagarDe: (client: ConsolidatedClient) => string | null;
  /** «Le enviaste el estado de cuenta hace 3 días», o `null`. */
  marcaEnvioDe: (client: ConsolidatedClient) => string | null;
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
  onOpenEstado,
  onCobrar,
  sinPagar,
  sinPagarActivo,
  onToggleSinPagar,
  avisoSinPagarDe,
  marcaEnvioDe,
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

  // 🩸 ACÁ VIVÍAN EL MENÚ "···" DE CADA TARJETA Y EL BOTÓN «Últimos pagos ›»
  // (5-sep-2026). El "···" repetía las mismas 4 acciones que el escritorio
  // —dos listas escritas a mano que había que mantener iguales— y le comía
  // ancho al nombre del cliente, que estaba en 12 px, el piso de legibilidad
  // del sistema. Las cuatro salidas viven ahora en la hoja «Cobrar», que en
  // celular sube desde abajo; el nombre se queda con ese ancho y sube a 14 px.
  // El botón de últimos pagos se fue con su bloque por empresa: los pagos ahora
  // se agrupan POR FECHA dentro de la tarjeta abierta.

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

        {/* 🔴 LOS TRAMOS ENTRAN DENTRO DE LA TARJETA NEGRA (5-sep-2026): eran
            tres tarjetas grandes de cuatro renglones cada una debajo del total,
            y entre el total y el primer cliente había que pasar por ellas. Ahora
            son tres chips adentro de la misma tarjeta, con el rango corto, el
            monto compacto y el conteo. Siguen FILTRANDO al tocarlos, con el
            mismo toggle de siempre. Y el aviso «sin pagar hace +90 d» es una
            línea más de esa tarjeta, también tocable. */}
        <MobileHero
          total={totals.total}
          totals={{ current: totals.current, watch: totals.watch, overdue: totals.overdue }}
          counts={{ current: totals.cCount, watch: totals.wCount, overdue: totals.oCount }}
          active={riskFilter}
          onChange={setRiskFilter}
          sinPagar={sinPagar}
          sinPagarActivo={sinPagarActivo}
          onToggleSinPagar={onToggleSinPagar}
        />

        {/* Buscador y empresa en UNA fila: eran dos renglones enteros para dos
            controles que se usan juntos. */}
        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <MobileSearch value={search} onChange={setSearch} />
          </div>
          <div className="w-[9.5rem] shrink-0">
            <MobileEmpresaSelect
              value={companyFilter}
              onChange={setCompanyFilter}
              options={cxcCompanies}
              disabled={!!empresaRestriction}
            />
          </div>
        </div>

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
                    onOpenEstado={() => onOpenEstado(client)}
                    onCobrar={() => onCobrar(client)}
                    avisoSinPagar={avisoSinPagarDe(client)}
                    marcaEnvio={marcaEnvioDe(client)}
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
              <MenuItem label="Descargar CSV" onClick={() => { setOpen(false); onExportar(); }} />
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

// ─────────────────────────────────────────────────────────────────────────────
// Los colores del celular. Son propios de esta pantalla (hexadecimales, no las
// clases de Tailwind del escritorio); los NOMBRES y los RANGOS salen de
// `cxc-aging`, que es la única lista — acá vivió una copia escrita a mano y era
// el mismo botón con dos nombres.
//
// `punto` y `chipActivo` son los del chip DENTRO de la tarjeta negra (fondo
// oscuro): sobre negro, un `bg-emerald-50` no se ve.
// ─────────────────────────────────────────────────────────────────────────────
const AGING_THEME = {
  current: {
    border: "border-[#0F6E56]",
    text: "text-[#0F6E56]",
    bgActive: "bg-[#0F6E56]/10",
    borderActive: "border-[#0F6E56]",
    punto: "bg-emerald-400",
    chipActivo: "bg-emerald-500/25",
  },
  watch: {
    border: "border-[#B45309]",
    text: "text-[#B45309]",
    bgActive: "bg-[#B45309]/10",
    borderActive: "border-[#B45309]",
    punto: "bg-amber-400",
    chipActivo: "bg-amber-500/25",
  },
  overdue: {
    border: "border-[#A32D2D]",
    text: "text-[#A32D2D]",
    bgActive: "bg-[#A32D2D]/10",
    borderActive: "border-[#A32D2D]",
    punto: "bg-red-400",
    chipActivo: "bg-red-500/25",
  },
} as const;

// La tarjeta negra: el total, los tres tramos y el aviso de los que no pagan.
// Los tres chips FILTRAN igual que antes (y con el mismo toggle del padre); lo
// que cambió es dónde viven — adentro del total, no en tres tarjetas grandes
// debajo de él.
function MobileHero({
  total,
  totals,
  counts,
  active,
  onChange,
  sinPagar,
  sinPagarActivo,
  onToggleSinPagar,
}: {
  total: number;
  totals: { current: number; watch: number; overdue: number };
  counts: { current: number; watch: number; overdue: number };
  active: RiskFilter;
  onChange: (v: RiskFilter) => void;
  sinPagar: { cuantos: number; monto: number } | null;
  sinPagarActivo: boolean;
  onToggleSinPagar: () => void;
}) {
  const items: { key: Exclude<RiskFilter, "all">; value: number; count: number }[] = [
    { key: "current", value: totals.current, count: counts.current },
    { key: "watch", value: totals.watch, count: counts.watch },
    { key: "overdue", value: totals.overdue, count: counts.overdue },
  ];
  const hayAviso = !!sinPagar && sinPagar.cuantos > 0;

  return (
    <section className="rounded-xl bg-gray-900 px-4 py-4 text-white shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
        Total pendiente
      </p>
      <p className="mt-1 font-mono text-[36px] font-medium leading-none tracking-tight tabular-nums">
        {formatCompactCurrency(total)}
      </p>

      <div className="mt-3 grid grid-cols-3 gap-2">
        {items.map(({ key, value, count }) => {
          const theme = AGING_THEME[key];
          const activo = active === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onChange(key)}
              aria-pressed={activo}
              title={tramoLabel(key)}
              className={[
                "rounded-lg px-2 py-2 text-left transition min-h-[44px] active:scale-[0.97] border",
                activo ? `${theme.chipActivo} border-white/60` : "border-white/15 bg-white/5",
              ].join(" ")}
            >
              <span className="flex items-center gap-1 font-mono text-[11px] tabular-nums text-gray-300">
                <span className={`inline-block w-1.5 h-1.5 rounded-full ${theme.punto}`} />
                {AGING[key].colLabel}
              </span>
              <span className="mt-0.5 block font-mono text-sm font-medium tabular-nums text-white">
                {formatCompactCurrency(value)}
              </span>
              <span className="block text-[11px] tabular-nums text-gray-400">{count}</span>
            </button>
          );
        })}
      </div>

      {/* El aviso «sin pagar hace +90 d» es UNA línea más de esta tarjeta, no
          un bloque aparte. Toca y filtra, igual que los tres chips. */}
      {hayAviso && sinPagar && (
        <button
          type="button"
          onClick={onToggleSinPagar}
          aria-pressed={sinPagarActivo}
          className={[
            "mt-2 flex w-full items-center justify-between gap-2 rounded-lg px-2 py-2 min-h-[44px] text-left transition active:scale-[0.97] border",
            sinPagarActivo ? "border-red-300 bg-red-500/25" : "border-white/15 bg-white/5",
          ].join(" ")}
        >
          <span className="text-xs font-medium text-red-200">
            {rotuloSinPagar(sinPagar.cuantos)}
          </span>
          <span className="font-mono text-xs font-semibold tabular-nums text-red-100">
            {formatCompactCurrency(sinPagar.monto)}
          </span>
        </button>
      )}
    </section>
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
  onOpenEstado,
  onCobrar,
  avisoSinPagar,
  marcaEnvio,
}: {
  client: ConsolidatedClient;
  cxcCompanies: Company[];
  isExpanded: boolean;
  onToggle: () => void;
  onOpenEstado: () => void;
  onCobrar: () => void;
  /** «no paga hace 298 d» — solo con el filtro encendido. */
  avisoSinPagar: string | null;
  /** «Le enviaste el estado de cuenta hace 3 días», o `null`. */
  marcaEnvio: string | null;
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
            {/* 🔴 EL NOMBRE SUBE DE 12 A 14 px (5-sep-2026). Estaba en 12, el
                PISO de legibilidad del sistema, porque el "···" y el monto le
                comían el ancho: la estrella se fue el 4-sep y el "···" el 5, y
                ese ancho vuelve donde tiene que estar. `tracking-tight` se
                queda: aprieta el interletrado sin achicar la letra. */}
            <span className="block truncate text-[14px] font-medium leading-5 tracking-tight text-gray-900">
              {client.nombre_normalized}
            </span>
            {avisoSinPagar && (
              <span className="block text-[11px] text-gray-500">{avisoSinPagar}</span>
            )}
            {marcaEnvio && (
              <span className="block text-[11px] text-gray-400">{marcaEnvio}</span>
            )}
          </div>
          {/* El chevron se eliminó: TODA la fila abre/cierra la card, así que la
              flecha no era una acción sino un adorno — y costaba 22px del ancho
              del nombre. El estado abierto ya se ve por el panel desplegado. */}
          <span className="shrink-0 font-mono text-base font-semibold tabular-nums text-gray-900">
            {formatCompactCurrency(client.total)}
          </span>
        </div>

        <div className="flex gap-1.5 px-3 pb-2">
          <BucketChip variant="current" value={client.current} />
          <BucketChip variant="watch" value={client.watch} />
          <BucketChip variant="overdue" value={client.overdue} />
        </div>
      </div>

      {/* Tarjeta CERRADA: los dos botones que se usan. «Cobrar» abre la hoja de
          las cuatro salidas; «Ver detalle» expande la tarjeta. */}
      <div className="flex gap-2 px-3 pb-3">
        <button
          type="button"
          onClick={e => { e.stopPropagation(); onCobrar(); }}
          className="flex-1 inline-flex min-h-[44px] items-center justify-center rounded-md bg-black px-3 text-xs font-medium text-white active:scale-[0.97]"
        >
          Cobrar
        </button>
        <button
          type="button"
          onClick={e => { e.stopPropagation(); onToggle(); }}
          className="flex-1 inline-flex min-h-[44px] items-center justify-center rounded-md border border-gray-300 px-3 text-xs font-medium text-gray-700 active:scale-[0.97]"
        >
          {isExpanded ? "Ocultar detalle" : "Ver detalle"}
        </button>
      </div>

      {isExpanded && (
        <MobileClientExpanded
          client={client}
          cxcCompanies={cxcCompanies}
          onOpenEstado={onOpenEstado}
          onCobrar={onCobrar}
        />
      )}
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
  onCobrar,
}: {
  client: ConsolidatedClient;
  cxcCompanies: Company[];
  onOpenEstado: () => void;
  onCobrar: () => void;
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
      }))
      .sort((a, b) => b.total - a.total);
  }, [client.companies, nameByKey]);

  // Código del cliente para la ficha y para pedir sus pagos.
  const codigo = useMemo(
    () => Object.values(client.companies).find(c => c?.codigo)?.codigo ?? null,
    [client.companies],
  );
  const pagos = useUltimosPagosGrupo(codigo, true);

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
      {/* 🩸 Cada empresa llevaba DOS renglones de texto más («Último pago $X ·
          hace N días» y «Última compra …»): con seis empresas eran 24 líneas de
          desglose, y encima los últimos pagos vivían en OTRO botón con 18 líneas
          más. Esa información está ahora en el bloque «Últimos pagos» de acá
          abajo, agrupada POR FECHA: 3 líneas para lo que ocupaba 42. */}
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
          </li>
        ))}
      </ul>

      <div className="mt-3">
        <UltimosPagosPorFecha pagos={pagos} />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onCobrar}
          className="inline-flex min-h-[44px] items-center rounded-md bg-black px-3 text-xs font-medium text-white active:scale-[0.97]"
        >
          Cobrar
        </button>
        <button
          type="button"
          onClick={onOpenEstado}
          className="inline-flex min-h-[44px] items-center rounded-md border border-gray-300 bg-white px-3 text-xs font-medium text-gray-700 active:scale-[0.97]"
        >
          Documentos
        </button>
        {codigo && (
          <Link
            href={`/clientes/${encodeURIComponent(codigo)}`}
            className="inline-flex items-center gap-1 min-h-[44px] text-xs font-medium text-blue-600 active:opacity-70"
          >
            Ficha
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

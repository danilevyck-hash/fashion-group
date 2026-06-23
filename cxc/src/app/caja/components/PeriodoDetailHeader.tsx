"use client";

import { fmt, fmtDate } from "@/lib/format";
import { CajaPeriodo } from "./types";
import OverflowMenu, { OverflowMenuItem } from "@/components/ui/OverflowMenu";

interface Props {
  current: CajaPeriodo;
  totalGastado: number;
  saldo: number;
  pctUsed: number;
  onBack: () => void;
  onClosePeriodo?: () => void;
  onPrint?: () => void;
  onExportExcel?: () => void;
  onAprobarReposicion?: (id: string) => void;
  /** Count shown beside the "Ver gastos eliminados" menu entry. */
  deletedCount?: number;
  /** When provided and deletedCount > 0, the menu entry appears. */
  onViewDeleted?: () => void;
  /** Si la SuggestionCard de "cerrar período" está visible, ocultamos el texto
   *  pasivo "N días abierto" para no duplicar el dato. Si se descarta, reaparece. */
  suggestionVisible?: boolean;
}

function fmtRepuestoDate(iso: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso)
      .toLocaleDateString("es-PA", { day: "numeric", month: "short", year: "numeric" })
      .replace(".", "");
  } catch {
    return "";
  }
}

function StatusPill({ open, fechaCierre }: { open: boolean; fechaCierre: string | null }) {
  if (open) {
    return (
      <span
        className="inline-flex items-center gap-1.5 text-[12px] font-medium px-2.5 py-0.5 rounded-full"
        style={{
          background: "var(--caja-success-soft)",
          color: "var(--caja-success-onSoft)",
          border: "1px solid var(--caja-success-border)",
        }}
      >
        <span
          className="inline-block w-1.5 h-1.5 rounded-full"
          style={{ background: "var(--caja-success)" }}
        />
        Abierto
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center text-[12px] font-medium px-2.5 py-0.5 rounded-full"
      style={{
        background: "var(--caja-stone-100)",
        color: "var(--caja-stone-600)",
        border: "1px solid var(--caja-stone-200)",
      }}
    >
      Cerrado{fechaCierre ? ` — ${fmtDate(fechaCierre)}` : ""}
    </span>
  );
}

function PrintIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <path d="M14 2v6h6" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  );
}

function CheckIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function Kpi({
  label,
  value,
  sub,
  highlight,
  dim,
}: {
  label: string;
  value: number;
  sub?: string;
  highlight?: boolean;
  dim?: boolean;
}) {
  const valueColor = highlight
    ? "var(--caja-accent)"
    : dim
      ? "var(--caja-fg-default)"
      : "var(--caja-fg-strong)";
  const prefixColor = highlight ? "var(--caja-accent)" : "var(--caja-fg-muted)";
  return (
    <div>
      <div className="caja-eyebrow mb-2.5">{label}</div>
      <div
        style={{
          fontFamily: "var(--caja-font-display)",
          fontWeight: 600,
          fontSize: 36,
          lineHeight: 1,
          color: valueColor,
          letterSpacing: "-0.02em",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        <span
          style={{
            fontSize: 22,
            fontWeight: 500,
            marginRight: 2,
            color: prefixColor,
          }}
        >
          $
        </span>
        <span
          className="caja-mono"
          style={{
            fontSize: 36,
            fontWeight: 500,
            letterSpacing: "-0.02em",
            color: "inherit",
          }}
        >
          {value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
      </div>
      {sub && (
        <div
          className="text-xs mt-2"
          style={{ color: "var(--caja-fg-muted)" }}
        >
          {sub}
        </div>
      )}
    </div>
  );
}

export default function PeriodoDetailHeader({
  current,
  totalGastado,
  saldo,
  pctUsed,
  onBack,
  onClosePeriodo,
  onPrint,
  onExportExcel,
  onAprobarReposicion,
  deletedCount,
  onViewDeleted,
  suggestionVisible,
}: Props) {
  const isOpen = current.estado === "abierto";
  const fondoInicial = current.fondo_inicial;

  const daysSinceOpen = isOpen
    ? Math.floor((Date.now() - new Date(current.fecha_apertura).getTime()) / (24 * 60 * 60 * 1000))
    : 0;

  // Responsable a NIVEL PERÍODO (derivado de los gastos): aparece una sola vez
  // en el encabezado en lugar de repetirse por gasto. El dato por gasto se
  // sigue guardando en DB.
  const responsablesPeriodo = [
    ...new Set((current.caja_gastos || []).map((g) => (g.responsable || "").trim()).filter(Boolean)),
  ];
  const responsableLabel =
    responsablesPeriodo.length === 0
      ? null
      : responsablesPeriodo.length === 1
        ? responsablesPeriodo[0]
        : `${responsablesPeriodo[0]} +${responsablesPeriodo.length - 1}`;

  // Used percentage (0 → 100). pctUsed (passed in) is the *remaining* percentage.
  const pctSpent = fondoInicial > 0 ? (totalGastado / fondoInicial) * 100 : 0;
  const barWidth = Math.min(100, Math.max(0, pctSpent));
  const barColor =
    pctSpent >= 95
      ? "var(--caja-danger)"
      : pctSpent >= 80
        ? "var(--caja-warning)"
        : "var(--caja-success)";

  const menuItems: OverflowMenuItem[] = [
    ...(onPrint ? [{ label: "Imprimir", onClick: onPrint }] : []),
    ...(onExportExcel ? [{ label: "Descargar Excel", onClick: onExportExcel }] : []),
    ...(!isOpen && !current.repuesto && onAprobarReposicion
      ? [{ label: "Aprobar reposición", onClick: () => onAprobarReposicion(current.id) }]
      : []),
    ...(onViewDeleted && (deletedCount ?? 0) > 0
      ? [{ label: `Ver gastos eliminados (${deletedCount})`, onClick: onViewDeleted }]
      : []),
  ];

  return (
    <>
      {/* ── Top (scrolls away) ── */}
      <div className="max-w-6xl mx-auto px-5 sm:px-9 pt-7 pb-5">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1 text-xs mb-4 transition-colors"
          style={{ color: "var(--caja-fg-muted)" }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "var(--caja-fg-strong)")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--caja-fg-muted)")}
        >
          <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
          Períodos
        </button>

        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-wrap items-baseline gap-3.5">
            <h1
              className="caja-display"
              style={{ fontSize: "clamp(28px, 4vw, 42px)", margin: 0 }}
            >
              Período Nº {current.numero}
            </h1>
            <span
              className="caja-mono text-sm"
              style={{ color: "var(--caja-fg-muted)" }}
            >
              {fmtDate(current.fecha_apertura)}
            </span>
            <StatusPill open={isOpen} fechaCierre={current.fecha_cierre} />
            {responsableLabel && (
              <span className="text-xs" style={{ color: "var(--caja-fg-muted)" }}>
                Responsable: <span style={{ color: "var(--caja-fg-default)", fontWeight: 500 }}>{responsableLabel}</span>
              </span>
            )}
            {isOpen && daysSinceOpen > 30 && !suggestionVisible && (
              <span
                className="text-xs"
                style={{
                  color: "var(--caja-warning-onSoft)",
                  fontWeight: 500,
                }}
              >
                {daysSinceOpen} días abierto
              </span>
            )}
            {!isOpen && current.repuesto && current.repuesto_at && (
              <span
                className="text-xs"
                style={{ color: "var(--caja-success-onSoft)", fontWeight: 500 }}
              >
                Repuesto ✓ {fmtRepuestoDate(current.repuesto_at)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {onPrint && (
              <button
                onClick={onPrint}
                className="hidden sm:inline-flex items-center gap-1.5 text-sm font-medium px-3.5 h-9 rounded-md transition-colors"
                style={{
                  background: "#fff",
                  color: "var(--caja-fg-default)",
                  border: "1px solid var(--caja-border-default)",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--caja-bg-page)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "#fff")}
              >
                <PrintIcon /> Imprimir
              </button>
            )}
            {isOpen && onClosePeriodo && (
              <button
                onClick={onClosePeriodo}
                className="inline-flex items-center gap-1.5 text-sm font-medium px-3.5 h-9 rounded-md transition-transform active:scale-[0.97]"
                style={{ background: "var(--caja-stone-950)", color: "#fff" }}
              >
                <CheckIcon />
                <span className="hidden sm:inline">Cerrar período</span>
                <span className="sm:hidden">Cerrar</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── KPI block (Card) ── */}
      <div className="max-w-6xl mx-auto px-5 sm:px-9">
        <div
          className="rounded-lg p-5 sm:p-6"
          style={{
            background: "var(--caja-bg-surface)",
            border: "1px solid var(--caja-border-subtle)",
          }}
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 sm:gap-8 mb-5">
            <Kpi label="Fondo" value={fondoInicial} sub="Apertura del ciclo" />
            <Kpi
              label="Gastado"
              value={totalGastado}
              sub={`${pctSpent.toFixed(1)}% del fondo`}
              dim
            />
            <Kpi
              label="Saldo"
              value={saldo}
              sub="Disponible"
              highlight={saldo >= 0}
            />
          </div>
          {/* Progress bar */}
          <div>
            <div
              className="relative rounded-full overflow-hidden"
              style={{ height: 6, background: "var(--caja-stone-100)" }}
            >
              <div
                className="absolute inset-y-0 left-0 rounded-full"
                style={{
                  width: `${barWidth}%`,
                  background: barColor,
                  transition: "width 400ms cubic-bezier(0.22, 1, 0.36, 1), background-color 250ms ease",
                }}
              />
            </div>
            <div
              className="flex justify-between mt-2 text-xs caja-mono"
              style={{ color: "var(--caja-fg-muted)" }}
            >
              <span>$0.00</span>
              <span style={{ color: barColor, fontWeight: 500 }}>
                {pctSpent.toFixed(1)}% gastado
              </span>
              <span>${fmt(fondoInicial)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Overflow menu placement (mobile + extras) */}
      {menuItems.length > 0 && (
        <div className="max-w-6xl mx-auto px-5 sm:px-9 mt-3 flex justify-end">
          <OverflowMenu items={menuItems} />
        </div>
      )}

      {/* Hidden saldo prop kept to honor existing API: pctUsed only used for back-compat */}
      <span style={{ display: "none" }} aria-hidden data-pct-used={pctUsed.toFixed(2)} />
    </>
  );
}

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
}: Props) {
  const isOpen = current.estado === "abierto";
  const fondoInicial = current.fondo_inicial;

  const daysSinceOpen = isOpen
    ? Math.floor((Date.now() - new Date(current.fecha_apertura).getTime()) / (24 * 60 * 60 * 1000))
    : 0;

  // Progress bar color: green when saldo healthy, orange when 10–20%, red below 10%
  const barColor = pctUsed < 10 ? "#dc2626" : pctUsed < 20 ? "#d97706" : "#059669";
  const barWidth = Math.min(100, fondoInicial > 0 ? (totalGastado / fondoInicial) * 100 : 0);

  const menuItems: OverflowMenuItem[] = [
    ...(onPrint ? [{ label: "Imprimir", onClick: onPrint }] : []),
    ...(onExportExcel ? [{ label: "Descargar Excel", onClick: onExportExcel }] : []),
    ...(!isOpen && !current.repuesto && onAprobarReposicion
      ? [{ label: "Aprobar reposición", onClick: () => onAprobarReposicion(current.id) }]
      : []),
  ];

  return (
    <>
      {/* ── Top (scrolls away) ── */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-8 pb-4">
        <button
          onClick={onBack}
          className="text-sm text-gray-400 hover:text-black transition mb-4 block"
        >
          ← Períodos
        </button>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-light tracking-tight">
            Período N° {current.numero}
          </h1>
          <span className="text-sm text-gray-400">{fmtDate(current.fecha_apertura)}</span>
          {isOpen ? (
            <>
              <span className="text-[11px] bg-black text-white px-2.5 py-0.5 rounded-full">
                Abierto
              </span>
              {daysSinceOpen > 30 && (
                <span className="text-xs text-amber-600">
                  {daysSinceOpen} días abierto
                </span>
              )}
            </>
          ) : (
            <>
              <span className="text-[11px] bg-gray-200 text-gray-500 px-2.5 py-0.5 rounded-full">
                Cerrado — {fmtDate(current.fecha_cierre || "")}
              </span>
              {current.repuesto && current.repuesto_at && (
                <span className="text-xs text-emerald-600">
                  Repuesto ✓ {fmtRepuestoDate(current.repuesto_at)}
                </span>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Sticky KPI bar (pins on scroll) ── */}
      <div className="sticky top-0 z-30 bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3">
          <div className="flex items-center gap-4">
            {/* Desktop: three KPIs side by side */}
            <div className="hidden sm:flex items-center gap-8 flex-1">
              <div>
                <div className="text-[10px] uppercase tracking-[0.05em] text-gray-400">Fondo</div>
                <div className="text-sm tabular-nums text-gray-600">${fmt(fondoInicial)}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-[0.05em] text-gray-400">Gastado</div>
                <div className="text-sm tabular-nums font-medium">${fmt(totalGastado)}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-[0.05em] text-gray-400">Saldo</div>
                <div className={`text-base tabular-nums font-semibold ${saldo < 0 ? "text-red-600" : ""}`}>
                  ${fmt(saldo)}
                </div>
              </div>
            </div>
            {/* Mobile: compact saldo-first layout */}
            <div className="sm:hidden flex-1 min-w-0">
              <div className="flex items-baseline justify-between gap-3">
                <div>
                  <span className="text-[10px] uppercase tracking-[0.05em] text-gray-400 mr-1">Saldo</span>
                  <span className={`text-base font-semibold tabular-nums ${saldo < 0 ? "text-red-600" : ""}`}>
                    ${fmt(saldo)}
                  </span>
                </div>
                <div className="text-[11px] text-gray-500 tabular-nums whitespace-nowrap">
                  Gastado ${fmt(totalGastado)} / ${fmt(fondoInicial)}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {isOpen && onClosePeriodo && (
                <button
                  onClick={onClosePeriodo}
                  title="Cerrar período"
                  className="text-sm text-black bg-white border border-gray-300 rounded-md px-3 py-1.5 hover:bg-gray-50 active:scale-[0.97] transition font-medium"
                >
                  <span className="sm:hidden">Cerrar</span>
                  <span className="hidden sm:inline">Cerrar período</span>
                </button>
              )}
              <OverflowMenu items={menuItems} />
            </div>
          </div>
          {/* Progress bar */}
          <div className="mt-2 h-1 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{
                width: `${barWidth}%`,
                transition: "width 500ms ease-out, background-color 300ms ease-out",
                backgroundColor: barColor,
              }}
            />
          </div>
        </div>
      </div>
    </>
  );
}

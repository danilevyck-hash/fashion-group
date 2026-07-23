"use client";

// Layout mobile-first del tab Resumen. Visible <md, gated por md:hidden en
// el contenedor. El layout desktop existente queda intacto detrás de
// hidden md:block en ResumenView.tsx.
//
// Estructura: pill de frescura → 3 KPI cards (Ventas/Utilidad/Margen YTD) →
// Toggles segmented → Heatmap con sticky col + mes actual highlighted +
// total grupo dark row.
// Sin tooltips (no hover en touch); drill-down al detalle queda para el
// siguiente sprint.

import type {
  VentasResumen,
  EmpresaMonthlySales,
  ProyeccionResp,
  ProyeccionEmpresa,
  ProyeccionMensualEmpresa,
} from "./types";
import { MONTHS, QUARTERS, formatCompactCurrency } from "@/lib/ventas/format";
import { formatDeltaRatio } from "@/lib/ventas/formatDelta";
import { cn } from "@/lib/utils";
import { ChevronRight } from "lucide-react";
import SyncStatus from "@/components/shared/SyncStatus";
import SyncNowButton from "@/components/shared/SyncNowButton";
import { SYNC_NOW_FACTURAS_OPCIONES } from "@/components/shared/syncNowOpciones";
import { SWITCH_FACTURAS_EMPRESA_KEYS, EMPRESA_KEY_TO_NAME } from "@/lib/empresa-mapping";
import { ResumenAnual, type AnualData } from "./ResumenAnual";

type Granularity = "mensual" | "trimestral" | "anual";
type ViewMode = "ventas" | "utilidad" | "margen";

const MARGEN_VENTAS_MIN = 100;

const VENTAS_ID_TO_EMPRESA_KEY: Record<string, string> = {
  vistana: "vistana",
  fwear: "fashion_wear",
  fshoes: "fashion_shoes",
  ashoes: "active_shoes",
  awear: "active_wear",
  joystep: "joystep",
  boston: "confecciones_boston",
  multi: "american_classic",
};

interface ResumenViewMobileProps {
  data: VentasResumen;
  selectedYear: number;
  isClosedYear: boolean;
  viewMode: ViewMode;
  setViewMode: (m: ViewMode) => void;
  granularity: Granularity;
  setGranularity: (g: Granularity) => void;
  /** Datos del modo Anual (compartidos con el desktop; fetch perezoso en ResumenView). */
  anualData: AnualData | null;
  anualError: string | null;
  /** Abre el panel mes × año de una empresa (id ventas corto). El panel lo
   *  renderiza ResumenView (único en el árbol). */
  onOpenEmpresa: (id: string) => void;
  /** Etiqueta del cliente de mayoreo de Multifashion (american_classic). null si
   *  no hay mayoreo en el período → la nota "incluye mayoreo" no se muestra. */
  multiMayoreoLabel?: string | null;
  /** Reload del bundle tras un "Actualizar ahora" exitoso. */
  onReloadData?: () => void;
}

export function ResumenViewMobile({
  data,
  selectedYear,
  isClosedYear,
  viewMode,
  setViewMode,
  granularity,
  setGranularity,
  anualData,
  anualError,
  onOpenEmpresa,
  multiMayoreoLabel,
  onReloadData,
}: ResumenViewMobileProps) {
  const prevYear = selectedYear - 1;

  return (
    <div className="md:hidden space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <SyncStatus
          tabla="facturas"
          empresasEsperadas={SWITCH_FACTURAS_EMPRESA_KEYS}
          empresaLabels={EMPRESA_KEY_TO_NAME}
          variant="pill"
          prefix="Data al"
        />
        {/* "Actualizar ahora" (admin/secretaria) — un clic = las 8 empresas en secuencia. */}
        <SyncNowButton opciones={SYNC_NOW_FACTURAS_OPCIONES} secuencial onSuccess={onReloadData} />
      </div>
      <MobileKpis data={data} prevYear={prevYear} isClosedYear={isClosedYear} selectedYear={selectedYear} />
      <MobileToggles
        viewMode={viewMode}
        setViewMode={setViewMode}
        granularity={granularity}
        setGranularity={setGranularity}
      />
      {granularity === "anual" ? (
        <ResumenAnual data={anualData} error={anualError} viewMode={viewMode} />
      ) : (
        <MobileHeatmap
          data={data}
          viewMode={viewMode}
          granularity={granularity}
          isClosedYear={isClosedYear}
          multiMayoreoLabel={multiMayoreoLabel}
          onOpenEmpresa={onOpenEmpresa}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// KPI cards — Ventas / Utilidad / Margen YTD (paridad con desktop)
// ─────────────────────────────────────────────────────────────────────────────

function MobileKpis({ data, prevYear, isClosedYear, selectedYear }: { data: VentasResumen; prevYear: number; isClosedYear: boolean; selectedYear: number }) {
  const k = data.kpis;
  const periodo = isClosedYear ? String(selectedYear) : "YTD";
  const ventasDelta   = k.ventas2025YTD   > 0 ? (k.ventasNetasYTD - k.ventas2025YTD) / k.ventas2025YTD : null;
  const utilidadDelta = k.utilidad2025YTD > 0 ? (k.utilidadYTD    - k.utilidad2025YTD) / k.utilidad2025YTD : null;
  const margenDeltaPts = (k.margenYTD - k.margen2025YTD) * 100;
  const pct = (r: number) => `${r >= 0 ? "+" : ""}${(r * 100).toFixed(0)}% vs '${String(prevYear).slice(-2)}`;

  return (
    <div className="grid grid-cols-3 gap-2">
      <KpiTile
        label={`Ventas ${periodo}`}
        value={formatCompactCurrency(k.ventasNetasYTD)}
        sub={ventasDelta == null ? null : { text: pct(ventasDelta), sign: ventasDelta }}
      />
      <KpiTile
        label={`Utilidad ${periodo}`}
        value={formatCompactCurrency(k.utilidadYTD)}
        sub={utilidadDelta == null ? null : { text: pct(utilidadDelta), sign: utilidadDelta }}
      />
      <KpiTile
        label={`Margen ${periodo}`}
        value={`${(k.margenYTD * 100).toFixed(1)}%`}
        sub={{ text: `${margenDeltaPts >= 0 ? "+" : ""}${margenDeltaPts.toFixed(1)} pts`, sign: margenDeltaPts }}
      />
    </div>
  );
}

function KpiTile({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub: { text: string; sign: number | null } | null;
}) {
  const subTone = sub == null || sub.sign == null
    ? "text-gray-500"
    : sub.sign > 0 ? "text-emerald-700" : sub.sign < 0 ? "text-rose-700" : "text-gray-500";
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-2.5">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-1 font-mono text-[17px] font-medium leading-tight tracking-tight tabular-nums text-gray-950">
        {value}
      </p>
      {sub && (
        <p className={cn("mt-0.5 text-xs font-medium leading-tight", subTone)}>
          {sub.text}
        </p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Toggles segmented — Ventas/Utilidad/Margen + Mensual/Trimestral
// ─────────────────────────────────────────────────────────────────────────────

function MobileToggles({
  viewMode,
  setViewMode,
  granularity,
  setGranularity,
}: {
  viewMode: ViewMode;
  setViewMode: (m: ViewMode) => void;
  granularity: Granularity;
  setGranularity: (g: Granularity) => void;
}) {
  return (
    <div className="space-y-2">
      <SegmentedRow
        options={[
          { value: "ventas", label: "Ventas" },
          { value: "utilidad", label: "Utilidad" },
          { value: "margen", label: "Margen %" },
        ]}
        active={viewMode}
        onChange={setViewMode}
      />
      <SegmentedRow
        options={[
          { value: "mensual", label: "Mensual" },
          { value: "trimestral", label: "Trimestral" },
          { value: "anual", label: "Anual" },
        ]}
        active={granularity}
        onChange={setGranularity}
      />
    </div>
  );
}

function SegmentedRow<T extends string>({
  options,
  active,
  onChange,
}: {
  options: { value: T; label: string }[];
  active: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex rounded-lg bg-gray-100 p-0.5" role="tablist">
      {options.map(o => {
        const isActive = active === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(o.value)}
            className={cn(
              "flex-1 rounded-md py-2.5 text-xs font-medium transition min-h-[44px]",
              isActive
                ? "bg-white text-gray-950 shadow-sm"
                : "text-gray-500 active:text-gray-700"
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Heatmap mobile — sticky col + mes actual highlight + total grupo dark row
// ─────────────────────────────────────────────────────────────────────────────

type CellData = {
  ventas: number | null;
  ventasPrev: number;
  utilidad: number | null;
  utilidadPrev: number;
};

function MobileHeatmap({
  data,
  viewMode,
  granularity,
  isClosedYear,
  multiMayoreoLabel,
  onOpenEmpresa,
}: {
  data: VentasResumen;
  viewMode: ViewMode;
  granularity: Granularity;
  isClosedYear: boolean;
  multiMayoreoLabel?: string | null;
  onOpenEmpresa: (id: string) => void;
}) {
  const cols = granularity === "mensual" ? MONTHS : QUARTERS;

  // Índice de columna del mes en curso para highlight.
  // mesActual es 1-indexed (5 = May). En trimestral: ceil(5/3)=2 → Q2 → idx 1.
  const currentColIdx = isClosedYear || data.mesActual === 0
    ? -1
    : granularity === "mensual"
      ? data.mesActual - 1
      : Math.ceil(data.mesActual / 3) - 1;

  // Filas por empresa (con cells re-derivadas por granularidad).
  const rows = data.empresas.map(e => ({
    id: e.empresa.id,
    nombre: e.empresa.nombre,
    cells: buildCells(e, granularity),
    ytdTotal: yearlyTotal(e, viewMode),
    margenPct: e.margenPct,
    margenPctPrev: e.margenPctPrev,
  }));

  // Aggregates por columna (suma de todas las empresas).
  const totalColAggs: CellData[] = cols.map((_, ci) => {
    let v = 0, vp = 0, u = 0, up = 0;
    let hasV = false, hasU = false;
    rows.forEach(r => {
      const c = r.cells[ci];
      if (c.ventas != null) { v += c.ventas; hasV = true; }
      vp += c.ventasPrev;
      if (c.utilidad != null) { u += c.utilidad; hasU = true; }
      up += c.utilidadPrev;
    });
    return {
      ventas: hasV ? v : null,
      ventasPrev: vp,
      utilidad: hasU ? u : null,
      utilidadPrev: up,
    };
  });

  // YTD del grupo (siempre ventas2026/2025 reales, no por columna).
  const groupYtd = data.empresas.reduce<{ v: number; vp: number; u: number; up: number }>(
    (s, e) => ({
      v: s.v + sumSeries(e.ventas2026),
      vp: s.vp + sumSeries(e.ventas2025),
      u: s.u + sumSeries(e.utilidad2026),
      up: s.up + sumSeries(e.utilidad2025),
    }),
    { v: 0, vp: 0, u: 0, up: 0 }
  );

  const showProy = !isClosedYear && !!data.proyeccion;
  const showMensual = !isClosedYear && !!data.proyeccionMensual;
  const mesProyLabel = data.mesProyeccion ? MONTHS[data.mesProyeccion - 1] : "";

  return (
    <div className="relative overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="w-full border-collapse text-xs [&_td]:align-middle [&_th]:align-middle">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50">
            <th
              scope="col"
              className="sticky left-0 z-10 min-w-[120px] border-r border-gray-200 bg-gray-50 px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-gray-500"
            >
              Empresa
            </th>
            {cols.map((c, ci) => (
              <th
                key={c}
                scope="col"
                className={cn(
                  "px-2 py-2.5 text-right text-xs font-medium uppercase tracking-wide text-gray-500",
                  ci === currentColIdx && "bg-[rgba(15,118,110,0.06)] text-teal-800"
                )}
              >
                {c}
              </th>
            ))}
            <th
              scope="col"
              className="px-2.5 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-gray-950"
            >
              Total
            </th>
            {showProy && (
              <th
                scope="col"
                className="px-2.5 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-gray-950"
              >
                Proyección
              </th>
            )}
            {showMensual && (
              <th
                scope="col"
                className="px-2.5 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-gray-950"
              >
                Cierre {mesProyLabel} (proy.)
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map(r => {
            const proy = showProy
              ? findProyeccionForEmpresa(data.proyeccion!, r.id)
              : null;
            return (
              <tr
                key={r.id}
                onClick={() => onOpenEmpresa(r.id)}
                aria-haspopup="dialog"
                className="cursor-pointer border-b border-gray-100 last:border-b-0 active:bg-gray-50"
              >
                <th
                  scope="row"
                  className="sticky left-0 z-10 min-w-[120px] max-w-[150px] border-r border-gray-200 bg-white px-3 py-3 text-left text-xs font-medium text-gray-900"
                >
                  <div className="flex items-center gap-1.5">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{r.nombre}</span>
                      {r.id === "multi" && multiMayoreoLabel && (
                        /* Nota VISIBLE (paridad con desktop): la fila es american_classic
                           COMPLETA (tienda + mayoreo), no solo el retail del mostrador. */
                        <span className="mt-0.5 block whitespace-normal text-xs font-normal leading-tight text-gray-500">
                          incluye mayoreo · {multiMayoreoLabel}
                        </span>
                      )}
                    </span>
                    {/* Affordance: abre el panel mes × año de la empresa. */}
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-gray-300" aria-hidden />
                  </div>
                </th>
                {r.cells.map((c, ci) => (
                  <MobileCell
                    key={ci}
                    cell={c}
                    mode={viewMode}
                    highlighted={ci === currentColIdx}
                  />
                ))}
                <MobileTotalCell
                  ventas={r.ytdTotal.cur}
                  prev={r.ytdTotal.prev}
                  mode={viewMode}
                  margenPct={r.margenPct}
                  margenPctPrev={r.margenPctPrev}
                />
                {showProy && <MobileProyCell proyeccion={proy} />}
                {showMensual && <MobileMensualCell pm={data.proyeccionMensual![r.id]} />}
              </tr>
            );
          })}
          <tr className="bg-gray-900 text-white">
            <th
              scope="row"
              className="sticky left-0 z-10 min-w-[120px] border-r border-gray-700 bg-gray-900 px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide"
            >
              Total grupo
            </th>
            {totalColAggs.map((agg, ci) => (
              <MobileTotalGrupoCell
                key={ci}
                cell={agg}
                mode={viewMode}
                highlighted={ci === currentColIdx}
              />
            ))}
            <MobileTotalGrupoYtdCell
              cur={groupYtd.v}
              prev={groupYtd.vp}
              curUtil={groupYtd.u}
              prevUtil={groupYtd.up}
              mode={viewMode}
              data={data}
            />
            {showProy && (
              <MobileProyGrupoCell proyeccion={data.proyeccion!} />
            )}
            {showMensual && <MobileMensualGrupoCell pm={data.proyeccionMensual!} />}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function MobileCell({
  cell,
  mode,
  highlighted,
}: {
  cell: CellData;
  mode: ViewMode;
  highlighted: boolean;
}) {
  const cur = cellNumber(cell, mode);
  const delta = cellDelta(cell, mode);
  const bgCls = highlighted ? "bg-[rgba(15,118,110,0.06)]" : "";

  if (cur == null) {
    return (
      <td className={cn("px-2 py-3 text-right font-mono text-xs tabular-nums text-gray-300", bgCls)}>
        —
      </td>
    );
  }

  // Bloque alineado a la derecha: monto suave arriba (stone-600, sin negrita —
  // deja de ser el grito principal), delta chiquito y discreto debajo con un
  // poco de aire (gap-0.5). flex-col items-end alinea a la derecha sin centrar.
  // Sin comparativo → DeltaPct no renderiza nada, queda solo el monto.
  return (
    <td className={cn("px-2 py-3 text-right font-mono tabular-nums", bgCls)}>
      <span className="flex flex-col items-end gap-1 leading-tight">
        <span className="w-full text-right text-xs text-gray-600">{renderCell(cur, mode)}</span>
        <DeltaPct delta={delta} mode={mode} />
      </span>
    </td>
  );
}

function MobileTotalCell({
  ventas,
  prev,
  mode,
  margenPct,
  margenPctPrev,
}: {
  ventas: number;
  prev: number;
  mode: ViewMode;
  margenPct: number;
  margenPctPrev: number;
}) {
  let cur: number;
  let delta: number | null;
  let display: string;
  if (mode === "margen") {
    cur = margenPct;
    delta = margenPctPrev > 0 ? margenPct - margenPctPrev : null;
    display = (cur * 100).toFixed(1) + "%";
  } else {
    cur = ventas;
    delta = prev > 0 ? (ventas - prev) / prev : null;
    display = formatCompactCurrency(cur);
  }
  return (
    <td className="border-l border-gray-200 px-2.5 py-3 text-right font-mono tabular-nums text-gray-950">
      <span className="flex flex-col items-end gap-1 leading-tight">
        <span className="w-full text-right text-xs font-semibold">{display}</span>
        <DeltaPct delta={delta} mode={mode} />
      </span>
    </td>
  );
}

/** Celda mobile de proyección de cierre del MES (método-b retail / run-rate mayorista).
 *  Paridad con la columna desktop. */
function MobileMensualCell({ pm }: { pm: ProyeccionMensualEmpresa | undefined }) {
  if (!pm || pm.proyeccion == null) {
    return (
      <td className="border-l border-gray-200 px-2.5 py-3 text-right text-xs text-gray-400">
        datos insuf.
      </td>
    );
  }
  return (
    <td className="border-l border-gray-200 px-2.5 py-3 text-right">
      <span className="block font-mono text-xs font-semibold tabular-nums text-gray-900">{formatCompactCurrency(pm.proyeccion)}</span>
      {pm.volatil && <span className="mt-0.5 block text-xs text-amber-600">volátil</span>}
    </td>
  );
}

/** Total grupo mobile de la proyección mensual: suma las empresas con dato suficiente. */
function MobileMensualGrupoCell({ pm }: { pm: Record<string, ProyeccionMensualEmpresa> }) {
  const vals = Object.values(pm);
  const total = vals.reduce((s, e) => s + (e.suficiente_data && e.proyeccion != null ? e.proyeccion : 0), 0);
  return (
    <td className="border-l border-gray-700 px-2.5 py-3 text-right font-mono text-xs font-semibold tabular-nums text-white">
      {formatCompactCurrency(total)}
    </td>
  );
}

function MobileProyCell({ proyeccion }: { proyeccion: ProyeccionEmpresa | null }) {
  if (!proyeccion) {
    return (
      <td className="border-l border-gray-200 px-2.5 py-3 text-right font-mono text-xs tabular-nums text-gray-300">
        —
      </td>
    );
  }
  return (
    <td className="border-l border-gray-200 px-2.5 py-3 text-right font-mono text-xs font-semibold tabular-nums text-teal-700">
      {formatCompactCurrency(proyeccion.proyeccion_cierre)}
    </td>
  );
}

function MobileTotalGrupoCell({
  cell,
  mode,
  highlighted,
}: {
  cell: CellData;
  mode: ViewMode;
  highlighted: boolean;
}) {
  const cur = cellNumber(cell, mode);
  const delta = cellDelta(cell, mode);
  const bgCls = highlighted ? "bg-[rgba(15,118,110,0.12)]" : "";

  if (cur == null) {
    return <td className={cn("px-2 py-3 text-right font-mono text-xs tabular-nums text-gray-500", bgCls)}>—</td>;
  }

  return (
    <td className={cn("px-2 py-3 text-right font-mono tabular-nums", bgCls)}>
      <span className="flex flex-col items-end gap-1 leading-tight">
        <span className="w-full text-right text-xs font-medium text-white">{renderCell(cur, mode)}</span>
        <DeltaPct delta={delta} mode={mode} dark />
      </span>
    </td>
  );
}

function MobileTotalGrupoYtdCell({
  cur,
  prev,
  curUtil,
  prevUtil,
  mode,
  data,
}: {
  cur: number;
  prev: number;
  curUtil: number;
  prevUtil: number;
  mode: ViewMode;
  data: VentasResumen;
}) {
  let v: number;
  let d: number | null;
  let display: string;
  if (mode === "margen") {
    v = data.kpis.margenYTD;
    d = data.kpis.margen2025YTD > 0 ? v - data.kpis.margen2025YTD : null;
    display = (v * 100).toFixed(1) + "%";
  } else if (mode === "utilidad") {
    v = curUtil;
    d = prevUtil > 0 ? (curUtil - prevUtil) / prevUtil : null;
    display = formatCompactCurrency(v);
  } else {
    v = cur;
    d = prev > 0 ? (cur - prev) / prev : null;
    display = formatCompactCurrency(v);
  }
  return (
    <td className="border-l border-gray-700 px-2.5 py-3 text-right font-mono tabular-nums text-white">
      <span className="flex flex-col items-end gap-1 leading-tight">
        <span className="w-full text-right text-xs font-semibold">{display}</span>
        <DeltaPct delta={d} mode={mode} dark />
      </span>
    </td>
  );
}

function MobileProyGrupoCell({ proyeccion }: { proyeccion: ProyeccionResp }) {
  return (
    <td className="border-l border-gray-700 px-2.5 py-3 text-right font-mono text-xs font-semibold tabular-nums text-teal-200">
      {formatCompactCurrency(proyeccion.totales_grupo.proyeccion_cierre)}
    </td>
  );
}

// Flecha + % numérico vs 2025, compacto debajo del monto. En todas las celdas
// del heatmap (mensual/trimestral por empresa, total grupo y columna TOTAL),
// para igualar al desktop, que muestra monto + flecha + Δ%. Usa el mismo delta
// ya calculado por la celda (ventas/utilidad = ratio %, margen = puntos),
// formateado con el helper compartido formatDeltaRatio.
function DeltaPct({
  delta,
  mode,
  dark,
}: {
  delta: number | null;
  mode: ViewMode;
  dark?: boolean;
}) {
  // Sin comparativo (RPC no devolvió prev) → no renderiza nada: queda solo el
  // monto, sin segunda línea suelta. La zona neutral (delta dentro del umbral)
  // sí muestra el % en stone, sin flecha.
  if (delta == null) return null;
  const fmt = formatDeltaRatio(delta, mode === "margen" ? "pts" : "pct");
  const tone =
    fmt.tone === "emerald"
      ? dark ? "text-emerald-300" : "text-emerald-700"
      : fmt.tone === "orange"
        ? dark ? "text-rose-300" : "text-rose-600"
        : dark ? "text-gray-400" : "text-gray-500";
  // Flecha + % pegados en una sola pieza ("▲+110%"), sin espacio. Discreto
  // (9px, sin negrita): el color aparece solo donde importa, sin que toda la
  // grilla vibre.
  return (
    <span className={cn("block w-full text-right text-xs font-normal leading-tight", tone)}>
      {fmt.arrow ?? ""}{fmt.displayValue}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers de derivación de cells
// ─────────────────────────────────────────────────────────────────────────────

function buildCells(e: EmpresaMonthlySales, granularity: Granularity): CellData[] {
  if (granularity === "mensual") {
    return e.ventas2026.map((v, i) => ({
      ventas: v,
      ventasPrev: e.ventas2025[i] ?? 0,
      utilidad: e.utilidad2026[i],
      utilidadPrev: e.utilidad2025[i] ?? 0,
    }));
  }
  const groups = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [9, 10, 11]];
  return groups.map(q => {
    const hasV = q.some(i => e.ventas2026[i] != null);
    const hasU = q.some(i => e.utilidad2026[i] != null);
    return {
      ventas: hasV ? q.reduce((s, i) => s + (e.ventas2026[i] ?? 0), 0) : null,
      ventasPrev: q.reduce((s, i) => s + (e.ventas2025[i] ?? 0), 0),
      utilidad: hasU ? q.reduce((s, i) => s + (e.utilidad2026[i] ?? 0), 0) : null,
      utilidadPrev: q.reduce((s, i) => s + (e.utilidad2025[i] ?? 0), 0),
    };
  });
}

function cellNumber(c: CellData, mode: ViewMode): number | null {
  if (mode === "margen") {
    if (c.ventas == null || c.utilidad == null || c.ventas < MARGEN_VENTAS_MIN) return null;
    return c.utilidad / c.ventas;
  }
  return mode === "utilidad" ? c.utilidad : c.ventas;
}

function cellDelta(c: CellData, mode: ViewMode): number | null {
  const cur = cellNumber(c, mode);
  if (cur == null) return null;
  if (mode === "margen") {
    if (c.ventasPrev < MARGEN_VENTAS_MIN) return null;
    const prevM = c.utilidadPrev / c.ventasPrev;
    return cur - prevM;
  }
  const prev = mode === "utilidad" ? c.utilidadPrev : c.ventasPrev;
  if (prev <= 0) return null;
  return (cur - prev) / prev;
}

function renderCell(v: number, mode: ViewMode): string {
  if (mode === "margen") return (v * 100).toFixed(1) + "%";
  return formatCompactCurrency(v);
}

function sumSeries(arr: (number | null)[]): number {
  return arr.reduce<number>((s, v) => s + (v ?? 0), 0);
}

function yearlyTotal(e: EmpresaMonthlySales, mode: ViewMode): { cur: number; prev: number } {
  if (mode === "utilidad") {
    return { cur: sumSeries(e.utilidad2026), prev: sumSeries(e.utilidad2025) };
  }
  return { cur: sumSeries(e.ventas2026), prev: sumSeries(e.ventas2025) };
}

function findProyeccionForEmpresa(p: ProyeccionResp, ventasId: string): ProyeccionEmpresa | null {
  const empresaKey = VENTAS_ID_TO_EMPRESA_KEY[ventasId] ?? ventasId;
  return p.empresas.find(e => e.empresa === empresaKey) ?? null;
}

"use client";

// Layout mobile-first del tab Resumen. Visible <md, gated por md:hidden en
// el contenedor. El layout desktop existente queda intacto detrás de
// hidden md:block en ResumenView.tsx.
//
// Estructura: Hero Proyección (teal-700) → 2 KPI cards → Toggles segmented →
// Heatmap con sticky col + mes actual highlighted + total grupo dark row.
// Sin tooltips (no hover en touch); drill-down al detalle queda para el
// siguiente sprint.

import type {
  VentasResumen,
  EmpresaMonthlySales,
  ProyeccionResp,
  ProyeccionEmpresa,
} from "./types";
import { MONTHS, QUARTERS, formatCompactCurrency } from "@/lib/ventas/format";
import { cn } from "@/lib/utils";

type Granularity = "mensual" | "trimestral";
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
}

export function ResumenViewMobile({
  data,
  selectedYear,
  isClosedYear,
  viewMode,
  setViewMode,
  granularity,
  setGranularity,
}: ResumenViewMobileProps) {
  const prevYear = selectedYear - 1;
  const showProyeccion = !isClosedYear && !!data.proyeccion && data.proyeccion.totales_grupo.ventas_ytd > 0;

  return (
    <div className="md:hidden space-y-4">
      {showProyeccion && (
        <MobileProyHero
          proyeccion={data.proyeccion!}
          selectedYear={selectedYear}
          prevYear={prevYear}
        />
      )}
      <MobileKpis data={data} prevYear={prevYear} />
      <MobileToggles
        viewMode={viewMode}
        setViewMode={setViewMode}
        granularity={granularity}
        setGranularity={setGranularity}
      />
      <MobileHeatmap
        data={data}
        viewMode={viewMode}
        granularity={granularity}
        isClosedYear={isClosedYear}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Hero Proyección — card teal-700 con % cumplimiento + progress + sub-cifras
// ─────────────────────────────────────────────────────────────────────────────

function MobileProyHero({
  proyeccion,
  selectedYear,
  prevYear,
}: {
  proyeccion: ProyeccionResp;
  selectedYear: number;
  prevYear: number;
}) {
  const g = proyeccion.totales_grupo;
  const proy = g.proyeccion_cierre;
  const meta = g.meta_total;
  const deltaCierre = g.delta_vs_anio_anterior_total;
  const hasMeta = meta > 0;
  const cumplimientoPct = hasMeta ? (proy / meta) * 100 : null;
  const aMeta = hasMeta ? proy - meta : null;

  // Barra: si hay meta usamos meta como denominador (cap visual al 100%).
  // Sin meta, fallback a cierre anterior para tener referencia visual.
  const barDenom = hasMeta ? meta : g.cierre_anio_anterior_total;
  const barPct = barDenom > 0 ? Math.min(100, (proy / barDenom) * 100) : 0;

  return (
    <section className="rounded-xl bg-teal-700 p-5 text-white shadow-sm">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[10.5px] font-medium uppercase tracking-widest text-teal-100">
          Proyección {selectedYear}
        </p>
        {cumplimientoPct != null && (
          <p className="font-mono text-xs font-medium tabular-nums text-teal-100">
            {cumplimientoPct.toFixed(0)}% del meta
          </p>
        )}
      </div>
      <p className="mt-2 font-mono text-[40px] font-medium leading-none tracking-tight tabular-nums">
        {formatCompactCurrency(proy)}
      </p>
      <p className="mt-2 text-xs text-teal-100">
        {hasMeta
          ? <>de <span className="font-mono tabular-nums text-white">{formatCompactCurrency(meta)}</span> meta anual</>
          : "Meta anual no configurada"}
      </p>
      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/20">
        <div
          className="h-full bg-white transition-[width] duration-300"
          style={{ width: `${barPct}%` }}
        />
      </div>
      <div className="mt-4 border-t border-white/20 pt-3">
        <dl className="grid grid-cols-2 gap-3 text-xs">
          <div>
            <dt className="text-[10px] font-medium uppercase tracking-wider text-teal-100">A meta</dt>
            <dd className={cn("mt-0.5 font-mono font-medium tabular-nums", deltaTone(aMeta))}>
              {aMeta == null ? "—" : signedCompact(aMeta)}
            </dd>
          </div>
          <div>
            <dt className="text-[10px] font-medium uppercase tracking-wider text-teal-100">
              vs cierre &apos;{String(prevYear).slice(-2)}
            </dt>
            <dd className={cn("mt-0.5 font-mono font-medium tabular-nums", deltaTone(deltaCierre))}>
              {deltaCierre == null ? "—" : signedCompact(deltaCierre)}
            </dd>
          </div>
        </dl>
      </div>
    </section>
  );
}

function deltaTone(d: number | null | undefined): string {
  if (d == null) return "text-teal-100";
  return d < 0 ? "text-rose-200" : "text-emerald-200";
}

function signedCompact(n: number): string {
  if (n === 0) return "$0";
  return (n > 0 ? "+" : "") + formatCompactCurrency(n);
}

// ─────────────────────────────────────────────────────────────────────────────
// KPI cards — Ventas YTD + Mejor mes
// ─────────────────────────────────────────────────────────────────────────────

function MobileKpis({ data, prevYear }: { data: VentasResumen; prevYear: number }) {
  const k = data.kpis;
  const ventasDelta = k.ventas2025YTD > 0
    ? (k.ventasNetasYTD - k.ventas2025YTD) / k.ventas2025YTD
    : null;
  const best = bestMonthAcrossEmpresas(data.empresas);

  return (
    <div className="grid grid-cols-2 gap-3">
      <KpiTile
        label="Ventas YTD"
        value={formatCompactCurrency(k.ventasNetasYTD)}
        sub={ventasDelta == null
          ? null
          : { text: `${ventasDelta >= 0 ? "+" : ""}${(ventasDelta * 100).toFixed(0)}% vs '${String(prevYear).slice(-2)}`, sign: ventasDelta }}
      />
      <KpiTile
        label="Mejor mes"
        value={best ? formatCompactCurrency(best.value) : "—"}
        sub={best ? { text: best.label, sign: null } : null}
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
    ? "text-stone-500"
    : sub.sign > 0 ? "text-emerald-700" : sub.sign < 0 ? "text-rose-700" : "text-stone-500";
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-3">
      <p className="text-[10px] font-medium uppercase tracking-widest text-stone-500">{label}</p>
      <p className="mt-1 font-mono text-[22px] font-medium leading-tight tracking-tight tabular-nums text-stone-950">
        {value}
      </p>
      {sub && (
        <p className={cn("mt-1 text-[11px] font-medium", subTone)}>
          {sub.text}
        </p>
      )}
    </div>
  );
}

function bestMonthAcrossEmpresas(empresas: EmpresaMonthlySales[]): { label: string; value: number } | null {
  const totals = Array<number>(12).fill(0);
  const hasAny = Array<boolean>(12).fill(false);
  for (const e of empresas) {
    e.ventas2026.forEach((v, i) => {
      if (v != null) { totals[i] += v; hasAny[i] = true; }
    });
  }
  let bestIdx = -1;
  for (let i = 0; i < 12; i++) {
    if (!hasAny[i]) continue;
    if (bestIdx < 0 || totals[i] > totals[bestIdx]) bestIdx = i;
  }
  if (bestIdx < 0) return null;
  const MES_FULL = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
  return { label: MES_FULL[bestIdx], value: totals[bestIdx] };
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
    <div className="flex rounded-lg bg-stone-100 p-0.5" role="tablist">
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
                ? "bg-white text-stone-950 shadow-sm"
                : "text-stone-500 active:text-stone-700"
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
}: {
  data: VentasResumen;
  viewMode: ViewMode;
  granularity: Granularity;
  isClosedYear: boolean;
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

  return (
    <div className="relative overflow-x-auto rounded-xl border border-stone-200 bg-white">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="border-b border-stone-200 bg-stone-50">
            <th
              scope="col"
              className="sticky left-0 z-10 min-w-[120px] border-r border-stone-200 bg-stone-50 px-3 py-2.5 text-left text-[10px] font-medium uppercase tracking-wider text-stone-500"
            >
              Empresa
            </th>
            {cols.map((c, ci) => (
              <th
                key={c}
                scope="col"
                className={cn(
                  "px-2 py-2.5 text-right text-[10px] font-medium uppercase tracking-wider text-stone-500",
                  ci === currentColIdx && "bg-[rgba(15,118,110,0.06)] text-teal-800"
                )}
              >
                {c}
              </th>
            ))}
            <th
              scope="col"
              className="px-2.5 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-stone-950"
            >
              Total
            </th>
            {showProy && (
              <th
                scope="col"
                className="px-2.5 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-stone-950"
              >
                Proyección
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
              <tr key={r.id} className="border-b border-stone-100 last:border-b-0">
                <th
                  scope="row"
                  className="sticky left-0 z-10 min-w-[120px] max-w-[140px] truncate border-r border-stone-200 bg-white px-3 py-2.5 text-left text-xs font-medium text-stone-900"
                >
                  {r.nombre}
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
              </tr>
            );
          })}
          <tr className="bg-stone-900 text-white">
            <th
              scope="row"
              className="sticky left-0 z-10 min-w-[120px] border-r border-stone-700 bg-stone-900 px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider"
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
      <td className={cn("px-2 py-2.5 text-right font-mono text-[11px] tabular-nums text-stone-300", bgCls)}>
        —
      </td>
    );
  }

  return (
    <td className={cn("px-2 py-2.5 text-right font-mono text-[11px] tabular-nums", bgCls)}>
      <span className="inline-flex items-baseline gap-0.5">
        <DeltaArrow delta={delta} mode={mode} />
        <span className="text-stone-900">{renderCell(cur, mode)}</span>
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
    <td className="border-l border-stone-200 px-2.5 py-2.5 text-right font-mono text-[11px] font-semibold tabular-nums text-stone-950">
      <span className="inline-flex items-baseline gap-0.5">
        <DeltaArrow delta={delta} mode={mode} />
        <span>{display}</span>
      </span>
    </td>
  );
}

function MobileProyCell({ proyeccion }: { proyeccion: ProyeccionEmpresa | null }) {
  if (!proyeccion) {
    return (
      <td className="border-l border-stone-200 px-2.5 py-2.5 text-right font-mono text-[11px] tabular-nums text-stone-300">
        —
      </td>
    );
  }
  return (
    <td className="border-l border-stone-200 px-2.5 py-2.5 text-right font-mono text-[11px] font-semibold tabular-nums text-teal-700">
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
    return <td className={cn("px-2 py-2.5 text-right font-mono text-[11px] tabular-nums text-stone-500", bgCls)}>—</td>;
  }

  return (
    <td className={cn("px-2 py-2.5 text-right font-mono text-[11px] font-medium tabular-nums", bgCls)}>
      <span className="inline-flex items-baseline gap-0.5">
        <DeltaArrow delta={delta} mode={mode} dark />
        <span className="text-white">{renderCell(cur, mode)}</span>
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
    <td className="border-l border-stone-700 px-2.5 py-2.5 text-right font-mono text-[11px] font-semibold tabular-nums text-white">
      <span className="inline-flex items-baseline gap-0.5">
        <DeltaArrow delta={d} mode={mode} dark />
        <span>{display}</span>
      </span>
    </td>
  );
}

function MobileProyGrupoCell({ proyeccion }: { proyeccion: ProyeccionResp }) {
  return (
    <td className="border-l border-stone-700 px-2.5 py-2.5 text-right font-mono text-[11px] font-semibold tabular-nums text-teal-200">
      {formatCompactCurrency(proyeccion.totales_grupo.proyeccion_cierre)}
    </td>
  );
}

function DeltaArrow({
  delta,
  mode,
  dark,
}: {
  delta: number | null;
  mode: ViewMode;
  dark?: boolean;
}) {
  if (delta == null) return null;
  const threshold = mode === "margen" ? 0.005 : 0.05;
  if (delta > threshold) {
    return <span className={cn("text-[9px]", dark ? "text-emerald-300" : "text-emerald-700")}>▲</span>;
  }
  if (delta < -threshold) {
    return <span className={cn("text-[9px]", dark ? "text-rose-300" : "text-rose-600")}>▼</span>;
  }
  return null;
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

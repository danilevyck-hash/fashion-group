"use client";

import { useState, useTransition } from "react";
import { Card } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Calendar, Info } from "lucide-react";
import type {
  VentasResumen, Multifashion, ProyeccionResp, ProyeccionEmpresa, ProyeccionGrupo,
} from "./types";
import { MONTHS, QUARTERS, fmtMoney, fmtMoneyCompact, fmtPct, kpiDeltaSymbol } from "@/lib/ventas/format";
import { formatDeltaRatio } from "@/lib/ventas/formatDelta";
import { cn } from "@/lib/utils";
import { ResumenViewMobile } from "./ResumenViewMobile";

// Mapeo ventas_id (short) → empresa key snake_case usado por la RPC de
// proyección. Inline para evitar importar server-only de empresa-mapping.
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

function findProyeccionForEmpresa(p: ProyeccionResp, ventasId: string): ProyeccionEmpresa | null {
  const empresaKey = VENTAS_ID_TO_EMPRESA_KEY[ventasId] ?? ventasId;
  return p.empresas.find(e => e.empresa === empresaKey) ?? null;
}


type Granularity = "mensual" | "trimestral";
type ViewMode = "ventas" | "utilidad" | "margen";

// Una celda de la matriz carga las 4 fuentes siempre: ventas y utilidad
// para el período actual + año previo. Margen se deriva. Esto habilita el
// tooltip enriquecido (3 métricas a la vez) y el toggle margen sin requerir
// volver a buildear cells por mode.
type Cell = {
  ventas: number | null;
  ventasPrev: number;
  utilidad: number | null;
  utilidadPrev: number;
  periodLabel: string;
};

// Aggregate: misma forma que Cell pero sin label (se construye on the fly
// para los totales de columna y los totales YTD).
type Agg = Omit<Cell, "periodLabel">;

// Threshold para mostrar margen: por debajo de $100 de ventas el ratio
// utilidad/ventas no es informativo (mismo guard que Detalle Mensual).
const MARGEN_VENTAS_MIN = 100;

function marginRatio(ventas: number, utilidad: number): number | null {
  if (ventas < MARGEN_VENTAS_MIN) return null;
  return utilidad / ventas;
}

// Devuelve el valor de la celda en el modo activo. Para margen: ratio 0..1
// o null si no hay base suficiente. Para ventas/utilidad: número o null.
function cellValue(c: Pick<Cell, "ventas" | "utilidad">, mode: ViewMode): number | null {
  if (c.ventas == null || c.utilidad == null) {
    return mode === "margen" ? null : (mode === "utilidad" ? c.utilidad : c.ventas);
  }
  if (mode === "margen")   return marginRatio(c.ventas, c.utilidad);
  if (mode === "utilidad") return c.utilidad;
  return c.ventas;
}

function cellPrevValue(c: Pick<Cell, "ventasPrev" | "utilidadPrev">, mode: ViewMode): number {
  if (mode === "margen") return marginRatio(c.ventasPrev, c.utilidadPrev) ?? 0;
  if (mode === "utilidad") return c.utilidadPrev;
  return c.ventasPrev;
}

// Delta entre cur y prev en el modo activo:
//   - 'margen': diferencia de ratios (decimal), p. ej. -0.038 = -3.8 pts.
//   - 'ventas'/'utilidad': ratio normal (cur-prev)/prev.
// null cuando no es comparable (sin cur, o sin base prev suficiente).
function cellDelta(c: Cell, mode: ViewMode): number | null {
  const cur = cellValue(c, mode);
  if (cur == null) return null;
  if (mode === "margen") {
    const prevMargen = marginRatio(c.ventasPrev, c.utilidadPrev);
    if (prevMargen == null) return null;
    return cur - prevMargen;
  }
  const prev = cellPrevValue(c, mode);
  if (prev <= 0) return null;
  return (cur - prev) / prev;
}

// "n/a" en la celda: cuando hay valor actual pero no hay base comparativa.
function isNaComparison(c: Pick<Cell, "ventasPrev" | "utilidadPrev">, mode: ViewMode): boolean {
  if (mode === "margen") return marginRatio(c.ventasPrev, c.utilidadPrev) == null;
  return cellPrevValue(c, mode) <= 0;
}

// Renderiza el valor primario de una celda según mode. Margen: "42.3%".
// Ventas/utilidad: $X compacto.
function renderCellValue(v: number | null, mode: ViewMode): string {
  if (v == null) return "—";
  if (mode === "margen") return (v * 100).toFixed(1) + "%";
  return fmtMoneyCompact(v);
}

function deltaModeFor(mode: ViewMode): "pct" | "pts" {
  return mode === "margen" ? "pts" : "pct";
}


interface ResumenViewProps {
  data: VentasResumen;
  /** Datos retail/wholesale de Multifashion. Cuando está disponible, la fila
   *  "Multifashion" del heatmap muestra tooltip con desglose retail / mayoreo. */
  multi: Multifashion | null;
  availableYears: number[];
  selectedYear: number;
  isClosedYear: boolean;
  loading: boolean;
  error: string | null;
  onYearChange: (year: number) => void;
}

export function ResumenView({
  data, multi, selectedYear, isClosedYear, loading, error,
}: ResumenViewProps) {
  const [granularity, setGranularity] = useState<Granularity>("mensual");
  const [viewMode, setViewMode] = useState<ViewMode>("ventas");
  const [, startTransition] = useTransition();
  const k = data.kpis;
  const prevYear = selectedYear - 1;
  const isUtil = viewMode === "utilidad";
  const isMargen = viewMode === "margen";

  const onToggleMode = (mode: ViewMode) => {
    startTransition(() => setViewMode(mode));
  };

  // Disclaimer/footer cuando el año en curso tiene mes parcial — same-period
  // day-by-day ya aplicado en la RPC ventas_dashboard_prev_same_period.
  // El texto se adapta a la granularidad activa (mensual vs trimestral).
  const partialFooter = buildPartialFooter(data, selectedYear, granularity);
  const partialKpiNote = buildPartialKpiNote(data);
  const datePillLabel = buildDatePillLabel(data);
  // Rango formateado del prev YTD ("1 ene – 9 may 2025") para los tooltips
  // de las celdas Total. Se calcula UNA vez por render.
  const prevYtdRange = buildPrevYtdRange(data, prevYear);

  const cols = granularity === "mensual" ? MONTHS : QUARTERS;
  const rows = data.empresas.map(e => {
    // Prev YTD per empresa recortado: la RPC ya devuelve prev[cur_mes]
    // con el cutoff per-empresa aplicado, y omite meses posteriores. Sumar
    // todo el array con null→0 da el YTD ajustado para esa empresa.
    return {
      ...buildRow(
        e.ventas2026, e.ventas2025,
        e.utilidad2026, e.utilidad2025,
        granularity, e.empresa, selectedYear,
      ),
      // margenPct/margenPctPrev YTD canónicos (filtrados por costo>0 en RPC)
      // — los usamos como fuente de verdad en EmpresaTotalCell para que el
      // valor coincida con el KPI "MARGEN PROMEDIO" del banner.
      margenPct:     e.margenPct,
      margenPctPrev: e.margenPctPrev,
    };
  });
  // Aggregates por columna (mes o trim): suma ventas + utilidad de todas
  // las empresas. Cuando ninguna empresa tiene data en ese período, el
  // ventas/utilidad agregados quedan null para que la celda muestre "—".
  const totalColAggs: Agg[] = cols.map((_, ci) => {
    let ventas = 0, ventasPrev = 0, util = 0, utilPrev = 0;
    let hasVentas = false, hasUtil = false;
    rows.forEach(r => {
      const c = r.cells[ci];
      if (c.ventas != null) { ventas += c.ventas; hasVentas = true; }
      ventasPrev += c.ventasPrev;
      if (c.utilidad != null) { util += c.utilidad; hasUtil = true; }
      utilPrev += c.utilidadPrev;
    });
    return {
      ventas:       hasVentas ? ventas : null,
      ventasPrev,
      utilidad:     hasUtil ? util : null,
      utilidadPrev: utilPrev,
    };
  });
  // YTD del Total Grupo: suma todas las empresas, ventas + utilidad.
  const totalYtdAgg: Agg = {
    ventas:       rows.reduce((s, r) => s + r.ventasTotal, 0),
    ventasPrev:   rows.reduce((s, r) => s + r.ventasPrevTotal, 0),
    utilidad:     rows.reduce((s, r) => s + r.utilidadTotal, 0),
    utilidadPrev: rows.reduce((s, r) => s + r.utilidadPrevTotal, 0),
  };

  // La columna "Proyección" en la tabla + el hero al final sólo aplican al
  // año en curso. Año cerrado = ya cerró, no hay nada que proyectar.
  const showProyeccionCol = !isClosedYear && !!data.proyeccion;

  // KPIs YTD del grupo — deltas vs prev year same-period.
  //   ventasDelta   = ratio decimal (0.05 = +5%)
  //   utilidadDelta = ratio decimal
  //   margenDeltaPts = puntos porcentuales (margenYTD y margen2025YTD son ratios 0..1)
  const ventasDelta    = k.ventas2025YTD   > 0 ? (k.ventasNetasYTD - k.ventas2025YTD)  / k.ventas2025YTD   : null;
  const utilidadDelta  = k.utilidad2025YTD > 0 ? (k.utilidadYTD    - k.utilidad2025YTD) / k.utilidad2025YTD : null;
  const margenDeltaPts = (k.margenYTD - k.margen2025YTD) * 100;
  const margenSign     = margenDeltaPts >= 0 ? "▲ +" : "▼ ";

  const periodoLabel = isClosedYear
    ? "Año completo"
    : `${MONTHS[0]}–${MONTHS[Math.max(0, data.mesActual - 1)]} ${selectedYear}`;

  const kpiVentasLabel   = isClosedYear ? `VENTAS NETAS ${selectedYear}` : "VENTAS NETAS YTD";
  const kpiUtilidadLabel = isClosedYear ? `UTILIDAD ${selectedYear}`     : "UTILIDAD YTD";
  const kpiVentasSub   = `${periodoLabel} · ${kpiDeltaSymbol(ventasDelta)} ${fmtPct(ventasDelta)} vs ${prevYear}`;
  const kpiUtilidadSub = `${periodoLabel} · ${kpiDeltaSymbol(utilidadDelta)} ${fmtPct(utilidadDelta)} vs ${prevYear}`;
  const kpiMargenSub   = `${margenSign}${Math.abs(margenDeltaPts).toFixed(1)} pts vs ${prevYear}`;

  return (
    <div className={cn(loading && "opacity-60 pointer-events-none transition-opacity")}>
      {error && (
        <div className="mb-4 rounded-md border border-orange-200 bg-orange-50 px-3 py-2 text-xs text-orange-900">
          No se pudo cargar el año {selectedYear}: {error}
        </div>
      )}

      <ResumenViewMobile
        data={data}
        selectedYear={selectedYear}
        isClosedYear={isClosedYear}
        viewMode={viewMode}
        setViewMode={onToggleMode}
        granularity={granularity}
        setGranularity={setGranularity}
      />

      <div className="hidden md:block space-y-5">
      {/* KPI cards YTD del grupo — 3 cols (Ventas Netas / Utilidad / Margen).
          Comparativo same-period vs prev year (ya viene aplicado desde la RPC
          ventas_dashboard_prev_same_period). El toggle de la matriz no afecta
          el banner: siempre muestra el panorama completo. */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <KpiCard
          label={kpiVentasLabel}
          value={fmtMoney(k.ventasNetasYTD)}
          sub={kpiVentasSub}
        />
        <KpiCard
          label={kpiUtilidadLabel}
          value={fmtMoney(k.utilidadYTD)}
          sub={kpiUtilidadSub}
        />
        <KpiCard
          label="MARGEN PROMEDIO"
          value={`${(k.margenYTD * 100).toFixed(1)}%`}
          sub={kpiMargenSub}
        />
      </div>
      {partialKpiNote && (
        <p className="-mt-3 text-[11px] text-stone-400">{partialKpiNote}</p>
      )}

      {/* Toolbar — subtitle + date pill (left) · controls (right) */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs text-stone-500">
            Mostrando {isMargen ? "margen " : isUtil ? "utilidad " : ""}
            {granularity === "mensual" ? "mes a mes" : "por trimestre"} · comparando vs {prevYear}
          </p>
          {datePillLabel && (
            <span className="inline-flex items-center gap-1 rounded-full border border-stone-200 bg-white px-2.5 py-0.5 text-[11px] font-medium text-stone-600">
              <Calendar className="h-3 w-3 text-stone-400" />
              {datePillLabel}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-full bg-stone-100 p-0.5 text-xs">
            {(["ventas", "utilidad", "margen"] as const).map(m => (
              <button
                key={m}
                onClick={() => onToggleMode(m)}
                className={cn(
                  "rounded-full px-3.5 py-1.5 font-medium capitalize transition",
                  viewMode === m
                    ? "bg-white text-stone-950 shadow-sm"
                    : "text-stone-500 hover:text-stone-700"
                )}
              >
                {m === "ventas" ? "Ventas" : m === "utilidad" ? "Utilidad" : "Margen %"}
              </button>
            ))}
          </div>
          {/* Bug #1 fix: selector año global vive ahora en VentasShell header,
              visible desde cualquier tab. No se duplica aquí. */}
          <div className="inline-flex rounded-full bg-stone-100 p-0.5 text-xs">
            {(["mensual", "trimestral"] as const).map(g => (
              <button
                key={g}
                onClick={() => setGranularity(g)}
                className={cn(
                  "rounded-full px-3.5 py-1.5 font-medium transition",
                  granularity === g
                    ? "bg-white text-stone-950 shadow-sm"
                    : "text-stone-500 hover:text-stone-700"
                )}
              >
                {g === "mensual" ? "Mensual" : "Trimestral"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Heatmap table */}
      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse" style={{ minWidth: granularity === "mensual" ? 1100 : 700 }}>
            <thead>
              <tr className="bg-stone-100 text-left">
                <th className="sticky left-0 z-10 min-w-[180px] bg-stone-100 px-3.5 py-3.5 text-[11px] font-medium uppercase tracking-wider text-stone-500">
                  Empresa
                </th>
                {cols.map(c => (
                  <th key={c} className="px-2.5 py-3.5 text-right text-[11px] font-medium uppercase tracking-wider text-stone-500">
                    {c}
                  </th>
                ))}
                <th className="px-3.5 py-3.5 text-right text-[11px] font-semibold uppercase tracking-wider text-stone-950">Total</th>
                {/* Columna "Proyección": sólo años en curso con data de
                    proyección disponible (no aplica a años cerrados). */}
                {showProyeccionCol && (
                  <th className="px-3.5 py-3.5 text-right text-[11px] font-semibold uppercase tracking-wider text-stone-950">Proyección</th>
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.empresa.id} className={r.empresa.id === "multi" ? "bg-teal-50/60" : ""}>
                  <td className={cn(
                    "sticky left-0 z-10 whitespace-nowrap border-b border-stone-200 px-3.5 py-3.5 text-sm text-stone-950",
                    r.empresa.id === "multi" ? "bg-teal-50" : "bg-white"
                  )}>
                    {r.empresa.id === "multi" && multi && multi.wholesale.ytdVentas > 0 ? (
                      <MultifashionNameWithBreakdown
                        nombre={r.empresa.nombre}
                        retailYtd={multi.retail.ytdVentas}
                        wholesale={multi.wholesale}
                      />
                    ) : (
                      <span className="inline-flex items-center gap-1.5">{r.empresa.nombre}</span>
                    )}
                  </td>
                  {r.cells.map((c, ci) => (
                    <HeatCell key={ci} cell={c} mode={viewMode} prevYear={prevYear} />
                  ))}
                  <EmpresaTotalCell
                    ventasTotal={r.ventasTotal}
                    ventasPrevTotal={r.ventasPrevTotal}
                    utilidadTotal={r.utilidadTotal}
                    utilidadPrevTotal={r.utilidadPrevTotal}
                    margenPctYtd={r.margenPct}
                    margenPctPrevYtd={r.margenPctPrev}
                    mode={viewMode}
                    selectedYear={selectedYear}
                    prevYear={prevYear}
                    prevYtdRange={prevYtdRange}
                  />
                  {showProyeccionCol && (
                    <EmpresaProjectionCell
                      proyeccion={findProyeccionForEmpresa(data.proyeccion!, r.empresa.id)}
                      mesCorte={data.proyeccion!.mes_corte}
                      prevYear={prevYear}
                    />
                  )}
                </tr>
              ))}
              <tr className="bg-stone-950 text-white">
                <td className="sticky left-0 z-10 bg-stone-950 px-3.5 py-3.5 text-xs font-medium uppercase tracking-widest">Total Grupo</td>
                {totalColAggs.map((agg, ci) => (
                  <TotalGroupCell
                    key={ci}
                    agg={agg}
                    mode={viewMode}
                    periodLabel={`${cols[ci]} ${selectedYear}`}
                    prevYear={prevYear}
                  />
                ))}
                <TotalGroupAnnualCell
                  agg={totalYtdAgg}
                  mode={viewMode}
                  selectedYear={selectedYear}
                  prevYear={prevYear}
                  prevYtdRange={prevYtdRange}
                />
                {showProyeccionCol && (
                  <TotalGroupProjectionCell totales={data.proyeccion!.totales_grupo} />
                )}
              </tr>
            </tbody>
          </table>
        </div>
        {partialFooter && (
          <p className="border-t border-stone-200 bg-stone-50 px-3.5 py-2 text-xs text-stone-500">
            {partialFooter}
          </p>
        )}
      </Card>

      {/* Legend simple — solo arrow + dirección del delta. Sin swatch
          (la matriz ya no tiene fondos heatmap). */}
      <div className="flex flex-wrap items-center gap-4 text-[11px] text-stone-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="text-emerald-700">▲</span>
          {isMargen ? `vs ${prevYear} mayor a +0.5 pts` : `vs ${prevYear} mayor a +5%`}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="text-red-700">▼</span>
          {isMargen ? "menor a −0.5 pts" : "menor a −5%"}
        </span>
        {!isClosedYear && (
          <span className="inline-flex items-center gap-1.5"><span className="text-stone-400">—</span>sin data</span>
        )}
      </div>

      {/* Hero proyección de cierre — al final como conclusión, no premisa.
          La matriz mes-a-mes es lo central; este hero resume el cierre
          proyectado del año en curso comparado vs el cierre real prev. */}
      {!isClosedYear && data.proyeccion && data.proyeccion.totales_grupo.ventas_ytd > 0 && (
        <ProyeccionHero proyeccion={data.proyeccion} selectedYear={selectedYear} prevYear={prevYear} />
      )}
      </div>
    </div>
  );
}

/** KPI card — label uppercase + monto Geist Mono + sub con delta vs prev year. */
function KpiCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card className="border-stone-200 bg-white p-4">
      <p className="text-[10.5px] font-medium uppercase tracking-widest text-stone-500">{label}</p>
      <p className="mt-1.5 font-mono text-[26px] font-medium leading-tight tracking-tight tabular-nums text-stone-950">{value}</p>
      {sub && <p className="mt-1.5 text-xs text-stone-500">{sub}</p>}
    </Card>
  );
}

/**
 * Hero del Resumen — proyección de cierre del año en curso como medidor
 * principal, comparado con el cierre real del año anterior (no vs meta).
 *
 * Layout:
 *   [label uppercase tracking-wide]
 *   [monto grande Geist Mono]   [delta text-secondary]
 *   [subtítulo con cierre prev + YTD actual + %]
 *   [barra simple: real YTD sólido + proyección restante claro + marker prev]
 */
function ProyeccionHero({
  proyeccion, selectedYear, prevYear,
}: {
  proyeccion: ProyeccionResp;
  selectedYear: number;
  prevYear: number;
}) {
  const g = proyeccion.totales_grupo;
  const proy  = g.proyeccion_cierre;
  const delta = g.delta_vs_anio_anterior_total;
  const deltaTone = delta == null
    ? "text-stone-500"
    : delta < 0 ? "text-red-700" : "text-emerald-700";

  return (
    <section className="space-y-2">
      <p className="text-[11px] font-medium uppercase tracking-widest text-stone-500">
        Proyección de cierre {selectedYear}
      </p>
      <p className="font-mono text-4xl font-medium leading-none tracking-tight tabular-nums text-stone-950 md:text-[40px]">
        {fmtMoneyCompact(proy)}
      </p>
      {delta != null && (
        <p className={cn("font-mono text-sm font-medium tabular-nums", deltaTone)}>
          {(delta > 0 ? "+" : "") + fmtMoneyCompact(delta)} vs cierre {prevYear}
        </p>
      )}
    </section>
  );
}

/** Celda de proyección por empresa (al lado del Total YTD).
 *  v5: monto principal + Δ absoluto vs cierre del año anterior. Sin dots de
 *  status, sin comparativo con meta. Hover muestra desglose del cálculo
 *  (algoritmo + fórmula) — transparencia para Daniel.
 */
function EmpresaProjectionCell({
  proyeccion,
  mesCorte,
  prevYear,
}: {
  proyeccion: ProyeccionEmpresa | null;
  mesCorte: number;
  prevYear: number;
}) {
  if (!proyeccion) {
    return (
      <td className="whitespace-nowrap border-b border-stone-200 px-3.5 py-3.5 text-right font-mono text-xs tabular-nums text-stone-400">
        —
      </td>
    );
  }
  const delta = proyeccion.delta_vs_anio_anterior;
  return (
    <td className="whitespace-nowrap border-b border-stone-200 p-0 text-right font-mono text-xs tabular-nums">
      <TooltipProvider delayDuration={120}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="block w-full cursor-help px-3.5 py-3.5 text-right outline-none focus-visible:ring-2 focus-visible:ring-teal-700/30"
            >
              <span className="block text-sm font-medium text-stone-950">{fmtMoneyCompact(proyeccion.proyeccion_cierre)}</span>
              <p className={cn(
                "mt-0.5 text-[10.5px]",
                delta == null ? "text-stone-400" : delta < 0 ? "text-red-700" : delta > 0 ? "text-emerald-700" : "text-stone-500",
              )}>
                {delta == null
                  ? "sin comparativo"
                  : `${delta >= 0 ? "+" : "−"}${fmtMoneyCompact(Math.abs(delta))}`}
              </p>
            </button>
          </TooltipTrigger>
          <TooltipContent
            side="left" align="start" sideOffset={8} collisionPadding={12}
            className="min-w-[280px] max-w-[340px] border-0 bg-stone-950 p-3 text-white shadow-lg"
          >
            <ProjectionBreakdown proyeccion={proyeccion} mesCorte={mesCorte} prevYear={prevYear} />
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </td>
  );
}

function ProjectionBreakdown({
  proyeccion,
  mesCorte,
  prevYear,
}: {
  proyeccion: ProyeccionEmpresa;
  mesCorte: number;
  prevYear: number;
}) {
  const ytd  = proyeccion.ventas_ytd;
  const ytdP = proyeccion.ventas_prev_ytd_sp;
  const ratio = ytdP > 0 ? (ytd - ytdP) / ytdP : null;
  const ratioStr = ratio == null ? "—" : `${ratio >= 0 ? "+" : ""}${(ratio * 100).toFixed(1)}%`;
  const algoLabel = proyeccion.es_fallback_lineal
    ? "Extrapolación lineal (datos insuficientes)"
    : proyeccion.algoritmo === "estacional"
      ? "Estacional"
      : proyeccion.algoritmo === "mixto"
        ? "Mixto"
        : "Lineal";

  return (
    <div className="space-y-2 text-[11px]">
      <div className="flex items-baseline justify-between gap-3 border-b border-white/10 pb-1.5">
        <span className="text-[10px] font-medium uppercase tracking-widest text-stone-300">Algoritmo</span>
        <span className={cn(
          "font-medium",
          proyeccion.es_fallback_lineal ? "text-stone-400" : "text-white",
        )}>
          {algoLabel}
        </span>
      </div>

      <Row label={`YTD ${prevYear + 1}`} value={fmtMoneyCompact(ytd)} />
      <Row label={`YTD ${prevYear} mismo período`} value={ytdP > 0 ? fmtMoneyCompact(ytdP) : "—"} />
      <Row label="Δ vs mismo período" value={ratioStr} />
      <Row label={`Cierre ${prevYear}`} value={fmtMoneyCompact(proyeccion.cierre_anio_anterior)} />

      {proyeccion.algoritmo === "estacional" && proyeccion.frac_ytd_estacional != null && (
        <>
          <Row
            label={`Fracción ${prevYear} al mismo día`}
            value={`${(proyeccion.frac_ytd_estacional * 100).toFixed(1)}%`}
          />
          <Formula>
            Proyección = YTD / fracción = {fmtMoneyCompact(proyeccion.proyeccion_cierre)}
          </Formula>
        </>
      )}

      {proyeccion.algoritmo === "mixto" && proyeccion.factor_final != null && (
        <>
          <Row label="Factor de crecimiento" value={`×${proyeccion.factor_final.toFixed(3)}`} />
          <Formula>
            Proyección = Cierre {prevYear} × factor = {fmtMoneyCompact(proyeccion.proyeccion_cierre)}
          </Formula>
        </>
      )}

      {(proyeccion.algoritmo === "fallback_lineal" || proyeccion.es_fallback_lineal) && mesCorte > 0 && (
        <Formula>
          Proyección = YTD × 12 / {mesCorte} = {fmtMoneyCompact(proyeccion.proyeccion_cierre)}
        </Formula>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-stone-300">{label}</span>
      <span className="font-mono tabular-nums text-white">{value}</span>
    </div>
  );
}

function Formula({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-1 rounded bg-white/5 px-2 py-1.5 font-mono text-[10.5px] leading-snug text-teal-200">
      {children}
    </p>
  );
}

function TotalGroupProjectionCell({ totales }: { totales: ProyeccionGrupo }) {
  const delta = totales.delta_vs_anio_anterior_total;
  return (
    <td className="whitespace-nowrap px-3.5 py-3.5 text-right font-mono text-sm font-semibold tabular-nums">
      <span className="block text-white">{fmtMoneyCompact(totales.proyeccion_cierre)}</span>
      <p className={cn(
        "mt-0.5 text-[10.5px] font-medium",
        delta == null ? "text-stone-300" : delta < 0 ? "text-red-300" : delta > 0 ? "text-emerald-300" : "text-stone-300",
      )}>
        {delta == null
          ? "sin comparativo"
          : `${delta >= 0 ? "+" : "−"}${fmtMoneyCompact(Math.abs(delta))}`}
      </p>
    </td>
  );
}

function HeatCell({ cell, mode, prevYear }: { cell: Cell; mode: ViewMode; prevYear: number }) {
  const cur   = cellValue(cell, mode);
  const delta = cellDelta(cell, mode);
  const dMode = deltaModeFor(mode);
  // v5: matriz limpia sin fondos coloreados. El delta solo afecta el color
  // del texto/arrow, no del bg. Tone derivado inline: rojo si delta < umbral,
  // verde si delta > umbral, stone si neutro.
  const fmt   = formatDeltaRatio(delta, dMode);
  const tone  = delta == null ? "text-stone-500"
              : fmt.tone === "emerald" ? "text-emerald-700"
              : fmt.tone === "orange"  ? "text-red-700"
              : "text-stone-500";

  if (cur == null) {
    // Mes futuro (o sin data aún): si hay dato del mismo mes año anterior,
    // exponemos como tooltip — útil para anticipar "Jun 2026 esperable
    // alrededor de Jun 2025 = $X" sin esperar al cierre.
    const hasPrevForTooltip = cell.ventasPrev > 0 || cell.utilidadPrev > 0;
    if (!hasPrevForTooltip) {
      return (
        <td className="whitespace-nowrap border-b border-stone-200 px-2.5 py-3.5 text-right font-mono text-xs tabular-nums">
          <span className="text-stone-400">—</span>
        </td>
      );
    }
    const prevPeriodLabel = cell.periodLabel.replace(String(prevYear + 1), String(prevYear));
    const prevVal = mode === "utilidad" ? cell.utilidadPrev : cell.ventasPrev;
    return (
      <td className="whitespace-nowrap border-b border-stone-200 p-0 text-right font-mono text-xs tabular-nums">
        <TooltipProvider delayDuration={120}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="block w-full cursor-help px-2.5 py-3.5 text-right outline-none focus-visible:ring-2 focus-visible:ring-teal-700/30"
              >
                <span className="text-stone-400">—</span>
              </button>
            </TooltipTrigger>
            <TooltipContent
              side="bottom" align="end" sideOffset={4} collisionPadding={12}
              className="min-w-[220px] border-0 bg-stone-950 p-3 text-white shadow-lg"
            >
              <div className="space-y-1.5 text-[11px]">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-stone-300">{prevPeriodLabel}</span>
                  <span className="font-mono tabular-nums text-white">{renderCellValue(prevVal, mode)}</span>
                </div>
                <p className="text-[10.5px] text-stone-400">
                  Aún no hay datos de {cell.periodLabel}
                </p>
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </td>
    );
  }

  // "n/a" cuando hay valor actual pero la base prev no permite comparar.
  const isNa = isNaComparison(cell, mode);
  const prevPeriod = cell.periodLabel.replace(String(prevYear + 1), String(prevYear));

  return (
    <td className="whitespace-nowrap border-b border-stone-200 p-0 text-right font-mono text-xs tabular-nums">
      <TooltipProvider delayDuration={120}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="block w-full cursor-help px-2.5 py-3.5 text-right outline-none focus-visible:ring-2 focus-visible:ring-teal-700/30"
            >
              {isNa ? (
                <span className="inline-flex items-baseline gap-1">
                  <span className="text-stone-400">{renderCellValue(cur, mode)}</span>
                  <span className="text-[9px] font-medium text-stone-400">n/a</span>
                </span>
              ) : (
                <span className="inline-flex items-baseline gap-1.5">
                  {fmt.arrow && <span className={cn("text-[10px]", tone)}>{fmt.arrow}</span>}
                  <span className="text-stone-950">{renderCellValue(cur, mode)}</span>
                </span>
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent
            side="bottom" align="end" sideOffset={4} collisionPadding={12}
            className="min-w-[260px] border-0 bg-stone-950 p-3 text-white shadow-lg"
          >
            <CellEnrichedTooltip
              cell={cell}
              dark
              curPeriod={cell.periodLabel}
              prevPeriod={prevPeriod}
              highlightMode={mode}
            />
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </td>
  );
}

/**
 * Tooltip de celda enriquecido: muestra Ventas, Utilidad y Margen del período
 * actual + previo + delta. El mode activo se destaca con texto blanco; los
 * otros dos van en stone-300. Aplica a HeatCell, TotalGroupCell, EmpresaTotalCell
 * y TotalGroupAnnualCell, con variante `dark` (tooltip negro) o light.
 */
function CellEnrichedTooltip({
  cell, curPeriod, prevPeriod, highlightMode, dark,
}: {
  cell: Pick<Cell, "ventas" | "ventasPrev" | "utilidad" | "utilidadPrev">;
  curPeriod: string;
  prevPeriod: string;
  highlightMode: ViewMode;
  dark: boolean;
}) {
  const rows: Array<{ mode: ViewMode; label: string }> = [
    { mode: "ventas",   label: "Ventas" },
    { mode: "utilidad", label: "Utilidad" },
    { mode: "margen",   label: "Margen" },
  ];

  const muted = dark ? "text-stone-400" : "text-stone-500";
  const labelMuted = dark ? "text-stone-300" : "text-stone-500";
  const valueText = dark ? "text-white" : "text-stone-950";
  const divider = dark ? "border-white/10" : "border-stone-200";

  return (
    <div className="space-y-1.5 text-[11px]">
      {/* B4 — header row con labels explícitos sobre cada columna.
          Antes el tooltip mostraba el período sólo arriba (prev/cur en
          extremos) lo que era ambiguo en modo Margen donde la lectura
          requería ubicar a qué columna corresponde cada %. */}
      <div className={cn("grid grid-cols-[auto_1fr_1fr_auto] items-baseline gap-x-3 pb-1.5 border-b", divider)}>
        <span className={cn("text-[10px] font-medium uppercase tracking-widest", muted)}>Métrica</span>
        <span className={cn("text-right text-[10px] font-medium uppercase tracking-widest", muted)}>{prevPeriod}</span>
        <span className={cn("text-right text-[10px] font-medium uppercase tracking-widest", dark ? "text-stone-200" : "text-stone-700")}>{curPeriod}</span>
        <span className={cn("min-w-[64px] text-right text-[10px] font-medium uppercase tracking-widest", muted)}>Δ</span>
      </div>
      {rows.map(({ mode, label }) => {
        const cur  = cellValue(cell, mode);
        const prev = cellPrevValue(cell, mode);
        const delta = cellDelta(cell as Cell, mode);
        const isHighlight = mode === highlightMode;
        const fmt = formatDeltaRatio(delta, deltaModeFor(mode));
        const isNa = isNaComparison(cell, mode);
        const tone = !isHighlight
          ? muted
          : fmt.tone === "emerald" ? (dark ? "text-teal-300" : "text-emerald-700")
          : fmt.tone === "orange"  ? (dark ? "text-orange-300" : "text-orange-700")
          : (dark ? "text-stone-300" : "text-stone-500");
        return (
          <div key={mode} className="grid grid-cols-[auto_1fr_1fr_auto] items-baseline gap-x-3">
            <span className={cn(isHighlight ? (dark ? "text-white font-medium" : "text-stone-950 font-medium") : labelMuted)}>
              {label}
            </span>
            <span className={cn("text-right font-mono tabular-nums", isHighlight ? valueText : muted)}>
              {prev > 0 ? renderCellValue(prev, mode) : "—"}
            </span>
            <span className={cn("text-right font-mono tabular-nums", isHighlight ? valueText : muted)}>
              {cur != null ? renderCellValue(cur, mode) : "—"}
            </span>
            <span className={cn("min-w-[64px] text-right font-mono", tone)}>
              {delta == null
                ? (isNa && cur != null ? "n/a" : "—")
                : `${fmt.arrow ?? ""}${fmt.arrow ? " " : ""}${fmt.displayValue}`}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * TOTAL anual por empresa (última columna). Muestra monto principal y Δ%
 * YoY abajo. Tooltip al hover: YTD curYear, YTD prevYear (recortado al
 * mismo día per-empresa), Δ% — los 3 valores cuadran con la RPC
 * ventas_dashboard_prev_same_period.
 */
function EmpresaTotalCell({
  ventasTotal, ventasPrevTotal, utilidadTotal, utilidadPrevTotal,
  margenPctYtd, margenPctPrevYtd,
  mode, selectedYear, prevYear, prevYtdRange,
}: {
  ventasTotal: number;
  ventasPrevTotal: number;
  utilidadTotal: number;
  utilidadPrevTotal: number;
  /** Margen YTD canónico (filtrado por costo>0 en RPC). En modo margen es la
   *  fuente de verdad para esta celda; coincide con el KPI del banner. */
  margenPctYtd: number;
  margenPctPrevYtd: number;
  mode: ViewMode;
  selectedYear: number;
  prevYear: number;
  prevYtdRange: string;
}) {
  // Para tooltip enriquecido usamos los totales agregados; para el valor
  // visible en margen mode usamos el margenPct canónico de la RPC.
  const enrichedCell: Pick<Cell, "ventas" | "ventasPrev" | "utilidad" | "utilidadPrev"> = {
    ventas: ventasTotal,
    ventasPrev: ventasPrevTotal,
    utilidad: utilidadTotal,
    utilidadPrev: utilidadPrevTotal,
  };

  let cur: number;
  let delta: number | null;
  let displayValue: string;
  if (mode === "margen") {
    cur = margenPctYtd;
    delta = margenPctPrevYtd > 0 ? margenPctYtd - margenPctPrevYtd : null;
    displayValue = (cur * 100).toFixed(1) + "%";
  } else if (mode === "utilidad") {
    cur = utilidadTotal;
    delta = utilidadPrevTotal > 0 ? (utilidadTotal - utilidadPrevTotal) / utilidadPrevTotal : null;
    displayValue = fmtMoney(cur);
  } else {
    cur = ventasTotal;
    delta = ventasPrevTotal > 0 ? (ventasTotal - ventasPrevTotal) / ventasPrevTotal : null;
    displayValue = fmtMoney(cur);
  }
  const dMode = deltaModeFor(mode);
  const fmt = formatDeltaRatio(delta, dMode);
  const tone = deltaTextTone(delta, dMode);

  return (
    <td className="whitespace-nowrap border-b border-stone-200 p-0 text-right font-mono tabular-nums">
      <TooltipProvider delayDuration={120}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="block w-full cursor-help px-3.5 py-3.5 text-right outline-none focus-visible:ring-2 focus-visible:ring-teal-700/30"
            >
              <span className="block text-sm font-medium text-stone-950">{displayValue}</span>
              <span className={cn("mt-0.5 block text-[10.5px]", tone)}>
                {fmt.arrow ? `${fmt.arrow} ` : ""}{fmt.displayValue}{delta != null ? ` vs ${prevYear}` : ""}
              </span>
            </button>
          </TooltipTrigger>
          <TooltipContent
            side="bottom" align="end" sideOffset={4} collisionPadding={12}
            className="min-w-[280px] border-0 bg-stone-950 p-3 text-white shadow-lg"
          >
            <CellEnrichedTooltip
              cell={enrichedCell}
              dark
              curPeriod={`YTD ${selectedYear}`}
              prevPeriod={`YTD ${prevYtdRange}`}
              highlightMode={mode}
            />
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </td>
  );
}

/**
 * Celda de la fila TOTAL GRUPO (fondo bg-stone-950). Muestra monto + arrow
 * inline. Tooltip detalla prev/actual/delta. Esta función SOLO se usa para
 * las celdas mensuales o trimestrales del total grupo — la celda anual del
 * Total grupo vive en TotalGroupAnnualCell con layout monto+chip apilado.
 */
function TotalGroupCell({
  agg, mode, periodLabel, prevYear,
}: {
  agg: Agg;
  mode: ViewMode;
  periodLabel: string;
  prevYear: number;
}) {
  const cur = cellValue(agg, mode);
  if (cur == null) {
    return (
      <td className="whitespace-nowrap px-2.5 py-3.5 text-right font-mono text-xs tabular-nums">
        <span className="text-stone-500">—</span>
      </td>
    );
  }
  // Construyo un Cell mínimo para reusar el tooltip enriquecido.
  const cellLike: Cell = { ...agg, periodLabel };
  const delta = cellDelta(cellLike, mode);
  const dMode = deltaModeFor(mode);
  const fmt = formatDeltaRatio(delta, dMode);
  const arrowTone =
    delta == null              ? "text-stone-300"  :
    fmt.tone === "emerald"     ? "text-emerald-400" :
    fmt.tone === "orange"      ? "text-orange-400"  : "text-stone-300";
  const prevPeriod = periodLabel.replace(String(prevYear + 1), String(prevYear));

  return (
    <td className="whitespace-nowrap p-0 text-right font-mono text-xs tabular-nums">
      <TooltipProvider delayDuration={120}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="block w-full cursor-help px-2.5 py-3.5 text-right outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/40"
            >
              <span className="inline-flex items-baseline gap-1.5">
                {fmt.arrow && <span className={cn("text-[10px]", arrowTone)}>{fmt.arrow}</span>}
                <span className="text-white">{renderCellValue(cur, mode)}</span>
              </span>
            </button>
          </TooltipTrigger>
          <TooltipContent
            side="bottom" align="end" sideOffset={4} collisionPadding={12}
            className="min-w-[260px] border-0 bg-white p-3 text-stone-950 shadow-lg"
          >
            <CellEnrichedTooltip
              cell={agg}
              dark={false}
              curPeriod={periodLabel}
              prevPeriod={prevPeriod}
              highlightMode={mode}
            />
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </td>
  );
}

/**
 * Celda anual del Total Grupo (esquina inferior derecha). Layout monto +
 * Δ% chip apilado, mismo tratamiento que EmpresaTotalCell pero con fondo
 * oscuro y tooltip con bg blanco.
 */
function TotalGroupAnnualCell({
  agg, mode, selectedYear, prevYear, prevYtdRange,
}: {
  agg: Agg;
  mode: ViewMode;
  selectedYear: number;
  prevYear: number;
  prevYtdRange: string;
}) {
  const cellLike: Cell = { ...agg, periodLabel: `YTD ${selectedYear}` };
  const cur = cellValue(agg, mode);
  const delta = cellDelta(cellLike, mode);
  const dMode = deltaModeFor(mode);
  const fmt = formatDeltaRatio(delta, dMode);
  const arrowTone =
    delta == null            ? "text-stone-300"  :
    fmt.tone === "emerald"   ? "text-emerald-300" :
    fmt.tone === "orange"    ? "text-orange-300"  : "text-stone-300";
  const displayValue = cur == null
    ? "—"
    : mode === "margen" ? (cur * 100).toFixed(1) + "%" : fmtMoney(cur);

  return (
    <td className="whitespace-nowrap p-0 text-right font-mono text-sm font-semibold tabular-nums">
      <TooltipProvider delayDuration={120}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="block w-full cursor-help px-3.5 py-3.5 text-right outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/40"
            >
              <span className="block text-white">{displayValue}</span>
              <span className={cn("mt-0.5 block text-[10.5px] font-medium", arrowTone)}>
                {fmt.arrow ? `${fmt.arrow} ` : ""}{fmt.displayValue}{delta != null ? ` vs ${prevYear}` : ""}
              </span>
            </button>
          </TooltipTrigger>
          <TooltipContent
            side="bottom" align="end" sideOffset={4} collisionPadding={12}
            className="min-w-[280px] border-0 bg-white p-3 text-stone-950 shadow-lg"
          >
            <CellEnrichedTooltip
              cell={agg}
              dark={false}
              curPeriod={`YTD ${selectedYear}`}
              prevPeriod={`YTD ${prevYtdRange}`}
              highlightMode={mode}
            />
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </td>
  );
}

/** Sticky-left "Multifashion" label envuelto en tooltip que muestra el
 *  desglose retail vs mayoreo cuando hay data wholesale del año. La
 *  celda numérica del heatmap (el total YTD agregado) no cambia — sigue
 *  mostrando retail + mayoreo combinados. */
function MultifashionNameWithBreakdown({
  nombre, retailYtd, wholesale,
}: {
  nombre: string;
  retailYtd: number;
  wholesale: { ytdVentas: number; topClienteName: string | null; totalClientes: number };
}) {
  const clienteLabel = wholesale.totalClientes > 1
    ? `${wholesale.totalClientes} clientes wholesale`
    : (wholesale.topClienteName ?? "—");
  return (
    <TooltipProvider delayDuration={120}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="inline-flex cursor-help items-center gap-1.5 text-left outline-none focus-visible:underline"
          >
            <span className="underline decoration-dotted decoration-stone-300 underline-offset-4">
              {nombre}
            </span>
            <Info className="h-3 w-3 text-stone-400" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right" align="start" sideOffset={4} collisionPadding={12} className="min-w-[240px] border-0 bg-stone-950 p-3 text-white shadow-lg">
          <div className="text-[11px] font-medium text-white">{nombre}</div>
          <div className="mt-1.5 flex justify-between gap-6 text-[11px]">
            <span className="text-stone-300">Retail</span>
            <span className="font-mono text-white tabular-nums">{fmtMoney(retailYtd)}</span>
          </div>
          <div className="mt-1 flex justify-between gap-6 text-[11px]">
            <span className="text-stone-300">Mayoreo</span>
            <span className="font-mono text-white tabular-nums">{fmtMoney(wholesale.ytdVentas)}</span>
          </div>
          <div className="mt-1.5 border-t border-white/10 pt-1.5 text-[10.5px] text-stone-400">
            {clienteLabel}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers de formato/labels
// ─────────────────────────────────────────────────────────────────────────────

const MES_FULL_RESUMEN = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

// Parsea YYYY-MM-DD como fecha local (sin shift de UTC).
function parseIsoDateResumen(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

// Mapping tonal para delta texto (light bg, estilo Clientes tab).
// El threshold se ajusta según mode: 0.05 (5%) para pct, 0.005 (0.5 pts) para pts.
function deltaTextTone(delta: number | null, mode: "pct" | "pts" = "pct"): string {
  if (delta == null) return "text-stone-500";
  const threshold = mode === "pts" ? 0.005 : 0.05;
  if (delta > threshold)  return "text-emerald-700";
  if (delta < -threshold) return "text-red-600";
  return "text-stone-500";
}

// Pill arriba: "Data actualizada al sábado 9 de mayo 2026"
// Fuente: data.fecha_corte (mismo origen que el footer al pie de la tabla).
function buildDatePillLabel(data: VentasResumen): string | null {
  if (!data.fecha_corte) return null;
  const d = parseIsoDateResumen(data.fecha_corte);
  const weekday = new Intl.DateTimeFormat("es-PA", { weekday: "long" }).format(d);
  const month = new Intl.DateTimeFormat("es-PA", { month: "long" }).format(d);
  return `Data actualizada al ${weekday} ${d.getDate()} de ${month} ${d.getFullYear()}`;
}

// Rango formateado del prev YTD para el tooltip de Total: "1 ene – 9 may 2025"
// cuando hay corte; "todo {prevYear}" cuando se mira un año cerrado.
function buildPrevYtdRange(data: VentasResumen, prevYear: number): string {
  if (!data.dia_corte_anio_anterior) {
    return `${prevYear}`;
  }
  const d = parseIsoDateResumen(data.dia_corte_anio_anterior);
  const mesShort = MONTHS[d.getMonth()].toLowerCase();
  return `${prevYear} (1 ene – ${d.getDate()} ${mesShort})`;
}

// Footer al pie del heatmap. Texto adaptado según granularidad activa:
//   mensual:    "Mayo 2026 en curso · Comparativo vs Mayo 1–9 2025"
//   trimestral: "Q2 2026 parcial · cierra al 9 may · Comparativo vs Q2 2025 mismo período"
// Solo cuando el año en curso tiene mes parcial.
function buildPartialFooter(
  data: VentasResumen,
  year: number,
  granularity: Granularity,
): string | null {
  if (!data.es_periodo_parcial || !data.fecha_corte || !data.dia_corte_anio_anterior) return null;
  const cur = parseIsoDateResumen(data.fecha_corte);
  const prev = parseIsoDateResumen(data.dia_corte_anio_anterior);
  if (granularity === "trimestral") {
    const q = Math.ceil((cur.getMonth() + 1) / 3);
    const curMesShort = MONTHS[cur.getMonth()].toLowerCase();
    return `Q${q} ${year} parcial · cierra al ${cur.getDate()} ${curMesShort} · Comparativo vs Q${q} ${prev.getFullYear()} mismo período`;
  }
  const curMonth = MES_FULL_RESUMEN[cur.getMonth()];
  const prevMonth = MES_FULL_RESUMEN[prev.getMonth()];
  return `${curMonth} ${year} en curso · Comparativo vs ${prevMonth} 1–${prev.getDate()} ${prev.getFullYear()}`;
}

// Chip pequeño debajo del KPI "vs prev year" cuando hay corte day-by-day.
function buildPartialKpiNote(data: VentasResumen): string | null {
  if (!data.es_periodo_parcial || !data.fecha_corte) return null;
  const d = parseIsoDateResumen(data.fecha_corte);
  const mesShort = MONTHS[d.getMonth()].toLowerCase();
  return `Ajustado al día de corte (${d.getDate()} ${mesShort})`;
}

function buildRow(
  ventasCur:  (number | null)[],
  ventasPrev: (number | null)[],
  utilCur:    (number | null)[],
  utilPrev:   (number | null)[],
  granularity: Granularity,
  empresa: { id: string; nombre: string },
  year: number,
): {
  empresa: typeof empresa;
  cells: Cell[];
  // Sumas YTD (sobre las 12 entradas) para totales y aggregates.
  ventasTotal: number;
  ventasPrevTotal: number;
  utilidadTotal: number;
  utilidadPrevTotal: number;
} {
  if (granularity === "mensual") {
    const cells: Cell[] = ventasCur.map((v, i) => ({
      ventas:       v,
      ventasPrev:   ventasPrev[i] ?? 0,
      utilidad:     utilCur[i],
      utilidadPrev: utilPrev[i]   ?? 0,
      periodLabel: `${MONTHS[i]} ${year}`,
    }));
    return {
      empresa,
      cells,
      ventasTotal:       sumYtd(ventasCur),
      ventasPrevTotal:   sumYtd(ventasPrev),
      utilidadTotal:     sumYtd(utilCur),
      utilidadPrevTotal: sumYtd(utilPrev),
    };
  }
  const groups = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [9, 10, 11]];
  const cells: Cell[] = groups.map((q, qi) => {
    const hasVentas   = q.some(i => ventasCur[i] != null);
    const hasUtilidad = q.some(i => utilCur[i]   != null);
    return {
      ventas:        hasVentas   ? q.reduce((s, i) => s + (ventasCur[i] ?? 0), 0) : null,
      ventasPrev:                 q.reduce((s, i) => s + (ventasPrev[i] ?? 0), 0),
      utilidad:      hasUtilidad ? q.reduce((s, i) => s + (utilCur[i]   ?? 0), 0) : null,
      utilidadPrev:               q.reduce((s, i) => s + (utilPrev[i]  ?? 0), 0),
      periodLabel: `${QUARTERS[qi]} ${year}`,
    };
  });
  return {
    empresa,
    cells,
    ventasTotal:       sumYtd(ventasCur),
    ventasPrevTotal:   sumYtd(ventasPrev),
    utilidadTotal:     sumYtd(utilCur),
    utilidadPrevTotal: sumYtd(utilPrev),
  };
}

function sumYtd(arr: (number | null)[]): number {
  return arr.reduce<number>((s, v) => s + (v ?? 0), 0);
}

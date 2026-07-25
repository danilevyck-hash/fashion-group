"use client";

import { useState, useTransition } from "react";
import { Card } from "@/components/ui/card";
import { ChevronRight } from "lucide-react";
import SyncStatus from "@/components/shared/SyncStatus";
import SyncNowButton from "@/components/shared/SyncNowButton";
import { SYNC_NOW_VENTAS_SECUENCIA } from "@/components/shared/syncNowOpciones";
import {
  SWITCH_FACTURAS_EMPRESA_KEYS,
  EMPRESA_KEY_TO_NAME,
} from "@/lib/empresa-mapping";
import type {
  VentasResumen, Multifashion, ProyeccionResp, ProyeccionEmpresa, ProyeccionGrupo,
  EmpresaMonthlySales,
} from "./types";
import { MONTHS, QUARTERS, fmtMoney, fmtMoneyCompact, fmtPct, kpiDeltaSymbol } from "@/lib/ventas/format";
import { formatDeltaRatio } from "@/lib/ventas/formatDelta";
import { buildNotaMayoreo } from "@/lib/ventas/mayoreo";
import {
  cellValue, cellPrevValue, cellDelta, isNaComparison,
  renderCellValue, deltaModeFor, buildFilasMetrica,
  type CeldaBase,
} from "@/lib/ventas/celda";
import { CeldaDetallePanel, type CeldaDetalle } from "./CeldaDetallePanel";
import { cn } from "@/lib/utils";
import { ResumenViewMobile } from "./ResumenViewMobile";
import { ResumenAnual, useResumenAnual } from "./ResumenAnual";
import { EmpresaMesAnioPanel, useResumenMesAnio, type CurrentYtdSamePeriod } from "./ResumenMesAnio";

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


type Granularity = "mensual" | "trimestral" | "anual";
type ViewMode = "ventas" | "utilidad" | "margen";

// Una celda de la matriz carga las 4 fuentes siempre: ventas y utilidad
// para el período actual + año previo. Margen se deriva. Esto habilita el
// panel lateral (3 métricas a la vez) y el toggle margen sin requerir
// volver a buildear cells por mode.
type Cell = CeldaBase & { periodLabel: string };

// Aggregate: misma forma que Cell pero sin label (se construye on the fly
// para los totales de columna y los totales YTD).
type Agg = CeldaBase;


interface ResumenViewProps {
  data: VentasResumen;
  /** Datos retail/wholesale de Multifashion. Cuando está disponible, la fila
   *  "Multifashion" del heatmap muestra cuánto de su total es mayoreo. */
  multi: Multifashion | null;
  availableYears: number[];
  selectedYear: number;
  isClosedYear: boolean;
  loading: boolean;
  error: string | null;
  onYearChange: (year: number) => void;
  /** Reload del bundle tras un "Actualizar ahora" exitoso (mutate del SWR del shell). */
  onReloadData?: () => void;
}

export function ResumenView({
  data, multi, selectedYear, isClosedYear, loading, error, onReloadData,
}: ResumenViewProps) {
  const [granularity, setGranularity] = useState<Granularity>("mensual");
  const [viewMode, setViewMode] = useState<ViewMode>("ventas");
  // Empresa cuyo PANEL mes × año está abierto (drawer desktop / sheet mobile).
  // null = cerrado. Compartido entre la tabla desktop y la mobile.
  const [panelEmpresaId, setPanelEmpresaId] = useState<string | null>(null);
  // Detalle de UNA celda (Ventas/Utilidad/Margen del período, 2026 vs 2025 y Δ).
  // Vive en un panel LATERAL, no en un tooltip encima de la tabla. Compartido
  // entre la tabla desktop y la mobile.
  const [celdaDetalle, setCeldaDetalle] = useState<CeldaDetalle | null>(null);
  const [, startTransition] = useTransition();
  // Modo Anual: matriz empresas × años (mismo MV agregado por año). Fetch perezoso
  // compartido entre la vista desktop y la mobile (una sola llamada).
  const isAnual = granularity === "anual";
  const { data: anualData, error: anualError } = useResumenAnual(isAnual);
  // Histórico mes × año de UNA empresa (mismo MV agregado por empresa/mes/año).
  // Carga perezosa: el endpoint solo se pide al abrir el PRIMER panel; la
  // respuesta trae todas las empresas → abrir otra no refetchea (caché SWR).
  // Cambiar el toggle de métrica no recarga (se deriva en cliente).
  const { data: mesAnioData, error: mesAnioError } = useResumenMesAnio(panelEmpresaId !== null);
  const panelEmpresa = panelEmpresaId ? mesAnioData?.empresas.find((e) => e.id === panelEmpresaId) ?? null : null;
  const panelResumenEmpresa = panelEmpresaId ? data.empresas.find((e) => e.empresa.id === panelEmpresaId) ?? null : null;
  const panelNombre = panelResumenEmpresa?.empresa.nombre ?? panelEmpresa?.nombre ?? "";
  // Δ justo del Total del año en curso: same-period (día-prorrateado) reusando los
  // mismos números que la card YTD del dashboard (ventas2025 ya viene recortado al
  // mismo período). Solo cuando el año visible es el año en curso (no cerrado);
  // los años cerrados conservan su Δ año-vs-año en la propia card.
  const panelCurrentYtd: CurrentYtdSamePeriod | null =
    !isClosedYear && panelResumenEmpresa && mesAnioData?.currentYear === selectedYear
      ? {
          year: selectedYear,
          periodLabel: `${MONTHS[0]}–${MONTHS[Math.max(0, data.mesActual - 1)]}`.toLowerCase(),
          ventas:       sumYtd(panelResumenEmpresa.ventas2026),
          ventasPrev:   sumSlice(panelResumenEmpresa.ventas2025, data.mesActual),
          utilidad:     sumYtd(panelResumenEmpresa.utilidad2026),
          utilidadPrev: sumSlice(panelResumenEmpresa.utilidad2025, data.mesActual),
          margen:       panelResumenEmpresa.margenPct,
          margenPrev:   panelResumenEmpresa.margenPctPrev,
        }
      : null;
  const k = data.kpis;
  const prevYear = selectedYear - 1;

  const onToggleMode = (mode: ViewMode) => {
    startTransition(() => setViewMode(mode));
  };

  // Disclaimer/footer cuando el año en curso tiene mes parcial — same-period
  // day-by-day ya aplicado en la RPC ventas_dashboard_prev_same_period.
  // El texto se adapta a la granularidad activa (mensual vs trimestral).
  const partialFooter = buildPartialFooter(data, selectedYear, granularity);
  // Rango formateado del prev YTD ("1 ene – 9 may 2025") para el panel de
  // las celdas Total. Se calcula UNA vez por render.
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
  // Indicador de mayoreo de la fila Multifashion. En VENTAS el total INCLUYE el
  // mayoreo (es venta del grupo), así que la nota lo declara con su monto para
  // que se entienda la diferencia contra el módulo Multifashion, que muestra
  // retail puro. Monto y conteos son YTD (la fila del heatmap también lo es).
  const multiMayoreoNota = multi
    ? buildNotaMayoreo({
        incluido: true,
        monto: multi.wholesale.ytdVentas,
        clientesCount: multi.wholesale.totalClientes,
        clienteNombre: multi.wholesale.topClienteName,
        facturas: multi.wholesale.ytdTickets,
      })
    : null;

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
        anualData={anualData}
        anualError={anualError}
        onOpenEmpresa={setPanelEmpresaId}
        onOpenCelda={setCeldaDetalle}
        onReloadData={onReloadData}
        multiMayoreoNota={multiMayoreoNota?.texto ?? null}
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

      {/* Mes en curso vs el mismo mes del año anterior (suma del grupo). Solo
          para año en curso. El mes en curso puede ir parcial → se rotula. */}
      {!isClosedYear && data.mesActual >= 1 && (
        <MesVsMesCard
          empresas={data.empresas}
          mesActual={data.mesActual}
          year={selectedYear}
        />
      )}
      {/* Toolbar — sync pill (left) · controls (right). El meta "Mostrando
          mes a mes vs 2025" y la nota "Ajustado al día de corte (X may)" se
          quitaron por ruido: la tabla muestra las columnas del prev year
          explícitas y el footer "Comparativo vs <mes> 1-X 2025" ya marca
          el cutoff. El pill + warning ámbar son suficientes acá. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <SyncStatus
            tabla="facturas"
            empresasEsperadas={SWITCH_FACTURAS_EMPRESA_KEYS}
            empresaLabels={EMPRESA_KEY_TO_NAME}
            variant="pill"
            prefix="Sincronizado"
          />
          {/* "Actualizar ahora" (admin/secretaria) — la vista es de todas las
              empresas: UN clic actualiza facturas de las 8 EN SECUENCIA (sin
              menú; sesión única Switch — nunca 2 a la vez) + refresh-vistas
              como paso final (rollup mensual y vw de clientes al día). */}
          <SyncNowButton opciones={SYNC_NOW_VENTAS_SECUENCIA} secuencial onSuccess={onReloadData} />
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-full bg-gray-100 p-0.5 text-xs">
            {(["ventas", "utilidad", "margen"] as const).map(m => (
              <button
                key={m}
                onClick={() => onToggleMode(m)}
                className={cn(
                  "rounded-full px-3.5 py-1.5 font-medium capitalize transition",
                  viewMode === m
                    ? "bg-white text-gray-950 shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                )}
              >
                {m === "ventas" ? "Ventas" : m === "utilidad" ? "Utilidad" : "Margen %"}
              </button>
            ))}
          </div>
          {/* Bug #1 fix: selector año global vive ahora en VentasShell header,
              visible desde cualquier tab. No se duplica aquí. */}
          <div className="inline-flex rounded-full bg-gray-100 p-0.5 text-xs">
            {(["mensual", "trimestral", "anual"] as const).map(g => (
              <button
                key={g}
                onClick={() => setGranularity(g)}
                className={cn(
                  "rounded-full px-3.5 py-1.5 font-medium transition",
                  granularity === g
                    ? "bg-white text-gray-950 shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                )}
              >
                {g === "mensual" ? "Mensual" : g === "trimestral" ? "Trimestral" : "Anual"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {isAnual ? (
        <ResumenAnual data={anualData} error={anualError} viewMode={viewMode} />
      ) : (
      <>
      {/* Heatmap table */}
      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse" style={{ minWidth: granularity === "mensual" ? 1100 : 700 }}>
            {/* Cabecera fija al scrollear (sticky top). La esquina Empresa
                queda sticky en ambos ejes (left+top) sobre el resto. */}
            <thead>
              <tr className="bg-gray-100 text-left">
                <th className="sticky left-0 top-0 z-30 min-w-[180px] bg-gray-100 px-3.5 py-3.5 text-xs font-medium uppercase tracking-wide text-gray-500">
                  Empresa
                </th>
                {cols.map(c => (
                  <th key={c} className="sticky top-0 z-20 bg-gray-100 px-2.5 py-3.5 text-right text-xs font-medium uppercase tracking-wide text-gray-500">
                    {c}
                  </th>
                ))}
                <th className="sticky top-0 z-20 bg-gray-100 px-3.5 py-3.5 text-right text-xs font-semibold uppercase tracking-wide text-gray-950">Total</th>
                {/* Columna "Proyección": sólo años en curso con data de
                    proyección disponible (no aplica a años cerrados). */}
                {showProyeccionCol && (
                  <th className="sticky top-0 z-20 bg-gray-100 px-3.5 py-3.5 text-right text-xs font-semibold uppercase tracking-wide text-gray-950">Proyección</th>
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const isMulti = r.empresa.id === "multi";
                const isOpen = panelEmpresaId === r.empresa.id;
                return (
                <tr
                  key={r.empresa.id}
                  className={cn(
                    "group transition-colors",
                    isMulti ? "bg-teal-50/60 hover:bg-teal-100/60" : "hover:bg-gray-50",
                    isOpen && !isMulti && "bg-gray-50",
                  )}
                >
                  {/* El nombre abre el histórico mes × año de la empresa; las
                      celdas de datos abren el panel de detalle del período. */}
                  <td
                    onClick={() => setPanelEmpresaId(r.empresa.id)}
                    aria-haspopup="dialog"
                    className={cn(
                    "sticky left-0 z-10 cursor-pointer whitespace-nowrap border-b border-gray-200 px-3.5 py-3.5 text-sm text-gray-950",
                    isMulti ? "bg-teal-50" : isOpen ? "bg-gray-50" : "bg-white"
                  )}>
                    <div className="flex items-center gap-1.5">
                      {isMulti && multiMayoreoNota ? (
                        <MultifashionNameWithBreakdown
                          nombre={r.empresa.nombre}
                          nota={multiMayoreoNota.texto}
                        />
                      ) : (
                        <span className="inline-flex items-center gap-1.5">{r.empresa.nombre}</span>
                      )}
                      {/* Affordance: abre el panel mes × año de la empresa. */}
                      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-gray-300 transition-colors group-hover:text-gray-500" aria-hidden />
                    </div>
                  </td>
                  {r.cells.map((c, ci) => (
                    <HeatCell
                      key={ci}
                      cell={c}
                      mode={viewMode}
                      prevYear={prevYear}
                      titulo={r.empresa.nombre}
                      onOpen={setCeldaDetalle}
                    />
                  ))}
                  <EmpresaTotalCell
                    titulo={r.empresa.nombre}
                    onOpen={setCeldaDetalle}
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
                      titulo={r.empresa.nombre}
                      onOpen={setCeldaDetalle}
                    />
                  )}
                </tr>
                );
              })}
              <tr className="bg-gray-950 text-white">
                <td className="sticky left-0 z-10 bg-gray-950 px-3.5 py-3.5 text-xs font-medium uppercase tracking-wide">Total Grupo</td>
                {totalColAggs.map((agg, ci) => (
                  <TotalGroupCell
                    key={ci}
                    agg={agg}
                    mode={viewMode}
                    periodLabel={`${cols[ci]} ${selectedYear}`}
                    prevYear={prevYear}
                    onOpen={setCeldaDetalle}
                  />
                ))}
                <TotalGroupAnnualCell
                  agg={totalYtdAgg}
                  mode={viewMode}
                  selectedYear={selectedYear}
                  prevYear={prevYear}
                  prevYtdRange={prevYtdRange}
                  onOpen={setCeldaDetalle}
                />
                {showProyeccionCol && (
                  <TotalGroupProjectionCell totales={data.proyeccion!.totales_grupo} />
                )}
              </tr>
            </tbody>
          </table>
        </div>
        {partialFooter && (
          <p className="border-t border-gray-200 bg-gray-50 px-3.5 py-2 text-xs text-gray-500">
            {partialFooter}
          </p>
        )}
      </Card>

      {/* La leyenda del delta (▲/▼ y su umbral) ya no ocupa una línea fija bajo
          la tabla: vive como tooltip (title=) sobre cada flecha — ver
          leyendaDelta(). El umbral se sigue pudiendo consultar, sin el ruido. */}
      </>
      )}

      </div>

      {/* Panel mes × año de una empresa (drawer desktop / sheet mobile). Único
          en el árbol; lo abren tanto las filas desktop como las mobile. */}
      {/* Detalle de la celda — panel lateral (desktop/iPad) o sheet (celular).
          Reemplaza a los tooltips que se abrían ENCIMA de la tabla. */}
      <CeldaDetallePanel detalle={celdaDetalle} onClose={() => setCeldaDetalle(null)} />

      <EmpresaMesAnioPanel
        open={panelEmpresaId !== null}
        onClose={() => setPanelEmpresaId(null)}
        nombre={panelNombre}
        empresa={panelEmpresa}
        years={mesAnioData?.years ?? []}
        currentYear={mesAnioData?.currentYear ?? null}
        error={mesAnioError}
        viewMode={viewMode}
        onViewMode={onToggleMode}
        currentYtd={panelCurrentYtd}
      />
    </div>
  );
}

/** Tarjeta "mes en curso vs mismo mes del año anterior" (suma del grupo).
 *  Suma ventas2026/ventas2025 de todas las empresas en el índice del mes actual.
 *  El "(en curso)" del rótulo se quitó (limpieza jul-2026): el footer del
 *  heatmap ya declara "Datos hasta el <día>", que es el corte real. */
function MesVsMesCard({
  empresas, mesActual, year,
}: { empresas: EmpresaMonthlySales[]; mesActual: number; year: number }) {
  const idx = mesActual - 1;
  const curr = empresas.reduce((s, e) => s + (e.ventas2026?.[idx] ?? 0), 0);
  const prev = empresas.reduce((s, e) => s + (e.ventas2025?.[idx] ?? 0), 0);
  const delta = prev > 0 ? (curr - prev) / prev : null;
  const up = (delta ?? 0) >= 0;
  const mes = MONTHS[idx] ?? "";
  return (
    <Card className="border-gray-200 bg-white p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
        {mes} {year} vs {mes} {year - 1}
      </p>
      <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-mono text-[26px] font-medium leading-tight tracking-tight tabular-nums text-gray-950">{fmtMoney(curr)}</span>
        {delta !== null && (
          <span className={cn("font-mono text-sm font-medium tabular-nums", up ? "text-emerald-700" : "text-rose-600")}>
            {up ? "▲" : "▼"} {Math.abs(delta * 100).toFixed(0)}%
          </span>
        )}
      </div>
      <p className="mt-1.5 text-xs text-gray-500">
        vs <span className="font-mono tabular-nums">{fmtMoney(prev)}</span> en {mes} {year - 1}
      </p>
    </Card>
  );
}

/** KPI card — label uppercase + monto Geist Mono + sub con delta vs prev year. */
function KpiCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card className="border-gray-200 bg-white p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-1.5 font-mono text-[26px] font-medium leading-tight tracking-tight tabular-nums text-gray-950">{value}</p>
      {sub && <p className="mt-1.5 text-xs text-gray-500">{sub}</p>}
    </Card>
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
  titulo,
  onOpen,
}: {
  proyeccion: ProyeccionEmpresa | null;
  mesCorte: number;
  prevYear: number;
  titulo: string;
  onOpen: (d: CeldaDetalle) => void;
}) {
  if (!proyeccion) {
    return (
      <td className="whitespace-nowrap border-b border-gray-200 px-3.5 py-3.5 text-right font-mono text-xs tabular-nums text-gray-400">
        —
      </td>
    );
  }
  const delta = proyeccion.delta_vs_anio_anterior;
  return (
    <td className="whitespace-nowrap border-b border-gray-200 p-0 text-right font-mono text-xs tabular-nums">
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={() => onOpen({
          kind: "bloque",
          titulo,
          subtitulo: `Proyeccion de cierre ${prevYear + 1}`,
          // El desglose del algoritmo conserva su tratamiento oscuro: es un
          // bloque tecnico dentro del panel, no un tooltip sobre la tabla.
          contenido: (
            <div className="rounded-lg bg-gray-950 p-3 text-white">
              <ProjectionBreakdown proyeccion={proyeccion} mesCorte={mesCorte} prevYear={prevYear} />
            </div>
          ),
        })}
        className="block w-full px-3.5 py-3.5 text-right outline-none transition-colors hover:bg-gray-100/70 focus-visible:ring-2 focus-visible:ring-teal-700/30"
      >
        <span className="block text-sm font-medium text-gray-950">{fmtMoneyCompact(proyeccion.proyeccion_cierre)}</span>
        <p className={cn(
          "mt-0.5 text-xs",
          delta == null ? "text-gray-400" : delta < 0 ? "text-red-700" : delta > 0 ? "text-emerald-700" : "text-gray-500",
        )}>
          {delta == null
            ? "sin comparativo"
            : `${delta >= 0 ? "+" : "−"}${fmtMoneyCompact(Math.abs(delta))}`}
        </p>
      </button>
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
    <div className="space-y-2 text-xs">
      <div className="flex items-baseline justify-between gap-3 border-b border-white/10 pb-1.5">
        <span className="text-xs font-medium uppercase tracking-wide text-gray-300">Algoritmo</span>
        <span className={cn(
          "font-medium",
          proyeccion.es_fallback_lineal ? "text-gray-400" : "text-white",
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
      <span className="text-gray-300">{label}</span>
      <span className="font-mono tabular-nums text-white">{value}</span>
    </div>
  );
}

function Formula({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-1 rounded bg-white/5 px-2 py-1.5 font-mono text-xs leading-snug text-teal-200">
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
        "mt-0.5 text-xs font-medium",
        delta == null ? "text-gray-300" : delta < 0 ? "text-red-300" : delta > 0 ? "text-emerald-300" : "text-gray-300",
      )}>
        {delta == null
          ? "sin comparativo"
          : `${delta >= 0 ? "+" : "−"}${fmtMoneyCompact(Math.abs(delta))}`}
      </p>
    </td>
  );
}

/** Leyenda del delta como TOOLTIP (antes era una línea fija bajo la matriz).
 *  Explica qué significa el color de la flecha y a partir de qué umbral cambia.
 *  Se cuelga con title= de cada ▲/▼ para que siga siendo consultable. */
export function leyendaDelta(mode: ViewMode, prevYear: number): string {
  return mode === "margen"
    ? `▲ vs ${prevYear} mayor a +0.5 pts · ▼ menor a −0.5 pts`
    : `▲ vs ${prevYear} mayor a +5% · ▼ menor a −5%`;
}

function HeatCell({
  cell, mode, prevYear, titulo, onOpen,
}: {
  cell: Cell;
  mode: ViewMode;
  prevYear: number;
  titulo: string;
  onOpen: (d: CeldaDetalle) => void;
}) {
  const cur   = cellValue(cell, mode);
  const delta = cellDelta(cell, mode);
  const fmt   = formatDeltaRatio(delta, deltaModeFor(mode));
  const tone  = delta == null ? "text-gray-500"
              : fmt.tone === "emerald" ? "text-emerald-700"
              : fmt.tone === "orange"  ? "text-red-700"
              : "text-gray-500";
  const prevPeriod = cell.periodLabel.replace(String(prevYear + 1), String(prevYear));

  // Mes futuro sin nada del año anterior: no hay nada que abrir.
  const hasPrev = cell.ventasPrev > 0 || cell.utilidadPrev > 0;
  if (cur == null && !hasPrev) {
    return (
      <td className="whitespace-nowrap border-b border-gray-200 px-2.5 py-3.5 text-right font-mono text-xs tabular-nums">
        <span className="text-gray-400">—</span>
      </td>
    );
  }

  const abrir = () => onOpen({
    kind: "metricas",
    titulo,
    subtitulo: cell.periodLabel,
    prevPeriod,
    curPeriod: cell.periodLabel,
    filas: buildFilasMetrica(cell, mode),
  });

  const isNa = cur != null && isNaComparison(cell, mode);

  // La celda muestra SOLO el valor (y la flecha de direccion, explicada en la
  // leyenda). El delta numerico y el comparativo viven en el panel lateral: la
  // tabla queda limpia y legible de un vistazo.
  return (
    <td className="whitespace-nowrap border-b border-gray-200 p-0 text-right font-mono text-xs tabular-nums">
      <button
        type="button"
        onClick={abrir}
        aria-haspopup="dialog"
        className="block w-full px-2.5 py-3.5 text-right outline-none transition-colors hover:bg-gray-100/70 focus-visible:ring-2 focus-visible:ring-teal-700/30"
      >
        {cur == null ? (
          <span className="text-gray-400">—</span>
        ) : isNa ? (
          <span className="text-gray-400">{renderCellValue(cur, mode)}</span>
        ) : (
          <span className="inline-flex items-baseline gap-1.5">
            {fmt.arrow && <span className={cn("text-xs", tone)} title={leyendaDelta(mode, prevYear)}>{fmt.arrow}</span>}
            <span className="text-gray-950">{renderCellValue(cur, mode)}</span>
          </span>
        )}
      </button>
    </td>
  );
}

/**
 * TOTAL anual por empresa (última columna). Muestra monto principal y Δ%
 * YoY en el panel: YTD curYear, YTD prevYear (recortado al
 * mismo día per-empresa), Δ% — los 3 valores cuadran con la RPC
 * ventas_dashboard_prev_same_period.
 */
function EmpresaTotalCell({
  ventasTotal, ventasPrevTotal, utilidadTotal, utilidadPrevTotal,
  margenPctYtd, margenPctPrevYtd,
  mode, selectedYear, prevYear, prevYtdRange, titulo, onOpen,
}: {
  ventasTotal: number;
  ventasPrevTotal: number;
  utilidadTotal: number;
  utilidadPrevTotal: number;
  /** Margen YTD canonico (filtrado por costo>0 en RPC). En modo margen es la
   *  fuente de verdad para esta celda; coincide con el KPI del banner. */
  margenPctYtd: number;
  margenPctPrevYtd: number;
  mode: ViewMode;
  selectedYear: number;
  prevYear: number;
  prevYtdRange: string;
  titulo: string;
  onOpen: (d: CeldaDetalle) => void;
}) {
  const agg: Agg = {
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
    <td className="whitespace-nowrap border-b border-gray-200 p-0 text-right font-mono tabular-nums">
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={() => onOpen({
          kind: "metricas",
          titulo,
          subtitulo: `Total ${selectedYear}`,
          prevPeriod: `YTD ${prevYtdRange}`,
          curPeriod: `YTD ${selectedYear}`,
          filas: buildFilasMetrica(agg, mode),
        })}
        className="block w-full px-3.5 py-3.5 text-right outline-none transition-colors hover:bg-gray-100/70 focus-visible:ring-2 focus-visible:ring-teal-700/30"
      >
        <span className="inline-flex items-baseline gap-1.5">
          {fmt.arrow && <span className={cn("text-xs", tone)} title={leyendaDelta(mode, prevYear)}>{fmt.arrow}</span>}
          <span className="text-sm font-medium text-gray-950">{displayValue}</span>
        </span>
      </button>
    </td>
  );
}

/**
 * Celda de la fila TOTAL GRUPO (fondo bg-gray-950). Muestra monto + arrow
 * inline. El panel detalla prev/actual/delta. Esta función SOLO se usa para
 * las celdas mensuales o trimestrales del total grupo — la celda anual del
 * Total grupo vive en TotalGroupAnnualCell con layout monto+chip apilado.
 */
function TotalGroupCell({
  agg, mode, periodLabel, prevYear, onOpen,
}: {
  agg: Agg;
  mode: ViewMode;
  periodLabel: string;
  prevYear: number;
  onOpen: (d: CeldaDetalle) => void;
}) {
  const cur = cellValue(agg, mode);
  if (cur == null) {
    return (
      <td className="whitespace-nowrap px-2.5 py-3.5 text-right font-mono text-xs tabular-nums">
        <span className="text-gray-500">—</span>
      </td>
    );
  }
  const cellLike: Cell = { ...agg, periodLabel };
  const delta = cellDelta(cellLike, mode);
  const fmt = formatDeltaRatio(delta, deltaModeFor(mode));
  const arrowTone =
    delta == null              ? "text-gray-300"  :
    fmt.tone === "emerald"     ? "text-emerald-400" :
    fmt.tone === "orange"      ? "text-orange-400"  : "text-gray-300";
  const prevPeriod = periodLabel.replace(String(prevYear + 1), String(prevYear));

  return (
    <td className="whitespace-nowrap p-0 text-right font-mono text-xs tabular-nums">
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={() => onOpen({
          kind: "metricas",
          titulo: "Total Grupo",
          subtitulo: periodLabel,
          prevPeriod,
          curPeriod: periodLabel,
          filas: buildFilasMetrica(agg, mode),
        })}
        className="block w-full px-2.5 py-3.5 text-right outline-none transition-colors hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-emerald-400/40"
      >
        <span className="inline-flex items-baseline gap-1.5">
          {fmt.arrow && <span className={cn("text-xs", arrowTone)} title={leyendaDelta(mode, prevYear)}>{fmt.arrow}</span>}
          <span className="text-white">{renderCellValue(cur, mode)}</span>
        </span>
      </button>
    </td>
  );
}

/**
 * Celda anual del Total Grupo (esquina inferior derecha). Layout monto +
 * Δ% chip apilado, mismo tratamiento que EmpresaTotalCell pero con fondo
 * oscuro; el detalle va al panel lateral.
 */
function TotalGroupAnnualCell({
  agg, mode, selectedYear, prevYear, prevYtdRange, onOpen,
}: {
  agg: Agg;
  mode: ViewMode;
  selectedYear: number;
  prevYear: number;
  prevYtdRange: string;
  onOpen: (d: CeldaDetalle) => void;
}) {
  const cellLike: Cell = { ...agg, periodLabel: `YTD ${selectedYear}` };
  const cur = cellValue(agg, mode);
  const delta = cellDelta(cellLike, mode);
  const fmt = formatDeltaRatio(delta, deltaModeFor(mode));
  const arrowTone =
    delta == null            ? "text-gray-300"  :
    fmt.tone === "emerald"   ? "text-emerald-300" :
    fmt.tone === "orange"    ? "text-orange-300"  : "text-gray-300";
  const displayValue = cur == null
    ? "—"
    : mode === "margen" ? (cur * 100).toFixed(1) + "%" : fmtMoney(cur);

  return (
    <td className="whitespace-nowrap p-0 text-right font-mono text-sm font-semibold tabular-nums">
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={() => onOpen({
          kind: "metricas",
          titulo: "Total Grupo",
          subtitulo: `Total ${selectedYear}`,
          prevPeriod: `YTD ${prevYtdRange}`,
          curPeriod: `YTD ${selectedYear}`,
          filas: buildFilasMetrica(agg, mode),
        })}
        className="block w-full px-3.5 py-3.5 text-right outline-none transition-colors hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-emerald-400/40"
      >
        <span className="inline-flex items-baseline gap-1.5">
          {fmt.arrow && <span className={cn("text-xs", arrowTone)} title={leyendaDelta(mode, prevYear)}>{fmt.arrow}</span>}
          <span className="text-white">{displayValue}</span>
        </span>
      </button>
    </td>
  );
}

/** Etiqueta sticky-left de la fila "Multifashion". El icono de ayuda y su
 *  cuadro flotante se quitaron (tapaban la tabla): el dato que importa —cuánto
 *  del total es mayoreo— ahora se lee directo, sin hover ni clic. */
function MultifashionNameWithBreakdown({
  nombre, nota,
}: {
  nombre: string;
  /** Nota visible: "incluye $X de mayoreo · Y" (buildNotaMayoreo). */
  nota: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span>{nombre}</span>
      {/* Esta fila es american_classic COMPLETA (tienda + mayoreo). Declara
          CUÁNTO es mayoreo para que se entienda la diferencia contra el módulo
          Multifashion, que muestra retail puro. */}
      <span className="block max-w-[190px] whitespace-normal text-xs font-normal leading-tight text-gray-500">
        {nota}
      </span>
    </div>
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
  if (delta == null) return "text-gray-500";
  const threshold = mode === "pts" ? 0.005 : 0.05;
  if (delta > threshold)  return "text-emerald-700";
  if (delta < -threshold) return "text-red-600";
  return "text-gray-500";
}

// Rango formateado del prev YTD para el panel de Total: "1 ene – 9 may 2025"
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
//   mensual:    "Datos hasta el 9 may · Comparativo vs Mayo 1–9 2025"
//   trimestral: "Datos hasta el 9 may · Comparativo vs Q2 2025 mismo período"
// Solo cuando el año en curso tiene mes parcial.
//
// VOCABULARIO (limpieza jul-2026): el pill de arriba dice "Sincronizado <fecha>"
// (cuándo corrió el sync) y este footer "Datos hasta el <día>" (hasta dónde
// llega la data). Son dos cosas distintas y se leen distinto a propósito.
function buildPartialFooter(
  data: VentasResumen,
  year: number,
  granularity: Granularity,
): string | null {
  if (!data.es_periodo_parcial || !data.fecha_corte || !data.dia_corte_anio_anterior) return null;
  const cur = parseIsoDateResumen(data.fecha_corte);
  const prev = parseIsoDateResumen(data.dia_corte_anio_anterior);
  const corte = `Datos hasta el ${cur.getDate()} ${MONTHS[cur.getMonth()].toLowerCase()}`;
  if (granularity === "trimestral") {
    const q = Math.ceil((cur.getMonth() + 1) / 3);
    return `${corte} · Comparativo vs Q${q} ${prev.getFullYear()} mismo período`;
  }
  const prevMonth = MES_FULL_RESUMEN[prev.getMonth()];
  return `${corte} · Comparativo vs ${prevMonth} 1–${prev.getDate()} ${prev.getFullYear()}`;
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

// Suma los primeros n meses (mismo período Ene..mesActual). El prev YTD same-period
// del módulo se calcula así (ver queries.ts → sumSlice/upTo).
function sumSlice(arr: (number | null)[], n: number): number {
  return arr.slice(0, n).reduce<number>((s, v) => s + (v ?? 0), 0);
}

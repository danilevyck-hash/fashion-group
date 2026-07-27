"use client";

// Layout mobile-first del tab Resumen. Visible <md, gated por md:hidden en
// el contenedor. El layout desktop existente queda intacto detrás de
// hidden md:block en ResumenView.tsx.
//
// Estructura: pill de frescura → 3 KPI cards (Ventas/Utilidad/Margen YTD) →
// Toggles segmented → Heatmap con sticky col + mes actual highlighted +
// total grupo dark row.
// Sin tooltips (no hay hover en touch): tocar una celda abre el panel de
// detalle (sheet desde abajo) con Ventas, Utilidad y Margen del período.

import type {
  VentasResumen,
  EmpresaMonthlySales,
  ProyeccionResp,
  ProyeccionEmpresa,
} from "./types";
import { MONTHS, QUARTERS, formatCompactCurrency } from "@/lib/ventas/format";
import { cn } from "@/lib/utils";
import { ChevronRight } from "lucide-react";
import SyncStatus from "@/components/shared/SyncStatus";
import SyncNowButton from "@/components/shared/SyncNowButton";
import { SYNC_NOW_VENTAS_SECUENCIA } from "@/components/shared/syncNowOpciones";
import { SWITCH_FACTURAS_EMPRESA_KEYS, EMPRESA_KEY_TO_NAME } from "@/lib/empresa-mapping";
import { ResumenAnual, type AnualData } from "./ResumenAnual";
import {
  buildSlotsMetrica, cellValue, cellDelta, renderCellValue, celdaKey,
  deltaCelda, isNaComparison, type CeldaBase, type DeltaCelda,
} from "@/lib/ventas/celda";
import { buildSlotsProyeccion, explicacionProyeccion } from "@/lib/ventas/proyeccion-texto";
import { variacionPct } from "@/lib/variacion";

import { FilaDetalleTr, medirFila, TOTAL_GRUPO_ID, type FilaDetalle } from "./FilaDetalle";

/** Color del % bajo el monto en filas claras / en la fila oscura del total. */
function toneDeltaClaro(tone: DeltaCelda["tone"]): string {
  return tone === "emerald" ? "text-emerald-700" : tone === "orange" ? "text-rose-600" : "text-gray-400";
}
function toneDeltaOscuro(tone: DeltaCelda["tone"]): string {
  return tone === "emerald" ? "text-emerald-300" : tone === "orange" ? "text-rose-300" : "text-gray-400";
}

type Granularity = "mensual" | "trimestral" | "anual";
type ViewMode = "ventas" | "utilidad" | "margen";

/** Abridor de detalle que recibe cada celda clicable. */
type AbrirFila = (d: FilaDetalle) => void;

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
  /** Transforma la fila de esa empresa con el detalle. El state vive en
   *  ResumenView (compartido con la tabla desktop), igual que el panel. */
  onAbrirFila: AbrirFila;
  /** Fila transformada, si hay alguna. Solo una a la vez. */
  filaDetalle: FilaDetalle | null;
  onCerrarFila: () => void;
  /** Nota de mayoreo de Multifashion (american_classic), ya formateada por
   *  buildNotaMayoreo: "incluye $X de mayoreo · Y". null si no hubo mayoreo en
   *  el período → no se muestra nada. */
  multiMayoreoNota?: string | null;
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
  onAbrirFila,
  filaDetalle,
  onCerrarFila,
  multiMayoreoNota,
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
          prefix="Sincronizado"
        />
        {/* "Actualizar ahora" (admin/secretaria) — un clic = las 8 empresas en
            secuencia + refresh-vistas como paso final. */}
        <SyncNowButton opciones={SYNC_NOW_VENTAS_SECUENCIA} secuencial onSuccess={onReloadData} />
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
          multiMayoreoNota={multiMayoreoNota}
          onOpenEmpresa={onOpenEmpresa}
          onAbrirFila={onAbrirFila}
          filaDetalle={filaDetalle}
          onCerrarFila={onCerrarFila}
          selectedYear={selectedYear}
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
  const ventasDelta   = variacionPct(k.ventasNetasYTD, k.ventas2025YTD);
  const utilidadDelta = variacionPct(k.utilidadYTD, k.utilidad2025YTD);
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

type CellData = CeldaBase;

function MobileHeatmap({
  data,
  viewMode,
  granularity,
  isClosedYear,
  multiMayoreoNota,
  onOpenEmpresa,
  onAbrirFila,
  filaDetalle,
  onCerrarFila,
  selectedYear,
}: {
  data: VentasResumen;
  viewMode: ViewMode;
  granularity: Granularity;
  isClosedYear: boolean;
  multiMayoreoNota?: string | null;
  onOpenEmpresa: (id: string) => void;
  onAbrirFila: AbrirFila;
  filaDetalle: FilaDetalle | null;
  onCerrarFila: () => void;
  selectedYear: number;
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
    // Las 4 fuentes del YTD, para que el panel de la columna Total muestre
    // Ventas + Utilidad + Margen igual que en desktop.
    ytdCell: {
      ventas: sumSeries(e.ventas2026),
      ventasPrev: sumSeries(e.ventas2025),
      utilidad: sumSeries(e.utilidad2026),
      utilidadPrev: sumSeries(e.utilidad2025),
    } as CellData,
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
  // Columnas que abarca la fila transformada: empresa + períodos + Total (+
  // Proyección cuando aplica).
  const colSpanTabla = 2 + cols.length + (showProy ? 1 : 0);

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
          </tr>
        </thead>
        <tbody>
          {rows.map(r => {
            const proy = showProy
              ? findProyeccionForEmpresa(data.proyeccion!, r.id)
              : null;
            // La fila abierta se TRANSFORMA en su propio lugar (paridad exacta
            // con desktop). Solo una a la vez.
            if (filaDetalle?.filaId === r.id) {
              return (
                <FilaDetalleTr
                  key={r.id}
                  detalle={filaDetalle}
                  colSpan={colSpanTabla}
                  onClose={onCerrarFila}
                  compacto
                />
              );
            }
            return (
              <tr
                key={r.id}
                className="border-b border-gray-100 last:border-b-0"
              >
                <th
                  scope="row"
                  onClick={() => onOpenEmpresa(r.id)}
                  aria-haspopup="dialog"
                  className="sticky left-0 z-10 min-w-[120px] max-w-[150px] cursor-pointer border-r border-gray-200 bg-white px-3 py-3 text-left text-xs font-medium text-gray-900 active:bg-gray-50"
                >
                  <div className="flex items-center gap-1.5">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{r.nombre}</span>
                      {r.id === "multi" && multiMayoreoNota && (
                        /* Nota VISIBLE (paridad con desktop): la fila es american_classic
                           COMPLETA (tienda + mayoreo). Declara CUÁNTO es mayoreo. */
                        <span className="mt-0.5 block whitespace-normal text-xs font-normal leading-tight text-gray-500">
                          {multiMayoreoNota}
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
                    filaId={r.id}
                    columna={String(ci)}
                    titulo={r.nombre}
                    cortoLabel={`${cols[ci].toUpperCase()} ${String(selectedYear).slice(-2)} vs ${String(selectedYear - 1).slice(-2)}`}
                    onAbrir={onAbrirFila}
                  />
                ))}
                <MobileTotalCell
                  ventas={r.ytdTotal.cur}
                  prev={r.ytdTotal.prev}
                  mode={viewMode}
                  margenPct={r.margenPct}
                  margenPctPrev={r.margenPctPrev}
                  cell={r.ytdCell}
                  filaId={r.id}
                  titulo={r.nombre}
                  selectedYear={selectedYear}
                  onAbrir={onAbrirFila}
                />
                {showProy && (
                  <MobileProyCell
                    proyeccion={proy}
                    prevYear={selectedYear - 1}
                    fechaCorte={data.fecha_corte}
                    filaId={r.id}
                    titulo={r.nombre}
                    onAbrir={onAbrirFila}
                  />
                )}
              </tr>
            );
          })}
          {filaDetalle?.filaId === TOTAL_GRUPO_ID ? (
            <FilaDetalleTr
              detalle={filaDetalle}
              colSpan={colSpanTabla}
              onClose={onCerrarFila}
              oscura
              compacto
            />
          ) : (
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
                columna={String(ci)}
                periodLabel={`${cols[ci]} ${selectedYear}`}
                cortoLabel={`${cols[ci].toUpperCase()} ${String(selectedYear).slice(-2)} vs ${String(selectedYear - 1).slice(-2)}`}
                onAbrir={onAbrirFila}
              />
            ))}
            <MobileTotalGrupoYtdCell
              cur={groupYtd.v}
              prev={groupYtd.vp}
              curUtil={groupYtd.u}
              prevUtil={groupYtd.up}
              mode={viewMode}
              data={data}
              selectedYear={selectedYear}
              onAbrir={onAbrirFila}
            />
            {showProy && (
              <MobileProyGrupoCell proyeccion={data.proyeccion!} />
            )}
          </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function MobileCell({
  cell, mode, highlighted, filaId, columna, titulo, cortoLabel, onAbrir,
}: {
  cell: CellData;
  mode: ViewMode;
  highlighted: boolean;
  filaId: string;
  columna: string;
  titulo: string;
  cortoLabel: string;
  onAbrir: AbrirFila;
}) {
  const cur = cellValue(cell, mode);
  const delta = cellDelta(cell, mode);
  const bgCls = highlighted ? "bg-[rgba(15,118,110,0.06)]" : "";

  if (cur == null) {
    return (
      <td className={cn("px-2 py-3 text-right font-mono text-xs tabular-nums text-gray-300", bgCls)}>
        —
      </td>
    );
  }

  // Monto arriba, % del cambio vs el mismo mes del año anterior abajo (más
  // chico). Área táctil de 44px de alto para el pulgar.
  const dc = deltaCelda(delta, mode, isNaComparison(cell, mode));
  const foco = celdaKey("m", filaId, columna);
  return (
    <td className={cn("p-0 text-right font-mono tabular-nums", bgCls)}>
      <button
        type="button"
        data-celda={foco}
        onClick={(e) => onAbrir({
          filaId,
          focoCelda: foco,
          titulo,
          subtitulo: cortoLabel,
          // Sin montos del año previo: en 390 px no entran los 3 datos con el
          // nombre y la ×. El Δ ya dice el cambio.
          slots: buildSlotsMetrica(cell, mode, false),
          ...medirFila(e),
        })}
        className="flex min-h-[44px] w-full flex-col items-end justify-center gap-0.5 px-2 py-2.5 text-right leading-tight active:bg-gray-100"
      >
        <span className="text-xs text-gray-600">{renderCellValue(cur, mode)}</span>
        {dc && <span className={cn("text-[10px]", toneDeltaClaro(dc.tone))}>{dc.texto}</span>}
      </button>
    </td>
  );
}

function MobileTotalCell({
  ventas, prev, mode, margenPct, margenPctPrev, cell, filaId, titulo, selectedYear, onAbrir,
}: {
  ventas: number;
  prev: number;
  mode: ViewMode;
  margenPct: number;
  margenPctPrev: number;
  cell: CellData;
  filaId: string;
  titulo: string;
  selectedYear: number;
  onAbrir: AbrirFila;
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
    delta = variacionPct(ventas, prev);
    display = formatCompactCurrency(cur);
  }
  const dc = deltaCelda(delta, mode, delta == null);
  const foco = celdaKey("m", filaId, "total");
  return (
    <td className="border-l border-gray-200 p-0 text-right font-mono tabular-nums text-gray-950">
      <button
        type="button"
        data-celda={foco}
        onClick={(e) => onAbrir({
          filaId,
          focoCelda: foco,
          titulo,
          subtitulo: `TOTAL ${String(selectedYear).slice(-2)} vs ${String(selectedYear - 1).slice(-2)}`,
          slots: buildSlotsMetrica(cell, mode, false),
          ...medirFila(e),
        })}
        className="flex min-h-[44px] w-full flex-col items-end justify-center gap-0.5 px-2.5 py-2.5 text-right leading-tight active:bg-gray-100"
      >
        <span className="text-xs font-semibold">{display}</span>
        {dc && <span className={cn("text-[10px] font-normal", toneDeltaClaro(dc.tone))}>{dc.texto}</span>}
      </button>
    </td>
  );
}

/**
 * Proyección de cierre por empresa. Antes era un `<td>` mudo: el número estaba
 * pero no había forma de saber de dónde salía en celular. Ahora abre la fila
 * transformada con la explicación en castellano llano, igual que el escritorio.
 */
function MobileProyCell({
  proyeccion, prevYear, fechaCorte, filaId, titulo, onAbrir,
}: {
  proyeccion: ProyeccionEmpresa | null;
  prevYear: number;
  fechaCorte: string | null;
  filaId: string;
  titulo: string;
  onAbrir: AbrirFila;
}) {
  if (!proyeccion) {
    return (
      <td className="border-l border-gray-200 px-2.5 py-3 text-right font-mono text-xs tabular-nums text-gray-300">
        —
      </td>
    );
  }
  const foco = celdaKey("m", filaId, "proy");
  return (
    <td className="border-l border-gray-200 p-0 text-right font-mono tabular-nums">
      <button
        type="button"
        data-celda={foco}
        onClick={(e) => onAbrir({
          filaId,
          focoCelda: foco,
          titulo,
          subtitulo: explicacionProyeccion(proyeccion, prevYear, { fechaCorte, corto: true }),
          slots: buildSlotsProyeccion(proyeccion, prevYear, { fechaCorte, compacto: true }),
          ...medirFila(e),
        })}
        className="flex min-h-[44px] w-full items-center justify-end px-2.5 py-3 text-right text-xs font-semibold text-teal-700 active:bg-gray-100"
      >
        {formatCompactCurrency(proyeccion.proyeccion_cierre)}
      </button>
    </td>
  );
}

function MobileTotalGrupoCell({
  cell, mode, highlighted, columna, periodLabel, cortoLabel, onAbrir,
}: {
  cell: CellData;
  mode: ViewMode;
  highlighted: boolean;
  columna: string;
  periodLabel: string;
  cortoLabel: string;
  onAbrir: AbrirFila;
}) {
  const cur = cellValue(cell, mode);
  const delta = cellDelta(cell, mode);
  const bgCls = highlighted ? "bg-[rgba(15,118,110,0.12)]" : "";

  if (cur == null) {
    return <td className={cn("px-2 py-3 text-right font-mono text-xs tabular-nums text-gray-500", bgCls)}>—</td>;
  }

  const dc = deltaCelda(delta, mode, isNaComparison(cell, mode));
  const foco = celdaKey("m", TOTAL_GRUPO_ID, columna);
  return (
    <td className={cn("p-0 text-right font-mono tabular-nums", bgCls)}>
      <button
        type="button"
        data-celda={foco}
        aria-label={`Total grupo ${periodLabel}`}
        onClick={(e) => onAbrir({
          filaId: TOTAL_GRUPO_ID,
          focoCelda: foco,
          titulo: "Total grupo",
          subtitulo: cortoLabel,
          slots: buildSlotsMetrica(cell, mode, false),
          ...medirFila(e),
        })}
        className="flex min-h-[44px] w-full flex-col items-end justify-center gap-0.5 px-2 py-2.5 text-right leading-tight active:bg-white/10"
      >
        <span className="text-xs font-medium text-white">{renderCellValue(cur, mode)}</span>
        {dc && <span className={cn("text-[10px] font-normal", toneDeltaOscuro(dc.tone))}>{dc.texto}</span>}
      </button>
    </td>
  );
}

function MobileTotalGrupoYtdCell({
  cur, prev, curUtil, prevUtil, mode, data, selectedYear, onAbrir,
}: {
  cur: number;
  prev: number;
  curUtil: number;
  prevUtil: number;
  mode: ViewMode;
  data: VentasResumen;
  selectedYear: number;
  onAbrir: AbrirFila;
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
    d = variacionPct(curUtil, prevUtil);
    display = formatCompactCurrency(v);
  } else {
    v = cur;
    d = variacionPct(cur, prev);
    display = formatCompactCurrency(v);
  }
  const dc = deltaCelda(d, mode, d == null);
  const ytdCell: CellData = { ventas: cur, ventasPrev: prev, utilidad: curUtil, utilidadPrev: prevUtil };
  const foco = celdaKey("m", TOTAL_GRUPO_ID, "total");
  return (
    <td className="border-l border-gray-700 p-0 text-right font-mono tabular-nums text-white">
      <button
        type="button"
        data-celda={foco}
        onClick={(e) => onAbrir({
          filaId: TOTAL_GRUPO_ID,
          focoCelda: foco,
          titulo: "Total grupo",
          subtitulo: `TOTAL ${String(selectedYear).slice(-2)} vs ${String(selectedYear - 1).slice(-2)}`,
          slots: buildSlotsMetrica(ytdCell, mode, false),
          ...medirFila(e),
        })}
        className="flex min-h-[44px] w-full flex-col items-end justify-center gap-0.5 px-2.5 py-2.5 text-right leading-tight active:bg-white/10"
      >
        <span className="text-xs font-semibold">{display}</span>
        {dc && <span className={cn("text-[10px] font-normal", toneDeltaOscuro(dc.tone))}>{dc.texto}</span>}
      </button>
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

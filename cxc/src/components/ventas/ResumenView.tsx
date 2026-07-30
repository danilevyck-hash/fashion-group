"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
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
import { buildNotaMayoreo } from "@/lib/ventas/mayoreo";
import {
  cellValue, cellPrevValue, cellDelta, isNaComparison,
  renderCellValue, buildSlotsMetrica, celdaKey, deltaCelda,
  type CeldaBase, type DeltaCelda,
} from "@/lib/ventas/celda";
import { buildSlotsProyeccion, explicacionProyeccion } from "@/lib/ventas/proyeccion-texto";
import { FilaDetalleTr, medirFila, TOTAL_GRUPO_ID, type FilaDetalle } from "./FilaDetalle";
import { useEscapeClose } from "@/lib/hooks/useModalDismiss";
import { cn } from "@/lib/utils";
import { variacionPct } from "@/lib/variacion";
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

/** Abridor de detalle que recibe cada celda clicable. */
type AbrirFila = (d: FilaDetalle) => void;

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
  // La FILA de esa empresa se transforma en su propio lugar — ni tooltip encima
  // de la tabla ni panel lateral (tapaba las columnas de la derecha). Solo una
  // transformada a la vez, compartida entre la tabla desktop y la mobile.
  const [filaDetalle, setFilaDetalle] = useState<FilaDetalle | null>(null);
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
  // Al cerrar hay que devolver el foco a la celda que se tocó: esa celda no
  // existía en el DOM mientras la fila estaba transformada.
  const raizRef = useRef<HTMLDivElement>(null);
  const focoPendiente = useRef<string | null>(null);
  const cerrarFila = useCallback(() => {
    setFilaDetalle((actual) => {
      focoPendiente.current = actual?.focoCelda ?? null;
      return null;
    });
  }, []);
  useEffect(() => {
    if (filaDetalle || !focoPendiente.current) return;
    const sel = `[data-celda="${focoPendiente.current}"]`;
    focoPendiente.current = null;
    raizRef.current?.querySelector<HTMLElement>(sel)?.focus({ preventScroll: true });
  }, [filaDetalle]);
  useEscapeClose(filaDetalle !== null, cerrarFila);

  const onToggleMode = (mode: ViewMode) => {
    startTransition(() => setViewMode(mode));
  };

  // Disclaimer/footer cuando el año en curso tiene mes parcial — same-period
  // day-by-day ya aplicado en la RPC ventas_dashboard_prev_same_period.
  // El texto se adapta a la granularidad activa (mensual vs trimestral).
  const partialFooter = buildPartialFooter(data, selectedYear, granularity);

  const cols = granularity === "mensual" ? MONTHS : QUARTERS;
  // Columnas que abarca la fila transformada: empresa + períodos + Total (+
  // Proyección cuando aplica).
  const colSpanTabla = 2 + cols.length + (!isClosedYear && data.proyeccion ? 1 : 0);
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
  const ventasDelta    = variacionPct(k.ventasNetasYTD, k.ventas2025YTD);
  const utilidadDelta  = variacionPct(k.utilidadYTD, k.utilidad2025YTD);
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
  // El bloque "mes en curso vs mismo mes del año anterior" solo aplica al año
  // en curso. En un año cerrado el encabezado pegado existe igual, con el
  // recuadro del detalle solo.
  const mostrarMesVsMes = !isClosedYear && data.mesActual >= 1;

  return (
    <div ref={raizRef} className={cn(loading && "opacity-60 pointer-events-none transition-opacity")}>
      {error && (
        <div className="mb-4 rounded-md border border-orange-200 bg-orange-50 px-3 py-2 text-xs text-orange-900">
          No se pudo cargar el año {selectedYear}: {error}
        </div>
      )}

      {/* 🩸 ACÁ VIVÍAN LAS TARJETAS DE CELULAR, Y SE FUERON POR PEDIDO DE DANIEL.
          Textual, 30-jul-2026: *"porq ventas en el celular me cambiastes el
          formato? no me gusta asi, me gusta ver mi tabla completa, o buscar
          otra manera de verlo en el ihpone"*.

          La lectura del problema estaba equivocada. Se había medido el
          ARRASTRE y se lo trató como el defecto; el defecto real era que al
          arrastrar **se perdía la columna de nombres** y dejabas de saber qué
          fila estabas leyendo. Con la primera columna fija, arrastrar deja de
          ser un problema y pasa a ser navegación normal — y la tabla, que es
          lo que Daniel quiere ver, se queda.

          Así que ahora hay UNA sola forma en todos los anchos: la matriz.

          🔑 La columna Empresa va FIJA (`sticky left-0`): al deslizar por los
          meses nunca se pierde de vista de quién es la fila.

          El piso de la matriz sigue bajo a propósito (medido en el #380):
          menos ancho = menos que deslizar. Su mínimo real es 1.098 px contra
          los 1.158 útiles de un escritorio de 1440, así que ahí entra entera y
          no queda nada que arrastrar; en el iPhone se desliza, que es justo lo
          que Daniel pidió. */}
      <div className="space-y-5">
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
      {mostrarMesVsMes && (
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
                  // 44 px: estos dos toggles vivían SOLO en el escritorio y median
                  // 30 de alto. Al dibujar la matriz también en el celular quedaron
                  // bajo el pulgar, y cambian lo que muestra toda la tabla.
                  "inline-flex min-h-[44px] items-center rounded-full px-3.5 font-medium capitalize transition",
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
                  "inline-flex min-h-[44px] items-center rounded-full px-3.5 font-medium transition",
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
                <th className="sticky left-0 top-0 z-30 min-w-[120px] border-r border-gray-200 bg-gray-100 px-2.5 py-3.5 text-xs font-medium uppercase tracking-wide text-gray-500">
                  Empresa
                </th>
                {cols.map(c => (
                  <th key={c} className="sticky top-0 z-20 bg-gray-100 px-1.5 py-3.5 text-right text-xs font-medium uppercase tracking-wide text-gray-500">
                    {c}
                  </th>
                ))}
                <th className="sticky top-0 z-20 bg-gray-100 px-2 py-3.5 text-right text-xs font-semibold uppercase tracking-wide text-gray-950">Total</th>
                {/* Columna "Proyección": sólo años en curso con data de
                    proyección disponible (no aplica a años cerrados). */}
                {showProyeccionCol && (
                  <th className="sticky top-0 z-20 bg-gray-100 px-2 py-3.5 text-right text-xs font-semibold uppercase tracking-wide text-gray-950">Proyección</th>
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const isMulti = r.empresa.id === "multi";
                const isOpen = panelEmpresaId === r.empresa.id;
                // La fila abierta se TRANSFORMA: mismo lugar, mismo alto, sus
                // números reemplazados por el detalle. Solo una a la vez.
                if (filaDetalle?.filaId === r.empresa.id) {
                  return (
                    <FilaDetalleTr
                      key={r.empresa.id}
                      detalle={filaDetalle}
                      colSpan={colSpanTabla}
                      onClose={cerrarFila}
                    />
                  );
                }
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
                      celdas de datos transforman la fila con el detalle. */}
                  <td
                    onClick={() => setPanelEmpresaId(r.empresa.id)}
                    aria-haspopup="dialog"
                    className={cn(
                    // SIN `whitespace-nowrap`: "Confecciones Boston" puede caer en dos
                    // renglones. Partirlo no es abreviarlo —dice lo mismo— y es lo que más
                    // le baja el piso a la tabla: esa columna sola medía 189 px.
                    // `border-r` marca dónde termina lo FIJO y empieza lo que se desliza.
                    // Sin esa línea la columna se lee como parte del resto y el deslizamiento
                    // parece un salto. El fondo opaco (bg-white / bg-teal-50 / bg-gray-50) NO
                    // es decorativo: sin él los meses se ven POR DEBAJO del nombre al deslizar.
                    "sticky left-0 z-10 cursor-pointer border-b border-r border-gray-200 px-2.5 py-3.5 text-sm text-gray-950",
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
                      filaId={r.empresa.id}
                      columna={String(ci)}
                      titulo={r.empresa.nombre}
                      onAbrir={setFilaDetalle}
                    />
                  ))}
                  <EmpresaTotalCell
                    filaId={r.empresa.id}
                    titulo={r.empresa.nombre}
                    onAbrir={setFilaDetalle}
                    ventasTotal={r.ventasTotal}
                    ventasPrevTotal={r.ventasPrevTotal}
                    utilidadTotal={r.utilidadTotal}
                    utilidadPrevTotal={r.utilidadPrevTotal}
                    margenPctYtd={r.margenPct}
                    margenPctPrevYtd={r.margenPctPrev}
                    mode={viewMode}
                    selectedYear={selectedYear}
                    prevYear={prevYear}
                  />
                  {showProyeccionCol && (
                    <EmpresaProjectionCell
                      proyeccion={findProyeccionForEmpresa(data.proyeccion!, r.empresa.id)}
                      prevYear={prevYear}
                      fechaCorte={data.fecha_corte}
                      filaId={r.empresa.id}
                      titulo={r.empresa.nombre}
                      onAbrir={setFilaDetalle}
                    />
                  )}
                </tr>
                );
              })}
              {filaDetalle?.filaId === TOTAL_GRUPO_ID ? (
                <FilaDetalleTr
                  detalle={filaDetalle}
                  colSpan={colSpanTabla}
                  onClose={cerrarFila}
                  oscura
                />
              ) : (
              <tr className="bg-gray-950 text-white">
                <td className="sticky left-0 z-10 border-r border-gray-800 bg-gray-950 px-2.5 py-3.5 text-xs font-medium uppercase tracking-wide">Total Grupo</td>
                {totalColAggs.map((agg, ci) => (
                  <TotalGroupCell
                    key={ci}
                    agg={agg}
                    mode={viewMode}
                    columna={String(ci)}
                    periodLabel={`${cols[ci]} ${selectedYear}`}
                    cortoLabel={`${cols[ci].toUpperCase()} ${String(selectedYear).slice(-2)} vs ${String(prevYear).slice(-2)}`}
                    prevYear={prevYear}
                    onAbrir={setFilaDetalle}
                  />
                ))}
                <TotalGroupAnnualCell
                  agg={totalYtdAgg}
                  mode={viewMode}
                  selectedYear={selectedYear}
                  prevYear={prevYear}
                  onAbrir={setFilaDetalle}
                />
                {showProyeccionCol && (
                  <TotalGroupProjectionCell totales={data.proyeccion!.totales_grupo} />
                )}
              </tr>
              )}
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
          en el árbol; lo abren tanto las filas desktop como las mobile.
          El detalle de la celda ya NO vive acá: está en el encabezado pegado. */}
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
  const delta = variacionPct(curr, prev);
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
 *  Monto principal + Δ absoluto vs cierre del año anterior. Al tocarla, la fila
 *  se transforma y el SUBTÍTULO explica en castellano llano de dónde sale el
 *  número (ver lib/ventas/proyeccion-texto.ts).
 */
function EmpresaProjectionCell({
  proyeccion,
  prevYear,
  fechaCorte,
  filaId,
  titulo,
  onAbrir,
}: {
  proyeccion: ProyeccionEmpresa | null;
  prevYear: number;
  /** YYYY-MM-DD del último día con datos. Da el "al 26 jul" de la explicación. */
  fechaCorte: string | null;
  filaId: string;
  titulo: string;
  onAbrir: AbrirFila;
}) {
  if (!proyeccion) {
    return (
      <td className="whitespace-nowrap border-b border-gray-200 px-2 py-3.5 text-right font-mono text-xs tabular-nums text-gray-400">
        —
      </td>
    );
  }
  const delta = proyeccion.delta_vs_anio_anterior;
  const foco = celdaKey("d", filaId, "proy");
  return (
    <td className="whitespace-nowrap border-b border-gray-200 p-0 text-right font-mono text-xs tabular-nums">
      <button
        type="button"
        data-celda={foco}
        onClick={(e) => onAbrir({
          filaId,
          focoCelda: foco,
          titulo,
          subtitulo: explicacionProyeccion(proyeccion, prevYear, { fechaCorte }),
          slots: buildSlotsProyeccion(proyeccion, prevYear, { fechaCorte }),
          ...medirFila(e),
        })}
        className="block w-full px-2 py-3.5 text-right outline-none transition-colors hover:bg-gray-100/70 focus-visible:ring-2 focus-visible:ring-teal-700/30"
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

function TotalGroupProjectionCell({ totales }: { totales: ProyeccionGrupo }) {
  const delta = totales.delta_vs_anio_anterior_total;
  return (
    <td className="whitespace-nowrap px-2 py-3.5 text-right font-mono text-sm font-semibold tabular-nums">
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

/** "Jul 2026" → "JUL 26 vs 25". El período tocado, en el ancho de un renglón. */
function labelCorto(periodLabel: string, prevYear: number): string {
  const [periodo, anio] = periodLabel.split(" ");
  return `${periodo.toUpperCase()} ${(anio ?? "").slice(-2)} vs ${String(prevYear).slice(-2)}`;
}

function HeatCell({
  cell, mode, prevYear, filaId, columna, titulo, onAbrir,
}: {
  cell: Cell;
  mode: ViewMode;
  prevYear: number;
  filaId: string;
  columna: string;
  titulo: string;
  onAbrir: AbrirFila;
}) {
  const cur   = cellValue(cell, mode);
  const delta = cellDelta(cell, mode);

  // Mes futuro sin nada del año anterior: no hay nada que abrir.
  const hasPrev = cell.ventasPrev > 0 || cell.utilidadPrev > 0;
  if (cur == null && !hasPrev) {
    return (
      <td className="whitespace-nowrap border-b border-gray-200 px-1.5 py-3.5 text-right font-mono text-xs tabular-nums">
        <span className="text-gray-400">—</span>
      </td>
    );
  }

  const foco = celdaKey("d", filaId, columna);
  const isNa = cur != null && isNaComparison(cell, mode);
  const dc = cur == null ? null : deltaCelda(delta, mode, isNa);

  // Monto arriba, % del cambio contra el mismo mes del año anterior abajo. El
  // % tiene que estar A LA VISTA (ver DeltaCelda en lib/ventas/celda.ts): con
  // solo la flecha hay que tocar celda por celda para saber cuánto subió.
  return (
    <td className="whitespace-nowrap border-b border-gray-200 p-0 text-right font-mono text-xs tabular-nums">
      <button
        type="button"
        data-celda={foco}
        onClick={(e) => onAbrir({
          filaId,
          focoCelda: foco,
          titulo,
          subtitulo: labelCorto(cell.periodLabel, prevYear),
          slots: buildSlotsMetrica(cell, mode),
          ...medirFila(e),
        })}
        className="block w-full px-1.5 py-3.5 text-right outline-none transition-colors hover:bg-gray-100/70 focus-visible:ring-2 focus-visible:ring-teal-700/30"
      >
        {cur == null ? (
          <span className="text-gray-400">—</span>
        ) : (
          <span className="flex flex-col items-end leading-tight">
            <span className={isNa ? "text-gray-400" : "text-gray-950"}>{renderCellValue(cur, mode)}</span>
            {dc && (
              <span className={cn("mt-0.5", toneDelta(dc.tone))} title={leyendaDelta(mode, prevYear)}>
                {dc.texto}
              </span>
            )}
          </span>
        )}
      </button>
    </td>
  );
}

/** Color del % bajo el monto en filas claras. */
function toneDelta(tone: DeltaCelda["tone"]): string {
  return tone === "emerald" ? "text-emerald-700" : tone === "orange" ? "text-red-700" : "text-gray-500";
}

/** Idem en la fila oscura del TOTAL GRUPO. */
function toneDeltaOscuro(tone: DeltaCelda["tone"]): string {
  return tone === "emerald" ? "text-emerald-400" : tone === "orange" ? "text-orange-400" : "text-gray-400";
}

/**
 * TOTAL anual por empresa (última columna). Muestra monto principal; al tocarla
 * la fila se transforma con YTD del año, YTD del año previo (recortado al mismo
 * día per-empresa) y Δ — los 3 cuadran con la RPC
 * ventas_dashboard_prev_same_period.
 */
function EmpresaTotalCell({
  ventasTotal, ventasPrevTotal, utilidadTotal, utilidadPrevTotal,
  margenPctYtd, margenPctPrevYtd,
  mode, selectedYear, prevYear, filaId, titulo, onAbrir,
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
  filaId: string;
  titulo: string;
  onAbrir: AbrirFila;
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
    delta = variacionPct(utilidadTotal, utilidadPrevTotal);
    displayValue = fmtMoney(cur);
  } else {
    cur = ventasTotal;
    delta = variacionPct(ventasTotal, ventasPrevTotal);
    displayValue = fmtMoney(cur);
  }
  const dc = deltaCelda(delta, mode, delta == null);
  const foco = celdaKey("d", filaId, "total");

  return (
    <td className="whitespace-nowrap border-b border-gray-200 p-0 text-right font-mono tabular-nums">
      <button
        type="button"
        data-celda={foco}
        onClick={(e) => onAbrir({
          filaId,
          focoCelda: foco,
          titulo,
          subtitulo: `TOTAL ${String(selectedYear).slice(-2)} vs ${String(prevYear).slice(-2)}`,
          slots: buildSlotsMetrica(agg, mode),
          ...medirFila(e),
        })}
        className="block w-full px-2 py-3.5 text-right outline-none transition-colors hover:bg-gray-100/70 focus-visible:ring-2 focus-visible:ring-teal-700/30"
      >
        <span className="flex flex-col items-end leading-tight">
          <span className="text-sm font-medium text-gray-950">{displayValue}</span>
          {dc && (
            <span className={cn("mt-0.5 text-xs", toneDelta(dc.tone))} title={leyendaDelta(mode, prevYear)}>
              {dc.texto}
            </span>
          )}
        </span>
      </button>
    </td>
  );
}

/**
 * Celda de la fila TOTAL GRUPO (fondo bg-gray-950). Muestra monto + arrow
 * inline; al tocarla se transforma la fila oscura entera.
 */
function TotalGroupCell({
  agg, mode, columna, periodLabel, cortoLabel, prevYear, onAbrir,
}: {
  agg: Agg;
  mode: ViewMode;
  columna: string;
  periodLabel: string;
  cortoLabel: string;
  prevYear: number;
  onAbrir: AbrirFila;
}) {
  const cur = cellValue(agg, mode);
  if (cur == null) {
    return (
      <td className="whitespace-nowrap px-1.5 py-3.5 text-right font-mono text-xs tabular-nums">
        <span className="text-gray-500">—</span>
      </td>
    );
  }
  const cellLike: Cell = { ...agg, periodLabel };
  const delta = cellDelta(cellLike, mode);
  const dc = deltaCelda(delta, mode, isNaComparison(agg, mode));
  const foco = celdaKey("d", TOTAL_GRUPO_ID, columna);

  return (
    <td className="whitespace-nowrap p-0 text-right font-mono text-xs tabular-nums">
      <button
        type="button"
        data-celda={foco}
        onClick={(e) => onAbrir({
          filaId: TOTAL_GRUPO_ID,
          focoCelda: foco,
          titulo: "Total Grupo",
          subtitulo: cortoLabel,
          slots: buildSlotsMetrica(agg, mode),
          ...medirFila(e),
        })}
        className="block w-full px-1.5 py-3.5 text-right outline-none transition-colors hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-emerald-400/40"
      >
        <span className="flex flex-col items-end leading-tight">
          <span className="text-white">{renderCellValue(cur, mode)}</span>
          {dc && (
            <span className={cn("mt-0.5", toneDeltaOscuro(dc.tone))} title={leyendaDelta(mode, prevYear)}>
              {dc.texto}
            </span>
          )}
        </span>
      </button>
    </td>
  );
}

/** Celda anual del Total Grupo (esquina inferior derecha). */
function TotalGroupAnnualCell({
  agg, mode, selectedYear, prevYear, onAbrir,
}: {
  agg: Agg;
  mode: ViewMode;
  selectedYear: number;
  prevYear: number;
  onAbrir: AbrirFila;
}) {
  const cellLike: Cell = { ...agg, periodLabel: `YTD ${selectedYear}` };
  const cur = cellValue(agg, mode);
  const delta = cellDelta(cellLike, mode);
  const dc = cur == null ? null : deltaCelda(delta, mode, isNaComparison(agg, mode));
  const displayValue = cur == null
    ? "—"
    : mode === "margen" ? (cur * 100).toFixed(1) + "%" : fmtMoney(cur);
  const foco = celdaKey("d", TOTAL_GRUPO_ID, "total");

  return (
    <td className="whitespace-nowrap p-0 text-right font-mono text-sm font-semibold tabular-nums">
      <button
        type="button"
        data-celda={foco}
        onClick={(e) => onAbrir({
          filaId: TOTAL_GRUPO_ID,
          focoCelda: foco,
          titulo: "Total Grupo",
          subtitulo: `TOTAL ${String(selectedYear).slice(-2)} vs ${String(prevYear).slice(-2)}`,
          slots: buildSlotsMetrica(agg, mode),
          ...medirFila(e),
        })}
        className="block w-full px-2 py-3.5 text-right outline-none transition-colors hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-emerald-400/40"
      >
        <span className="flex flex-col items-end leading-tight">
          <span className="text-white">{displayValue}</span>
          {dc && (
            <span className={cn("mt-0.5 text-xs font-medium", toneDeltaOscuro(dc.tone))} title={leyendaDelta(mode, prevYear)}>
              {dc.texto}
            </span>
          )}
        </span>
      </button>
    </td>
  );
}

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

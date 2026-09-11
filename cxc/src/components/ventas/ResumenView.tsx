"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Card } from "@/components/ui/card";
import { ChevronRight } from "lucide-react";
import SyncNowButton from "@/components/shared/SyncNowButton";
import { SYNC_NOW_VENTAS_SECUENCIA } from "@/components/shared/syncNowOpciones";
import type {
  VentasResumen, Multifashion, ProyeccionResp, ProyeccionEmpresa, ProyeccionGrupo,
  EmpresaMonthlySales,
} from "./types";
import { MONTHS, fmtMoney, fmtMoneyCompact, fmtPct, fmtPorcentaje, kpiDeltaSymbol } from "@/lib/ventas/format";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { exportResumenToExcel } from "@/lib/ventas/excel";
import { ROTULO_DESCARGAR_EXCEL, anotarDescarga } from "@/lib/ventas/descarga";
import { ControlSegmentado } from "./ControlSegmentado";
import { nombreCortoEmpresa } from "@/lib/empresa-mapping";
import { buildNotaMayoreo } from "@/lib/ventas/mayoreo";
import {
  cellValue, cellDelta, isNaComparison, marginRatio,
  renderCellValue, buildSlotsMetrica, celdaKey, deltaCelda,
  type CeldaBase, type DeltaCelda, type ViewMode as ModoCelda,
} from "@/lib/ventas/celda";
import {
  buildSlotsProyeccion, explicacionProyeccion,
  explicacionProyeccionGrupo, deltaProyeccionTexto,
  type ProyeccionGrupoExplicable,
} from "@/lib/ventas/proyeccion-texto";
import {
  mesesProyectadosPorFila, LEYENDA_MESES_PROYECTADOS,
} from "@/lib/ventas/proyeccion-mensual";
import { pieCorteCosto } from "@/lib/ventas/margen-mes-en-curso";
import { FilaDetalleTr, medirFila, TOTAL_GRUPO_ID, type FilaDetalle } from "./FilaDetalle";
import { useEscapeClose } from "@/lib/hooks/useModalDismiss";
import { cn } from "@/lib/utils";
import { variacionPct } from "@/lib/variacion";
import { ResumenViewMobile } from "./ResumenViewMobile";
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

/**
 * 🔴 EL NOMBRE CORTO — «Vistana», «Boston» (diccionario § 0, #4, decidido por
 * Daniel el 5-sep-2026). El nombre largo llega del servidor y acá se traduce
 * por la clave, sin un cuarto mapa: `nombreCortoEmpresa` es el SEGUNDO CAMPO de
 * la misma lista de empresas. Si algún id nuevo no estuviera mapeado, se
 * conserva el nombre que mandó el servidor — nunca se rompe la fila.
 */
export function nombreEmpresaEnPantalla(ventasId: string, nombreLargo: string): string {
  const key = VENTAS_ID_TO_EMPRESA_KEY[ventasId];
  return key ? nombreCortoEmpresa(key) : nombreLargo;
}

/**
 * La proyección del GRUPO, con la parte que `totales_grupo` no trae: cuánto
 * llevaba vendido el año anterior a esta MISMA altura, que es la suma de lo que
 * la RPC ya devolvió por empresa. Se arma acá para que la tarjeta y su
 * explicación salgan del MISMO objeto.
 */
export function proyeccionDelGrupo(p: ProyeccionResp): ProyeccionGrupoExplicable {
  return {
    ventas_ytd: p.totales_grupo.ventas_ytd,
    proyeccion_cierre: p.totales_grupo.proyeccion_cierre,
    cierre_anio_anterior_total: p.totales_grupo.cierre_anio_anterior_total,
    delta_vs_anio_anterior_total: p.totales_grupo.delta_vs_anio_anterior_total,
    ventas_prev_ytd_sp: p.empresas.reduce((s, e) => s + (e.ventas_prev_ytd_sp ?? 0), 0),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 DOS MODOS, NO TRES; UNA GRANULARIDAD, NO TRES (11-sep-2026).
//
// «Utilidad» y «Margen %» eran dos botones para lo mismo: la utilidad de un mes
// y su margen son el MISMO dato visto de dos lados (margen = utilidad ÷ venta).
// Queda «Utilidad», y en ese modo cada celda muestra la utilidad y, debajo,
// chico y gris, el margen %. El detalle de la fila sigue trayendo los tres.
//
// «Trimestral» y «Anual» se retiraron: el detalle anual ya se abre tocando el
// nombre de la empresa (el histórico mes × año), y el trimestre no lo miraba
// nadie. Queda la matriz mensual, que es la que Daniel lee.
// ─────────────────────────────────────────────────────────────────────────────
export type ViewMode = "ventas" | "utilidad";

/** Las opciones del control, EN UN SOLO LUGAR: el escritorio y el celular las
 *  leen de acá para que no puedan volver a decir cosas distintas. */
export const MODO_OPCIONES: { value: ViewMode; label: string }[] = [
  { value: "ventas", label: "Ventas" },
  { value: "utilidad", label: "Utilidad" },
];

/** Abridor de detalle que recibe cada celda clicable. */
type AbrirFila = (d: FilaDetalle) => void;

// Una celda de la matriz carga las 4 fuentes siempre: ventas y utilidad
// para el período actual + año previo. Margen se deriva. Esto habilita el
// detalle de la fila (3 métricas a la vez) sin volver a buildear cells.
type Cell = CeldaBase & { periodLabel: string };

// Aggregate: misma forma que Cell pero sin label (se construye on the fly
// para los totales de columna y los totales YTD).
type Agg = CeldaBase;

/** Ancho fijo de la columna «Proyección»: es lo que la columna «Total» tiene
 *  que dejar libre a su derecha para quedar pegada al lado de ella. */
const ANCHO_PROYECCION_PX = 116;

interface ResumenViewProps {
  data: VentasResumen;
  /** Datos retail/wholesale de Multifashion. Cuando está disponible, la fila
   *  "Multifashion" del heatmap muestra cuánto de su total es mayoreo. */
  multi: Multifashion | null;
  selectedYear: number;
  isClosedYear: boolean;
  loading: boolean;
  error: string | null;
  /** Reload del bundle tras un "Actualizar ahora" exitoso (mutate del SWR del shell). */
  onReloadData?: () => void;
}

export function ResumenView({
  data, multi, selectedYear, isClosedYear, loading, error, onReloadData,
}: ResumenViewProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("ventas");
  // El panel mes × año tiene su propio control de TRES métricas (Ventas ·
  // Utilidad · Margen %): es una matriz de años, y ahí el margen sí es una
  // columna que se mira sola. Arranca en el modo de la matriz.
  const [panelMode, setPanelMode] = useState<ModoCelda>("ventas");
  // Empresa cuyo PANEL mes × año está abierto (drawer desktop / sheet mobile).
  // null = cerrado. Compartido entre la tabla desktop y la mobile.
  const [panelEmpresaId, setPanelEmpresaId] = useState<string | null>(null);
  // Detalle de UNA celda (Ventas/Utilidad/Margen del período, 2026 vs 2025 y Δ).
  // La FILA de esa empresa se transforma en su propio lugar — ni tooltip encima
  // de la tabla ni panel lateral (tapaba las columnas de la derecha). Solo una
  // transformada a la vez, compartida entre la tabla desktop y la mobile.
  const [filaDetalle, setFilaDetalle] = useState<FilaDetalle | null>(null);
  const [, startTransition] = useTransition();
  // Histórico mes × año de UNA empresa (mismo MV agregado por empresa/mes/año).
  // Carga perezosa: el endpoint solo se pide al abrir el PRIMER panel; la
  // respuesta trae todas las empresas → abrir otra no refetchea (caché SWR).
  const { data: mesAnioData, error: mesAnioError } = useResumenMesAnio(panelEmpresaId !== null);
  const panelEmpresa = panelEmpresaId ? mesAnioData?.empresas.find((e) => e.id === panelEmpresaId) ?? null : null;
  const panelResumenEmpresa = panelEmpresaId ? data.empresas.find((e) => e.empresa.id === panelEmpresaId) ?? null : null;
  // El nombre CORTO también en el panel mes × año: es la misma empresa y no
  // puede llamarse distinto según desde dónde se la abra.
  const panelNombre = panelEmpresaId
    ? nombreEmpresaEnPantalla(panelEmpresaId, panelResumenEmpresa?.empresa.nombre ?? panelEmpresa?.nombre ?? "")
    : "";
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
          // La celda del mes en curso compara contra los MISMOS DÍAS del año
          // pasado: es lo que la RPC ya devolvió para ese mes, por empresa.
          mesEnCurso: mesEnCursoMismosDias(data, panelResumenEmpresa),
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
    startTransition(() => {
      setViewMode(mode);
      setPanelMode(mode);
    });
  };

  const [bajando, setBajando] = useState(false);
  // 🔴 BAJA LO QUE ESTÁ EN PANTALLA: la matriz mensual en el modo elegido
  // (Ventas, o Utilidad con su margen). Y deja rastro en `activity_logs`.
  const onExcel = async () => {
    setBajando(true);
    try {
      await exportResumenToExcel(data, viewMode);
      anotarDescarga("resumen", { modo: viewMode, anio: data.year });
    } catch (err) {
      console.error("[ventas/resumen] excel export failed", err);
    } finally {
      setBajando(false);
    }
  };

  // Disclaimer/footer cuando el año en curso tiene mes parcial — same-period
  // day-by-day ya aplicado en la RPC ventas_dashboard_prev_same_period.
  const partialFooter = buildPartialFooter(data);
  // 🔴 «Utilidad y margen de septiembre al 10 de septiembre, el último día con
  // costo cargado» (11-sep-2026). Sin corte (año cerrado, o la RPC del corte
  // todavía no existe) no se dice nada.
  const pieCorte = isClosedYear ? null : pieCorteCosto(data.corte_costo);

  const cols = MONTHS;
  // Columnas que abarca la fila transformada: empresa + 12 meses + Total (+
  // Proyección cuando aplica).
  const colSpanTabla = 2 + cols.length + (!isClosedYear && data.proyeccion ? 1 : 0);
  const rows = data.empresas.map(e => {
    // Prev YTD per empresa recortado: la RPC ya devuelve prev[cur_mes]
    // con el cutoff per-empresa aplicado, y omite meses posteriores. Sumar
    // todo el array con null→0 da el YTD ajustado para esa empresa.
    return {
      ...buildRow(e, selectedYear),
      // margenPct/margenPctPrev YTD canónicos (filtrados por costo>0 en RPC)
      // — los usamos como fuente de verdad en EmpresaTotalCell para que el
      // valor coincida con el KPI "MARGEN" del banner.
      margenPct:     e.margenPct,
      margenPctPrev: e.margenPctPrev,
    };
  });
  // Aggregates por columna (mes): suma ventas + utilidad de todas las
  // empresas. Cuando ninguna empresa tiene data en ese período, el
  // ventas/utilidad agregados quedan null para que la celda muestre "—".
  // La base del margen del mes en curso se suma aparte (`ventasMargen`).
  const totalColAggs: Agg[] = cols.map((_, ci) => {
    let ventas = 0, ventasPrev = 0, util = 0, utilPrev = 0, ventasMargen = 0;
    let hasVentas = false, hasUtil = false;
    rows.forEach(r => {
      const c = r.cells[ci];
      if (c.ventas != null) { ventas += c.ventas; hasVentas = true; }
      ventasPrev += c.ventasPrev;
      if (c.utilidad != null) { util += c.utilidad; hasUtil = true; }
      utilPrev += c.utilidadPrev;
      ventasMargen += c.ventasMargen ?? c.ventas ?? 0;
    });
    return {
      ventas:       hasVentas ? ventas : null,
      ventasPrev,
      utilidad:     hasUtil ? util : null,
      utilidadPrev: utilPrev,
      ventasMargen: hasVentas ? ventasMargen : null,
    };
  });
  // YTD del Total Grupo: suma todas las empresas, ventas + utilidad.
  const totalYtdAgg: Agg = {
    ventas:       rows.reduce((s, r) => s + r.ventasTotal, 0),
    ventasPrev:   rows.reduce((s, r) => s + r.ventasPrevTotal, 0),
    utilidad:     rows.reduce((s, r) => s + r.utilidadTotal, 0),
    utilidadPrev: rows.reduce((s, r) => s + r.utilidadPrevTotal, 0),
  };

  // La columna "Proyección" en la tabla + la tarjeta sólo aplican al
  // año en curso. Año cerrado = ya cerró, no hay nada que proyectar.
  const showProyeccionCol = !isClosedYear && !!data.proyeccion;
  // La columna Total queda pegada al borde derecho, o al lado de Proyección.
  const rightTotal = showProyeccionCol ? ANCHO_PROYECCION_PX : 0;

  // 🔴 LOS MESES QUE FALTAN, EN GRIS (5-sep-2026). Solo en modo Ventas: no
  // existe una utilidad proyectada por mes, y pintar un margen de un mes que no
  // pasó sería inventar el dato. La cuenta entera vive en
  // `lib/ventas/proyeccion-mensual.ts` y la comparte el celular.
  const mesesGris =
    showProyeccionCol && viewMode === "ventas"
      ? mesesProyectadosPorFila(
          data.empresas.map(e => ({ id: e.empresa.id, ventasPrevFull: e.ventasPrevFull ?? [] })),
          data.proyeccion!.mes_corte,
          id => findProyeccionForEmpresa(data.proyeccion!, id),
        )
      : null;

  // KPIs YTD del grupo — deltas vs prev year same-period.
  //   ventasDelta   = ratio decimal (0.05 = +5%)
  //   utilidadDelta = ratio decimal
  //   margenDeltaPts = puntos porcentuales (margenYTD y margen2025YTD son ratios 0..1)
  const ventasDelta    = variacionPct(k.ventasNetasYTD, k.ventas2025YTD);
  const utilidadDelta  = variacionPct(k.utilidadYTD, k.utilidad2025YTD);
  const margenDeltaPts = (k.margenYTD - k.margen2025YTD) * 100;
  const margenSign     = margenDeltaPts >= 0 ? "▲ +" : "▼ ";

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

  // 🔴 LAS TARJETAS LLEVAN SU CIFRA Y SU DELTA, Y NADA MÁS (11-sep-2026).
  // «Ene–Sep 2026 · vs 2025» se repetía en las cuatro y otra vez en el pie: el
  // período lo dice UNA vez el selector de arriba. Contra qué compara queda en
  // el `title` de la tarjeta y en el pie de la matriz (el corte por días).
  const vsTitle = `Comparado con el mismo período de ${prevYear}`;
  const kpiVentasSub   = ventasDelta == null ? null : `${kpiDeltaSymbol(ventasDelta)} ${fmtPct(ventasDelta)}`;
  const kpiUtilidadSub = utilidadDelta == null ? null : `${kpiDeltaSymbol(utilidadDelta)} ${fmtPct(utilidadDelta)}`;
  // ⚠️ Los PUNTOS conservan su decimal a propósito: son la DIFERENCIA entre dos
  // porcentajes, no un porcentaje. A cero decimales «+0.4 pts» se volvería «+0
  // pts», que se lee como «no cambió». La regla sin decimal es para el % (ver
  // `fmtPorcentaje`).
  const kpiMargenSub   = `${margenSign}${Math.abs(margenDeltaPts).toFixed(1)} pts`;
  // El bloque "mes en curso vs mismo mes del año anterior" solo aplica al año
  // en curso.
  const mostrarMesVsMes = !isClosedYear && data.mesActual >= 1;

  return (
    <div ref={raizRef} className={cn(loading && "opacity-60 pointer-events-none transition-opacity")}>
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
        onOpenEmpresa={setPanelEmpresaId}
        onAbrirFila={setFilaDetalle}
        filaDetalle={filaDetalle}
        onCerrarFila={cerrarFila}
        onReloadData={onReloadData}
        onExcel={onExcel}
        bajando={bajando}
        multiMayoreoNota={multiMayoreoNota?.texto ?? null}
      />

      {/* 🩸 EL CORTE NO ES `md` NI `lg` NI `xl`, Y EL MOTIVO ES UN NÚMERO.
          La matriz son 15 columnas (Empresa + 12 meses + Total + Proyección) y
          su ancho MÍNIMO REAL —medido con scripts/_ancho-util-ventas.mjs, que la
          colapsa en una jaula de 1 px para que el navegador parta todo lo que
          pueda— era 1.276 px. Contra el ancho ÚTIL, que es lo que queda después
          de los 223 px de la barra lateral y los 56 del main:

            390 -> 356    810 -> 528    834 -> 552    1024 -> 742
            1194 -> 912   1366 -> 1087  1440 -> 1158

          NO ENTRABA EN NINGUNO. Por eso las tarjetas suben hasta 1440 (cubren
          iPhone y TODOS los iPad) y a la matriz se le bajó el piso para que a
          1440 entre de verdad. Y desde el 11-sep-2026 Total y Proyección van
          FIJAS a la derecha, como Empresa a la izquierda: cuando la matriz
          arrastra, lo que se pierde de vista son los meses del medio, nunca
          las dos columnas que más se miran. */}
      <div className="hidden min-[1440px]:block space-y-5">
      {/* KPI cards del grupo — CUATRO (Ventas / Utilidad / Margen / Cierre del
          año). Comparativo same-period vs prev year (ya viene aplicado desde la
          RPC ventas_dashboard_prev_same_period). El toggle de la matriz no
          afecta el banner: siempre muestra el panorama completo. */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="VENTAS" value={fmtMoney(k.ventasNetasYTD)} sub={kpiVentasSub} subTone={ventasDelta} title={vsTitle} />
        <KpiCard label="UTILIDAD" value={fmtMoney(k.utilidadYTD)} sub={kpiUtilidadSub} subTone={utilidadDelta} title={vsTitle} />
        <KpiCard
          label="MARGEN"
          /* Sin decimal (diccionario § 0, #5): 28.7% → 29%. Por `fmtPorcentaje`,
             la única definición — acá estaba escrito a mano. */
          value={fmtPorcentaje(k.margenYTD)}
          sub={kpiMargenSub}
          subTone={margenDeltaPts}
          title={vsTitle}
        />
        {/* 🔴 LA PROYECCIÓN ES TARJETA (5-sep-2026): es de los cuatro números
            que Daniel mira. ⚠️ LA COLUMNA «Proyección» DE LA TABLA SE QUEDA:
            ahí se ve empresa por empresa. 🔴 Y NO SE DIBUJA NINGUNA META.
            Daniel: *«quita meta, no lo uso, prefiero proyeccion»*. */}
        {showProyeccionCol && (
          <KpiCard
            label="CIERRE DEL AÑO"
            value={fmtMoneyCompact(data.proyeccion!.totales_grupo.proyeccion_cierre)}
            sub={deltaProyeccionTexto(data.proyeccion!.totales_grupo.delta_vs_anio_anterior_total)}
            subTone={data.proyeccion!.totales_grupo.delta_vs_anio_anterior_total}
            title={`Proyectado · comparado con el cierre de ${prevYear}`}
            detalle={explicacionProyeccionGrupo(proyeccionDelGrupo(data.proyeccion!), prevYear, { fechaCorte: data.fecha_corte })}
          />
        )}
      </div>

      {/* Mes en curso vs el mismo mes del año anterior (suma del grupo). Solo
          para año en curso. El mes en curso puede ir parcial → el pie de la
          matriz dice hasta qué día. */}
      {mostrarMesVsMes && (
        <MesVsMesCard
          empresas={data.empresas}
          mesActual={data.mesActual}
          year={selectedYear}
        />
      )}
      {/* Toolbar — «Actualizar ahora» y «Descargar en Excel» (izquierda) ·
          el modo (derecha). 🔴 SIN píldora «Sincronizado» (4-sep-2026): quien
          avisa es `datos-frescos.ts`, por Telegram. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {/* "Actualizar ahora" (admin/secretaria) — la vista es de todas las
              empresas: UN clic actualiza facturas de las 8 EN SECUENCIA (sin
              menú; sesión única Switch — nunca 2 a la vez) + refresh-vistas
              como paso final (rollup mensual y vw de clientes al día). */}
          <SyncNowButton opciones={SYNC_NOW_VENTAS_SECUENCIA} secuencial onSuccess={() => onReloadData?.()} />

          {/* 🔴 «Descargar en Excel», y baja LO QUE ESTÁS VIENDO (11-sep-2026).
              Decía «Excel» y bajaba siempre la matriz de Ventas, estuvieras
              donde estuvieras. Ver `lib/ventas/descarga.ts`. */}
          <Button variant="outline" size="sm" onClick={onExcel} disabled={bajando} className="min-h-[44px]">
            <Download className="mr-1.5 h-3.5 w-3.5" /> {ROTULO_DESCARGAR_EXCEL}
          </Button>
        </div>
        <div className="flex items-center gap-2">
          {/* 🔴 EL MISMO CONTROL SEGMENTADO QUE EL CELULAR Y QUE CLIENTES
              (5-sep-2026), con DOS opciones desde el 11-sep-2026. ⛔ Acá iba
              también «Mensual · Trimestral · Anual»: se retiró. */}
          <ControlSegmentado
            options={MODO_OPCIONES}
            active={viewMode}
            onChange={onToggleMode}
            ariaLabel="Qué mostrar en la matriz"
            ancho="contenido"
          />
        </div>
      </div>

      {/* Heatmap table */}
      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse" style={{ minWidth: 1100 }}>
            {/* Cabecera fija al scrollear (sticky top). Las esquinas Empresa,
                Total y Proyección quedan sticky en ambos ejes (left/right +
                top) sobre el resto. */}
            <thead>
              <tr className="bg-gray-100 text-left">
                <th className="sticky left-0 top-0 z-30 min-w-[120px] bg-gray-100 px-2.5 py-3.5 text-xs font-medium uppercase tracking-wide text-gray-500">
                  Empresa
                </th>
                {cols.map(c => (
                  <th key={c} className="sticky top-0 z-20 bg-gray-100 px-1.5 py-3.5 text-right text-xs font-medium uppercase tracking-wide text-gray-500">
                    {c}
                  </th>
                ))}
                {/* 🔴 TOTAL Y PROYECCIÓN, FIJAS A LA DERECHA (11-sep-2026).
                    Medido: eran justo las dos columnas que se salían de la
                    pantalla al arrastrar — el total del año y el cierre
                    proyectado, las dos que más se miran. El fondo es SÓLIDO
                    (nada se ve a través) y una sombra fina marca el borde. */}
                <th
                  data-col-fija="total"
                  style={{ right: rightTotal }}
                  className={cn("sticky top-0 z-30 bg-gray-100 px-2 py-3.5 text-right text-xs font-semibold uppercase tracking-wide text-gray-950", SOMBRA_FIJA)}
                >
                  Total
                </th>
                {/* Columna "Proyección": sólo años en curso con data de
                    proyección disponible (no aplica a años cerrados). */}
                {showProyeccionCol && (
                  <th
                    data-col-fija="proyeccion"
                    style={{ minWidth: ANCHO_PROYECCION_PX, width: ANCHO_PROYECCION_PX }}
                    className="sticky right-0 top-0 z-30 bg-gray-100 px-2 py-3.5 text-right text-xs font-semibold uppercase tracking-wide text-gray-950"
                  >
                    Proyección
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const isMulti = r.empresa.id === "multi";
                const isOpen = panelEmpresaId === r.empresa.id;
                // El fondo de las celdas fijas tiene que ser el MISMO que el de
                // la fila (incluido el hover): si no, la fila se ve a través.
                const fondoFijo = isMulti
                  ? "bg-teal-50 group-hover:bg-teal-100"
                  : isOpen ? "bg-gray-50" : "bg-white group-hover:bg-gray-50";
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
                    "sticky left-0 z-10 cursor-pointer border-b border-gray-200 px-2.5 py-3.5 text-sm text-gray-950",
                    isMulti ? "bg-teal-50" : isOpen ? "bg-gray-50" : "bg-white"
                  )}>
                    <div className="flex items-center gap-1.5">
                      {isMulti && multiMayoreoNota ? (
                        <MultifashionNameWithBreakdown
                          nombre={nombreEmpresaEnPantalla(r.empresa.id, r.empresa.nombre)}
                          nota={multiMayoreoNota.texto}
                        />
                      ) : (
                        <span className="inline-flex items-center gap-1.5">{nombreEmpresaEnPantalla(r.empresa.id, r.empresa.nombre)}</span>
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
                      proyectado={mesesGris?.porFila[r.empresa.id]?.[ci] ?? null}
                      filaId={r.empresa.id}
                      columna={String(ci)}
                      titulo={nombreEmpresaEnPantalla(r.empresa.id, r.empresa.nombre)}
                      onAbrir={setFilaDetalle}
                    />
                  ))}
                  <EmpresaTotalCell
                    filaId={r.empresa.id}
                    titulo={nombreEmpresaEnPantalla(r.empresa.id, r.empresa.nombre)}
                    onAbrir={setFilaDetalle}
                    ventasTotal={r.ventasTotal}
                    ventasPrevTotal={r.ventasPrevTotal}
                    utilidadTotal={r.utilidadTotal}
                    utilidadPrevTotal={r.utilidadPrevTotal}
                    margenPctYtd={r.margenPct}
                    mode={viewMode}
                    selectedYear={selectedYear}
                    prevYear={prevYear}
                    right={rightTotal}
                    fondo={fondoFijo}
                  />
                  {showProyeccionCol && (
                    <EmpresaProjectionCell
                      proyeccion={findProyeccionForEmpresa(data.proyeccion!, r.empresa.id)}
                      prevYear={prevYear}
                      fechaCorte={data.fecha_corte}
                      filaId={r.empresa.id}
                      titulo={nombreEmpresaEnPantalla(r.empresa.id, r.empresa.nombre)}
                      onAbrir={setFilaDetalle}
                      fondo={fondoFijo}
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
                <td className="sticky left-0 z-10 bg-gray-950 px-2.5 py-3.5 text-xs font-medium uppercase tracking-wide">Total Grupo</td>
                {totalColAggs.map((agg, ci) => (
                  <TotalGroupCell
                    key={ci}
                    agg={agg}
                    mode={viewMode}
                    proyectado={mesesGris?.grupo[ci] ?? null}
                    columna={String(ci)}
                    periodLabel={`${cols[ci]} ${selectedYear}`}
                    cortoLabel={`${cols[ci].toUpperCase()} ${String(selectedYear).slice(-2)} vs ${String(prevYear).slice(-2)}`}
                    prevYear={prevYear}
                    onAbrir={setFilaDetalle}
                  />
                ))}
                <TotalGroupAnnualCell
                  agg={totalYtdAgg}
                  margenYtd={k.margenYTD}
                  mode={viewMode}
                  selectedYear={selectedYear}
                  prevYear={prevYear}
                  onAbrir={setFilaDetalle}
                  right={rightTotal}
                />
                {showProyeccionCol && (
                  <TotalGroupProjectionCell totales={data.proyeccion!.totales_grupo} />
                )}
              </tr>
              )}
            </tbody>
          </table>
        </div>
        {(partialFooter || mesesGris || pieCorte) && (
          <p data-pie-matriz="escritorio" className="border-t border-gray-200 bg-gray-50 px-3.5 py-2 text-xs text-gray-500">
            {[partialFooter, pieCorte, mesesGris ? LEYENDA_MESES_PROYECTADOS : null].filter(Boolean).join(" · ")}
          </p>
        )}
      </Card>

      {/* La leyenda del delta (▲/▼ y su umbral) ya no ocupa una línea fija bajo
          la tabla: vive como tooltip (title=) sobre cada flecha — ver
          leyendaDelta(). El umbral se sigue pudiendo consultar, sin el ruido. */}
      </div>

      {/* Panel mes × año de una empresa (drawer desktop / sheet mobile). Único
          en el árbol; lo abren tanto las filas desktop como las mobile. Trae su
          propio control de tres métricas: es una matriz de años. */}
      <EmpresaMesAnioPanel
        open={panelEmpresaId !== null}
        onClose={() => setPanelEmpresaId(null)}
        nombre={panelNombre}
        empresa={panelEmpresa}
        years={mesAnioData?.years ?? []}
        currentYear={mesAnioData?.currentYear ?? null}
        error={mesAnioError}
        viewMode={panelMode}
        onViewMode={setPanelMode}
        currentYtd={panelCurrentYtd}
      />
    </div>
  );
}

/** La sombra fina que separa la columna fija de los meses que se deslizan. */
const SOMBRA_FIJA = "shadow-[-6px_0_8px_-8px_rgba(0,0,0,0.25)]";

/** Tarjeta "mes en curso vs mismo mes del año anterior" (suma del grupo).
 *  Suma ventas2026/ventas2025 de todas las empresas en el índice del mes actual.
 *  🔴 «Septiembre · $203,412.73 ▼ 50% · vs $403,535.24 en 2025» (11-sep-2026):
 *  el mes por su nombre, sin repetir el año dos veces, y el «vs» SE QUEDA —
 *  Daniel lo pidió: es el único lugar donde se ve cuánto se vendió ese mes el
 *  año pasado. El pie de la matriz dice hasta qué día llega el mes en curso. */
function MesVsMesCard({
  empresas, mesActual, year,
}: { empresas: EmpresaMonthlySales[]; mesActual: number; year: number }) {
  const idx = mesActual - 1;
  const curr = empresas.reduce((s, e) => s + (e.ventas2026?.[idx] ?? 0), 0);
  const prev = empresas.reduce((s, e) => s + (e.ventas2025?.[idx] ?? 0), 0);
  const delta = variacionPct(curr, prev);
  const up = (delta ?? 0) >= 0;
  const mes = MES_FULL_RESUMEN[idx] ?? "";
  return (
    <Card data-mes-en-curso className="border-gray-200 bg-white p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
        {mes}
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
        vs <span className="font-mono tabular-nums">{fmtMoney(prev)}</span> en {year - 1}
      </p>
    </Card>
  );
}

/**
 * KPI card — label uppercase + monto Geist Mono + sub con el delta.
 *
 * `detalle` la vuelve TOCABLE: al abrirla explica de dónde sale el número, en
 * castellano llano. Solo la de la proyección lo trae — las otras tres son una
 * suma, y una tarjeta que se abre para no decir nada enseña a no tocarlas.
 */
function KpiCard({
  label, value, sub, subTone, title, detalle,
}: {
  label: string;
  value: string;
  sub?: string | null;
  /** El signo del cambio, para el color del sub. null = gris. */
  subTone?: number | null;
  /** Contra qué compara el delta. Va en el `title` y no repetido en cada tarjeta. */
  title?: string;
  detalle?: string;
}) {
  const [abierta, setAbierta] = useState(false);
  const tono = subTone == null ? "text-gray-500" : subTone > 0 ? "text-emerald-700" : subTone < 0 ? "text-rose-600" : "text-gray-500";
  const cuerpo = (
    <>
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-1.5 font-mono text-[26px] font-medium leading-tight tracking-tight tabular-nums text-gray-950">{value}</p>
      {sub && <p className={cn("mt-1.5 text-xs font-medium", tono)} title={title}>{sub}</p>}
    </>
  );
  if (!detalle) {
    return <Card className="border-gray-200 bg-white p-4">{cuerpo}</Card>;
  }
  return (
    <Card className="border-gray-200 bg-white p-0">
      <button
        type="button"
        data-kpi-proyeccion="escritorio"
        aria-expanded={abierta}
        onClick={() => setAbierta(v => !v)}
        className="w-full p-4 text-left outline-none transition-colors hover:bg-gray-50 focus-visible:ring-2 focus-visible:ring-teal-700/30"
      >
        {cuerpo}
      </button>
      {abierta && (
        <p data-kpi-proyeccion-detalle="escritorio" className="border-t border-gray-200 px-4 py-2.5 text-xs leading-relaxed text-gray-600">
          {detalle}
        </p>
      )}
    </Card>
  );
}

/** Celda de proyección por empresa (fija a la derecha, al lado del Total).
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
  fondo,
}: {
  proyeccion: ProyeccionEmpresa | null;
  prevYear: number;
  /** YYYY-MM-DD del último día con datos. Da el "al 26 jul" de la explicación. */
  fechaCorte: string | null;
  filaId: string;
  titulo: string;
  onAbrir: AbrirFila;
  /** El fondo de la fila (con su hover): la celda fija no puede ser transparente. */
  fondo: string;
}) {
  const base = cn(
    "sticky right-0 z-10 whitespace-nowrap border-b border-gray-200 text-right font-mono text-xs tabular-nums transition-colors",
    fondo,
  );
  if (!proyeccion) {
    return (
      <td data-col-fija="proyeccion" style={{ minWidth: ANCHO_PROYECCION_PX, width: ANCHO_PROYECCION_PX }} className={cn(base, "px-2 py-3.5 text-gray-400")}>
        —
      </td>
    );
  }
  const delta = proyeccion.delta_vs_anio_anterior;
  const foco = celdaKey("d", filaId, "proy");
  return (
    <td data-col-fija="proyeccion" style={{ minWidth: ANCHO_PROYECCION_PX, width: ANCHO_PROYECCION_PX }} className={cn(base, "p-0")}>
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
    <td
      data-col-fija="proyeccion"
      style={{ minWidth: ANCHO_PROYECCION_PX, width: ANCHO_PROYECCION_PX }}
      className="sticky right-0 z-10 whitespace-nowrap bg-gray-950 px-2 py-3.5 text-right font-mono text-sm font-semibold tabular-nums"
    >
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
  return `▲ vs ${prevYear} mayor a +5% · ▼ menor a −5%${mode === "utilidad" ? " · el % gris es el margen del mes" : ""}`;
}

/** "Jul 2026" → "JUL 26 vs 25". El período tocado, en el ancho de un renglón. */
function labelCorto(periodLabel: string, prevYear: number): string {
  const [periodo, anio] = periodLabel.split(" ");
  return `${periodo.toUpperCase()} ${(anio ?? "").slice(-2)} vs ${String(prevYear).slice(-2)}`;
}

/**
 * 🔴 EL MARGEN DEBAJO DE LA UTILIDAD (11-sep-2026). En modo Utilidad la celda
 * lleva, chico y gris, el margen % del período; el Δ vs el año pasado va al
 * lado, con su color. En modo Ventas no hay margen que mostrar.
 */
function margenChico(cell: Pick<CeldaBase, "ventas" | "utilidad" | "ventasMargen">, mode: ViewMode): string | null {
  if (mode !== "utilidad" || cell.ventas == null || cell.utilidad == null) return null;
  const m = marginRatio(cell.ventasMargen ?? cell.ventas, cell.utilidad);
  return m == null ? null : fmtPorcentaje(m);
}

function HeatCell({
  cell, mode, prevYear, proyectado, filaId, columna, titulo, onAbrir,
}: {
  cell: Cell;
  mode: ViewMode;
  prevYear: number;
  /** Mes que todavía no pasó: lo que la proyección reparte ahí. null = «—». */
  proyectado: number | null;
  filaId: string;
  columna: string;
  titulo: string;
  onAbrir: AbrirFila;
}) {
  const cur   = cellValue(cell, mode);
  const delta = cellDelta(cell, mode);

  // 🔴 Un mes que todavía no pasó se llena EN GRIS con lo que la proyección le
  // reparte. No es tocable y no lleva Δ: no hay nada medido que abrir, y un %
  // contra el año pasado sería el factor repetido doce veces.
  if (cur == null && proyectado != null) {
    return (
      <td
        data-mes-proyectado={columna}
        className="whitespace-nowrap border-b border-gray-200 bg-gray-50 px-1.5 py-3.5 text-right font-mono text-xs tabular-nums text-gray-400"
      >
        {renderCellValue(proyectado, mode)}
      </td>
    );
  }

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
  const margen = margenChico(cell, mode);

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
            {(dc || margen) && (
              <span className="mt-0.5" title={leyendaDelta(mode, prevYear)}>
                {margen && <span data-margen-celda className="text-gray-500">{margen}</span>}
                {margen && dc && <span className="text-gray-300"> · </span>}
                {dc && <span className={toneDelta(dc.tone)}>{dc.texto}</span>}
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
 * TOTAL anual por empresa (fija a la derecha). Muestra monto principal; al
 * tocarla la fila se transforma con YTD del año, YTD del año previo (recortado
 * al mismo día per-empresa) y Δ — los 3 cuadran con la RPC
 * ventas_dashboard_prev_same_period. En modo Utilidad lleva debajo el margen
 * del año (el MISMO que la tarjeta de arriba).
 */
function EmpresaTotalCell({
  ventasTotal, ventasPrevTotal, utilidadTotal, utilidadPrevTotal,
  margenPctYtd,
  mode, selectedYear, prevYear, filaId, titulo, onAbrir, right, fondo,
}: {
  ventasTotal: number;
  ventasPrevTotal: number;
  utilidadTotal: number;
  utilidadPrevTotal: number;
  /** Margen YTD canónico (filtrado por costo>0). Coincide con la tarjeta. */
  margenPctYtd: number;
  mode: ViewMode;
  selectedYear: number;
  prevYear: number;
  filaId: string;
  titulo: string;
  onAbrir: AbrirFila;
  /** Cuánto deja libre a la derecha (el ancho de Proyección, o 0). */
  right: number;
  fondo: string;
}) {
  const agg: Agg = {
    ventas: ventasTotal,
    ventasPrev: ventasPrevTotal,
    utilidad: utilidadTotal,
    utilidadPrev: utilidadPrevTotal,
  };

  const cur = mode === "utilidad" ? utilidadTotal : ventasTotal;
  const delta = mode === "utilidad"
    ? variacionPct(utilidadTotal, utilidadPrevTotal)
    : variacionPct(ventasTotal, ventasPrevTotal);
  const dc = deltaCelda(delta, mode, delta == null);
  const margen = mode === "utilidad" ? fmtPorcentaje(margenPctYtd) : null;
  const foco = celdaKey("d", filaId, "total");

  return (
    <td
      data-col-fija="total"
      style={{ right }}
      className={cn("sticky z-10 whitespace-nowrap border-b border-gray-200 p-0 text-right font-mono tabular-nums transition-colors", fondo, SOMBRA_FIJA)}
    >
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
          <span className="text-sm font-medium text-gray-950">{fmtMoney(cur)}</span>
          {(dc || margen) && (
            <span className="mt-0.5 text-xs" title={leyendaDelta(mode, prevYear)}>
              {margen && <span data-margen-celda className="text-gray-500">{margen}</span>}
              {margen && dc && <span className="text-gray-300"> · </span>}
              {dc && <span className={toneDelta(dc.tone)}>{dc.texto}</span>}
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
  agg, mode, proyectado, columna, periodLabel, cortoLabel, prevYear, onAbrir,
}: {
  agg: Agg;
  mode: ViewMode;
  /** Suma de lo proyectado por empresa para ese mes. null = «—». */
  proyectado: number | null;
  columna: string;
  periodLabel: string;
  cortoLabel: string;
  prevYear: number;
  onAbrir: AbrirFila;
}) {
  const cur = cellValue(agg, mode);
  if (cur == null && proyectado != null) {
    return (
      <td
        data-mes-proyectado-grupo={columna}
        className="whitespace-nowrap bg-white/5 px-1.5 py-3.5 text-right font-mono text-xs tabular-nums text-gray-400"
      >
        {renderCellValue(proyectado, mode)}
      </td>
    );
  }
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
  const margen = margenChico(agg, mode);
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
          {(dc || margen) && (
            <span className="mt-0.5" title={leyendaDelta(mode, prevYear)}>
              {margen && <span data-margen-celda className="text-gray-400">{margen}</span>}
              {margen && dc && <span className="text-gray-600"> · </span>}
              {dc && <span className={toneDeltaOscuro(dc.tone)}>{dc.texto}</span>}
            </span>
          )}
        </span>
      </button>
    </td>
  );
}

/** Celda anual del Total Grupo (fija a la derecha, en la fila oscura). */
function TotalGroupAnnualCell({
  agg, margenYtd, mode, selectedYear, prevYear, onAbrir, right,
}: {
  agg: Agg;
  /** El margen del grupo, el MISMO de la tarjeta de arriba. */
  margenYtd: number;
  mode: ViewMode;
  selectedYear: number;
  prevYear: number;
  onAbrir: AbrirFila;
  right: number;
}) {
  const cellLike: Cell = { ...agg, periodLabel: `YTD ${selectedYear}` };
  const cur = cellValue(agg, mode);
  const delta = cellDelta(cellLike, mode);
  const dc = cur == null ? null : deltaCelda(delta, mode, isNaComparison(agg, mode));
  const displayValue = cur == null ? "—" : fmtMoney(cur);
  const margen = mode === "utilidad" && cur != null ? fmtPorcentaje(margenYtd) : null;
  const foco = celdaKey("d", TOTAL_GRUPO_ID, "total");

  return (
    <td
      data-col-fija="total"
      style={{ right }}
      className={cn("sticky z-10 whitespace-nowrap bg-gray-950 p-0 text-right font-mono text-sm font-semibold tabular-nums", SOMBRA_FIJA)}
    >
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
          {(dc || margen) && (
            <span className="mt-0.5 text-xs font-medium" title={leyendaDelta(mode, prevYear)}>
              {margen && <span data-margen-celda className="text-gray-400">{margen}</span>}
              {margen && dc && <span className="text-gray-600"> · </span>}
              {dc && <span className={toneDeltaOscuro(dc.tone)}>{dc.texto}</span>}
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

/**
 * El mes en curso para la matriz mes × año: el previo son los MISMOS DÍAS del
 * año anterior (lo que `ventas_dashboard_prev_same_period` devolvió para ese
 * mes y esa empresa) y el rótulo dice hasta qué día. null si el año no tiene
 * mes parcial (año cerrado, o todavía sin ventas este mes).
 */
export function mesEnCursoMismosDias(
  data: Pick<VentasResumen, "es_periodo_parcial" | "fecha_corte" | "dia_corte_anio_anterior">,
  empresa: Pick<EmpresaMonthlySales, "ventas2025" | "utilidad2025">,
): CurrentYtdSamePeriod["mesEnCurso"] {
  if (!data.es_periodo_parcial || !data.fecha_corte || !data.dia_corte_anio_anterior) return null;
  const cur = parseIsoDateResumen(data.fecha_corte);
  const prev = parseIsoDateResumen(data.dia_corte_anio_anterior);
  const mes = cur.getMonth() + 1;
  const ventas = empresa.ventas2025[mes - 1] ?? 0;
  const utilidad = empresa.utilidad2025[mes - 1] ?? 0;
  return {
    mes,
    prev: { ventas, utilidad, costo: ventas - utilidad },
    label: `vs 1–${prev.getDate()} ${MONTHS[prev.getMonth()].toLowerCase()} ${prev.getFullYear()}`,
  };
}

// Parsea YYYY-MM-DD como fecha local (sin shift de UTC).
function parseIsoDateResumen(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

// Footer al pie del heatmap: "Datos hasta el 9 may · Comparativo vs Mayo 1–9 2025".
// Solo cuando el año en curso tiene mes parcial.
//
// VOCABULARIO (limpieza jul-2026): el pill de arriba dice "Sincronizado <fecha>"
// (cuándo corrió el sync) y este footer "Datos hasta el <día>" (hasta dónde
// llega la data). Son dos cosas distintas y se leen distinto a propósito.
function buildPartialFooter(data: VentasResumen): string | null {
  if (!data.es_periodo_parcial || !data.fecha_corte || !data.dia_corte_anio_anterior) return null;
  const cur = parseIsoDateResumen(data.fecha_corte);
  const prev = parseIsoDateResumen(data.dia_corte_anio_anterior);
  const corte = `Datos hasta el ${cur.getDate()} ${MONTHS[cur.getMonth()].toLowerCase()}`;
  const prevMonth = MES_FULL_RESUMEN[prev.getMonth()];
  return `${corte} · Comparativo vs ${prevMonth} 1–${prev.getDate()} ${prev.getFullYear()}`;
}

/** Las 12 celdas de una empresa, con la base del margen del mes en curso. */
export function buildRow(
  e: EmpresaMonthlySales,
  year: number,
): {
  empresa: { id: string; nombre: string };
  cells: Cell[];
  // Sumas YTD (sobre las 12 entradas) para totales y aggregates.
  ventasTotal: number;
  ventasPrevTotal: number;
  utilidadTotal: number;
  utilidadPrevTotal: number;
} {
  const cells: Cell[] = e.ventas2026.map((v, i) => ({
    ventas:       v,
    ventasPrev:   e.ventas2025[i] ?? 0,
    utilidad:     e.utilidad2026[i],
    utilidadPrev: e.utilidad2025[i]   ?? 0,
    ventasMargen: e.ventasParaMargen?.[i] ?? v,
    periodLabel: `${MONTHS[i]} ${year}`,
  }));
  return {
    empresa: e.empresa,
    cells,
    ventasTotal:       sumYtd(e.ventas2026),
    ventasPrevTotal:   sumYtd(e.ventas2025),
    utilidadTotal:     sumYtd(e.utilidad2026),
    utilidadPrevTotal: sumYtd(e.utilidad2025),
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

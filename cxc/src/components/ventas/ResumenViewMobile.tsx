"use client";

// Layout mobile-first del tab Resumen. Visible por DEBAJO de 1440 px (el porqué
// medido está en ResumenView.tsx: la matriz de 15 columnas necesitaba 1.276 px y
// no entraba ni en un escritorio de 1440). Gated por min-[1440px]:hidden en
// el contenedor. El layout desktop existente queda intacto detrás de
// hidden min-[1440px]:block en ResumenView.tsx.
//
// Estructura: pill de frescura → 3 KPI cards (Ventas/Utilidad/Margen YTD) →
// Toggles segmented → UNA TARJETA POR EMPRESA (+ la del total del grupo).
// Sin tooltips (no hay hover en touch): tocar un período abre el detalle con
// Ventas, Utilidad y Margen, en el lugar donde se tocó.
//
// 🩸 POR QUÉ TARJETAS Y NO EL HEATMAP. Hasta el 30-jul-2026 esto era la misma
// matriz del escritorio: empresa + 12 meses + Total + Proyección = 15 columnas
// metidas en un `overflow-x-auto`. Medido en el navegador a 390 px: la tabla
// pedía 1.109 px contra 356 visibles, o sea **753 px de scroll a la derecha** —
// el peor de todo el sistema en el censo de ese día (CXC, ya pasado a tarjetas,
// medía 0). Daniel, textual: *"todavia hay q hacer mucho scroll a la derecha
// para ver la info"*. Con 12 meses en una pantalla de 390 px se ven DOS a la
// vez, así que el heatmap no cumplía ni su propia promesa: comparar empresas
// dentro del mismo mes exigía arrastrar casi dos pantallas y perder de vista la
// columna de nombres.
//
// El patrón es el de `admin/components/PanelCxcMobile.tsx` (tabla ancha →
// tarjetas), no uno nuevo. Cada tarjeta cerrada muestra lo que se mira de un
// golpe (empresa, total del año y el período en curso); abierta, la lista
// vertical de los 12 meses (o 4 trimestres) + Total + Proyección.
//
// NINGÚN NÚMERO CAMBIA y no se perdió ninguno: los 12 períodos, el Total, la
// Proyección, el detalle por período, el panel mes × año de la empresa y la nota
// de mayoreo de Multifashion están todos. Es presentación.
//
// La matriz sigue viva en `ResumenView.tsx` para la pantalla ancha, pero su
// corte YA NO ES `md`: es 1440 px. El 30-jul-2026 se midió lo que hasta entonces
// se daba por sentado —"en una pantalla ancha la matriz se ve entera"— y era
// falso: necesitaba 1.276 px de ancho mínimo y arrastraba en TODOS los anchos,
// 724 px en un iPad de 834 y 118 px hasta en un escritorio de 1440. Ahora la
// matriz entra de verdad en su tramo, y las tarjetas cubren todo lo de abajo.

import type {
  VentasResumen,
  EmpresaMonthlySales,
  ProyeccionResp,
  ProyeccionEmpresa,
} from "./types";
import { useState } from "react";
import { MONTHS, QUARTERS, fmtMoney, fmtMoneyCompact, fmtPorcentaje } from "@/lib/ventas/format";
import { ControlSegmentado } from "./ControlSegmentado";
import {
  MODO_OPCIONES, GRANULARIDAD_OPCIONES, nombreEmpresaEnPantalla, proyeccionDelGrupo,
} from "./ResumenView";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronRight } from "lucide-react";
import SyncNowButton from "@/components/shared/SyncNowButton";
import { SYNC_NOW_VENTAS_SECUENCIA } from "@/components/shared/syncNowOpciones";
import { ResumenAnual, type AnualData } from "./ResumenAnual";
import {
  buildSlotsMetrica, cellValue, cellDelta, renderCellValue, celdaKey,
  deltaCelda, isNaComparison, type CeldaBase, type DeltaCelda, type SlotDetalle,
} from "@/lib/ventas/celda";
import {
  buildSlotsProyeccion, explicacionProyeccion,
  explicacionProyeccionGrupo, deltaProyeccionTexto,
} from "@/lib/ventas/proyeccion-texto";
import { variacionPct } from "@/lib/variacion";

import { FilaDetalleBloque, medirRenglon, TOTAL_GRUPO_ID, type FilaDetalle } from "./FilaDetalle";

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
    <div className="min-[1440px]:hidden space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {/* 🔴 Sin píldora «Sincronizado» — ver el comentario de ResumenView. */}
        {/* "Actualizar ahora" (admin/secretaria) — un clic = las 8 empresas en
            secuencia + refresh-vistas como paso final. */}
        <SyncNowButton opciones={SYNC_NOW_VENTAS_SECUENCIA} secuencial onSuccess={() => onReloadData?.()} />
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
        <MobileTarjetas
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
  // 🔴 EL CELULAR DECÍA "Ventas YTD · +12% vs '25" Y NO DECÍA QUÉ MESES. Las dos
  // mitades eran jerga: "YTD" es year-to-date en inglés, y el año cortado a dos
  // dígitos con apóstrofo es notación de planilla. La cifra grande y su cambio
  // no dicen nada si no se sabe contra qué período se están mirando.
  //
  // El período va en UNA línea arriba de las tarjetas, no repetido dentro de
  // cada una: es el MISMO texto que el escritorio muestra debajo de cada cifra.
  const periodoLabel = isClosedYear
    ? `Año ${selectedYear} completo`
    : `${MONTHS[0]}–${MONTHS[Math.max(0, data.mesActual - 1)]} ${selectedYear}`;
  const ventasDelta   = variacionPct(k.ventasNetasYTD, k.ventas2025YTD);
  const utilidadDelta = variacionPct(k.utilidadYTD, k.utilidad2025YTD);
  const margenDeltaPts = (k.margenYTD - k.margen2025YTD) * 100;
  const pct = (r: number) => `${r >= 0 ? "+" : ""}${(r * 100).toFixed(0)}% vs ${prevYear}`;
  const proy = !isClosedYear && data.proyeccion ? data.proyeccion : null;

  return (
    <div className="space-y-1.5">
      <p data-periodo-kpis className="text-xs text-gray-500">
        {periodoLabel} <span className="text-gray-300">·</span> comparado con {prevYear}
      </p>
      {/* 🔴 DOS COLUMNAS, NO TRES (5-sep-2026), Y POR UNA MEDICIÓN.
          Las tarjetas ahora traen los montos CON CENTAVOS (diccionario § 0, #7):
          «$6,270,375.73» y no «$6.27M». A 390 px, tres tarjetas dan ~120 px cada
          una y ese monto pide ~130 en mono de 17 px — se partía en tres
          renglones. Con dos columnas cada tarjeta mide ~190 y entra con aire.
          Y son CUATRO tarjetas, así que dos columnas dan dos filas parejas. */}
      <div className="grid grid-cols-2 gap-2">
        <KpiTile
          label="Ventas"
          value={fmtMoney(k.ventasNetasYTD)}
          sub={ventasDelta == null ? null : { text: pct(ventasDelta), sign: ventasDelta }}
        />
        <KpiTile
          label="Utilidad"
          value={fmtMoney(k.utilidadYTD)}
          sub={utilidadDelta == null ? null : { text: pct(utilidadDelta), sign: utilidadDelta }}
        />
        <KpiTile
          label="Margen"
          /* Sin decimal (diccionario § 0, #5), por `fmtPorcentaje`. Los PUNTOS
             de abajo sí conservan el suyo: son una diferencia, no un %. */
          value={fmtPorcentaje(k.margenYTD)}
          sub={{ text: `${margenDeltaPts >= 0 ? "+" : ""}${margenDeltaPts.toFixed(1)} pts`, sign: margenDeltaPts }}
        />
        {/* 🔴 LA CUARTA: EN CUÁNTO CIERRA EL AÑO. En el celular la proyección
            del grupo estaba al final de la tarjeta negra «Total grupo», que hay
            que desplegar y bajar hasta el último renglón. Ahora está arriba,
            con las otras tres. Sin metas, igual que el escritorio.
            El monto va REDONDEADO a propósito y no con centavos: es una
            estimación, y darle centavos a un número estimado lo hace parecer
            medido. */}
        {proy && (
          <KpiTile
            label="Cierre del año"
            value={fmtMoneyCompact(proy.totales_grupo.proyeccion_cierre)}
            sub={{
              text: `${deltaProyeccionTexto(proy.totales_grupo.delta_vs_anio_anterior_total)} vs ${prevYear}`,
              sign: proy.totales_grupo.delta_vs_anio_anterior_total,
            }}
            detalle={explicacionProyeccionGrupo(proyeccionDelGrupo(proy), prevYear, { fechaCorte: data.fecha_corte })}
          />
        )}
      </div>
    </div>
  );
}

function KpiTile({
  label,
  value,
  sub,
  detalle,
}: {
  label: string;
  value: string;
  sub: { text: string; sign: number | null } | null;
  /** Explica de dónde sale el número. Solo la proyección lo trae: las otras
   *  tres son una suma, y una tarjeta que se abre para no decir nada enseña a
   *  no tocarlas. */
  detalle?: string;
}) {
  const [abierta, setAbierta] = useState(false);
  const subTone = sub == null || sub.sign == null
    ? "text-gray-500"
    : sub.sign > 0 ? "text-emerald-700" : sub.sign < 0 ? "text-rose-700" : "text-gray-500";
  const cuerpo = (
    <>
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
      {/* 15 px y no 17: con los centavos puestos el monto largo del grupo pide
          ~130 px a 17 px de mono, y la tarjeta tiene ~170 útiles. A 15 entra
          con margen y sigue muy por encima del piso de 12 px de la casa. */}
      <p className="mt-1 font-mono text-[15px] font-medium leading-tight tracking-tight tabular-nums text-gray-950">
        {value}
      </p>
      {sub && (
        <p className={cn("mt-0.5 text-xs font-medium leading-tight", subTone)}>
          {sub.text}
        </p>
      )}
    </>
  );
  if (!detalle) {
    return <div className="rounded-xl border border-gray-200 bg-white p-2.5">{cuerpo}</div>;
  }
  return (
    <div className="rounded-xl border border-gray-200 bg-white">
      <button
        type="button"
        data-kpi-proyeccion="celular"
        aria-expanded={abierta}
        onClick={() => setAbierta(v => !v)}
        className="w-full p-2.5 text-left active:bg-gray-50"
      >
        {cuerpo}
      </button>
      {abierta && (
        <p data-kpi-proyeccion-detalle="celular" className="border-t border-gray-100 px-2.5 py-2 text-xs leading-relaxed text-gray-600">
          {detalle}
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
      {/* 🔴 EL CONTROL COMPARTIDO (`ControlSegmentado`, 5-sep-2026). Es el
          `SegmentedRow` que vivía en este archivo, sacado afuera para que el
          ESCRITORIO use el mismo — allá eran cajas grises escritas a mano. Por
          eso el celular no cambia ni un píxel. Y las OPCIONES salen de una sola
          lista (`MODO_OPCIONES` / `GRANULARIDAD_OPCIONES`, en `ResumenView`):
          acá decían «Margen %» y allá también, pero nada lo garantizaba. */}
      <ControlSegmentado
        options={MODO_OPCIONES}
        active={viewMode}
        onChange={setViewMode}
        ariaLabel="Qué mostrar"
      />
      <ControlSegmentado
        options={GRANULARIDAD_OPCIONES}
        active={granularity}
        onChange={setGranularity}
        ariaLabel="Cada cuánto"
      />
    </div>
  );
}

// ⛔ ACÁ VIVÍA `SegmentedRow`. Se fue a `components/ventas/ControlSegmentado.tsx`
// y hoy lo usan también el Resumen de escritorio y Clientes. Ver su cabecera.

// ─────────────────────────────────────────────────────────────────────────────
// Tarjetas por empresa — reemplazan la matriz de 15 columnas
// ─────────────────────────────────────────────────────────────────────────────

type CellData = CeldaBase;

/**
 * Un renglón de la lista abierta de una tarjeta: un período, el Total del año o
 * la Proyección.
 *
 * Se arma en el padre y no dentro de la tarjeta a propósito: así la tarjeta de
 * una empresa y la del total del grupo dibujan EXACTAMENTE lo mismo. El heatmap
 * tenía cinco componentes de celda (`MobileCell`, `MobileTotalCell`,
 * `MobileProyCell`, `MobileTotalGrupoCell`, `MobileTotalGrupoYtdCell`) con la
 * misma lógica escrita cinco veces y ya habían divergido: la Proyección del
 * grupo era un `<td>` mudo mientras la de cada empresa sí abría su explicación.
 */
interface Renglon {
  /** `data-celda` — es también la llave con la que se sabe cuál está abierto. */
  foco: string;
  etiqueta: string;
  valor: string;
  dc: DeltaCelda | null;
  /** Período en curso: se tiñe como la columna resaltada del escritorio. */
  enCurso: boolean;
  /** Total / Proyección: separados del bloque de períodos y en negrita. */
  fuerte: boolean;
  /** Qué mostrar al tocarlo. `null` = no hay nada que abrir. */
  detalle: { titulo: string; subtitulo: string; slots: SlotDetalle[] } | null;
}

interface Tarjeta {
  id: string;
  nombre: string;
  /** Nota de mayoreo de Multifashion, o nada. */
  nota: string | null;
  /** Lo que se ve con la tarjeta cerrada: el total del año. */
  resumen: { valor: string; dc: DeltaCelda | null };
  /** El período en curso, también visible con la tarjeta cerrada. */
  enCurso: { etiqueta: string; valor: string; dc: DeltaCelda | null } | null;
  renglones: Renglon[];
  /** Total del grupo: fondo oscuro, igual que su fila en el escritorio. */
  oscura: boolean;
  /** Abre el panel mes × año de la empresa. El total del grupo no tiene. */
  abrirPanel: (() => void) | null;
}

function MobileTarjetas({
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

  // Índice del período en curso, para resaltarlo.
  // mesActual es 1-indexed (5 = May). En trimestral: ceil(5/3)=2 → Q2 → idx 1.
  const currentColIdx = isClosedYear || data.mesActual === 0
    ? -1
    : granularity === "mensual"
      ? data.mesActual - 1
      : Math.ceil(data.mesActual / 3) - 1;

  const yy = String(selectedYear).slice(-2);
  const yyPrev = String(selectedYear - 1).slice(-2);
  const showProy = !isClosedYear && !!data.proyeccion;

  // Una tarjeta abierta a la vez, misma regla que PanelCxcMobile: con 8 empresas
  // × 12 meses, permitir varias abiertas convierte la pantalla en una lista de
  // 100 renglones donde no se encuentra nada.
  const [abierta, setAbierta] = useState<string | null>(null);

  function alternar(id: string) {
    // Cerrar la tarjeta con un detalle abierto adentro dejaría ese detalle vivo
    // en el estado del padre y reaparecería al volver a abrirla.
    if (abierta === id && filaDetalle) onCerrarFila();
    setAbierta(prev => (prev === id ? null : id));
  }

  /** Renglón de un período. Sirve igual para una empresa y para el grupo. */
  function renglonPeriodo(filaId: string, titulo: string, cell: CellData, ci: number): Renglon {
    const cur = cellValue(cell, viewMode);
    const foco = celdaKey("m", filaId, String(ci));
    const base = { foco, etiqueta: cols[ci], enCurso: ci === currentColIdx, fuerte: false };
    if (cur == null) {
      return { ...base, valor: "—", dc: null, detalle: null };
    }
    return {
      ...base,
      valor: renderCellValue(cur, viewMode),
      dc: deltaCelda(cellDelta(cell, viewMode), viewMode, isNaComparison(cell, viewMode)),
      detalle: {
        titulo,
        subtitulo: `${cols[ci].toUpperCase()} ${yy} vs ${yyPrev}`,
        // Sin montos del año previo: en 390 px no entran los 3 datos con el
        // nombre y la ×. El Δ ya dice el cambio.
        slots: buildSlotsMetrica(cell, viewMode, false),
      },
    };
  }

  /** Renglón del Total del año. En modo margen NO es una suma: es el margen. */
  function renglonTotal(
    filaId: string,
    titulo: string,
    ytdCell: CellData,
    cur: number,
    prev: number,
    margenPct: number,
    margenPctPrev: number,
  ): { renglon: Renglon; dc: DeltaCelda | null } {
    let display: string;
    let delta: number | null;
    if (viewMode === "margen") {
      display = fmtPorcentaje(margenPct);
      delta = margenPctPrev > 0 ? margenPct - margenPctPrev : null;
    } else {
      // 🔴 CON CENTAVOS (diccionario § 0, #7, 5-sep-2026). Decía «$1.09M»
      // mientras la MISMA celda del escritorio decía «$1,090,432.18»: el mismo
      // total con dos caras según la pantalla, que es como se pierde una hora
      // buscando un descuadre que no existe. Medido a 390 px: el renglón del
      // Total tiene el nombre a la izquierda y el monto a la derecha, y
      // «$1,090,432.18» a 15 px de mono son ~117 px de los ~356 útiles.
      display = fmtMoney(cur);
      delta = variacionPct(cur, prev);
    }
    const dc = deltaCelda(delta, viewMode, delta == null);
    return {
      dc,
      renglon: {
        foco: celdaKey("m", filaId, "total"),
        etiqueta: `Total ${selectedYear}`,
        valor: display,
        dc,
        enCurso: false,
        fuerte: true,
        detalle: {
          titulo,
          subtitulo: `TOTAL ${yy} vs ${yyPrev}`,
          slots: buildSlotsMetrica(ytdCell, viewMode, false),
        },
      },
    };
  }

  // Las celdas de cada empresa, UNA vez: las usan la tarjeta de la empresa y
  // también el agregado del grupo, y `buildCells` construye 12 objetos por
  // llamada. Recalcularlas dentro del bucle del grupo serían 96 llamadas.
  const cellsPorEmpresa = data.empresas.map(e => buildCells(e, granularity));

  // ── Una tarjeta por empresa ────────────────────────────────────────────────
  const tarjetas: Tarjeta[] = data.empresas.map((e, ei) => {
    const id = e.empresa.id;
    // El nombre CORTO, el mismo que la matriz del escritorio (diccionario § 0,
    // #4). Sale de la MISMA función: dos traducciones son dos nombres.
    const nombre = nombreEmpresaEnPantalla(id, e.empresa.nombre);
    const cells = cellsPorEmpresa[ei];
    const yt = yearlyTotal(e, viewMode);
    // Las 4 fuentes del YTD, para que el detalle del Total muestre Ventas +
    // Utilidad + Margen igual que en el escritorio.
    const ytdCell: CellData = {
      ventas: sumSeries(e.ventas2026),
      ventasPrev: sumSeries(e.ventas2025),
      utilidad: sumSeries(e.utilidad2026),
      utilidadPrev: sumSeries(e.utilidad2025),
    };
    const periodos = cells.map((c, ci) => renglonPeriodo(id, nombre, c, ci));
    const total = renglonTotal(id, nombre, ytdCell, yt.cur, yt.prev, e.margenPct, e.margenPctPrev);

    const renglones = [...periodos, total.renglon];
    if (showProy) {
      const p = findProyeccionForEmpresa(data.proyeccion!, id);
      renglones.push({
        foco: celdaKey("m", id, "proy"),
        etiqueta: "Proyección",
        // La proyección va REDONDEADA a propósito, igual que en el escritorio
      // (`fmtMoneyCompact`): es una estimación, y darle centavos la haría
      // parecer medida.
      valor: p ? fmtMoneyCompact(p.proyeccion_cierre) : "—",
        dc: null,
        enCurso: false,
        fuerte: true,
        // La Proyección explica de dónde sale, en castellano llano (antes en el
        // escritorio era un número sin origen).
        detalle: p
          ? {
              titulo: nombre,
              subtitulo: explicacionProyeccion(p, selectedYear - 1, {
                fechaCorte: data.fecha_corte,
                corto: true,
              }),
              slots: buildSlotsProyeccion(p, selectedYear - 1, {
                fechaCorte: data.fecha_corte,
                compacto: true,
              }),
            }
          : null,
      });
    }

    const enCursoR = currentColIdx >= 0 ? periodos[currentColIdx] : null;
    return {
      id,
      nombre,
      // La nota es VISIBLE (paridad con escritorio): la fila es american_classic
      // COMPLETA (tienda + mayoreo) y declara CUÁNTO es mayoreo.
      nota: id === "multi" ? multiMayoreoNota ?? null : null,
      resumen: { valor: total.renglon.valor, dc: total.dc },
      enCurso: enCursoR ? { etiqueta: enCursoR.etiqueta, valor: enCursoR.valor, dc: enCursoR.dc } : null,
      renglones,
      oscura: false,
      abrirPanel: () => onOpenEmpresa(id),
    };
  });

  // ── Tarjeta del total del grupo ────────────────────────────────────────────
  // Los agregados por período son la suma de todas las empresas; el YTD sale de
  // las series reales (no de sumar columnas), igual que en el escritorio.
  const totalColAggs: CellData[] = cols.map((_, ci) => {
    let v = 0, vp = 0, u = 0, up = 0;
    let hasV = false, hasU = false;
    for (const cells of cellsPorEmpresa) {
      const c = cells[ci];
      if (c.ventas != null) { v += c.ventas; hasV = true; }
      vp += c.ventasPrev;
      if (c.utilidad != null) { u += c.utilidad; hasU = true; }
      up += c.utilidadPrev;
    }
    return {
      ventas: hasV ? v : null,
      ventasPrev: vp,
      utilidad: hasU ? u : null,
      utilidadPrev: up,
    };
  });

  const groupYtd = data.empresas.reduce<{ v: number; vp: number; u: number; up: number }>(
    (s, e) => ({
      v: s.v + sumSeries(e.ventas2026),
      vp: s.vp + sumSeries(e.ventas2025),
      u: s.u + sumSeries(e.utilidad2026),
      up: s.up + sumSeries(e.utilidad2025),
    }),
    { v: 0, vp: 0, u: 0, up: 0 }
  );

  const grupoPeriodos = totalColAggs.map((c, ci) => renglonPeriodo(TOTAL_GRUPO_ID, "Total grupo", c, ci));
  const grupoYtdCell: CellData = {
    ventas: groupYtd.v, ventasPrev: groupYtd.vp, utilidad: groupYtd.u, utilidadPrev: groupYtd.up,
  };
  const grupoTotal = renglonTotal(
    TOTAL_GRUPO_ID,
    "Total grupo",
    grupoYtdCell,
    viewMode === "utilidad" ? groupYtd.u : groupYtd.v,
    viewMode === "utilidad" ? groupYtd.up : groupYtd.vp,
    data.kpis.margenYTD,
    data.kpis.margen2025YTD,
  );
  const grupoRenglones = [...grupoPeriodos, grupoTotal.renglon];
  if (showProy) {
    grupoRenglones.push({
      foco: celdaKey("m", TOTAL_GRUPO_ID, "proy"),
      etiqueta: "Proyección",
      valor: fmtMoneyCompact(data.proyeccion!.totales_grupo.proyeccion_cierre),
      dc: null,
      enCurso: false,
      fuerte: true,
      // Sin detalle, igual que en el escritorio: `buildSlotsProyeccion` describe
      // la proyección de UNA empresa y los totales del grupo no traen las mismas
      // partes. Inventarle una explicación sería inventar el dato.
      detalle: null,
    });
  }
  const grupoEnCurso = currentColIdx >= 0 ? grupoPeriodos[currentColIdx] : null;

  const tarjetaGrupo: Tarjeta = {
    id: TOTAL_GRUPO_ID,
    nombre: "Total grupo",
    nota: null,
    resumen: { valor: grupoTotal.renglon.valor, dc: grupoTotal.dc },
    enCurso: grupoEnCurso
      ? { etiqueta: grupoEnCurso.etiqueta, valor: grupoEnCurso.valor, dc: grupoEnCurso.dc }
      : null,
    renglones: grupoRenglones,
    oscura: true,
    abrirPanel: null,
  };

  return (
    <div className="space-y-2">
      <ul className="space-y-2">
        {tarjetas.map(t => (
          <li key={t.id}>
            <TarjetaEmpresa
              tarjeta={t}
              abierta={abierta === t.id}
              onAlternar={() => alternar(t.id)}
              filaDetalle={filaDetalle}
              onAbrirFila={onAbrirFila}
              onCerrarFila={onCerrarFila}
            />
          </li>
        ))}
      </ul>
      {/* El total del grupo va último, igual que su fila en el escritorio. */}
      <TarjetaEmpresa
        tarjeta={tarjetaGrupo}
        abierta={abierta === TOTAL_GRUPO_ID}
        onAlternar={() => alternar(TOTAL_GRUPO_ID)}
        filaDetalle={filaDetalle}
        onAbrirFila={onAbrirFila}
        onCerrarFila={onCerrarFila}
      />
    </div>
  );
}

function TarjetaEmpresa({
  tarjeta,
  abierta,
  onAlternar,
  filaDetalle,
  onAbrirFila,
  onCerrarFila,
}: {
  tarjeta: Tarjeta;
  abierta: boolean;
  onAlternar: () => void;
  filaDetalle: FilaDetalle | null;
  onAbrirFila: AbrirFila;
  onCerrarFila: () => void;
}) {
  const { oscura } = tarjeta;
  const tono = (dc: DeltaCelda) => (oscura ? toneDeltaOscuro(dc.tone) : toneDeltaClaro(dc.tone));

  return (
    <article
      className={cn(
        "overflow-hidden rounded-xl border",
        oscura ? "border-gray-800 bg-gray-900 text-white" : "border-gray-200 bg-white",
      )}
    >
      {/* UN solo blanco táctil en el encabezado: abre y cierra. El chevron es
          parte del botón, no un control aparte — dos targets pegados en 356 px se
          erran con el pulgar. */}
      <button
        type="button"
        onClick={onAlternar}
        aria-expanded={abierta}
        className={cn(
          "flex w-full items-center gap-2 px-3 py-3 text-left",
          oscura ? "active:bg-white/5" : "active:bg-gray-50",
        )}
      >
        <span className="min-w-0 flex-1">
          <span
            className={cn(
              "block truncate text-[13px] font-medium leading-tight",
              oscura ? "font-semibold uppercase tracking-wide text-white" : "text-gray-900",
            )}
          >
            {tarjeta.nombre}
          </span>
          {tarjeta.nota && (
            <span className="mt-0.5 block whitespace-normal text-xs font-normal leading-tight text-gray-500">
              {tarjeta.nota}
            </span>
          )}
          {/* El período en curso, cerrado: es el número que se mira todos los
              días y en el heatmap era la columna resaltada. Sin esto habría que
              abrir las 8 tarjetas para ver cómo va el mes. */}
          {tarjeta.enCurso && (
            <span className={cn("mt-1 block text-xs leading-tight", oscura ? "text-gray-300" : "text-gray-500")}>
              <span className="uppercase">{tarjeta.enCurso.etiqueta} en curso</span>{" "}
              <span className="font-mono tabular-nums">{tarjeta.enCurso.valor}</span>
              {tarjeta.enCurso.dc && (
                <span className={cn("ml-1", tono(tarjeta.enCurso.dc))}>{tarjeta.enCurso.dc.texto}</span>
              )}
            </span>
          )}
        </span>
        <span className="shrink-0 text-right">
          <span
            className={cn(
              "block font-mono text-[15px] font-semibold tabular-nums",
              oscura ? "text-white" : "text-gray-950",
            )}
          >
            {tarjeta.resumen.valor}
          </span>
          {tarjeta.resumen.dc && (
            <span className={cn("block text-xs", tono(tarjeta.resumen.dc))}>
              {tarjeta.resumen.dc.texto}
            </span>
          )}
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 transition-transform",
            abierta && "rotate-180",
            oscura ? "text-gray-500" : "text-gray-400",
          )}
          aria-hidden
        />
      </button>

      {abierta && (
        <div className={cn("border-t", oscura ? "border-gray-700" : "border-gray-100")}>
          <ul>
            {tarjeta.renglones.map(r => (
              <li key={r.foco}>
                {filaDetalle?.focoCelda === r.foco ? (
                  <FilaDetalleBloque detalle={filaDetalle} onClose={onCerrarFila} oscura={oscura} />
                ) : (
                  <RenglonPeriodo
                    renglon={r}
                    filaId={tarjeta.id}
                    oscura={oscura}
                    onAbrirFila={onAbrirFila}
                  />
                )}
              </li>
            ))}
          </ul>
          {tarjeta.abrirPanel && (
            <button
              type="button"
              onClick={tarjeta.abrirPanel}
              className="flex min-h-[44px] w-full items-center justify-between gap-2 border-t border-gray-100 px-3 text-left text-xs font-medium text-blue-600 active:bg-gray-50"
            >
              Ver mes por mes de otros años
              <ChevronRight className="h-4 w-4 shrink-0" aria-hidden />
            </button>
          )}
        </div>
      )}
    </article>
  );
}

function RenglonPeriodo({
  renglon,
  filaId,
  oscura,
  onAbrirFila,
}: {
  renglon: Renglon;
  filaId: string;
  oscura: boolean;
  onAbrirFila: AbrirFila;
}) {
  const claseBase = cn(
    // 44 px de alto: es un blanco táctil, no un renglón de tabla.
    "flex min-h-[44px] w-full items-center gap-2 px-3 py-2",
    renglon.fuerte && (oscura ? "border-t border-gray-700" : "border-t border-gray-100"),
    renglon.enCurso && (oscura ? "bg-[rgba(15,118,110,0.22)]" : "bg-[rgba(15,118,110,0.06)]"),
  );

  const etiqueta = (
    <span
      className={cn(
        "shrink-0 text-xs uppercase tracking-wide",
        renglon.fuerte ? "font-semibold" : "font-medium",
        oscura ? "text-gray-300" : renglon.enCurso ? "text-teal-800" : "text-gray-500",
      )}
    >
      {renglon.etiqueta}
    </span>
  );

  const cifras = (
    <span className="ml-auto flex items-baseline gap-2">
      <span
        className={cn(
          "font-mono text-xs tabular-nums",
          renglon.fuerte && "font-semibold",
          renglon.valor === "—"
            ? oscura ? "text-gray-500" : "text-gray-300"
            : oscura ? "text-white" : "text-gray-950",
        )}
      >
        {renglon.valor}
      </span>
      {/* Ancho fijo para que los % queden en columna y se puedan comparar de un
          barrido vertical, que es lo que el heatmap hacía en horizontal. */}
      <span
        className={cn(
          "w-[54px] shrink-0 text-right text-xs",
          renglon.dc ? (oscura ? toneDeltaOscuro(renglon.dc.tone) : toneDeltaClaro(renglon.dc.tone)) : "text-transparent",
        )}
      >
        {renglon.dc ? renglon.dc.texto : ""}
      </span>
    </span>
  );

  if (!renglon.detalle) {
    return (
      <div className={claseBase}>
        {etiqueta}
        {cifras}
      </div>
    );
  }

  const detalle = renglon.detalle;
  return (
    <button
      type="button"
      data-celda={renglon.foco}
      onClick={(e) => onAbrirFila({
        filaId,
        focoCelda: renglon.foco,
        titulo: detalle.titulo,
        subtitulo: detalle.subtitulo,
        slots: detalle.slots,
        ...medirRenglon(e),
      })}
      className={cn(claseBase, oscura ? "active:bg-white/10" : "active:bg-gray-100")}
    >
      {etiqueta}
      {cifras}
    </button>
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

"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Multifashion › VENDEDORAS — y, desde el 6-sep-2026, TAMBIÉN LAS METAS.
//
// UNA sola tabla (una fila por vendedora). Lo que cambió el 6-sep-2026:
//
// 1. 🩸 SE FUERON LAS SEIS PÍLDORAS de período. En el teléfono ocupaban TRES
//    filas antes del primer número. Las reemplaza el desplegable único del
//    módulo (`src/lib/multifashion/periodo.ts`): los meses cubren «en curso» y
//    «cerrado», «Todo el año» es el YTD de siempre y las tres ventanas rodantes
//    son las mismas. Ni la RPC ni un solo parámetro cambiaron.
// 2. 🩸 EL BONO DEJÓ DE SER UNA BARRA. Era un recuadro de color a lo ancho, y
//    arriba de la tabla, para decir una cosa que le toca a UNA fila. Ahora es
//    una COLUMNA: dice el monto de quien lo gana y **«al cierre»** mientras el
//    mes no termine (que es la verdad: el bono se calcula con el mes cerrado).
//    ⚠️ Ni el monto ni la regla del bono se tocaron — cambió dónde se lee.
// 3. LAS METAS VIVEN ABAJO, ENTERAS: la tarjeta de avance, «Nueva meta»,
//    «Cambiar», el premio, el rango de fechas, la historia y el aporte de cada
//    una. Daniel: *«de acuerdo, ponerlo en vendedoras, pero el tab de metas no
//    es idéntico, tiene más cosas útiles»*. No se perdió nada.
// 4. Los nombres se CAPITALIZAN (`nombreEnPantalla`): en la misma lista convivían
//    «Martin Montenegro» y «MARIA APARICIO». Solo cambia cómo se muestran.
//
// ⚠️ La columna Δ es ÚNICA y su rótulo dice CONTRA QUÉ compara: en los períodos
// de MES la RPC compara contra el MES ANTERIOR, así que dice «Δ vs julio 2026» y
// no «vs año pasado» (decisión de Daniel, 3-sep-2026 — `vendedoras-rotulo.ts`);
// el año completo y las ventanas de N meses sí comparan contra el año pasado.
//
// Server-side: RPC multifashion_vendedoras_v4 (con el amarre de códigos de
// `multifashion_vendedora_alias`; cae a la v3 mientras la migración no corra) +
// multifashion_bonos_v4 (vía BonosSection). Sin fórmulas nuevas.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useMemo, useState } from "react";
import useSWR from "swr";
import { Card } from "@/components/ui/card";
import { Users } from "lucide-react";
import type {
  VendedoraDetalle,
  VendedorasPeriodo,
  VendedorasPeriodoTipo,
  BonosMultifashion,
} from "@/components/ventas/types";
import { fmtMoney, fmtMoneyCompact } from "@/lib/ventas/format";
import { formatDeltaRatio, type DeltaTone } from "@/lib/ventas/formatDelta";
import { variacionPctDesdeRatio } from "@/lib/variacion";
import { cn } from "@/lib/utils";
import { BonosSection } from "./BonosSection";
import { MetasSubtab } from "./MetasSubtab";
import { MetasEnVendedoras } from "./MetasEnVendedoras";
import { nombreEnPantalla } from "@/lib/multifashion/nombres";
import { notaComparacionVendedoras, rotuloDeltaVendedoras, type ChipVendedoras } from "@/lib/multifashion/vendedoras-rotulo";
import type { CortePeriodo, Periodo } from "@/lib/multifashion/periodo";

const MES_FULL = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const TONE_LIGHT: Record<DeltaTone, string> = {
  emerald: "text-emerald-600",
  orange:  "text-red-600",
  stone:   "text-gray-500",
};

/** Lo que dice la columna Bono mientras el mes no cierre. */
export const BONO_AL_CIERRE = "al cierre";

type SortKey = "tickets" | "ventas" | "delta_ventas" | "comision";
type SortDir = "asc" | "desc";
type ChipKey = ChipVendedoras;

// Badge info por vendedora, derivado del RPC de bonos (sin fórmulas nuevas).
interface BonoBadge { winner: boolean; gerenteBono: number }

interface VendedorasSubtabProps {
  selectedYear: number;
  /**
   * El período del módulo. Cuando llega, esta pestaña NO dibuja ningún control
   * de tiempo: manda el desplegable único del encabezado.
   *
   * ⚠️ SIN ÉL la vista se comporta EXACTAMENTE como antes, con sus seis
   * píldoras. Ésa es la pestaña espejo de Comisiones (`ComisionesView`), que no
   * tiene el encabezado de Multifashion y **no se toca**.
   */
  periodo?: Periodo;
  corte?: CortePeriodo;
  /** Dibuja las Metas debajo. Solo el módulo Multifashion las pide (el espejo
   *  de Comisiones recibiría un 403 de `/api/multifashion/metas`). */
  conMetas?: boolean;
}

/**
 * ⚠️ ESTA VISTA TIENE DOS PUERTAS Y UNA SOLA IMPLEMENTACIÓN (6-sep-2026):
 * Multifashion › Vendedoras y Comisiones › Multifashion. Daniel: «no hay
 * diferencia, solo son un espejo». Misma RPC, mismos números — si algún día
 * hay que cambiarla, se cambia UNA vez y las dos puertas dicen lo mismo.
 * 🔴 Multifashion comisiona con OTRA base que el grupo: no se fusiona nada.
 */
export function VendedorasSubtab({ selectedYear, periodo, corte, conMetas }: VendedorasSubtabProps) {
  const year = selectedYear;

  // Meses base relativos a hoy. Para año cerrado, "en curso" = Dic.
  const now = new Date();
  const isCurrentYear = year === now.getFullYear();
  const enCursoMes = isCurrentYear ? now.getMonth() + 1 : 12;
  const mesAnteriorMes = Math.max(1, enCursoMes - 1);

  // Control PROPIO — solo cuando no llega el período del módulo (el espejo).
  const [chipPropio, setChipPropio] = useState<ChipKey>("en_curso");
  const conControlPropio = periodo == null;

  // El período, dicho en el vocabulario de la RPC. Los dos caminos terminan en
  // el MISMO chip → el rótulo de la Δ y la nota salen de un solo lugar.
  const { chip, rpcMes } = useMemo((): { chip: ChipKey; rpcMes: number } => {
    if (periodo == null) {
      return { chip: chipPropio, rpcMes: chipPropio === "en_curso" ? enCursoMes : mesAnteriorMes };
    }
    if (periodo.tipo === "ultimos") {
      return { chip: `ultimos_${periodo.n}` as ChipKey, rpcMes: corte?.mes ?? enCursoMes };
    }
    if (periodo.tipo === "anio") return { chip: "ytd", rpcMes: enCursoMes };
    // Un mes: «en curso» si es el mes de corte, «cerrado» si no. La distinción
    // solo cambia el RÓTULO — la RPC recibe el mismo `p_mes` en los dos casos.
    const esElDeCorte = corte != null && periodo.anio === corte.anio && periodo.mes === corte.mes;
    return { chip: esElDeCorte ? "en_curso" : "mes_anterior", rpcMes: periodo.mes };
  }, [periodo, corte, chipPropio, enCursoMes, mesAnteriorMes]);

  const rangoN = chip === "ultimos_3" ? 3 : chip === "ultimos_6" ? 6 : chip === "ultimos_12" ? 12 : null;
  const esRango = rangoN != null;

  const rpcPeriodo: VendedorasPeriodoTipo | "ultimos" =
    esRango ? "ultimos" : chip === "ytd" ? "ytd" : "mes";
  // Mes cuyo bono se evalúa. (No aplica a ventanas rodantes: el bono es por mes.)
  const bonoMes = rpcMes;

  const [bonos, setBonos] = useState<BonosMultifashion | null>(null);
  const onBonosData = useCallback((r: BonosMultifashion | null) => setBonos(r), []);

  const [sortBy, setSortBy] = useState<SortKey>("ventas");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Querystring del ranking — MISMOS params que antes: year + periodo; mes solo
  // en "mes"; n+mes en "ultimos". El querystring ES la clave SWR.
  const params = new URLSearchParams({ year: String(year), periodo: rpcPeriodo });
  if (rpcPeriodo === "mes") params.set("mes", String(rpcMes));
  if (rpcPeriodo === "ultimos") { params.set("n", String(rangoN)); params.set("mes", String(rpcMes)); }
  const vendedorasUrl = `/api/multifashion/vendedoras?${params.toString()}`;

  const { data: resp, error, isLoading, mutate } = useSWR<VendedorasPeriodo>(
    vendedorasUrl,
    async (url: string) => {
      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body?.error ?? `HTTP ${r.status}`);
      }
      return r.json() as Promise<VendedorasPeriodo>;
    },
    { dedupingInterval: 5 * 60_000, revalidateOnFocus: false },
  );

  const loading = isLoading && !resp;
  const errorMsg = error ? (error instanceof Error ? error.message : "error inesperado") : null;

  // Badges de bono por nombre (solo cuando el mes es evaluable; nunca en rangos).
  const bonoBadges = useMemo(() => {
    const map = new Map<string, BonoBadge>();
    if (esRango) return map;
    if (bonos && !bonos.sin_data && bonos.es_elegible) {
      const gerenteBono = bonos.gerente.bono;
      for (const v of bonos.vendedoras) {
        map.set(v.nombre, { winner: v.bono_vendedora, gerenteBono });
      }
    }
    return map;
  }, [bonos, esRango]);

  // El mes todavía no cerró (o no hay datos de bono): la columna dice «al cierre»
  // en vez de un guion, que se leería como «no le toca».
  const bonoPendiente = !esRango && (!bonos || bonos.sin_data || !bonos.es_elegible);

  const sortedVendedoras = useMemo(() => {
    if (!resp) return [];
    const arr = resp.vendedoras.slice();
    const sign = sortDir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      switch (sortBy) {
        case "tickets":  return (a.tickets - b.tickets) * sign;
        case "ventas":   return (a.ventas - b.ventas) * sign;
        case "comision": return (a.comision - b.comision) * sign;
        case "delta_ventas": {
          const av = a.delta_ventas_pct, bv = b.delta_ventas_pct;
          if (av == null && bv == null) return 0;
          if (av == null) return 1;
          if (bv == null) return -1;
          return (av - bv) * sign;
        }
      }
    });
    return arr;
  }, [resp, sortBy, sortDir]);

  const onSort = (col: SortKey) => {
    if (sortBy === col) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortBy(col); setSortDir("desc"); }
  };

  // Contra qué compara la Δ en el período activo (ver el encabezado del archivo).
  const rotuloDelta = rotuloDeltaVendedoras(chip, rpcMes, year);
  const notaComparacion = resp
    ? notaComparacionVendedoras(chip, rpcMes, year, resp.es_periodo_parcial, resp.dia_corte_periodo_anterior)
    : null;

  const chipLabel: Record<ChipKey, string> = {
    en_curso: `${MES_FULL[enCursoMes - 1]} ${year} (en curso)`,
    mes_anterior: `${MES_FULL[mesAnteriorMes - 1]} ${year}`,
    ytd: `YTD ${year}`,
    ultimos_3: "Últimos 3 meses",
    ultimos_6: "Últimos 6 meses",
    ultimos_12: "Últimos 12 meses",
  };

  return (
    <div className="space-y-4">
      {errorMsg && (
        <div className="rounded-md border border-orange-200 bg-orange-50 px-3 py-2 text-xs text-orange-900">
          No se pudo cargar el ranking: {errorMsg}
          <button onClick={() => mutate()} className="ml-2 font-medium underline underline-offset-2 hover:text-orange-700">Reintentar</button>
        </div>
      )}

      {/* Contexto del bono del gerente. Ya NO es una barra de color: es una línea
          gris debajo del subtítulo. Sigue elevando la data para la columna Bono. */}
      {!esRango && (
        <BonosSection selectedYear={year} mes={bonoMes} onData={onBonosData} />
      )}

      {/* ⚠️ Las píldoras SOLO en la pestaña espejo de Comisiones, que no tiene el
          desplegable del módulo. En Multifashion se retiraron (ver arriba). */}
      {conControlPropio && (
        <div className="flex flex-wrap items-center gap-2">
          <ChipPill active={chipPropio === "en_curso"} onClick={() => setChipPropio("en_curso")}>
            {`${MES_FULL[enCursoMes - 1]} (en curso)`}
          </ChipPill>
          <ChipPill active={chipPropio === "mes_anterior"} onClick={() => setChipPropio("mes_anterior")}>
            {`${MES_FULL[mesAnteriorMes - 1]} (cerrado)`}
          </ChipPill>
          <ChipPill active={chipPropio === "ytd"} onClick={() => setChipPropio("ytd")}>
            {`YTD ${year}`}
          </ChipPill>
          <span className="mx-1 h-4 w-px bg-gray-200" aria-hidden />
          <ChipPill active={chipPropio === "ultimos_3"} onClick={() => setChipPropio("ultimos_3")}>Últimos 3 meses</ChipPill>
          <ChipPill active={chipPropio === "ultimos_6"} onClick={() => setChipPropio("ultimos_6")}>Últimos 6 meses</ChipPill>
          <ChipPill active={chipPropio === "ultimos_12"} onClick={() => setChipPropio("ultimos_12")}>Últimos 12 meses</ChipPill>
        </div>
      )}

      <div className={cn(loading && "opacity-60 transition-opacity")}>
        {/* `sr-only`: la pestaña dice "Vendedoras" y el período está arriba. */}
        <h3 className="sr-only">Vendedoras · {chipLabel[chip]}</h3>
        {resp && (
          <p className="mt-0.5 text-xs text-gray-500">
            <span className="font-mono tabular-nums text-gray-700">{resp.total_vendedoras_periodo}</span> vendedoras ·{" "}
            <span className="font-mono tabular-nums text-gray-700">{fmtMoney(resp.ventas_total)}</span> ventas ·{" "}
            <span className="font-mono tabular-nums text-gray-700">{resp.tickets_total.toLocaleString()}</span> tickets
          </p>
        )}
        <p className="mt-1 text-xs text-gray-400">
          Ventas atribuidas a cada vendedor (incluye mayoreo si lo hubo).
          {notaComparacion && <> {notaComparacion}</>}
        </p>
      </div>

      {/* Tabla única */}
      {resp && resp.vendedoras.length === 0 ? (
        <EmptyState />
      ) : (
        <div className={cn(loading && "opacity-60 pointer-events-none transition-opacity")}>
          {/* Escritorio. El corte es `lg` y no `md` porque lo que decide es el
              ancho ÚTIL: la barra lateral se lleva 224 px. */}
          <Card data-vista="tabla" className="hidden p-0 lg:block">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse" style={{ minWidth: 720 }}>
                <thead>
                  <tr className="bg-gray-100">
                    <th className="w-10 border-b border-gray-200 px-3.5 py-2.5 text-right text-xs font-medium uppercase tracking-wide text-gray-500">#</th>
                    <th className="border-b border-gray-200 px-3.5 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Vendedora</th>
                    <SortHeader col="tickets"      sortBy={sortBy} sortDir={sortDir} onClick={onSort}>Tickets</SortHeader>
                    <SortHeader col="ventas"       sortBy={sortBy} sortDir={sortDir} onClick={onSort}>Ventas</SortHeader>
                    <th className="border-b border-gray-200 px-3.5 py-2.5 text-right text-xs font-medium uppercase tracking-wide text-gray-500">Ticket prom.</th>
                    <SortHeader col="delta_ventas" sortBy={sortBy} sortDir={sortDir} onClick={onSort}>{rotuloDelta.columna}</SortHeader>
                    <SortHeader col="comision"     sortBy={sortBy} sortDir={sortDir} onClick={onSort}>Comisión</SortHeader>
                    {/* El bono, donde le corresponde: una columna, no una barra. */}
                    {!esRango && (
                      <th className="border-b border-gray-200 px-3.5 py-2.5 text-right text-xs font-medium uppercase tracking-wide text-gray-500">Bono</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {sortedVendedoras.map((v, i) => (
                    <VendedoraRow
                      key={v.nombre}
                      v={v}
                      rank={i + 1}
                      badge={bonoBadges.get(v.nombre)}
                      conBono={!esRango}
                      pendiente={bonoPendiente}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Celular e iPad */}
          <div data-vista="tarjetas" className="space-y-2 lg:hidden">
            {sortedVendedoras.map((v, i) => (
              <VendedoraCard
                key={v.nombre}
                v={v}
                rank={i + 1}
                badge={bonoBadges.get(v.nombre)}
                conBono={!esRango}
                pendiente={bonoPendiente}
                rotuloDelta={rotuloDelta.corto}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── LAS METAS, ENTERAS Y ABAJO ────────────────────────────────────────
          Primero cómo van (la tarjeta de avance, «Nueva meta», «Cambiar», el
          premio, las fechas y la historia) y después cuánto aportó cada una.
          Las dos leen la MISMA clave de SWR: se pide una sola vez. */}
      {conMetas && (
        <section className="mt-8 space-y-4">
          <h3 className="text-sm font-semibold text-gray-950">Metas</h3>
          <MetasSubtab />
          <MetasEnVendedoras />
        </section>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Fila y tarjeta
// ─────────────────────────────────────────────────────────────────────────────

/** Lo que dice la celda Bono de una vendedora. */
export function textoBono(
  v: { manager: boolean },
  badge: BonoBadge | undefined,
  pendiente: boolean,
): string {
  if (pendiente) return BONO_AL_CIERRE;
  if (badge?.winner) return "$50";
  if (v.manager && badge && badge.gerenteBono > 0) return `$${badge.gerenteBono}`;
  return "—";
}

function rowHighlight(v: VendedoraDetalle, badge?: BonoBadge): boolean {
  return !!badge?.winner || (v.manager && !!badge && badge.gerenteBono > 0);
}

// El payload no trae las ventas del período previo, así que la base se despeja
// del propio ratio (prev = ventas / (1 + pct)) y se le aplica la MISMA regla.
// Una vendedora que el año pasado vendió $8 en el mes no genera un +40000%.
function VendedoraRow({
  v, rank, badge, conBono, pendiente,
}: {
  v: VendedoraDetalle; rank: number; badge?: BonoBadge; conBono: boolean; pendiente: boolean;
}) {
  const dv = formatDeltaRatio(variacionPctDesdeRatio(v.ventas, v.delta_ventas_pct));
  const bono = textoBono(v, badge, pendiente);
  return (
    <tr className={rowHighlight(v, badge) ? "bg-amber-50/60" : ""}>
      <td className="border-b border-gray-200 px-3.5 py-3 text-right font-mono text-xs text-gray-500 tabular-nums">{rank}</td>
      <td className="border-b border-gray-200 px-3.5 py-3 text-sm text-gray-950">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-medium">{nombreEnPantalla(v.nombre)}</span>
          {v.manager && (
            <span className="rounded-md bg-teal-50 px-1.5 py-0.5 text-xs font-medium text-teal-700">Gerente</span>
          )}
        </div>
      </td>
      <td className="border-b border-gray-200 px-3.5 py-3 text-right font-mono text-sm text-gray-700 tabular-nums">{v.tickets.toLocaleString()}</td>
      <td className="border-b border-gray-200 px-3.5 py-3 text-right font-mono text-sm font-medium text-gray-950 tabular-nums">{fmtMoney(v.ventas)}</td>
      <td className="border-b border-gray-200 px-3.5 py-3 text-right font-mono text-sm text-gray-700 tabular-nums">${v.ticket_promedio.toFixed(2)}</td>
      <td className={cn("border-b border-gray-200 px-3.5 py-3 text-right font-mono text-xs tabular-nums", TONE_LIGHT[dv.tone])}>
        {dv.arrow && <span className="mr-1">{dv.arrow}</span>}{dv.displayValue}
      </td>
      <td className="border-b border-gray-200 px-3.5 py-3 text-right font-mono text-sm font-medium text-gray-950 tabular-nums">${v.comision.toFixed(2)}</td>
      {conBono && (
        <td className={cn(
          "border-b border-gray-200 px-3.5 py-3 text-right text-sm tabular-nums",
          bono === BONO_AL_CIERRE ? "text-xs text-gray-400" : bono === "—" ? "text-gray-400" : "font-mono font-semibold text-amber-700",
        )}>
          {bono}
        </td>
      )}
    </tr>
  );
}

function VendedoraCard({
  v, rank, badge, conBono, pendiente, rotuloDelta,
}: {
  v: VendedoraDetalle; rank: number; badge?: BonoBadge; conBono: boolean; pendiente: boolean; rotuloDelta: string;
}) {
  const dv = formatDeltaRatio(variacionPctDesdeRatio(v.ventas, v.delta_ventas_pct));
  const bono = textoBono(v, badge, pendiente);
  return (
    <div className={cn(
      "rounded-lg border bg-white px-4 py-3.5",
      rowHighlight(v, badge) ? "border-amber-200 bg-amber-50/40" : "border-gray-200"
    )}>
      <div className="flex flex-wrap items-baseline gap-1.5">
        <span className="font-mono text-xs text-gray-500 tabular-nums">{rank}.</span>
        <span className="truncate text-[15px] font-medium leading-tight text-gray-950">{nombreEnPantalla(v.nombre)}</span>
        {v.manager && (
          <span className="rounded-md bg-teal-50 px-1.5 py-0.5 text-xs font-medium text-teal-700">Gerente</span>
        )}
      </div>
      <div className="mt-2 flex items-baseline gap-3">
        <span className="font-mono text-base font-medium tabular-nums text-gray-950">{fmtMoneyCompact(v.ventas)}</span>
        <span className={cn("font-mono text-xs tabular-nums", TONE_LIGHT[dv.tone])}>
          {dv.arrow && <span className="mr-0.5">{dv.arrow}</span>}{dv.displayValue}
          <span className="ml-1 text-gray-400">{rotuloDelta}</span>
        </span>
      </div>
      <div className="mt-1 text-xs text-gray-500">
        <span className="font-mono tabular-nums">{v.tickets.toLocaleString()}</span> tickets ·{" "}
        <span className="font-mono tabular-nums">${v.ticket_promedio.toFixed(2)}</span> tkt prom ·{" "}
        <span className="font-mono tabular-nums">${v.comision.toFixed(2)}</span> comisión
        {conBono && <> · bono <span className={cn(bono === BONO_AL_CIERRE || bono === "—" ? "text-gray-400" : "font-mono font-semibold text-amber-700")}>{bono}</span></>}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Chip + empty + sort header
// ─────────────────────────────────────────────────────────────────────────────

function ChipPill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex min-h-[44px] items-center whitespace-nowrap rounded-full border px-4 py-2.5 text-xs font-medium transition",
        active ? "border-teal-700 bg-teal-700 text-white" : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
      )}
    >
      {children}
    </button>
  );
}

function EmptyState() {
  return (
    <Card className="flex min-h-[200px] flex-col items-center justify-center gap-3 p-12 text-center">
      <Users className="h-10 w-10 text-gray-400" strokeWidth={1.5} />
      <p className="text-sm text-gray-500">Sin vendedoras con actividad en este período</p>
    </Card>
  );
}

function SortHeader({
  col, children, sortBy, sortDir, onClick,
}: {
  col: SortKey;
  children: React.ReactNode;
  sortBy: SortKey;
  sortDir: SortDir;
  onClick: (c: SortKey) => void;
}) {
  const active = sortBy === col;
  return (
    <th
      onClick={() => onClick(col)}
      className={cn(
        "cursor-pointer select-none whitespace-nowrap border-b border-gray-200 bg-gray-100 px-3.5 py-2.5 text-right text-xs font-medium uppercase tracking-wide transition",
        active ? "text-gray-950" : "text-gray-500 hover:text-gray-700"
      )}
    >
      <span className="inline-flex items-center gap-1">
        {children}
        <span className={cn("text-xs", active ? "opacity-100" : "opacity-35")}>
          {active ? (sortDir === "asc" ? "↑" : "↓") : "↕"}
        </span>
      </span>
    </th>
  );
}

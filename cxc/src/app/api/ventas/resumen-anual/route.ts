import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { supabaseServer } from "@/lib/supabase-server";
import {
  ALL_EMPRESA_KEYS,
  EMPRESA_KEY_TO_VENTAS_ID,
  EMPRESA_KEY_TO_NAME,
} from "@/lib/empresa-mapping";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Resumen ANUAL del tab Resumen de Ventas: totales por empresa × año a partir del
// rollup mensual ventas_rollup_mensual_mv (misma fuente que el resto; cuadra al
// centavo contra ventas_dashboard_summary / Switch). Agrega por año en JS (sin
// crear tabla/vista nueva). Δ YoY: full-vs-full para años cerrados, same-period
// (YTD vs YTD) para el año en curso, sin Δ para el primer año (sin previo).

type Vals = { ventas: number; costo: number; utilidad: number };
const zero = (): Vals => ({ ventas: 0, costo: 0, utilidad: 0 });
const add = (a: Vals, b: Vals): Vals => ({
  ventas: a.ventas + b.ventas,
  costo: a.costo + b.costo,
  utilidad: a.utilidad + b.utilidad,
});

const MES_ABBR = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

interface MvRow {
  empresa_key: string;
  anio: number;
  mes_num: number;
  ventas_netas: number | string | null;
  costo_total: number | string | null;
  utilidad: number | string | null;
}

export async function GET(req: NextRequest) {
  const auth = requireRole(req, ["admin", "contabilidad"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const { data, error } = await supabaseServer
      .from("ventas_rollup_mensual_mv")
      .select("empresa_key, anio, mes_num, ventas_netas, costo_total, utilidad");
    if (error) throw new Error(`ventas_rollup_mensual_mv: ${error.message}`);
    const rows = (data ?? []) as MvRow[];

    // byEmp[empKey][anio][mes_num] = Vals
    const byEmp = new Map<string, Map<number, Map<number, Vals>>>();
    const yearsSet = new Set<number>();
    for (const r of rows) {
      const v: Vals = {
        ventas: Number(r.ventas_netas ?? 0),
        costo: Number(r.costo_total ?? 0),
        utilidad: Number(r.utilidad ?? 0),
      };
      yearsSet.add(r.anio);
      let yMap = byEmp.get(r.empresa_key);
      if (!yMap) { yMap = new Map(); byEmp.set(r.empresa_key, yMap); }
      let mMap = yMap.get(r.anio);
      if (!mMap) { mMap = new Map(); yMap.set(r.anio, mMap); }
      mMap.set(r.mes_num, add(mMap.get(r.mes_num) ?? zero(), v));
    }

    const years = Array.from(yearsSet).sort((a, b) => a - b);
    if (years.length === 0) {
      return NextResponse.json({ years: [], empresas: [], totalGrupo: { byYear: {}, total: zero() }, parcial: null, currentYear: null });
    }
    const earliest = years[0];
    const currentYear = years[years.length - 1];

    // Meses presentes (a nivel grupo) por año — para detectar el parcial y el
    // cutoff del año en curso.
    const groupMonths = new Map<number, Set<number>>();
    for (const yMap of byEmp.values()) {
      for (const [anio, mMap] of yMap) {
        let s = groupMonths.get(anio);
        if (!s) { s = new Set(); groupMonths.set(anio, s); }
        for (const m of mMap.keys()) s.add(m);
      }
    }
    const monthsCurrent = Array.from(groupMonths.get(currentYear) ?? []).sort((a, b) => a - b);
    const maxMonthCurrent = monthsCurrent.length ? monthsCurrent[monthsCurrent.length - 1] : 12;

    // El primer año es "parcial" si no tiene los 12 meses (switch_facturas arranca
    // 2022-10). Etiqueta tipo "oct–dic".
    let parcial: { year: number; label: string } | null = null;
    const earliestMonths = Array.from(groupMonths.get(earliest) ?? []).sort((a, b) => a - b);
    if (earliestMonths.length > 0 && earliestMonths.length < 12) {
      const lo = earliestMonths[0], hi = earliestMonths[earliestMonths.length - 1];
      parcial = { year: earliest, label: `${MES_ABBR[lo - 1]}–${MES_ABBR[hi - 1]}` };
    }

    // Total de una empresa-año (suma de sus meses).
    const yearTotal = (mMap: Map<number, Vals> | undefined): Vals => {
      const t = zero();
      if (!mMap) return t;
      for (const v of mMap.values()) { t.ventas += v.ventas; t.costo += v.costo; t.utilidad += v.utilidad; }
      return t;
    };
    // Suma de meses 1..maxMonth de una empresa-año (para same-period del año en curso).
    const yearTotalUpTo = (mMap: Map<number, Vals> | undefined, maxMonth: number): Vals => {
      const t = zero();
      if (!mMap) return t;
      for (const [m, v] of mMap) {
        if (m <= maxMonth) { t.ventas += v.ventas; t.costo += v.costo; t.utilidad += v.utilidad; }
      }
      return t;
    };

    // Previo comparable de la celda (emp, Y): null (sin Δ) si:
    //   - Y es el primer año (no hay previo), o
    //   - el año previo es el PARCIAL (comparar un año completo contra oct–dic es
    //     engañoso → mismo principio "datos insuf." que el resto del módulo).
    // Si Y es el año en curso → same-period (YTD vs YTD). Si es cerrado → full year.
    const partialYear = parcial ? parcial.year : null;
    const prevBasis = (yMap: Map<number, Map<number, Vals>>, Y: number): Vals | null => {
      if (Y === earliest) return null;
      if (partialYear !== null && Y - 1 === partialYear) return null;
      const prevM = yMap.get(Y - 1);
      if (!prevM) return null;
      return Y === currentYear ? yearTotalUpTo(prevM, maxMonthCurrent) : yearTotal(prevM);
    };

    const empresas = ALL_EMPRESA_KEYS.filter((k) => byEmp.has(k)).map((empKey) => {
      const yMap = byEmp.get(empKey)!;
      const byYear: Record<number, { ventas: number; costo: number; utilidad: number; prev: Vals | null }> = {};
      const total = zero();
      for (const Y of years) {
        const t = yearTotal(yMap.get(Y));
        byYear[Y] = { ...t, prev: prevBasis(yMap, Y) };
        total.ventas += t.ventas; total.costo += t.costo; total.utilidad += t.utilidad;
      }
      return {
        id: EMPRESA_KEY_TO_VENTAS_ID[empKey] ?? empKey,
        nombre: EMPRESA_KEY_TO_NAME[empKey] ?? empKey,
        byYear,
        total,
      };
    });

    // Total Grupo por año (suma de empresas) + previo del grupo.
    const totalByYear: Record<number, { ventas: number; costo: number; utilidad: number; prev: Vals | null }> = {};
    const totalAll = zero();
    for (const Y of years) {
      const t = zero();
      let prev: Vals | null = null;
      for (const e of empresas) {
        const cell = e.byYear[Y];
        t.ventas += cell.ventas; t.costo += cell.costo; t.utilidad += cell.utilidad;
        if (cell.prev) prev = add(prev ?? zero(), cell.prev);
      }
      totalByYear[Y] = { ...t, prev };
      totalAll.ventas += t.ventas; totalAll.costo += t.costo; totalAll.utilidad += t.utilidad;
    }

    return NextResponse.json({
      years,
      currentYear,
      parcial,
      empresas,
      totalGrupo: { byYear: totalByYear, total: totalAll },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "error inesperado";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { supabaseServer } from "@/lib/supabase-server";
import {
  ALL_EMPRESA_KEYS,
  EMPRESA_KEY_TO_VENTAS_ID,
  EMPRESA_KEY_TO_NAME,
} from "@/lib/empresa-mapping";
import { hoyPanama } from "@/lib/fecha-panama";
import { leerPrevSamePeriod, sumarPrevPorEmpresa } from "@/lib/ventas/prev-same-period";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Resumen ANUAL del tab Resumen de Ventas: totales por empresa × año a partir del
// rollup mensual ventas_rollup_mensual_mv (misma fuente que el resto; cuadra al
// centavo contra ventas_dashboard_summary / Switch). Agrega por año en JS (sin
// crear tabla/vista nueva). Δ YoY: full-vs-full para años cerrados, same-period
// para el año en curso, sin Δ para el primer año (sin previo).
//
// ── 🩸 «SAME-PERIOD» SON LOS MISMOS DÍAS, NO LOS MISMOS MESES (3-sep-2026) ──
//
// Hasta hoy el previo del año en curso era `mes <= maxMonthCurrent` sobre la MV:
// 2026 hasta el 3-sep contra ene–SEPTIEMBRE ENTERO de 2025. Ocho meses y tres
// días contra nueve meses. Medido contra producción: el grupo decía **−7,0%** y
// crecía **+2,5%**; Fashion Wear −13,8% → −5,9%; Vistana +0,4% → +10,5%;
// Fashion Shoes −6,1% → +7,2%; Boston −15,5% → −0,3%; ACS +3,8% → +13,9%.
// Cinco de ocho cambiaban de signo. Y el día 1 de cada mes la comparación
// saltaba un mes entero hacia atrás.
//
// Ahora el previo del año en curso sale de `ventas_dashboard_prev_same_period`
// (`prev-same-period.ts`): los meses cerrados enteros + el mes en curso
// recortado al mismo día de esa empresa (día de Panamá, último cargado, topado
// en hoy). Es la MISMA lectura del KPI del Resumen y de Vista General — un solo
// corte para las tres pantallas. Los años cerrados siguen saliendo de la MV.
// Definición única del corte: `src/lib/ventas/clientes-corte-comparativo.ts`.

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

    // 🩸 El previo del AÑO EN CURSO, recortado a los mismos días (ver el
    // encabezado). Solo si el último año de la MV es el año de HOY en Panamá:
    // un año ya cerrado se compara entero contra entero desde la MV.
    const anioHoy = Number(hoyPanama().slice(0, 4));
    let prevMismosDias: Map<string, Vals> | null = null;
    let corte: { fecha_corte: string | null; dia_corte_anio_anterior: string | null } | null = null;
    if (currentYear === anioHoy) {
      const prevRes = await leerPrevSamePeriod(currentYear);
      if (prevRes.error || !prevRes.data) {
        throw new Error(`ventas_dashboard_prev_same_period: ${prevRes.error?.message ?? "sin datos"}`);
      }
      prevMismosDias = sumarPrevPorEmpresa(prevRes.data.rows ?? []);
      corte = { fecha_corte: prevRes.data.fecha_corte, dia_corte_anio_anterior: prevRes.data.dia_corte_anio_anterior };
    }

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
    // Previo comparable de la celda (emp, Y): null (sin Δ) si:
    //   - Y es el primer año (no hay previo), o
    //   - el año previo es el PARCIAL (comparar un año completo contra oct–dic es
    //     engañoso → mismo principio "datos insuf." que el resto del módulo).
    // Si Y es el año en curso → los MISMOS DÍAS del año anterior (la RPC, ver
    // el encabezado). Si es cerrado → el año entero desde la MV.
    const partialYear = parcial ? parcial.year : null;
    const prevBasis = (empKey: string, yMap: Map<number, Map<number, Vals>>, Y: number): Vals | null => {
      if (Y === earliest) return null;
      if (partialYear !== null && Y - 1 === partialYear) return null;
      const prevM = yMap.get(Y - 1);
      if (!prevM) return null;
      if (Y === currentYear && prevMismosDias) return prevMismosDias.get(empKey) ?? zero();
      return yearTotal(prevM);
    };

    const empresas = ALL_EMPRESA_KEYS.filter((k) => byEmp.has(k)).map((empKey) => {
      const yMap = byEmp.get(empKey)!;
      const byYear: Record<number, { ventas: number; costo: number; utilidad: number; prev: Vals | null }> = {};
      const total = zero();
      for (const Y of years) {
        const t = yearTotal(yMap.get(Y));
        byYear[Y] = { ...t, prev: prevBasis(empKey, yMap, Y) };
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
      // Hasta qué día se comparó el año en curso (día de Panamá) y hasta qué
      // día se sumó el año anterior, para que la pantalla lo DIGA.
      corte,
      empresas,
      totalGrupo: { byYear: totalByYear, total: totalAll },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "error inesperado";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

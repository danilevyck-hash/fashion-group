import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { supabaseServer } from "@/lib/supabase-server";
import {
  ALL_EMPRESA_KEYS,
  EMPRESA_KEY_TO_VENTAS_ID,
  EMPRESA_KEY_TO_NAME,
} from "@/lib/empresa-mapping";
import { hoyPanama } from "@/lib/fecha-panama";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Vista "Mes × año" del tab Resumen de Ventas: para UNA empresa, matriz de
// 12 meses (filas) × todos los años (columnas), celda = ventas/costo/utilidad
// de ese mes-año + Δ vs el mismo mes del año anterior. Misma fuente que el
// resto del módulo: el rollup mensual ventas_rollup_mensual_mv (cuadra al
// centavo contra ventas_dashboard_summary / Switch). Agrega en JS, sin crear
// tabla/vista nueva.
//
// Devuelve TODAS las empresas en una sola respuesta (la MV son ~400 filas):
// el selector de empresa vive en el cliente → cambiar de empresa NO refetchea
// (igual que el modo Anual, cacheado vía SWR).
//
// Reglas (mismo criterio que la vista Anual):
//   - 2022 es parcial (switch_facturas arranca 2022-10): los meses ene–sep
//     simplemente no tienen fila → la celda queda VACÍA (no 0).
//   - Δ se calcula solo donde existe el mismo mes del año previo (oct-2022 es
//     un mes completo, así que 2023-oct vs 2022-oct sí es comparable).
//   - El mes en curso del año actual es parcial → viaja con `prev: null` y el
//     Δ de esa celda lo pone la PANTALLA con los MISMOS DÍAS del año anterior
//     (`ventas_dashboard_prev_same_period`, que el Resumen ya tiene cargado —
//     ver `ResumenMesAnio.tsx`). 🩸 Hasta el 3-sep-2026 la pantalla ignoraba
//     este `prev` y leía `byMonth[m][y−1]`: el mes ENTERO del año pasado.
//     Medido: Fashion Wear sep decía −99,4% (era −98,5%); Boston −93,5%
//     cuando iba **+2,2%**.
//   - «Mes en curso» es el de HOY EN PANAMÁ (UTC−5), no el del reloj UTC del
//     servidor: entre las 7 p.m. y la medianoche el UTC ya está en mañana, y
//     el 31 a la noche habría marcado parcial al mes siguiente.

type Vals = { ventas: number; costo: number; utilidad: number };
const zero = (): Vals => ({ ventas: 0, costo: 0, utilidad: 0 });

interface MvRow {
  empresa_key: string;
  anio: number;
  mes_num: number;
  ventas_netas: number | string | null;
  costo_total: number | string | null;
  utilidad: number | string | null;
}

const MES_ABBR = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

interface Cell extends Vals {
  prev: Vals | null;
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

    // byEmp[empKey][mes_num][anio] = Vals
    const byEmp = new Map<string, Map<number, Map<number, Vals>>>();
    const yearsSet = new Set<number>();
    for (const r of rows) {
      const v: Vals = {
        ventas: Number(r.ventas_netas ?? 0),
        costo: Number(r.costo_total ?? 0),
        utilidad: Number(r.utilidad ?? 0),
      };
      yearsSet.add(r.anio);
      let mMap = byEmp.get(r.empresa_key);
      if (!mMap) { mMap = new Map(); byEmp.set(r.empresa_key, mMap); }
      let yMap = mMap.get(r.mes_num);
      if (!yMap) { yMap = new Map(); mMap.set(r.mes_num, yMap); }
      // Una fila por (empresa, mes) — pero sumamos defensivo por si acaso.
      const prev = yMap.get(r.anio) ?? zero();
      yMap.set(r.anio, { ventas: prev.ventas + v.ventas, costo: prev.costo + v.costo, utilidad: prev.utilidad + v.utilidad });
    }

    const years = Array.from(yearsSet).sort((a, b) => a - b);
    if (years.length === 0) {
      return NextResponse.json({ years: [], currentYear: null, partial: null, earliestPartial: null, empresas: [] });
    }
    const earliest = years[0];
    const currentYear = years[years.length - 1];

    // El mes en curso (parcial) sale del calendario DE PANAMÁ, no de la data:
    // comparar el mes a medias contra el mes completo del año previo no es
    // justo → `prev: null`, y la pantalla pone los mismos días.
    const hoy = hoyPanama();
    const anioHoy = Number(hoy.slice(0, 4));
    const partial = years.includes(anioHoy)
      ? { year: anioHoy, month: Number(hoy.slice(5, 7)) }
      : null;

    // Meses presentes (a nivel grupo) por año — para etiquetar el 2022 parcial.
    const groupMonthsByYear = new Map<number, Set<number>>();
    for (const mMap of byEmp.values()) {
      for (const [mes, yMap] of mMap) {
        for (const anio of yMap.keys()) {
          let s = groupMonthsByYear.get(anio);
          if (!s) { s = new Set(); groupMonthsByYear.set(anio, s); }
          s.add(mes);
        }
      }
    }
    let earliestPartial: { year: number; label: string } | null = null;
    const earliestMonths = Array.from(groupMonthsByYear.get(earliest) ?? []).sort((a, b) => a - b);
    if (earliestMonths.length > 0 && earliestMonths.length < 12) {
      const lo = earliestMonths[0], hi = earliestMonths[earliestMonths.length - 1];
      earliestPartial = { year: earliest, label: `${MES_ABBR[lo - 1]}–${MES_ABBR[hi - 1]}` };
    }

    const isPartialCell = (anio: number, mes: number) =>
      partial !== null && partial.year === anio && partial.month === mes;

    const empresas = ALL_EMPRESA_KEYS.filter((k) => byEmp.has(k)).map((empKey) => {
      const mMap = byEmp.get(empKey)!;
      // byMonth[mes][anio] = Cell. Solo se incluyen las celdas con data (las
      // ausentes → el cliente pinta "—").
      const byMonth: Record<number, Record<number, Cell>> = {};
      const totalByYear: Record<number, Vals> = {};
      const totalByMonth: Record<number, Vals> = {};
      const grandTotal = zero();

      for (let mes = 1; mes <= 12; mes++) {
        const yMap = mMap.get(mes);
        if (!yMap) continue;
        const rowYears: Record<number, Cell> = {};
        const mesTotal = zero();
        for (const Y of years) {
          const cur = yMap.get(Y);
          if (!cur) continue;
          // Previo: mismo mes, año-1. null (sin Δ) si no existe o si la celda
          // actual es el mes en curso parcial.
          const prevVals = yMap.get(Y - 1) ?? null;
          const prev = isPartialCell(Y, mes) ? null : prevVals;
          rowYears[Y] = { ...cur, prev };
          mesTotal.ventas += cur.ventas; mesTotal.costo += cur.costo; mesTotal.utilidad += cur.utilidad;

          const ty = totalByYear[Y] ?? zero();
          ty.ventas += cur.ventas; ty.costo += cur.costo; ty.utilidad += cur.utilidad;
          totalByYear[Y] = ty;

          grandTotal.ventas += cur.ventas; grandTotal.costo += cur.costo; grandTotal.utilidad += cur.utilidad;
        }
        byMonth[mes] = rowYears;
        totalByMonth[mes] = mesTotal;
      }

      return {
        id: EMPRESA_KEY_TO_VENTAS_ID[empKey] ?? empKey,
        nombre: EMPRESA_KEY_TO_NAME[empKey] ?? empKey,
        byMonth,
        totalByYear,
        totalByMonth,
        grandTotal,
      };
    });

    return NextResponse.json({ years, currentYear, partial, earliestPartial, empresas });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "error inesperado";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

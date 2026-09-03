// ─────────────────────────────────────────────────────────────────────────────
// SOLO LECTURA. EL «DESPUÉS» DE LOS SEIS LUGARES, CON EL CÓDIGO REAL.
//
// `_diag-mismos-dias-6-lugares.ts` reconstruye ANTES y DESPUÉS a mano desde las
// fuentes. Este corre los MÓDULOS que ahora usan las pantallas
// (`leerPrevSamePeriod` + `sumarPrevPorEmpresa`, `productosRangoComparativo`
// + `ultimoDiaArticuloDiario`, `rangoComparativo`, la RPC de vendedoras) contra
// producción y muestra lo que cada pantalla va a decir. Lo que no se puede
// correr todavía es la RPC `_v3` (la DDL la aplica Daniel): mientras tanto la
// cadena cae a `_v2`, que hoy da el mismo número porque este mes no tuvo
// facturas después de las 7 p.m. (ver el bloque #6 del diag).
//
//   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config \
//     scripts/_verif-mismos-dias-6-lugares.ts
// ─────────────────────────────────────────────────────────────────────────────

import { supabaseServer } from "../src/lib/supabase-server";
import { hoyPanama } from "../src/lib/fecha-panama";
import { leerPrevSamePeriod, sumarPrevPorEmpresa } from "../src/lib/ventas/prev-same-period";
import { productosRangoComparativo, productosRangoPeriodo } from "../src/lib/ventas/productos";
import { ultimoDiaArticuloDiario } from "../src/lib/ventas/ultimo-dia-cargado";
import { rangoComparativo } from "../src/lib/multifashion/productos-ranking";
import { rotuloDeltaVendedoras } from "../src/lib/multifashion/vendedoras-rotulo";

const EMPRESAS = ["vistana", "fashion_wear", "fashion_shoes", "active_shoes", "active_wear", "joystep", "confecciones_boston", "american_classic"];
const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (cur: number, prev: number | null) => (prev == null || prev <= 0 ? "—" : `${cur >= prev ? "+" : ""}${(((cur - prev) / prev) * 100).toFixed(1)}%`);

async function main() {
  const ahora = new Date();
  const hoy = hoyPanama(ahora);
  const anio = Number(hoy.slice(0, 4));
  const mesHoy = Number(hoy.slice(5, 7));
  const mm = String(mesHoy).padStart(2, "0");
  console.log(`hoy (Panamá) = ${hoy}\n`);

  // La MV (lo que muestran Anual, Mes×año y Vista General como "actual").
  const { data: mvData, error: mvErr } = await supabaseServer.from("ventas_rollup_mensual_mv").select("empresa_key, anio, mes_num, ventas_netas");
  if (mvErr) throw new Error(mvErr.message);
  const mv = (mvData ?? []) as { empresa_key: string; anio: number; mes_num: number; ventas_netas: string | number }[];
  const mvDe = (e: string, y: number, m: number) => Number(mv.find(r => r.empresa_key === e && r.anio === y && r.mes_num === m)?.ventas_netas ?? 0);
  const mvHasta = (e: string, y: number, mMax: number) => { let s = 0; for (let m = 1; m <= mMax; m++) s += mvDe(e, y, m); return s; };

  // ── #1 / #2 / #3 — la lectura compartida ────────────────────────────────────
  const prevRes = await leerPrevSamePeriod(anio);
  if (prevRes.error || !prevRes.data) throw new Error(prevRes.error?.message ?? "sin datos");
  const p = prevRes.data;
  console.log(`prev-same-period: parcial=${p.es_periodo_parcial} · fecha_corte=${p.fecha_corte} · año anterior hasta ${p.dia_corte_anio_anterior}`);
  const porEmpresa = sumarPrevPorEmpresa(p.rows);
  const mesEnCurso = sumarPrevPorEmpresa(p.rows.filter(r => r.mes === mesHoy));

  console.log(`\n══ #1 Anual — lo que dice la pantalla ahora ══`);
  let gCur = 0, gPrev = 0, gViejo = 0;
  for (const e of EMPRESAS) {
    const cur = mvHasta(e, anio, 12);
    const prev = porEmpresa.get(e)?.ventas ?? 0;
    const viejo = mvHasta(e, anio - 1, mesHoy);
    gCur += cur; gPrev += prev; gViejo += viejo;
    console.log(`  ${e.padEnd(20)} ${fmt(cur).padStart(14)} · antes ${pct(cur, viejo).padStart(7)} → ahora ${pct(cur, prev).padStart(7)} (vs ${fmt(prev)})`);
  }
  console.log(`  ${"GRUPO".padEnd(20)} ${fmt(gCur).padStart(14)} · antes ${pct(gCur, gViejo).padStart(7)} → ahora ${pct(gCur, gPrev).padStart(7)}`);

  console.log(`\n══ #2 Mes×año (celda ${mm}/${anio}) y #3 Vista General — lo que dicen ahora ══`);
  let tCur = 0, tPrev = 0, tViejo = 0;
  for (const e of EMPRESAS) {
    const cur = mvDe(e, anio, mesHoy);
    const prev = mesEnCurso.get(e)?.ventas ?? 0;
    const viejo = mvDe(e, anio - 1, mesHoy);
    tCur += cur; tPrev += prev; tViejo += viejo;
    console.log(`  ${e.padEnd(20)} ${fmt(cur).padStart(12)} · antes ${pct(cur, viejo).padStart(7)} → ahora ${pct(cur, prev).padStart(7)} (vs 1–${p.dia_corte_anio_anterior?.slice(8)} ${mm}/${anio - 1}: ${fmt(prev)})`);
  }
  console.log(`  ${"GRUPO (Vista General)".padEnd(20)} ${fmt(tCur).padStart(12)} · antes ${pct(tCur, tViejo).padStart(7)} → ahora ${pct(tCur, tPrev).padStart(7)} · rótulo «vs 1–${p.dia_corte_anio_anterior?.slice(8)} sep ${anio - 1}»`);

  // ── #4 Productos ────────────────────────────────────────────────────────────
  console.log(`\n══ #4 Productos — lo que piden las rutas ahora ══`);
  {
    const e = "fashion_wear";
    const actual = productosRangoPeriodo("ytd", anio, null, ahora);
    const ult = await ultimoDiaArticuloDiario(e, actual.desde, actual.hasta);
    const cmp = productosRangoComparativo("ytd", anio, null, ahora, ult);
    const total = async (d: string, h: string) => {
      const { data, error } = await supabaseServer.rpc("switch_top_descripciones_reciente", { p_empresa_key: e, p_desde: d, p_hasta: h });
      if (error) throw new Error(error.message);
      return ((data ?? []) as { venta: number | string }[]).reduce((s, r) => s + Number(r.venta ?? 0), 0);
    };
    const cur = await total(actual.desde, actual.hasta);
    const prev = await total(cmp.desde, cmp.hasta);
    console.log(`  Ventas › Productos · Fashion Wear · Año en curso: ${actual.desde} → ${actual.hasta} (cargado hasta ${ult}) = ${fmt(cur)}`);
    console.log(`     comparado con ${cmp.desde} – ${cmp.hasta} (${fmt(prev)}) = ${pct(cur, prev)} · parcial=${cmp.parcial}`);
  }
  {
    const e = "american_classic";
    const finMes = new Date(Date.UTC(anio, mesHoy, 0)).getUTCDate();
    const desde = `${anio}-${mm}-01`, hasta = `${anio}-${mm}-${finMes}`;
    const ult = await ultimoDiaArticuloDiario(e, desde, hasta);
    const cmp = rangoComparativo({ desde, hasta }, ahora, ult);
    const total = async (d: string, h: string) => {
      const { data, error } = await supabaseServer.rpc("multifashion_articulo_diario_agrupado_v1", { p_empresa_key: e, p_desde: d, p_hasta: h });
      if (error) throw new Error(error.message);
      const f = ((data as { f: { t: string | null; v: number | string | null }[] }).f ?? []);
      return f.reduce((s, r) => s + (r.t === "NC" ? -1 : 1) * Number(r.v ?? 0), 0);
    };
    const cur = await total(desde, hasta);
    const prev = await total(cmp.desde, cmp.hasta);
    console.log(`  Multifashion › Productos · ${mm}/${anio} (cargado hasta ${ult}) = ${fmt(cur)}`);
    console.log(`     comparado con ${cmp.desde} – ${cmp.hasta} (${fmt(prev)}) = ${pct(cur, prev)} · parcial=${cmp.parcial}`);
  }

  // ── #5 Vendedoras ───────────────────────────────────────────────────────────
  console.log(`\n══ #5 Vendedoras — rótulos ahora ══`);
  const mesAnt = Math.max(1, mesHoy - 1);
  console.log(`  chip en curso (${mm}/${anio}): «${rotuloDeltaVendedoras("en_curso", mesHoy, anio).columna}» · chip cerrado (${String(mesAnt).padStart(2, "0")}/${anio}): «${rotuloDeltaVendedoras("mes_anterior", mesAnt, anio).columna}» · YTD: «${rotuloDeltaVendedoras("ytd", mesHoy, anio).columna}»`);

  // ── #6 ──────────────────────────────────────────────────────────────────────
  console.log(`\n══ #6 RPC — qué versión contestó ══`);
  const { error: v3err } = await supabaseServer.rpc("ventas_dashboard_prev_same_period_v3", { p_year: anio });
  console.log(`  _v3 en producción: ${v3err ? `todavía no (${v3err.message.slice(0, 60)}) → la cadena cayó a _v2` : "SÍ, aplicada"}`);
}

main().catch((e) => { console.error(e); process.exit(1); });

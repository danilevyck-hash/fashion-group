// ─────────────────────────────────────────────────────────────────────────────
// SOLO LECTURA. LOS SEIS LUGARES DONDE «vs año pasado» NO COMPARABA LOS MISMOS
// DÍAS — medidos contra producción, ANTES y DESPUÉS.
//
// La regla de la casa: un período empezado se compara contra los MISMOS DÍAS
// del anterior, con la fecha de Panamá. El 3-sep-2026 se arregló en Ventas ›
// Clientes (`clientes-corte-comparativo.ts`). La auditoría encontró seis más:
//
//   1. Ventas › Resumen › Anual        — 2026 hasta hoy vs 2025 ene–sep ENTERO
//   2. Ventas › Resumen › Mes×año      — el mes en curso vs el mes ENTERO de 2025
//   3. Vista General › tarjeta Ventas  — lo que va del mes vs el mes ENTERO
//   4. Productos (Ventas y Multifashion) — el comparativo corta en HOY, pero
//      `switch_articulo_diario` llega hasta AYER: un día de más, siempre
//   5. Multifashion › Vendedoras       — dice «vs año pasado», compara vs el mes
//      anterior (Daniel: se arregla el RÓTULO)
//   6. Ventas › Resumen (RPC)          — corte en UTC: una factura después de las
//      7 pm salta el corte un día
//
// Para cada uno reconstruye el número que muestra la pantalla HOY (ANTES) y el
// que da la regla (DESPUÉS), desde las mismas fuentes. No escribe nada.
//
//   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config \
//     scripts/_diag-mismos-dias-6-lugares.ts
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "@supabase/supabase-js";
import { hoyPanama, fechaPanamaDe } from "../src/lib/fecha-panama";
import { corteVsAnioAnterior } from "../src/lib/ventas/clientes-corte-comparativo";
import { unAnioAntes } from "../src/lib/multifashion/productos-ranking";

const EMPRESAS = ["vistana", "fashion_wear", "fashion_shoes", "active_shoes", "active_wear", "joystep", "confecciones_boston", "american_classic"];
const SUMAN = new Set(["Factura", "Tiquete", "Transacción", "Nota de Débito"]);

type Fac = { id: number; empresa_key: string; fecha: string; tipo_comprobante: string | null; subtotal_descuento: number | string | null };
type Mv = { empresa_key: string; anio: number; mes_num: number; ventas_netas: string | number | null };

const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (cur: number, prev: number | null) => (prev == null || prev <= 0 ? "—" : `${cur >= prev ? "+" : ""}${(((cur - prev) / prev) * 100).toFixed(1)}%`);
const firmado = (f: Fac) => {
  const m = Number(f.subtotal_descuento ?? 0);
  return SUMAN.has(f.tipo_comprobante ?? "") ? m : f.tipo_comprobante === "Nota de Crédito" ? -m : 0;
};
const utcDate = (iso: string) => new Date(iso).toISOString().slice(0, 10);

async function leerTodo<T>(pagina: (desde: number, hasta: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await pagina(desde, desde + 999);
    if (error) throw new Error(error.message);
    const filas = (data ?? []) as T[];
    out.push(...filas);
    if (filas.length < 1000) return out;
  }
}

function sumar(facs: Fac[], empresa: string | null, desde: string, hasta: string, bucket: (iso: string) => string): number {
  let s = 0;
  for (const f of facs) {
    if (empresa && f.empresa_key !== empresa) continue;
    const d = bucket(f.fecha);
    if (d >= desde && d <= hasta) s += firmado(f);
  }
  return s;
}

async function main() {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const ahora = new Date();
  const hoy = hoyPanama(ahora);
  const anio = Number(hoy.slice(0, 4));
  const mesHoy = Number(hoy.slice(5, 7));
  const mm = String(mesHoy).padStart(2, "0");
  console.log(`hoy (Panamá) = ${hoy} · ahora UTC = ${ahora.toISOString()}\n`);

  // ── Fuentes ────────────────────────────────────────────────────────────────
  const mv = await leerTodo<Mv>((d, h) => db.from("ventas_rollup_mensual_mv").select("empresa_key, anio, mes_num, ventas_netas").order("empresa_key").order("anio").order("mes_num").range(d, h));
  const mvDe = (e: string, y: number, m: number) => Number(mv.find(r => r.empresa_key === e && r.anio === y && r.mes_num === m)?.ventas_netas ?? 0);
  const mvHasta = (e: string, y: number, mMax: number) => { let s = 0; for (let m = 1; m <= mMax; m++) s += mvDe(e, y, m); return s; };

  // Facturas del mes en curso (este año) y del mismo mes del año pasado, con
  // un día de margen al final para poder agrupar en UTC y en Panamá.
  const leerMes = (y: number, m: number) => {
    const ini = `${y}-${String(m).padStart(2, "0")}-01T00:00:00Z`;
    const finY = m === 12 ? y + 1 : y, finM = m === 12 ? 1 : m + 1;
    const fin = `${finY}-${String(finM).padStart(2, "0")}-02T00:00:00Z`; // +1 día de margen (UTC vs Panamá)
    return leerTodo<Fac>((d, h) => db.from("switch_facturas").select("id, empresa_key, fecha, tipo_comprobante, subtotal_descuento").gte("fecha", ini).lt("fecha", fin).order("id").range(d, h));
  };
  const [facCur, facPrev] = await Promise.all([leerMes(anio, mesHoy), leerMes(anio - 1, mesHoy)]);
  const facs = [...facCur, ...facPrev];
  console.log(`ventas_rollup_mensual_mv: ${mv.length} · switch_facturas ${anio}-${mm}: ${facCur.length} · ${anio - 1}-${mm}: ${facPrev.length}\n`);

  // El corte: último día cargado del mes en curso (Panamá), topado en hoy.
  const cortePorEmpresa = new Map<string, string | null>();
  let ultimaGlobal: string | null = null;
  for (const e of EMPRESAS) {
    let max: string | null = null;
    for (const f of facCur) {
      if (f.empresa_key !== e) continue;
      const d = fechaPanamaDe(f.fecha);
      if (d.slice(0, 7) !== `${anio}-${mm}`) continue;
      if (!max || d > max) max = d;
    }
    cortePorEmpresa.set(e, max);
    if (max && (!ultimaGlobal || max > ultimaGlobal)) ultimaGlobal = max;
  }
  const global = corteVsAnioAnterior(ultimaGlobal, ahora);
  console.log(`corte global = ${global.corte} → año anterior hasta ${global.cortePrev}`);
  for (const e of EMPRESAS) {
    const c = cortePorEmpresa.get(e);
    console.log(`  ${e.padEnd(20)} último día cargado del mes: ${c ?? "(sin ventas este mes)"}`);
  }

  // ── #1 Anual ────────────────────────────────────────────────────────────────
  console.log(`\n══ #1 Ventas › Resumen › Anual — ${anio} hasta hoy vs ${anio - 1} ══`);
  console.log(`   ANTES: ene–${mm} ENTERO de ${anio - 1} (mes <= ${mesHoy}) · DESPUÉS: ene–${String(mesHoy - 1).padStart(2, "0")} + los mismos días de ${mm}`);
  let gCur = 0, gAntes = 0, gDesp = 0;
  for (const e of EMPRESAS) {
    const cur = mvHasta(e, anio, 12);
    const antes = mvHasta(e, anio - 1, mesHoy);
    const c = corteVsAnioAnterior(cortePorEmpresa.get(e) ?? null, ahora);
    const desp = mvHasta(e, anio - 1, mesHoy - 1) + sumar(facs, e, `${anio - 1}-${mm}-01`, c.cortePrev, fechaPanamaDe);
    gCur += cur; gAntes += antes; gDesp += desp;
    console.log(`  ${e.padEnd(20)} ${anio}: ${fmt(cur).padStart(14)} · ANTES ${pct(cur, antes).padStart(7)} (vs ${fmt(antes)}) · DESPUÉS ${pct(cur, desp).padStart(7)} (vs ${fmt(desp)}, hasta ${c.cortePrev})`);
  }
  console.log(`  ${"GRUPO".padEnd(20)} ${anio}: ${fmt(gCur).padStart(14)} · ANTES ${pct(gCur, gAntes).padStart(7)} · DESPUÉS ${pct(gCur, gDesp).padStart(7)}`);

  // ── #2 Mes×año y #3 Vista General ───────────────────────────────────────────
  console.log(`\n══ #2 Mes×año (celda ${mm}/${anio}) y #3 Vista General › Ventas — el mes en curso ══`);
  console.log(`   ANTES: ${mm}/${anio - 1} ENTERO · DESPUÉS: 1 → mismo día de ${mm}/${anio - 1}`);
  let tCur = 0, tAntes = 0, tDesp = 0;
  for (const e of EMPRESAS) {
    const cur = mvDe(e, anio, mesHoy);
    const antes = mvDe(e, anio - 1, mesHoy);
    const c = corteVsAnioAnterior(cortePorEmpresa.get(e) ?? null, ahora);
    const desp = sumar(facs, e, `${anio - 1}-${mm}-01`, c.cortePrev, fechaPanamaDe);
    tCur += cur; tAntes += antes; tDesp += desp;
    console.log(`  ${e.padEnd(20)} ${mm}/${anio}: ${fmt(cur).padStart(12)} · ANTES ${pct(cur, antes).padStart(7)} (vs ${fmt(antes)}) · DESPUÉS ${pct(cur, desp).padStart(7)} (vs ${fmt(desp)}, hasta ${c.cortePrev})`);
  }
  console.log(`  ${"GRUPO (Vista General)".padEnd(20)} ${fmt(tCur).padStart(12)} · ANTES ${pct(tCur, tAntes).padStart(7)} · DESPUÉS ${pct(tCur, tDesp).padStart(7)}`);

  // ── #6 UTC vs Panamá en el RPC ──────────────────────────────────────────────
  console.log(`\n══ #6 RPC ventas_dashboard_prev_same_period_v2 — corte en UTC vs Panamá ══`);
  const { data: rpc, error: rpcErr } = await db.rpc("ventas_dashboard_prev_same_period_v2", { p_year: anio });
  if (rpcErr) console.log(`  RPC error: ${rpcErr.message}`);
  else {
    const r = rpc as { rows: { empresa: string; mes: number; total_subtotal: number }[]; fecha_corte: string; dia_corte_anio_anterior: string };
    console.log(`  RPC v2 hoy: fecha_corte=${r.fecha_corte} · dia_corte_anio_anterior=${r.dia_corte_anio_anterior}`);
    for (const e of EMPRESAS) {
      const fila = r.rows.find(x => x.empresa === e && x.mes === mesHoy);
      let maxUtc: string | null = null;
      for (const f of facCur) { if (f.empresa_key !== e) continue; const d = utcDate(f.fecha); if (d.slice(0, 7) === `${anio}-${mm}` && (!maxUtc || d > maxUtc)) maxUtc = d; }
      const c = corteVsAnioAnterior(cortePorEmpresa.get(e) ?? null, ahora);
      const utcPrev = maxUtc ? `${anio - 1}-${mm}-${maxUtc.slice(8)}` : null;
      const enUtc = utcPrev ? sumar(facs, e, `${anio - 1}-${mm}-01`, utcPrev, utcDate) : 0;
      const enPan = sumar(facs, e, `${anio - 1}-${mm}-01`, c.cortePrev, fechaPanamaDe);
      console.log(`  ${e.padEnd(20)} RPC v2 ${mm}: ${fmt(Number(fila?.total_subtotal ?? 0)).padStart(12)} (corte UTC ${maxUtc ?? "—"} → réplica ${fmt(enUtc)}) · Panamá hasta ${c.cortePrev}: ${fmt(enPan)}`);
    }
  }
  // Cuántas noches de este año una factura después de las 7 pm cayó en el día
  // UTC siguiente (el corte saltaba un día hasta la mañana).
  const facAnio = await leerTodo<Fac>((d, h) => db.from("switch_facturas").select("id, empresa_key, fecha, tipo_comprobante, subtotal_descuento").gte("fecha", `${anio}-01-01T05:00:00Z`).order("id").range(d, h));
  const noches = new Set<string>();
  for (const f of facAnio) if (utcDate(f.fecha) !== fechaPanamaDe(f.fecha)) noches.add(`${f.empresa_key}|${fechaPanamaDe(f.fecha)}`);
  const nochesPorEmpresa = new Map<string, number>();
  for (const n of noches) { const e = n.split("|")[0]; nochesPorEmpresa.set(e, (nochesPorEmpresa.get(e) ?? 0) + 1); }
  console.log(`  Noches de ${anio} con factura después de las 7 pm (día UTC ≠ día Panamá): ${noches.size} pares empresa-noche → ${[...nochesPorEmpresa].map(([e, n]) => `${e} ${n}`).join(" · ")}`);
  // El caso de la tabla: Fashion Wear la noche del 12-may.
  {
    const e = "fashion_wear";
    const facMay = await leerMes(anio, 5);
    const facMayPrev = await leerMes(anio - 1, 5);
    const todas = [...facMay, ...facMayPrev];
    const curHasta12 = sumar(todas, e, `${anio}-05-01`, `${anio}-05-12`, fechaPanamaDe);
    const nocturna = todas.filter(f => f.empresa_key === e && fechaPanamaDe(f.fecha) === `${anio}-05-12` && utcDate(f.fecha) === `${anio}-05-13`).reduce((s, f) => s + firmado(f), 0);
    const prevUtc13 = sumar(todas, e, `${anio - 1}-05-01`, `${anio - 1}-05-13`, utcDate);
    const prevPan12 = sumar(todas, e, `${anio - 1}-05-01`, `${anio - 1}-05-12`, fechaPanamaDe);
    console.log(`  Fashion Wear, noche del 12-may-${anio} (factura nocturna: ${fmt(nocturna)}): 1–12 may = ${fmt(curHasta12)} · ANTES vs 1–13 may ${anio - 1} en UTC (${fmt(prevUtc13)}) = ${pct(curHasta12, prevUtc13)} · DESPUÉS vs 1–12 may ${anio - 1} Panamá (${fmt(prevPan12)}) = ${pct(curHasta12, prevPan12)}`);
  }

  // ── #4 Productos ────────────────────────────────────────────────────────────
  console.log(`\n══ #4 Productos — el comparativo corta en HOY pero switch_articulo_diario llega hasta AYER ══`);
  const ultimoDiario = async (e: string, desde: string, hasta: string) => {
    const { data, error } = await db.from("switch_articulo_diario").select("fecha").eq("empresa_key", e).gte("fecha", desde).lte("fecha", hasta).order("fecha", { ascending: false }).limit(1);
    if (error) throw new Error(error.message);
    return (data?.[0] as { fecha: string } | undefined)?.fecha ?? null;
  };
  // Ventas › Productos, Fashion Wear, «Año en curso».
  {
    const e = "fashion_wear";
    const ult = await ultimoDiario(e, `${anio}-01-01`, hoy);
    const c = corteVsAnioAnterior(ult, ahora);
    const total = async (d: string, h: string) => {
      const { data, error } = await db.rpc("switch_top_descripciones_reciente", { p_empresa_key: e, p_desde: d, p_hasta: h });
      if (error) throw new Error(error.message);
      return ((data ?? []) as { venta: number | string }[]).reduce((s, r) => s + Number(r.venta ?? 0), 0);
    };
    const cur = await total(`${anio}-01-01`, hoy);
    const antes = await total(`${anio - 1}-01-01`, unAnioAntes(hoy));
    const desp = await total(`${anio - 1}-01-01`, c.cortePrev);
    console.log(`  Ventas › Productos · Fashion Wear · Año en curso: último día cargado = ${ult} · ${anio}: ${fmt(cur)}`);
    console.log(`     ANTES  vs 1-ene → ${unAnioAntes(hoy)} (${fmt(antes)}) = ${pct(cur, antes)}`);
    console.log(`     DESPUÉS vs 1-ene → ${c.cortePrev} (${fmt(desp)}) = ${pct(cur, desp)}`);
  }
  // Multifashion › Productos, mes en curso.
  {
    const e = "american_classic";
    const finMes = new Date(Date.UTC(anio, mesHoy, 0)).getUTCDate();
    const ult = await ultimoDiario(e, `${anio}-${mm}-01`, `${anio}-${mm}-${finMes}`);
    const c = corteVsAnioAnterior(ult, ahora);
    const total = async (d: string, h: string) => {
      const { data, error } = await db.rpc("multifashion_articulo_diario_agrupado_v1", { p_empresa_key: e, p_desde: d, p_hasta: h });
      if (error) throw new Error(error.message);
      const f = ((data as { f: { t: string | null; v: number | string | null }[] }).f ?? []);
      return f.reduce((s, r) => s + (r.t === "NC" ? -1 : 1) * Number(r.v ?? 0), 0);
    };
    const cur = await total(`${anio}-${mm}-01`, `${anio}-${mm}-${finMes}`);
    const antes = await total(`${anio - 1}-${mm}-01`, `${anio - 1}-${mm}-${hoy.slice(8)}`);
    const desp = await total(`${anio - 1}-${mm}-01`, c.cortePrev);
    console.log(`  Multifashion › Productos · ${mm}/${anio}: último día cargado = ${ult} · ${fmt(cur)}`);
    console.log(`     ANTES  vs 1 → ${hoy.slice(8)} de ${mm}/${anio - 1} (${fmt(antes)}) = ${pct(cur, antes)}`);
    console.log(`     DESPUÉS vs 1 → ${c.cortePrev.slice(8)} de ${mm}/${anio - 1} (${fmt(desp)}) = ${pct(cur, desp)}`);
    const resumenCur = sumar(facs, e, `${anio}-${mm}-01`, hoy, fechaPanamaDe);
    const resumenPrev = sumar(facs, e, `${anio - 1}-${mm}-01`, c.cortePrev, fechaPanamaDe);
    console.log(`     (el Resumen de al lado, switch_facturas Panamá, mismos días: ${fmt(resumenCur)} vs ${fmt(resumenPrev)} = ${pct(resumenCur, resumenPrev)})`);
  }

  // ── #5 Vendedoras ───────────────────────────────────────────────────────────
  console.log(`\n══ #5 Multifashion › Vendedoras — la columna dice «Δ vs año pasado» ══`);
  const vend = async (mes: number) => {
    const { data, error } = await db.rpc("multifashion_vendedoras_v3", { p_year: anio, p_periodo: "mes", p_mes: mes, p_trimestre: null });
    if (error) throw new Error(error.message);
    return data as { ventas_total: number; ventas_total_prev: number; fecha_corte: string | null; dia_corte_periodo_anterior: string | null };
  };
  const mesAnt = Math.max(1, mesHoy - 1);
  const [enCurso, cerrado, dosAtras] = await Promise.all([vend(mesHoy), vend(mesAnt), vend(Math.max(1, mesHoy - 2))]);
  console.log(`  chip «${mm} (en curso)»: ventas ${fmt(enCurso.ventas_total)} · prev ${fmt(enCurso.ventas_total_prev)} (hasta ${enCurso.dia_corte_periodo_anterior}) = ${pct(enCurso.ventas_total, enCurso.ventas_total_prev)} → el prev ES ${String(mesAnt).padStart(2, "0")}/${anio} mismos días, no ${mm}/${anio - 1}`);
  console.log(`  chip «${String(mesAnt).padStart(2, "0")} (cerrado)»: ventas ${fmt(cerrado.ventas_total)} · prev ${fmt(cerrado.ventas_total_prev)} = ${pct(cerrado.ventas_total, cerrado.ventas_total_prev)} · el mes ${String(Math.max(1, mesHoy - 2)).padStart(2, "0")}/${anio} entero da ${fmt(dosAtras.ventas_total)} ${Math.abs(dosAtras.ventas_total - cerrado.ventas_total_prev) < 0.01 ? "= IGUAL: compara contra el MES ANTERIOR" : "≠ (revisar)"}`);
  console.log(`  ANTES: «Δ vs año pasado» · DESPUÉS: «Δ vs ${String(mesAnt).padStart(2, "0")}/${anio}» en el chip en curso y «Δ vs ${String(Math.max(1, mesHoy - 2)).padStart(2, "0")}/${anio}» en el chip cerrado`);
}

main().catch((e) => { console.error(e); process.exit(1); });

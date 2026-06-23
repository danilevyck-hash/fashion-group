// DoD financiero: el período-comparable del año en curso NO puede cambiar ni un
// centavo. Compara ventas_dashboard_prev_same_period (vigente) vs _v2 (nuevo).
//   - ANTES de aplicar la migración: solo muestra el baseline (el _v2 no existe).
//   - DESPUÉS de aplicar: diffea fila por fila + totales. Δ debe ser 0.00.
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

const env = readFileSync('/Users/daniellevy/Code/fashion-group/cxc/.env.local', 'utf8');
const url = (env.match(/^SUPABASE_URL=(.+)$/m) ?? env.match(/^NEXT_PUBLIC_SUPABASE_URL=(.+)$/m))[1].trim();
const key = (env.match(/^SUPABASE_SERVICE_ROLE_KEY=(.+)$/m))[1].trim();
const supa = createClient(url, key, { auth: { persistSession: false } });

const YEAR = 2026;
const r2 = (n) => Math.round(Number(n || 0) * 100) / 100;

async function callRpc(fn) {
  const t0 = Date.now();
  const { data, error } = await supa.rpc(fn, { p_year: YEAR });
  const ms = Date.now() - t0;
  return { data, error, ms };
}

function index(rows) {
  const m = new Map();
  for (const r of rows || []) m.set(`${r.empresa}|${r.mes}`, r);
  return m;
}
function totals(rows) {
  let sub = 0, costo = 0;
  for (const r of rows || []) { sub += Number(r.total_subtotal || 0); costo += Number(r.total_costo || 0); }
  return { sub: r2(sub), costo: r2(costo), util: r2(sub - costo) };
}

const oldR = await callRpc('ventas_dashboard_prev_same_period');
if (oldR.error) { console.error('RPC vigente falló:', oldR.error.message); process.exit(1); }
const oldRows = oldR.data?.rows ?? [];
const oldT = totals(oldRows);
console.log(`VIGENTE  ventas_dashboard_prev_same_period(${YEAR}): ${oldR.ms}ms · parcial=${oldR.data?.es_periodo_parcial} · corte=${oldR.data?.fecha_corte} · prevYTD subtotal=$${oldT.sub.toLocaleString('en-US',{minimumFractionDigits:2})} util=$${oldT.util.toLocaleString('en-US',{minimumFractionDigits:2})}`);

const newR = await callRpc('ventas_dashboard_prev_same_period_v2');
if (newR.error) {
  console.log(`\n_v2 aún no existe (${newR.error.message}). Aplica la migración y vuelve a correr para el diff.`);
  process.exit(0);
}
const newRows = newR.data?.rows ?? [];
const newT = totals(newRows);
console.log(`NUEVO    ventas_dashboard_prev_same_period_v2(${YEAR}): ${newR.ms}ms · parcial=${newR.data?.es_periodo_parcial} · corte=${newR.data?.fecha_corte} · prevYTD subtotal=$${newT.sub.toLocaleString('en-US',{minimumFractionDigits:2})} util=$${newT.util.toLocaleString('en-US',{minimumFractionDigits:2})}`);

// Diff fila por fila
const oi = index(oldRows), ni = index(newRows);
const keys = new Set([...oi.keys(), ...ni.keys()]);
let maxDelta = 0, mismatches = 0;
for (const k of keys) {
  const a = oi.get(k), b = ni.get(k);
  const da = r2((a?.total_subtotal ?? 0) - (b?.total_subtotal ?? 0));
  const dc = r2((a?.total_costo ?? 0) - (b?.total_costo ?? 0));
  if (Math.abs(da) >= 0.005 || Math.abs(dc) >= 0.005) {
    mismatches++;
    console.log(`  ❌ ${k}: Δsubtotal=${da} Δcosto=${dc} (viejo ${a?.total_subtotal}/${a?.total_costo} vs nuevo ${b?.total_subtotal}/${b?.total_costo})`);
  }
  maxDelta = Math.max(maxDelta, Math.abs(da), Math.abs(dc));
}
const dSub = r2(oldT.sub - newT.sub), dUtil = r2(oldT.util - newT.util);
console.log(`\nΔ totales: subtotal=${dSub.toFixed(2)} util=${dUtil.toFixed(2)} · maxΔ por fila=${maxDelta.toFixed(2)} · filas distintas=${mismatches}`);
console.log(`metadata corte igual: ${oldR.data?.fecha_corte === newR.data?.fecha_corte && oldR.data?.dia_corte_anio_anterior === newR.data?.dia_corte_anio_anterior}`);
const ok = mismatches === 0 && Math.abs(dSub) < 0.005 && Math.abs(dUtil) < 0.005;
console.log(ok ? `\n✅ IDÉNTICO al centavo. Speedup: ${oldR.ms}ms → ${newR.ms}ms` : `\n❌ HAY DIFERENCIAS — NO mergear.`);
process.exit(ok ? 0 : 1);

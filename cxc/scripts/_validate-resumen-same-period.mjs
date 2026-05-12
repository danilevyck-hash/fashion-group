// Validación de las 4 checks del PR fix/ventas-resumen-same-period.
//
// La RPC ventas_dashboard_prev_same_period(2026) aún no está aplicada en
// prod. Acá calculo los valores ESPERADOS directamente sobre ventas_raw
// usando las mismas reglas de la RPC, y los reporto para que sirvan de
// baseline contra la RPC una vez aplicada.
//
// Cutoff semantics (Opción A — matchea multifashion_mensual_v2):
//   - es_periodo_parcial: por CALENDARIO (CURRENT_DATE adentro del mes
//     en curso del año actual)
//   - cutoff dentro del mes en curso: MAX(fecha) PER EMPRESA en cur month
//   - fecha_corte global (header): MAX(fecha) global en cur month
//   - dia_corte_anio_anterior global: inicio_prev + (fecha_corte - inicio_cur)

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

const env = readFileSync('/Users/daniellevy/Code/fashion-group/cxc/.env.local', 'utf8');
const url = (env.match(/^SUPABASE_URL=(.+)$/m) ?? env.match(/^NEXT_PUBLIC_SUPABASE_URL=(.+)$/m))[1].trim();
const key = (env.match(/^SUPABASE_SERVICE_ROLE_KEY=(.+)$/m))[1].trim();
const supa = createClient(url, key, { auth: { persistSession: false } });

const today = new Date();
const todayStr = today.toISOString().slice(0, 10);
const curYear = today.getFullYear();
const curMonth = today.getMonth() + 1;
console.log(`Today: ${todayStr} (year=${curYear}, mes=${curMonth})`);

// Paginated helper
async function fetchAll(filterFn) {
  const PAGE = 1000;
  let from = 0;
  const out = [];
  for (;;) {
    let q = supa.from('ventas_raw').select('empresa, fecha, mes, anio, subtotal').range(from, from + PAGE - 1);
    q = filterFn(q);
    const { data, error } = await q;
    if (error) { console.error('ERROR:', error); process.exit(1); }
    if (!data || data.length === 0) break;
    out.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return out;
}

const prevYear = curYear - 1;
const prevMesInicio = new Date(prevYear, curMonth - 1, 1);
const prevMesFinFull = new Date(prevYear, curMonth, 0);
const curInicio = new Date(curYear, curMonth - 1, 1);
const fmt = (d) => d.toISOString().slice(0, 10);

// Determinar MAX(fecha) per empresa en cur month → dia_corte prev per empresa
console.log('\nMAX(fecha) per empresa en cur month + cutoff prev:');
const curRows = await fetchAll(q => q.eq('anio', curYear).eq('mes', curMonth));
const maxPerEmpresa = new Map();
for (const r of curRows) {
  if (!maxPerEmpresa.has(r.empresa) || r.fecha > maxPerEmpresa.get(r.empresa)) {
    maxPerEmpresa.set(r.empresa, r.fecha);
  }
}
const cutoffPerEmpresa = new Map();
let globalMax = null;
for (const [emp, maxFecha] of maxPerEmpresa.entries()) {
  const maxDate = new Date(maxFecha + 'T00:00:00');
  const offsetDays = Math.round((maxDate - curInicio) / 86400000);
  const cutoffRaw = new Date(prevMesInicio.getTime() + offsetDays * 86400000);
  const cutoff = cutoffRaw <= prevMesFinFull ? cutoffRaw : prevMesFinFull;
  cutoffPerEmpresa.set(emp, fmt(cutoff));
  if (!globalMax || maxFecha > globalMax) globalMax = maxFecha;
  console.log(`  ${emp.padEnd(22)} cur_max=${maxFecha} → prev_cutoff=${fmt(cutoff)} (offset ${offsetDays}d)`);
}
const globalCutoff = (() => {
  const md = new Date(globalMax + 'T00:00:00');
  const offsetDays = Math.round((md - curInicio) / 86400000);
  const cutoffRaw = new Date(prevMesInicio.getTime() + offsetDays * 86400000);
  return fmt(cutoffRaw <= prevMesFinFull ? cutoffRaw : prevMesFinFull);
})();
console.log(`\nfecha_corte GLOBAL (header del response): ${globalMax}`);
console.log(`dia_corte_anio_anterior GLOBAL (header):  ${globalCutoff}\n`);

// ─────────────────────────────────────────────────────────────────────────────
// CHECK 1 — Partial sum per empresa con cutoff per-empresa
// ─────────────────────────────────────────────────────────────────────────────
console.log('═════════════════════════════════════════════════════════════');
console.log(`CHECK 1: SUM(subtotal) prev (${prevYear}-${String(curMonth).padStart(2,'0')}) per empresa`);
console.log('         con cutoff per-empresa (cada empresa hasta su propio dia_corte_prev)');
console.log('═════════════════════════════════════════════════════════════');
{
  const sums = new Map();
  for (const [emp, cutoff] of cutoffPerEmpresa.entries()) {
    const rows = await fetchAll(q => q
      .eq('empresa', emp).eq('anio', prevYear).eq('mes', curMonth)
      .gte('fecha', fmt(prevMesInicio)).lte('fecha', cutoff));
    const sum = rows.reduce((s, r) => s + Number(r.subtotal || 0), 0);
    sums.set(emp, { sum, count: rows.length, cutoff });
  }
  const sorted = [...sums.entries()].sort((a, b) => b[1].sum - a[1].sum);
  for (const [emp, { sum, count, cutoff }] of sorted) {
    console.log(`  ${emp.padEnd(22)} ${('$' + sum.toFixed(2)).padStart(14)}  (${count} filas, cutoff ${cutoff})`);
  }
  const total = sorted.reduce((s, [, v]) => s + v.sum, 0);
  console.log(`  ─────────────────────────────────────`);
  console.log(`  TOTAL                  ${('$' + total.toFixed(2)).padStart(14)}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// CHECK 2 — Regression mes cerrado (Abril prev) full sum
// ─────────────────────────────────────────────────────────────────────────────
const closedMes = curMonth - 1 >= 1 ? curMonth - 1 : 12;
const closedYear = closedMes === 12 ? prevYear - 1 : prevYear;
console.log('\n═════════════════════════════════════════════════════════════');
console.log(`CHECK 2: SUM(subtotal) full mes cerrado ${closedYear}-${String(closedMes).padStart(2,'0')}`);
console.log('         La RPC NUEVA debe devolver EXACTAMENTE estos valores (sin recorte)');
console.log('═════════════════════════════════════════════════════════════');
{
  const rows = await fetchAll(q => q.eq('anio', closedYear).eq('mes', closedMes));
  const byEmp = new Map();
  for (const r of rows) byEmp.set(r.empresa, (byEmp.get(r.empresa) || 0) + Number(r.subtotal || 0));
  const sorted = [...byEmp.entries()].sort((a, b) => b[1] - a[1]);
  for (const [emp, sum] of sorted) console.log(`  ${emp.padEnd(22)} ${('$' + sum.toFixed(2)).padStart(14)}`);
  const total = sorted.reduce((s, [, v]) => s + v, 0);
  console.log(`  ─────────────────────────────────────`);
  console.log(`  TOTAL                  ${('$' + total.toFixed(2)).padStart(14)} (${rows.length} filas)`);
}

// ─────────────────────────────────────────────────────────────────────────────
// CHECK 3 — Math identity: YTD slicing per empresa cierra
// Para cada empresa con data en cur month:
//   SUM(prev hasta su cutoff) = SUM(prev meses 1..cur-1) + SUM(prev mes cur hasta su cutoff)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n═════════════════════════════════════════════════════════════');
console.log(`CHECK 3: YTD ${prevYear} per empresa con cutoff per-empresa cierra`);
console.log('═════════════════════════════════════════════════════════════');
{
  let allOk = true;
  for (const [emp, cutoff] of cutoffPerEmpresa.entries()) {
    // YTD prev hasta cutoff (incluye meses cerrados completos + cur partial)
    const ytdRows = await fetchAll(q => q
      .eq('empresa', emp).eq('anio', prevYear)
      .gte('fecha', `${prevYear}-01-01`).lte('fecha', cutoff));
    const ytdTotal = ytdRows.reduce((s, r) => s + Number(r.subtotal || 0), 0);
    // Closed months
    const closedRows = await fetchAll(q => q
      .eq('empresa', emp).eq('anio', prevYear).lt('mes', curMonth));
    const closedTotal = closedRows.reduce((s, r) => s + Number(r.subtotal || 0), 0);
    // Partial current month
    const partialRows = await fetchAll(q => q
      .eq('empresa', emp).eq('anio', prevYear).eq('mes', curMonth)
      .gte('fecha', fmt(prevMesInicio)).lte('fecha', cutoff));
    const partialTotal = partialRows.reduce((s, r) => s + Number(r.subtotal || 0), 0);
    const sum = closedTotal + partialTotal;
    const diff = Math.abs(ytdTotal - sum);
    const ok = diff < 0.01;
    if (!ok) allOk = false;
    console.log(`  ${emp.padEnd(22)} ytd=$${ytdTotal.toFixed(2)}  closed+partial=$${sum.toFixed(2)}  ${ok ? '✓' : '✗ FAIL'}`);
  }
  console.log(`  → ${allOk ? '✓ todas las empresas cierran la identidad' : '✗ alguna empresa rompió la identidad'}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// CHECK 4 — Cross-check vs multifashion_mensual_v2
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n═════════════════════════════════════════════════════════════');
console.log(`CHECK 4: Cross-check vs multifashion_mensual_v2 (american_classic mes ${curMonth})`);
console.log('═════════════════════════════════════════════════════════════');
{
  const { data: mfData, error } = await supa.rpc('multifashion_mensual_v2', { p_year: curYear, p_mes: curMonth });
  if (error) {
    console.error('  ERROR llamando multifashion_mensual_v2:', error.message);
  } else {
    const mesRow = mfData?.meses?.find(m => m.es_periodo_parcial === true);
    if (!mesRow) {
      console.log('  ⚠️ multifashion_mensual_v2 NO devolvió fila con es_periodo_parcial=true.');
    } else {
      const cellVentasCur = Number(mesRow.ventas || 0);
      const cellVs2025 = mesRow.vs2025;

      // El mismo cell con cutoff per-empresa (mi script)
      const empCutoff = cutoffPerEmpresa.get('american_classic');
      const curRows = await fetchAll(q => q.eq('empresa', 'american_classic').eq('anio', curYear).eq('mes', curMonth));
      const curSum = curRows.reduce((s, r) => s + Number(r.subtotal || 0), 0);
      const prevRows = await fetchAll(q => q.eq('empresa', 'american_classic').eq('anio', prevYear).eq('mes', curMonth)
        .gte('fecha', fmt(prevMesInicio)).lte('fecha', empCutoff));
      const prevSum = prevRows.reduce((s, r) => s + Number(r.subtotal || 0), 0);
      const myDelta = prevSum > 0 ? (curSum - prevSum) / prevSum : null;

      console.log(`  mf_v2 ventas (cur): $${cellVentasCur.toFixed(2)}`);
      console.log(`  mf_v2 vs2025:       ${cellVs2025 != null ? (cellVs2025 * 100).toFixed(2) + '%' : 'null'}`);
      console.log(`  RPC nueva esperada (cur=$${curSum.toFixed(2)}, prev=$${prevSum.toFixed(2)} hasta ${empCutoff}):`);
      console.log(`         delta = ${myDelta != null ? (myDelta * 100).toFixed(2) + '%' : 'null'}`);
      const matchVentas = Math.abs(cellVentasCur - curSum) < 0.01;
      const matchDelta = cellVs2025 != null && myDelta != null && Math.abs(cellVs2025 - myDelta) < 0.0001;
      console.log(`  match ventas: ${matchVentas ? '✓' : '✗'}  match delta: ${matchDelta ? '✓' : '✗'}`);
    }
  }
}

console.log('\nDone.');

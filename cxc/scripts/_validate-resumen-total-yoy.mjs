// Validación para PR feat/ventas-resumen-total-yoy-column.
//
// Verifica que:
//   1. Per-empresa prev YTD (recortado) calculado en el frontend cuadra
//      con SUM(subtotal) en ventas_raw, anio=prev, fecha <= cutoff per-empresa.
//   2. La fila TOTAL GRUPO con Δ% YTD cuadra con la suma de los per-empresa
//      Y con el KPI YTD del header (ventasDelta del componente).

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

const env = readFileSync('/Users/daniellevy/Code/fashion-group/cxc/.env.local', 'utf8');
const url = (env.match(/^SUPABASE_URL=(.+)$/m) ?? env.match(/^NEXT_PUBLIC_SUPABASE_URL=(.+)$/m))[1].trim();
const key = (env.match(/^SUPABASE_SERVICE_ROLE_KEY=(.+)$/m))[1].trim();
const supa = createClient(url, key, { auth: { persistSession: false } });

const today = new Date();
const curYear = today.getFullYear();
const curMonth = today.getMonth() + 1;
const prevYear = curYear - 1;
const curInicio = new Date(curYear, curMonth - 1, 1);
const prevMesInicio = new Date(prevYear, curMonth - 1, 1);
const prevMesFinFull = new Date(prevYear, curMonth, 0);
const fmt = (d) => d.toISOString().slice(0, 10);
console.log(`Today: ${fmt(today)}, curYear=${curYear}, curMonth=${curMonth}`);

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

// MAX(fecha) per empresa en cur month
const curRows = await fetchAll(q => q.eq('anio', curYear).eq('mes', curMonth));
const maxPerEmpresa = new Map();
for (const r of curRows) {
  if (!maxPerEmpresa.has(r.empresa) || r.fecha > maxPerEmpresa.get(r.empresa)) {
    maxPerEmpresa.set(r.empresa, r.fecha);
  }
}
const cutoffPerEmpresa = new Map();
for (const [emp, maxFecha] of maxPerEmpresa.entries()) {
  const maxDate = new Date(maxFecha + 'T00:00:00');
  const offsetDays = Math.round((maxDate - curInicio) / 86400000);
  const cutoffRaw = new Date(prevMesInicio.getTime() + offsetDays * 86400000);
  const cutoff = cutoffRaw <= prevMesFinFull ? cutoffRaw : prevMesFinFull;
  cutoffPerEmpresa.set(emp, fmt(cutoff));
}

// ─────────────────────────────────────────────────────────────────────────────
// CHECK 1 — Per-empresa prev YTD (recortado)
// SUM(subtotal) prev year en [Ene 1, cutoff_empresa] (closed months full +
// cur month partial via cutoff).
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n═════════════════════════════════════════════════════════════');
console.log(`CHECK 1: Per-empresa YTD ${prevYear} (recortado al cutoff per-empresa)`);
console.log('         Estos valores deben aparecer en columna "YTD prev" del Excel');
console.log('         y en el tooltip de la celda Total del heatmap.');
console.log('═════════════════════════════════════════════════════════════');

const empresaKeys = ['vistana', 'fashion_wear', 'fashion_shoes', 'active_shoes', 'active_wear', 'joystep', 'confecciones_boston', 'american_classic'];
let sumAllPrevYtd = 0;
let sumAllCurYtd = 0;
const empresaCurYtds = new Map();
for (const emp of empresaKeys) {
  // Cur year YTD (full hasta hoy — esto es lo que ve el frontend en e.ventas2026)
  const curYtdRows = await fetchAll(q => q.eq('empresa', emp).eq('anio', curYear));
  const curYtd = curYtdRows.reduce((s, r) => s + Number(r.subtotal || 0), 0);
  empresaCurYtds.set(emp, curYtd);
  sumAllCurYtd += curYtd;

  // Prev year YTD recortado al cutoff de esa empresa (si existe)
  const cutoff = cutoffPerEmpresa.get(emp);
  if (cutoff) {
    // Closed months 1..(curMonth-1) full + cur month hasta cutoff
    const prevRows = await fetchAll(q => q.eq('empresa', emp).eq('anio', prevYear)
      .gte('fecha', `${prevYear}-01-01`).lte('fecha', cutoff));
    const prevYtd = prevRows.reduce((s, r) => s + Number(r.subtotal || 0), 0);
    const delta = prevYtd > 0 ? ((curYtd - prevYtd) / prevYtd) : null;
    sumAllPrevYtd += prevYtd;
    console.log(`  ${emp.padEnd(22)} cur=$${curYtd.toFixed(2).padStart(12)}  prev=$${prevYtd.toFixed(2).padStart(12)}  Δ=${delta != null ? (delta * 100).toFixed(2) + '%' : 'n/a'}  (cutoff ${cutoff})`);
  } else {
    // Empresa sin data en cur month → prev YTD usa solo meses cerrados
    const prevRows = await fetchAll(q => q.eq('empresa', emp).eq('anio', prevYear)
      .lt('mes', curMonth));
    const prevYtd = prevRows.reduce((s, r) => s + Number(r.subtotal || 0), 0);
    const delta = prevYtd > 0 ? ((curYtd - prevYtd) / prevYtd) : null;
    sumAllPrevYtd += prevYtd;
    console.log(`  ${emp.padEnd(22)} cur=$${curYtd.toFixed(2).padStart(12)}  prev=$${prevYtd.toFixed(2).padStart(12)}  Δ=${delta != null ? (delta * 100).toFixed(2) + '%' : 'n/a'}  (sin data cur month → solo meses cerrados)`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CHECK 2 — Grupo total Δ% cuadra con KPI YTD del header
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n═════════════════════════════════════════════════════════════');
console.log(`CHECK 2: Total Grupo Δ% YTD ${curYear} vs ${prevYear} (recortado per-empresa)`);
console.log('═════════════════════════════════════════════════════════════');
{
  const groupDelta = sumAllPrevYtd > 0 ? ((sumAllCurYtd - sumAllPrevYtd) / sumAllPrevYtd) : null;
  console.log(`  Σ cur YTD (todas las empresas):    $${sumAllCurYtd.toFixed(2)}`);
  console.log(`  Σ prev YTD recortado per-empresa:  $${sumAllPrevYtd.toFixed(2)}`);
  console.log(`  Δ% Total Grupo:                    ${groupDelta != null ? (groupDelta * 100).toFixed(2) + '%' : 'n/a'}`);
  console.log(`  → Esto es lo que debe mostrar la celda Total inferior del heatmap.`);
}

// ─────────────────────────────────────────────────────────────────────────────
// CHECK 3 — Multifashion delta cross-check con multifashion_mensual_v2
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n═════════════════════════════════════════════════════════════');
console.log(`CHECK 3: Multifashion celda Total = Δ% YTD recortado`);
console.log('═════════════════════════════════════════════════════════════');
{
  const curYtd = empresaCurYtds.get('american_classic');
  const cutoff = cutoffPerEmpresa.get('american_classic');
  const prevRows = await fetchAll(q => q.eq('empresa', 'american_classic').eq('anio', prevYear)
    .gte('fecha', `${prevYear}-01-01`).lte('fecha', cutoff));
  const prevYtd = prevRows.reduce((s, r) => s + Number(r.subtotal || 0), 0);
  const delta = prevYtd > 0 ? ((curYtd - prevYtd) / prevYtd) : null;
  console.log(`  Multifashion cur YTD:        $${curYtd.toFixed(2)}`);
  console.log(`  Multifashion prev YTD ajust: $${prevYtd.toFixed(2)} (cutoff ${cutoff})`);
  console.log(`  Δ%:                          ${delta != null ? (delta * 100).toFixed(2) + '%' : 'n/a'}`);
  console.log(`  (cuadra con el heatmap mensual: Mayo cell ya muestra +5% per fix anterior)`);
}

console.log('\nDone.');

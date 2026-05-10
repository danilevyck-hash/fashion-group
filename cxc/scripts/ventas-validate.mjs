// Ground-truth queries for ventas_raw — Ene-Abr 2026
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

// Load .env.local
const env = readFileSync('/Users/daniellevy/Code/fashion-group/cxc/.env.local', 'utf-8');
const vars = Object.fromEntries(
  env.split('\n').filter(l => l && !l.startsWith('#')).map(l => {
    const i = l.indexOf('=');
    return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
  })
);

const url = vars.NEXT_PUBLIC_SUPABASE_URL;
const key = vars.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing env vars');
  process.exit(1);
}

const supa = createClient(url, key, { auth: { persistSession: false } });

// We need raw SQL — Supabase JS client doesn't expose raw SQL out of the box,
// but we can query with .from() + manual pagination. Let's just pull the rows
// for Jan-Apr 2026 and aggregate in JS.

const PAGE = 1000;
let all = [];
let offset = 0;
let totalEstimated = 0;
console.error(`Fetching ventas_raw rows for 2026-01-01 .. 2026-05-01 (exclusive)...`);
while (true) {
  const { data, error, count } = await supa
    .from('ventas_raw')
    .select('empresa, fecha, mes, subtotal, utilidad, costo, total, tipo, anio', { count: offset === 0 ? 'exact' : undefined })
    .gte('fecha', '2026-01-01')
    .lt('fecha', '2026-05-01')
    .order('fecha', { ascending: true })
    .range(offset, offset + PAGE - 1);
  if (error) {
    console.error('Error:', error);
    process.exit(1);
  }
  if (offset === 0 && count != null) {
    totalEstimated = count;
    console.error(`Total rows expected: ${count}`);
  }
  if (!data || data.length === 0) break;
  all = all.concat(data);
  console.error(`  loaded ${all.length}${totalEstimated ? '/' + totalEstimated : ''}`);
  if (data.length < PAGE) break;
  offset += PAGE;
}

console.error(`Total fetched: ${all.length}`);

// === STEP 1 — sum por (empresa, mes) ===
const stepMap = new Map();
for (const r of all) {
  const mes = new Date(r.fecha).getUTCMonth() + 1; // 1..12 — but DB stores fecha as TEXT? need to check
  // r.mes is the stored mes column — use that to be exact
  const key = `${r.empresa}|${r.mes}`;
  const e = stepMap.get(key) ?? { filas: 0, ventas: 0, utilidad: 0, costo: 0, facturas: 0, ncreditos: 0, ndebitos: 0 };
  e.filas++;
  e.ventas += Number(r.subtotal) || 0;
  e.utilidad += Number(r.utilidad) || 0;
  e.costo += Number(r.costo) || 0;
  const t = (r.tipo || '').trim();
  if (t === 'Factura') e.facturas++;
  if (t.toLowerCase().includes('crédito') || t.toLowerCase().includes('credito')) e.ncreditos++;
  if (t.toLowerCase().includes('débito') || t.toLowerCase().includes('debito')) e.ndebitos++;
  stepMap.set(key, e);
}

const step1 = [...stepMap.entries()].map(([k, v]) => {
  const [empresa_key, mes] = k.split('|');
  return { empresa_key, mes: parseInt(mes), ...v };
}).sort((a, b) => a.empresa_key.localeCompare(b.empresa_key) || a.mes - b.mes);

console.log('\n=== PASO 1 — Sumas por (empresa, mes) Ene-Abr 2026 ===');
console.log('empresa_key|mes|filas|ventas|utilidad|facturas|ncreditos|ndebitos');
for (const r of step1) {
  console.log([
    r.empresa_key,
    r.mes,
    r.filas,
    r.ventas.toFixed(2),
    r.utilidad.toFixed(2),
    r.facturas,
    r.ncreditos,
    r.ndebitos
  ].join('|'));
}

// === STEP 2 — utilidad nulls/zeros ===
const step2Map = new Map();
for (const r of all) {
  const key = `${r.empresa}|${r.mes}`;
  const e = step2Map.get(key) ?? { util_null: 0, util_zero: 0, util_real: 0 };
  if (r.utilidad === null || r.utilidad === undefined) e.util_null++;
  else if (Number(r.utilidad) === 0) e.util_zero++;
  else e.util_real++;
  step2Map.set(key, e);
}

const step2 = [...step2Map.entries()].map(([k, v]) => {
  const [empresa_key, mes] = k.split('|');
  return { empresa_key, mes: parseInt(mes), ...v };
}).sort((a, b) => a.empresa_key.localeCompare(b.empresa_key) || a.mes - b.mes);

console.log('\n=== PASO 2 — utilidad NULL/0/real por (empresa, mes) ===');
console.log('empresa_key|mes|util_null|util_zero|util_real');
for (const r of step2) {
  console.log([r.empresa_key, r.mes, r.util_null, r.util_zero, r.util_real].join('|'));
}

// also: total per empresa across Jan-Apr
const totalsEmpresa = new Map();
for (const r of step1) {
  const e = totalsEmpresa.get(r.empresa_key) ?? { ventas: 0, utilidad: 0, filas: 0 };
  e.ventas += r.ventas;
  e.utilidad += r.utilidad;
  e.filas += r.filas;
  totalsEmpresa.set(r.empresa_key, e);
}
console.log('\n=== TOTAL Ene-Abr 2026 por empresa ===');
console.log('empresa_key|filas|ventas|utilidad');
for (const [k, v] of [...totalsEmpresa.entries()].sort()) {
  console.log([k, v.filas, v.ventas.toFixed(2), v.utilidad.toFixed(2)].join('|'));
}

// total tipos
const tipoCount = {};
for (const r of all) {
  const t = (r.tipo || '(empty)').trim();
  tipoCount[t] = (tipoCount[t] || 0) + 1;
}
console.log('\n=== Distribución de TIPO ===');
for (const [t, n] of Object.entries(tipoCount).sort((a, b) => b[1] - a[1])) {
  console.log(`${t}: ${n}`);
}

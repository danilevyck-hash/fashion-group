// PASO 1 — Auditar utilidad=0 por (empresa, año, mes) desde Ene 2025
// Solo reporta combinaciones con al menos 1 fila utilidad=0
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

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

const PAGE = 1000;
let all = [];
let offset = 0;
let totalEstimated = 0;
const FROM = '2025-01-01';
const TO = '2026-05-01';
console.error(`Fetching ventas_raw rows for ${FROM} .. ${TO} (exclusive)...`);
while (true) {
  const { data, error, count } = await supa
    .from('ventas_raw')
    .select('empresa, fecha, mes, anio, utilidad', { count: offset === 0 ? 'exact' : undefined })
    .gte('fecha', FROM)
    .lt('fecha', TO)
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
  if (all.length % 10000 === 0 || (data.length < PAGE)) {
    console.error(`  loaded ${all.length}${totalEstimated ? '/' + totalEstimated : ''}`);
  }
  if (data.length < PAGE) break;
  offset += PAGE;
}

console.error(`Total fetched: ${all.length}\n`);

// Aggregate por (empresa, anio, mes)
const map = new Map();
for (const r of all) {
  const key = `${r.empresa}|${r.anio}|${r.mes}`;
  const e = map.get(key) ?? { filas: 0, util_zero: 0 };
  e.filas++;
  if (Number(r.utilidad) === 0) e.util_zero++;
  map.set(key, e);
}

const rows = [...map.entries()].map(([k, v]) => {
  const [empresa, anio, mes] = k.split('|');
  return {
    empresa,
    anio: parseInt(anio),
    mes: parseInt(mes),
    filas: v.filas,
    util_zero: v.util_zero,
    pct_zero: v.filas > 0 ? Math.round(1000 * v.util_zero / v.filas) / 10 : 0
  };
})
.filter(r => r.util_zero > 0)
.sort((a, b) => (b.anio - a.anio) || (b.mes - a.mes) || a.empresa.localeCompare(b.empresa));

console.log('=== Combinaciones (empresa, anio, mes) con AL MENOS 1 fila utilidad=0 ===');
console.log('empresa|anio|mes|filas|util_zero|pct_zero');
for (const r of rows) {
  console.log([r.empresa, r.anio, r.mes, r.filas, r.util_zero, r.pct_zero + '%'].join('|'));
}

// Resumen: cuáles meses tienen >= 50% util_zero
console.log('\n=== Meses con >= 50% utilidad=0 (sospechosos) ===');
console.log('empresa|anio|mes|filas|util_zero|pct_zero');
for (const r of rows.filter(r => r.pct_zero >= 50)) {
  console.log([r.empresa, r.anio, r.mes, r.filas, r.util_zero, r.pct_zero + '%'].join('|'));
}

// Resumen: total filas con util_zero por anio-mes (cross-empresa)
const monthMap = new Map();
for (const r of rows) {
  const k = `${r.anio}|${r.mes}`;
  const e = monthMap.get(k) ?? { filas: 0, util_zero: 0, empresas_afectadas: new Set() };
  e.filas += r.filas;
  e.util_zero += r.util_zero;
  if (r.pct_zero >= 50) e.empresas_afectadas.add(r.empresa);
  monthMap.set(k, e);
}
console.log('\n=== Resumen por (anio, mes) — empresas con >=50% util_zero ===');
console.log('anio|mes|filas_total|util_zero_total|pct|empresas_afectadas');
const monthRows = [...monthMap.entries()].map(([k, v]) => {
  const [anio, mes] = k.split('|');
  return {
    anio: parseInt(anio),
    mes: parseInt(mes),
    filas: v.filas,
    util_zero: v.util_zero,
    pct: v.filas > 0 ? Math.round(1000 * v.util_zero / v.filas) / 10 : 0,
    empresas: [...v.empresas_afectadas].sort()
  };
}).sort((a, b) => (b.anio - a.anio) || (b.mes - a.mes));
for (const r of monthRows) {
  console.log([r.anio, r.mes, r.filas, r.util_zero, r.pct + '%', r.empresas.join(',') || '(ninguna ≥50%)'].join('|'));
}

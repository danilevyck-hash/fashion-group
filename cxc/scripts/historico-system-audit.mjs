// Auditoría histórica completa de ventas_raw vs CSVs originales
// PASO 1: Sumas por (empresa, año, mes) desde que hay data
// PASO 2: Resumen total por empresa
// PASO 3: Anomalías (utilidad=0 con ventas>0) por mes
import { readFileSync, writeFileSync } from 'node:fs';
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

const EMPRESAS = ['vistana','fashion_wear','fashion_shoes','active_shoes','active_wear','confecciones_boston','american_classic'];
const PAGE = 1000;

let all = [];
let offset = 0;
let totalEstimated = 0;
console.error(`Fetching ALL ventas_raw rows for empresas: ${EMPRESAS.join(', ')}...`);
while (true) {
  const { data, error, count } = await supa
    .from('ventas_raw')
    .select('empresa, anio, mes, subtotal, utilidad', { count: offset === 0 ? 'exact' : undefined })
    .in('empresa', EMPRESAS)
    .order('anio', { ascending: true })
    .order('mes', { ascending: true })
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
  if (all.length % 10000 === 0 || data.length < PAGE) {
    console.error(`  loaded ${all.length}${totalEstimated ? '/' + totalEstimated : ''}`);
  }
  if (data.length < PAGE) break;
  offset += PAGE;
}

console.error(`Total fetched: ${all.length}\n`);

// === PASO 1: por (empresa, anio, mes) ===
const step1Map = new Map();
for (const r of all) {
  const key = `${r.empresa}|${r.anio}|${r.mes}`;
  const e = step1Map.get(key) ?? { filas: 0, ventas: 0, utilidad: 0 };
  e.filas++;
  e.ventas += Number(r.subtotal) || 0;
  e.utilidad += Number(r.utilidad) || 0;
  step1Map.set(key, e);
}

const step1 = [...step1Map.entries()].map(([k, v]) => {
  const [empresa, anio, mes] = k.split('|');
  return {
    empresa,
    anio: parseInt(anio),
    mes: parseInt(mes),
    filas: v.filas,
    ventas: Number(v.ventas.toFixed(2)),
    utilidad: Number(v.utilidad.toFixed(2)),
  };
}).sort((a, b) =>
  a.empresa.localeCompare(b.empresa) ||
  a.anio - b.anio ||
  a.mes - b.mes
);

// === PASO 2: total por empresa ===
const step2Map = new Map();
for (const r of step1) {
  const e = step2Map.get(r.empresa) ?? {
    anio_min: r.anio, anio_max: r.anio, filas_total: 0, ventas_total: 0, utilidad_total: 0
  };
  e.anio_min = Math.min(e.anio_min, r.anio);
  e.anio_max = Math.max(e.anio_max, r.anio);
  e.filas_total += r.filas;
  e.ventas_total += r.ventas;
  e.utilidad_total += r.utilidad;
  step2Map.set(r.empresa, e);
}

const step2 = [...step2Map.entries()].map(([empresa, v]) => ({
  empresa,
  anio_min: v.anio_min,
  anio_max: v.anio_max,
  filas_total: v.filas_total,
  ventas_total: Number(v.ventas_total.toFixed(2)),
  utilidad_total: Number(v.utilidad_total.toFixed(2)),
})).sort((a, b) => a.empresa.localeCompare(b.empresa));

// === PASO 3: anomalías (utilidad=0 con |subtotal|>0.01) por mes ===
const step3Map = new Map();
for (const r of all) {
  const key = `${r.empresa}|${r.anio}|${r.mes}`;
  const e = step3Map.get(key) ?? { anomalias: 0 };
  if (Number(r.utilidad) === 0 && Math.abs(Number(r.subtotal) || 0) > 0.01) {
    e.anomalias++;
  }
  step3Map.set(key, e);
}

const step3 = [...step3Map.entries()].map(([k, v]) => {
  const [empresa, anio, mes] = k.split('|');
  return {
    empresa,
    anio: parseInt(anio),
    mes: parseInt(mes),
    anomalias: v.anomalias,
  };
}).filter(r => r.anomalias > 5)
  .sort((a, b) => b.anomalias - a.anomalias)
  .slice(0, 20);

// === Save JSON ===
const out = {
  generated_at: new Date().toISOString(),
  total_rows_fetched: all.length,
  paso1_por_mes: step1,
  paso2_total_por_empresa: step2,
  paso3_anomalias_top20: step3,
};

const outPath = '/tmp/historico-system.json';
writeFileSync(outPath, JSON.stringify(out, null, 2));
console.error(`✓ Guardado en ${outPath}\n`);

// === Print summary ===
console.log('=== PASO 2 — Total por empresa ===');
console.log('empresa|anio_min|anio_max|filas|ventas|utilidad');
for (const r of step2) {
  console.log([r.empresa, r.anio_min, r.anio_max, r.filas_total, r.ventas_total.toFixed(2), r.utilidad_total.toFixed(2)].join('|'));
}

console.log(`\n=== PASO 1 — Sumas por (empresa, año, mes) — ${step1.length} filas ===`);
console.log('empresa|anio|mes|filas|ventas|utilidad');
for (const r of step1) {
  console.log([r.empresa, r.anio, r.mes, r.filas, r.ventas.toFixed(2), r.utilidad.toFixed(2)].join('|'));
}

console.log(`\n=== PASO 3 — Top 20 meses con anomalías (utilidad=0 con ventas>0, >5 filas) ===`);
console.log('empresa|anio|mes|anomalias');
for (const r of step3) {
  console.log([r.empresa, r.anio, r.mes, r.anomalias].join('|'));
}

console.log(`\n✓ JSON completo en: ${outPath}`);

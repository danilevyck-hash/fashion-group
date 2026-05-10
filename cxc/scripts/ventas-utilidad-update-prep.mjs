// Prep para UPDATE quirúrgico de utilidad — abril 2026
// 1. Muestra 5 filas (active_wear + vistana) con todas las columnas
// 2. Detecta duplicados (empresa, n_sistema) en las 367 filas afectadas
// 3. Detecta filas con n_sistema NULL/empty en las 367 filas afectadas
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = readFileSync('/Users/daniellevy/Code/fashion-group/cxc/.env.local', 'utf-8');
const vars = Object.fromEntries(
  env.split('\n').filter(l => l && !l.startsWith('#')).map(l => {
    const i = l.indexOf('=');
    return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
  })
);

const supa = createClient(vars.NEXT_PUBLIC_SUPABASE_URL, vars.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

const EMPRESAS = ['vistana','fashion_wear','fashion_shoes','active_shoes','active_wear','confecciones_boston'];

// === 2. Muestra de 5 filas active_wear + vistana ===
console.log('=== MUESTRA: 5 filas (active_wear + vistana) abril 2026 — TODAS las columnas ===\n');
const { data: sample, error: e1 } = await supa
  .from('ventas_raw')
  .select('*')
  .gte('fecha', '2026-04-01')
  .lt('fecha', '2026-05-01')
  .in('empresa', ['active_wear', 'vistana'])
  .order('empresa', { ascending: true })
  .order('fecha', { ascending: true })
  .limit(5);
if (e1) { console.error(e1); process.exit(1); }
for (const row of sample) {
  console.log(JSON.stringify(row, null, 2));
  console.log('---');
}

// === 3. Detectar duplicados (empresa, n_sistema) en las 367 filas afectadas ===
console.log('\n=== DUPLICADOS de (empresa, n_sistema) en las 367 filas afectadas ===\n');

// Pull all 367 rows con solo empresa+n_sistema+fecha
const { data: all367, error: e2 } = await supa
  .from('ventas_raw')
  .select('empresa, n_sistema, fecha, id')
  .gte('fecha', '2026-04-01')
  .lt('fecha', '2026-05-01')
  .in('empresa', EMPRESAS);
if (e2) { console.error(e2); process.exit(1); }

console.log(`Total filas en alcance: ${all367.length}`);

// Agrupa por (empresa, n_sistema)
const groupMap = new Map();
const nullSistemaRows = [];
for (const r of all367) {
  if (r.n_sistema === null || r.n_sistema === undefined || r.n_sistema === '') {
    nullSistemaRows.push(r);
    continue;
  }
  const key = `${r.empresa}|${r.n_sistema}`;
  const arr = groupMap.get(key) ?? [];
  arr.push(r);
  groupMap.set(key, arr);
}

const dups = [...groupMap.entries()].filter(([_, rows]) => rows.length > 1);
console.log(`\nGrupos (empresa, n_sistema) con >1 fila: ${dups.length}`);
if (dups.length > 0) {
  console.log('empresa|n_sistema|count|ids+fechas');
  for (const [k, rows] of dups) {
    console.log(`${k}|${rows.length}|${rows.map(r => `${r.id}@${r.fecha}`).join(',')}`);
  }
} else {
  console.log('✅ Cero duplicados — (empresa, n_sistema) es clave única para estas 367 filas.');
}

console.log(`\nFilas con n_sistema NULL/vacío: ${nullSistemaRows.length}`);
if (nullSistemaRows.length > 0) {
  console.log('⚠️ Esas filas NO se pueden matchear por (empresa, n_sistema) — necesitan otro criterio.');
  console.log('Muestra:');
  for (const r of nullSistemaRows.slice(0, 10)) {
    console.log(`  id=${r.id} empresa=${r.empresa} fecha=${r.fecha} n_sistema=${JSON.stringify(r.n_sistema)}`);
  }
}

// Extra: distribución por empresa de cuántas filas tienen n_sistema válido
console.log('\n=== Distribución por empresa: filas con n_sistema válido ===');
const empMap = new Map();
for (const r of all367) {
  const e = empMap.get(r.empresa) ?? { total: 0, con_nsist: 0, sin_nsist: 0 };
  e.total++;
  if (r.n_sistema && r.n_sistema !== '') e.con_nsist++;
  else e.sin_nsist++;
  empMap.set(r.empresa, e);
}
console.log('empresa|total|con_n_sistema|sin_n_sistema');
for (const [emp, v] of [...empMap.entries()].sort()) {
  console.log(`${emp}|${v.total}|${v.con_nsist}|${v.sin_nsist}`);
}

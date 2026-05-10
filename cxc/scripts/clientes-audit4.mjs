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

// Real exact count using HEAD
async function exactCount(table) {
  const { count, error } = await supa.from(table).select('*', { count: 'exact', head: true });
  if (error) return `error: ${error.message}`;
  return count;
}

console.log('=== conteos exactos ===');
console.log(`  directorio_clientes: ${await exactCount('directorio_clientes')}`);
console.log(`  cxc_rows:            ${await exactCount('cxc_rows')}`);
console.log(`  ventas_raw:          ${await exactCount('ventas_raw')}`);

// directorio_clientes — schema + 5 rows
console.log('\n=== directorio_clientes — 5 filas ===');
const { data: dc } = await supa.from('directorio_clientes').select('*').limit(5);
if (dc) {
  console.log('  columnas (de la 1ra fila):');
  for (const [k, v] of Object.entries(dc[0])) {
    let t;
    if (v === null) t = 'null';
    else if (Array.isArray(v)) t = 'array';
    else if (typeof v === 'object') t = 'object';
    else t = typeof v;
    console.log(`    - ${k.padEnd(20)} ${t.padEnd(8)} sample: ${JSON.stringify(v)}`);
  }
  console.log('  filas:');
  for (const r of dc) console.log('    ' + JSON.stringify(r));
}

// total dirclientes including deleted
console.log('\n=== directorio_clientes — soft delete check ===');
const { count: dcAll }   = await supa.from('directorio_clientes').select('*', { count: 'exact', head: true });
const { count: dcDel }   = await supa.from('directorio_clientes').select('*', { count: 'exact', head: true }).eq('deleted', true);
const { count: dcAlive } = await supa.from('directorio_clientes').select('*', { count: 'exact', head: true }).neq('deleted', true);
console.log(`  total: ${dcAll}, deleted=true: ${dcDel}, vivos (deleted=false/null): ${dcAlive}`);

// directorio_clientes empresa breakdown
console.log('\n=== directorio_clientes — distribución por empresa ===');
const { data: dcAllRows } = await supa.from('directorio_clientes').select('empresa, deleted').limit(500);
const empMap = {};
for (const r of dcAllRows ?? []) {
  const k = r.empresa ?? '(null)';
  empMap[k] = (empMap[k] || 0) + 1;
}
for (const [k, n] of Object.entries(empMap).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k}: ${n}`);
}

// cxc_rows — schema (ya lo tengo) + únicos
console.log('\n=== cxc_rows — únicos ===');
async function uniqueCount(table, field) {
  const set = new Set();
  let off = 0;
  const PAGE = 1000;
  while (true) {
    const { data, error } = await supa.from(table).select(field).range(off, off + PAGE - 1);
    if (error) return `error: ${error.message}`;
    if (!data || data.length === 0) break;
    for (const r of data) set.add(r[field]);
    if (data.length < PAGE) break;
    off += PAGE;
    if (off > 200000) break;
  }
  return set.size;
}
console.log(`  cxc_rows.codigo (D-XXX) únicos: ${await uniqueCount('cxc_rows', 'codigo')}`);
console.log(`  cxc_rows.nombre únicos:         ${await uniqueCount('cxc_rows', 'nombre')}`);
console.log(`  cxc_rows.nombre_normalized:     ${await uniqueCount('cxc_rows', 'nombre_normalized')}`);

// (codigo, company_key) unique combo
{
  const set = new Set();
  let off = 0;
  while (true) {
    const { data } = await supa.from('cxc_rows').select('codigo,company_key').range(off, off + 999);
    if (!data || data.length === 0) break;
    for (const r of data) set.add(`${r.company_key}|${r.codigo}`);
    if (data.length < 1000) break;
    off += 1000;
  }
  console.log(`  cxc_rows (company_key, codigo) únicos: ${set.size}`);
}

// ventas_raw — únicos por cliente, codigo no existe
console.log('\n=== ventas_raw — únicos ===');
console.log(`  ventas_raw.cliente únicos: ${await uniqueCount('ventas_raw', 'cliente')}`);

// codigo present in ventas_raw? Try selecting columns named "codigo*"
const { data: vrCol } = await supa.from('ventas_raw').select('*').limit(1);
const codigoCols = Object.keys(vrCol?.[0] || {}).filter(k => /cod|cliente_id|cliente_code/i.test(k));
console.log(`  columnas tipo "codigo" en ventas_raw: ${JSON.stringify(codigoCols)}`);

// Check overlap: how many ventas_raw.cliente values appear as cxc_rows.nombre_normalized?
console.log('\n=== overlap: ventas_raw.cliente ↔ cxc_rows.nombre_normalized ===');
const { data: cxcNames } = await supa.from('cxc_rows').select('nombre_normalized').limit(2000);
const cxcSet = new Set((cxcNames ?? []).map(r => (r.nombre_normalized || '').trim().toUpperCase()));
console.log(`  cxc_rows.nombre_normalized total únicos en muestra: ${cxcSet.size}`);

const vrSet = new Set();
let voff = 0;
while (true) {
  const { data } = await supa.from('ventas_raw').select('cliente').range(voff, voff + 999);
  if (!data || data.length === 0) break;
  for (const r of data) {
    if (r.cliente) vrSet.add(r.cliente.trim().toUpperCase());
  }
  if (data.length < 1000) break;
  voff += 1000;
  if (voff > 200000) break;
}
console.log(`  ventas_raw.cliente únicos (UPPER trim): ${vrSet.size}`);

let matched = 0;
const sampleMatched = [];
const sampleUnmatched = [];
for (const v of vrSet) {
  if (cxcSet.has(v)) {
    matched++;
    if (sampleMatched.length < 5) sampleMatched.push(v);
  } else {
    if (sampleUnmatched.length < 10) sampleUnmatched.push(v);
  }
}
console.log(`  matches exactos: ${matched} de ${vrSet.size} (${(matched / vrSet.size * 100).toFixed(1)}%)`);
console.log(`  ejemplos match:    ${JSON.stringify(sampleMatched)}`);
console.log(`  ejemplos NO match: ${JSON.stringify(sampleUnmatched)}`);

// Check directorio_clientes.nombre overlap also
const dcNames = (dcAllRows ?? []).map(r => null); // need full select
const { data: dcAllNames } = await supa.from('directorio_clientes').select('nombre').limit(500);
const dcSet = new Set((dcAllNames ?? []).map(r => (r.nombre || '').trim().toUpperCase()));
console.log(`\n=== overlap: ventas_raw.cliente ↔ directorio_clientes.nombre ===`);
console.log(`  directorio_clientes.nombre únicos: ${dcSet.size}`);
let dcMatch = 0;
for (const v of vrSet) if (dcSet.has(v)) dcMatch++;
console.log(`  matches exactos: ${dcMatch} de ${vrSet.size}`);

// Read-only audit: directorio / cxc_rows / ventas_raw schemas + stats
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

function shapeFromRow(row) {
  if (!row) return null;
  const cols = {};
  for (const [k, v] of Object.entries(row)) {
    let t;
    if (v === null) t = 'null';
    else if (Array.isArray(v)) t = 'array';
    else if (typeof v === 'object') t = 'object';
    else t = typeof v;
    const sample = (typeof v === 'string') ? (v.length > 60 ? v.slice(0, 60) + '…' : v) : v;
    cols[k] = { type: t, sample };
  }
  return cols;
}

async function audit(table, sampleCols = '*') {
  console.log(`\n===== ${table} =====`);
  // count
  const { count, error: cErr } = await supa.from(table).select('*', { count: 'exact', head: true });
  if (cErr) { console.log('  count error:', cErr.message); return; }
  console.log(`  filas totales: ${count}`);

  // sample 5 rows
  const { data, error } = await supa.from(table).select(sampleCols).limit(5);
  if (error) { console.log('  sample error:', error.message); return; }
  if (!data || data.length === 0) { console.log('  (vacío)'); return; }

  console.log(`  columnas detectadas (de la primera fila):`);
  const shape = shapeFromRow(data[0]);
  for (const [k, v] of Object.entries(shape)) {
    console.log(`    - ${k.padEnd(28)} ${v.type.padEnd(8)} sample: ${JSON.stringify(v.sample)}`);
  }

  console.log(`  5 filas de muestra:`);
  for (const r of data) {
    console.log('    ' + JSON.stringify(r));
  }
}

await audit('directorio');
await audit('cxc_rows');
await audit('ventas_raw');

// === conteos de cliente único por tabla ===
console.log('\n===== valores únicos de "cliente" =====');

async function uniqueCount(table, field) {
  // Pull distinct using paged select — Supabase JS no expone DISTINCT directo.
  const set = new Set();
  let off = 0;
  const PAGE = 1000;
  while (true) {
    const { data, error } = await supa.from(table).select(field).range(off, off + PAGE - 1);
    if (error) { console.log(`  ${table}.${field} error:`, error.message); return null; }
    if (!data || data.length === 0) break;
    for (const r of data) set.add(r[field]);
    if (data.length < PAGE) break;
    off += PAGE;
    if (off > 200000) { console.log(`  ${table}.${field}: cap 200k, abortando`); break; }
  }
  return set.size;
}

// directorio probablemente tiene columna "nombre" o "cliente" — primero adivinar
const { data: dirSample } = await supa.from('directorio').select('*').limit(1);
const dirNameField =
  dirSample?.[0] && ('nombre' in dirSample[0] ? 'nombre'
    : 'cliente' in dirSample[0] ? 'cliente'
    : Object.keys(dirSample[0])[0]);
console.log(`  directorio.${dirNameField}: ${await uniqueCount('directorio', dirNameField)}`);
console.log(`  cxc_rows.cliente: ${await uniqueCount('cxc_rows', 'cliente')}`);
console.log(`  ventas_raw.cliente: ${await uniqueCount('ventas_raw', 'cliente')}`);

// === Posibles códigos de cliente — buscar columnas con "cod" / "id" en cxc/ventas ===
console.log('\n===== columnas potenciales de "código cliente" =====');
const { data: cxcSample } = await supa.from('cxc_rows').select('*').limit(1);
const { data: vrSample } = await supa.from('ventas_raw').select('*').limit(1);
const detectCodCols = (row) => Object.keys(row || {}).filter(k =>
  /cod|cliente_id|cliente_code|cust|client/i.test(k)
);
console.log(`  cxc_rows: ${JSON.stringify(detectCodCols(cxcSample?.[0]))}`);
console.log(`  ventas_raw: ${JSON.stringify(detectCodCols(vrSample?.[0]))}`);

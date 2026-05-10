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

// Try directory-related table names
const candidates = [
  'directorio', 'directorio_rows', 'directorio_clientes',
  'clientes', 'clientes_master', 'clientes_directorio',
  'master_clientes', 'directorio_contactos'
];
console.log('=== buscando tabla de directorio ===');
for (const name of candidates) {
  const { count, error } = await supa.from(name).select('*', { count: 'exact', head: true });
  if (!error) console.log(`  ✓ ${name} — ${count} filas`);
  else console.log(`  ✗ ${name} — ${error.message.split(':')[0]}`);
}

// Función para listar tablas via pg_catalog ya no es accesible vía REST.
// Veamos si hay tablas que tengan una columna parecida a "cliente"/"directorio"
console.log('\n=== probando otros nombres ===');
const more = [
  'dir', 'directorio_v2', 'directorio_unificado', 'contactos',
  'clientes_unificados', 'master_directorio', 'clientes_finales',
  'reebok_clientes', 'fashion_clientes'
];
for (const name of more) {
  const { count, error } = await supa.from(name).select('*', { count: 'exact', head: true });
  if (!error) console.log(`  ✓ ${name} — ${count} filas`);
}

// Unique counts correctos
console.log('\n=== valores únicos ===');
async function uniqueCount(table, field) {
  const set = new Set();
  let off = 0;
  const PAGE = 1000;
  while (true) {
    const { data, error } = await supa.from(table).select(field).range(off, off + PAGE - 1);
    if (error) { return `error: ${error.message}`; }
    if (!data || data.length === 0) break;
    for (const r of data) set.add(r[field]);
    if (data.length < PAGE) break;
    off += PAGE;
    if (off > 200000) break;
  }
  return set.size;
}

console.log(`  cxc_rows.nombre: ${await uniqueCount('cxc_rows', 'nombre')}`);
console.log(`  cxc_rows.nombre_normalized: ${await uniqueCount('cxc_rows', 'nombre_normalized')}`);
console.log(`  cxc_rows.codigo: ${await uniqueCount('cxc_rows', 'codigo')}`);
console.log(`  cxc_rows (codigo+company_key): combinación`);
{
  const set = new Set();
  let off = 0;
  while (true) {
    const { data, error } = await supa.from('cxc_rows').select('codigo,company_key').range(off, off + 999);
    if (error) break;
    if (!data || data.length === 0) break;
    for (const r of data) set.add(`${r.company_key}|${r.codigo}`);
    if (data.length < 1000) break;
    off += 1000;
  }
  console.log(`     (codigo, company_key) únicos: ${set.size}`);
}
console.log(`  ventas_raw.cliente: ${await uniqueCount('ventas_raw', 'cliente')}`);

// Sanity — codigo presente en ventas_raw?  No vi ese campo, confirmar.
console.log('\n=== ventas_raw — full column listing (sample 1 row) ===');
const { data: vr } = await supa.from('ventas_raw').select('*').limit(1);
console.log('  columnas:', Object.keys(vr?.[0] || {}).join(', '));

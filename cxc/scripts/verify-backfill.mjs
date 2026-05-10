// FASE 2 — verify backfill of cliente_id in ventas_raw + cxc_rows.
// Read-only. Run AFTER applying supabase/migrations/clientes-master-backfill.sql.
//
// Reports:
//   - % cliente_id NOT NULL in ventas_raw B2B and cxc_rows B2B
//   - TOP 20 huérfanos in each (NULL cliente_id), with volume + counts
//
// Usage: node scripts/verify-backfill.mjs

import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const ENV_PATH = '/Users/daniellevy/Code/fashion-group/cxc/.env.local';
const B2B_KEYS = ['vistana', 'fashion_wear', 'fashion_shoes', 'active_shoes', 'active_wear', 'joystep'];

const env = readFileSync(ENV_PATH, 'utf-8');
const vars = Object.fromEntries(
  env.split('\n').filter((l) => l && !l.startsWith('#')).map((l) => {
    const i = l.indexOf('=');
    return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
  }),
);
const supa = createClient(vars.NEXT_PUBLIC_SUPABASE_URL, vars.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// ─── Verify cliente_id column exists ───
{
  const { error } = await supa.from('ventas_raw').select('cliente_id').limit(1);
  if (error) {
    console.error('ventas_raw.cliente_id no existe:', error.message);
    console.error('Primero corre supabase/migrations/clientes-master-backfill.sql en el SQL Editor.');
    process.exit(1);
  }
}

// ─── Pull ventas_raw B2B ───
console.log('=== ventas_raw (B2B) ===');
let off = 0;
const PAGE = 1000;
const ventasOrphans = new Map(); // cliente_norm → { count, subtotal, sample }
let vTotal = 0;
let vWithId = 0;
while (true) {
  const { data, error } = await supa
    .from('ventas_raw')
    .select('cliente, cliente_id, subtotal, empresa')
    .in('empresa', B2B_KEYS)
    .range(off, off + PAGE - 1);
  if (error) { console.error(error); process.exit(1); }
  if (!data || data.length === 0) break;
  for (const r of data) {
    vTotal++;
    if (r.cliente_id) {
      vWithId++;
    } else {
      const k = (r.cliente || '').trim();
      const e = ventasOrphans.get(k) ?? { count: 0, subtotal: 0, sample: r.cliente };
      e.count++;
      e.subtotal += Number(r.subtotal) || 0;
      ventasOrphans.set(k, e);
    }
  }
  if (data.length < PAGE) break;
  off += PAGE;
  if (off > 200000) break;
}
const vPct = vTotal > 0 ? (vWithId / vTotal * 100) : 0;
console.log(`Filas B2B: ${vTotal}`);
console.log(`Con cliente_id: ${vWithId} (${vPct.toFixed(1)}%)`);
console.log(`Huérfanos: ${vTotal - vWithId} (${(100 - vPct).toFixed(1)}%) en ${ventasOrphans.size} nombres únicos`);

const vList = [...ventasOrphans.entries()].map(([cliente, v]) => ({ cliente, ...v }));
vList.sort((a, b) => Math.abs(b.subtotal) - Math.abs(a.subtotal));
console.log('\nTOP 20 huérfanos en ventas_raw B2B (por |subtotal|):');
console.log('  rank | cliente                                  | filas |  subtotal $');
for (let i = 0; i < Math.min(20, vList.length); i++) {
  const u = vList[i];
  console.log(`  ${String(i + 1).padStart(4)} | ${u.cliente.padEnd(40).slice(0, 40)} | ${String(u.count).padStart(5)} | ${u.subtotal.toFixed(2).padStart(13)}`);
}

// ─── Pull cxc_rows B2B ───
console.log('\n=== cxc_rows (B2B) ===');
off = 0;
const cxcOrphans = []; // { company_key, codigo, nombre, total, count }
const cxcOrphMap = new Map();
let cTotal = 0;
let cWithId = 0;
while (true) {
  const { data, error } = await supa
    .from('cxc_rows')
    .select('company_key, codigo, nombre_normalized, total, cliente_id')
    .in('company_key', B2B_KEYS)
    .range(off, off + PAGE - 1);
  if (error) { console.error(error); process.exit(1); }
  if (!data || data.length === 0) break;
  for (const r of data) {
    cTotal++;
    if (r.cliente_id) {
      cWithId++;
    } else {
      const k = `${r.company_key}|${r.nombre_normalized}`;
      const e = cxcOrphMap.get(k) ?? {
        company_key: r.company_key,
        codigo: r.codigo,
        nombre: r.nombre_normalized,
        total: 0,
        count: 0,
      };
      e.total += Number(r.total) || 0;
      e.count++;
      cxcOrphMap.set(k, e);
    }
  }
  if (data.length < PAGE) break;
  off += PAGE;
}
const cPct = cTotal > 0 ? (cWithId / cTotal * 100) : 0;
console.log(`Filas B2B: ${cTotal}`);
console.log(`Con cliente_id: ${cWithId} (${cPct.toFixed(1)}%)`);
console.log(`Huérfanos: ${cTotal - cWithId} (${(100 - cPct).toFixed(1)}%) en ${cxcOrphMap.size} (empresa, nombre)`);

const cList = [...cxcOrphMap.values()];
cList.sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
console.log('\nTOP 20 huérfanos en cxc_rows B2B (por |total|):');
console.log('  rank | empresa               | codigo | nombre                                   | filas |  total $');
for (let i = 0; i < Math.min(20, cList.length); i++) {
  const u = cList[i];
  console.log(`  ${String(i + 1).padStart(4)} | ${u.company_key.padEnd(20)} | ${(u.codigo || '').padEnd(6)} | ${(u.nombre || '').padEnd(40).slice(0, 40)} | ${String(u.count).padStart(5)} | ${u.total.toFixed(2).padStart(11)}`);
}

console.log('\n=== Resumen ===');
console.log(`ventas_raw B2B: ${vPct.toFixed(1)}% backfilled (objetivo Fase 0: ~76%)`);
console.log(`cxc_rows B2B:   ${cPct.toFixed(1)}% backfilled (objetivo Fase 0: ~98%)`);

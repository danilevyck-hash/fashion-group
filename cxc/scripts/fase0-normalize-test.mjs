// Test alternate normalization strategies against master vs ventas_raw + cxc_rows
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const MASTER_CSV = '/Users/daniellevy/Code/fashion-group/cxc/data/listaclientes_master.csv';
const ENV_PATH   = '/Users/daniellevy/Code/fashion-group/cxc/.env.local';
const B2B_KEYS   = ['vistana', 'fashion_wear', 'fashion_shoes', 'active_shoes', 'active_wear', 'joystep'];

// Normalizers
const N1 = (s) => (s ?? '').trim().toUpperCase().replace(/\s+/g, ' ');                                  // spec original
const N2 = (s) => (s ?? '').trim().toUpperCase().replace(/[.,]/g, '').replace(/\s+/g, ' ').trim();      // remove [.,]
const N3 = (s) => (s ?? '').trim().toUpperCase().replace(/[.,()\/]/g, ' ').replace(/\s+/g, ' ').trim(); // remove [.,()/]

const env = readFileSync(ENV_PATH, 'utf-8');
const vars = Object.fromEntries(env.split('\n').filter(l => l && !l.startsWith('#')).map(l => {
  const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
}));
const supa = createClient(vars.NEXT_PUBLIC_SUPABASE_URL, vars.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// Parse master
const lines = readFileSync(MASTER_CSV, 'utf-8').split(/\r?\n/).filter(l => l.trim());
const headers = lines[0].split(';').map(h => h.trim());
const ix = (k) => headers.indexOf(k);
const masterNames = lines.slice(1).map(l => l.split(';')[ix('NOMBRE')]);

// Pull ventas B2B + cxc B2B
const ventasNames = new Set();
let off = 0;
while (true) {
  const { data } = await supa.from('ventas_raw').select('cliente').in('empresa', B2B_KEYS).range(off, off + 999);
  if (!data || data.length === 0) break;
  for (const r of data) ventasNames.add(r.cliente);
  if (data.length < 1000) break;
  off += 1000;
}
const cxcNames = [];
{
  let o = 0;
  while (true) {
    const { data } = await supa.from('cxc_rows').select('company_key, nombre_normalized').range(o, o + 999);
    if (!data || data.length === 0) break;
    for (const r of data) if (B2B_KEYS.includes(r.company_key)) cxcNames.push(r.nombre_normalized);
    if (data.length < 1000) break;
    o += 1000;
  }
}

function pctMatch(masterArr, otherArr, fn) {
  const ms = new Set(masterArr.map(fn).filter(Boolean));
  const os = new Set(otherArr.map(fn).filter(Boolean));
  let m = 0;
  for (const v of os) if (ms.has(v)) m++;
  return { uniqueOther: os.size, matched: m, pct: (m / os.size * 100) };
}

console.log('=== Comparación de estrategias de normalización ===\n');
console.log(`Master nombres: ${masterNames.length}`);
console.log(`ventas_raw B2B nombres únicos: ${ventasNames.size}`);
console.log(`cxc_rows B2B raw rows: ${cxcNames.length}\n`);

const cxcUnique = new Set(cxcNames);
console.log(`cxc_rows B2B nombres únicos (nombre_normalized): ${cxcUnique.size}\n`);

const normalizers = [
  { name: 'N1: spec original (UPPER + collapse)', fn: N1 },
  { name: 'N2: + remove [.,]', fn: N2 },
  { name: 'N3: + remove [.,()/]  (más agresivo)', fn: N3 },
];

console.log('VENTAS_RAW (B2B):');
for (const n of normalizers) {
  const r = pctMatch(masterNames, [...ventasNames], n.fn);
  console.log(`  ${n.name.padEnd(45)} → ${r.matched}/${r.uniqueOther} = ${r.pct.toFixed(1)}%`);
}
console.log('\nCXC_ROWS (B2B):');
for (const n of normalizers) {
  const r = pctMatch(masterNames, [...cxcUnique], n.fn);
  console.log(`  ${n.name.padEnd(45)} → ${r.matched}/${r.uniqueOther} = ${r.pct.toFixed(1)}%`);
}

// Sample: ¿cómo cambia "A-Amani, S.A." con cada normalizer?
console.log('\n=== Ejemplos de cómo normaliza "A-Amani, S.A." ===');
const samples = ['A-Amani, S.A.', 'BOUTI, S.A.', 'GRUP MEL INTERNATIONAL S.A.', 'ISMORA S.A. ( CITY MODA)', 'C/C EL DOLLAR 1,2,3,4 Y 5'];
for (const s of samples) {
  console.log(`  "${s}"`);
  console.log(`     N1: "${N1(s)}"`);
  console.log(`     N2: "${N2(s)}"`);
  console.log(`     N3: "${N3(s)}"`);
}

// Qué quedaría sin match con N2
console.log('\n=== Con N2 — huérfanos restantes en ventas_raw B2B ===');
const ms2 = new Set(masterNames.map(N2));
const ventasHuerf = [...ventasNames].filter(v => !ms2.has(N2(v))).map(v => N2(v));
console.log(`  total: ${ventasHuerf.length}`);
console.log(`  primeros 30: ${JSON.stringify(ventasHuerf.slice(0, 30), null, 0)}`);

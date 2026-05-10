// FASE 0 — read-only analysis of master client list vs ventas_raw + cxc_rows
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

// ─── Config ───
const MASTER_CSV = '/Users/daniellevy/Code/fashion-group/cxc/data/listaclientes_master.csv';
const ENV_PATH   = '/Users/daniellevy/Code/fashion-group/cxc/.env.local';
const B2B_KEYS   = ['vistana', 'fashion_wear', 'fashion_shoes', 'active_shoes', 'active_wear', 'joystep'];

// ─── Helpers ───
const normalize = (s) => (s ?? '').trim().toUpperCase().replace(/\s+/g, ' ');

function parseCSV(text) {
  // Switch Soft uses ; as delimiter and does NOT quote fields with commas.
  // Master CSV has no embedded ; or newlines in fields based on inspection.
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const headers = lines[0].split(';').map((h) => h.trim());
  const rows = lines.slice(1).map((line) => {
    const cols = line.split(';');
    const obj = {};
    for (let i = 0; i < headers.length; i++) obj[headers[i]] = (cols[i] ?? '').trim();
    return obj;
  });
  return { headers, rows };
}

// ─── Load .env ───
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

// ─── 1. Parse master CSV ───
const csvText = readFileSync(MASTER_CSV, 'utf-8');
const { headers, rows: masterRows } = parseCSV(csvText);

console.log('=== MASTER CSV ===');
console.log(`Filas:         ${masterRows.length}`);
console.log(`Columnas:      ${headers.length}`);
console.log(`ESTATUS dist:`, count(masterRows.map((r) => r.ESTATUS)));
console.log(`TIPO CLIENTE dist:`, count(masterRows.map((r) => r['TIPO CLIENTE'])));

// Columnas que vamos a usar en Fase 1 (los demás se descartan):
const FIELDS_TO_USE = [
  'CODIGO', 'NOMBRE', 'RAZON SOCIAL', 'TIPO CLIENTE', 'IDENTIFICACION', 'DV',
  'CORREO', 'TELEFONO', 'CELULAR', 'PROVINCIA', 'DISTRITO', 'CORREGIMIENTO',
  'LIMITE CREDITO', 'FECHA CREACION',
];
console.log(`\nColumnas que usaremos (mapeo a clientes_master):`);
for (const f of FIELDS_TO_USE) console.log(`  - ${f}`);
const ignored = headers.filter((h) => !FIELDS_TO_USE.includes(h));
console.log(`\nColumnas que se descartan (${ignored.length}):`);
console.log(`  ${ignored.join(', ')}`);

function count(arr) {
  const m = {};
  for (const v of arr) m[v || '(vacío)'] = (m[v || '(vacío)'] || 0) + 1;
  return m;
}

// ─── 2. Normalize master names ───
const masterByNorm = new Map();
for (const r of masterRows) {
  const norm = normalize(r.NOMBRE);
  if (!norm) continue;
  if (masterByNorm.has(norm)) {
    console.log(`⚠️  duplicado normalizado en master: "${norm}" (${r.CODIGO} y otro)`);
  }
  masterByNorm.set(norm, r);
}
console.log(`\nNombres únicos normalizados en master: ${masterByNorm.size}`);

// ─── 3. Pull ventas_raw únicos B2B ───
console.log(`\n=== VENTAS_RAW (B2B only) ===`);
console.log(`Empresas B2B: ${B2B_KEYS.join(', ')}`);

const ventasMap = new Map(); // cliente_norm → { count, subtotal, original_samples: Set }
let off = 0;
const PAGE = 1000;
while (true) {
  const { data, error } = await supa
    .from('ventas_raw')
    .select('cliente, subtotal, empresa')
    .in('empresa', B2B_KEYS)
    .range(off, off + PAGE - 1);
  if (error) { console.error(error); process.exit(1); }
  if (!data || data.length === 0) break;
  for (const r of data) {
    const norm = normalize(r.cliente);
    const e = ventasMap.get(norm) ?? { count: 0, subtotal: 0, originals: new Set() };
    e.count++;
    e.subtotal += Number(r.subtotal) || 0;
    if (e.originals.size < 3) e.originals.add(r.cliente);
    ventasMap.set(norm, e);
  }
  if (data.length < PAGE) break;
  off += PAGE;
  if (off > 200000) break;
}
console.log(`Filas B2B: ${[...ventasMap.values()].reduce((a, b) => a + b.count, 0)}`);
console.log(`Nombres únicos B2B: ${ventasMap.size}`);

let ventasMatched = 0;
let ventasUnmatched = 0;
const unmatchedVentas = [];
for (const [norm, e] of ventasMap) {
  if (masterByNorm.has(norm)) {
    ventasMatched++;
  } else {
    ventasUnmatched++;
    unmatchedVentas.push({ norm, ...e });
  }
}
console.log(`Match contra master: ${ventasMatched} / ${ventasMap.size}  (${(ventasMatched / ventasMap.size * 100).toFixed(1)}%)`);
console.log(`Sin match (huérfanos): ${ventasUnmatched}`);

// TOP 20 huérfanos en ventas por volumen $
unmatchedVentas.sort((a, b) => Math.abs(b.subtotal) - Math.abs(a.subtotal));
console.log(`\nTOP 20 huérfanos en ventas_raw B2B (por |subtotal|):`);
console.log('  rank | nombre normalizado                        | filas |  subtotal $   | sample original');
for (let i = 0; i < Math.min(20, unmatchedVentas.length); i++) {
  const u = unmatchedVentas[i];
  console.log(`  ${String(i + 1).padStart(4)} | ${u.norm.padEnd(40).slice(0, 40)} | ${String(u.count).padStart(5)} | ${u.subtotal.toFixed(2).padStart(13)} | "${[...u.originals][0]}"`);
}

// ─── 4. Pull cxc_rows ───
console.log(`\n=== CXC_ROWS ===`);
const cxcMap = new Map(); // (company_key + norm) → ...
let coff = 0;
while (true) {
  const { data, error } = await supa
    .from('cxc_rows')
    .select('company_key, codigo, nombre_normalized, total')
    .range(coff, coff + PAGE - 1);
  if (error) { console.error(error); process.exit(1); }
  if (!data || data.length === 0) break;
  for (const r of data) {
    const norm = normalize(r.nombre_normalized);
    const key = `${r.company_key}|${norm}`;
    const e = cxcMap.get(key) ?? { norm, company_key: r.company_key, codigo: r.codigo, count: 0, total: 0 };
    e.count++;
    e.total += Number(r.total) || 0;
    cxcMap.set(key, e);
  }
  if (data.length < PAGE) break;
  coff += PAGE;
}
console.log(`Filas cxc_rows: ${[...cxcMap.values()].reduce((a, b) => a + b.count, 0)}`);
console.log(`(company_key, nombre) únicos: ${cxcMap.size}`);

// distinct nombre_normalized (across all companies)
const cxcNombresUnicos = new Set([...cxcMap.values()].map((e) => e.norm));
console.log(`Nombres normalizados únicos (todas empresas): ${cxcNombresUnicos.size}`);

// match by nombre_normalized — only B2B keys (master only applies to B2B)
const cxcB2B = [...cxcMap.values()].filter((e) => B2B_KEYS.includes(e.company_key));
console.log(`\nCXC filas B2B: ${cxcB2B.reduce((a, b) => a + b.count, 0)}`);
console.log(`CXC nombres únicos B2B: ${new Set(cxcB2B.map((e) => e.norm)).size}`);

let cxcMatched = 0;
const cxcUnmatched = [];
for (const e of cxcB2B) {
  if (masterByNorm.has(e.norm)) {
    cxcMatched++;
  } else {
    cxcUnmatched.push(e);
  }
}
console.log(`Match contra master (B2B): ${cxcMatched} / ${cxcB2B.length}  (${(cxcMatched / cxcB2B.length * 100).toFixed(1)}%)`);

cxcUnmatched.sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
console.log(`\nHuérfanos en cxc_rows B2B (todos, ordenados por |total|):`);
console.log('  rank | empresa               | codigo | nombre                                   | $');
for (let i = 0; i < cxcUnmatched.length; i++) {
  const u = cxcUnmatched[i];
  console.log(`  ${String(i + 1).padStart(4)} | ${u.company_key.padEnd(20)} | ${(u.codigo || '').padEnd(6)} | ${u.norm.padEnd(40).slice(0, 40)} | ${u.total.toFixed(2)}`);
}

// Also: CXC retail (boston, american_classic) — solo informativo
const cxcRetail = [...cxcMap.values()].filter((e) => !B2B_KEYS.includes(e.company_key));
console.log(`\nNota: ${cxcRetail.length} filas en cxc_rows son de empresas RETAIL (boston/american_classic), excluidas del match.`);

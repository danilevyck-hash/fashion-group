// Cliente 360 — exporta 3 CSVs read-only para análisis maestro.
// Q1: clientes_master (167 filas)
// Q2: ventas agregadas por (nombre_norm, empresa B2B)
// Q3: saldo CxC por (nombre_normalized, company_key) con total > 0
// Output: /tmp/c360-master.csv, /tmp/c360-ventas.csv, /tmp/c360-cxc.csv

import { readFileSync, writeFileSync } from 'node:fs';
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

// ── Helpers ──────────────────────────────────────────────────────────────────

// CSV escape: si tiene comma, quote o newline, envolver en quotes y escapar quotes.
function csvCell(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
function toCsv(headers, rows) {
  const lines = [headers.join(',')];
  for (const row of rows) lines.push(headers.map(h => csvCell(row[h])).join(','));
  return lines.join('\n') + '\n';
}

// Replica del UPPER(REGEXP_REPLACE(REGEXP_REPLACE(cliente, '[.,]', '', 'g'), '\s+', ' ', 'g'))
function normCliente(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/[.,]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

async function paginate(table, selectCols, applyFilters) {
  const pageSize = 1000;
  let p = 0;
  const out = [];
  while (true) {
    let q = supa.from(table).select(selectCols).range(p * pageSize, p * pageSize + pageSize - 1);
    if (applyFilters) q = applyFilters(q);
    const { data, error } = await q;
    if (error) throw new Error(`[${table}] ${error.message}`);
    if (!data || data.length === 0) break;
    out.push(...data);
    if (data.length < pageSize) break;
    p++;
  }
  return out;
}

// ── Q1: clientes_master ──────────────────────────────────────────────────────

console.log('Q1: clientes_master...');
const masterRows = await paginate(
  'clientes_master',
  'codigo, nombre, nombre_normalized, razon_social, tipo_cliente, identificacion, incluir_en_ventas, fecha_creacion, deleted',
  (q) => q.eq('deleted', false).order('codigo', { ascending: true })
);
const masterHeaders = ['codigo','nombre','nombre_normalized','razon_social','tipo_cliente','identificacion','incluir_en_ventas','fecha_creacion'];
const masterFiltered = masterRows.map(r => Object.fromEntries(masterHeaders.map(h => [h, r[h]])));
writeFileSync('/tmp/c360-master.csv', toCsv(masterHeaders, masterFiltered));
console.log(`  → /tmp/c360-master.csv (${masterFiltered.length} filas)`);

// ── Q2: ventas agregadas por (nombre_norm, empresa) ──────────────────────────

console.log('Q2: ventas_raw aggregation...');
const empresasB2B = new Set(['vistana','fashion_wear','fashion_shoes','active_shoes','active_wear','joystep']);

// Paginar ventas_raw filtrando empresa in (...) y cliente no vacío
// Hacemos una query por empresa para no exceder URL limits
const ventasAcc = new Map(); // key = `${nombre_norm}|${empresa}` → agregado

const today = new Date();
const cutoff12mo = new Date(today.getFullYear(), today.getMonth() - 12, today.getDate());
const cutoffStr = cutoff12mo.toISOString().slice(0, 10); // YYYY-MM-DD

for (const empresa of empresasB2B) {
  console.log(`  empresa=${empresa}...`);
  let p = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supa
      .from('ventas_raw')
      .select('cliente, empresa, fecha, subtotal')
      .eq('empresa', empresa)
      .not('cliente', 'is', null)
      .neq('cliente', '')
      .range(p * pageSize, p * pageSize + pageSize - 1);
    if (error) throw new Error(`[ventas_raw ${empresa}] ${error.message}`);
    if (!data || data.length === 0) break;
    for (const r of data) {
      const norm = normCliente(r.cliente);
      if (!norm) continue;
      const key = `${norm}|${r.empresa}`;
      let agg = ventasAcc.get(key);
      if (!agg) {
        agg = { nombre_norm: norm, empresa: r.empresa, filas: 0, total_ventas: 0, primera_venta: null, ultima_venta: null, filas_12mo: 0, ventas_12mo: 0 };
        ventasAcc.set(key, agg);
      }
      const sub = Number(r.subtotal) || 0;
      agg.filas++;
      agg.total_ventas += sub;
      if (r.fecha) {
        if (!agg.primera_venta || r.fecha < agg.primera_venta) agg.primera_venta = r.fecha;
        if (!agg.ultima_venta || r.fecha > agg.ultima_venta) agg.ultima_venta = r.fecha;
        if (r.fecha >= cutoffStr) {
          agg.filas_12mo++;
          agg.ventas_12mo += sub;
        }
      }
    }
    if (data.length < pageSize) break;
    p++;
  }
}

const ventasOut = [...ventasAcc.values()]
  .map(a => ({
    ...a,
    total_ventas: a.total_ventas.toFixed(2),
    ventas_12mo: a.ventas_12mo.toFixed(2),
  }))
  .sort((a, b) => (a.nombre_norm + a.empresa).localeCompare(b.nombre_norm + b.empresa));
const ventasHeaders = ['nombre_norm','empresa','filas','total_ventas','primera_venta','ultima_venta','filas_12mo','ventas_12mo'];
writeFileSync('/tmp/c360-ventas.csv', toCsv(ventasHeaders, ventasOut));
console.log(`  → /tmp/c360-ventas.csv (${ventasOut.length} filas)`);

// ── Q3: saldo CxC por (nombre_normalized, company_key), total > 0 ────────────

console.log('Q3: cxc_rows aggregation...');
const cxcRows = await paginate(
  'cxc_rows',
  'nombre_normalized, company_key, total',
  (q) => q.gt('total', 0)
);

const cxcAcc = new Map();
for (const r of cxcRows) {
  const norm = r.nombre_normalized || '';
  if (!norm) continue;
  const key = `${norm}|${r.company_key}`;
  let agg = cxcAcc.get(key);
  if (!agg) {
    agg = { nombre_norm: norm, empresa: r.company_key, saldo: 0 };
    cxcAcc.set(key, agg);
  }
  agg.saldo += Number(r.total) || 0;
}

const cxcOut = [...cxcAcc.values()]
  .map(a => ({ ...a, saldo: a.saldo.toFixed(2) }))
  .sort((a, b) => (a.nombre_norm + a.empresa).localeCompare(b.nombre_norm + b.empresa));
const cxcHeaders = ['nombre_norm','empresa','saldo'];
writeFileSync('/tmp/c360-cxc.csv', toCsv(cxcHeaders, cxcOut));
console.log(`  → /tmp/c360-cxc.csv (${cxcOut.length} filas)`);

// ── Stats ────────────────────────────────────────────────────────────────────

const masterUnique = new Set(masterFiltered.map(r => r.nombre_normalized).filter(Boolean));
const ventasUnique = new Set(ventasOut.map(r => r.nombre_norm));
const cxcUnique    = new Set(cxcOut.map(r => r.nombre_norm));
const union = new Set([...masterUnique, ...ventasUnique, ...cxcUnique]);

console.log('\n=== STATS ===');
console.log(`master CSV filas:           ${masterFiltered.length}`);
console.log(`ventas CSV filas:           ${ventasOut.length}`);
console.log(`cxc CSV filas:              ${cxcOut.length}`);
console.log(`clientes únicos master:     ${masterUnique.size}`);
console.log(`clientes únicos ventas:     ${ventasUnique.size}`);
console.log(`clientes únicos cxc:        ${cxcUnique.size}`);
console.log(`clientes únicos UNIÓN(3):   ${union.size}`);

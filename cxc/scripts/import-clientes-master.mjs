// Imports the 168 master clients from data/listaclientes_master.csv into clientes_master.
// Run with: node scripts/import-clientes-master.mjs
//
// Reads:  data/listaclientes_master.csv (Switch Soft export, semicolon-delimited, UTF-8)
// Writes: clientes_master table in Supabase (requires SUPABASE_SERVICE_ROLE_KEY in .env.local)
//
// Normalize rule (N2): UPPER + remove [.,] + collapse whitespace.
// Duplicates by normalized name: log both codigos, skip the 2nd row.
// incluir_en_ventas: true for Contribuyente, false for Consumidor Final.

import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const MASTER_CSV = '/Users/daniellevy/Code/fashion-group/cxc/data/listaclientes_master.csv';
const ENV_PATH   = '/Users/daniellevy/Code/fashion-group/cxc/.env.local';

// ─── Helpers ───
const N2 = (s) =>
  (s ?? '').trim().toUpperCase().replace(/[.,]/g, '').replace(/\s+/g, ' ').trim();

const cleanText = (s) => {
  const v = (s ?? '').trim();
  return v === '' ? null : v;
};

const cleanNumber = (s) => {
  const v = (s ?? '').trim();
  if (v === '') return null;
  const n = parseFloat(v.replace(/,/g, ''));
  return isNaN(n) ? null : n;
};

// "2022-10-27 14:45:38" → "2022-10-27"; empty/invalid → null
const cleanDate = (s) => {
  const v = (s ?? '').trim();
  if (v === '') return null;
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
};

// IDENTIFICACION + DV → "ruc-dv"; if either is empty, return whatever's there or null
const buildIdentificacion = (id, dv) => {
  const i = (id ?? '').trim();
  const d = (dv ?? '').trim();
  if (i && d) return `${i}-${d}`;
  if (i) return i;
  if (d) return d;
  return null;
};

function parseCSV(text) {
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

// ─── Load env ───
const env = readFileSync(ENV_PATH, 'utf-8');
const vars = Object.fromEntries(
  env.split('\n').filter((l) => l && !l.startsWith('#')).map((l) => {
    const i = l.indexOf('=');
    return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
  }),
);
const URL = vars.NEXT_PUBLIC_SUPABASE_URL;
const KEY = vars.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) {
  console.error('Falta NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local');
  process.exit(1);
}
const supa = createClient(URL, KEY, { auth: { persistSession: false } });

// ─── Verify destination table exists ───
{
  const { error } = await supa.from('clientes_master').select('id').limit(1);
  if (error) {
    console.error('No se pudo acceder a clientes_master:', error.message);
    console.error('Primero corre supabase/migrations/clientes-master.sql en el SQL Editor.');
    process.exit(1);
  }
}

// ─── Parse CSV ───
const csvText = readFileSync(MASTER_CSV, 'utf-8');
const { rows: csvRows } = parseCSV(csvText);
console.log(`CSV: ${csvRows.length} filas leídas\n`);

// ─── Map + dedupe by normalized name ───
const byNorm = new Map(); // norm → { csvRow, codigo }
const dupes = []; // { norm, firstCodigo, skippedCodigo }

for (const r of csvRows) {
  const nombre = r['NOMBRE'];
  const norm = N2(nombre);
  if (!norm) {
    console.warn(`Saltando fila con NOMBRE vacío (CODIGO=${r['CODIGO']})`);
    continue;
  }
  if (byNorm.has(norm)) {
    const first = byNorm.get(norm);
    dupes.push({ norm, firstCodigo: first.codigo, skippedCodigo: r['CODIGO'] });
    continue;
  }
  byNorm.set(norm, { csvRow: r, codigo: r['CODIGO'] });
}

if (dupes.length > 0) {
  console.log('⚠️  Duplicados normalizados detectados (se salta el segundo):');
  for (const d of dupes) {
    console.log(`   "${d.norm}" — primer CODIGO=${d.firstCodigo}, saltado=${d.skippedCodigo}`);
  }
  console.log();
}

// ─── Build insert payload ───
const tipoCount = { Contribuyente: 0, 'Consumidor Final': 0, otro: 0 };
const payload = [];
for (const { csvRow: r } of byNorm.values()) {
  const tipo_cliente = cleanText(r['TIPO CLIENTE']);
  if (tipo_cliente === 'Contribuyente') tipoCount.Contribuyente++;
  else if (tipo_cliente === 'Consumidor Final') tipoCount['Consumidor Final']++;
  else tipoCount.otro++;

  payload.push({
    codigo: cleanText(r['CODIGO']),
    nombre: cleanText(r['NOMBRE']),
    nombre_normalized: N2(r['NOMBRE']),
    razon_social: cleanText(r['RAZON SOCIAL']),
    identificacion: buildIdentificacion(r['IDENTIFICACION'], r['DV']),
    tipo_cliente,
    correo: cleanText(r['CORREO']),
    telefono: cleanText(r['TELEFONO']),
    celular: cleanText(r['CELULAR']),
    whatsapp: null, // no hay columna WhatsApp en el CSV; queda NULL
    provincia: cleanText(r['PROVINCIA']),
    distrito: cleanText(r['DISTRITO']),
    corregimiento: cleanText(r['CORREGIMIENTO']),
    limite_credito: cleanNumber(r['LIMITE CREDITO']),
    fecha_creacion: cleanDate(r['FECHA CREACION']),
    incluir_en_ventas: tipo_cliente === 'Contribuyente',
  });
}

console.log(`Para insertar: ${payload.length} filas`);
console.log(`  Contribuyente:    ${tipoCount.Contribuyente}`);
console.log(`  Consumidor Final: ${tipoCount['Consumidor Final']}`);
if (tipoCount.otro > 0) console.log(`  Otro/desconocido: ${tipoCount.otro}`);
console.log();

// ─── Insert in batches of 500 ───
const BATCH = 500;
let inserted = 0;
let errors = 0;
const errorMsgs = [];

for (let i = 0; i < payload.length; i += BATCH) {
  const slice = payload.slice(i, i + BATCH);
  const { data, error } = await supa.from('clientes_master').insert(slice).select('id');
  if (error) {
    errors += slice.length;
    errorMsgs.push(`batch [${i}..${i + slice.length}): ${error.code} ${error.message}`);
    continue;
  }
  inserted += data?.length ?? 0;
}

console.log(`✅ Insertados: ${inserted}`);
if (errors > 0) {
  console.log(`❌ Errores: ${errors}`);
  for (const m of errorMsgs) console.log('   ' + m);
  process.exit(1);
}

// ─── Verify final count ───
const { count } = await supa.from('clientes_master').select('*', { count: 'exact', head: true });
console.log(`\nTotal en clientes_master: ${count}`);

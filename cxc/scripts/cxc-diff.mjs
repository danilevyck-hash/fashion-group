import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import os from 'os';

const sb = createClient(
  'https://rspocgqhtpveytgbtler.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJzcG9jZ3FodHB2ZXl0Z2J0bGVyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDE1Njk0MCwiZXhwIjoyMDg5NzMyOTQwfQ.hP6t1MYR5wcGJj6L97B-qe2WgfTiDUmAi5VbOXOjjns',
  { auth: { persistSession: false } }
);

const HOME = os.homedir();
const MAP = [
  { csv: path.join(HOME, 'Downloads/antiguedad_1_16042026013316.csv'), empresa: 'vistana' },
  { csv: path.join(HOME, 'Downloads/antiguedad_2_16042026013322.csv'), empresa: 'fashion_shoes' },
  { csv: path.join(HOME, 'Downloads/antiguedad_1_16042026013330.csv'), empresa: 'fashion_wear' },
  { csv: path.join(HOME, 'Downloads/antiguedad_1_16042026013336.csv'), empresa: 'active_shoes' },
  { csv: path.join(HOME, 'Downloads/antiguedad_1_16042026013342.csv'), empresa: 'active_wear' },
];

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
  const header = lines[0].split(';').map(h => h.trim().replace(/\s+/g, ' '));
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(';').map(c => c.trim());
    const r = {};
    header.forEach((h, idx) => { r[h] = cols[idx] ?? ''; });
    r._raw = lines[i];
    rows.push(r);
  }
  return { header, rows };
}

// replicate the JUNK filter from src/app/upload/page.tsx
function isJunk(nombre) {
  if (!nombre) return true;
  if (/^\d[\d.,\s-]*$/.test(nombre)) return true;
  if (/^\d+-\d+$/.test(nombre)) return true;
  if (/^Mas\s+de/i.test(nombre)) return true;
  if (/^Total$/i.test(nombre)) return true;
  return false;
}

function parseNum(v) {
  if (!v) return 0;
  const n = parseFloat(String(v).replace(/,/g, '').replace(/\s/g, ''));
  return isNaN(n) ? 0 : n;
}

(async () => {
  for (const { csv, empresa } of MAP) {
    console.log('\n==================== ' + empresa + ' ====================');
    console.log('CSV: ' + csv);
    const text = fs.readFileSync(csv, 'utf8');
    // try latin-1 fallback if replacement chars
    let finalText = text.includes('\uFFFD') ? fs.readFileSync(csv, 'latin1') : text;

    const { header, rows: csvRowsRaw } = parseCsv(finalText);
    const totalLinesRead = csvRowsRaw.length;

    // classify each csv row
    const keptCsvRows = [];
    const filteredCsvRows = [];
    for (const r of csvRowsRaw) {
      const nombre = (r['NOMBRE'] || '').trim();
      if (isJunk(nombre)) filteredCsvRows.push(r);
      else keptCsvRows.push(r);
    }

    const csvTotalSum = keptCsvRows.reduce((s, r) => s + parseNum(r['TOTAL']), 0);

    // fetch DB rows
    const { data: dbRows, error } = await sb
      .from('cxc_rows')
      .select('codigo, nombre, total')
      .eq('company_key', empresa);
    if (error) { console.log('DB ERROR:', error.message); continue; }

    const dbCodes = new Set(dbRows.map(r => (r.codigo ?? '').trim()));
    const dbTotal = dbRows.reduce((s, r) => s + Number(r.total || 0), 0);

    console.log('CSV lineas totales (sin vacias):', totalLinesRead);
    console.log('CSV filas junk (filtradas por regex):', filteredCsvRows.length);
    console.log('CSV filas que pasarian el filtro:', keptCsvRows.length);
    console.log('CSV suma TOTAL (filas que pasan):', csvTotalSum.toFixed(2));
    console.log('DB filas actuales:', dbRows.length);
    console.log('DB suma TOTAL actuales:', dbTotal.toFixed(2));
    console.log('DIFF filas (CSV_kept - DB):', keptCsvRows.length - dbRows.length);
    console.log('DIFF total (CSV_kept - DB):', (csvTotalSum - dbTotal).toFixed(2));

    console.log('\n--- filas JUNK filtradas por regex ---');
    for (const r of filteredCsvRows) console.log(' ', r._raw);

    // 3. codigos en CSV pero NO en DB
    const missingInDb = keptCsvRows.filter(r => !dbCodes.has((r['CODIGO'] || '').trim()));
    console.log('\n--- Codigos en CSV (post-filtro) pero NO en DB: ' + missingInDb.length + ' ---');
    for (const r of missingInDb) {
      console.log(' ', r._raw);
    }
    const missingTotal = missingInDb.reduce((s, r) => s + parseNum(r['TOTAL']), 0);
    console.log('Suma TOTAL de filas faltantes: ' + missingTotal.toFixed(2));

    // 3b. codigos en DB pero NO en CSV
    const csvCodes = new Set(keptCsvRows.map(r => (r['CODIGO'] || '').trim()));
    const inDbNotCsv = dbRows.filter(r => !csvCodes.has((r.codigo || '').trim()));
    console.log('\n--- Codigos en DB pero NO en CSV: ' + inDbNotCsv.length + ' ---');
    for (const r of inDbNotCsv) console.log(' codigo=' + r.codigo + ' | nombre=' + r.nombre + ' | total=' + r.total);

    // 1. DB listado ordenado
    const dbList = [...dbRows].map(r => (r.codigo || '').trim())
      .sort((a, b) => {
        const na = parseInt(a, 10), nb = parseInt(b, 10);
        if (!isNaN(na) && !isNaN(nb)) return na - nb;
        return a.localeCompare(b);
      });
    console.log('\n--- 1. DB codigos (ordenados): ' + dbList.length + ' ---');
    console.log('  ' + dbList.join(', '));

    // 2. CSV listado ordenado
    const csvList = keptCsvRows.map(r => (r['CODIGO'] || '').trim())
      .sort((a, b) => {
        const na = parseInt(a, 10), nb = parseInt(b, 10);
        if (!isNaN(na) && !isNaN(nb)) return na - nb;
        return a.localeCompare(b);
      });
    console.log('\n--- 2. CSV codigos post-filtro (ordenados): ' + csvList.length + ' ---');
    console.log('  ' + csvList.join(', '));
  }
})();

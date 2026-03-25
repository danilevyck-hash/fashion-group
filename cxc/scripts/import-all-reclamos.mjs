import XLSX from 'xlsx';
import path from 'path';

const FILE = path.join(process.env.HOME || '~', 'Downloads', 'PLANTILLA RECLAMOS  COMPAÑIAS.xlsx');
const API = 'https://fashiongr.com/api/reclamos';

const SHEET_MAP = {
  'VISTANA': { empresa: 'Vistana International', proveedor: 'American Designer Fashion', marca: 'Calvin Klein' },
  'FASHION SHOES': { empresa: 'Fashion Shoes', proveedor: 'American Fashion Wear', marca: 'Tommy Hilfiger' },
  'FASHION WEAR': { empresa: 'Fashion Wear', proveedor: 'American Fashion Wear', marca: 'Tommy Hilfiger' },
};

function normalizeMotivo(m) {
  if (!m) return 'Mercancía Dañada';
  const u = m.toUpperCase().trim();
  if (/MANCHAD|MANCHADO|AMARILL/.test(u)) return 'Mercancía Manchada';
  if (/FALTANTE|FALTO|FALTARON|MERCANCIA FALTANTE/.test(u)) return 'Faltante de Mercancía';
  if (/ROTO|DEFECTUO|DESPEGA|PELAN|PELADA|TELA DEFEC/.test(u)) return 'Mercancía Defectuosa';
  if (/SOBRANTE|DE MAS|PIEZA DE MAS/.test(u)) return 'Sobrante de Mercancía';
  if (/INCORRECT/.test(u)) return 'Mercancía Incorrecta';
  if (/DISCREP|PRECIO/.test(u)) return 'Discrepancia de Precio';
  return 'Mercancía Dañada';
}

function parseDate(val) {
  if (!val) return '';
  // Excel serial date number
  if (typeof val === 'number') {
    const d = XLSX.SSF.parse_date_code(val);
    if (d) return `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`;
  }
  const s = String(val).trim();
  // DD/MM/YYYY or D/M/YYYY
  let m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  // DD-M-YYYY
  m = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  return '';
}

function parsePrice(val) {
  if (typeof val === 'number') return val;
  if (!val) return 0;
  return parseFloat(String(val).replace(/[^0-9.]/g, '')) || 0;
}

function isHeaderRow(row) {
  const joined = row.map(c => String(c || '').toUpperCase()).join(' ');
  return joined.includes('FECHA') && (joined.includes('FACTURA') || joined.includes('REFERENCIA'));
}

function isTotalRow(row) {
  const joined = row.map(c => String(c || '').toUpperCase().trim()).join(' ');
  return /SUBTOTAL|IMPORTACI|ITBMS|^TOTAL|TOTAL EN/.test(joined);
}

function isEmpty(row) {
  return row.every(c => !c && c !== 0);
}

function parseSheet(ws, info) {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  const reclamos = new Map(); // factura -> reclamo
  let headerCols = null; // detected column mapping for current block

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (isEmpty(row)) { headerCols = null; continue; }
    if (isTotalRow(row)) continue;

    // Detect header row
    if (isHeaderRow(row)) {
      headerCols = detectColumns(row);
      continue;
    }

    // Skip non-data rows (RECLAMO #, summary rows, etc.)
    const rowUpper = row.map(c => String(c || '').toUpperCase()).join(' ');
    if (rowUpper.includes('RECLAMO #') || rowUpper.includes('RECLAMO 1') || rowUpper.includes('DETALLE')) continue;

    // Find data: need a factura and referencia
    if (!headerCols) {
      // Try auto-detect from this row
      headerCols = guessColumns(row);
      if (!headerCols) continue;
    }

    const fecha = parseDate(row[headerCols.fecha]);
    const factura = String(row[headerCols.factura] || '').trim();
    const referencia = String(row[headerCols.referencia] || '').trim();

    if (!factura || !referencia) continue;
    // Skip if factura looks like a header
    if (/FACTURA|FECHA/i.test(factura)) continue;

    const cantidad = parseInt(row[headerCols.cantidad]) || 1;
    const precio = parsePrice(row[headerCols.precio]);
    const motivo = normalizeMotivo(String(row[headerCols.motivo] || ''));
    const comentarios = String(row[headerCols.comentarios] || '').trim();
    const descripcion = headerCols.descripcion !== undefined ? String(row[headerCols.descripcion] || '').trim() : '';
    const talla = headerCols.talla !== undefined ? String(row[headerCols.talla] || '').trim() : '';

    if (!reclamos.has(factura)) {
      reclamos.set(factura, {
        ...info,
        nro_factura: factura,
        nro_orden_compra: '',
        fecha_reclamo: fecha || '2025-01-01',
        estado: 'Enviado',
        notas: comentarios,
        items: [],
      });
    }

    const rec = reclamos.get(factura);
    if (fecha && !rec.fecha_reclamo) rec.fecha_reclamo = fecha;
    if (comentarios && !rec.notas) rec.notas = comentarios;

    rec.items.push({ referencia, descripcion, talla, cantidad, precio_unitario: precio, motivo });
  }

  return Array.from(reclamos.values()).filter(r => r.items.length > 0);
}

function detectColumns(headerRow) {
  const cols = {};
  for (let i = 0; i < headerRow.length; i++) {
    const h = String(headerRow[i] || '').toUpperCase().trim();
    if (h.includes('FECHA')) cols.fecha = i;
    else if (h.includes('FACTURA') || h.includes('TRANSPORTE')) cols.factura = i;
    else if (h.includes('REFERENCIA')) cols.referencia = i;
    else if (h.includes('DESCRIPCION')) cols.descripcion = i;
    else if (h === 'TALLA' || h === 'TALLA:' || h === 'TALLA: ') cols.talla = i;
    else if (h.includes('CANTIDAD')) cols.cantidad = i;
    else if (h.includes('PRECIO')) cols.precio = i;
    else if (h.includes('MOTIVO')) cols.motivo = i;
    else if (h.includes('COMENTARIO')) cols.comentarios = i;
  }
  if (cols.fecha !== undefined && cols.factura !== undefined && cols.referencia !== undefined) return cols;
  return null;
}

function guessColumns(row) {
  // VISTANA format: [rowNum, fecha, factura, referencia, ...rest]
  // Try: if col 0 is a number and col 1 has a date and col 2 looks like a factura
  if (typeof row[0] === 'number' || row[0] === '') {
    const dateVal = row[1];
    const factVal = row[2];
    if ((typeof dateVal === 'number' || (typeof dateVal === 'string' && dateVal.includes('-'))) && factVal) {
      // Could be VISTANA: _, fecha, factura, ref, [desc|talla], cantidad, precio, motivo, comentarios
      return { fecha: 1, factura: 2, referencia: 3, descripcion: 4, cantidad: 5, precio: 6, motivo: 7, comentarios: 8 };
    }
  }
  return null;
}

// ── Main ──

console.log('Reading:', FILE);
const wb = XLSX.readFile(FILE);

// First: cleanup test reclamos
console.log('\n--- Checking for test reclamos to clean up ---');
try {
  const res = await fetch(API);
  if (res.ok) {
    const existing = await res.json();
    if (Array.isArray(existing)) {
      const testFacts = new Set(['2', '4', '77', '998', 'RECLAMO #25 WALLET PELADAS']);
      const toDelete = existing.filter(r =>
        testFacts.has(r.nro_factura) ||
        (r.reclamo_items || []).length === 0
      );
      for (const r of toDelete) {
        const del = await fetch(`${API}/${r.id}`, { method: 'DELETE' });
        console.log(del.ok ? `  Deleted ${r.nro_reclamo} (${r.nro_factura})` : `  Failed to delete ${r.nro_reclamo}`);
      }
      if (toDelete.length === 0) console.log('  No test reclamos found.');
      else console.log(`  Cleaned ${toDelete.length} test reclamos.`);
    }
  }
} catch (e) {
  console.log('  Cleanup skipped:', e.message);
}

let totalOk = 0, totalErr = 0;

for (const [sheetName, info] of Object.entries(SHEET_MAP)) {
  const ws = wb.Sheets[sheetName];
  if (!ws) { console.log(`\nSheet "${sheetName}" not found, skipping.`); continue; }

  const reclamos = parseSheet(ws, info);
  console.log(`\n${sheetName}: ${reclamos.length} reclamos, ${reclamos.reduce((s, r) => s + r.items.length, 0)} items total`);

  for (const reclamo of reclamos) {
    try {
      const res = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reclamo),
      });
      const data = await res.json();
      if (res.ok) {
        console.log(`  ✓ ${data.nro_reclamo} — Factura ${reclamo.nro_factura} — ${reclamo.items.length} ítems`);
        totalOk++;
      } else {
        console.log(`  ✗ Factura ${reclamo.nro_factura}: ${data.error}`);
        totalErr++;
      }
    } catch (e) {
      console.log(`  ✗ Factura ${reclamo.nro_factura}: ${e.message}`);
      totalErr++;
    }
  }
}

console.log(`\n=== Total: ${totalOk} importados, ${totalErr} errores ===`);

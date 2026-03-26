import { createRequire } from 'module';
import path from 'path';
import os from 'os';
const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

const FILE = path.join(os.homedir(), 'Downloads', 'PLANTILLA RECLAMOS  COMPAÑIAS.xlsx');
const API = 'https://fashiongr.com/api/reclamos';

const SHEET_INFO = {
  'VISTANA': { empresa: 'Vistana International', proveedor: 'American Designer Fashion', marca: 'Calvin Klein' },
  'FASHION SHOES': { empresa: 'Fashion Shoes', proveedor: 'American Fashion Wear', marca: 'Tommy Hilfiger' },
  'FASHION WEAR': { empresa: 'Fashion Wear', proveedor: 'American Fashion Wear', marca: 'Tommy Hilfiger' },
};

function parseDate(val) {
  if (!val) return new Date().toISOString().slice(0, 10);
  if (typeof val === 'number') { const d = XLSX.SSF.parse_date_code(val); return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`; }
  const s = String(val).trim();
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m) { const y = m[3].length === 2 ? '20' + m[3] : m[3]; return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; }
  return new Date().toISOString().slice(0, 10);
}

function parsePrice(val) {
  if (!val) return 0;
  return parseFloat(String(val).replace(/[^0-9.]/g, '')) || 0;
}

function normalizeMotivo(m) {
  if (!m) return 'Mercancía Dañada';
  const u = String(m).toUpperCase();
  if (/MANCHA|PELAD|AMARILL|SUCI/.test(u)) return 'Mercancía Manchada';
  if (/FALTANTE|FALTO|NOS FALTO|FALTARON/.test(u)) return 'Faltante de Mercancía';
  if (/ROTO|DEFECTU|DESPEGA|PELAN|TELA/.test(u)) return 'Mercancía Defectuosa';
  if (/SOBRANTE|DE MAS|LLEGO.*MAS/.test(u)) return 'Sobrante de Mercancía';
  if (/INCORRECT/.test(u)) return 'Mercancía Incorrecta';
  return 'Mercancía Dañada';
}

function isHeaderRow(row) {
  const upper = row.map(v => String(v || '').toUpperCase().trim());
  return upper.some(v => v.includes('FECHA')) && upper.some(v => v.includes('FACTURA') || v.includes('REFERENCIA') || v.includes('TRANSPORTE'));
}

function isTotalRow(row) {
  const joined = row.map(v => String(v || '').toUpperCase().trim()).join(' ');
  return /SUBTOTAL|IMPORTACI|ITBMS|\bTOTAL\b/.test(joined);
}

function isEmpty(row) {
  return row.every(v => !v || String(v).trim() === '');
}

function isReclamoMarker(row) {
  const joined = row.filter(v => v && String(v).trim()).map(v => String(v)).join(' ');
  return /^RECLAMO\s+\d+$/i.test(joined.trim());
}

function detectCols(headerRow) {
  const upper = headerRow.map(v => String(v || '').toUpperCase().trim());
  const cols = {};
  for (let i = 0; i < upper.length; i++) {
    const h = upper[i];
    if (h.includes('FECHA')) cols.fecha = i;
    else if (h.includes('FACTURA') || h.includes('TRANSPORTE')) cols.factura = i;
    else if (h.includes('REFERENCIA')) cols.referencia = i;
    else if (h.includes('DESCRIPCION') || h.includes('DETALLE')) cols.descripcion = i;
    else if (h === 'TALLA' || h === 'TALLA:' || h === 'TALLA: ') cols.talla = i;
    else if (h.includes('CANTIDAD') || h === 'CANT') cols.cantidad = i;
    else if (h.includes('PRECIO')) cols.precio = i;
    else if (h.includes('MOTIVO')) cols.motivo = i;
    else if (h.includes('COMENTARIO')) cols.comentarios = i;
  }
  return cols;
}

// ── Parse VISTANA (has RECLAMO markers) ──
function parseVistana(ws, info) {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false });
  const reclamos = [];
  let currentBlock = null; // { items, facturas, fecha, notas }
  let cols = {};

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];

    if (isReclamoMarker(row)) {
      // Save previous block
      if (currentBlock && currentBlock.items.length > 0) {
        reclamos.push(buildReclamo(currentBlock, info));
      }
      currentBlock = { items: [], facturas: new Set(), fecha: '', notas: '' };
      continue;
    }

    if (isEmpty(row) || isTotalRow(row)) continue;

    // Check for sub-block header (number in col 0 + FECHA in cols)
    const first = String(row[0] || '').trim();
    if (/^\d+$/.test(first) && isHeaderRow(row)) {
      cols = detectCols(row);
      continue;
    }

    // Also detect standalone headers (no number prefix)
    if (isHeaderRow(row)) {
      cols = detectCols(row);
      continue;
    }

    if (!cols.factura && cols.factura !== 0) continue;
    if (!currentBlock) currentBlock = { items: [], facturas: new Set(), fecha: '', notas: '' };

    const fecha = row[cols.fecha];
    const factura = String(row[cols.factura] || '').trim();
    const ref = cols.referencia >= 0 ? String(row[cols.referencia] || '').trim() : '';

    if (!factura || !ref) continue;

    if (fecha) currentBlock.fecha = currentBlock.fecha || parseDate(fecha);
    currentBlock.facturas.add(factura);
    if (cols.comentarios >= 0 && row[cols.comentarios]) currentBlock.notas = String(row[cols.comentarios]).trim();

    currentBlock.items.push({
      referencia: ref,
      descripcion: cols.descripcion >= 0 ? String(row[cols.descripcion] || '').trim() : '',
      talla: cols.talla >= 0 ? String(row[cols.talla] || '').trim() : '',
      cantidad: parseInt(String(row[cols.cantidad] || '1')) || 1,
      precio_unitario: parsePrice(row[cols.precio]),
      motivo: normalizeMotivo(cols.motivo >= 0 ? row[cols.motivo] : ''),
    });
  }

  // Don't forget last block
  if (currentBlock && currentBlock.items.length > 0) {
    reclamos.push(buildReclamo(currentBlock, info));
  }

  return reclamos;
}

// ── Parse FASHION SHOES / FASHION WEAR (header-delimited blocks) ──
function parseBlocks(ws, info) {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false });
  const reclamos = [];
  let currentBlock = null;
  let cols = {};

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];

    // Skip the summary row at top of FASHION WEAR (FECHA | DETALLE | MONTO)
    const upper0 = String(row[0] || '').toUpperCase().trim();
    if (upper0 === 'FECHA' && String(row[1] || '').toUpperCase().includes('DETALLE')) continue;

    // Skip the RECLAMO #25 summary row
    if (row.some(v => /RECLAMO\s*#/i.test(String(v || '')))) continue;

    if (isHeaderRow(row)) {
      // Save previous block
      if (currentBlock && currentBlock.items.length > 0) {
        reclamos.push(buildReclamo(currentBlock, info));
      }
      currentBlock = { items: [], facturas: new Set(), fecha: '', notas: '' };
      cols = detectCols(row);
      continue;
    }

    if (isEmpty(row) || isTotalRow(row)) continue;
    if (!currentBlock || !cols.factura && cols.factura !== 0) continue;

    const fecha = row[cols.fecha];
    const factura = String(row[cols.factura] || '').trim();
    const ref = cols.referencia >= 0 ? String(row[cols.referencia] || '').trim() : '';

    if (!factura || !ref) continue;

    // Skip "TOTAL EN N/C" rows
    if (/TOTAL EN/i.test(factura + ref)) continue;

    if (fecha) currentBlock.fecha = currentBlock.fecha || parseDate(fecha);
    currentBlock.facturas.add(factura);
    if (cols.comentarios >= 0 && row[cols.comentarios]) currentBlock.notas = String(row[cols.comentarios]).trim();

    currentBlock.items.push({
      referencia: ref,
      descripcion: cols.descripcion >= 0 ? String(row[cols.descripcion] || '').trim() : '',
      talla: cols.talla >= 0 ? String(row[cols.talla] || '').trim() : '',
      cantidad: parseInt(String(row[cols.cantidad] || '1')) || 1,
      precio_unitario: parsePrice(row[cols.precio]),
      motivo: normalizeMotivo(cols.motivo >= 0 ? row[cols.motivo] : ''),
    });
  }

  if (currentBlock && currentBlock.items.length > 0) {
    reclamos.push(buildReclamo(currentBlock, info));
  }

  return reclamos;
}

function buildReclamo(block, info) {
  return {
    ...info,
    nro_factura: [...block.facturas].join(', '),
    nro_orden_compra: '',
    fecha_reclamo: block.fecha || new Date().toISOString().slice(0, 10),
    estado: 'Enviado',
    notas: block.notas,
    items: block.items,
  };
}

// ── Main ──
console.log('Reading:', FILE);
const wb = XLSX.readFile(FILE, { cellDates: true });

// First: inspect counts
const vistana = parseVistana(wb.Sheets['VISTANA'], SHEET_INFO['VISTANA']);
const shoes = parseBlocks(wb.Sheets['FASHION SHOES'], SHEET_INFO['FASHION SHOES']);
const wear = parseBlocks(wb.Sheets['FASHION WEAR'], SHEET_INFO['FASHION WEAR']);

console.log(`\nFound: VISTANA=${vistana.length}, FASHION SHOES=${shoes.length}, FASHION WEAR=${wear.length}`);
console.log(`Expected: 19/8/12 (or close)`);
console.log(`Total: ${vistana.length + shoes.length + wear.length} reclamos\n`);

// Print summary per reclamo
for (const [name, recs] of [['VISTANA', vistana], ['FASHION SHOES', shoes], ['FASHION WEAR', wear]]) {
  console.log(`--- ${name} (${recs.length}) ---`);
  for (const r of recs) {
    console.log(`  Factura: ${r.nro_factura} | ${r.fecha_reclamo} | ${r.items.length} items | ${r.notas.slice(0, 30)}`);
  }
}

// Import
console.log('\n=== Importing ===\n');
let totalOk = 0, totalErr = 0;
const all = [...vistana, ...shoes, ...wear];

for (const reclamo of all) {
  try {
    const res = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reclamo),
    });
    const data = await res.json();
    if (res.ok) {
      console.log(`✓ ${data.nro_reclamo} — ${reclamo.empresa} — Factura ${reclamo.nro_factura.slice(0, 40)} — ${reclamo.items.length} ítems`);
      totalOk++;
    } else {
      console.log(`✗ ${reclamo.empresa} Factura ${reclamo.nro_factura}: ${JSON.stringify(data).slice(0, 100)}`);
      totalErr++;
    }
  } catch (e) {
    console.log(`✗ ${reclamo.nro_factura}: ${e.message}`);
    totalErr++;
  }
}

console.log(`\n=== Total: ${totalOk} importados, ${totalErr} errores ===`);

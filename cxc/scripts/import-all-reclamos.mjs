import { createRequire } from 'module';
import path from 'path';
const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

const FILE = path.join(process.env.HOME || '~', 'Downloads', 'PLANTILLA RECLAMOS  COMPAÑIAS.xlsx');
const API = 'https://fashiongr.com/api/reclamos';

const SHEET_MAP = {
  'VISTANA': { empresa: 'Vistana International', proveedor: 'American Designer Fashion', marca: 'Calvin Klein' },
  'FASHION SHOES': { empresa: 'Fashion Shoes', proveedor: 'American Fashion Wear', marca: 'Tommy Hilfiger' },
  'FASHION WEAR': { empresa: 'Fashion Wear', proveedor: 'American Fashion Wear', marca: 'Tommy Hilfiger' },
};

function parseDate(val) {
  if (!val) return new Date().toISOString().slice(0,10);
  if (val instanceof Date) return val.toISOString().slice(0,10);
  if (typeof val === 'number') {
    const d = XLSX.SSF.parse_date_code(val);
    return `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`;
  }
  const s = String(val).trim();
  const m1 = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m1) return `${m1[3]}-${m1[2].padStart(2,'0')}-${m1[1].padStart(2,'0')}`;
  return new Date().toISOString().slice(0,10);
}

function normalizeMotivo(m) {
  if (!m) return 'Mercancía Dañada';
  const u = String(m).toUpperCase();
  if (/MANCHA|PELAD|AMARILLO/.test(u)) return 'Mercancía Manchada';
  if (/FALTANTE|FALTO|NOS FALTO|FALTARON/.test(u)) return 'Faltante de Mercancía';
  if (/ROTO|DEFECTU|DESPEGA|PELAN|TELA/.test(u)) return 'Mercancía Defectuosa';
  if (/SOBRANTE|DE MAS|LLEGO.*MAS/.test(u)) return 'Sobrante de Mercancía';
  return 'Mercancía Dañada';
}

function isSkipRow(row) {
  const vals = row.filter(v => v != null && String(v).trim() !== '');
  if (vals.length === 0) return true;
  const joined = vals.map(v => String(v).toUpperCase()).join(' ');
  return /SUBTOTAL|IMPORTACI|ITBMS|TOTAL EN|TOTAL:|RECLAMO \d/.test(joined);
}

function parseSheet(ws, info) {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: false });
  const reclamoMap = new Map();
  let colFecha=-1, colFactura=-1, colRef=-1, colDesc=-1, colTalla=-1, colCant=-1, colPrecio=-1, colMotivo=-1, colComent=-1;
  let hasTalla = false;

  for (const row of rows) {
    if (isSkipRow(row)) continue;

    // Detect header row
    const upperRow = row.map(v => String(v||'').toUpperCase().trim());
    if (upperRow.some(v => v.includes('FECHA') || v.includes('N\u00b0 FACTURA') || v.includes('N° FACTURA'))) {
      const hasFactura = upperRow.some(v => v.includes('FACTURA') || v.includes('TRANSPORTE'));
      if (!hasFactura) continue;
      hasTalla = upperRow.some(v => v.includes('TALLA'));
      colFecha = upperRow.findIndex(v => v.includes('FECHA'));
      colFactura = upperRow.findIndex(v => v.includes('FACTURA') || v.includes('TRANSPORTE'));
      colRef = upperRow.findIndex(v => v.includes('REFERENCIA'));
      colDesc = upperRow.findIndex(v => v.includes('DESCRIPCION') || v.includes('DETALLE'));
      colTalla = hasTalla ? upperRow.findIndex(v => v.includes('TALLA')) : -1;
      colCant = upperRow.findIndex(v => v.includes('CANTIDAD') || v === 'CANT');
      colPrecio = upperRow.findIndex(v => v.includes('PRECIO'));
      colMotivo = upperRow.findIndex(v => v.includes('MOTIVO'));
      colComent = upperRow.findIndex(v => v.includes('COMENTARIO'));
      continue;
    }

    if (colFactura === -1) continue;

    let fecha = row[colFecha];
    let factura = row[colFactura];
    let ref = colRef >= 0 ? row[colRef] : null;
    let desc = colDesc >= 0 ? row[colDesc] : null;
    let talla = colTalla >= 0 ? row[colTalla] : '';
    let cant = colCant >= 0 ? row[colCant] : null;
    let precio = colPrecio >= 0 ? row[colPrecio] : null;
    let motivo = colMotivo >= 0 ? row[colMotivo] : null;
    let coment = colComent >= 0 ? row[colComent] : null;

    // Fashion Shoes: detect swapped ref/factura
    if (info.empresa === 'Fashion Shoes') {
      const factStr = String(factura||'');
      const refStr = String(ref||'');
      if (/[A-Za-z]/.test(factStr) && /^\d+$/.test(refStr)) {
        [factura, ref] = [ref, factura];
      }
    }

    if (!factura || !ref) continue;
    const facturaStr = String(factura).trim();
    if (!facturaStr || facturaStr === 'null') continue;

    const item = {
      referencia: String(ref||'').trim(),
      descripcion: String(desc||'').trim(),
      talla: String(talla||'').trim(),
      cantidad: parseInt(String(cant||'1')) || 1,
      precio_unitario: parseFloat(String(precio||'0').replace(/[^0-9.]/g,'')) || 0,
      motivo: normalizeMotivo(String(motivo||'')),
    };

    if (!reclamoMap.has(facturaStr)) {
      reclamoMap.set(facturaStr, {
        ...info,
        nro_factura: facturaStr,
        nro_orden_compra: '',
        fecha_reclamo: parseDate(fecha),
        estado: 'Enviado',
        notas: String(coment||'').trim(),
        items: []
      });
    }
    reclamoMap.get(facturaStr).items.push(item);
  }

  return Array.from(reclamoMap.values()).filter(r => r.items.length > 0);
}

console.log('Reading:', FILE);
const wb = XLSX.readFile(FILE, { cellDates: true });
let totalOk = 0, totalErr = 0;

for (const [sheetName, info] of Object.entries(SHEET_MAP)) {
  const ws = wb.Sheets[sheetName];
  if (!ws) { console.log(`Sheet ${sheetName} not found`); continue; }
  const reclamos = parseSheet(ws, info);
  console.log(`\n${sheetName}: ${reclamos.length} reclamos encontrados`);

  for (const reclamo of reclamos) {
    try {
      const res = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reclamo)
      });
      const data = await res.json();
      if (res.ok) {
        console.log(`  ✓ ${data.nro_reclamo} — Factura ${reclamo.nro_factura} — ${reclamo.items.length} ítems`);
        totalOk++;
      } else {
        console.log(`  ✗ Factura ${reclamo.nro_factura}: ${JSON.stringify(data)}`);
        totalErr++;
      }
    } catch(e) {
      console.log(`  ✗ Factura ${reclamo.nro_factura}: ${e.message}`);
      totalErr++;
    }
  }
}

console.log(`\nTotal: ${totalOk} importados, ${totalErr} errores`);

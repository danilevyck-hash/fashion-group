import fs from 'fs';
import path from 'path';

const CSV_PATH = path.join(process.env.HOME || '~', 'Downloads', 'PLANTILLA RECLAMOS  COMPAÑIAS(FASHION WEAR).csv');
const API_URL = 'https://fashiongr.com/api/reclamos';

if (!fs.existsSync(CSV_PATH)) { console.error('CSV not found:', CSV_PATH); process.exit(1); }

const content = fs.readFileSync(CSV_PATH, 'latin1');
const lines = content.split('\n').map(l => l.trim());

const reclamoMap = new Map();

for (const line of lines) {
  const cols = line.split(',').map(c => c.trim().replace(/^"|"$/g, ''));
  if (!cols[0] || !cols[0].includes('/')) continue;

  const fecha = cols[0].trim();
  const factura = (cols[1] || '').trim();
  const referencia = (cols[2] || '').trim();
  if (!factura || !referencia) continue;
  if (factura.toUpperCase().includes('FACTURA')) continue;
  if (referencia.toUpperCase().includes('REFERENCIA')) continue;

  let descripcion, talla, cantidad, precio, motivo, comentarios;
  // Check if col[4] is a number (no talla) or text (has talla)
  const col4num = parseInt((cols[4] || '').trim());
  if (cols.length >= 9 && isNaN(col4num)) {
    descripcion = (cols[3] || '').trim();
    talla = (cols[4] || '').trim();
    cantidad = parseInt(cols[5]) || 1;
    precio = parseFloat((cols[6] || '').replace(/[^0-9.]/g, '')) || 0;
    motivo = (cols[7] || '').trim();
    comentarios = (cols[8] || '').trim();
  } else {
    descripcion = (cols[3] || '').trim();
    talla = '';
    cantidad = parseInt(cols[4]) || 1;
    precio = parseFloat((cols[5] || '').replace(/[^0-9.]/g, '')) || 0;
    motivo = (cols[6] || '').trim();
    comentarios = (cols[7] || '').trim();
  }

  if (!reclamoMap.has(factura)) {
    const parts = fecha.split('/');
    const d = parts[0], m = parts[1], y = parts[2];
    const fechaISO = `${(y || '2025').padStart(4, '20')}-${(m || '01').padStart(2, '0')}-${(d || '01').padStart(2, '0')}`;
    reclamoMap.set(factura, {
      empresa: 'Fashion Wear',
      proveedor: 'American Fashion Wear',
      marca: 'Tommy Hilfiger',
      nro_factura: factura,
      nro_orden_compra: '',
      fecha_reclamo: fechaISO,
      estado: (comentarios || '').toUpperCase().includes('HACER') ? 'En Revisión' : 'Enviado',
      notas: comentarios || '',
      items: []
    });
  }

  reclamoMap.get(factura).items.push({
    referencia,
    descripcion,
    talla,
    cantidad,
    precio_unitario: precio,
    motivo: motivo || 'Faltante de Mercancía'
  });
}

const reclamos = Array.from(reclamoMap.values());
console.log(`Encontrados ${reclamos.length} reclamos únicos\n`);

let ok = 0, errors = 0;
for (const reclamo of reclamos) {
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reclamo)
    });
    const data = await res.json();
    if (res.ok) {
      console.log(`✓ ${data.nro_reclamo} — Factura ${reclamo.nro_factura} — ${reclamo.items.length} ítems`);
      ok++;
    } else {
      console.log(`✗ Factura ${reclamo.nro_factura}: ${data.error}`);
      errors++;
    }
  } catch(e) {
    console.log(`✗ Factura ${reclamo.nro_factura}: ${e.message}`);
    errors++;
  }
}
console.log(`\nTotal: ${ok} importados, ${errors} errores`);

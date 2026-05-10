// Fase 0 — Auditoría READ-ONLY de clientes_master, directorio_clientes,
// ventas_raw y cxc_rows. Reporta los 8 pasos solicitados.
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = readFileSync('/Users/daniellevy/Code/fashion-group/cxc/.env.local', 'utf-8');
const vars = Object.fromEntries(
  env.split('\n').filter(l => l && !l.startsWith('#')).map(l => {
    const i = l.indexOf('=');
    return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
  })
);

const supa = createClient(vars.NEXT_PUBLIC_SUPABASE_URL, vars.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const B2B = ['vistana','fashion_wear','fashion_shoes','active_shoes','active_wear','joystep'];

// Normalización idéntica al UPDATE backfill: UPPER(TRIM) + remove [.,] + collapse \s
function normalize(s) {
  if (!s) return '';
  return s.toUpperCase().trim().replace(/[.,]/g, '').replace(/\s+/g, ' ');
}

async function fetchAll(builder, columns) {
  const PAGE = 1000;
  let all = [];
  let offset = 0;
  while (true) {
    const { data, error } = await builder
      .select(columns)
      .order('id', { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all = all.concat(data);
    if (data.length < PAGE) break;
    offset += PAGE;
  }
  return all;
}

// =============================================================================
// PASO 1 — Schema clientes_master (de la migration, validado contra row real)
// =============================================================================
console.log('═══════════════════════════════════════════════════════════');
console.log('PASO 1 — Schema clientes_master');
console.log('═══════════════════════════════════════════════════════════');
const { data: sample, error: errSchema } = await supa.from('clientes_master').select('*').limit(1);
if (errSchema) { console.error(errSchema); process.exit(1); }
if (sample && sample.length > 0) {
  console.log('Columnas detectadas (de fila real):');
  for (const k of Object.keys(sample[0])) {
    const v = sample[0][k];
    const t = v === null ? 'null' : typeof v;
    console.log(`  ${k.padEnd(28)} ${t}`);
  }
} else {
  console.log('⚠️ Tabla vacía. Schema desde supabase/migrations/clientes-master.sql:');
  console.log('  id, codigo, nombre, nombre_normalized, razon_social, identificacion,');
  console.log('  tipo_cliente, correo, telefono, celular, whatsapp, provincia, distrito,');
  console.log('  corregimiento, limite_credito, fecha_creacion, incluir_en_ventas,');
  console.log('  deleted, created_at, updated_at');
}

// =============================================================================
// PASO 2 — Conteos básicos
// =============================================================================
console.log('\n═══════════════════════════════════════════════════════════');
console.log('PASO 2 — Conteos básicos');
console.log('═══════════════════════════════════════════════════════════');
const { count: cmCount } = await supa.from('clientes_master').select('id', { count: 'exact', head: true });
const { count: cmActive } = await supa.from('clientes_master').select('id', { count: 'exact', head: true }).eq('deleted', false);
const { count: dcCount } = await supa.from('directorio_clientes').select('id', { count: 'exact', head: true });
console.log(`tabla                    total`);
console.log(`clientes_master          ${cmCount} (${cmActive} activos, ${cmCount - cmActive} deleted)`);
console.log(`directorio_clientes      ${dcCount} (no tiene columna 'deleted', conteo total)`);

// =============================================================================
// PASO 3 — Duplicados en clientes_master por nombre_normalized
// =============================================================================
console.log('\n═══════════════════════════════════════════════════════════');
console.log('PASO 3 — Duplicados en clientes_master por nombre_normalized');
console.log('═══════════════════════════════════════════════════════════');
const allCM = await fetchAll(supa.from('clientes_master'), 'id,codigo,nombre,nombre_normalized,deleted');
const groupCM = new Map();
for (const r of allCM) {
  if (r.deleted) continue;
  const k = r.nombre_normalized || '(null)';
  const arr = groupCM.get(k) ?? [];
  arr.push(r);
  groupCM.set(k, arr);
}
const dups = [...groupCM.entries()].filter(([_, rs]) => rs.length > 1)
  .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
console.log(`Total duplicados (>1 fila por nombre_normalized): ${dups.length}`);
if (dups.length > 0) {
  console.log('nombre_normalized | dups | codigos | nombres_originales');
  for (const [k, rs] of dups) {
    console.log(`${k} | ${rs.length} | [${rs.map(r => r.codigo ?? 'NULL').join(',')}] | [${rs.map(r => r.nombre).join(' || ')}]`);
  }
} else {
  console.log('✅ Cero duplicados — el unique index funciona.');
}

// =============================================================================
// PASO 4 — Sospechosos genéricos / no-comerciales en clientes_master
// =============================================================================
console.log('\n═══════════════════════════════════════════════════════════');
console.log('PASO 4 — Sospechosos genéricos / no-comerciales');
console.log('═══════════════════════════════════════════════════════════');
const sospechososRegex = /CONTADO|VENTAS|CONSUMIDOR|VARIOS|MOSTRADOR|^TEST|EMPLEADO|PERSONAL/;
const sospechosos = allCM.filter(r => {
  if (r.deleted) return false;
  const n = (r.nombre || '').toUpperCase().trim();
  if (n.length < 3) return true;
  return sospechososRegex.test(n);
}).sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
console.log(`Total sospechosos: ${sospechosos.length}`);
if (sospechosos.length > 0) {
  console.log('id | codigo | nombre');
  for (const r of sospechosos) {
    console.log(`${r.id.slice(0,8)}… | ${r.codigo ?? 'NULL'} | ${r.nombre}`);
  }
}

// =============================================================================
// Pre-fetch ventas_raw para PASO 5, 6, 8
// =============================================================================
console.log('\n[Pre-fetch ventas_raw B2B...]');
const cmNormSet = new Set(allCM.filter(r => !r.deleted && r.nombre_normalized).map(r => r.nombre_normalized));
console.log(`  clientes_master normalized active: ${cmNormSet.size}`);

// Read all ventas_raw rows for B2B empresas
let allVentas = [];
{
  const PAGE = 1000;
  let offset = 0;
  while (true) {
    const { data, error } = await supa
      .from('ventas_raw')
      .select('cliente, fecha, subtotal, empresa')
      .in('empresa', B2B)
      .not('cliente', 'is', null)
      .order('fecha', { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    allVentas = allVentas.concat(data);
    if (data.length < PAGE) break;
    offset += PAGE;
  }
}
console.log(`  ventas_raw B2B rows: ${allVentas.length}`);

// =============================================================================
// PASO 5 — Clientes huérfanos en ventas_raw (B2B, top 30 por ventas)
// =============================================================================
console.log('\n═══════════════════════════════════════════════════════════');
console.log('PASO 5 — Clientes huérfanos en ventas_raw (B2B, top 30)');
console.log('═══════════════════════════════════════════════════════════');
const huerfanos = new Map();
for (const r of allVentas) {
  const norm = normalize(r.cliente);
  if (cmNormSet.has(norm)) continue;
  const e = huerfanos.get(r.cliente) ?? { count: 0, primera: r.fecha, ultima: r.fecha, ventas: 0 };
  e.count++;
  if (r.fecha < e.primera) e.primera = r.fecha;
  if (r.fecha > e.ultima) e.ultima = r.fecha;
  e.ventas += Number(r.subtotal) || 0;
  huerfanos.set(r.cliente, e);
}
const huerfanosTop = [...huerfanos.entries()]
  .sort((a, b) => b[1].ventas - a[1].ventas)
  .slice(0, 30);
console.log(`Total huérfanos únicos: ${huerfanos.size}`);
console.log(`Top 30 por ventas:`);
console.log('cliente | apariciones | primera | ultima | ventas');
for (const [c, e] of huerfanosTop) {
  console.log(`${c} | ${e.count} | ${e.primera} | ${e.ultima} | $${e.ventas.toFixed(2)}`);
}

// =============================================================================
// PASO 6 — Clientes en master sin compras nunca (B2B)
// =============================================================================
console.log('\n═══════════════════════════════════════════════════════════');
console.log('PASO 6 — Clientes en master sin compras nunca (B2B)');
console.log('═══════════════════════════════════════════════════════════');
const ventasNormSet = new Set();
for (const r of allVentas) ventasNormSet.add(normalize(r.cliente));
const sinCompras = allCM.filter(r => !r.deleted && !ventasNormSet.has(r.nombre_normalized))
  .sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
console.log(`Total sin compras: ${sinCompras.length}`);
if (sinCompras.length > 0 && sinCompras.length <= 50) {
  console.log('codigo | nombre');
  for (const r of sinCompras) console.log(`${r.codigo ?? 'NULL'} | ${r.nombre}`);
} else if (sinCompras.length > 50) {
  console.log('Primeros 50:');
  for (const r of sinCompras.slice(0, 50)) console.log(`${r.codigo ?? 'NULL'} | ${r.nombre}`);
  console.log(`... y ${sinCompras.length - 50} más.`);
}

// =============================================================================
// PASO 7 — ventas_raw rows por empresa (sanity check)
// =============================================================================
console.log('\n═══════════════════════════════════════════════════════════');
console.log('PASO 7 — ventas_raw filas por empresa (TODAS las empresas)');
console.log('═══════════════════════════════════════════════════════════');
{
  // Necesitamos contar TODAS las empresas, no solo B2B
  const ALL_EMP = ['vistana','fashion_wear','fashion_shoes','active_shoes','active_wear',
                   'joystep','confecciones_boston','american_classic','multifashion'];
  console.log('empresa | filas');
  for (const e of ALL_EMP) {
    const { count } = await supa.from('ventas_raw').select('id', { count: 'exact', head: true }).eq('empresa', e);
    console.log(`${e} | ${count}`);
  }
  const { count: total } = await supa.from('ventas_raw').select('id', { count: 'exact', head: true });
  console.log(`TOTAL | ${total}`);
}

// =============================================================================
// PASO 8 — Resumen ejecutivo: clientes activos
// =============================================================================
console.log('\n═══════════════════════════════════════════════════════════');
console.log('PASO 8 — Clientes activos (definición nueva)');
console.log('═══════════════════════════════════════════════════════════');

// ventas_activas: distinct normalized de últimos 12 meses, B2B
const today = new Date();
const cutoff = new Date(today);
cutoff.setMonth(cutoff.getMonth() - 12);
const cutoffStr = cutoff.toISOString().slice(0, 10);

const ventasActivas = new Set();
for (const r of allVentas) {
  if (r.fecha >= cutoffStr) ventasActivas.add(normalize(r.cliente));
}

// cxc_activos: distinct nombre_normalized donde total > 0
let allCxc = [];
{
  const PAGE = 1000;
  let offset = 0;
  while (true) {
    const { data, error } = await supa
      .from('cxc_rows')
      .select('nombre_normalized,total')
      .gt('total', 0)
      .order('id', { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    allCxc = allCxc.concat(data);
    if (data.length < PAGE) break;
    offset += PAGE;
  }
}
const cxcActivos = new Set(allCxc.map(r => r.nombre_normalized).filter(Boolean));
const unionActivos = new Set([...ventasActivas, ...cxcActivos]);

console.log(`con_compras_12m         ${ventasActivas.size}`);
console.log(`con_saldo_cxc           ${cxcActivos.size}`);
console.log(`total_activos_unicos    ${unionActivos.size}`);
console.log(`(cutoff fecha: ${cutoffStr})`);
console.log(`(B2B empresas: ${B2B.join(', ')})`);

console.log('\n═══════════════════════════════════════════════════════════');
console.log('Audit COMPLETO — sin modificaciones a la DB.');
console.log('═══════════════════════════════════════════════════════════');

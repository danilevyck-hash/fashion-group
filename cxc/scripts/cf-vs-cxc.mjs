// Cruza 27 "Consumidor Final" del CSV vs cxc_rows.total agrupado por nombre_normalized.
// READ-ONLY.
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

const CF = [
  'MAZAR CITY SHOES','MELCHOR','NIPMAR SA','NORMA VEGA',
  'PRENDITA ANTONIO','PRODUCTOS ALIMENTICIOS SA','REINA PALACIOS',
  'REY STORE','REY STORE (AGUAS)','SAID SHALDI',
  'TRANSPORTE SANJUR','VENTAS LOCALES','YARIELA HERRERA',
  'YESENIA OSORIO','YULISA JUAREZ','ZAITH ESPINOSA',
  'CEPREDENAC','ALI-DEPORTIVE','DISTRIBUIDORA DEPORTIVA MUNDO ARQUERO',
  'ELBA JUAREZ','ERICK ALBERTO GALVEZ DIAZ','ESTELA RIVERA',
  'FERIA INT DE DAVID','ISABEL MARTINEZ','JAPSA / MILLENIUM',
  'JULISA TOLEDANO','LLISBETH CASTILLO',
];

// Pull all cxc_rows that match any of these nombre_normalized
const { data, error } = await supa
  .from('cxc_rows')
  .select('id, nombre_normalized, company_key, total')
  .in('nombre_normalized', CF);
if (error) { console.error(error); process.exit(1); }

const map = new Map();
for (const cf of CF) map.set(cf, { saldo: 0, filas: 0, empresas: new Set() });
for (const r of data ?? []) {
  const e = map.get(r.nombre_normalized);
  if (!e) continue; // shouldn't happen, but defensive
  e.filas++;
  e.saldo += Number(r.total) || 0;
  if (r.company_key) e.empresas.add(r.company_key);
}

const rows = [...map.entries()].map(([nombre, v]) => ({
  nombre,
  saldo: v.saldo,
  filas: v.filas,
  empresas: [...v.empresas].sort(),
}));

// Sort by saldo desc
rows.sort((a, b) => b.saldo - a.saldo);

console.log('=== Cruce 27 Consumidor Final vs cxc_rows.total ===\n');
console.log('nombre_normalized | saldo_total | filas_cxc | empresas');
console.log('-'.repeat(110));
let totalSaldo = 0;
let conSaldo = 0;
let sinSaldo = 0;
let noEnCxc = 0;
for (const r of rows) {
  const empStr = r.empresas.length ? r.empresas.join(',') : '(no en cxc_rows)';
  console.log(`${r.nombre.padEnd(40)} | $${r.saldo.toFixed(2).padStart(11)} | ${String(r.filas).padStart(9)} | ${empStr}`);
  totalSaldo += r.saldo;
  if (r.filas === 0) noEnCxc++;
  else if (r.saldo > 0) conSaldo++;
  else sinSaldo++;
}

console.log('\n=== Resumen ===');
console.log(`Total candidatos: ${rows.length}`);
console.log(`Con saldo > 0 (CUIDADO):                  ${conSaldo}`);
console.log(`Con filas en cxc pero saldo = 0 (OK):     ${sinSaldo}`);
console.log(`No están en cxc_rows en absoluto (OK):    ${noEnCxc}`);
console.log(`Suma total de saldos:                     $${totalSaldo.toFixed(2)}`);

console.log('\n=== Candidatos a ELIMINAR (saldo = 0 o no existe en cxc) ===');
const eliminables = rows.filter(r => r.saldo === 0).map(r => r.nombre);
console.log(`(${eliminables.length} candidatos)`);
for (const n of eliminables.sort()) console.log(`  ${n}`);

console.log('\n=== Candidatos a TRATAR CON CUIDADO (saldo > 0) ===');
const cuidado = rows.filter(r => r.saldo > 0);
console.log(`(${cuidado.length} candidatos)`);
for (const r of cuidado) {
  console.log(`  ${r.nombre.padEnd(40)} $${r.saldo.toFixed(2).padStart(11)}  [${r.empresas.join(',')}]`);
}

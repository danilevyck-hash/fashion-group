// Pre-DELETE prep: counts + local JSON backup
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
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

const EMPRESAS = ['vistana','fashion_wear','fashion_shoes','active_shoes','active_wear','confecciones_boston','american_classic'];

// ============================================================
// PASO 2 — Verificación pre-DELETE
// ============================================================
console.log('=== PASO 2a — Filas A BORRAR (fecha < 2026-05-01) por empresa ===\n');

const PAGE = 1000;
async function countRows(filter) {
  // Use head request with count
  const { count, error } = await supa
    .from('ventas_raw')
    .select('id', { count: 'exact', head: true })
    .in('empresa', EMPRESAS)
    .gte('fecha', filter.gte ?? '0001-01-01')
    .lt('fecha', filter.lt ?? '9999-01-01');
  if (error) { console.error(error); process.exit(1); }
  return count ?? 0;
}

async function countByEmpresa(empresa, filter) {
  const { count, error } = await supa
    .from('ventas_raw')
    .select('id', { count: 'exact', head: true })
    .eq('empresa', empresa)
    .gte('fecha', filter.gte ?? '0001-01-01')
    .lt('fecha', filter.lt ?? '9999-01-01');
  if (error) { console.error(error); process.exit(1); }
  return count ?? 0;
}

console.log('empresa|filas_a_borrar');
let totalABorrar = 0;
for (const e of EMPRESAS) {
  const n = await countByEmpresa(e, { lt: '2026-05-01' });
  console.log(`${e}|${n}`);
  totalABorrar += n;
}
console.log(`TOTAL|${totalABorrar}`);

console.log('\n=== PASO 2b — Filas PRESERVADAS (fecha >= 2026-05-01) por empresa ===\n');
console.log('empresa|filas_preservadas');
let totalPreservadas = 0;
for (const e of EMPRESAS) {
  const n = await countByEmpresa(e, { gte: '2026-05-01' });
  console.log(`${e}|${n}`);
  totalPreservadas += n;
}
console.log(`TOTAL|${totalPreservadas}`);

const totalGeneral = await countRows({});
console.log(`\n=== TOTAL filas en alcance (todas fechas, 7 empresas): ${totalGeneral} ===`);

// ============================================================
// PASO 1B — Backup local (JSON) de las filas A BORRAR
// ============================================================
console.log('\n=== PASO 1B — Backup local en JSON (filas A BORRAR) ===\n');

const BACKUP_DIR = '/Users/daniellevy/Code/fashion-group/cxc/backups';
mkdirSync(BACKUP_DIR, { recursive: true });
const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
const backupPath = `${BACKUP_DIR}/ventas_raw_pre_cleanup_${ts}.json`;

let all = [];
let offset = 0;
while (true) {
  const { data, error } = await supa
    .from('ventas_raw')
    .select('*')
    .in('empresa', EMPRESAS)
    .lt('fecha', '2026-05-01')
    .order('id', { ascending: true })
    .range(offset, offset + PAGE - 1);
  if (error) { console.error(error); process.exit(1); }
  if (!data || data.length === 0) break;
  all = all.concat(data);
  if (all.length % 5000 === 0 || data.length < PAGE) {
    console.log(`  ${all.length} filas leídas...`);
  }
  if (data.length < PAGE) break;
  offset += PAGE;
}

const payload = {
  created_at: new Date().toISOString(),
  scope: { empresas: EMPRESAS, fecha_lt: '2026-05-01' },
  rowCount: all.length,
  rows: all,
};
writeFileSync(backupPath, JSON.stringify(payload));
const stat = readFileSync(backupPath);
console.log(`\n✅ Backup guardado: ${backupPath}`);
console.log(`✅ ${all.length} filas en ${(stat.length / 1024 / 1024).toFixed(2)} MB`);

console.log('\n=== Resumen ===');
console.log(`A borrar:        ${totalABorrar}`);
console.log(`Preservadas:     ${totalPreservadas}`);
console.log(`Total 7 empresas: ${totalABorrar + totalPreservadas} (debería = ${totalGeneral})`);
console.log(`Match: ${totalABorrar + totalPreservadas === totalGeneral ? '✅' : '❌'}`);

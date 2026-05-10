// PASO 4 — DELETE autorizado de ventas_raw histórico (fecha < 2026-05-01)
// Backup en DB: ventas_raw_backup_20260506_full (45,150 filas)
// Backup local JSON: backups/ventas_raw_pre_cleanup_2026-05-06-15-33-04.json
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

const EMPRESAS = ['vistana','fashion_wear','fashion_shoes','active_shoes','active_wear','confecciones_boston','american_classic'];

console.log('=== PASO 4 — DELETE histórico < 2026-05-01 ===');
console.log(`Empresas: ${EMPRESAS.join(', ')}`);
console.log('Esperado: 45,083 filas borradas\n');

const t0 = Date.now();
const { error, count } = await supa
  .from('ventas_raw')
  .delete({ count: 'exact' })
  .in('empresa', EMPRESAS)
  .lt('fecha', '2026-05-01');

if (error) {
  console.error('❌ DELETE failed:', error);
  process.exit(1);
}

const dt = ((Date.now() - t0) / 1000).toFixed(1);
console.log(`✅ DELETE completado en ${dt}s`);
console.log(`✅ Filas borradas: ${count}`);
console.log(`Match esperado (45,083): ${count === 45083 ? '✅' : '⚠️ DIFFERENT'}`);

// Sanity check: cuántas filas quedan en las 7 empresas
const { count: remaining } = await supa
  .from('ventas_raw')
  .select('id', { count: 'exact', head: true })
  .in('empresa', EMPRESAS);

console.log(`\nFilas restantes en las 7 empresas: ${remaining}`);
console.log(`Esperado: 67 (solo american_classic mayo+)`);
console.log(`Match: ${remaining === 67 ? '✅' : '⚠️'}`);

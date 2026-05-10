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
  auth: { persistSession: false }
});

const candidates = [
  'directorio', 'directorio_rows', 'directorio_clientes', 'clientes',
  'clientes_master', 'clientes_directorio', 'master_clientes', 'directorio_contactos',
  'dir', 'directorio_v2', 'directorio_unificado', 'contactos',
  'clientes_unificados', 'master_directorio', 'clientes_finales',
  'reebok_clientes', 'fashion_clientes'
];

console.log('=== probando SELECT real en cada candidato ===');
for (const name of candidates) {
  const { data, error } = await supa.from(name).select('*').limit(1);
  if (error) {
    console.log(`  ✗ ${name}: ${error.code || ''} ${error.message.slice(0, 80)}`);
  } else {
    console.log(`  ✓ ${name}: filas=${data?.length || 0}, cols=${data?.[0] ? Object.keys(data[0]).join(',') : '(empty table)'}`);
  }
}

import { readFileSync, writeFileSync } from 'node:fs';
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

// Get the american_classic comprobantes file (the one that uses the "accepted" format)
const path = 'ventas-uploads/american_classic/2026-05-05_comprobantes_1_05052026180457.csv';
const { data: blob, error } = await supa.storage.from('backups').download(path);
if (error) { console.error(error); process.exit(1); }
const buf = Buffer.from(await blob.arrayBuffer());
const out = '/tmp/ventas-comprobantes-amclass.csv';
writeFileSync(out, buf);
console.log(`Saved ${out} (${buf.length} bytes)`);

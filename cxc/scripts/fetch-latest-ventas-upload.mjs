// Find the most recent archived ventas upload from Supabase Storage
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

const BUCKET = 'backups';
const ROOT = 'ventas-uploads';

// 1) list empresas (top-level dirs under ventas-uploads/)
const { data: empresas, error: e1 } = await supa.storage.from(BUCKET).list(ROOT, { limit: 100 });
if (e1) { console.error('list empresas:', e1); process.exit(1); }
console.log('empresas con uploads:', empresas?.map(e => e.name).join(', '));

// 2) for each empresa, list files
const all = [];
for (const emp of empresas ?? []) {
  if (!emp.name) continue;
  const path = `${ROOT}/${emp.name}`;
  const { data, error } = await supa.storage.from(BUCKET).list(path, { limit: 1000, sortBy: { column: 'name', order: 'desc' } });
  if (error) { console.error(emp.name, error); continue; }
  for (const f of data ?? []) {
    if (f.name) all.push({ empresa: emp.name, path: `${path}/${f.name}`, name: f.name, created_at: f.created_at, size: f.metadata?.size });
  }
}

// Sort by name desc — name is `YYYY-MM-DD_HH-MM-SS_filename`
all.sort((a, b) => b.name.localeCompare(a.name));
console.log(`\nTotal archivos: ${all.length}`);
console.log('\nTop 10 más recientes:');
for (const f of all.slice(0, 10)) {
  console.log(`  ${f.empresa.padEnd(22)} ${f.name}  size=${f.size}`);
}

if (all.length === 0) { console.log('Sin archivos archivados'); process.exit(0); }
const latest = all[0];
console.log(`\n→ descargando: ${latest.path}`);

const { data: blob, error: dlErr } = await supa.storage.from(BUCKET).download(latest.path);
if (dlErr) { console.error('download:', dlErr); process.exit(1); }
const buf = Buffer.from(await blob.arrayBuffer());

const outPath = `/tmp/ventas-latest_${latest.empresa}_${latest.name}`;
writeFileSync(outPath, buf);
console.log(`Guardado en ${outPath} (${buf.length} bytes)`);

// also save second most recent in case it's a different empresa
if (all.length > 1) {
  const second = all.find(f => f.empresa !== latest.empresa) ?? all[1];
  if (second && second.path !== latest.path) {
    const { data: blob2 } = await supa.storage.from(BUCKET).download(second.path);
    if (blob2) {
      const buf2 = Buffer.from(await blob2.arrayBuffer());
      const out2 = `/tmp/ventas-latest_${second.empresa}_${second.name}`;
      writeFileSync(out2, buf2);
      console.log(`Segundo guardado: ${out2} (${buf2.length} bytes)`);
    }
  }
}

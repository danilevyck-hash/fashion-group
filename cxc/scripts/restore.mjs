// ─────────────────────────────────────────────────────────────────────────────
// scripts/restore.mjs — Restaura datos desde el backup diario (formato v2:
// backups/YYYY-MM-DD/<tabla>.ndjson.gz + meta.json, ver api/cron/backup).
//
// Cómo funciona: descarga el/los .ndjson.gz del bucket privado "backups",
// descomprime, y UPSERTEA por lotes de 500 contra PostgREST usando la primary
// key real de cada tabla (detectada en runtime vía el OpenAPI de PostgREST).
// Upsert = idempotente: filas existentes se sobreescriben con la versión del
// backup, filas borradas se re-crean, filas nuevas (post-backup) NO se tocan.
//
// FUENTE (--source): de dónde se LEE el backup.
//   supabase (default) → bucket privado "backups" del propio proyecto.
//   r2                 → Cloudflare R2, la copia OFF-SITE. Es la que sirve el
//                        día que el proyecto de Supabase es el problema.
// El destino de la escritura es SIEMPRE Supabase (PostgREST / Storage): la
// fuente solo cambia de dónde salen los bytes.
//
// USO:
//   node scripts/restore.mjs --list [--source r2]
//       Lista los backups disponibles (carpetas de fecha).
//   node scripts/restore.mjs [--source r2] [--date YYYY-MM-DD] [--tables t1,t2]
//       Sin --yes corre en modo plan: descarga, valida y muestra qué haría.
//   node scripts/restore.mjs --date 2026-07-04 --tables transportistas --yes
//       Restaura de verdad (solo con --yes explícito).
//   node scripts/restore.mjs --date 2026-07-04 --target tabla_staging --tables cheques --yes
//       Restaura UN dataset en OTRA tabla (staging con el mismo schema).
//
// BUCKETS DE STORAGE (réplica en backups/_storage/<bucket>/ en Supabase y en
// _storage/<bucket>/ en R2, ver api/cron/backup):
//   node scripts/restore.mjs --storage reclamo-fotos [--prefix carpeta/] [--yes]
//   node scripts/restore.mjs --source r2 --storage reclamo-fotos [--yes]
//       Restaura los archivos replicados de ese bucket a su bucket original
//       (upsert: sobreescribe si existe). Sin --yes solo muestra el plan.
//
// Passwords: fg_users_auth.ndjson.gz (hashes bcrypt) NO se restaura por defecto;
// agregar --include-auth para upsertearlo sobre fg_users (columna password).
//
// PRUEBA (validada 4-jul-2026): restore real de `transportistas` con datos
// idénticos → upsert no-op, hash de la tabla intacto antes/después. Ver
// memoria/PR para el detalle. La prueba equivalente con --source r2 está
// PENDIENTE: las credenciales R2_* están marcadas Sensitive en Vercel y no se
// pueden leer ni con `vercel env pull` ni con la API — hay que copiarlas a mano
// desde el panel de Cloudflare a .env.local.
//
// Requiere: .env.local en la raíz del repo (NEXT_PUBLIC_SUPABASE_URL +
// SUPABASE_SERVICE_ROLE_KEY; para --source r2 además R2_ACCESS_KEY_ID,
// R2_SECRET_ACCESS_KEY, R2_BUCKET y R2_ACCOUNT_ID o R2_ENDPOINT).
// Node 18+ (fetch y zlib nativos); --source r2 usa aws4fetch, que ya es
// dependencia del proyecto (la misma que firma las subidas del cron).
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { AwsClient } from 'aws4fetch';

const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf-8');
const vars = Object.fromEntries(
  env.split('\n').filter(l => l && !l.startsWith('#')).map(l => {
    const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
  })
);
const BASE = vars.NEXT_PUBLIC_SUPABASE_URL;
const KEY = vars.SUPABASE_SERVICE_ROLE_KEY;
if (!BASE || !KEY) { console.error('Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en .env.local'); process.exit(1); }
const HEADERS = { apikey: KEY, Authorization: `Bearer ${KEY}` };
const BUCKET = 'backups';
const BATCH = 500;

// ── args ─────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const opt = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };

const doList = flag('list');
const dryRun = flag('dry-run') || !flag('yes');
const includeAuth = flag('include-auth');
const onlyTables = opt('tables')?.split(',').map(s => s.trim()).filter(Boolean);
const targetOverride = opt('target');
const storageBucket = opt('storage');
const pathPrefix = opt('prefix') || '';
const source = opt('source') || 'supabase';
if (source !== 'supabase' && source !== 'r2') {
  console.error(`--source inválido: "${source}" (valores: supabase, r2)`);
  process.exit(1);
}
const desdeR2 = source === 'r2';
let date = opt('date');

// ── storage helpers ──────────────────────────────────────────────────────────
async function storageList(prefix) {
  const r = await fetch(`${BASE}/storage/v1/object/list/${BUCKET}`, {
    method: 'POST',
    headers: { ...HEADERS, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prefix, limit: 1000, sortBy: { column: 'name', order: 'asc' } }),
  });
  if (!r.ok) throw new Error(`storage list: ${r.status} ${await r.text()}`);
  return r.json();
}

async function storageDownload(path) {
  const r = await fetch(`${BASE}/storage/v1/object/${BUCKET}/${path}`, { headers: HEADERS });
  if (!r.ok) throw new Error(`download ${path}: ${r.status} ${await r.text()}`);
  return Buffer.from(await r.arrayBuffer());
}

// ── Fuente R2 (copia off-site) ───────────────────────────────────────────────
// Los mismos objetos que sube /api/cron/backup: data/<fecha>/<archivo> para los
// datasets y el meta, _storage/<bucket>/<path> para los archivos.
const R2_BUCKET = vars.R2_BUCKET;
const R2_ENDPOINT =
  vars.R2_ENDPOINT || (vars.R2_ACCOUNT_ID ? `https://${vars.R2_ACCOUNT_ID}.r2.cloudflarestorage.com` : '');
const R2_BASE = R2_BUCKET && R2_ENDPOINT ? `${R2_ENDPOINT.replace(/\/+$/, '')}/${R2_BUCKET}` : '';

let r2Client = null;
function r2() {
  if (r2Client) return r2Client;
  if (!vars.R2_ACCESS_KEY_ID || !vars.R2_SECRET_ACCESS_KEY || !R2_BASE) {
    console.error(
      'Faltan credenciales de R2 en .env.local: R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET\n' +
        'y R2_ACCOUNT_ID (o R2_ENDPOINT). Están marcadas Sensitive en Vercel — copiarlas del panel\n' +
        'de Cloudflare (R2 → Manage API tokens).',
    );
    process.exit(1);
  }
  r2Client = new AwsClient({
    accessKeyId: vars.R2_ACCESS_KEY_ID,
    secretAccessKey: vars.R2_SECRET_ACCESS_KEY,
    region: 'auto',
    service: 's3',
  });
  return r2Client;
}

async function r2Download(key) {
  const r = await r2().fetch(`${R2_BASE}/${key}`, { method: 'GET' });
  if (!r.ok) throw new Error(`r2 download ${key}: ${r.status} ${(await r.text()).slice(0, 200)}`);
  return Buffer.from(await r.arrayBuffer());
}

/** ListObjectsV2 paginado. Con `delimiter` devuelve además los CommonPrefixes. */
async function r2List(prefix, delimiter = '') {
  const keys = [];
  const prefixes = [];
  let token = '';
  for (;;) {
    const qs = new URLSearchParams({ 'list-type': '2', prefix, 'max-keys': '1000' });
    if (delimiter) qs.set('delimiter', delimiter);
    if (token) qs.set('continuation-token', token);
    const r = await r2().fetch(`${R2_BASE}?${qs}`, { method: 'GET' });
    if (!r.ok) throw new Error(`r2 list ${prefix}: ${r.status} ${(await r.text()).slice(0, 200)}`);
    const xml = await r.text();
    for (const m of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
      const key = (m[1].match(/<Key>([\s\S]*?)<\/Key>/) || [])[1];
      const size = Number((m[1].match(/<Size>(\d+)<\/Size>/) || [])[1] || 0);
      if (key) keys.push({ key, size });
    }
    for (const m of xml.matchAll(/<CommonPrefixes>\s*<Prefix>([\s\S]*?)<\/Prefix>\s*<\/CommonPrefixes>/g)) {
      prefixes.push(m[1]);
    }
    if (!/<IsTruncated>true<\/IsTruncated>/.test(xml)) break;
    token = (xml.match(/<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/) || [])[1];
    if (!token) break;
  }
  return { keys, prefixes };
}

/** Mimetype por extensión (R2 no lo devuelve en el listado). */
function mimeDe(path) {
  const ext = (path.split('.').pop() || '').toLowerCase();
  return {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
    gif: 'image/gif', pdf: 'application/pdf', json: 'application/json',
    gz: 'application/gzip', zip: 'application/zip', csv: 'text/csv',
  }[ext] || 'application/octet-stream';
}

// ── Fuente unificada (supabase | r2) ─────────────────────────────────────────
/** Descarga un archivo del backup: `relPath` es relativo a la raíz del backup
 *  ("<fecha>/meta.json"); cada fuente sabe dónde vive de verdad. */
async function backupDownload(relPath) {
  return desdeR2 ? r2Download(`data/${relPath}`) : storageDownload(relPath);
}

/** Fechas de backup disponibles, ordenadas ascendente. */
async function listarFechas() {
  if (desdeR2) {
    const { prefixes } = await r2List('data/', '/');
    return prefixes
      .map((p) => (p.match(/^data\/(\d{4}-\d{2}-\d{2})\/$/) || [])[1])
      .filter(Boolean)
      .sort();
  }
  const entries = await storageList('');
  return entries.filter((e) => /^\d{4}-\d{2}-\d{2}$/.test(e.name)).map((e) => e.name).sort();
}

/** Archivos replicados de un bucket de Storage: `dest` es la ruta DENTRO del
 *  bucket original, `src` la ruta en la fuente. */
async function listarReplicaStorage(bucket) {
  if (desdeR2) {
    const raiz = `_storage/${bucket}/`;
    const { keys } = await r2List(raiz);
    return keys.map((k) => ({
      src: k.key,
      dest: k.key.slice(raiz.length),
      size: k.size,
      mimetype: mimeDe(k.key),
    }));
  }
  const raiz = `_storage/${bucket}`;
  return (await walkStorage(raiz))
    .filter((f) => f.path !== '_storage/manifest.json')
    .map((f) => ({ src: f.path, dest: f.path.slice(raiz.length + 1), size: f.size, mimetype: f.mimetype }));
}

/** Bytes de un archivo de la réplica de Storage. */
async function replicaDownload(src) {
  return desdeR2 ? r2Download(src) : storageDownload(src);
}

// ── PKs reales desde el OpenAPI de PostgREST (para on_conflict) ──────────────
async function fetchPrimaryKeys() {
  const r = await fetch(`${BASE}/rest/v1/`, { headers: HEADERS });
  if (!r.ok) throw new Error(`openapi: ${r.status}`);
  const spec = await r.json();
  const pks = {};
  for (const [table, def] of Object.entries(spec.definitions || {})) {
    const cols = Object.entries(def.properties || {})
      .filter(([, p]) => (p.description || '').includes('<pk/>'))
      .map(([k]) => k);
    if (cols.length) pks[table] = cols;
  }
  return pks;
}

async function countRows(table) {
  const r = await fetch(`${BASE}/rest/v1/${table}?select=*`, {
    method: 'HEAD',
    headers: { ...HEADERS, Prefer: 'count=exact', Range: '0-0' },
  });
  return parseInt((r.headers.get('content-range') || '/0').split('/')[1]) || 0;
}

async function upsertBatch(table, pkCols, rows) {
  const r = await fetch(`${BASE}/rest/v1/${table}?on_conflict=${pkCols.join(',')}`, {
    method: 'POST',
    headers: {
      ...HEADERS,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(rows),
  });
  if (!r.ok) throw new Error(`upsert ${table}: ${r.status} ${await r.text()}`);
}

// ── storage: walk recursivo + upload ─────────────────────────────────────────
async function walkStorage(prefix) {
  const entries = await storageList(prefix);
  const out = [];
  for (const e of entries) {
    const path = prefix ? `${prefix}/${e.name}` : e.name;
    if (e.id === null) out.push(...(await walkStorage(path)));
    else out.push({ path, size: e.metadata?.size || 0, mimetype: e.metadata?.mimetype || 'application/octet-stream' });
  }
  return out;
}

async function storageUpload(bucket, path, buf, contentType) {
  const r = await fetch(`${BASE}/storage/v1/object/${bucket}/${path}`, {
    method: 'POST',
    headers: { ...HEADERS, 'Content-Type': contentType, 'x-upsert': 'true' },
    body: buf,
  });
  if (!r.ok) throw new Error(`upload ${bucket}/${path}: ${r.status} ${await r.text()}`);
}

/** Restaura archivos de la réplica de <bucket> (Supabase o R2) al bucket original. */
async function restoreStorage() {
  const files = (await listarReplicaStorage(storageBucket)).filter(f => f.dest && f.dest.startsWith(pathPrefix));
  if (!files.length) {
    console.error(`No hay réplica para "${storageBucket}"${pathPrefix ? ` con prefijo "${pathPrefix}"` : ''} en ${source}. ¿Corrió ya el backup con réplica de storage?`);
    process.exit(1);
  }
  const totalMB = (files.reduce((s, f) => s + f.size, 0) / 1048576).toFixed(1);
  console.log(`\n═ Restore de storage (fuente: ${source}) → bucket "${storageBucket}" ${dryRun ? '(DRY-RUN — usá --yes para restaurar)' : '⚠️  ESCRITURA REAL'} ═`);
  console.log(`  ${files.length} archivos, ${totalMB} MB\n`);

  let fallos = 0;
  for (const f of files) {
    if (dryRun) { console.log(`  ✓ ${f.dest} (${(f.size / 1024).toFixed(1)} KB)`); continue; }
    try {
      const buf = await replicaDownload(f.src);
      await storageUpload(storageBucket, f.dest, buf, f.mimetype);
      console.log(`  ✓ ${f.dest} (${(buf.length / 1024).toFixed(1)} KB)`);
    } catch (e) {
      fallos++;
      console.error(`  ✗ ${f.dest}: ${e.message}`);
    }
  }
  console.log(`\n${dryRun ? 'Plan' : 'Restore'} terminado: ${files.length - fallos}/${files.length} archivos OK.`);
  process.exit(fallos ? 1 : 0);
}

// ── main ─────────────────────────────────────────────────────────────────────
(async () => {
  if (storageBucket) return restoreStorage();

  if (doList) {
    const fechas = await listarFechas();
    console.log(`Backups disponibles (fuente: ${source}):`);
    for (const f of fechas) console.log(`  ${f}`);
    if (!fechas.length) console.log('  (ninguno en formato carpeta YYYY-MM-DD)');
    return;
  }

  if (!date) {
    const fechas = await listarFechas();
    date = fechas[fechas.length - 1];
    if (!date) { console.error('No hay backups. Corré primero /api/cron/backup.'); process.exit(1); }
  }

  console.log(`\n═ Restore desde backup ${date} (fuente: ${source}) ${dryRun ? '(DRY-RUN — sin escrituras; usá --yes para restaurar)' : '⚠️  ESCRITURA REAL'} ═\n`);

  const meta = JSON.parse((await backupDownload(`${date}/meta.json`)).toString('utf-8'));
  if (meta.format !== 'v2-ndjson-gz') {
    console.error(`Backup ${date} en formato "${meta.format || 'v1 (backup.json monolítico)'}" — este script solo restaura v2.`);
    process.exit(1);
  }
  if (meta.errores?.length) {
    console.warn(`⚠️  Ese backup se generó con errores en: ${meta.errores.map(e => e.file).join(', ')}`);
  }

  // Grupo switch (meta-switch.json, generado por /api/cron/backup?grupo=switch):
  // si existe, sus datasets se suman al índice — restaurables con --tables igual
  // que los del core. Backups anteriores al split no lo tienen (tolerante).
  try {
    const metaSwitch = JSON.parse((await backupDownload(`${date}/meta-switch.json`)).toString('utf-8'));
    if (metaSwitch.errores?.length) {
      console.warn(`⚠️  El grupo switch se generó con errores en: ${metaSwitch.errores.map(e => e.file).join(', ')}`);
    }
    meta.datasets = [...meta.datasets, ...(metaSwitch.datasets || [])];
  } catch { /* sin grupo switch ese día — ok */ }

  let datasets = meta.datasets;
  if (!includeAuth) datasets = datasets.filter(d => d.file !== 'fg_users_auth');
  if (onlyTables) datasets = datasets.filter(d => onlyTables.includes(d.file) || onlyTables.includes(d.table));
  if (targetOverride && datasets.length !== 1) {
    console.error('--target requiere exactamente 1 dataset (usá --tables para elegirlo).');
    process.exit(1);
  }
  if (!datasets.length) { console.error('Ningún dataset coincide con --tables.'); process.exit(1); }

  const pks = await fetchPrimaryKeys();
  let fallos = 0;

  for (const ds of datasets) {
    const target = targetOverride || ds.table;
    const pkCols = pks[target];
    try {
      const gz = await backupDownload(`${date}/${ds.file}.ndjson.gz`);
      const ndjson = gunzipSync(gz).toString('utf-8');
      const rows = ndjson ? ndjson.split('\n').filter(Boolean).map(l => JSON.parse(l)) : [];
      if (rows.length !== ds.rows) {
        throw new Error(`filas en archivo (${rows.length}) ≠ meta.json (${ds.rows})`);
      }
      if (!pkCols) throw new Error(`tabla destino "${target}" sin PK detectable (¿existe?)`);

      if (dryRun) {
        console.log(`  ✓ ${ds.file}: ${rows.length} filas OK → upsertearía en "${target}" (on_conflict=${pkCols.join(',')})`);
        continue;
      }

      const antes = await countRows(target);
      for (let i = 0; i < rows.length; i += BATCH) {
        await upsertBatch(target, pkCols, rows.slice(i, i + BATCH));
      }
      const despues = await countRows(target);
      console.log(`  ✓ ${ds.file}: ${rows.length} filas restauradas en "${target}" (count ${antes} → ${despues})`);
    } catch (e) {
      fallos++;
      console.error(`  ✗ ${ds.file}: ${e.message}`);
    }
  }

  console.log(`\n${dryRun ? 'Plan' : 'Restore'} terminado: ${datasets.length - fallos}/${datasets.length} datasets OK.`);
  if (!dryRun && !includeAuth && datasets.some(d => d.table === 'fg_users')) {
    console.log('Nota: los passwords NO se restauraron (correr con --include-auth para restaurar fg_users_auth).');
  }
  process.exit(fallos ? 1 : 0);
})().catch(e => { console.error('Error fatal:', e.message); process.exit(1); });

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
// COMPLETITUD (jul-2026): un backup de un día lo escriben DOS invocaciones del
// cron sobre la MISMA carpeta `<fecha>/` — core (meta.json, 57 datasets) y
// ?grupo=switch (meta-switch.json, 8). `--list` VALIDA que estén los dos metas
// y que cada dataset del meta tenga su .ndjson.gz, y marca OK / INCOMPLETO /
// INSERVIBLE. Antes listaba las carpetas de fecha a secas: el 25-jul-2026
// respondía "2026-07-25" (se ve sano) y el restore moría con 404 en meta.json
// porque ese día solo había corrido el grupo switch. Sin --date se elige la
// fecha más nueva COMPLETA, no la más nueva a secas; y un día a medias se
// restaura igual con lo que SÍ tiene, avisando qué falta.
//
// USO:
//   node scripts/restore.mjs --list [--source r2]
//       Lista los backups disponibles con su estado de completitud.
//   node scripts/restore.mjs [--source r2] [--date YYYY-MM-DD] [--tables t1,t2]
//       Sin --yes corre en modo plan: descarga, valida y muestra qué haría.
//   node scripts/restore.mjs --date 2026-07-04 --tables transportistas --yes
//       Restaura de verdad (solo con --yes explícito).
//   node scripts/restore.mjs --date 2026-07-04 --target tabla_staging --tables cheques --yes
//       Restaura UN dataset en OTRA tabla (staging con el mismo schema).
//
// BUCKETS DE STORAGE — la réplica vive SOLO en R2 (_storage/<bucket>/<path>).
// La copia intra-Supabase (backups/_storage/) se eliminó el 26-jul-2026: era
// una copia dentro del MISMO proyecto (no protegía de perderlo), pesaba 103,2 MB
// del GB del plan y ni siquiera cubría los buckets `marketing` ni
// `joybees-photos`. Por eso --storage asume --source r2 si no se pasa otro:
//   node scripts/restore.mjs --storage reclamo-fotos [--prefix carpeta/] [--yes]
//   node scripts/restore.mjs --source r2 --storage reclamo-fotos [--yes]
//       Restaura los archivos replicados de ese bucket a su bucket original
//       (upsert: sobreescribe si existe). Sin --yes solo muestra el plan.
//       Cubre los 5 buckets: product-images, marketing, joybees-photos,
//       reclamo-facturas, reclamo-fotos.
//
// Passwords: fg_users_auth.ndjson.gz (hashes bcrypt) NO se restaura por defecto;
// agregar --include-auth para upsertearlo sobre fg_users (columna password).
//
// PRUEBA (validada 4-jul-2026): restore real de `transportistas` con datos
// idénticos → upsert no-op, hash de la tabla intacto antes/después.
// PRUEBA --source r2 (validada 26-jul-2026, ya no está pendiente): escritura
// REAL de joybees-photos/WFFLT.TNV.jpg desde R2 al bucket original → 2.550 bytes,
// sha256 83bc1975ce8e idéntico al de R2 y al que había antes. Los 5 buckets
// listan completos desde R2 (2907+231+28+24+14 = 3.204 archivos, 198 MB).
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
import {
  GRUPOS_META,
  agruparKeysPorFecha,
  diagnosticarFecha,
  formatearFecha,
  problemasDe,
  elegirFechaPorDefecto,
} from './lib/backup-inventario.mjs';

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
const sourceExplicito = opt('source');
// --storage lee SIEMPRE de R2: la réplica intra-Supabase (backups/_storage/) se
// eliminó el 26-jul-2026 (era una copia dentro del mismo proyecto, 103,2 MB del
// GB del plan, y ni siquiera cubría los buckets marketing y joybees-photos).
// Sin --source explícito, --storage asume r2 en vez de fallar con "no hay
// réplica"; con --source supabase explícito se avisa y se corta.
const source = sourceExplicito || (storageBucket ? 'r2' : 'supabase');
if (source !== 'supabase' && source !== 'r2') {
  console.error(`--source inválido: "${source}" (valores: supabase, r2)`);
  process.exit(1);
}
if (storageBucket && source === 'supabase') {
  console.error(
    'Los archivos de Storage ya no se replican dentro de Supabase (backups/_storage/ se eliminó el 26-jul-2026).\n' +
    `La copia off-site vive en R2: node scripts/restore.mjs --source r2 --storage ${storageBucket}`
  );
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

/** Inventario de las carpetas de fecha: Map<fecha, Set<nombre de archivo>>.
 *  Es la base del diagnóstico de completitud — ver scripts/lib/backup-inventario.mjs. */
async function inventarioFechas() {
  if (desdeR2) {
    const { keys } = await r2List('data/');
    return agruparKeysPorFecha(keys.map((k) => k.key));
  }
  const entries = await storageList('');
  const fechas = entries.filter((e) => /^\d{4}-\d{2}-\d{2}$/.test(e.name)).map((e) => e.name).sort();
  const out = new Map();
  for (const f of fechas) {
    out.set(f, new Set((await storageList(f)).map((e) => e.name)));
  }
  return out;
}

/** Baja y parsea los metas de grupo presentes en una fecha. Un meta que existe
 *  pero no se puede leer queda en null → el diagnóstico lo cuenta como grupo
 *  ausente (que es lo que es a efectos de restaurar). */
async function cargarMetas(fecha, archivos) {
  const metas = {};
  for (const [grupo, metaFile] of Object.entries(GRUPOS_META)) {
    if (!archivos.has(metaFile)) continue;
    try {
      metas[grupo] = JSON.parse((await backupDownload(`${fecha}/${metaFile}`)).toString('utf-8'));
    } catch {
      metas[grupo] = null;
    }
  }
  return metas;
}

/** Diagnóstico completo de una fecha (lista + baja sus metas). */
async function diagnosticar(fecha, archivos) {
  return diagnosticarFecha(fecha, archivos, await cargarMetas(fecha, archivos));
}

/** Diagnóstico de TODAS las fechas, de la más nueva a la más vieja. */
async function diagnosticarTodas() {
  const inv = await inventarioFechas();
  const fechas = [...inv.keys()].sort().reverse();
  const out = [];
  for (const f of fechas) out.push(await diagnosticar(f, inv.get(f)));
  return out;
}

/** Archivos replicados de un bucket de Storage: `dest` es la ruta DENTRO del
 *  bucket original, `src` la key en R2 (única fuente desde el 26-jul-2026). */
async function listarReplicaStorage(bucket) {
  const raiz = `_storage/${bucket}/`;
  const { keys } = await r2List(raiz);
  return keys.map((k) => ({
    src: k.key,
    dest: k.key.slice(raiz.length),
    size: k.size,
    mimetype: mimeDe(k.key),
  }));
}

/** Bytes de un archivo de la réplica de Storage (R2). */
async function replicaDownload(src) {
  return r2Download(src);
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
    // --list NO puede mentir: una carpeta de fecha se lista como disponible
    // solo si de verdad se puede restaurar. Ver scripts/lib/backup-inventario.mjs.
    const diags = await diagnosticarTodas();
    console.log(`Backups disponibles (fuente: ${source}):`);
    for (const d of diags) console.log(formatearFecha(d));
    if (!diags.length) console.log('  (ninguno en formato carpeta YYYY-MM-DD)');
    const completos = diags.filter(d => d.completo).length;
    console.log(
      `\n${completos}/${diags.length} fechas restaurables por completo. ` +
      `OK = los ${Object.keys(GRUPOS_META).length} grupos (${Object.keys(GRUPOS_META).join(' + ')}) con todos sus archivos · ` +
      'PARCIAL = falta un grupo entero · DAÑADO = un grupo corrió pero le faltan archivos · INSERVIBLE = sin meta.',
    );
    if (diags.length && !completos) {
      console.log('⚠️  NINGUNA fecha está completa: la réplica NO es hoy una red de seguridad entera.');
    }
    return;
  }

  const inv = await inventarioFechas();
  if (!date) {
    const diags = [];
    for (const f of [...inv.keys()].sort().reverse()) diags.push(await diagnosticar(f, inv.get(f)));
    const elegida = elegirFechaPorDefecto(diags);
    if (!elegida) { console.error('No hay backups restaurables. Corré primero /api/cron/backup y revisá con --list.'); process.exit(1); }
    date = elegida.fecha;
    if (!elegida.completa) {
      console.warn(`⚠️  Ninguna fecha está COMPLETA; se usa la más nueva restaurable (${date}). Revisá --list.`);
    }
  }

  console.log(`\n═ Restore desde backup ${date} (fuente: ${source}) ${dryRun ? '(DRY-RUN — sin escrituras; usá --yes para restaurar)' : '⚠️  ESCRITURA REAL'} ═\n`);

  const archivos = inv.get(date);
  if (!archivos) {
    console.error(`No existe la carpeta de backup ${date} en ${source}. Mirá las disponibles con --list.`);
    process.exit(1);
  }
  const diag = await diagnosticar(date, archivos);
  if (!diag.restaurable) {
    console.error(`Backup ${date} sin ningún meta legible (${diag.faltan.map(f => `${f.metaFile}: ${f.motivo}`).join('; ')}) — no hay índice de datasets, nada que restaurar.`);
    process.exit(1);
  }
  for (const f of diag.formatosMalos) {
    console.error(`Grupo ${f.grupo} de ${date} en formato "${f.format}" — este script solo restaura v2-ndjson-gz.`);
    process.exit(1);
  }
  if (!diag.completo) {
    console.warn(`⚠️  Backup ${date} ${diag.estado} — ${problemasDe(diag).join('; ')}`);
    console.warn('   Se restaura solo lo que SÍ está. Para el día entero, elegí otra fecha (--list).\n');
  }
  for (const e of diag.conErrores) {
    console.warn(`⚠️  El grupo ${e.grupo} se generó con errores en: ${e.files.join(', ')}`);
  }

  // Índice unificado: los datasets de todos los grupos presentes (core +
  // switch), restaurables con --tables por igual.
  const metas = await cargarMetas(date, archivos);
  let datasets = diag.grupos.flatMap(g => (metas[g].datasets || []).map(d => ({ ...d, grupo: g })));
  const disponibles = new Set(datasets.flatMap(d => [d.file, d.table]));
  for (const t of onlyTables || []) {
    if (!disponibles.has(t)) {
      const faltanGrupos = diag.faltan.map(f => f.grupo).join(', ');
      console.error(`"${t}" no está en el backup ${date}${faltanGrupos ? ` (falta el grupo ${faltanGrupos})` : ''}. Mirá --list.`);
      process.exit(1);
    }
  }
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

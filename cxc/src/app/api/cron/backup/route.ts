// ─────────────────────────────────────────────────────────────────────────────
// GET /api/cron/backup — Backup diario COMPLETO a Supabase Storage (bucket
// privado "backups").
//
// Formato v2 (jul 2026): un archivo NDJSON gzipeado POR TABLA en
// backups/YYYY-MM-DD/<tabla>.ndjson.gz + meta.json con counts. Reemplaza el
// backup.json monolítico v1, que además truncaba a 1000 filas (cap silencioso
// de PostgREST sin .range()) y recortaba por ventanas de 30d/3m/6m.
//
// Cobertura: TODAS las tablas con datos creados a mano en la app o config
// (no re-derivables de Switch), en la corrida CORE (sin params).
//
// GRUPO SWITCH (?grupo=switch, audit jul-2026): las tablas switch_* +
// multifashion_tickets SÍ se respaldan ahora, en una SEGUNDA invocación del
// mismo path (entradas propias en vercel.json, patrón de entradas repetidas).
// Motivo del split, con números (medidos 23-jul-2026): ~310K filas extra
// (switch_articulo_diario 197K × ~370B + switch_facturas 52K × ~1.1KB + resto)
// ≈ ~160-175MB NDJSON → ~310 páginas de fetch (~60-150s) + gzip + doble upload
// (Supabase + R2, ~20-40MB gz). El corte en grupos nació bajo el techo de 300s
// de Hobby: la corrida core presupuestaba 280s de esos 300 (réplica Storage 240s
// + R2 280s), así que meter los datasets grandes ahí recortaba la réplica a
// diario. Con Pro el techo es 800s y cada grupo tiene 800s propios — si los tres
// grupos deberían volver a ser uno se decide con datos (plan Pro), no acá.
// Prioridad del grupo: switch_articulo_diario es IRRECUPERABLE de Switch (el
// API solo da el stock del día — el histórico diario solo existe acá); el
// resto es re-hidratable por backfill pero costoso (sesión única, horas).
// La corrida switch NO repite la réplica de Storage ni la retención (las hace
// core); sí replica sus archivos a R2. Heartbeat propio: "backup-switch".
//
// Passwords: fg_users se respalda SIN password en fg_users.ndjson.gz y los
// hashes van aparte en fg_users_auth.ndjson.gz (mismo bucket privado) para que
// un restore no deje a todos sin login.
//
// Storage: réplica incremental de los buckets con archivos subidos a mano
// (comprobantes, fotos, adjuntos) a backups/_storage/<bucket>/<path>, guiada
// por un manifest — solo copia lo nuevo/cambiado desde el último backup.
//
// GRUPO STORAGE (?grupo=storage, jul-2026): réplica OFF-SITE de esos mismos
// archivos a R2 (_storage/<bucket>/<path>). Hasta ahora los ~3.2K archivos
// (198 MB: fotos de producto, facturas de reclamos, adjuntos de marketing) solo
// existían dentro de Supabase — la "réplica" era bucket→bucket del MISMO
// proyecto, es decir cero red de seguridad si se pierde el proyecto. Va en
// invocación aparte y no en la corrida core con números medidos (25-jul-2026):
// la core arrancó 08:33:12 y registró heartbeat 08:37:20 → 248s de los 300s de
// Hobby, con la réplica a Supabase agotando sus 240s de presupuesto y dejando
// 2.765 archivos pendientes. No hay hueco: meter R2+Storage ahí recortaría el
// backup de datos. Heartbeat propio: "backup-storage".
//
// Off-site: réplica de los NDJSON.gz + los meta.json a Cloudflare R2
// (S3-compatible), incremental por manifest de hashes (src/lib/backup/r2.ts),
// con paths POR FECHA (data/YYYY-MM-DD/...) y verificación HEAD post-subida.
// Si faltan las env vars R2_* se omite sin afectar el backup a Supabase.
//
// Retención:
// - Supabase Storage: RETENTION_DAYS = 21 días (bajó de 30 en jul-2026 — el
//   histórico largo vive ahora en R2, que es gratis hasta 10 GB).
// - R2: política propuesta RETENCION_R2 (14 diarios + 8 semanales/lunes + 24
//   mensuales/día 1 ≈ 46 carpetas × ~30 MB ≈ 1.4 GB). Este cron la CALCULA y la
//   reporta (campo `retencionR2` de la respuesta) pero NO BORRA NADA en R2. Un
//   lifecycle rule de Cloudflare no sabe hacer abuelo-padre-hijo (es por
//   prefijo+edad), así que la poda tiene que ser código: queda para un PR
//   aparte, con la lógica ya escrita y testeada en r2RetentionPlan().
//
// Restore: scripts/restore.mjs (ver header del script para uso y prueba).
// Desde jul-2026 acepta --source r2 (lee los mismos objetos desde R2).
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { gzipSync } from "zlib";
import { supabaseServer } from "@/lib/supabase-server";
import { recordCronHeartbeat, logCronError, cronSuccessHoyUtc } from "@/lib/cron-telemetry";
import { verifySession } from "@/lib/session-cookie";
import {
  replicateBackupToR2,
  replicateStorageToR2,
  r2DataKey,
  listR2DataDates,
  r2RetentionPlan,
  type R2BackupFile,
  type R2LazyFile,
  type R2ReplicaResult,
} from "@/lib/backup/r2";

const CRON_NAME = "backup";
const BUCKET = "backups";
// Retención del histórico DENTRO de Supabase Storage. Bajó de 30 a 21 días
// (jul-2026): 3 semanas cubren cualquier "esto se rompió y nadie lo vio" con
// colchón, y el histórico largo ahora vive en R2 con política propia
// (RETENCION_R2: 14 diarios + 8 semanales + 24 mensuales).
const RETENTION_DAYS = 21;
const PAGE = 1000;

export const dynamic = "force-dynamic";
// supabase-js usa fetch() y el App Router lo cachea (Data Cache) — sin esto las
// lecturas pueden quedar pegadas a un snapshot viejo (ver switch-reconciliacion).
export const fetchCache = "force-no-store";
// Tope del plan Hobby. El backup completo (~60 páginas + ~45 uploads) corre en
// mucho menos, pero sin esto Vercel corta a los 10s default.
export const maxDuration = 800; // techo del plan (Pro + Fluid)

interface Dataset {
  table: string;
  /** Columnas a respaldar (default "*"). */
  select?: string;
  /** Nombre de archivo si difiere de la tabla (ej. fg_users_auth). */
  file?: string;
}

// Tablas manuales/config — backup COMPLETO, sin ventanas de tiempo.
const DATASETS: Dataset[] = [
  // CXC
  { table: "cxc_uploads" },
  { table: "cxc_rows" },
  { table: "cxc_client_overrides" },
  { table: "cxc_favorites" },
  { table: "cxc_contact_log" },
  // Ventas legacy (congelada, NO re-derivable de Switch)
  { table: "ventas_raw" },
  // Cheques
  { table: "cheques" },
  // Reclamos + relacionadas
  { table: "reclamos" },
  { table: "reclamo_items" },
  { table: "reclamo_settlements" },
  { table: "reclamo_contactos" },
  { table: "reclamo_fotos" },
  { table: "reclamo_seguimiento" },
  // Guías
  { table: "guia_transporte" },
  { table: "guia_items" },
  // Caja
  { table: "caja_periodos" },
  { table: "caja_gastos" },
  { table: "caja_categorias" },
  { table: "caja_responsables" },
  // Préstamos (todos los estados, no solo activos)
  { table: "prestamos_empleados" },
  { table: "prestamos_movimientos" },
  // Clientes
  { table: "directorio_clientes" },
  { table: "clientes_master" },
  // Marketing completo
  { table: "mk_facturas" },
  { table: "mk_marcas" },
  { table: "mk_proyectos" },
  { table: "mk_proyecto_marcas" },
  { table: "mk_factura_marcas" },
  { table: "mk_entregas_muebles" },
  { table: "mk_entrega_items" },
  { table: "mk_inventario_productos" },
  { table: "mk_adjuntos" },
  { table: "marca_formulas" },
  { table: "marca_rubro_formulas" },
  // Pedidos Reebok (creados por clientes)
  { table: "reebok_orders" },
  { table: "reebok_order_items" },
  { table: "reebok_pedidos_publicos" },
  // Packing lists (la purga física a 90d los borra de la DB; el backup retiene)
  { table: "packing_lists" },
  { table: "pl_items" },
  // Comisiones / vendedores / metas
  { table: "comision_vendedor_tasa" },
  { table: "vendedores" },
  { table: "vendor_assignments" },
  { table: "ventas_metas" },
  // Config / sistema
  { table: "role_permissions" },
  { table: "app_settings" },
  { table: "contactos_email" },
  { table: "transportistas" },
  // Usuarios: datos sin password + hashes en archivo aparte
  {
    table: "fg_users",
    select:
      "id, name, role, active, associated_company, created_at, updated_at, is_owner, modulos_override",
  },
  { table: "fg_users", select: "id, name, password", file: "fg_users_auth" },
];

// Tablas del grupo SWITCH (?grupo=switch) — cachés sincronizadas desde Switch.
// switch_articulo_diario primero: es la irrecuperable (si la corrida muriera a
// mitad, lo más valioso ya quedó subido).
const SWITCH_DATASETS: Dataset[] = [
  { table: "switch_articulo_diario" },
  { table: "switch_facturas" },
  { table: "switch_recibos" },
  { table: "switch_estadocuenta" },
  { table: "switch_factura_utilidad" },
  { table: "switch_proveedor_estadocuenta" },
  { table: "switch_clientes" },
  { table: "multifashion_tickets" },
];

// ── Réplica incremental de buckets de Storage ────────────────────────────────
// Copia archivos nuevos/cambiados de los buckets fuente a backups/_storage/
// (prefijo estable, fuera del patrón YYYY-MM-DD → la retención no lo toca).
// Un manifest (path → size|updated_at) evita re-subir lo que no cambió.
// reclamo-zips-privado se excluye: son exports generados, re-derivables.
const STORAGE_REPLICA_BUCKETS = [
  "reclamo-fotos",
  "reclamo-facturas",
  "product-images",
  "joybees-photos",
  "marketing",
];
const STORAGE_PREFIX = "_storage";
const MANIFEST_PATH = `${STORAGE_PREFIX}/manifest.json`;
// Presupuesto de tiempo de la réplica (arranca tras los datasets): si no
// alcanza, lo que falte queda "pendiente" y se copia en la corrida siguiente
// (el manifest solo registra lo efectivamente copiado). Deja headroom para
// meta.json + limpieza dentro de los 800s de Pro (antes 240s de 300).
const REPLICA_DEADLINE_MS = 700_000;
// Réplica off-site a Cloudflare R2 (src/lib/backup/r2.ts): corre tras la
// réplica de Storage; el set completo pesa ~7 MB gz (~10-25s en subir), así
// que 740s desde el arranque deja 60s de headroom para meta.json + limpieza.
// Lo que no alcance queda pendiente y el manifest lo recupera mañana.
// (La corrida core midió 248s el 25-jul: estos topes son protección, no el
// camino normal — subirlos solo agranda el margen antes de dejar pendientes.)
const R2_DEADLINE_MS = 740_000;
// Presupuesto del grupo ?grupo=storage (invocación propia, 800s enteros para
// él): ~60s se van listando los 5 buckets (~420 llamadas list, el árbol de
// tommy tiene 389 subcarpetas) y el resto copia archivos. Lo que no entre queda
// pendiente y lo toma la corrida siguiente (manifest = catch-up automático).
const STORAGE_R2_DEADLINE_MS = 740_000;
// Ventana del manifest de DATOS en R2. Solo sirve para el catch-up del mismo
// día (paths con fecha ⇒ mañana son keys nuevos): 7 días bastan y evitan que
// crezca ~57 keys/día para siempre.
const R2_MANIFEST_DIAS = 7;
/** Path (estable, fuera de las carpetas de fecha) del resumen de la réplica
 *  off-site de Storage — para poder auditarla sin credenciales de R2. */
const STORAGE_R2_META_PATH = `${STORAGE_PREFIX}/meta-r2.json`;

// Columna(s) de orden para paginación estable (PostgREST Range sin order NO es
// determinista). Default: "id". Excepciones = tablas cuya PK no es "id".
const ORDER_BY: Record<string, string[]> = {
  comision_vendedor_tasa: ["vendedor_nombre"],
  vendedores: ["empresa_key", "nombre"],
  app_settings: ["key"],
};

/** Trae TODAS las filas de una tabla paginando de a PAGE con orden estable,
 *  acumulando NDJSON por página. No retiene los objetos: switch_articulo_diario
 *  son ~197K filas (~72MB de NDJSON) — retener el array de objetos y además el
 *  string duplicaría el pico de memoria de la función. */
async function fetchTableNdjson(table: string, select: string): Promise<{ ndjson: string; rows: number }> {
  const orderCols = ORDER_BY[table] || ["id"];
  const parts: string[] = [];
  let count = 0;
  for (let from = 0; ; from += PAGE) {
    let query = supabaseServer.from(table).select(select);
    for (const col of orderCols) query = query.order(col, { ascending: true });
    const { data, error } = await query.range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    for (const r of data ?? []) parts.push(JSON.stringify(r));
    count += (data ?? []).length;
    if (!data || data.length < PAGE) break;
  }
  return { ndjson: parts.join("\n"), rows: count };
}

interface FileEntry {
  path: string;
  size: number;
  updated_at: string;
  mimetype: string;
}

/** Lista TODOS los archivos de un bucket, recursivo (el list de Storage es por carpeta). */
async function listAllFiles(bucket: string, prefix = ""): Promise<FileEntry[]> {
  const { data, error } = await supabaseServer.storage.from(bucket).list(prefix, { limit: 1000 });
  if (error) throw new Error(`list ${bucket}/${prefix}: ${error.message}`);
  const out: FileEntry[] = [];
  for (const e of data || []) {
    const path = prefix ? `${prefix}/${e.name}` : e.name;
    if (!e.id) {
      // Carpeta → descender
      out.push(...(await listAllFiles(bucket, path)));
    } else {
      out.push({
        path,
        size: (e.metadata as { size?: number } | null)?.size ?? 0,
        updated_at: e.updated_at || e.created_at || "",
        mimetype: (e.metadata as { mimetype?: string } | null)?.mimetype || "application/octet-stream",
      });
    }
  }
  return out;
}

/** Réplica incremental de STORAGE_REPLICA_BUCKETS a backups/_storage/. */
async function replicateStorage(deadline: number) {
  let manifest: Record<string, string> = {};
  const { data: mf } = await supabaseServer.storage.from(BUCKET).download(MANIFEST_PATH);
  if (mf) {
    try { manifest = JSON.parse(await mf.text()); } catch { manifest = {}; }
  }

  let copiados = 0;
  let bytes = 0;
  let pendientes = 0;
  const errores: string[] = [];

  for (const bucket of STORAGE_REPLICA_BUCKETS) {
    let files: FileEntry[];
    try {
      files = await listAllFiles(bucket);
    } catch (e) {
      errores.push(e instanceof Error ? e.message : String(e));
      continue;
    }
    for (const f of files) {
      const key = `${bucket}/${f.path}`;
      const sig = `${f.size}|${f.updated_at}`;
      if (manifest[key] === sig) continue; // sin cambios desde el último backup
      if (Date.now() > deadline) {
        pendientes++;
        continue;
      }
      try {
        const { data: blob, error: dlErr } = await supabaseServer.storage.from(bucket).download(f.path);
        if (dlErr || !blob) throw new Error(dlErr?.message || "download vacío");
        const buf = Buffer.from(await blob.arrayBuffer());
        const { error: upErr } = await supabaseServer.storage
          .from(BUCKET)
          .upload(`${STORAGE_PREFIX}/${key}`, buf, { contentType: f.mimetype, upsert: true });
        if (upErr) throw new Error(upErr.message);
        manifest[key] = sig;
        copiados++;
        bytes += buf.length;
      } catch (e) {
        errores.push(`${key}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  // Manifest refleja SOLO lo copiado con éxito → lo fallido/pendiente se
  // reintenta en la corrida siguiente.
  const { error: mfErr } = await supabaseServer.storage
    .from(BUCKET)
    .upload(MANIFEST_PATH, Buffer.from(JSON.stringify(manifest), "utf-8"), {
      contentType: "application/json",
      upsert: true,
    });
  if (mfErr) errores.push(`manifest: ${mfErr.message}`);

  return { copiados, bytes, pendientes, errores };
}

// ── Réplica OFF-SITE de los buckets de Storage a R2 (?grupo=storage) ─────────
/**
 * Lista los mismos buckets que replicateStorage() y los replica a R2 bajo
 * `_storage/<bucket>/<path>`, con descarga PEREZOSA: la firma (`size|updated_at`)
 * se conoce del listado, así que solo se baja de Supabase lo que de verdad hay
 * que subir. Lee de los buckets ORIGEN (no de la réplica backups/_storage/) a
 * propósito: encadenar dos réplicas que van atrasadas dejaría R2 esperando a que
 * la de Supabase se ponga al día.
 */
async function replicateStorageOffsite(deadline: number) {
  const files: R2LazyFile[] = [];
  const errores: string[] = [];
  let inventarioBytes = 0;

  for (const bucket of STORAGE_REPLICA_BUCKETS) {
    let entradas: FileEntry[];
    try {
      entradas = await listAllFiles(bucket);
    } catch (e) {
      errores.push(e instanceof Error ? e.message : String(e));
      continue;
    }
    for (const f of entradas) {
      inventarioBytes += f.size;
      files.push({
        key: `${STORAGE_PREFIX}/${bucket}/${f.path}`,
        sig: `${f.size}|${f.updated_at}`,
        contentType: f.mimetype,
        load: async () => {
          const { data: blob, error } = await supabaseServer.storage.from(bucket).download(f.path);
          if (error || !blob) throw new Error(error?.message || "download vacío");
          return Buffer.from(await blob.arrayBuffer());
        },
      });
    }
  }

  const r2 = await replicateStorageToR2(files, deadline);
  return {
    inventario: { archivos: files.length, bytes: inventarioBytes },
    r2,
    errores: [...errores, ...r2.errores],
  };
}

export async function GET(req: NextRequest) {
  // Auth: cron secret or admin session
  const secret = req.headers.get("authorization")?.replace("Bearer ", "") || req.headers.get("x-cron-secret") || req.nextUrl.searchParams.get("secret");
  let authorized = secret === process.env.CRON_SECRET;
  if (!authorized) {
    try {
      if (verifySession(req.cookies.get("cxc_session")?.value)?.role === "admin") {
        authorized = true;
      }
    } catch { /* */ }
  }
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Grupo: sin param = CORE (manuales/config); ?grupo=switch = cachés switch_*
  // + multifashion_tickets; ?grupo=storage = réplica off-site de los buckets a
  // R2. Cada uno en invocación aparte (ver header).
  const grupoParam = req.nextUrl.searchParams.get("grupo");
  if (grupoParam !== null && grupoParam !== "switch" && grupoParam !== "storage") {
    return NextResponse.json({ error: "grupo inválido (solo: switch, storage)" }, { status: 400 });
  }
  const esGrupoSwitch = grupoParam === "switch";
  const esGrupoStorage = grupoParam === "storage";
  const cronName = esGrupoSwitch ? "backup-switch" : esGrupoStorage ? "backup-storage" : CRON_NAME;
  const datasets = esGrupoSwitch ? SWITCH_DATASETS : DATASETS;

  // Segunda oportunidad (jul-2026): cada grupo tiene ≥2 entradas en vercel.json
  // (core 06:00/10:30/18:30, switch 06:45/11:15/19:15, storage 04:00/15:30 UTC).
  // Si una ya registró success HOY (día UTC), las siguientes no repiten el
  // trabajo — responden no-op. Una corrida manual (?force=1) lo salta. El guard
  // es por-grupo (heartbeat propio).
  if (req.nextUrl.searchParams.get("force") !== "1" && (await cronSuccessHoyUtc(cronName))) {
    return NextResponse.json({ ok: true, grupo: grupoParam ?? "core", skipped: "ya corrió con éxito hoy (entrada extra no-op)" });
  }

  const startMs = Date.now();
  const now = new Date();
  const today = now.toISOString().slice(0, 10);

  // ── Grupo STORAGE: solo réplica off-site de archivos a R2 ─────────────────
  // Sin datasets, sin réplica interna a Supabase y sin retención (esas son de
  // la corrida core). Salvo que R2 no esté configurado: ahí no hay nada que
  // hacer y responde no-op explícito (no registra heartbeat: no hubo backup).
  if (esGrupoStorage) {
    const storageR2 = await replicateStorageOffsite(startMs + STORAGE_R2_DEADLINE_MS);
    if (!storageR2.r2.enabled) {
      return NextResponse.json({ ok: true, grupo: "storage", skipped: storageR2.r2.nota });
    }
    // Resumen auditable sin credenciales de R2 (path estable, la retención de
    // carpetas de fecha no lo toca). Si falla, es housekeeping: no tumba nada.
    const metaStorage = {
      grupo: "storage",
      timestamp: now.toISOString(),
      destino: "cloudflare-r2",
      inventario: storageR2.inventario,
      r2: storageR2.r2,
    };
    const { error: metaErr } = await supabaseServer.storage
      .from(BUCKET)
      .upload(STORAGE_R2_META_PATH, Buffer.from(JSON.stringify(metaStorage, null, 2), "utf-8"), {
        contentType: "application/json",
        upsert: true,
      });
    if (metaErr) console.error("[backup-storage] meta-r2.json:", metaErr.message);

    if (storageR2.errores.length > 0) {
      const detalle = storageR2.errores.join("; ");
      console.error("[backup-storage] réplica R2 con errores:", detalle);
      await logCronError("backup_storage_r2", detalle);
    }
    // Éxito aunque queden pendientes: el manifest los recupera en la corrida
    // siguiente (mismo contrato que la réplica interna). Solo un fallo de
    // listado/subida generalizado (errores) queda registrado arriba.
    await recordCronHeartbeat(cronName);
    return NextResponse.json({ ok: true, grupo: "storage", date: today, ...storageR2 });
  }

  const results: Array<{ file: string; table: string; rows: number; bytes: number }> = [];
  const errores: Array<{ file: string; error: string }> = [];
  let totalBytes = 0;
  // Mismos bytes que van a Supabase, para la réplica off-site a R2. Paths CON
  // FECHA (data/YYYY-MM-DD/<archivo>): antes eran estables y cada corrida
  // sobreescribía → R2 tenía un único punto en el tiempo.
  const r2Files: R2BackupFile[] = [];

  // Un dataset a la vez: fetch paginado → NDJSON → gzip → upload → liberar.
  // Si uno falla, se registra y se sigue con el resto (backup parcial > nada).
  for (const ds of datasets) {
    const file = ds.file || ds.table;
    try {
      const { ndjson, rows } = await fetchTableNdjson(ds.table, ds.select || "*");
      const gz = gzipSync(Buffer.from(ndjson, "utf-8"));
      const { error: upErr } = await supabaseServer.storage
        .from(BUCKET)
        .upload(`${today}/${file}.ndjson.gz`, gz, {
          contentType: "application/gzip",
          upsert: true,
        });
      if (upErr) throw new Error(`upload ${file}: ${upErr.message}`);
      results.push({ file, table: ds.table, rows, bytes: gz.length });
      totalBytes += gz.length;
      r2Files.push({ key: r2DataKey(today, `${file}.ndjson.gz`), body: gz });
    } catch (e) {
      errores.push({ file, error: e instanceof Error ? e.message : String(e) });
    }
  }

  // Réplica incremental de buckets (con presupuesto de tiempo; lo pendiente
  // se copia en la próxima corrida). Solo la corrida CORE: la de switch no
  // toca Storage (sería trabajo duplicado el mismo día).
  const storage = esGrupoSwitch
    ? { copiados: 0, bytes: 0, pendientes: 0, errores: [] as string[] }
    : await replicateStorage(startMs + REPLICA_DEADLINE_MS);
  for (const err of storage.errores) {
    errores.push({ file: `storage:${err.slice(0, 120)}`, error: err });
  }

  // Réplica off-site a Cloudflare R2 (best-effort): si faltan las env vars
  // R2_* se omite en silencio; si falla a mitad, el backup a Supabase ya está
  // a salvo → alerta Telegram SIN marcar el backup como fallido (nada de R2
  // entra a `errores`, que dispararía el 500). El manifest en R2 hace
  // catch-up de lo pendiente/fallido en la corrida siguiente.
  const manifestCutoff = new Date(now.getTime() - R2_MANIFEST_DIAS * 86400000)
    .toISOString()
    .slice(0, 10);
  const r2 = await replicateBackupToR2(r2Files, startMs + R2_DEADLINE_MS, {
    pruneBefore: manifestCutoff,
  });

  // Índice del backup del día (lo lee scripts/restore.mjs): meta.json para el
  // core, meta-switch.json para el grupo switch (mismo folder de fecha).
  const metaFile = esGrupoSwitch ? "meta-switch.json" : "meta.json";
  const meta = {
    format: "v2-ndjson-gz",
    date: today,
    grupo: grupoParam ?? "core",
    timestamp: now.toISOString(),
    datasets: results,
    storage: { copiados: storage.copiados, bytes: storage.bytes, pendientes: storage.pendientes },
    // Nota: refleja la fase de DATOS. La subida del propio meta a R2 va después
    // (no puede contarse a sí misma) y su resultado sale en la respuesta HTTP.
    r2,
    errores,
  };
  const metaBuf = Buffer.from(JSON.stringify(meta, null, 2), "utf-8");
  const { error: metaErr } = await supabaseServer.storage
    .from(BUCKET)
    .upload(`${today}/${metaFile}`, metaBuf, {
      contentType: "application/json",
      upsert: true,
    });
  if (metaErr) errores.push({ file: metaFile, error: metaErr.message });

  // El meta TAMBIÉN va a R2 (bloqueante duro que faltaba: sin él restore.mjs no
  // puede correr desde R2 — es su índice de datasets y de filas esperadas).
  // Bytes idénticos a los de Supabase para que ambas copias coincidan.
  const r2Meta = await replicateBackupToR2([{ key: r2DataKey(today, metaFile), body: metaBuf }], startMs + R2_DEADLINE_MS, {
    pruneBefore: manifestCutoff,
  });
  const r2Total: R2ReplicaResult = {
    ...r2,
    subidos: r2.subidos + r2Meta.subidos,
    bytes: r2.bytes + r2Meta.bytes,
    omitidos: r2.omitidos + r2Meta.omitidos,
    verificados: r2.verificados + r2Meta.verificados,
    reparados: r2.reparados + r2Meta.reparados,
    pendientes: r2.pendientes + r2Meta.pendientes,
    errores: [...r2.errores, ...r2Meta.errores],
  };

  // Errores de R2 (best-effort): el backup a Supabase ya está a salvo → alerta
  // Telegram SIN marcar el backup como fallido (nada de R2 entra a `errores`,
  // que dispararía el 500). El manifest hace catch-up en la corrida siguiente.
  if (r2Total.enabled && r2Total.errores.length > 0) {
    const detalleR2 = r2Total.errores.join("; ");
    console.error(`[${cronName}] réplica R2 con errores:`, detalleR2);
    await logCronError(`${cronName.replace(/-/g, "_")}_r2`, detalleR2);
  }

  if (errores.length > 0) {
    const detalle = errores.map((e) => `${e.file}: ${e.error}`).join("; ");
    console.error(`[${cronName}] datasets con error:`, detalle);
    // Backup incompleto → alerta Telegram y 500 (sin heartbeat → health-crons lo marca stale).
    await logCronError(`${cronName.replace(/-/g, "_")}_incompleto`, detalle);
    return NextResponse.json(
      { ok: false, grupo: grupoParam ?? "core", date: today, datasets: results.length, errores },
      { status: 500 },
    );
  }

  // Inventario de fechas en R2 (lectura pura, para el informe de retención).
  const fechasR2 = esGrupoSwitch ? [] : await listR2DataDates();

  // Limpieza de backups > RETENTION_DAYS (carpetas de fecha + legacy flat files).
  // Solo la corrida CORE (borra la carpeta de fecha completa, incluye los
  // archivos del grupo switch del mismo día — no hace falta duplicarla).
  // Housekeeping: si falla, solo log a consola (se reintenta mañana, no alerta).
  if (!esGrupoSwitch) try {
    const cutoff = new Date(now.getTime() - RETENTION_DAYS * 86400000).toISOString().slice(0, 10);
    const { data: entries } = await supabaseServer.storage.from(BUCKET).list("", { limit: 1000 });
    const removePaths: string[] = [];
    for (const e of entries || []) {
      // Carpetas de fecha (YYYY-MM-DD): borrar su contenido si son viejas.
      if (/^\d{4}-\d{2}-\d{2}$/.test(e.name) && e.name < cutoff) {
        const { data: inner } = await supabaseServer.storage.from(BUCKET).list(e.name, { limit: 1000 });
        for (const f of inner || []) removePaths.push(`${e.name}/${f.name}`);
      }
      // Legacy flat: backup_YYYY-MM-DD.json en la raíz.
      const legacy = e.name.match(/^backup_(\d{4}-\d{2}-\d{2})\.json$/);
      if (legacy && legacy[1] < cutoff) removePaths.push(e.name);
    }
    if (removePaths.length > 0) {
      await supabaseServer.storage.from(BUCKET).remove(removePaths);
    }
  } catch (e) {
    console.error("[backup] cleanup error:", e instanceof Error ? e.message : String(e));
  }

  // Retención en R2, SOLO INFORME (este PR no borra nada allá): cuántas
  // carpetas de fecha conservaría RETENCION_R2 y cuáles sobran. Ver header.
  const retencionR2 = esGrupoSwitch
    ? undefined
    : (() => {
        const plan = r2RetentionPlan(fechasR2);
        return { presentes: fechasR2.length, conservaria: plan.keep.length, sobrarian: plan.borrar };
      })();

  await recordCronHeartbeat(cronName);
  return NextResponse.json({
    ok: true,
    grupo: grupoParam ?? "core",
    date: today,
    datasets: results.length,
    totalRows: results.reduce((s, r) => s + r.rows, 0),
    totalBytes,
    storage,
    r2: r2Total,
    retencionR2,
    counts: Object.fromEntries(results.map((r) => [r.file, r.rows])),
  });
}

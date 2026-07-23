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
// (Supabase + R2, ~20-40MB gz). La corrida core ya presupuesta hasta 280s de
// los 300s de Hobby (réplica Storage 240s + R2 280s) → meterlas ahí arriesga
// recortar la réplica a diario. En invocación aparte cada grupo tiene sus 300s.
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
// Off-site: réplica de los mismos NDJSON.gz a Cloudflare R2 (S3-compatible),
// incremental por manifest de hashes (src/lib/backup/r2.ts). Si faltan las
// env vars R2_* se omite sin afectar el backup a Supabase.
//
// Restore: scripts/restore.mjs (ver header del script para uso y prueba).
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { gzipSync } from "zlib";
import { supabaseServer } from "@/lib/supabase-server";
import { recordCronHeartbeat, logCronError, cronSuccessHoyUtc } from "@/lib/cron-telemetry";
import { verifySession } from "@/lib/session-cookie";
import { replicateBackupToR2, type R2BackupFile } from "@/lib/backup/r2";

const CRON_NAME = "backup";
const BUCKET = "backups";
const RETENTION_DAYS = 30;
const PAGE = 1000;

export const dynamic = "force-dynamic";
// supabase-js usa fetch() y el App Router lo cachea (Data Cache) — sin esto las
// lecturas pueden quedar pegadas a un snapshot viejo (ver switch-reconciliacion).
export const fetchCache = "force-no-store";
// Tope del plan Hobby. El backup completo (~60 páginas + ~45 uploads) corre en
// mucho menos, pero sin esto Vercel corta a los 10s default.
export const maxDuration = 300;

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
// meta.json + limpieza dentro de los 300s de Hobby.
const REPLICA_DEADLINE_MS = 240_000;
// Réplica off-site a Cloudflare R2 (src/lib/backup/r2.ts): corre tras la
// réplica de Storage; el set completo pesa ~7 MB gz (~10-25s en subir), así
// que 280s desde el arranque deja 20s de headroom para meta.json + limpieza.
// Lo que no alcance queda pendiente y el manifest lo recupera mañana.
const R2_DEADLINE_MS = 280_000;

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

  // Grupo de tablas: sin param = CORE (manuales/config); ?grupo=switch = cachés
  // switch_* + multifashion_tickets en invocación aparte (ver header).
  const grupoParam = req.nextUrl.searchParams.get("grupo");
  if (grupoParam !== null && grupoParam !== "switch") {
    return NextResponse.json({ error: "grupo inválido (solo: switch)" }, { status: 400 });
  }
  const esGrupoSwitch = grupoParam === "switch";
  const cronName = esGrupoSwitch ? "backup-switch" : CRON_NAME;
  const datasets = esGrupoSwitch ? SWITCH_DATASETS : DATASETS;

  // Segunda oportunidad (jul-2026): cada grupo tiene 2 entradas en vercel.json
  // (core 06:00/18:30, switch 06:45/19:15 UTC). Si la 1ª ya registró success
  // HOY (día UTC), la 2ª no repite el trabajo — responde no-op. Una corrida
  // manual (?force=1) lo salta. El guard es por-grupo (heartbeat propio).
  if (req.nextUrl.searchParams.get("force") !== "1" && (await cronSuccessHoyUtc(cronName))) {
    return NextResponse.json({ ok: true, grupo: grupoParam ?? "core", skipped: "ya corrió con éxito hoy (2ª entrada no-op)" });
  }

  const startMs = Date.now();
  const now = new Date();
  const today = now.toISOString().slice(0, 10);

  const results: Array<{ file: string; table: string; rows: number; bytes: number }> = [];
  const errores: Array<{ file: string; error: string }> = [];
  let totalBytes = 0;
  // Mismos bytes que van a Supabase, para la réplica off-site a R2 (paths
  // estables data/<archivo>.ndjson.gz — sin fecha; R2 guarda "el último").
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
      r2Files.push({ key: `data/${file}.ndjson.gz`, body: gz });
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
  const r2 = await replicateBackupToR2(r2Files, startMs + R2_DEADLINE_MS);
  if (r2.enabled && r2.errores.length > 0) {
    const detalleR2 = r2.errores.join("; ");
    console.error(`[${cronName}] réplica R2 con errores:`, detalleR2);
    await logCronError(`${cronName.replace(/-/g, "_")}_r2`, detalleR2);
  }

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
    r2,
    errores,
  };
  const { error: metaErr } = await supabaseServer.storage
    .from(BUCKET)
    .upload(`${today}/${metaFile}`, Buffer.from(JSON.stringify(meta, null, 2), "utf-8"), {
      contentType: "application/json",
      upsert: true,
    });
  if (metaErr) errores.push({ file: metaFile, error: metaErr.message });

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

  await recordCronHeartbeat(cronName);
  return NextResponse.json({
    ok: true,
    grupo: grupoParam ?? "core",
    date: today,
    datasets: results.length,
    totalRows: results.reduce((s, r) => s + r.rows, 0),
    totalBytes,
    storage,
    r2,
    counts: Object.fromEntries(results.map((r) => [r.file, r.rows])),
  });
}

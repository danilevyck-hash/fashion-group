// ─────────────────────────────────────────────────────────────────────────────
// Réplica off-site del backup diario a Cloudflare R2 (S3-compatible, tier
// gratis 10 GB). La llaman las 3 entradas de /api/cron/backup:
//   - core          → data/<fecha>/<tabla>.ndjson.gz + data/<fecha>/meta.json
//   - ?grupo=switch → data/<fecha>/switch_*.ndjson.gz + meta-switch.json
//   - ?grupo=storage→ _storage/<bucket>/<path> (fotos, facturas, adjuntos)
//
// Diseño (jul-2026, PR "R2 red real"):
// - Paths CON FECHA para los datos: data/YYYY-MM-DD/<archivo>. Antes eran
//   estables (data/<archivo>.ndjson.gz) → cada corrida sobreescribía y R2 tenía
//   UN solo punto en el tiempo: un borrado lógico replicado hoy dejaba el backup
//   off-site igual de roto. Ahora hay historia real (retención en RETENCION_R2).
// - meta.json / meta-switch.json TAMBIÉN se replican: sin el meta,
//   scripts/restore.mjs no puede correr desde R2 (es su índice de datasets).
// - Los archivos de Storage van a paths ESTABLES (_storage/<bucket>/<path>):
//   son binarios inmutables identificados por contenido — versionarlos por
//   fecha multiplicaría 198 MB por día sin ganar nada.
// - Manifest en R2 (key → "size|sha256") — solo se sube lo que cambió. Con
//   paths por fecha eso cubre el catch-up del MISMO día (2ª/3ª entrada y
//   pendientes por deadline); el manifest de datos se poda por fecha para no
//   crecer sin límite.
// - VERIFICACIÓN POST-SUBIDA (HEAD): tras cada PUT se confirma que el objeto
//   existe y pesa lo esperado. Sin esto un PUT "200 pero vacío" quedaba en el
//   manifest y jamás se reintentaba.
// - VERIFICACIÓN DE LO OMITIDO (HEAD muestreado): un key con firma igual en el
//   manifest se omite; si alguien borró el objeto en R2, se omitía PARA SIEMPRE
//   y el cron reportaba éxito. Ahora los omitidos se verifican (todos para los
//   datos —son ~57—, una ventana rotativa para los ~3.2K de Storage) y lo que
//   no exista se re-sube.
// - Presupuesto de tiempo (deadline): lo que no alcance queda "pendiente" y se
//   sube en la corrida siguiente (el manifest solo registra lo verificado).
//
// Fail-safe: si faltan las env vars R2_* → enabled:false con nota, sin tocar
// la red (el backup a Supabase NO depende de R2). Ningún error de R2 lanza:
// todo se acumula en `errores` y el caller decide cómo alertar (Telegram).
//
// Env vars: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
// (+ opcional R2_ENDPOINT para pasar el endpoint completo; default
// https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com).
//
// Cliente S3: aws4fetch (~6KB, firma SigV4 sobre fetch) en vez de
// @aws-sdk/client-s3 (varios MB) — pesa casi nada en el bundle serverless.
// ─────────────────────────────────────────────────────────────────────────────

import { createHash } from "crypto";
import { AwsClient } from "aws4fetch";

/** Archivo a replicar con los bytes ya en memoria. */
export interface R2BackupFile {
  key: string;
  body: Buffer;
  /** Content-Type explícito (default: deducido de la extensión). */
  contentType?: string;
}

/** Archivo a replicar con descarga PEREZOSA: la firma se conoce sin bajar los
 *  bytes (size + updated_at de Storage), así solo se descarga lo que hay que
 *  subir de verdad. Sin esto, replicar 3.2K fotos exigiría bajarlas todas. */
export interface R2LazyFile {
  key: string;
  /** Firma estable del contenido ("size|updated_at" o "size|sha256"). */
  sig: string;
  contentType?: string;
  load: () => Promise<Buffer>;
}

export interface R2ReplicaResult {
  /** false = env vars ausentes → skip silencioso (ver nota). */
  enabled: boolean;
  nota?: string;
  subidos: number;
  bytes: number;
  /** Sin cambios desde la última réplica (misma firma en el manifest). */
  omitidos: number;
  /** Omitidos que además se verificaron con HEAD en esta corrida. */
  verificados: number;
  /** Estaban en el manifest pero YA NO en R2 → se re-subieron (agujero cerrado). */
  reparados: number;
  /** No alcanzó el presupuesto de tiempo; se suben en la próxima corrida. */
  pendientes: number;
  errores: string[];
}

/** Manifest de los archivos de datos (keys con fecha). */
export const R2_MANIFEST_KEY = "manifest.json";
/** Manifest de la réplica de Storage (keys estables _storage/…). */
export const R2_STORAGE_MANIFEST_KEY = "manifest-storage.json";
/** Prefijo de los archivos de datos con fecha. */
export const R2_DATA_PREFIX = "data";
/** Prefijo de la réplica de archivos de Supabase Storage. */
export const R2_STORAGE_PREFIX = "_storage";

/** Key en R2 de un archivo de datos del backup de `date` (YYYY-MM-DD). */
export function r2DataKey(date: string, file: string): string {
  return `${R2_DATA_PREFIX}/${date}/${file}`;
}

interface R2Config {
  client: AwsClient;
  /** https://<endpoint>/<bucket> — base para armar la URL de cada objeto. */
  baseUrl: string;
}

function getConfig(): R2Config | null {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET;
  const endpoint =
    process.env.R2_ENDPOINT ||
    (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : "");
  if (!accessKeyId || !secretAccessKey || !bucket || !endpoint) return null;
  return {
    client: new AwsClient({ accessKeyId, secretAccessKey, region: "auto", service: "s3" }),
    baseUrl: `${endpoint.replace(/\/+$/, "")}/${bucket}`,
  };
}

/** true si las env vars R2 están configuradas. */
export function r2Configured(): boolean {
  return getConfig() !== null;
}

/** Firma del contenido para el manifest: "size|sha256hex". */
export function fileSignature(body: Buffer): string {
  return `${body.length}|${createHash("sha256").update(body).digest("hex")}`;
}

function contentTypeFor(key: string): string {
  if (key.endsWith(".gz")) return "application/gzip";
  if (key.endsWith(".json")) return "application/json";
  return "application/octet-stream";
}

async function readBodySafe(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 200);
  } catch {
    return "";
  }
}

// ── Poda del manifest de datos ───────────────────────────────────────────────
/**
 * Quita del manifest las entradas `data/YYYY-MM-DD/...` con fecha ANTERIOR a
 * `cutoff` (YYYY-MM-DD). Las que no son de datos con fecha (ej. `_storage/…`)
 * quedan intactas. Sin esto el manifest crece ~57 keys por día para siempre.
 * Pura (devuelve un objeto nuevo) para poder testearla sin red.
 */
export function pruneDataManifest(
  manifest: Record<string, string>,
  cutoff: string,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, sig] of Object.entries(manifest)) {
    const m = key.match(/^data\/(\d{4}-\d{2}-\d{2})\//);
    if (m && m[1] < cutoff) continue;
    out[key] = sig;
  }
  return out;
}

// ── Política de retención en R2 (abuelo-padre-hijo) ──────────────────────────
export interface RetencionR2 {
  /** Últimas N fechas, sin importar el día de la semana. */
  diarios: number;
  /** Últimos N lunes. */
  semanales: number;
  /** Últimos N días 1 de mes. */
  mensuales: number;
}

/** Default: 14 diarios + 8 semanales (lunes) + 24 mensuales (día 1) ≈ 46
 *  carpetas × ~30 MB ≈ 1.4 GB — holgado dentro de los 10 GB gratis de R2. */
export const RETENCION_R2: RetencionR2 = { diarios: 14, semanales: 8, mensuales: 24 };

/** Día de la semana en UTC de un YYYY-MM-DD (0=domingo … 1=lunes). */
function diaSemana(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

/**
 * Decide qué carpetas de fecha conservar y cuáles borrar en R2.
 * Pura y determinista → testeable sin credenciales. NO borra nada por sí sola:
 * el borrado vive detrás de la env var R2_RETENTION_ENABLED (ver header del
 * cron) para que Daniel lo encienda cuando quiera.
 */
export function r2RetentionPlan(
  dates: string[],
  cfg: RetencionR2 = RETENCION_R2,
): { keep: string[]; borrar: string[] } {
  const orden = [...new Set(dates)].filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort().reverse();
  const keep = new Set<string>();
  for (const d of orden.slice(0, cfg.diarios)) keep.add(d);
  let semanas = 0;
  for (const d of orden) {
    if (semanas >= cfg.semanales) break;
    if (diaSemana(d) === 1) {
      keep.add(d);
      semanas++;
    }
  }
  let meses = 0;
  for (const d of orden) {
    if (meses >= cfg.mensuales) break;
    if (d.endsWith("-01")) {
      keep.add(d);
      meses++;
    }
  }
  return {
    keep: orden.filter((d) => keep.has(d)),
    borrar: orden.filter((d) => !keep.has(d)),
  };
}

/** Fechas (YYYY-MM-DD) de `data/<fecha>/` presentes en un XML de ListObjectsV2
 *  con delimiter=/ (los CommonPrefixes). Pura → testeable sin red. */
export function parseDataDates(xml: string): string[] {
  const out = new Set<string>();
  for (const m of xml.matchAll(/<Prefix>data\/(\d{4}-\d{2}-\d{2})\/<\/Prefix>/g)) out.add(m[1]);
  return [...out].sort();
}

/**
 * Lista las carpetas de fecha que hoy existen en R2 bajo `data/`. Solo LECTURA
 * (ListObjectsV2 con delimiter) — este PR NO borra nada en R2. Devuelve [] si
 * R2 no está configurado o si la llamada falla (nunca lanza).
 */
export async function listR2DataDates(): Promise<string[]> {
  const cfg = getConfig();
  if (!cfg) return [];
  try {
    const url = `${cfg.baseUrl}?list-type=2&delimiter=%2F&prefix=${encodeURIComponent(R2_DATA_PREFIX + "/")}&max-keys=1000`;
    const res = await cfg.client.fetch(url, { method: "GET" });
    if (!res.ok) return [];
    return parseDataDates(await res.text());
  } catch {
    return [];
  }
}

// ── Ventana rotativa de verificación ─────────────────────────────────────────
/**
 * Índices a verificar con HEAD en esta corrida, de un total de `total` keys
 * omitidos. `sample <= 0` = ninguno; `sample >= total` = todos. Si no, una
 * ventana contigua que ROTA con el día (así en `ceil(total/sample)` días se
 * verifica el set completo sin pagar 3.2K HEADs por corrida).
 */
export function ventanaVerificacion(total: number, sample: number, dayIndex: number): Set<number> {
  if (total <= 0 || sample <= 0) return new Set();
  if (sample >= total) return new Set(Array.from({ length: total }, (_, i) => i));
  const start = ((dayIndex % Math.ceil(total / sample)) * sample) % total;
  const out = new Set<number>();
  for (let k = 0; k < sample; k++) out.add((start + k) % total);
  return out;
}

/** Días enteros desde epoch — semilla estable de la ventana rotativa. */
function dayIndexUtc(now = Date.now()): number {
  return Math.floor(now / 86400000);
}

// ── Núcleo de la réplica ─────────────────────────────────────────────────────

interface ReplicaOpts {
  /** Key del manifest a usar (default R2_MANIFEST_KEY). */
  manifestKey?: string;
  /**
   * Cuántos archivos OMITIDOS verificar con HEAD por corrida.
   * `Infinity` = todos (datos: ~57, barato). Un número = ventana rotativa
   * (Storage: 3.2K archivos → 250/corrida cubre el set en ~13 días).
   */
  verifySample?: number;
  /** Poda del manifest: quita keys `data/<fecha>/…` anteriores a esta fecha. */
  pruneBefore?: string;
  /** Subidas en paralelo (default 1). La réplica de Storage son miles de
   *  archivos chicos dominados por latencia → 5 en vuelo multiplican por ~4 lo
   *  que entra en el presupuesto de tiempo. */
  concurrency?: number;
}

async function headSize(cfg: R2Config, key: string): Promise<number | null> {
  const res = await cfg.client.fetch(`${cfg.baseUrl}/${key}`, { method: "HEAD" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`HEAD ${key}: HTTP ${res.status}`);
  return Number(res.headers.get("content-length") ?? "0");
}

async function putObject(cfg: R2Config, f: R2LazyFile, body: Buffer, sha256: string) {
  const res = await cfg.client.fetch(`${cfg.baseUrl}/${f.key}`, {
    method: "PUT",
    // Copia a Uint8Array "puro": el tipo Buffer de Node no calza con
    // BodyInit del lib DOM (ArrayBufferLike vs ArrayBuffer).
    body: new Uint8Array(body),
    headers: {
      "Content-Type": f.contentType || contentTypeFor(f.key),
      // Sin esto, undici en Vercel pasa los bodies grandes a
      // transfer-encoding chunked y R2 responde 411 MissingContentLength
      // (visto en vivo 5-jul: fallaban exactamente los 6 archivos grandes).
      "Content-Length": String(body.length),
      // Payload firmado (aws4fetch usaría UNSIGNED-PAYLOAD para bodies
      // binarios).
      "x-amz-content-sha256": sha256,
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${await readBodySafe(res)}`);
  // Verificación post-subida: R2 debe devolver el objeto con el tamaño exacto.
  const size = await headSize(cfg, f.key);
  if (size === null) throw new Error("subido pero HEAD devuelve 404 (no quedó en R2)");
  if (size !== body.length) throw new Error(`subido con ${size} bytes, se esperaban ${body.length}`);
}

async function replicarLazy(
  files: R2LazyFile[],
  deadline: number,
  opts: ReplicaOpts,
): Promise<R2ReplicaResult> {
  const result: R2ReplicaResult = {
    enabled: true,
    subidos: 0,
    bytes: 0,
    omitidos: 0,
    verificados: 0,
    reparados: 0,
    pendientes: 0,
    errores: [],
  };

  const cfg = getConfig();
  if (!cfg) {
    return {
      ...result,
      enabled: false,
      nota: "R2 no configurado (faltan env vars R2_*) — réplica omitida",
    };
  }

  const manifestKey = opts.manifestKey ?? R2_MANIFEST_KEY;
  const verifySample = opts.verifySample ?? 0;

  try {
    // 1. Manifest previo (404 = primera corrida → todo se sube).
    let manifest: Record<string, string> = {};
    try {
      const res = await cfg.client.fetch(`${cfg.baseUrl}/${manifestKey}`, { method: "GET" });
      if (res.ok) {
        manifest = (await res.json()) as Record<string, string>;
      } else if (res.status !== 404) {
        // Manifest ilegible → seguimos con manifest vacío (re-subir todo es
        // idempotente y seguro), pero lo reportamos.
        result.errores.push(`manifest GET: HTTP ${res.status} ${await readBodySafe(res)}`);
      }
    } catch (e) {
      result.errores.push(`manifest GET: ${e instanceof Error ? e.message : String(e)}`);
    }

    // 2. Partir en "hay que subir" vs "omitibles" (firma igual en el manifest).
    const aSubir: R2LazyFile[] = [];
    const omitibles: R2LazyFile[] = [];
    for (const f of files) {
      if (manifest[f.key] === f.sig) omitibles.push(f);
      else aSubir.push(f);
    }

    // 3. Los omitibles que caen en la ventana de verificación se comprueban con
    //    HEAD: si el objeto ya no está en R2, vuelve a la cola de subida (esto
    //    cierra el agujero de "omitido para siempre").
    const ventana = ventanaVerificacion(omitibles.length, verifySample, dayIndexUtc());
    for (let i = 0; i < omitibles.length; i++) {
      const f = omitibles[i];
      if (!ventana.has(i) || Date.now() > deadline) {
        result.omitidos++;
        continue;
      }
      try {
        const size = await headSize(cfg, f.key);
        if (size === null) {
          delete manifest[f.key];
          aSubir.push(f);
          result.reparados++;
        } else {
          result.omitidos++;
          result.verificados++;
        }
      } catch (e) {
        result.omitidos++;
        result.errores.push(`verificar ${f.key}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    // 4. Subir, dentro del presupuesto de tiempo (N en vuelo; ver concurrency).
    let siguiente = 0;
    const worker = async () => {
      for (;;) {
        const i = siguiente++;
        if (i >= aSubir.length) return;
        const f = aSubir[i];
        if (Date.now() > deadline) {
          result.pendientes++;
          continue;
        }
        try {
          const body = await f.load();
          const sha256 = createHash("sha256").update(body).digest("hex");
          await putObject(cfg, f, body, sha256);
          manifest[f.key] = f.sig; // solo lo subido Y verificado entra al manifest
          result.subidos++;
          result.bytes += body.length;
        } catch (e) {
          result.errores.push(`${f.key}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    };
    const enVuelo = Math.max(1, Math.min(opts.concurrency ?? 1, aSubir.length || 1));
    await Promise.all(Array.from({ length: enVuelo }, worker));

    // 5. Manifest actualizado (refleja SOLO éxitos → lo fallido/pendiente se
    // reintenta mañana). Se sube aunque haya errores parciales.
    if (opts.pruneBefore) manifest = pruneDataManifest(manifest, opts.pruneBefore);
    try {
      const cuerpo = JSON.stringify(manifest);
      const res = await cfg.client.fetch(`${cfg.baseUrl}/${manifestKey}`, {
        method: "PUT",
        body: cuerpo,
        headers: {
          "Content-Type": "application/json",
          "Content-Length": String(Buffer.byteLength(cuerpo)),
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${await readBodySafe(res)}`);
    } catch (e) {
      result.errores.push(`manifest PUT: ${e instanceof Error ? e.message : String(e)}`);
    }
  } catch (e) {
    // Cinturón y tirantes: nada de aquí debe tumbar al cron de backup.
    result.errores.push(`r2: ${e instanceof Error ? e.message : String(e)}`);
  }

  // Tope de detalle: con miles de archivos un fallo sistémico llenaría el meta
  // (y el mensaje de Telegram) con la misma línea repetida.
  if (result.errores.length > MAX_ERRORES_DETALLE) {
    const extra = result.errores.length - MAX_ERRORES_DETALLE;
    result.errores = [...result.errores.slice(0, MAX_ERRORES_DETALLE), `(+${extra} errores más)`];
  }

  return result;
}

/** Cuántos errores se detallan antes de resumir el resto en una línea. */
const MAX_ERRORES_DETALLE = 20;

/**
 * Replica archivos ya en memoria (los .ndjson.gz + los meta.json del backup) al
 * bucket R2, incremental por manifest, hasta `deadline` (epoch ms). Nunca lanza.
 * Los omitidos se verifican TODOS con HEAD (son ~57 keys, milisegundos).
 */
export async function replicateBackupToR2(
  files: R2BackupFile[],
  deadline: number,
  opts: { pruneBefore?: string } = {},
): Promise<R2ReplicaResult> {
  const lazy: R2LazyFile[] = files.map((f) => ({
    key: f.key,
    sig: fileSignature(f.body),
    contentType: f.contentType,
    load: async () => f.body,
  }));
  return replicarLazy(lazy, deadline, {
    manifestKey: R2_MANIFEST_KEY,
    verifySample: Infinity,
    pruneBefore: opts.pruneBefore,
  });
}

/** Cuántos archivos omitidos de Storage se verifican con HEAD por corrida.
 *  Con ~3.2K archivos, 250 cubren el set completo en ~13 días. */
export const R2_STORAGE_VERIFY_SAMPLE = 250;

/** Archivos de Storage en vuelo a la vez (latencia > ancho de banda: son ~62 KB
 *  promedio y cada uno paga un round-trip a Supabase y otro a R2). */
export const R2_STORAGE_CONCURRENCY = 5;

/**
 * Replica archivos de Supabase Storage a R2 con descarga perezosa (solo baja de
 * Supabase lo que de verdad hay que subir). Manifest propio y verificación
 * muestreada rotativa. Nunca lanza.
 */
export async function replicateStorageToR2(
  files: R2LazyFile[],
  deadline: number,
): Promise<R2ReplicaResult> {
  return replicarLazy(files, deadline, {
    manifestKey: R2_STORAGE_MANIFEST_KEY,
    verifySample: R2_STORAGE_VERIFY_SAMPLE,
    concurrency: R2_STORAGE_CONCURRENCY,
  });
}

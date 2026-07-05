// ─────────────────────────────────────────────────────────────────────────────
// Réplica off-site del backup diario a Cloudflare R2 (S3-compatible, tier
// gratis). La llama el cron /api/cron/backup DESPUÉS de subir los NDJSON.gz a
// Supabase Storage: los MISMOS bytes se suben a un bucket R2 privado.
//
// Diseño (mismo patrón que la réplica de Storage del backup v2):
// - Paths ESTABLES en R2: data/<archivo>.ndjson.gz (siempre "el último backup",
//   sin carpetas por fecha — el historial de 30 días vive en Supabase; R2 es
//   disaster-recovery del set más reciente).
// - Manifest en R2 (manifest.json: key → "size|sha256") — solo se sube lo que
//   cambió desde la última corrida. gzipSync es determinista (mtime=0), así que
//   una tabla sin cambios produce bytes idénticos → se omite.
// - Presupuesto de tiempo (deadline): lo que no alcance queda "pendiente" y se
//   sube en la corrida siguiente (el manifest solo registra lo subido con
//   éxito → catch-up automático).
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

/** Archivo a replicar: key relativo dentro del bucket R2 + bytes exactos. */
export interface R2BackupFile {
  key: string;
  body: Buffer;
}

export interface R2ReplicaResult {
  /** false = env vars ausentes → skip silencioso (ver nota). */
  enabled: boolean;
  nota?: string;
  subidos: number;
  bytes: number;
  /** Sin cambios desde la última réplica (mismo size+sha256 en el manifest). */
  omitidos: number;
  /** No alcanzó el presupuesto de tiempo; se suben en la próxima corrida. */
  pendientes: number;
  errores: string[];
}

export const R2_MANIFEST_KEY = "manifest.json";

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

/** true si las 4 env vars R2 están configuradas. */
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

/**
 * Replica `files` al bucket R2, incremental por manifest, hasta `deadline`
 * (epoch ms). Nunca lanza — errores van en el resultado.
 */
export async function replicateBackupToR2(
  files: R2BackupFile[],
  deadline: number,
): Promise<R2ReplicaResult> {
  const result: R2ReplicaResult = {
    enabled: true,
    subidos: 0,
    bytes: 0,
    omitidos: 0,
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

  try {
    // 1. Manifest previo (404 = primera corrida → todo se sube).
    let manifest: Record<string, string> = {};
    try {
      const res = await cfg.client.fetch(`${cfg.baseUrl}/${R2_MANIFEST_KEY}`, { method: "GET" });
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

    // 2. Subir solo lo que cambió, dentro del presupuesto de tiempo.
    for (const f of files) {
      const sig = fileSignature(f.body);
      if (manifest[f.key] === sig) {
        result.omitidos++;
        continue;
      }
      if (Date.now() > deadline) {
        result.pendientes++;
        continue;
      }
      try {
        const res = await cfg.client.fetch(`${cfg.baseUrl}/${f.key}`, {
          method: "PUT",
          // Copia a Uint8Array "puro": el tipo Buffer de Node no calza con
          // BodyInit del lib DOM (ArrayBufferLike vs ArrayBuffer).
          body: new Uint8Array(f.body),
          headers: {
            "Content-Type": contentTypeFor(f.key),
            // Sin esto, undici en Vercel pasa los bodies grandes a
            // transfer-encoding chunked y R2 responde 411 MissingContentLength
            // (visto en vivo 5-jul: fallaban exactamente los 6 archivos grandes).
            "Content-Length": String(f.body.length),
            // Payload firmado (aws4fetch usaría UNSIGNED-PAYLOAD para bodies
            // binarios); el sha256 ya está calculado para el manifest.
            "x-amz-content-sha256": sig.split("|")[1],
          },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status} ${await readBodySafe(res)}`);
        manifest[f.key] = sig; // solo lo subido con éxito entra al manifest
        result.subidos++;
        result.bytes += f.body.length;
      } catch (e) {
        result.errores.push(`${f.key}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    // 3. Manifest actualizado (refleja SOLO éxitos → lo fallido/pendiente se
    // reintenta mañana). Se sube aunque haya errores parciales.
    try {
      const res = await cfg.client.fetch(`${cfg.baseUrl}/${R2_MANIFEST_KEY}`, {
        method: "PUT",
        body: JSON.stringify(manifest),
        headers: {
          "Content-Type": "application/json",
          "Content-Length": String(Buffer.byteLength(JSON.stringify(manifest))),
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

  return result;
}

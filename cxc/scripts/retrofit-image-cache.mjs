// Retrofit de cache-control en fotos de catálogo YA subidas (Reebok + Joybees).
//
// Contexto: el cacheControl de Supabase Storage se fija AL SUBIR el objeto.
// Los uploads viejos quedaron con `cache-control: no-cache`, así que cada
// generación de PDF / carga del catálogo re-descargaba todas las fotos.
// Los uploads nuevos ya salen con cacheControl 1 año (upload/route.ts); este
// script "cura" los objetos existentes re-subiéndolos con los MISMOS bytes y
// cacheControl 31536000 (la URL con ?v= no cambia: los bytes son idénticos).
//
// Uso:
//   node scripts/retrofit-image-cache.mjs           # dry-run (lista y mide)
//   node scripts/retrofit-image-cache.mjs --apply   # aplica el re-set
//
// Es idempotente: correrlo dos veces no rompe nada.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(resolve(process.cwd(), ".env.local"), "utf8")
    .split("\n")
    .filter((l) => l.trim() && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local");
  process.exit(1);
}

const APPLY = process.argv.includes("--apply");
const BUCKET = "product-images";
const PREFIXES = ["products", "joybees"]; // Reebok y Joybees viven en el mismo bucket
const CACHE_SECONDS = "31536000"; // 1 año — igual que upload/route.ts

const sb = createClient(url, key, { auth: { persistSession: false } });

async function listAll(prefix) {
  const out = [];
  let offset = 0;
  const PAGE = 100;
  for (;;) {
    const { data, error } = await sb.storage
      .from(BUCKET)
      .list(prefix, { limit: PAGE, offset, sortBy: { column: "name", order: "asc" } });
    if (error) throw new Error(`list ${prefix}: ${error.message}`);
    for (const f of data || []) {
      if (f.id) out.push({ path: `${prefix}/${f.name}`, meta: f.metadata });
    }
    if (!data || data.length < PAGE) break;
    offset += PAGE;
  }
  return out;
}

// OJO: medir con GET — el HEAD de Supabase Storage responde "no-cache" aunque
// el objeto tenga cacheControl seteado (quirk verificado 24-jul-2026).
async function headCacheControl(path) {
  const res = await fetch(`${url}/storage/v1/object/public/${BUCKET}/${path}`);
  return res.headers.get("cache-control") || "?";
}

let done = 0;
let skipped = 0;
let failed = 0;

for (const prefix of PREFIXES) {
  const files = await listAll(prefix);
  console.log(`\n== ${prefix}/ — ${files.length} objetos ==`);
  if (files.length === 0) continue;

  // Medición "antes" con el primero
  const sampleBefore = await headCacheControl(files[0].path);
  console.log(`   antes  (${files[0].path}): cache-control: ${sampleBefore}`);

  if (!APPLY) {
    console.log("   dry-run: no se modifica nada (usa --apply)");
    continue;
  }

  for (const f of files) {
    const cc = f.meta?.cacheControl || "";
    if (cc.includes(CACHE_SECONDS)) { skipped++; continue; }
    try {
      const { data: blob, error: dlErr } = await sb.storage.from(BUCKET).download(f.path);
      if (dlErr || !blob) throw new Error(dlErr?.message || "download vacío");
      const buf = Buffer.from(await blob.arrayBuffer());
      const contentType = f.meta?.mimetype || blob.type || "image/jpeg";
      const { error: upErr } = await sb.storage
        .from(BUCKET)
        .upload(f.path, buf, { contentType, upsert: true, cacheControl: CACHE_SECONDS });
      if (upErr) throw new Error(upErr.message);
      done++;
      if (done % 25 === 0) console.log(`   ...${done} re-subidos`);
    } catch (e) {
      failed++;
      console.error(`   FALLO ${f.path}: ${e.message}`);
    }
  }

  const sampleAfter = await headCacheControl(files[0].path);
  console.log(`   después (${files[0].path}): cache-control: ${sampleAfter}`);
}

console.log(`\nTotal: ${done} actualizados, ${skipped} ya tenían cache largo, ${failed} fallos.`);
if (failed > 0) process.exit(1);

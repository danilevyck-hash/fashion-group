/**
 * ONE-TIME SCRIPT: Upload all Joybees product photos to Supabase Storage
 * and update joybees_products.image_url for matching SKUs.
 *
 * Usage: node scripts/upload-joybees-photos.mjs
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

// ── Config ──────────────────────────────────────────────────────────────────
const PHOTOS_DIR = "/Users/daniellevy/Downloads/fotos joybees";
const BUCKET = "product-images";
const FOLDER = "joybees";

// ── Load env from .env.local ────────────────────────────────────────────────
function loadEnv() {
  const envPath = join(import.meta.dirname, "..", ".env.local");
  const lines = readFileSync(envPath, "utf-8").split("\n");
  const env = {};
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    env[trimmed.slice(0, eqIdx)] = trimmed.slice(eqIdx + 1);
  }
  return env;
}

const env = loadEnv();
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("ERROR: Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

// ── Helpers ─────────────────────────────────────────────────────────────────
const MIME_TYPES = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

function getBaseSku(filename) {
  // Remove extension
  const dotIdx = filename.lastIndexOf(".");
  let base = dotIdx !== -1 ? filename.slice(0, dotIdx) : filename;
  // Remove trailing -1, -2, etc.
  base = base.replace(/-\d+$/, "");
  return base;
}

function getContentType(filename) {
  const ext = filename.slice(filename.lastIndexOf(".")).toLowerCase();
  return MIME_TYPES[ext] || "application/octet-stream";
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log("Cargando productos de Joybees desde DB...");
  const { data: products, error: dbError } = await supabase
    .from("joybees_products")
    .select("id, sku, image_url");

  if (dbError) {
    console.error("Error leyendo joybees_products:", dbError.message);
    process.exit(1);
  }

  console.log(`  → ${products.length} productos en DB\n`);

  // Read photo files (skip "Hoja" files)
  const allFiles = readdirSync(PHOTOS_DIR);
  const photoFiles = allFiles.filter(
    (f) => !f.startsWith("Hoja") && /\.(jpg|jpeg|png|webp)$/i.test(f)
  );

  console.log(`${photoFiles.length} fotos encontradas en carpeta\n`);

  let uploaded = 0;
  let productsUpdated = 0;
  const noMatch = [];

  for (const filename of photoFiles) {
    const baseSku = getBaseSku(filename);
    const matching = products.filter((p) => p.sku.startsWith(baseSku));

    if (matching.length === 0) {
      noMatch.push(`${filename} (base: ${baseSku})`);
      continue;
    }

    // Upload file to storage
    const filePath = join(PHOTOS_DIR, filename);
    const fileBuffer = readFileSync(filePath);
    const storagePath = `${FOLDER}/${filename}`;
    const contentType = getContentType(filename);

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, fileBuffer, { contentType, upsert: true });

    if (uploadError) {
      console.error(`  ✗ Error subiendo ${filename}: ${uploadError.message}`);
      continue;
    }

    uploaded++;

    // Get public URL
    const {
      data: { publicUrl },
    } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);

    // Update all matching products
    const matchingIds = matching.map((p) => p.id);
    const { error: updateError } = await supabase
      .from("joybees_products")
      .update({ image_url: publicUrl })
      .in("id", matchingIds);

    if (updateError) {
      console.error(`  ✗ Error actualizando productos para ${filename}: ${updateError.message}`);
      continue;
    }

    const skuList = matching.map((p) => p.sku).join(", ");
    console.log(`  ✓ ${filename} → ${matching.length} producto(s): ${skuList}`);
    productsUpdated += matching.length;
  }

  // ── Summary ─────────────────────────────────────────────────────────────
  console.log("\n════════════════════════════════════════");
  console.log(`  ${uploaded} fotos subidas`);
  console.log(`  ${productsUpdated} productos actualizados`);
  console.log(`  ${noMatch.length} sin match en DB`);
  console.log("════════════════════════════════════════");

  if (noMatch.length > 0) {
    console.log("\nFotos sin match:");
    for (const item of noMatch) {
      console.log(`  - ${item}`);
    }
  }
}

main().catch((err) => {
  console.error("Error fatal:", err);
  process.exit(1);
});

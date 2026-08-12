// Verificación E2E en NAVEGADOR del auto-recorte al subir, contra el build de
// producción local (BASE) y la base REAL:
//
//   A) SUBIDA INDIVIDUAL (BulkPhotoUpload → compress con recorte → /upload):
//      se sube la foto ORIGINAL del banco (producto chico, fondo enorme) para
//      un SKU real de Calvin y se verifica que lo que quedó en Storage está
//      RECORTADO (el producto llena la dimensión que manda) y responde como
//      imagen real (>5KB, image/*).
//   B) ZIP DEL B2B (procesarZipB2B → variante + manifiesto): un ZIP de 1 foto
//      con el nombre {ESTILO}_{COLOR}_1.jpg; se verifica la variante subida
//      recortada y encuadrada 4:3.
//
// ESCRITURAS SOLO DE PRUEBA Y SE LIMPIAN: al final se restauran image_url y
// foto_manual del producto, se borran los objetos creados y se revoca la
// sesión sembrada. La foto original del producto NUNCA se pisa (la subida
// individual escribe en el path determinístico, distinto del timestamped).
//
// GOTCHAS heredados del arnés: cookie firmada + fila en user_sessions,
// sessionStorage cxc_role, delete Navigator.prototype.serviceWorker.
//
//   BASE=http://localhost:3154 node scripts/_verif-recorte-subidas.mjs
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import sharp from "sharp";
import JSZip from "jszip";

for (const l of readFileSync(".env.local", "utf8").split("\n")) {
  if (!l || l.startsWith("#") || !l.includes("=")) continue;
  const i = l.indexOf("=");
  if (!(l.slice(0, i).trim() in process.env))
    process.env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}

const BASE = process.env.BASE ?? "http://localhost:3154";
const SKU = process.env.TARGET_SKU ?? "HW0HW02958AEF";
const SKU_STORAGE = SKU.toLowerCase().replace(/[^a-z0-9]/g, "");
const BUCKET = "product-images";
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

function signSession(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", process.env.SESSION_SECRET).update(body).digest("base64url");
  return `${body}.${sig}`;
}

/** Caja del producto por fila (copia de la lógica SOLO para medir acá). */
async function ocupacion(buf) {
  const { data, info } = await sharp(buf)
    .resize({ width: 320, height: 320, fit: "inside", withoutEnlargement: true })
    .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const w = info.width, h = info.height;
  const px = (x, y) => [data[(y * w + x) * 4], data[(y * w + x) * 4 + 1], data[(y * w + x) * 4 + 2]];
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    let l = [0, 0, 0], r = [0, 0, 0];
    const k = 3;
    for (let x = 0; x < k; x++) {
      const a = px(x, y), b = px(w - 1 - x, y);
      for (let c = 0; c < 3; c++) { l[c] += a[c] / k; r[c] += b[c] / k; }
    }
    for (let x = 0; x < w; x++) {
      const t = x / (w - 1);
      const p = px(x, y);
      let dif = 0;
      for (let c = 0; c < 3; c++) dif = Math.max(dif, Math.abs(p[c] - (l[c] + (r[c] - l[c]) * t)));
      if (dif > 20) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return { fill: 0, area: 0 };
  const bw = maxX - minX + 1, bh = maxY - minY + 1;
  return { fill: Math.max(bw / w, bh / h), area: (bw * bh) / (w * h) };
}

async function fetchImagen(url) {
  const res = await fetch(url);
  const ct = res.headers.get("content-type") ?? "";
  const buf = Buffer.from(await res.arrayBuffer());
  return { ok: res.ok && ct.startsWith("image/") && buf.length > 5 * 1024, ct, buf, status: res.status };
}

let fallas = 0;
const check = (ok, msg) => { console.log(`${ok ? "🟢" : "🔴"} ${msg}`); if (!ok) fallas++; };

async function main() {
  // ── Estado original del producto (para restaurar) ─────────────────────────
  const { data: prod, error: e0 } = await sb.from("calvin_products")
    .select("sku,image_url,foto_manual").eq("sku", SKU).single();
  if (e0 || !prod) throw new Error(`no encontré ${SKU}: ${e0?.message}`);
  const original = { image_url: prod.image_url, foto_manual: prod.foto_manual ?? false };
  const pathOriginal = original.image_url.split("?")[0].split(`${BUCKET}/`)[1];
  console.log(`Producto de prueba: ${SKU} → ${pathOriginal}`);
  const { data: blobOrig, error: eDl } = await sb.storage.from(BUCKET).download(decodeURIComponent(pathOriginal));
  if (eDl) throw new Error(`no pude bajar la original: ${eDl.message}`);
  const bytesOrig = Buffer.from(await blobOrig.arrayBuffer());
  const antes = await ocupacion(bytesOrig);
  console.log(`Original: ${bytesOrig.length} bytes, producto ${(antes.area * 100).toFixed(0)}% del área`);

  // ── Sesión ────────────────────────────────────────────────────────────────
  const sessionToken = crypto.randomUUID();
  const ins = await sb.from("user_sessions").insert({
    user_name: "daniel", user_role: "admin", session_token: sessionToken,
    ip_address: "127.0.0.1", last_seen: new Date().toISOString(),
  });
  if (ins.error) throw new Error("no pude sembrar sesión: " + ins.error.message);
  const cookie = signSession({ role: "admin", userId: "daniel", userName: "daniel", sessionToken });

  const browser = await chromium.launch();
  const creados = new Set();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await ctx.addCookies([{ name: "cxc_session", value: cookie, domain: "localhost", path: "/", httpOnly: true }]);
    const page = await ctx.newPage();
    await page.addInitScript(() => {
      try { delete Navigator.prototype.serviceWorker; } catch {}
      sessionStorage.setItem("cxc_role", "admin");
    });
    await page.goto(`${BASE}/catalogos/admin/calvin`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);

    // ── A) Subida INDIVIDUAL (masiva de 1) con recorte en el navegador ──────
    const inputFotos = page.locator('input[type="file"][multiple]').first();
    await inputFotos.setInputFiles({ name: `${SKU}.jpg`, mimeType: "image/jpeg", buffer: bytesOrig });
    await page.getByText("coinciden").first().waitFor({ timeout: 15000 });
    await page.getByRole("button", { name: /^Subir 1 foto/ }).click();
    await page.getByText("Listo.").first().waitFor({ timeout: 60000 });

    const { data: p1 } = await sb.from("calvin_products").select("image_url").eq("sku", SKU).single();
    check(p1?.image_url && p1.image_url !== original.image_url, "individual: image_url cambió");
    const path1 = p1.image_url.split("?")[0].split(`${BUCKET}/`)[1];
    creados.add(decodeURIComponent(path1));
    const img1 = await fetchImagen(p1.image_url);
    check(img1.ok, `individual: la URL responde imagen real (${img1.status}, ${img1.ct}, ${img1.buf.length} bytes)`);
    const desp1 = await ocupacion(img1.buf);
    check(desp1.fill >= 0.7, `individual: producto RECORTADO llena ${(desp1.fill * 100).toFixed(0)}% (antes área ${(antes.area * 100).toFixed(0)}%, ahora ${(desp1.area * 100).toFixed(0)}%)`);

    // ── B) ZIP del B2B ───────────────────────────────────────────────────────
    // El SKU real se parte en {ESTILO}_{COLOR}: los últimos 3 caracteres son
    // el color en el banco PVH (HW0HW02958 + AEF).
    const nombreZip = `${SKU.slice(0, -3)}_${SKU.slice(-3)}_1.jpg`;
    const zip = new JSZip();
    zip.file(nombreZip, bytesOrig);
    const zipBuf = await zip.generateAsync({ type: "nodebuffer" });
    const inputZip = page.locator('input[type="file"][accept*="zip"]').first();
    await inputZip.setInputFiles({ name: "banco-b2b.zip", mimeType: "application/zip", buffer: zipBuf });
    await page.getByText(/fotos? (del banco )?asignada/i).first().waitFor({ timeout: 90000 }).catch(() => {});
    await page.waitForTimeout(3000);

    const pathVar = `calvin/_v/${SKU_STORAGE}/1.jpg`;
    const { data: blobVar, error: eVar } = await sb.storage.from(BUCKET).download(pathVar);
    check(!eVar && blobVar, `zip: la variante ${pathVar} existe en Storage`);
    if (blobVar) {
      creados.add(pathVar);
      const bufVar = Buffer.from(await blobVar.arrayBuffer());
      check(bufVar.length > 5 * 1024, `zip: variante es archivo real (${bufVar.length} bytes)`);
      const meta = await sharp(bufVar).metadata();
      check(Math.max(meta.width, meta.height) === 720, `zip: encuadre 720px (${meta.width}x${meta.height})`);
      const despVar = await ocupacion(bufVar);
      check(despVar.fill >= 0.7, `zip: producto recortado llena ${(despVar.fill * 100).toFixed(0)}%`);
    }
    const { data: p2 } = await sb.from("calvin_products").select("image_url").eq("sku", SKU).single();
    check(
      (p2?.image_url ?? "").includes(`_v/${SKU_STORAGE}/1.jpg`) || p2?.image_url === p1.image_url,
      `zip: image_url quedó en la variante (o intacta si foto manual) → ${p2?.image_url?.split(BUCKET + "/")[1] ?? "?"}`,
    );
  } finally {
    // ── LIMPIEZA: restaurar producto, borrar objetos de prueba, revocar sesión
    const upd = await sb.from("calvin_products")
      .update({ image_url: original.image_url, foto_manual: original.foto_manual })
      .eq("sku", SKU);
    if (upd.error) {
      const upd2 = await sb.from("calvin_products").update({ image_url: original.image_url }).eq("sku", SKU);
      console.log(upd2.error ? `🔴 NO PUDE RESTAURAR image_url: ${upd2.error.message}` : "🟢 limpieza: image_url restaurada (sin foto_manual)");
    } else {
      console.log("🟢 limpieza: image_url y foto_manual restauradas");
    }
    const lista = [...creados].filter((p) => p && p !== decodeURIComponent(pathOriginal));
    if (lista.length) {
      const del = await sb.storage.from(BUCKET).remove(lista);
      console.log(del.error ? `🔴 no pude borrar ${lista}: ${del.error.message}` : `🟢 limpieza: borrados ${lista.join(", ")}`);
    }
    await sb.from("user_sessions").update({ revoked: true }).eq("session_token", sessionToken);
    await browser.close();
    // La original sigue viva en su path — verificarla al cierre.
    const { data: pub } = sb.storage.from(BUCKET).getPublicUrl(decodeURIComponent(pathOriginal));
    const fin = await fetchImagen(`${pub.publicUrl}?nocache=${Date.now()}`);
    console.log(`${fin.ok ? "🟢" : "🔴"} la foto ORIGINAL sigue intacta en su path (${fin.buf.length} bytes)`);
  }

  console.log(fallas === 0 ? "\n✅ TODO VERDE" : `\n🔴 ${fallas} fallas`);
  process.exit(fallas === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });

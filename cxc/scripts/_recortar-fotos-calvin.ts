/**
 * Re-procesa las fotos YA SUBIDAS de Calvin Klein que traen el defecto del
 * banco B2B de PVH: producto chico y descentrado sobre un fondo enorme
 * (caso real: HW0HW02958AEF.jpg — la sandalia ocupa el cuarto de abajo).
 *
 *   npx tsx scripts/_recortar-fotos-calvin.ts             → dry-run (no escribe NADA)
 *   npx tsx scripts/_recortar-fotos-calvin.ts --confirm   → respalda + re-sube
 *
 * SOLO CALVIN. Tommy/Reebok/Joybees ya están curadas a mano — NO se tocan
 * (la tabla y el prefijo van fijos, no hay parámetro de marca a propósito).
 *
 * CRITERIO (el mismo módulo puro que cubre foto-recorte.test.ts, no una
 * segunda implementación): se re-procesa una foto solo si `medirRecorte` la
 * mide CON CONFIANZA y la caja del producto ocupa menos de
 * OCUPACION_REPROCESO (50%) del área. Lo dudoso (fondo no uniforme, producto
 * tocando los 4 bordes, imagen chica) se lista y NO se toca — mismo fail-open
 * de la subida.
 *
 * SEGURIDAD:
 *   1. BACKUP primero: cada original se guarda en BACKUP_DIR antes de escribir
 *      (si el backup falla, esa foto se salta).
 *   2. Se re-sube al MISMO path (la URL no cambia). El `?v=` de image_url se
 *      renueva — es EXACTAMENTE lo que hace /api/catalogo/[marca]/upload en
 *      cada re-subida: sin él, el navegador/CDN (cacheControl 1 año) seguiría
 *      mostrando los bytes viejos y el arreglo sería invisible.
 *   3. VERIFICACIÓN después (regla de la casa): la URL pública responde 200,
 *      content-type image/*, >5KB, y re-midiendo la foto nueva el producto
 *      llena la dimensión que manda (≥70%).
 *
 * Restaurar un original: subir el archivo del backup al mismo path con upsert
 * y renovar el ?v= (o re-subirlo desde el admin del catálogo).
 */
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import {
  medirRecorte,
  escalarCaja,
  planRecorte,
  LADO_MEDICION,
  OCUPACION_REPROCESO,
} from "../src/lib/catalogos/foto-recorte";
import { pathDeImageUrl } from "../src/lib/catalogos/fotos-en-uso";
import type { RgbaImage } from "../src/lib/catalogos/fotos-b2b";

const CONFIRMAR = process.argv.includes("--confirm");
const TABLA = "calvin_products";
const PREFIJO = "calvin/";
const BUCKET = "product-images";
const JPEG_QUALITY = 82; // el mismo 0.82 del uploader del admin
const BACKUP_DIR =
  process.env.BACKUP_DIR ||
  path.join(process.env.HOME || "~", ".claude/jobs/5b66fe8c/tmp/fotos-calvin-originales");

for (const line of fs.readFileSync(path.resolve(__dirname, "../.env.local"), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

interface Fila {
  sku: string | null;
  image_url: string | null;
}

async function leerProductosConFoto(): Promise<Fila[]> {
  // Paginado con orden estable + count exacto (regla db-max-rows=1000).
  const filas: Fila[] = [];
  const PAGINA = 1000;
  let desde = 0;
  let total: number | null = null;
  for (;;) {
    const { data, count, error } = await db
      .from(TABLA)
      .select("sku,image_url", { count: "exact" })
      .not("image_url", "is", null)
      .order("sku")
      .range(desde, desde + PAGINA - 1);
    if (error) throw new Error(`Leyendo ${TABLA}: ${error.message}`);
    total = count ?? total;
    filas.push(...(data ?? []));
    if (!data || data.length < PAGINA) break;
    desde += PAGINA;
  }
  if (total !== null && filas.length !== total) {
    throw new Error(`Lectura truncada: leí ${filas.length} de ${total}`);
  }
  return filas;
}

async function medirBuffer(buf: Buffer): Promise<{ small: RgbaImage; w: number; h: number }> {
  const meta = await sharp(buf).rotate().metadata();
  const { data, info } = await sharp(buf)
    .rotate()
    .resize({ width: LADO_MEDICION, height: LADO_MEDICION, fit: "inside", withoutEnlargement: true })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return {
    small: { width: info.width, height: info.height, data: new Uint8ClampedArray(data) },
    w: meta.width!,
    h: meta.height!,
  };
}

async function recortarBuffer(buf: Buffer): Promise<Buffer | null> {
  const { small, w, h } = await medirBuffer(buf);
  const med = medirRecorte(small, w, h);
  if (!med.ok || !med.caja) return null;
  const caja = escalarCaja(med.caja, small.width, small.height, w, h);
  const plan = planRecorte(caja, w, h);
  const [r, g, b] = med.fondo ?? [255, 255, 255];
  const region = await sharp(buf)
    .rotate()
    .extract({ left: plan.srcX, top: plan.srcY, width: plan.srcW, height: plan.srcH })
    .resize(plan.dw, plan.dh, { fit: "fill" })
    .toBuffer();
  return sharp({
    create: { width: plan.destW, height: plan.destH, channels: 3, background: { r, g, b } },
  })
    .composite([{ input: region, left: plan.dx, top: plan.dy }])
    .jpeg({ quality: JPEG_QUALITY })
    .toBuffer();
}

async function main() {
  console.log(CONFIRMAR ? "── MODO CONFIRM: va a escribir ──" : "── DRY-RUN: no escribe nada ──");
  const filas = await leerProductosConFoto();
  console.log(`${TABLA}: ${filas.length} productos con foto`);

  let corregidas = 0;
  let fallas = 0;
  const noTocadas: { sku: string; motivo: string }[] = [];
  const candidatas: string[] = [];

  for (const fila of filas) {
    const sku = fila.sku ?? "?";
    const objPath = pathDeImageUrl(fila.image_url);
    if (!objPath || !objPath.startsWith(PREFIJO)) {
      noTocadas.push({ sku, motivo: `fuera de ${PREFIJO} (${objPath ?? "sin path"})` });
      continue;
    }

    // Descarga DIRECTA de Storage (sin CDN) — mide los bytes reales.
    const { data: blob, error: errDl } = await db.storage.from(BUCKET).download(objPath);
    if (errDl || !blob) {
      noTocadas.push({ sku, motivo: `no se pudo descargar (${errDl?.message ?? "vacío"})` });
      continue;
    }
    const original = Buffer.from(await blob.arrayBuffer());

    let med;
    try {
      const { small, w, h } = await medirBuffer(original);
      med = medirRecorte(small, w, h);
    } catch (e) {
      noTocadas.push({ sku, motivo: `no se pudo decodificar (${e instanceof Error ? e.message : e})` });
      continue;
    }
    if (!med.ok || !med.caja) {
      noTocadas.push({ sku, motivo: `detector: ${med.motivo}` });
      continue;
    }
    if ((med.ocupacionArea ?? 1) >= OCUPACION_REPROCESO) {
      noTocadas.push({ sku, motivo: `ya está bien (producto ${(med.ocupacionArea! * 100).toFixed(0)}% del área)` });
      continue;
    }

    candidatas.push(sku);
    console.log(`✂ ${sku}  ${objPath}  ocupación ${(med.ocupacionArea! * 100).toFixed(0)}%`);
    if (!CONFIRMAR) continue;

    // 1) BACKUP del original — si falla, NO se toca esta foto.
    try {
      const destino = path.join(BACKUP_DIR, objPath);
      fs.mkdirSync(path.dirname(destino), { recursive: true });
      fs.writeFileSync(destino, original);
    } catch (e) {
      fallas++;
      console.error(`   🔴 backup falló, foto NO tocada: ${e instanceof Error ? e.message : e}`);
      continue;
    }

    // 2) Recortar y re-subir al MISMO path.
    let nuevo: Buffer | null = null;
    try {
      nuevo = await recortarBuffer(original);
    } catch (e) {
      fallas++;
      console.error(`   🔴 recorte falló, foto NO tocada: ${e instanceof Error ? e.message : e}`);
      continue;
    }
    if (!nuevo || nuevo.length < 5 * 1024) {
      fallas++;
      console.error(`   🔴 resultado inválido (${nuevo?.length ?? 0} bytes), foto NO tocada`);
      continue;
    }
    const { error: errUp } = await db.storage
      .from(BUCKET)
      .upload(objPath, nuevo, { contentType: "image/jpeg", upsert: true, cacheControl: "31536000" });
    if (errUp) {
      fallas++;
      console.error(`   🔴 subida falló: ${errUp.message}`);
      continue;
    }

    // 3) Renovar el ?v= (misma convención que el endpoint de upload) para que
    //    el navegador/CDN no sigan mostrando la foto vieja.
    const { data: pub } = db.storage.from(BUCKET).getPublicUrl(objPath);
    const urlNueva = `${pub.publicUrl}?v=${Date.now()}`;
    const { error: errDb } = await db.from(TABLA).update({ image_url: urlNueva }).eq("sku", fila.sku!);
    if (errDb) {
      fallas++;
      console.error(`   🔴 la foto se subió pero image_url no se actualizó: ${errDb.message}`);
      continue;
    }

    // 4) VERIFICAR: la URL responde con una imagen real y el producto llena.
    try {
      const res = await fetch(urlNueva);
      const ct = res.headers.get("content-type") ?? "";
      const bytes = Buffer.from(await res.arrayBuffer());
      if (!res.ok || !ct.startsWith("image/") || bytes.length < 5 * 1024) {
        throw new Error(`HTTP ${res.status}, ${ct}, ${bytes.length} bytes`);
      }
      const { small, w, h } = await medirBuffer(bytes);
      const cajaNueva = (await import("../src/lib/catalogos/foto-recorte")).detectarCajaProducto(small);
      const llena = cajaNueva
        ? Math.max(cajaNueva.w / small.width, cajaNueva.h / small.height)
        : 0;
      if (llena < 0.7) throw new Error(`el producto quedó en ${(llena * 100).toFixed(0)}% de la dimensión que manda`);
      corregidas++;
      console.log(`   ✅ verificada: ${bytes.length} bytes, ${w}x${h}, producto llena ${(llena * 100).toFixed(0)}%`);
    } catch (e) {
      fallas++;
      console.error(`   🔴 VERIFICACIÓN FALLÓ (restaurar del backup si se ve mal): ${e instanceof Error ? e.message : e}`);
    }
  }

  console.log("\n── RESUMEN ──");
  console.log(`Candidatas a recorte: ${candidatas.length}`);
  if (CONFIRMAR) {
    console.log(`Corregidas y verificadas: ${corregidas}`);
    console.log(`Fallas: ${fallas}`);
    console.log(`Backup: ${BACKUP_DIR}`);
  } else {
    console.log("(dry-run: nada se escribió; correr con --confirm para ejecutar)");
  }
  const agrupado = new Map<string, string[]>();
  for (const n of noTocadas) {
    const lista = agrupado.get(n.motivo) ?? [];
    lista.push(n.sku);
    agrupado.set(n.motivo, lista);
  }
  console.log(`No tocadas: ${noTocadas.length}`);
  for (const [motivo, skus] of agrupado) {
    console.log(`  · ${motivo}: ${skus.length}${skus.length <= 12 ? ` (${skus.join(", ")})` : ` (${skus.slice(0, 8).join(", ")}, …)`}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

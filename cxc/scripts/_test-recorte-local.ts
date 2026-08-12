// Harness LOCAL (no toca red ni DB): corre el detector real sobre fotos de una
// carpeta y guarda antes/después. Uso:
//   DIR="/ruta/fotos" OUT="/ruta/salida" npx tsx scripts/_test-recorte-local.ts
import sharp from "sharp";
import fs from "fs";
import path from "path";
import { medirRecorte, escalarCaja, planRecorte, LADO_MEDICION } from "../src/lib/catalogos/foto-recorte";
import type { RgbaImage } from "../src/lib/catalogos/fotos-b2b";

async function leerSmall(buf: Buffer): Promise<{ small: RgbaImage; w: number; h: number }> {
  const meta = await sharp(buf).rotate().metadata();
  const w = meta.width!, h = meta.height!;
  const { data, info } = await sharp(buf).rotate()
    .resize({ width: LADO_MEDICION, height: LADO_MEDICION, fit: "inside" })
    .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { small: { width: info.width, height: info.height, data: new Uint8ClampedArray(data) }, w, h };
}

async function main() {
  const dir = process.env.DIR!;
  const out = process.env.OUT!;
  fs.mkdirSync(out, { recursive: true });
  const files = fs.readdirSync(dir).filter((f) => /\.(jpe?g|png|webp)$/i.test(f));
  let recortadas = 0;
  for (const f of files) {
    const buf = fs.readFileSync(path.join(dir, f));
    const { small, w, h } = await leerSmall(buf);
    const med = medirRecorte(small, w, h);
    if (!med.ok || !med.caja) {
      console.log(`— NO TOCAR  ${f}  motivo=${med.motivo}  ocup=${med.ocupacionArea?.toFixed(2) ?? "-"}`);
      continue;
    }
    const caja = escalarCaja(med.caja, small.width, small.height, w, h);
    const plan = planRecorte(caja, w, h);
    const [fr, fg, fb] = med.fondo!;
    const region = await sharp(buf).rotate()
      .extract({ left: plan.srcX, top: plan.srcY, width: plan.srcW, height: plan.srcH })
      .resize(plan.dw, plan.dh, { fit: "fill" }).toBuffer();
    const final = await sharp({ create: { width: plan.destW, height: plan.destH, channels: 3, background: { r: fr, g: fg, b: fb } } })
      .composite([{ input: region, left: plan.dx, top: plan.dy }])
      .jpeg({ quality: 85 }).toBuffer();
    fs.copyFileSync(path.join(dir, f), path.join(out, f.replace(/\.[^.]+$/, "") + ".ANTES.jpg"));
    fs.writeFileSync(path.join(out, f.replace(/\.[^.]+$/, "") + ".DESPUES.jpg"), final);
    recortadas++;
    console.log(`✂ RECORTADA ${f}  ${w}x${h} → ${plan.destW}x${plan.destH}  ocup=${med.ocupacionArea!.toFixed(2)}`);
  }
  console.log(`\n${recortadas}/${files.length} recortadas → ${out}`);
}
main();

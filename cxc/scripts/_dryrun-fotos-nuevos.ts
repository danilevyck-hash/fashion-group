/**
 * Dry-run del aviso "entraron productos nuevos sin foto", contra PRODUCCIÓN y
 * SIN mandar nada a Telegram ni mover la marca de agua.
 *
 *   npx tsx scripts/_dryrun-fotos-nuevos.ts
 *
 * Recorre el mismo `avisarNuevosSinFoto` que corren los crons y "Actualizar
 * ahora" (con dryRun), así que lo que imprime es literalmente lo que saldría.
 */
import fs from "node:fs";
import path from "node:path";

for (const line of fs.readFileSync(path.resolve(__dirname, "../.env.local"), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}

async function main() {
  const { avisarNuevosSinFoto, watermarkNuevosSinFoto } = await import("../src/lib/catalogos/fotos-nuevos");
  for (const marca of ["reebok", "joybees", "tommy"] as const) {
    const r = await avisarNuevosSinFoto(marca, { dryRun: true });
    console.log(`\n── ${marca} ── (marca de agua: ${watermarkNuevosSinFoto(marca)})`);
    console.log(`   watermark actual: ${r.watermarkAnterior ?? "(no existe — primera pasada sembraría en silencio)"}`);
    if (r.omitido) {
      console.log(`   ⛔ omitido: ${r.omitido}`);
      continue;
    }
    if (r.sembrado) {
      console.log("   🌱 sembraría la marca de agua sin avisar (anti-ruido: el atraso lo cubre el resumen del lunes)");
      continue;
    }
    if (r.codigos.length === 0) {
      console.log("   ✅ no entró ningún producto nuevo sin foto → NO se manda nada");
      continue;
    }
    console.log(`   📨 mandaría (${r.codigos.length} códigos):`);
    console.log(`      ${r.mensaje}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

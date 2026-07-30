/**
 * Inventario READ-ONLY de las fotos del catálogo Tommy en Storage. NO BORRA NADA.
 *
 *   npx tsx scripts/_diag-fotos-tommy.ts            → informe
 *   npx tsx scripts/_diag-fotos-tommy.ts --lista    → informe + cada archivo
 *
 * El criterio de "en uso" NO vive acá: es `planLimpiezaFotos`
 * (src/lib/catalogos/fotos-en-uso.ts), el mismo módulo puro que cubre
 * fotos-en-uso.test.ts. Este script solo le da de comer datos de producción, así
 * que el informe y el candado no pueden contradecirse.
 *
 * Sirve igual para las otras marcas: `MARCA=joybees npx tsx scripts/…`.
 */
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
  planLimpiezaFotos,
  resumenPorClase,
  type ObjetoStorage,
  type ProductoConFoto,
} from "../src/lib/catalogos/fotos-en-uso";

const CONFIG = {
  tommy: { tabla: "tommy_products", prefijo: "tommy" },
  joybees: { tabla: "joybees_products", prefijo: "joybees" },
  reebok: { tabla: "products", prefijo: "products" },
} as const;

const marca = (process.env.MARCA ?? "tommy") as keyof typeof CONFIG;
const cfg = CONFIG[marca];
if (!cfg) throw new Error(`MARCA desconocida: ${marca}`);
const detalle = process.argv.includes("--lista");

// .env.local a mano: el script corre fuera de Next.
for (const line of fs.readFileSync(path.resolve(__dirname, "../.env.local"), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const BUCKET = "product-images";

/** Lista un prefijo completo (pagina de 1000 en 1000). */
async function listar(prefijo: string) {
  const out: { name: string; id: string | null; metadata: { size?: number } | null; created_at: string }[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db.storage.from(BUCKET).list(prefijo, { limit: 1000, offset });
    if (error) throw new Error(`list ${prefijo}: ${error.message}`);
    const page = (data ?? []) as typeof out;
    out.push(...page);
    if (page.length < 1000) break;
  }
  return out;
}

const mb = (b: number) => `${(b / 1048576).toFixed(2)} MB`;
const kb = (b: number) => `${Math.round(b / 1024)} KB`;

async function main() {
  const { data: filas, error } = await db.from(cfg.tabla).select("sku, image_url, active, oculto_manual");
  if (error) throw new Error(`leer ${cfg.tabla}: ${error.message}`);
  const productos = (filas ?? []) as unknown as (ProductoConFoto & { active: boolean })[];
  console.log(`${cfg.tabla}: ${productos.length} filas · ${productos.filter((p) => p.active).length} activas`);

  // Nivel raíz + todas las carpetas de variantes.
  const objetos: (ObjetoStorage & { created: string })[] = [];
  for (const o of await listar(`${cfg.prefijo}/`)) {
    if (o.id) objetos.push({ path: `${cfg.prefijo}/${o.name}`, bytes: Number(o.metadata?.size ?? 0), created: String(o.created_at).slice(0, 10) });
  }
  const carpetas = (await listar(`${cfg.prefijo}/_v/`)).filter((o) => !o.id).map((o) => o.name);
  for (const c of carpetas) {
    for (const o of await listar(`${cfg.prefijo}/_v/${c}/`)) {
      if (o.id) objetos.push({ path: `${cfg.prefijo}/_v/${c}/${o.name}`, bytes: Number(o.metadata?.size ?? 0), created: String(o.created_at).slice(0, 10) });
    }
  }
  console.log(`Storage ${cfg.prefijo}/: ${objetos.length} archivos en total (${carpetas.length} carpetas de variantes) — ${mb(objetos.reduce((s, o) => s + o.bytes, 0))}\n`);

  const plan = planLimpiezaFotos(objetos, productos, cfg.prefijo);
  if (plan.abortado) {
    console.log(`⛔ NO se propone borrar nada: ${plan.abortado}`);
    return;
  }
  const r = resumenPorClase(plan.fotos);
  console.log("── clasificación ──");
  console.log(`  EN USO       (image_url apunta ahí)                 ${String(r["en-uso"].n).padStart(5)} — ${mb(r["en-uso"].bytes)}`);
  console.log(`  BANCO VIVO   (variante de un SKU que existe)        ${String(r["banco-vivo"].n).padStart(5)} — ${mb(r["banco-vivo"].bytes)}`);
  console.log(`  REEMPLAZADA  (foto anterior; el SKU ya tiene otra)  ${String(r.reemplazada.n).padStart(5)} — ${mb(r.reemplazada.bytes)}`);
  console.log(`  HUÉRFANA     (no se ató a ninguna fila — NO borrar) ${String(r.huerfana.n).padStart(5)} — ${mb(r.huerfana.bytes)}`);
  console.log(`\n➡️  Se propone borrar SOLO las REEMPLAZADAS: ${plan.aBorrar.length} archivos — ${mb(plan.bytesLiberados)}`);

  const porFecha = new Map<string, number>();
  for (const f of plan.aBorrar) {
    const c = (f as ObjetoStorage & { created: string }).created;
    porFecha.set(c, (porFecha.get(c) ?? 0) + 1);
  }
  if (porFecha.size > 0) {
    console.log(`    por fecha de subida: ${[...porFecha].sort().map(([d, n]) => `${d}=${n}`).join("  ")}`);
  }
  if (detalle) {
    console.log("\n── candidatas, una por una ──");
    for (const f of [...plan.aBorrar].sort((a, b) => a.path.localeCompare(b.path))) {
      console.log(`   ${f.path}  ${kb(f.bytes)}  sku=${f.sku}`);
    }
    const huerfanas = plan.fotos.filter((f) => f.clase === "huerfana");
    if (huerfanas.length > 0) {
      console.log("\n── huérfanas (NO se borran) ──");
      for (const f of huerfanas) console.log(`   ${f.path}  ${kb(f.bytes)}  sku=${f.sku ?? "(ninguno)"}`);
    }
  }

  const sinFoto = productos
    .filter((p) => p.active && !String(p.image_url ?? "").trim())
    .map((p) => String(p.sku))
    .sort();
  console.log(`\nProductos activos SIN foto: ${sinFoto.length}`);
  if (sinFoto.length > 0) console.log(`   ${sinFoto.join(", ")}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

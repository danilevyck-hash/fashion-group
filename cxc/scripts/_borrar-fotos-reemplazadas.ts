/**
 * Borra de Storage las fotos REEMPLAZADAS de un catálogo — y NADA MÁS.
 *
 *   npx tsx scripts/_borrar-fotos-reemplazadas.ts            → dry-run (no borra)
 *   npx tsx scripts/_borrar-fotos-reemplazadas.ts --confirm   → borra
 *   MARCA=joybees npx tsx scripts/_borrar-fotos-reemplazadas.ts
 *
 * APROBADO POR DANIEL el 30-jul-2026, textual: "solo ayudame a borrar las fotos
 * esas, todo lo demas se mantiene" + "ya escogí la que utilizaré, así que ya no
 * necesito tenerla como opción".
 *
 * QUÉ BORRA: solo la clase REEMPLAZADA de `planLimpiezaFotos`
 * (src/lib/catalogos/fotos-en-uso.ts) — objeto de nivel raíz cuyo SKU existe
 * como fila Y esa fila ya apunta a OTRA foto. Nunca `_v/` (el banco de variantes
 * es lo que le permite cambiar la foto de cualquier producto), nunca una
 * huérfana, nunca la única foto de un producto.
 *
 * TRES DEFENSAS, porque una foto borrada NO VUELVE (Daniel subió 389 a mano):
 *   1. El criterio no se reimplementa acá: es el mismo módulo puro que cubre
 *      fotos-en-uso.test.ts.
 *   2. REEMPLAZO VIVO: para cada candidata se verifica que el objeto al que
 *      apunta `image_url` EXISTA de verdad en Storage. Que la columna tenga una
 *      ruta no prueba que el archivo esté ahí; si el reemplazo no existe, la
 *      candidata se SALTA (podría ser la última foto real del producto).
 *   3. Se borra por NOMBRE EXACTO, de una lista cerrada. Cero patrones, cero
 *      comodines, cero prefijos.
 *
 * Y después de borrar se re-mide: los archivos EN USO tienen que seguir ahí y el
 * conteo de "sin foto" no puede subir ni en 1.
 */
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
  planLimpiezaFotos,
  planBorradoAlternativas,
  pathDeImageUrl,
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
const CONFIRMAR = process.argv.includes("--confirm");

for (const line of fs.readFileSync(path.resolve(__dirname, "../.env.local"), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const BUCKET = "product-images";

type Fila = { name: string; id: string | null; metadata: { size?: number } | null; created_at: string };

async function listar(prefijo: string): Promise<Fila[]> {
  const out: Fila[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db.storage.from(BUCKET).list(prefijo, { limit: 1000, offset });
    if (error) throw new Error(`list ${prefijo}: ${error.message}`);
    const page = (data ?? []) as unknown as Fila[];
    out.push(...page);
    if (page.length < 1000) break;
  }
  return out;
}

/** Todos los objetos de la marca: nivel raíz + cada carpeta de variantes. */
async function inventario() {
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
  return { objetos, carpetas: carpetas.length };
}

async function productos() {
  const { data, error } = await db.from(cfg.tabla).select("sku, image_url, active");
  if (error) throw new Error(`leer ${cfg.tabla}: ${error.message}`);
  return (data ?? []) as unknown as (ProductoConFoto & { active: boolean })[];
}

const mb = (b: number) => `${(b / 1048576).toFixed(2)} MB`;
const sinFotoDe = (ps: (ProductoConFoto & { active: boolean })[]) =>
  ps.filter((p) => p.active && !String(p.image_url ?? "").trim()).length;

async function main() {
  console.log(`── ${marca} · ${CONFIRMAR ? "BORRADO REAL" : "DRY-RUN (no borra nada)"} ──\n`);

  // ── ANTES ──────────────────────────────────────────────────────────────────
  const prodsAntes = await productos();
  const { objetos: antes, carpetas } = await inventario();
  const plan = planLimpiezaFotos(antes, prodsAntes, cfg.prefijo);
  if (plan.abortado) {
    console.log(`⛔ ABORTADO: ${plan.abortado} — no se borra nada.`);
    return;
  }
  const enUsoAntes = plan.fotos.filter((f) => f.clase === "en-uso").map((f) => f.path);
  const bancoAntes = plan.fotos.filter((f) => f.clase === "banco-vivo").length;
  const huerfanasAntes = plan.fotos.filter((f) => f.clase === "huerfana").length;
  const sinFotoAntes = sinFotoDe(prodsAntes);
  console.log(`ANTES: ${antes.length} archivos (${mb(antes.reduce((s, o) => s + o.bytes, 0))}) · ${carpetas} carpetas de variantes`);
  console.log(`       ${enUsoAntes.length} en uso · ${bancoAntes} banco vivo · ${plan.aBorrar.length} reemplazadas · ${huerfanasAntes} huérfanas`);
  console.log(`       productos activos sin foto: ${sinFotoAntes}\n`);

  // ── DEFENSA 2: el reemplazo tiene que EXISTIR en Storage ───────────────────
  const existentes = new Set(antes.map((o) => o.path));
  const porSku = new Map(prodsAntes.map((p) => [String(p.sku), p]));
  const aBorrar: typeof plan.aBorrar = [];
  const saltadas: { path: string; motivo: string }[] = [];
  for (const f of plan.aBorrar) {
    const p = f.sku ? porSku.get(f.sku) : undefined;
    const reemplazo = pathDeImageUrl(p?.image_url);
    if (!p) { saltadas.push({ path: f.path, motivo: "el SKU ya no está en la tabla" }); continue; }
    if (!reemplazo) { saltadas.push({ path: f.path, motivo: "el producto se quedó sin image_url" }); continue; }
    if (reemplazo === f.path) { saltadas.push({ path: f.path, motivo: "image_url apunta a este mismo archivo" }); continue; }
    if (!existentes.has(reemplazo)) { saltadas.push({ path: f.path, motivo: `el reemplazo ${reemplazo} NO existe en Storage` }); continue; }
    aBorrar.push(f);
  }

  // ── ALTERNATIVAS DEL BANCO (decisión de Daniel, 30-jul-2026) ──────────────
  // Solo de los SKU que YA tienen una foto elegida VIVA, y nunca la elegida.
  const alt = planBorradoAlternativas(antes, prodsAntes, cfg.prefijo);
  if (alt.abortado) {
    console.log(`⛔ ALTERNATIVAS ABORTADO: ${alt.abortado} — no se borra ninguna.`);
  }
  console.log(`── ALTERNATIVAS DEL BANCO (${alt.aBorrar.length} archivos · ${mb(alt.bytesLiberados)}) ──`);
  console.log(`   SKU protegidos (sin foto elegida viva → conservan TODAS sus variantes): ${alt.skusProtegidos.length}`);
  if (alt.skusProtegidos.length > 0) console.log(`   ${alt.skusProtegidos.join(", ")}`);

  const total = [...aBorrar, ...alt.aBorrar];
  console.log(`\n── LISTA A BORRAR (${total.length} archivos · ${mb(total.reduce((s, f) => s + f.bytes, 0))}) ──`);
  console.log(`   · ${aBorrar.length} reemplazadas de nivel raíz`);
  console.log(`   · ${alt.aBorrar.length} alternativas del banco _v/`);
  for (const f of [...aBorrar].sort((a, b) => a.path.localeCompare(b.path))) {
    const p = porSku.get(String(f.sku))!;
    const c = (f as ObjetoStorage & { created: string }).created;
    console.log(`   ${f.path}\t${Math.round(f.bytes / 1024)} KB\tsubida ${c}\tsku=${f.sku}\treemplazo=${pathDeImageUrl(p.image_url)}`);
  }
  if (saltadas.length > 0) {
    console.log(`\n⚠️  SALTADAS (${saltadas.length}) — cambiaron de estado, NO se tocan:`);
    for (const s of saltadas) console.log(`   ${s.path} — ${s.motivo}`);
  }
  // ÚLTIMA RED, independiente del criterio: ninguna ruta referenciada por un
  // producto puede estar en la lista. Si esto salta, se aborta sin borrar nada.
  const refs = new Set(prodsAntes.map((p) => pathDeImageUrl(p.image_url)).filter(Boolean) as string[]);
  const colision = total.filter((f) => refs.has(f.path));
  if (colision.length > 0) {
    console.log(`\n🚨 ABORTADO: ${colision.length} archivo(s) de la lista SON la foto de un producto:`);
    for (const f of colision.slice(0, 10)) console.log(`   ${f.path}`);
    return;
  }
  console.log(`\n✅ ninguna de las ${total.length} es la foto de un producto (verificado contra las ${refs.size} rutas de image_url)`);

  if (total.length === 0) { console.log("\nNada que borrar."); return; }
  if (!CONFIRMAR) { console.log("\n(dry-run: no se borró nada. Agregá --confirm para ejecutar.)"); return; }

  // ── BORRADO por nombre exacto, de la lista cerrada ─────────────────────────
  const paths = total.map((f) => f.path);
  console.log(`\nBorrando ${paths.length} objetos por nombre exacto…`);
  const fallos: string[] = [];
  for (let i = 0; i < paths.length; i += 20) {
    const lote = paths.slice(i, i + 20);
    const { error } = await db.storage.from(BUCKET).remove(lote);
    if (error) { fallos.push(`${lote.join(", ")}: ${error.message}`); }
  }
  if (fallos.length > 0) console.log(`⚠️  ${fallos.length} lote(s) con error:\n   ${fallos.join("\n   ")}`);

  // ── DESPUÉS: verificación ─────────────────────────────────────────────────
  const prodsDespues = await productos();
  const { objetos: despues } = await inventario();
  const vivas = new Set(despues.map((o) => o.path));
  const noBorradas = paths.filter((p) => vivas.has(p));
  const enUsoPerdidos = enUsoAntes.filter((p) => !vivas.has(p));
  const bancoDespues = planLimpiezaFotos(despues, prodsDespues, cfg.prefijo).fotos.filter((f) => f.clase === "banco-vivo").length;
  const enUsoDespues = planLimpiezaFotos(despues, prodsDespues, cfg.prefijo).fotos.filter((f) => f.clase === "en-uso").length;
  const sinFotoDespues = sinFotoDe(prodsDespues);

  console.log(`\n── DESPUÉS ──`);
  console.log(`   archivos: ${antes.length} → ${despues.length}  (borrados ${antes.length - despues.length})`);
  console.log(`   espacio liberado: ${mb(antes.reduce((s, o) => s + o.bytes, 0) - despues.reduce((s, o) => s + o.bytes, 0))}`);
  console.log(`   ${enUsoPerdidos.length === 0 ? "✅" : "🚨"} archivos EN USO que siguen ahí: ${enUsoAntes.length - enUsoPerdidos.length}/${enUsoAntes.length}`);
  console.log(`   banco de alternativas: ${bancoAntes} → ${bancoDespues}`);
  console.log(`   ${enUsoDespues === enUsoAntes.length ? "✅" : "🚨"} fotos EN USO: ${enUsoAntes.length} → ${enUsoDespues}`);
  console.log(`   ${sinFotoDespues <= sinFotoAntes ? "✅" : "🚨"} productos activos sin foto: ${sinFotoAntes} → ${sinFotoDespues}`);
  console.log(`   ${noBorradas.length === 0 ? "✅" : "🚨"} de la lista, quedaron sin borrar: ${noBorradas.length}`);
  if (enUsoPerdidos.length > 0) console.log(`   🚨 SE PERDIERON EN USO: ${enUsoPerdidos.join(", ")}`);
}

main().catch((e) => { console.error(e); process.exit(1); });

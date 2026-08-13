/**
 * READ-ONLY. ¿Qué pasa con las fotos de los SKU que llevan separadores
 * (guión, punto, underscore) si alguien corrige el código EN Switch?
 * NO BORRA NI ESCRIBE NADA.
 *
 *   DOTENV_CONFIG_PATH=.env.local npx tsx scripts/_diag-fotos-sku-separadores.ts
 *
 * EL PRECEDENTE (jul-2026): 12 SKU de Tommy "perdieron la foto" al corregirse
 * el código en Switch. Este script mide qué tan expuesto está eso HOY.
 *
 * 🔑 LO QUE HAY QUE ENTENDER ANTES DE LEER LA SALIDA: `normalizarSkuStorage`
 * borra TODO lo que no sea a-z0-9, así que `T3X9-32613336` y `T3X932613336`
 * caen en la MISMA llave de Storage (`t3x932613336`). O sea que el ARCHIVO
 * nunca se pierde al corregir un separador — lo que se pierde es el valor de
 * la columna `image_url` de la fila, porque el sync crea una fila NUEVA para
 * el código nuevo y `image_url` arranca en null. La foto sigue ahí y el
 * selector del admin ("Cambiar foto") la vuelve a encontrar, porque busca por
 * la misma llave normalizada.
 *
 * Por eso el número que importa es RECUPERABLES / RESCATABLES: productos sin
 * `image_url` cuya foto SÍ existe en Storage bajo su llave normalizada. Ésos
 * son los que se ven sin imagen en el catálogo teniendo la foto guardada.
 *
 * Y el otro hallazgo es la COLISIÓN: dos SKU DISTINTOS que caen en la misma
 * llave comparten carpeta de variantes y foto elegida — subirle foto a uno le
 * pisa la del otro. Eso se corrige en Switch, no acá.
 */
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { normalizarSkuStorage } from "../src/lib/catalogos/fotos-b2b";
import { pathDeImageUrl } from "../src/lib/catalogos/fotos-en-uso";

for (const line of fs.readFileSync(path.resolve(__dirname, "../.env.local"), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const MARCAS = [
  { key: "reebok", tabla: "products", prefijo: "products" },
  { key: "joybees", tabla: "joybees_products", prefijo: "joybees" },
  { key: "tommy", tabla: "tommy_products", prefijo: "tommy" },
  { key: "calvin", tabla: "calvin_products", prefijo: "calvin" },
] as const;
const BUCKET = "product-images";

/** Lista un prefijo del bucket. `esCarpeta` = el objeto es un "directorio". */
async function listar(prefijo: string) {
  const out: { name: string; esCarpeta: boolean; size: number }[] = [];
  for (let off = 0; ; off += 100) {
    const { data, error } = await db.storage.from(BUCKET).list(prefijo, { limit: 100, offset: off });
    if (error) throw new Error(`list ${prefijo}: ${error.message}`);
    for (const o of data ?? []) {
      out.push({
        name: o.name,
        esCarpeta: o.id === null,
        size: (o.metadata as { size?: number } | null)?.size ?? 0,
      });
    }
    if ((data ?? []).length < 100) break;
  }
  return out;
}

async function main() {
  for (const m of MARCAS) {
    const { data, error } = await db.from(m.tabla).select("sku, image_url, active").order("sku");
    if (error) {
      console.log(`\n=== ${m.key} === ERR ${error.message}`);
      continue;
    }
    const filas = (data ?? []) as { sku: string | null; image_url: string | null; active: boolean | null }[];
    const tieneFoto = (p: { image_url: string | null }) => !!p.image_url && String(p.image_url).trim() !== "";

    const conSep = filas.filter((p) => /[^A-Za-z0-9]/.test(String(p.sku ?? "")));

    // COLISIONES: dos SKU distintos → una sola llave de Storage.
    const porLlave = new Map<string, Set<string>>();
    for (const p of filas) {
      const k = normalizarSkuStorage(String(p.sku ?? ""));
      if (!k) continue;
      (porLlave.get(k) ?? porLlave.set(k, new Set()).get(k)!).add(String(p.sku));
    }
    const colisiones = [...porLlave.entries()].filter(([, v]) => v.size > 1);

    // Productos SIN image_url cuya foto igual existe en Storage.
    const sinFotoPorLlave = new Map<string, string>();
    for (const p of filas) {
      if (tieneFoto(p)) continue;
      const k = normalizarSkuStorage(String(p.sku ?? ""));
      if (k) sinFotoPorLlave.set(k, String(p.sku));
    }
    const referenciadas = new Set<string>();
    for (const p of filas) {
      const pa = pathDeImageUrl(p.image_url);
      if (pa) referenciadas.add(pa);
    }

    let raiz: { name: string; esCarpeta: boolean; size: number }[] = [];
    let carpetas: string[] = [];
    try {
      raiz = (await listar(m.prefijo)).filter((o) => !o.esCarpeta);
      carpetas = (await listar(`${m.prefijo}/_v`)).filter((o) => o.esCarpeta).map((o) => o.name);
    } catch (e) {
      console.log(`  storage ERR: ${(e as Error).message}`);
    }
    const setCarpetas = new Set(carpetas);

    const recuperablesRaiz = raiz
      .filter((o) => !referenciadas.has(`${m.prefijo}/${o.name}`) && o.size > 5000)
      .map((o) => ({ nombre: o.name, k: normalizarSkuStorage(o.name.replace(/\.[^.]+$/, "")) }))
      .filter((x) => sinFotoPorLlave.has(x.k));
    const recuperablesVar = [...sinFotoPorLlave.entries()].filter(([k]) => setCarpetas.has(k));

    console.log(`\n=== ${m.key} (${m.tabla}) ===`);
    console.log(`  filas: ${filas.length} · activas: ${filas.filter((p) => p.active).length}`);
    console.log(`  SKU con separador: ${conSep.length} · de esos CON foto: ${conSep.filter(tieneFoto).length}`);
    if (conSep.length) console.log(`    ej: ${conSep.slice(0, 6).map((p) => p.sku).join(", ")}`);
    console.log(`  productos SIN image_url: ${filas.filter((p) => !tieneFoto(p)).length} (activos: ${filas.filter((p) => !tieneFoto(p) && p.active).length})`);
    console.log(`  🔎 RECUPERABLES (sin image_url pero la foto está en Storage): ${recuperablesRaiz.length + recuperablesVar.length}`);
    recuperablesRaiz.slice(0, 15).forEach((x) => console.log(`     ${m.prefijo}/${x.nombre} → sku ${sinFotoPorLlave.get(x.k)}`));
    recuperablesVar.slice(0, 15).forEach(([k, sku]) => console.log(`     ${m.prefijo}/_v/${k}/ → sku ${sku}`));
    console.log(`  ⚠️ COLISIONES de llave (2 SKU → 1 carpeta): ${colisiones.length}`);
    colisiones.forEach(([k, v]) => console.log(`     ${k} ← ${[...v].join(" | ")}`));
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});

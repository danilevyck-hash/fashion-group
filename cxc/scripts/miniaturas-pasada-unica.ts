/**
 * Pasada única (19-nov-2026): genera las miniaturas que FALTEN de las fotos
 * que ya están en el bucket `product-images`, con la MISMA función que usa la
 * app (`guardarFotoConMiniaturas`, src/lib/catalogo/miniaturas.ts).
 *
 * Solo SUBE archivos nuevos (`<ruta>__600.webp`, `<ruta>__160.webp`): no borra,
 * no toca los originales (la función sin `original` solo los LEE) y no toca la
 * base. Idempotente: lo que ya tiene sus dos miniaturas se salta.
 *
 *   npx tsx scripts/miniaturas-pasada-unica.ts           → solo cuenta
 *   npx tsx scripts/miniaturas-pasada-unica.ts --apply   → genera
 */
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { guardarFotoConMiniaturas } from "../src/lib/catalogo/miniaturas";
import { ANCHOS_MINIATURA, BUCKET_FOTOS, esMiniatura, rutaMiniatura } from "../src/lib/image-thumb";

const env = Object.fromEntries(
  fs.readFileSync(path.resolve(process.cwd(), ".env.local"), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")];
    }),
);
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local");
const APPLY = process.argv.includes("--apply");
const sb = createClient(url, key, { auth: { persistSession: false } });

/** Todo el bucket, recursivo (list-v2 con delimiter vacío, como variantes-server). */
async function listarTodo(): Promise<string[]> {
  const out: string[] = [];
  let cursor: string | undefined;
  for (;;) {
    const resp = await fetch(`${url}/storage/v1/object/list-v2/${BUCKET_FOTOS}`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ prefix: "", limit: 1000, delimiter: "", ...(cursor ? { cursor } : {}) }),
    });
    if (!resp.ok) throw new Error(`list-v2 ${resp.status}: ${await resp.text()}`);
    const json = (await resp.json()) as { objects?: { name: string }[]; hasNext?: boolean; nextCursor?: string };
    const objetos = json.objects ?? [];
    out.push(...objetos.map((o) => o.name));
    if (!json.hasNext || !json.nextCursor || objetos.length === 0) break;
    cursor = json.nextCursor;
  }
  return out;
}

async function main(): Promise<void> {
  const todos = await listarTodo();
  const existentes = new Set(todos);
  const originales = todos.filter((p) => !esMiniatura(p) && !p.endsWith(".emptyFolderPlaceholder"));
  const faltan = originales.filter((p) => ANCHOS_MINIATURA.some((a) => !existentes.has(rutaMiniatura(p, a))));
  console.log(`Objetos: ${todos.length} · originales: ${originales.length} · ya tenían miniaturas: ${originales.length - faltan.length} · faltan: ${faltan.length}`);
  if (!APPLY) {
    console.log("Solo conteo. Para generar: --apply");
    return;
  }

  let generadas = 0;
  const fallidas: { ruta: string; motivo: string }[] = [];
  for (let i = 0; i < faltan.length; i += 8) {
    await Promise.all(
      faltan.slice(i, i + 8).map(async (ruta) => {
        const r = await guardarFotoConMiniaturas(sb, ruta);
        if (r.miniaturas) generadas++;
        else fallidas.push({ ruta, motivo: r.motivo ?? "desconocido" });
      }),
    );
    process.stdout.write(`\r${Math.min(i + 8, faltan.length)}/${faltan.length}`);
  }
  console.log(`\nGeneradas: ${generadas} · ya existían: ${originales.length - faltan.length} · fallidas: ${fallidas.length}`);
  for (const f of fallidas) console.log(`  ✗ ${f.ruta}: ${f.motivo}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

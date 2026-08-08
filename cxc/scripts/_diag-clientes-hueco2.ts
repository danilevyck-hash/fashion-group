/**
 * READ-ONLY. Segunda pasada: ¿dónde están los 3 clientes que faltan?
 * NO ESCRIBE NADA. Solo SELECT sobre nuestra base (ni una llamada a Switch).
 *
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_diag-clientes-hueco2.ts
 */
import { supabaseServer } from "../src/lib/supabase-server";
import { leerTodoPaginado } from "../src/lib/supabase-paginado";

const BUSCADOS = ["D-134", "D-26", "D-170", "D-201", "12188"];
const NOMBRES = ["REY STORE", "CITY MODA", "MACHETAZO", "AMERICAN CLASSIC", "ACTIVE SHOES"];

interface SwitchRow { empresa_key: string; codigo: string | null; nombre: string | null; synced_at: string | null }

async function main() {
  const sw = await leerTodoPaginado<SwitchRow>("switch_clientes", (c, from, to) =>
    supabaseServer
      .from("switch_clientes")
      .select("empresa_key, codigo, nombre, synced_at", c ? { count: "exact" } : {})
      .order("id", { ascending: true })
      .range(from, to)
  );

  console.log("=== códigos buscados en switch_clientes ===");
  for (const cod of BUSCADOS) {
    const hits = sw.filter((r) => (r.codigo ?? "").trim() === cod);
    console.log(`\n${cod}: ${hits.length} fila(s)`);
    for (const h of hits) console.log(`   ${h.empresa_key.padEnd(22)} "${h.nombre}"  synced ${h.synced_at}`);
  }

  console.log("\n\n=== por NOMBRE en switch_clientes ===");
  for (const n of NOMBRES) {
    const hits = sw.filter((r) => (r.nombre ?? "").toUpperCase().includes(n));
    console.log(`\n"${n}": ${hits.length} fila(s)`);
    for (const h of hits.slice(0, 12)) console.log(`   ${(h.codigo ?? "").padEnd(8)} ${h.empresa_key.padEnd(22)} "${h.nombre}"`);
    if (hits.length > 12) console.log(`   … y ${hits.length - 12} más`);
  }

  // frescura por empresa
  console.log("\n\n=== frescura de switch_clientes por empresa ===");
  const porEmp = new Map<string, { n: number; max: string }>();
  for (const r of sw) {
    const cur = porEmp.get(r.empresa_key) ?? { n: 0, max: "" };
    cur.n++;
    if ((r.synced_at ?? "") > cur.max) cur.max = r.synced_at ?? "";
    porEmp.set(r.empresa_key, cur);
  }
  for (const [e, v] of [...porEmp].sort()) console.log(`   ${e.padEnd(22)} ${String(v.n).padStart(5)} filas   último sync ${v.max}`);

  // ¿y en clientes_master?
  const master = await leerTodoPaginado<{ codigo: string | null; nombre: string; deleted: boolean }>(
    "clientes_master",
    (c, from, to) =>
      supabaseServer
        .from("clientes_master")
        .select("codigo, nombre, deleted", c ? { count: "exact" } : {})
        .order("id", { ascending: true })
        .range(from, to)
  );
  console.log("\n\n=== los mismos en clientes_master ===");
  for (const cod of BUSCADOS) {
    const hits = master.filter((r) => (r.codigo ?? "").trim() === cod);
    console.log(`${cod}: ${hits.length ? hits.map((h) => `"${h.nombre}"${h.deleted ? " (BORRADO)" : ""}`).join(", ") : "— no está —"}`);
  }
  for (const n of NOMBRES) {
    const hits = master.filter((r) => r.nombre.toUpperCase().includes(n));
    console.log(`"${n}": ${hits.length} → ${hits.slice(0, 8).map((h) => `${h.codigo ?? "(sin cod)"}=${h.nombre}`).join(" | ")}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });

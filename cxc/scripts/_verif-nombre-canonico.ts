/**
 * READ-ONLY. ¿La regla nueva le cambia el nombre a alguien?
 *
 * Corre `elegirNombreCanonico` —la regla determinista— sobre los datos REALES de
 * `switch_clientes` y compara, código por código, contra lo que hoy tiene
 * `clientes_master`. Arreglar el MECANISMO no puede renombrar clientes.
 *
 * NO ESCRIBE NADA. Solo SELECT.
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_verif-nombre-canonico.ts
 */
import { supabaseServer } from "../src/lib/supabase-server";
import { leerTodoPaginado } from "../src/lib/supabase-paginado";
import { elegirNombreCanonico, codigosAmbiguos, type CandidatoNombre } from "../src/lib/clientes/nombre-canonico";

interface Row { empresa_key: string; codigo: string | null; nombre: string | null }

async function main() {
  const rows = await leerTodoPaginado<Row>("switch_clientes", (c, from, to) =>
    supabaseServer
      .from("switch_clientes")
      .select("empresa_key, codigo, nombre", c ? { count: "exact" } : {})
      .neq("empresa_key", "american_classic")
      .order("id", { ascending: true })
      .range(from, to)
  );
  const master = await leerTodoPaginado<{ codigo: string | null; nombre: string; deleted: boolean }>(
    "clientes_master",
    (c, from, to) =>
      supabaseServer
        .from("clientes_master")
        .select("codigo, nombre, deleted", c ? { count: "exact" } : {})
        .order("id", { ascending: true })
        .range(from, to)
  );

  const byCodigo = new Map<string, CandidatoNombre[]>();
  for (const r of rows) {
    const cod = (r.codigo ?? "").trim();
    if (!cod) continue;
    const l = byCodigo.get(cod);
    if (l) l.push(r); else byCodigo.set(cod, [r]);
  }

  const hoy = new Map<string, string>();
  for (const m of master) if (!m.deleted && m.codigo) hoy.set(m.codigo.trim(), m.nombre);

  let iguales = 0;
  const distintos: Array<{ cod: string; antes: string; ahora: string }> = [];
  const nuevos: string[] = [];
  for (const [cod, filas] of byCodigo) {
    const nuevo = cod === "TCKCTA" ? "VENTAS LOCAL" : elegirNombreCanonico(filas) ?? "";
    if (!nuevo) continue;
    const antes = hoy.get(cod);
    if (antes === undefined) { nuevos.push(`${cod} → "${nuevo}"`); continue; }
    if (antes === nuevo) iguales++;
    else distintos.push({ cod, antes, ahora: nuevo });
  }

  console.log("=== la regla nueva contra lo que hay HOY en clientes_master ===");
  console.log(`códigos evaluados : ${byCodigo.size}`);
  console.log(`nombre IDÉNTICO   : ${iguales}`);
  console.log(`nombre DISTINTO   : ${distintos.length}`);
  console.log(`códigos NUEVOS    : ${nuevos.length}`);
  for (const d of distintos) console.log(`   ⚠ ${d.cod}: "${d.antes}"  →  "${d.ahora}"`);
  for (const n of nuevos) console.log(`   + ${n}`);

  const amb = codigosAmbiguos(byCodigo);
  console.log(`\n=== códigos con MÁS DE UN nombre (lo que hay que corregir en Switch) ===`);
  console.log(`total: ${amb.length}`);
  for (const a of amb) {
    console.log(`   ${a.codigo}`);
    for (const v of a.variantes) console.log(`      "${v.nombre}"  [${v.empresas.join(", ")}]`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });

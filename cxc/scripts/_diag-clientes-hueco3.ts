/**
 * READ-ONLY. Tercera pasada: ¿de qué tamaño es el hueco real?
 *
 * Hipótesis medida en la pasada 2: el código D-XXX NO es una llave global —
 * cada empresa de Switch tiene su propia numeración. `clientes_master.codigo`
 * es UNIQUE global y `syncClientesMaster` se queda con UNA fila por código: la
 * de `synced_at` más reciente, o sea **la empresa cuyo cron corrió último**.
 *
 * NO ESCRIBE NADA. Solo SELECT.
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_diag-clientes-hueco3.ts
 */
import { supabaseServer } from "../src/lib/supabase-server";
import { leerTodoPaginado } from "../src/lib/supabase-paginado";
import { EMPRESAS_DEL_GRUPO } from "../src/lib/clientes/mundos";

const N2 = (s: string | null | undefined): string =>
  (s ?? "").trim().toUpperCase().replace(/[.,]/g, "").replace(/\s+/g, " ").trim();

const GRUPO = new Set<string>(EMPRESAS_DEL_GRUPO);

interface SwitchRow { empresa_key: string; codigo: string | null; nombre: string | null; synced_at: string | null }

async function main() {
  const sw = await leerTodoPaginado<SwitchRow>("switch_clientes", (c, from, to) =>
    supabaseServer
      .from("switch_clientes")
      .select("empresa_key, codigo, nombre, synced_at", c ? { count: "exact" } : {})
      .order("id", { ascending: true })
      .range(from, to)
  );
  const master = await leerTodoPaginado<{ codigo: string | null; nombre: string; nombre_normalized: string; deleted: boolean }>(
    "clientes_master",
    (c, from, to) =>
      supabaseServer
        .from("clientes_master")
        .select("codigo, nombre, nombre_normalized, deleted", c ? { count: "exact" } : {})
        .order("id", { ascending: true })
        .range(from, to)
  );
  const masterPorCod = new Map<string, string>();
  for (const m of master) if (!m.deleted && m.codigo) masterPorCod.set(m.codigo.trim(), m.nombre);

  // ── A. códigos del grupo con MÁS DE UN nombre entre las 6 empresas ────────
  const porCod = new Map<string, Map<string, string[]>>(); // codigo → n2 → empresas
  for (const r of sw) {
    if (!GRUPO.has(r.empresa_key)) continue;
    const cod = (r.codigo ?? "").trim();
    const n2 = N2(r.nombre);
    if (!cod || !n2) continue;
    const m = porCod.get(cod) ?? new Map<string, string[]>();
    m.set(n2, [...(m.get(n2) ?? []), r.empresa_key]);
    porCod.set(cod, m);
  }
  const ambiguos = [...porCod.entries()].filter(([, m]) => m.size > 1);
  console.log("=== A. UN CÓDIGO, VARIOS NOMBRES (dentro de las 6 del grupo) ===");
  console.log(`códigos del grupo: ${porCod.size}   ·   con nombre AMBIGUO: ${ambiguos.length}\n`);
  for (const [cod, m] of ambiguos.sort((a, b) => a[0].localeCompare(b[0]))) {
    const enMaster = masterPorCod.get(cod);
    console.log(`  ${cod}`);
    for (const [n2, emps] of m) {
      const gana = enMaster && N2(enMaster) === n2 ? "  ← ES EL QUE QUEDÓ EN EL MAESTRO" : "";
      console.log(`      "${n2}"  [${emps.sort().join(", ")}]${gana}`);
    }
    if (!enMaster) console.log(`      (el maestro no tiene este código)`);
  }

  // ── B. ¿quién gana? el orden de synced_at por empresa ─────────────────────
  console.log("\n=== B. quién gana el desempate (synced_at desc, sin american_classic) ===");
  const ult = new Map<string, string>();
  for (const r of sw) {
    const cur = ult.get(r.empresa_key) ?? "";
    if ((r.synced_at ?? "") > cur) ult.set(r.empresa_key, r.synced_at ?? "");
  }
  for (const [e, t] of [...ult].sort((a, b) => b[1].localeCompare(a[1]))) {
    console.log(`   ${t}  ${e}${e === "american_classic" ? "   (EXCLUIDA del sync)" : ""}`);
  }

  // ── C. nombres del grupo que NO se pueden ver por ningún lado ─────────────
  console.log("\n=== C. nombres reales del grupo que el maestro NO muestra ===");
  const nombresMaster = new Set(master.filter((m) => !m.deleted).map((m) => m.nombre_normalized));
  const perdidos: Array<{ cod: string; n2: string; emps: string[] }> = [];
  for (const [cod, m] of porCod) {
    for (const [n2, emps] of m) {
      if (!nombresMaster.has(n2)) perdidos.push({ cod, n2, emps: emps.sort() });
    }
  }
  console.log(`total: ${perdidos.length}`);
  for (const p of perdidos.sort((a, b) => a.cod.localeCompare(b.cod))) {
    console.log(`   ${p.cod.padEnd(8)} "${p.n2}"   [${p.emps.join(", ")}]`);
  }

  // ── D. códigos del maestro que ya no existen en Switch ────────────────────
  console.log("\n=== D. códigos D-XXX del maestro sin rastro en switch_clientes ===");
  const codsSwitch = new Set<string>();
  for (const r of sw) if (r.codigo) codsSwitch.add(r.codigo.trim());
  const huerfanos = master.filter((m) => !m.deleted && m.codigo && /^D-/i.test(m.codigo) && !codsSwitch.has(m.codigo.trim()));
  console.log(`total: ${huerfanos.length}`);
  for (const h of huerfanos) console.log(`   ${h.codigo}  "${h.nombre}"`);

  // ── E. intercompañía ─────────────────────────────────────────────────────
  console.log("\n=== E. candidatos a intercompañía (nombre = una empresa del grupo) ===");
  const PISTAS = ["ACTIVE SHOES", "ACTIVE WEAR", "FASHION WEAR", "FASHION SHOES", "VISTANA", "JOYSTEP", "AMERICAN CLASSIC", "CONFECCIONES BOSTON"];
  for (const m of master) {
    if (m.deleted) continue;
    if (PISTAS.some((p) => m.nombre_normalized.includes(p))) {
      const enGrupo = porCod.has((m.codigo ?? "").trim());
      console.log(`   ${(m.codigo ?? "(sin cod)").padEnd(10)} "${m.nombre}"   ${enGrupo ? "· le compra a las 6 del grupo" : "· no aparece en las 6"}`);
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });

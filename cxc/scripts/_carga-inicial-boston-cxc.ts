/**
 * CARGA INICIAL del estado de cuenta de Confecciones Boston → switch_estadocuenta.
 *
 *   npx tsx scripts/_carga-inicial-boston-cxc.ts [--escribir]
 *
 * Sin `--escribir` no toca nada.
 *
 * Aprobado por Daniel el 27-jul-2026 sobre números medidos: 392 clientes con
 * saldo, $224.749,88, cuadrado al centavo contra el reporte "Estado de cuenta -
 * Antiguedad" de Switch (cliente por cliente y tramo por tramo, 0 diferencias).
 *
 * Usa `syncEmpresaEstadoCuenta`, la MISMA función del cron, no una copia.
 *
 * ⛔ CORRIDA COMPLETA, NO POR TANDAS — y es a propósito. El reconcile del sync es
 * POR EMPRESA ENTERA:
 *     UPDATE switch_estadocuenta SET saldo=0
 *      WHERE empresa_key=X AND synced_at < runStamp AND saldo > 0
 * o sea que pone en cero todo lo que esa corrida no tocó. Partir la carga en
 * tandas haría que la tanda 2 borrara lo que cargó la 1. Son ~4.911 clientes a
 * ~604 ms → ~50 min de sesión de Switch. Correr en un hueco del calendario (el
 * próximo cron de Boston es 06:30 UTC).
 *
 * La carga a la BASE es chica: ~1.200 filas en switch_estadocuenta y ~4.911 en
 * switch_clientes, escritas de a 100 (UPSERT_BATCH). El costo es la API, no la DB.
 *
 * 🛑 GUARD: lo aprobado fue una carga inicial sobre tabla vacía. Si Boston ya
 * tuviera filas, aborta antes de tocar nada.
 */
import fs from "node:fs";
function cargarEnv() {
  for (const l of fs.readFileSync(".env.local", "utf8").split("\n")) {
    if (!l.includes("=") || l.trim().startsWith("#")) continue;
    const i = l.indexOf("=");
    process.env[l.slice(0, i).trim()] = l.slice(i + 1).trim();
  }
}
const ESCRIBIR = process.argv.includes("--escribir");
const EMPRESA = "confecciones_boston" as const;
const f = (x: number) => x.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function main() {
  cargarEnv();
  const { supabaseServer: db } = await import("../src/lib/supabase-server");
  const sync = await import("../src/lib/switch-api/sync-empresa");
  const clientMod = await import("../src/lib/switch-api/client");

  // 🛑 Guard previo.
  const { count, error } = await db.from("switch_estadocuenta")
    .select("*", { count: "exact", head: true }).eq("empresa_key", EMPRESA);
  if (error) throw new Error(`no pude contar: ${error.message}`);
  console.log(`switch_estadocuenta de ${EMPRESA} ahora: ${count} filas.`);
  if ((count ?? 0) > 0) {
    console.error(`\n🛑 ABORTA: ya hay ${count} filas. Lo aprobado fue carga inicial sobre tabla vacía.`);
    process.exit(2);
  }
  // Línea base del grupo, ANTES.
  const { data: g0 } = await db.from("switch_estadocuenta_aging").select("total");
  const t0 = (g0 ?? []).reduce((s: number, r: any) => s + Number(r.total || 0), 0);
  console.log(`GRUPO antes: ${g0?.length} filas · $${f(t0)}   (esperado 219 · $3,583,051.22)`);

  if (!ESCRIBIR) { console.log("\nSimulación: no se llamó a Switch ni se escribió nada."); return; }

  console.log(`\nInicio ${new Date().toISOString()} — esto tarda ~50 min.`);
  let res;
  try {
    res = await sync.syncEmpresaEstadoCuenta(EMPRESA, {
      desde: "2000-01-01", hasta: "2099-12-31", triggeredBy: "backfill",
    });
  } finally {
    await clientMod.logoutAllSwitchSessions();
    console.log(`Sesión de Switch cerrada ${new Date().toISOString()}`);
  }
  console.log("\n=== RESULTADO ===");
  console.log(JSON.stringify(res, null, 2));

  // ── Verificación ──────────────────────────────────────────────────────────
  const { data: b } = await db.from("switch_estadocuenta_aging_boston").select("total,d0_90,d91_120,d121_plus");
  const sum = (k: string) => (b ?? []).reduce((s: number, r: any) => s + Number(r[k] || 0), 0);
  console.log(`\nBOSTON: ${b?.length} clientes · $${f(sum("total"))}   (objetivo 392 · $224,749.88)`);
  console.log(`   0-90    $${f(sum("d0_90"))}   (objetivo $97,354.17)`);
  console.log(`   91-120  $${f(sum("d91_120"))}  (objetivo $8,843.93)`);
  console.log(`   121+    $${f(sum("d121_plus"))}  (objetivo $118,551.78)`);

  const { data: g1 } = await db.from("switch_estadocuenta_aging").select("total,company_key");
  const t1 = (g1 ?? []).reduce((s: number, r: any) => s + Number(r.total || 0), 0);
  const bostonEnGrupo = (g1 ?? []).filter((r: any) => r.company_key === EMPRESA).length;
  console.log(`\nGRUPO después: ${g1?.length} filas · $${f(t1)}   (tiene que seguir 219 · $3,583,051.22)`);
  console.log(`Boston dentro de la vista del grupo: ${bostonEnGrupo}   (tiene que ser 0)`);
  const ok = Math.abs(t1 - t0) < 0.01 && bostonEnGrupo === 0;
  console.log(ok ? "\n✅ El grupo no se movió y Boston no se mezcló." : "\n🔴 ALGO SE MOVIÓ — revisar.");
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });

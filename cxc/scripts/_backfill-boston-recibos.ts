/**
 * BACKFILL de los recibos históricos de Confecciones Boston → switch_recibos.
 *
 *   npx tsx scripts/_backfill-boston-recibos.ts [--escribir] [--anio 2024]
 *
 * Sin `--escribir` no escribe nada.
 *
 * Aprobado por Daniel el 27-jul-2026 sobre números medidos: 7.316 recibos desde
 * oct-2022 (2022:141 · 2023:1.603 · 2024:2.141 · 2025:2.130 · 2026:1.301).
 * Julio 2026: 126 recibos / $35.392,49.
 *
 * Usa `syncEmpresaRecibos`, la MISMA función del cron, no una copia.
 *
 * ── POR AÑO, Y ESPACIADO ────────────────────────────────────────────────────
 * Daniel pidió partirlo: la base se cayó dos veces el 27-jul por saturación de
 * auditorías. Va un año por corrida, y ENTRE años mide que la base siga
 * respondiendo (una consulta trivial cronometrada). Si tarda más de UMBRAL_MS,
 * PARA y avisa — no termina a cualquier costo.
 *
 * A diferencia del estado de cuenta, acá partir SÍ es seguro: el sync de recibos
 * reemplaza por (empresa, mes), así que cada mes es independiente y una corrida
 * por año no puede borrar lo que cargó la anterior.
 *
 * 🛑 GUARD: aprobado "solo se agregan filas". Si el diff quisiera BORRAR alguna,
 * se reporta como error al terminar.
 */
import fs from "node:fs";
function cargarEnv() {
  for (const l of fs.readFileSync(".env.local", "utf8").split("\n")) {
    if (!l.includes("=") || l.trim().startsWith("#")) continue;
    const i = l.indexOf("="); process.env[l.slice(0, i).trim()] = l.slice(i + 1).trim();
  }
}
const ESCRIBIR = process.argv.includes("--escribir");
const iA = process.argv.indexOf("--anio");
const SOLO_ANIO = iA >= 0 ? Number(process.argv[iA + 1]) : null;
const EMPRESA = "confecciones_boston" as const;
const UMBRAL_MS = 3000;   // si una consulta trivial tarda más, la base está sufriendo
const PAUSA_MS = 20000;   // respiro entre años
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const f = (x: number) => x.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Consulta trivial cronometrada: ¿la base sigue respondiendo? */
async function pulso(db: any): Promise<number> {
  const t = Date.now();
  const { error } = await db.from("switch_recibos").select("id").limit(1);
  if (error) throw new Error(`la base no respondió: ${error.message}`);
  return Date.now() - t;
}

async function main() {
  cargarEnv();
  const { supabaseServer: db } = await import("../src/lib/supabase-server");
  const sync = await import("../src/lib/switch-api/sync-recibos");
  const clientMod = await import("../src/lib/switch-api/client");

  const { count } = await db.from("switch_recibos").select("*", { count: "exact", head: true }).eq("empresa_key", EMPRESA);
  console.log(`switch_recibos de ${EMPRESA} ahora: ${count} filas.`);

  const anios = SOLO_ANIO ? [SOLO_ANIO] : [2022, 2023, 2024, 2025, 2026];
  console.log(`Años a cargar: ${anios.join(", ")}`);
  console.log(`Modo: ${ESCRIBIR ? "ESCRIBIR" : "SIMULACIÓN"}`);
  if (!ESCRIBIR) { console.log("Sin --escribir no toca nada."); return; }

  let insTot = 0, borTot = 0;
  try {
    for (const [i, y] of anios.entries()) {
      const meses = [];
      for (let m = 1; m <= 12; m++) {
        if (y === 2026 && m > 7) break;
        if (y === 2022 && m < 10) continue;   // Boston arranca oct-2022
        meses.push({ year: y, month: m });
      }
      const ms = await pulso(db);
      console.log(`\n[${y}] pulso de la base: ${ms} ms`);
      if (ms > UMBRAL_MS) {
        console.error(`\n🛑 PARO: la base tardó ${ms} ms (umbral ${UMBRAL_MS}). Avisar antes de seguir.`);
        process.exit(3);
      }
      const t = Date.now();
      const r = await sync.syncEmpresaRecibos(EMPRESA, meses, "backfill");
      console.log(`[${y}] ok=${r.ok} recibos=${r.recibos} insertadas=${r.insertadas} borradas=${r.borradas} sinCambio=${r.sinCambio} (${((Date.now() - t) / 1000).toFixed(0)}s)`);
      if (!r.ok) { console.error(`[${y}] FALLÓ: ${r.error}`); process.exit(1); }
      insTot += r.insertadas ?? 0; borTot += r.borradas ?? 0;
      if (i < anios.length - 1) { console.log(`   pausa ${PAUSA_MS / 1000}s...`); await sleep(PAUSA_MS); }
    }
  } finally {
    await clientMod.logoutAllSwitchSessions();
    console.log(`\nSesión de Switch cerrada ${new Date().toISOString()}`);
  }

  const { count: fin } = await db.from("switch_recibos").select("*", { count: "exact", head: true }).eq("empresa_key", EMPRESA);
  console.log(`\n=== RESULTADO ===\ninsertadas ${insTot} · borradas ${borTot} · switch_recibos ahora ${fin} filas (objetivo 7.316)`);
  if (borTot > 0) console.error(`\n🛑 ATENCIÓN: se borraron ${borTot} filas. Eso NO estaba aprobado.`);

  const { data: jul } = await db.from("switch_recibos").select("total")
    .eq("empresa_key", EMPRESA).gte("fecha", "2026-07-01").lte("fecha", "2026-07-31");
  console.log(`julio 2026: ${jul?.length} recibos · $${f((jul ?? []).reduce((s: number, r: any) => s + Number(r.total || 0), 0))}  (objetivo 126 · $35,392.49)`);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });

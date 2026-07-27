/**
 * BACKFILL de los recibos históricos de joystep → switch_recibos.
 *
 *   npx tsx scripts/_backfill-joystep-recibos.ts [--escribir]
 *
 * Sin `--escribir` no escribe nada: solo dice qué haría.
 *
 * Aprobado por Daniel el 27-jul-2026 sobre números medidos: 145 recibos,
 * $141.256,26, desde el 23-jul-2025. Usa la MISMA función del cron
 * (`syncEmpresaRecibos`), no una copia — el resultado es idéntico al que dejaría
 * una corrida normal.
 *
 * ⛔ Switch permite UNA sesión por empresa: correr en un hueco del calendario,
 * secuencial, y cerrar con /cierresesion (lo hace el `finally`).
 *
 * 🛑 GUARD: aprobado "solo se agregan filas". Si joystep ya tuviera recibos
 * guardados, el diff podría BORRAR o MODIFICAR alguno — eso NO está aprobado y
 * el script aborta antes de tocar nada. Al terminar vuelve a verificar que
 * `borradas` sea 0.
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
const EMPRESA = "joystep" as const;

/** 2025-01 .. 2026-07. El primer recibo real es de jul-2025; los meses vacíos
 *  no escriben nada y cuestan una llamada corta — el margen es barato. */
function meses(): { year: number; month: number }[] {
  const out: { year: number; month: number }[] = [];
  for (let y = 2025; y <= 2026; y++) {
    for (let m = 1; m <= 12; m++) {
      if (y === 2026 && m > 7) break;
      out.push({ year: y, month: m });
    }
  }
  return out;
}

async function main() {
  cargarEnv();
  const { supabaseServer } = await import("../src/lib/supabase-server");
  const sync = await import("../src/lib/switch-api/sync-recibos");
  const clientMod = await import("../src/lib/switch-api/client");

  const M = meses();
  console.log(`Backfill recibos ${EMPRESA} — ${M.length} meses (2025-01 .. 2026-07)`);
  console.log(`Modo: ${ESCRIBIR ? "ESCRIBIR" : "SIMULACIÓN (sin --escribir no toca la base)"}`);
  console.log(`Inicio ${new Date().toISOString()}`);

  // 🛑 Guard previo.
  const { count: yaHay, error: cntErr } = await supabaseServer
    .from("switch_recibos")
    .select("*", { count: "exact", head: true })
    .eq("empresa_key", EMPRESA);
  if (cntErr) throw new Error(`no pude contar switch_recibos: ${cntErr.message}`);
  console.log(`switch_recibos de ${EMPRESA} ahora: ${yaHay} filas.`);
  if ((yaHay ?? 0) > 0) {
    console.error(
      `\n🛑 ABORTA: ${EMPRESA} ya tiene ${yaHay} recibos guardados. Lo aprobado fue "solo se agregan filas";\n` +
        `   con filas previas el diff podría borrar o modificar alguna. Reportar antes de seguir.`,
    );
    process.exit(2);
  }
  if (!ESCRIBIR) {
    console.log("\nSimulación: no se llamó a Switch ni se escribió nada. Repetir con --escribir.");
    return;
  }

  let res;
  try {
    res = await sync.syncEmpresaRecibos(EMPRESA, M, "backfill");
  } finally {
    await clientMod.logoutAllSwitchSessions();
    console.log(`Sesión de Switch cerrada ${new Date().toISOString()}`);
  }

  console.log("\n=== RESULTADO ===");
  console.log(JSON.stringify(res, null, 2));

  if (!res.ok) {
    console.error("\n❌ El backfill FALLÓ. Nada más que hacer acá: revisar el error de arriba.");
    process.exit(1);
  }
  if ((res.borradas ?? 0) > 0) {
    console.error(
      `\n🛑 ATENCIÓN: se borraron ${res.borradas} filas. Eso NO estaba aprobado — reportarlo.`,
    );
    process.exit(2);
  }
  console.log(
    `\n✅ ${res.insertadas} filas insertadas, ${res.borradas} borradas, ${res.sinCambio} sin cambio.`,
  );
  console.log(`Fin ${new Date().toISOString()}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

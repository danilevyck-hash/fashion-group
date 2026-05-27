/**
 * Backfill histórico de facturas Multifashion (Switch → multifashion_tickets).
 *
 * Itera mes por mes desde mayo 2025 hasta el mes anterior al actual
 * (el mes en curso lo cubre el cron diario /api/cron/multifashion-sync).
 *
 * Política de fallos: si un mes falla, log y continúa con el siguiente.
 *
 * Uso:
 *   npx tsx scripts/multifashion-backfill.ts
 *
 * Pre-requisitos en .env.local:
 *   SUPABASE_URL (o NEXT_PUBLIC_SUPABASE_URL)
 *   SUPABASE_SERVICE_ROLE_KEY
 *   SWITCH_MULTIFASHION_API_URL
 *   SWITCH_MULTIFASHION_API_USER
 *   SWITCH_MULTIFASHION_API_PASSWORD
 */

import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(__dirname, "../.env.local") });

import { syncMultifashionTickets } from "../src/lib/switch-api/sync";

const START_YEAR = 2025;
const START_MONTH = 5; // mayo 2025: primera fecha con data en Switch

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

function lastDayOfMonth(year: number, month1: number): number {
  // month1 es 1-indexado. new Date(year, month1, 0) → último día del mes anterior
  // a month1 cuando month1 se interpreta 0-indexado → en realidad último día de month1.
  return new Date(year, month1, 0).getDate();
}

interface MonthCursor {
  year: number;
  month: number; // 1-indexed
}

function previousMonth(now: Date): MonthCursor {
  let y = now.getFullYear();
  let m = now.getMonth(); // 0-indexed; now.getMonth() === current month - 1 when 1-indexed
  // El mes "anterior al actual" en 1-indexado:
  //   currentMonth1 = now.getMonth() + 1
  //   previous = currentMonth1 - 1 = now.getMonth()
  // Si now.getMonth() === 0 (enero), previo = diciembre del año anterior.
  if (m === 0) {
    return { year: y - 1, month: 12 };
  }
  return { year: y, month: m };
}

async function main(): Promise<void> {
  const now = new Date();
  const end = previousMonth(now);

  console.log("\n=== Multifashion Backfill ===");
  console.log(`Desde:  ${START_YEAR}-${pad(START_MONTH)}`);
  console.log(`Hasta:  ${end.year}-${pad(end.month)} (mes anterior al actual)`);
  console.log(`Hoy:    ${now.toISOString().slice(0, 10)}\n`);

  let totalInserted = 0;
  let totalUpdated = 0;
  let totalSkipped = 0;
  let totalMs = 0;
  let monthsOk = 0;
  let monthsFailed = 0;
  const failures: Array<{ ym: string; error: string }> = [];

  let y = START_YEAR;
  let m = START_MONTH;
  while (y < end.year || (y === end.year && m <= end.month)) {
    const ym = `${y}-${pad(m)}`;
    const desde = `${y}-${pad(m)}-01`;
    const hasta = `${y}-${pad(m)}-${pad(lastDayOfMonth(y, m))}`;

    try {
      const r = await syncMultifashionTickets({
        desde,
        hasta,
        triggeredBy: "backfill",
      });
      console.log(
        `[${ym}] inserted=${r.inserted} updated=${r.updated} skipped=${r.skipped} duration=${(r.durationMs / 1000).toFixed(1)}s`,
      );
      totalInserted += r.inserted;
      totalUpdated += r.updated;
      totalSkipped += r.skipped;
      totalMs += r.durationMs;
      monthsOk++;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[${ym}] FALLÓ: ${msg}`);
      failures.push({ ym, error: msg });
      monthsFailed++;
    }

    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }

  console.log("\n=== Resumen ===");
  console.log(`Meses OK:        ${monthsOk}`);
  console.log(`Meses con error: ${monthsFailed}`);
  console.log(`Total inserted:  ${totalInserted}`);
  console.log(`Total updated:   ${totalUpdated}`);
  console.log(`Total skipped:   ${totalSkipped}`);
  console.log(`Duración total:  ${(totalMs / 1000).toFixed(1)}s`);
  if (failures.length > 0) {
    console.log("\nMeses con error:");
    for (const f of failures) console.log(`  ${f.ym}: ${f.error}`);
  }
  console.log();
}

main().catch((err: unknown) => {
  console.error("Fatal:", err);
  process.exit(1);
});

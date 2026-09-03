/**
 * NINGUNA FILA DE cron_heartbeats SOBREVIVE A SU CRON — contra la DB de
 * PRODUCCIÓN, solo lectura.
 *
 * `sync-mayor` se retiró el 13-ago-2026 y su fila quedó tres semanas
 * envejeciendo: no alertaba (el watchdog la salta, `esCronRetirado`), pero
 * cualquier barrido de "crons atrasados" tenía que saltarla a mano. La sección D
 * de cron-registro.test.ts fija el clasificador con una FOTO; este test mira la
 * tabla de verdad, así que es el que ve el PRÓXIMO retiro que deje fila.
 *
 * Falla con la lista exacta de huérfanos. Arreglo: una migración de datos que
 * borre esa fila por nombre exacto (modelo: 20260914120000_barrer_heartbeat_sync_mayor.sql).
 *
 * NO corre en `npm test` por defecto:
 *   RUN_DB_TESTS=1 npx vitest run src/__tests__/integration/cron-heartbeats-huerfanos.test.ts
 *
 * Requiere NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY en .env.local.
 */
import { describe, it, expect, beforeAll, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import path from "path";

vi.mock("@/lib/supabase-server", () => ({ supabaseServer: { from: vi.fn() } }));

import { heartbeatsHuerfanos } from "@/lib/cron-telemetry";

const RUN = !!process.env.RUN_DB_TESTS;

function loadEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  try {
    for (const line of readFileSync(".env.local", "utf8").split("\n")) {
      const i = line.indexOf("=");
      if (i > 0 && !line.trim().startsWith("#")) {
        env[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^"(.*)"$/, "$1");
      }
    }
  } catch {
    /* sin .env.local → el test se salta */
  }
  return env;
}

/** Mismo criterio que cron-registro.test.ts: basename del path, y el backup
 *  con `?grupo=` registra "backup-<grupo>". */
function cronNameDe(rutaCompleta: string): string {
  const [ruta, query = ""] = rutaCompleta.split("?");
  const base = ruta.replace("/api/cron/", "");
  const grupo = new URLSearchParams(query).get("grupo");
  return base === "backup" && grupo ? `backup-${grupo}` : base;
}

describe.skipIf(!RUN)("cron_heartbeats — ninguna fila huérfana en producción", () => {
  let nombres: string[] = [];
  let total = 0;

  beforeAll(async () => {
    const env = loadEnv();
    const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });
    const { data, error, count } = await db
      .from("cron_heartbeats")
      .select("cron_name", { count: "exact" })
      .order("cron_name")
      .range(0, 999);
    if (error) throw new Error(`cron_heartbeats: ${error.message}`);
    nombres = (data ?? []).map((r) => r.cron_name as string);
    total = count ?? nombres.length;
  });

  it("la tabla se leyó entera (nunca medir a medias y dar el cero por bueno)", () => {
    expect(nombres.length).toBeGreaterThan(0);
    expect(nombres.length).toBe(total);
  });

  it("cada fila corresponde a un cron de vercel.json o a una excepción con motivo", () => {
    const vercel: { crons: Array<{ path: string }> } = JSON.parse(
      readFileSync(path.resolve(__dirname, "../../../vercel.json"), "utf8"),
    );
    const programados = new Set(vercel.crons.map((c) => cronNameDe(c.path)));
    const huerfanos = heartbeatsHuerfanos(nombres, programados);
    expect(
      huerfanos,
      `filas de cron_heartbeats sin cron vivo: ${huerfanos.join(", ")}\n` +
        `Bórralas con una migración de datos por nombre EXACTO ` +
        `(modelo: supabase/migrations/20260914120000_barrer_heartbeat_sync_mayor.sql).`,
    ).toEqual([]);
  });
});

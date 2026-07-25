/**
 * Dry-run de la reconciliación de slots huérfanos contra la DB de PRODUCCIÓN
 * (solo lectura). Corre la MISMA función que usa switch-reconciliacion sobre
 * cron_heartbeats + switch_sync_log reales y reporta qué slots cubriría.
 *
 * NO corre en `npm test` por defecto:
 *   RUN_DB_TESTS=1 npx vitest run src/__tests__/integration/cron-slots-produccion.test.ts
 *
 * Requiere NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY en .env.local.
 */
import { describe, it, expect, beforeAll, vi } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

vi.mock("@/lib/supabase-server", () => ({ supabaseServer: { from: vi.fn() } }));

import {
  SWITCH_SYNC_SLOTS,
  SLOT_RUN_WINDOW_MIN,
  slotHeartbeatName,
  slotRecuperadoName,
  slotCubiertoPorRecuperacion,
  slotsHuerfanos,
  ultimaOcurrenciaUtc,
  cronStaleThresholdHours,
  type SyncLogRowMin,
} from "@/lib/cron-telemetry";
import { empresasConCxc } from "@/lib/switch-api/empresas";

const RUN = !!process.env.RUN_DB_TESTS;

function loadEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  try {
    for (const line of readFileSync(".env.local", "utf8").split("\n")) {
      const i = line.indexOf("=");
      if (i > 0 && !line.trim().startsWith("#")) env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }
  } catch {
    /* sin .env.local → el test se salta */
  }
  return env;
}

describe.skipIf(!RUN)("slots huérfanos — dry-run contra producción", () => {
  let db: SupabaseClient;
  let rows: SyncLogRowMin[] = [];
  let heartbeats = new Map<string, string | null | undefined>();
  const now = new Date();

  beforeAll(async () => {
    const env = loadEnv();
    db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });
    const desde = new Date(now.getTime() - 30 * 3600 * 1000).toISOString();
    const log = await db
      .from("switch_sync_log")
      .select("empresa_key,sync_type,status,started_at")
      .gte("started_at", desde)
      .in("sync_type", ["facturas", "estadocuenta", "costo"]);
    const hb = await db.from("cron_heartbeats").select("cron_name,last_success_at");
    rows = (log.data ?? []) as SyncLogRowMin[];
    heartbeats = new Map((hb.data ?? []).map((h) => [h.cron_name as string, h.last_success_at as string | null]));
  });

  it("reporta el estado de cada slot y qué cubriría la reconciliación", () => {
    const huerfanos = slotsHuerfanos({ now, rows, heartbeats, empresasConCxc: empresasConCxc() });
    const cubre = new Set(huerfanos.map((h) => h.slot));
    const lineas: string[] = [`\nAhora (UTC): ${now.toISOString()} — ${rows.length} filas de switch_sync_log (30h)`];
    for (const s of SWITCH_SYNC_SLOTS) {
      const hb = heartbeats.get(slotHeartbeatName(s.slot));
      const edad = hb ? (now.getTime() - Date.parse(hb)) / 3600000 : null;
      const umbral = cronStaleThresholdHours(slotHeartbeatName(s.slot));
      const staleAntes = edad === null ? "sin fila" : edad > umbral ? "STALE" : "ok";
      const marca = cubre.has(s.slot)
        ? "→ CUBIERTO"
        : slotCubiertoPorRecuperacion(hb, heartbeats.get(slotRecuperadoName(s.slot)), now.getTime())
          ? "→ ya cubierto"
          : "";
      lineas.push(
        `${s.slot.padEnd(20)} occ=${ultimaOcurrenciaUtc(s.hhmmUtc, now).toISOString().slice(0, 16)} ` +
          `hb=${edad === null ? "—".padStart(6) : edad.toFixed(1).padStart(5) + "h"} ${staleAntes.padEnd(8)} ${marca}`,
      );
    }
    console.log(lineas.join("\n"));

    // Invariante duro: jamás cubrir un slot cuya entrada SÍ corrió en su ventana
    // (si corrió y falló, tiene que seguir reportándose).
    for (const h of huerfanos) {
      const s = SWITCH_SYNC_SLOTS.find((x) => x.slot === h.slot)!;
      const occ = Date.parse(h.ocurrencia);
      const corrio = rows.some(
        (r) =>
          s.empresas.includes(r.empresa_key) &&
          Date.parse(r.started_at) >= occ &&
          Date.parse(r.started_at) <= occ + SLOT_RUN_WINDOW_MIN * 60_000,
      );
      expect(corrio, `${h.slot}: se cubrió pese a que su entrada corrió en la ventana`).toBe(false);
    }
  });
});

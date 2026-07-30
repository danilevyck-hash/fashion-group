/**
 * Reproduce el veredicto de /api/health-crons contra los heartbeats REALES de
 * producción, sin necesitar HEALTHCHECK_TOKEN. Solo lectura.
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_diag-vigia-503.ts
 */
import {
  cronStaleThresholdHours, staleEsPendingRecovery, CRONS_FAIL_CLOSED,
  SEED_TOLERANT_CRONS, SWITCH_SYNC_SLOTS, slotHeartbeatName, slotRecuperadoName,
  slotVistoName, slotCubiertoPorRecuperacion, slotNuncaSembradoVencido,
  veredictoVigiaExterno, UMBRAL_CAIDA_MASIVA, CRON_WATCHDOG_INTERNO,
} from "../src/lib/cron-telemetry";
import { supabaseServer } from "../src/lib/supabase-server";

async function main() {
const UMBRALES_INFO = { masiva: UMBRAL_CAIDA_MASIVA, watchdog: CRON_WATCHDOG_INTERNO };
const { data } = await supabaseServer.from("cron_heartbeats").select("cron_name, last_success_at");
const beats = new Map((data ?? []).map((h: any) => [h.cron_name, h.last_success_at]));
const now = Date.now();
const stale: string[] = [];
for (const cron of CRONS_FAIL_CLOSED) {
  const last = beats.get(cron) ?? null;
  const t = last ? new Date(last).getTime() : NaN;
  if (!Number.isFinite(t) || t < now - cronStaleThresholdHours(cron) * 3600e3) {
    if (!staleEsPendingRecovery(cron, last, now)) stale.push(`${cron} (base)`);
  }
}
for (const s of SWITCH_SYNC_SLOTS) {
  const slot = slotHeartbeatName(s.slot);
  const last = beats.get(slot);
  if (last == null) {
    if (slotNuncaSembradoVencido(beats.get(slotVistoName(s.slot)), now)) stale.push(`${slot} (sin fila, gracia vencida)`);
    continue;
  }
  const t = new Date(last).getTime();
  if (!Number.isFinite(t) || t < now - cronStaleThresholdHours(slot) * 3600e3) {
    if (slotCubiertoPorRecuperacion(last, beats.get(slotRecuperadoName(s.slot)), now)) continue;
    if (staleEsPendingRecovery("switch-sync", last, now)) continue;
    stale.push(`${slot} (slot, ${Math.round((now - t) / 3600e3)}h)`);
  }
}
for (const cron of SEED_TOLERANT_CRONS) {
  const last = beats.get(cron);
  if (last == null) continue;
  const t = new Date(last).getTime();
  if (!Number.isFinite(t) || t < now - cronStaleThresholdHours(cron) * 3600e3) {
    if (!staleEsPendingRecovery(cron, last, now)) stale.push(`${cron} (seed-tolerante)`);
  }
}
const veredicto = veredictoVigiaExterno({ stale });
console.log(`HTTP que devolvería /api/health-crons: ${veredicto.http}  (${veredicto.motivo})`);
console.log(veredicto.detalle);
console.log(`\nHallazgos (${stale.length}) — van en el cuerpo del JSON:`);
for (const s of stale) console.log("  •", s);
console.log(
  `\nUmbral de caída masiva: ${UMBRALES_INFO.masiva} · watchdog interno vigilado: ${UMBRALES_INFO.watchdog}`,
);
}
main();

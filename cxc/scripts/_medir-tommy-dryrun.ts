/**
 * Medición DE PUNTA A PUNTA del sync de catálogo de Tommy, con el código real.
 *
 * Corre `syncCatalogoTommy({ dryRun: true })` — que hace TODAS las lecturas
 * (login, /lista paginado y las ~478 /stock) y **no escribe nada**: ni en
 * Supabase, ni en switch_sync_log, ni Telegram. Es el camino de lectura del
 * cron, tal cual, no una reimplementación que podría diferir.
 *
 * Sirve para comparar el antes y el después del cambio de concurrencia sin
 * tocar producción: se corre en la rama vieja y en la nueva, y se restan.
 *
 * 🔴 SESIÓN ÚNICA DE SWITCH. `fashion_shoes` admite UN login. Antes de correr:
 *   - `switch_sync_log` sin filas `running` de fashion_shoes;
 *   - lejos de 12:40 y 17:40 UTC (los dos slots de este cron).
 * Cierra sesión al terminar (/cierresesion), igual que el route.
 *
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_medir-tommy-dryrun.ts
 */

import { logoutAllSwitchSessions } from "../src/lib/switch-api/client";
import { syncCatalogoTommy } from "../src/lib/switch-api/sync-catalogo-tommy";

async function main() {
  const t0 = Date.now();
  const r = await syncCatalogoTommy({ dryRun: true });
  const segundos = (Date.now() - t0) / 1000;

  const e = r.empresas[0];
  console.log(`
  dryRun ......... ${r.dryRun}
  error .......... ${e.error ?? "(ninguno)"}
  /lista ......... ${e.switchCount} artículos
  /stock ......... ${e.stockChecks} llamadas
  actualizados ... ${e.actualizados}
  agregados ...... ${e.agregados}
  ocultados ...... ${e.ocultados}
  reactivados .... ${e.reactivados}
  ─────────────────────────────────
  TIEMPO TOTAL ... ${segundos.toFixed(1)} s   (techo de la función: 800 s)
  margen ......... ${(((800 - segundos) / 800) * 100).toFixed(0)}%
`);

  console.log(JSON.stringify({ segundos: +segundos.toFixed(1), stockChecks: e.stockChecks, switchCount: e.switchCount, error: e.error ?? null }));
}

main()
  .catch((e) => { console.error("FALLÓ:", e?.message ?? e); process.exitCode = 1; })
  .finally(async () => { await logoutAllSwitchSessions(); });

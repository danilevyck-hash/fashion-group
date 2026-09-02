/**
 * Diagnóstico SOLO LECTURA de las dos alertas de silencio (2-sep-2026).
 *
 * Corre `medirSyncsEnCero` y `medirTablasQuietas` contra producción y muestra el
 * mensaje que SALDRÍA. 🔴 NUNCA llama `revisarSilencioDeDatos`: esa función
 * escribe en cron_email_errors y manda Telegram. Acá no se le escribe a nadie.
 *
 *   npx tsx --env-file=.env.local scripts/_diag-silencio-de-datos.ts
 */
import { medirSyncsEnCero, medirTablasQuietas } from "../src/lib/alertas/silencio-de-datos-io";
import { agruparPorModulo, mensajeSilencio } from "../src/lib/alertas/silencio-de-datos";

async function main() {
  const ahora = Date.now();
  const a = await medirSyncsEnCero(ahora);
  const b = await medirTablasQuietas(ahora);
  console.log(`ALERTA A — syncs en cero: ${a.length}`);
  console.log(`ALERTA B — tablas quietas: ${b.length}`);
  const grupos = agruparPorModulo([...a, ...b]);
  console.log(`MENSAJES QUE SALDRÍAN (uno por módulo): ${grupos.size}\n`);
  for (const [modulo, items] of grupos) {
    console.log("─".repeat(70));
    console.log(mensajeSilencio(modulo, items));
    console.log();
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});

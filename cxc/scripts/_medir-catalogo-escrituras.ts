/**
 * ¿CUÁNTO DEL SYNC DE UN CATÁLOGO SON LAS ESCRITURAS? — medido EN PRODUCCIÓN,
 * sin tocar un solo dato.
 *
 * El truco es el `?dryRun=1` que los 4 routes de catálogo ya aceptan: corre el
 * motor ENTERO contra Switch (barrido de páginas + una llamada `/stock` por
 * artículo + las lecturas de Supabase) y **no escribe nada**. Restando:
 *
 *     corrida REAL  −  corrida dryRun  =  el costo de las ESCRITURAS
 *
 * Las dos corren en Vercel, contra la misma base y con la misma latencia, así
 * que la resta es una medición y no una estimación de laptop.
 *
 * ⚠️ La corrida REAL la mide `_verif-stock-concurrencia.ts` (lee la duración de
 * `switch_sync_log`). Acá se mide el dryRun, que NO se registra en el log a
 * propósito — se cronometra el round-trip HTTP, que a 100+ segundos hace que el
 * viaje hasta Vercel sea ruido.
 *
 * 🔴 SESIÓN ÚNICA POR EMPRESA: mirar el calendario de crons antes de correr.
 *
 *   MARCA=tommy VUELTAS=3 DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_medir-catalogo-escrituras.ts
 */

const BASE = process.env.PROD_URL ?? "https://www.fashiongr.com";
const MARCA = process.env.MARCA ?? "tommy";
const VUELTAS = Number(process.env.VUELTAS ?? 3);

async function main() {
  console.log(`\n════ dryRun de ${MARCA} · ${BASE} ════\n`);
  const xs: number[] = [];
  for (let i = 1; i <= VUELTAS; i++) {
    const t = Date.now();
    const res = await fetch(`${BASE}/api/cron/${MARCA}-catalogo?dryRun=1`, {
      headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
      cache: "no-store",
    });
    const seg = (Date.now() - t) / 1000;
    const txt = await res.text();
    let detalle = txt.slice(0, 200);
    try {
      const j = JSON.parse(txt) as { result?: { empresas?: Array<Record<string, unknown>> } };
      const e = j.result?.empresas?.[0];
      if (e) detalle = `switchCount=${e.switchCount} stockChecks=${e.stockChecks} actualizados=${e.actualizados} agregados=${e.agregados}`;
    } catch { /* se deja el texto crudo */ }
    xs.push(seg);
    console.log(`   ${i}/${VUELTAS}  HTTP ${res.status} · ${seg.toFixed(1)} s · ${detalle}`);
  }
  const s = [...xs].sort((a, b) => a - b);
  console.log(`\n   dryRun ${MARCA}: ${xs.map((x) => x.toFixed(1)).join(" · ")} s   (mediana ${s[Math.floor(s.length / 2)].toFixed(1)} s)\n`);
}

main().catch((e) => {
  console.error("FALLÓ:", e?.message ?? e);
  process.exitCode = 1;
});

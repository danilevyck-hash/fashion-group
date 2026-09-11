/* ────────────────────────────────────────────────────────────────────────────
 * VENTAS — los totales que arma la CAPA TS, contra producción (solo lectura).
 *
 * Complementa a `_medir-ventas-13-cambios.mjs` (que mide la RPC): acá se llama
 * a `fetchVentasResumen` y a `fetchClientes`, las MISMAS funciones que usa la
 * página, y se imprimen los números que llegan a la pantalla. Se corre ANTES y
 * DESPUÉS de tocar el módulo; lo que no puede moverse es la VENTA.
 *
 * ⚠️ NO ESCRIBE NADA.
 *
 *   DOTENV_CONFIG_PATH=.env.local npx tsx \
 *     --tsconfig scripts/_medir-ajuste-por-concepto-tsconfig.json -r dotenv/config \
 *     scripts/_medir-ventas-totales-ts.ts
 * ────────────────────────────────────────────────────────────────────────── */
import { fetchVentasResumen, fetchClientes } from "@/lib/ventas/queries";

const money = (n: number) => n.toLocaleString("es-PA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (n: number | null) => (n == null ? "—" : `${(n * 100).toFixed(1).replace(".", ",")} %`);

async function main() {
  const r = await fetchVentasResumen({ year: 2026 });
  const sum = (a: (number | null)[]) => a.reduce<number>((s, v) => s + (v ?? 0), 0);
  console.log("\nRESUMEN 2026 — lo que arma fetchVentasResumen");
  console.log(`  kpis.ventasNetasYTD  $${money(r.kpis.ventasNetasYTD)}`);
  console.log(`  kpis.utilidadYTD     $${money(r.kpis.utilidadYTD)}`);
  console.log(`  kpis.margenYTD       ${pct(r.kpis.margenYTD)}`);
  console.log(`  mesActual            ${r.mesActual}`);
  console.log("\n  empresa              ventas 2026        agosto     mes en curso  util. mes  margen YTD");
  let ago = 0;
  for (const e of r.empresas) {
    const idx = r.mesActual - 1;
    ago += e.ventas2026[7] ?? 0;
    console.log(
      `  ${e.empresa.id.padEnd(10)} ${money(sum(e.ventas2026)).padStart(16)} ${money(e.ventas2026[7] ?? 0).padStart(13)} ${money(e.ventas2026[idx] ?? 0).padStart(14)} ${money(e.utilidad2026[idx] ?? 0).padStart(12)} ${pct(e.margenPct).padStart(9)}`,
    );
  }
  console.log(`  AGOSTO (8)           $${money(ago)}`);

  const c = await fetchClientes({ year: 2026 });
  const cm = c.rows.find((x) => x.id === "D-25");
  console.log("\nCLIENTES 2026 — lo que arma fetchClientes");
  console.log(`  filas ${c.rows.length} · City Mall Paso Canoa (D-25) compras ${cm ? "$" + money(cm.ytd) : "—"} · delta ${cm?.delta}`);
  console.log(`  sin base comparativa (delta null/0): ${c.rows.filter((x) => x.delta === 0 || x.delta == null).length}`);
}

main().catch((e) => { console.error(e); process.exit(1); });

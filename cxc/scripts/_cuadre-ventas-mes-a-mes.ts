// ¿La tarjeta «mes a mes» de Ventas › Resumen da, al centavo, lo que muestra
// la pantalla para ese mes y esa empresa? SOLO LEE (las mismas lecturas del
// Resumen + la vista `switch_ventas_unificado_vw` directa, como testigo).
//
//   ENV_FILE=/ruta/.env.local npx tsx scripts/_cuadre-ventas-mes-a-mes.ts [año]
//
// 2 empresas × 3 meses. Sale con código 1 si un centavo no cuadra o si no
// comparó nada.
import fs from "fs";

for (const l of fs.readFileSync(process.env.ENV_FILE ?? ".env.local", "utf8").split("\n")) {
  if (!l.includes("=") || l.trim().startsWith("#")) continue;
  const i = l.indexOf("=");
  process.env[l.slice(0, i).trim()] ??= l.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}

async function main() {
  const anio = Number(process.argv[2] ?? 2026);
  const { fetchVentasResumen } = await import("../src/lib/ventas/queries");
  const { delPeriodo } = await import("../src/lib/ventas/resumen-mes");
  const { mesesDeSeries } = await import("../src/lib/ventas/mes-a-mes");
  const { createClient } = await import("@supabase/supabase-js");
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  const data = await fetchVentasResumen({ year: anio });
  const EMPRESAS: [string, string][] = [["vistana", "vistana"], ["fwear", "fashion_wear"]];
  const hasta = data.mesActual;
  const MESES = [hasta - 2, hasta - 1, hasta].filter((m) => m >= 1);
  let comparados = 0, malos = 0;
  for (const [id, key] of EMPRESAS) {
    const e = data.empresas.find((x) => x.empresa.id === id);
    if (!e) { console.log(`✗ ${id}: no está en el Resumen`); malos++; continue; }
    const tarjeta = mesesDeSeries(e.ventas2026, e.ventas2025, hasta);
    for (const m of MESES) {
      const enTarjeta = tarjeta.find((t) => t.mes === m)!.actual;
      const enPantalla = delPeriodo(e.ventas2026, m);
      const desde = `${anio}-${String(m).padStart(2, "0")}-01`;
      const { data: v, error } = await sb.from("switch_ventas_unificado_vw").select("ventas_netas").eq("empresa_key", key).eq("mes", desde);
      if (error) throw error;
      const enVista = (v ?? []).reduce((s, r) => s + Number(r.ventas_netas), 0);
      const ok = Math.round(enTarjeta * 100) === Math.round(enPantalla * 100) && Math.round(enPantalla * 100) === Math.round(enVista * 100);
      comparados++;
      if (!ok) malos++;
      console.log(`${ok ? "✓" : "✗"} ${id} ${desde.slice(0, 7)}  tarjeta ${enTarjeta.toFixed(2)}  pantalla ${enPantalla.toFixed(2)}  vista ${enVista.toFixed(2)}`);
    }
  }
  console.log(`${comparados} comparaciones, ${malos} no cuadran`);
  process.exit(comparados === 0 || malos > 0 ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });

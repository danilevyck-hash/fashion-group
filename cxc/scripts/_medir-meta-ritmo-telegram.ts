// ─────────────────────────────────────────────────────────────────────────────
// MEDICIÓN (SOLO LECTURA) — la línea «🎯 Meta» del resumen diario de ACS.
//
// Corre:
//   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_medir-meta-ritmo-telegram.ts [YYYY-MM-DD]
//
// Con la MISMA semántica del módulo Multifashion (`_multifashion_sf_vw`,
// is_wholesale=false, subtotal FIRMADO) y la RPC de la pantalla de Metas
// (`multifashion_meta_ventas_v1`), mide para el corte pedido:
//   vendido (desde..corte) · venta año pasado del rango completo · venta año
//   pasado hasta corte−1 año · factor · ritmo · % arriba/abajo del ritmo.
// Y lo compara con lo que dice el código real (`leerRitmoMeta`) si ya existe.
// ─────────────────────────────────────────────────────────────────────────────

import { supabaseServer } from "../src/lib/supabase-server";
import { unAnioAntes } from "../src/lib/ventas/clientes-corte-comparativo";

const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });

async function sumaRpc(desde: string, hasta: string): Promise<number> {
  const { data, error } = await supabaseServer.rpc("multifashion_meta_ventas_v1", {
    p_desde: desde,
    p_hasta: hasta,
  });
  if (error) throw new Error(error.message);
  const s = ((data ?? []) as { ventas: number | string }[]).reduce(
    (a, f) => a + (Number(f.ventas) || 0),
    0,
  );
  return Math.round(s * 100) / 100;
}

async function main() {
  const corte = process.argv[2] || "2026-09-03";

  const { data: metas, error } = await supabaseServer
    .from("multifashion_metas")
    .select("id,nombre,desde,hasta,objetivo,tipo,activa,deleted,created_at")
    .eq("deleted", false)
    .eq("activa", true)
    .eq("tipo", "grupal")
    .lte("desde", corte)
    .gte("hasta", corte)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);

  console.log(`corte = ${corte}`);
  console.log("metas grupales activas que cubren el corte:", metas?.length ?? 0);
  for (const m of metas ?? []) console.log("  ", m.nombre, m.desde, "→", m.hasta, money(Number(m.objetivo)), m.created_at);
  const meta = metas?.[0];
  if (!meta) { console.log("sin meta → la línea no sale"); return; }

  const desde = String(meta.desde).slice(0, 10);
  const hasta = String(meta.hasta).slice(0, 10);
  const objetivo = Number(meta.objetivo);

  const [vendido, prevRango, prevHastaCorte] = await Promise.all([
    sumaRpc(desde, corte),
    sumaRpc(unAnioAntes(desde), unAnioAntes(hasta)),
    sumaRpc(unAnioAntes(desde), unAnioAntes(corte)),
  ]);

  const factor = prevRango > 0 ? objetivo / prevRango : NaN;
  const ritmo = prevHastaCorte * factor;
  const pct = ritmo > 0 ? vendido / ritmo - 1 : NaN;

  console.log("");
  console.log(`objetivo                    ${money(objetivo)}`);
  console.log(`vendido ${desde}..${corte}   ${money(vendido)}`);
  console.log(`año pasado rango completo ${unAnioAntes(desde)}..${unAnioAntes(hasta)}  ${money(prevRango)}`);
  console.log(`año pasado hasta corte    ${unAnioAntes(desde)}..${unAnioAntes(corte)}  ${money(prevHastaCorte)}`);
  console.log(`factor = objetivo ÷ rango completo = ${factor.toFixed(4)}`);
  console.log(`ritmo  = hasta corte × factor      = ${money(ritmo)}`);
  console.log(`%      = vendido ÷ ritmo − 1       = ${(pct * 100).toFixed(2)}%  (0 dec: ${Math.round(pct * 100)}%)`);

  try {
    const lib = await import("../src/lib/multifashion/meta-ritmo-lectura");
    const r = await lib.leerRitmoMeta(corte);
    console.log("\ncódigo real leerRitmoMeta:", JSON.stringify(r));
  } catch (e) {
    console.log("\n(código real todavía no existe)", e instanceof Error ? e.message.split("\n")[0] : e);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });

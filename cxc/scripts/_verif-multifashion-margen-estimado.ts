// ¿El margen ESTIMADO de hoy de Multifashion se parece al real? SOLO LEE.
//   npx tsx scripts/_verif-multifashion-margen-estimado.ts [días=14]
//
// Para cada uno de los últimos N días CERRADOS: el estimado con la MISMA cuenta
// de la tarjeta (`estimarMargen`: cantidad vendida × costo ACTUAL de
// `switch_articulo_info`) sobre lo vendido ese día (`switch_articulo_diario`,
// lo mismo que da `/apireporte/ventasucursal`) contra el margen real de Switch
// (`margenDelDia`). Sale con código 1 si un día se aleja más de 5 puntos.
// (Medido el 28-nov-2026, 14–27 nov: máx 3,24 pts, promedio 1,15 pts.)
import fs from "fs";

for (const l of fs.readFileSync(".env.local", "utf8").split("\n")) {
  if (!l.includes("=") || l.trim().startsWith("#")) continue;
  const i = l.indexOf("=");
  process.env[l.slice(0, i).trim()] ??= l.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}

async function main() {
  const { supabaseServer: sb } = await import("../src/lib/supabase-server");
  const { hoyPanama } = await import("../src/lib/fecha-panama");
  const { leerTodoPaginado } = await import("../src/lib/supabase-paginado");
  const { margenDelDia, costosActuales } = await import("../src/lib/multifashion/tarjeta-dia-server");
  const { estimarMargen } = await import("../src/lib/multifashion/margen-estimado");

  const n = Number(process.argv[2] ?? 14);
  const hoy = hoyPanama();
  const menos = (f: string, k: number) => { const d = new Date(`${f}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - k); return d.toISOString().slice(0, 10); };
  const difs: number[] = [];
  for (let k = n; k >= 1; k--) {
    const fecha = menos(hoy, k);
    const filas = await leerTodoPaginado<{ articulo_id: number; tipo: string; cantidad_total: number; venta_total: number }>(
      `articulo_diario ${fecha}`,
      (pedirCount, a, b) => sb.from("switch_articulo_diario")
        .select("articulo_id, tipo, cantidad_total, venta_total", pedirCount ? { count: "exact" } : {})
        .eq("empresa_key", "american_classic").eq("fecha", fecha)
        .order("articulo_id").order("tipo").range(a, b),
    );
    const renglones = filas.map((f) => ({ articuloId: Number(f.articulo_id), tipo: f.tipo, cantidad: Number(f.cantidad_total) || 0, venta: Number(f.venta_total) || 0 }));
    const est = estimarMargen(renglones, await costosActuales(renglones.map((r) => r.articuloId)));
    const real = await margenDelDia(fecha);
    if (est == null || real == null) { console.log(`${fecha}  sin dato (estimado ${est?.margen ?? "—"} · real ${real ?? "—"})`); continue; }
    const d = (est.margen - real) * 100;
    difs.push(Math.abs(d));
    console.log(`${fecha}  real ${(real * 100).toFixed(2)} %  estimado ${(est.margen * 100).toFixed(2)} %  dif ${d >= 0 ? "+" : ""}${d.toFixed(2)} pts  cobertura ${(est.cobertura * 100).toFixed(1)} %`);
  }
  const max = Math.max(...difs);
  const prom = difs.reduce((s, x) => s + x, 0) / (difs.length || 1);
  console.log(`\n${difs.length} días · máx ${max.toFixed(2)} pts · promedio ${prom.toFixed(2)} pts`);
  process.exit(max > 5 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });

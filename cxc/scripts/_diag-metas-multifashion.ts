// ─────────────────────────────────────────────────────────────────────────────
// DIAGNÓSTICO (SOLO LECTURA) — los datos con los que se arman las metas.
//
// Corre:
//   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_diag-metas-multifashion.ts
//
// Mide, contra producción y con la MISMA semántica del módulo
// (`_multifashion_sf_vw`, is_wholesale=false, subtotal FIRMADO = las NC restan):
//   1. Los tres totales que hay que verificar contra lo ya medido.
//   2. El reparto MES A MES de sep-dic 2025 → los pesos de la temporada.
//   3. Los nombres de vendedor tal como vienen de Switch, agrupados por clave.
//   4. El COSTO: cuántas filas y cuántos viajes cuesta calcular un avance.
// ─────────────────────────────────────────────────────────────────────────────

import { supabaseServer } from "../src/lib/supabase-server";
import { leerTodoPaginado } from "../src/lib/supabase-paginado";

const VISTA = "_multifashion_sf_vw";

interface Fila {
  fecha: string;
  vendedor: string | null;
  subtotal: number | string | null;
}

async function leerRango(desde: string, hasta: string): Promise<Fila[]> {
  return leerTodoPaginado<Fila>(
    `${VISTA} [${desde}..${hasta}]`,
    (pedirCount, from, to) =>
      supabaseServer
        .from(VISTA)
        .select("fecha,vendedor,subtotal", pedirCount ? { count: "exact" } : {})
        .eq("is_wholesale", false)
        .gte("fecha", desde)
        .lte("fecha", hasta)
        .order("n_sistema", { ascending: true })
        .range(from, to),
  );
}

const money = (n: number) =>
  n.toLocaleString("es-PA", { style: "currency", currency: "USD", minimumFractionDigits: 2 });

const suma = (filas: Fila[]) =>
  Math.round(filas.reduce((a, f) => a + (Number(f.subtotal) || 0), 0) * 100) / 100;

/** La misma normalización que va a usar el sistema de metas. */
function clave(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

async function main() {
  console.log("═".repeat(78));
  console.log("1) LOS TRES TOTALES A VERIFICAR");
  console.log("═".repeat(78));

  const casos: [string, string, string, number][] = [
    ["retail ene-jul 2026", "2026-01-01", "2026-07-31", 305092.6],
    ["retail sep-dic 2025", "2025-09-01", "2025-12-31", 340698.55],
    ["retail 1-13 ago 2026", "2026-08-01", "2026-08-13", 21055.24],
    ["retail 1-13 ago 2025", "2025-08-01", "2025-08-13", 14376.71],
  ];

  const cache = new Map<string, Fila[]>();
  for (const [label, desde, hasta, esperado] of casos) {
    const t0 = Date.now();
    const filas = await leerRango(desde, hasta);
    cache.set(`${desde}..${hasta}`, filas);
    const total = suma(filas);
    const dif = Math.round((total - esperado) * 100) / 100;
    const ok = Math.abs(dif) < 0.01 ? "🟢" : "🔴";
    console.log(
      `${ok} ${label.padEnd(24)} ${money(total).padStart(14)}  esperado ${money(esperado).padStart(14)}  dif ${dif}  ` +
        `(${filas.length} docs, ${Date.now() - t0} ms)`,
    );
  }

  console.log();
  console.log("═".repeat(78));
  console.log("2) REPARTO MES A MES — sep-dic 2025 (los pesos de la temporada)");
  console.log("═".repeat(78));

  const temporada = cache.get("2025-09-01..2025-12-31")!;
  const porMes = new Map<string, { v: number; d: number }>();
  for (const f of temporada) {
    const m = String(f.fecha).slice(0, 7);
    const acc = porMes.get(m) ?? { v: 0, d: 0 };
    acc.v += Number(f.subtotal) || 0;
    acc.d += 1;
    porMes.set(m, acc);
  }
  const totalTemporada = suma(temporada);
  for (const m of [...porMes.keys()].sort()) {
    const { v, d } = porMes.get(m)!;
    const pct = (v / totalTemporada) * 100;
    console.log(
      `   ${m}  ${money(v).padStart(14)}  ${pct.toFixed(1).padStart(5)}%  ${String(d).padStart(5)} docs  ` +
        "▓".repeat(Math.round(pct / 2)),
    );
  }
  console.log(`   ${"TOTAL".padEnd(7)} ${money(totalTemporada).padStart(14)}`);

  console.log();
  console.log("   ⚠️ Un mes de esos pesa MUCHO más que los otros: por eso una");
  console.log("      proyección lineal (días transcurridos) miente en octubre.");

  console.log();
  console.log("═".repeat(78));
  console.log("3) NOMBRES DE VENDEDOR — 12 meses, agrupados por clave");
  console.log("═".repeat(78));

  const anio = await leerRango("2025-08-14", "2026-08-13");
  const porNombre = new Map<string, { v: number; d: number }>();
  for (const f of anio) {
    const n = (f.vendedor ?? "").trim();
    if (!n) continue;
    const acc = porNombre.get(n) ?? { v: 0, d: 0 };
    acc.v += Number(f.subtotal) || 0;
    acc.d += 1;
    porNombre.set(n, acc);
  }

  const porClave = new Map<string, { v: number; d: number; formas: string[] }>();
  for (const [n, { v, d }] of porNombre) {
    const k = clave(n);
    const acc = porClave.get(k) ?? { v: 0, d: 0, formas: [] };
    acc.v += v;
    acc.d += d;
    acc.formas.push(n);
    porClave.set(k, acc);
  }

  console.log(`   ${porNombre.size} nombres distintos en Switch → ${porClave.size} personas por clave`);
  console.log();
  const ordenadas = [...porClave.entries()].sort((a, b) => b[1].v - a[1].v);
  for (const [k, { v, d, formas }] of ordenadas) {
    const partido = formas.length > 1 ? ` 🔴 PARTIDO EN ${formas.length}: ${formas.join(" | ")}` : "";
    console.log(`   ${k.padEnd(26)} ${money(v).padStart(14)}  ${String(d).padStart(5)} docs${partido}`);
  }

  console.log();
  console.log("   Sin agrupar, una meta por vendedora sobre esos nombres mide la MITAD.");

  console.log();
  console.log("═".repeat(78));
  console.log("4) COSTO de calcular un avance (sep-dic, el período de la meta real)");
  console.log("═".repeat(78));

  const t0 = Date.now();
  const meta = await leerRango("2026-09-01", "2026-12-31");
  console.log(`   sep-dic 2026 (todavía sin datos): ${meta.length} filas, ${Date.now() - t0} ms`);

  const t1 = Date.now();
  const equivalente = await leerRango("2025-09-01", "2025-12-31");
  const viajes = Math.ceil(equivalente.length / 1000) + 1;
  console.log(
    `   sep-dic 2025 (el mismo período, con datos): ${equivalente.length} filas, ` +
      `${Date.now() - t1} ms, ~${viajes} viajes paginados de 1.000`,
  );
  console.log();
  console.log("   ⚠️ Eso es POR CARGA DE PANTALLA y contra una base en compute Micro.");
  console.log("      Por eso el camino bueno es agregar en Postgres (1 viaje).");
}

if (process.argv[2] !== "vendedoras") {
  main().then(
    () => process.exit(0),
    (e) => {
      console.error(e);
      process.exit(1);
    },
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 5) VENTA 2026 POR VENDEDORA + ÚLTIMA VENTA (quién sigue trabajando)
//
//    Corre aparte:
//      DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config \
//        scripts/_diag-metas-multifashion.ts vendedoras
// ─────────────────────────────────────────────────────────────────────────────
export async function vendedoras2026() {
  const filas = await leerRango("2026-01-01", "2026-08-13");
  const porNombre = new Map<string, { v: number; d: number; ultima: string }>();
  for (const f of filas) {
    const n = (f.vendedor ?? "").trim();
    if (!n) continue;
    const k = clave(n);
    const acc = porNombre.get(k) ?? { v: 0, d: 0, ultima: "" };
    acc.v += Number(f.subtotal) || 0;
    acc.d += 1;
    const dia = String(f.fecha).slice(0, 10);
    if (dia > acc.ultima) acc.ultima = dia;
    porNombre.set(k, acc);
  }
  console.log("═".repeat(78));
  console.log("5) VENTA 2026 (1-ene → 13-ago) POR VENDEDORA + ÚLTIMA VENTA");
  console.log("═".repeat(78));
  console.log(`   ${filas.length} documentos retail en 2026`);
  console.log();
  const hoy = new Date("2026-08-13T12:00:00Z").getTime();
  for (const [k, { v, d, ultima }] of [...porNombre.entries()].sort((a, b) => b[1].v - a[1].v)) {
    const dias = Math.round((hoy - new Date(`${ultima}T12:00:00Z`).getTime()) / 86400000);
    const señal = dias > 45 ? `  🔴 hace ${Math.floor(dias / 30)} meses que no vende` : "";
    console.log(
      `   ${k.padEnd(20)} ${money(v).padStart(14)}  ${String(d).padStart(5)} docs  ` +
        `última ${ultima}${señal}`,
    );
  }
}

if (process.argv[2] === "vendedoras") {
  vendedoras2026().then(
    () => process.exit(0),
    (e) => { console.error(e); process.exit(1); },
  );
}

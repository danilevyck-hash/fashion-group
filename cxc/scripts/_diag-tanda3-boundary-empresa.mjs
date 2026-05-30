// Diagnóstico Tanda 3 (🟢-15 boundary gap, 🟢-18 dominio de empresa).
// Read-only. Self-contained: parsea .env.local sin depender de dotenv.
//
//   node scripts/_diag-tanda3-boundary-empresa.mjs
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const env = {};
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const url = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
const key =
  env.SUPABASE_SERVICE_ROLE_KEY ||
  env.SUPABASE_SERVICE_KEY ||
  env.SUPABASE_SECRET_KEY ||
  env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.log("FALTAN CREDENCIALES. Vars encontradas:", Object.keys(env).filter((k) => /SUPABASE/.test(k)));
  process.exit(1);
}
console.log("Conectando a", url, "con key tipo:", key.length > 60 ? "service/anon JWT" : "?");
const sb = createClient(url, key, { auth: { persistSession: false } });

const ALLOWED = [
  "vistana", "fashion_wear", "fashion_shoes", "active_shoes", "active_wear",
  "joystep", "confecciones_boston", "american_classic",
  "vistana_international", "boston",
];

async function count(table, build) {
  let q = sb.from(table).select("*", { count: "exact", head: true });
  q = build(q);
  const { count, error } = await q;
  if (error) return `ERR(${error.message})`;
  return count;
}

(async () => {
  console.log("\n========== 🟢-18 DOMINIO DE empresa EN ventas_raw ==========");
  const inList = "(" + ALLOWED.map((v) => `"${v}"`).join(",") + ")";
  const fuera = await count("ventas_raw", (q) => q.not("empresa", "in", inList));
  console.log("Filas con empresa FUERA de la lista permitida:", fuera);
  console.log("(si = 0, un CHECK validado con esa lista es seguro de aplicar)\n");
  for (const v of ALLOWED) {
    const c = await count("ventas_raw", (q) => q.eq("empresa", v));
    console.log(`  ${v.padEnd(22)} → ${c}`);
  }

  console.log("\n========== 🟢-15 BOUNDARY VENTAS (2025-05-01) ==========");
  // switch_facturas: ¿desde cuándo? ¿algo exactamente el 2025-05-01?
  {
    const { data, error } = await sb
      .from("switch_facturas").select("fecha").order("fecha", { ascending: true }).limit(1);
    console.log("switch_facturas MIN(fecha):", error ? `ERR(${error.message})` : data?.[0]?.fecha ?? "(vacío)");
  }
  console.log("switch_facturas en 2025-05-01 (>= 05-01 y < 05-02):",
    await count("switch_facturas", (q) => q.gte("fecha", "2025-05-01").lt("fecha", "2025-05-02")));
  console.log("switch_facturas ANTES de 2025-05-01 (no debería haber):",
    await count("switch_facturas", (q) => q.lt("fecha", "2025-05-01")));
  // ventas_raw: ¿hay data en/después del boundary que el filtro mensual excluye?
  console.log("ventas_raw anio=2025 mes>=5 (mayo 2025+ que la vista DESCARTA):",
    await count("ventas_raw", (q) => q.eq("anio", 2025).gte("mes", 5)));
  console.log("ventas_raw anio>=2026 (también descartado por la rama ventas):",
    await count("ventas_raw", (q) => q.gte("anio", 2026)));
  console.log("ventas_raw anio=2025 mes=5 (mayo 2025 exacto):",
    await count("ventas_raw", (q) => q.eq("anio", 2025).eq("mes", 5)));

  console.log("\n========== 🟢-15 BOUNDARY COSTO (2026-05-01) ==========");
  {
    const { data, error } = await sb
      .from("switch_costo_diario").select("fecha").order("fecha", { ascending: true }).limit(1);
    console.log("switch_costo_diario MIN(fecha):", error ? `ERR(${error.message})` : data?.[0]?.fecha ?? "(vacío)");
  }
  console.log("switch_costo_diario en 2026-05-01:",
    await count("switch_costo_diario", (q) => q.gte("fecha", "2026-05-01").lt("fecha", "2026-05-02")));
  console.log("ventas_raw anio=2026 mes>=5 (mayo 2026+ que la vista COSTO descarta):",
    await count("ventas_raw", (q) => q.eq("anio", 2026).gte("mes", 5)));
  console.log("ventas_raw anio>=2027:",
    await count("ventas_raw", (q) => q.gte("anio", 2027)));

  console.log("\n========== rango general ventas_raw ==========");
  {
    const { data } = await sb.from("ventas_raw").select("fecha").order("fecha", { ascending: false }).limit(1);
    console.log("ventas_raw MAX(fecha):", data?.[0]?.fecha ?? "(vacío)");
    const { data: d2 } = await sb.from("ventas_raw").select("fecha").order("fecha", { ascending: true }).limit(1);
    console.log("ventas_raw MIN(fecha):", d2?.[0]?.fecha ?? "(vacío)");
  }
  console.log("\nDONE_DIAG_TANDA3");
})().catch((e) => { console.error("FATAL", e); process.exit(1); });

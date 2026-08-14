// Baseline read-only de las 6 empresas B2B (RPC comision_b2b_v5), 3 meses.
// Sirve como "ANTES" para probar que las otras 5 no se mueven.
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    }),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const EMPRESAS = ["vistana", "fashion_wear", "fashion_shoes", "active_shoes", "active_wear", "joystep"];
const PERIODOS = [[2026, 7], [2026, 6], [2026, 5]];
const out = {};

for (const e of EMPRESAS) {
  for (const [y, m] of PERIODOS) {
    const { data, error } = await sb.rpc("comision_b2b_v5", { p_empresa_key: e, p_year: y, p_mes: m });
    if (error) throw error;
    out[`${e}|${y}-${String(m).padStart(2, "0")}`] = data.vendedores;
  }
}
const path = new URL(process.argv[2] ?? "../baseline-comisiones.json", import.meta.url);
writeFileSync(path, JSON.stringify(out, null, 2));

console.log("=== TOTALES por empresa × mes (comision_total) ===");
const filas = [];
for (const k of Object.keys(out)) {
  const [emp, per] = k.split("|");
  const vs = out[k];
  const conDefault = vs.reduce((a, v) => a + Number(v.comision_total), 0);
  const sinDefault = vs.filter((v) => v.vendedor !== "DEFAULT").reduce((a, v) => a + Number(v.comision_total), 0);
  const def = vs.find((v) => v.vendedor === "DEFAULT");
  filas.push({
    empresa: emp,
    periodo: per,
    vendedores: vs.length,
    total_con_DEFAULT: conDefault.toFixed(2),
    total_sin_DEFAULT: sinDefault.toFixed(2),
    DEFAULT_comision: def ? Number(def.comision_total).toFixed(2) : "-",
  });
}
console.table(filas);
console.log(`\nbaseline escrito en ${path.pathname}`);
process.exit(0);

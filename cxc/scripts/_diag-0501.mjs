// 🟢-15: cuánto se pierde exactamente el 2025-05-01 (hueco entre ramas).
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
const env = {};
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data, error } = await sb
  .from("ventas_raw")
  .select("empresa, subtotal, costo")
  .eq("fecha", "2025-05-01");
if (error) { console.log("ERR", error.message); process.exit(1); }

console.log(`ventas_raw filas en EXACTAMENTE 2025-05-01: ${data.length}`);
const byE = new Map();
let totS = 0, totC = 0;
for (const r of data) {
  const e = byE.get(r.empresa) ?? { n: 0, s: 0, c: 0 };
  e.n++; e.s += Number(r.subtotal ?? 0); e.c += Number(r.costo ?? 0);
  byE.set(r.empresa, e);
  totS += Number(r.subtotal ?? 0); totC += Number(r.costo ?? 0);
}
for (const [k, e] of [...byE.entries()].sort()) {
  console.log(`  ${k.padEnd(22)} filas=${e.n}  subtotal=$${e.s.toFixed(2)}  costo=$${e.c.toFixed(2)}`);
}
console.log(`TOTAL 2025-05-01: subtotal=$${totS.toFixed(2)}  costo=$${totC.toFixed(2)}`);

// Contraste: switch_facturas el 2025-05-02 (primer día real) para dimensionar
const { count: sf0502 } = await sb
  .from("switch_facturas").select("*", { count: "exact", head: true })
  .gte("fecha", "2025-05-02").lt("fecha", "2025-05-03");
console.log(`switch_facturas el 2025-05-02 (referencia 1 día): ${sf0502} comprobantes`);
console.log("DONE_0501");

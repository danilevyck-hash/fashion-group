import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(
  readFileSync(resolve(process.cwd(), ".env.local"), "utf8").split("\n")
    .filter((l) => l.trim() && !l.startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const tests = [
  ["fecha NULL", "fecha.is.null"],
  ["fecha_vencimiento NULL", "fecha_vencimiento.is.null"],
  ["dias_vencidos NULL", "dias_vencidos.is.null"],
];

for (const [label, filter] of tests) {
  const { count } = await sb.from("cxc_rows").select("id", { count: "exact", head: true }).or(filter);
  console.log(`${label.padEnd(30)} ${count}`);
}

// Crosstab: fecha NULL && dias_vencidos NULL
const { count: bothNull } = await sb
  .from("cxc_rows")
  .select("id", { count: "exact", head: true })
  .is("fecha", null)
  .is("dias_vencidos", null);
console.log(`fecha NULL AND dias_vencidos NULL  ${bothNull}`);

const { count: fechaNullDiasOk } = await sb
  .from("cxc_rows")
  .select("id", { count: "exact", head: true })
  .is("fecha", null)
  .not("dias_vencidos", "is", null);
console.log(`fecha NULL AND dias_vencidos OK    ${fechaNullDiasOk}`);

// Top distinct comprobante para entender qué tipo de doc tiene fecha NULL
const { data: rows } = await sb
  .from("cxc_rows")
  .select("comprobante")
  .is("fecha", null)
  .limit(2000);
const counts = new Map();
for (const r of rows ?? []) counts.set(r.comprobante, (counts.get(r.comprobante) ?? 0) + 1);
console.log("\nTipos de comprobante con fecha NULL:");
for (const [k, v] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(k).padEnd(30)} ${v}`);
}

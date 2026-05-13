// Auditoría final post-migración.
// Verifica que el bug del parser está cerrado y que las filas con
// fecha_vencimiento NULL son sólo las legítimas (NCs, Recibos, Saldo Anterior).

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(resolve(process.cwd(), ".env.local"), "utf8").split("\n")
    .filter((l) => l.trim() && !l.startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

console.log("=".repeat(70));
console.log("AUDITORIA FINAL POST-MIGRACION (parser v2)");
console.log("=".repeat(70));

const { count: total } = await sb.from("cxc_rows").select("id", { count: "exact", head: true });
const { count: nullFecha } = await sb.from("cxc_rows").select("id", { count: "exact", head: true }).is("fecha", null);
const { count: nullVence } = await sb.from("cxc_rows").select("id", { count: "exact", head: true }).is("fecha_vencimiento", null);

console.log(`\nGLOBAL`);
console.log(`  total filas:                  ${total}`);
console.log(`  fecha NULL:                   ${nullFecha}`);
console.log(`  fecha_vencimiento NULL:       ${nullVence}`);

// Desglose por comprobante de los que tienen fecha_vencimiento NULL
const { data: venceNullRows } = await sb
  .from("cxc_rows")
  .select("company_key, comprobante, debito, credito")
  .is("fecha_vencimiento", null);

const byCompro = new Map();
for (const r of venceNullRows ?? []) {
  const k = r.comprobante;
  const prev = byCompro.get(k) ?? { count: 0, saldoAbs: 0, byEmpresa: new Map() };
  prev.count++;
  prev.saldoAbs += Math.abs(Number(r.debito ?? 0) - Number(r.credito ?? 0));
  prev.byEmpresa.set(r.company_key, (prev.byEmpresa.get(r.company_key) ?? 0) + 1);
  byCompro.set(k, prev);
}

console.log(`\nDESGLOSE de las ${nullVence} filas con fecha_vencimiento NULL por tipo de comprobante:`);
console.log("-".repeat(80));
console.log("comprobante         | count | saldo abs total  | distribución por empresa");
console.log("-".repeat(80));
for (const [k, v] of [...byCompro.entries()].sort((a, b) => b[1].count - a[1].count)) {
  const empStr = [...v.byEmpresa.entries()].map(([e, c]) => `${e}=${c}`).join(", ");
  const legit = ["Nota de Crédito", "Recibo", "Saldo Anterior"].includes(k);
  console.log(`  ${String(k).padEnd(20)} | ${String(v.count).padStart(5)} | $${v.saldoAbs.toFixed(2).padStart(14)} | ${empStr}  ${legit ? "(LEGITIMO)" : "(ANOMALIA)"}`);
}

// Distribución por empresa
console.log(`\nDISTRIBUCION POR EMPRESA`);
console.log("-".repeat(60));
const { data: empData } = await sb.from("cxc_rows").select("company_key");
const empCounts = new Map();
for (const r of empData ?? []) empCounts.set(r.company_key, (empCounts.get(r.company_key) ?? 0) + 1);
for (const [k, v] of [...empCounts.entries()].sort()) console.log(`  ${k.padEnd(20)} ${v}`);

// Estados de parser_version
console.log(`\nESTADO DE UPLOADS (parser_version)`);
console.log("-".repeat(60));
const { data: uploads } = await sb.from("cxc_uploads").select("company_key, parser_version, row_count, uploaded_at").order("uploaded_at", { ascending: false });
for (const u of uploads ?? []) {
  console.log(`  ${u.uploaded_at}  ${u.company_key.padEnd(20)}  ${u.parser_version}  rows=${u.row_count}`);
}

console.log("\n=== FIN AUDITORIA ===");

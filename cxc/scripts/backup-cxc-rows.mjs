// Backup completo de cxc_rows + cxc_uploads a CSV.
// Corre ANTES del re-upload programático. Sirve como punto de
// restauración si el script de reparación falla a mitad.
//
// Uso: node scripts/backup-cxc-rows.mjs

import { readFileSync, writeFileSync, mkdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(resolve(process.cwd(), ".env.local"), "utf8").split("\n")
    .filter((l) => l.trim() && !l.startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

mkdirSync("backups", { recursive: true });
const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

function toCsvRow(values) {
  return values.map((v) => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  }).join(",");
}

async function dumpTable(table, file) {
  const PAGE = 1000;
  let all = [];
  let from = 0;
  while (true) {
    const { data, error } = await sb.from(table).select("*").range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all = all.concat(data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  if (all.length === 0) {
    console.warn(`  ${table}: 0 filas (skip)`);
    writeFileSync(file, "");
    return 0;
  }
  const headers = Object.keys(all[0]);
  const lines = [toCsvRow(headers)];
  for (const row of all) lines.push(toCsvRow(headers.map((h) => row[h])));
  writeFileSync(file, lines.join("\n") + "\n");
  return all.length;
}

const cxcRowsFile = `backups/cxc_rows_${ts}.csv`;
const cxcUploadsFile = `backups/cxc_uploads_${ts}.csv`;

console.log("Backup en curso...");
const nRows = await dumpTable("cxc_rows", cxcRowsFile);
const nUploads = await dumpTable("cxc_uploads", cxcUploadsFile);

const sizeRows = statSync(cxcRowsFile).size;
const sizeUploads = statSync(cxcUploadsFile).size;

console.log(`\n  ${cxcRowsFile}`);
console.log(`    filas: ${nRows}    tamaño: ${(sizeRows / 1024).toFixed(1)} KB`);
console.log(`  ${cxcUploadsFile}`);
console.log(`    filas: ${nUploads}    tamaño: ${(sizeUploads / 1024).toFixed(1)} KB`);

// Sanity check: re-leer y contar líneas
const reReadRows = readFileSync(cxcRowsFile, "utf8").split("\n").filter((l) => l.length).length - 1;
const reReadUploads = readFileSync(cxcUploadsFile, "utf8").split("\n").filter((l) => l.length).length - 1;
console.log(`\nVerificación post-write:`);
console.log(`  cxc_rows: ${reReadRows} filas (${reReadRows === nRows ? "OK" : "MISMATCH"})`);
console.log(`  cxc_uploads: ${reReadUploads} filas (${reReadUploads === nUploads ? "OK" : "MISMATCH"})`);

if (reReadRows !== nRows || reReadUploads !== nUploads) {
  console.error("\nBACKUP INCONSISTENTE — abortar antes de cualquier cambio.");
  process.exit(1);
}
console.log("\nBackup OK. Seguro proceder.");

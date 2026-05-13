// Diagnóstico de los CSVs descargados: encoding, separador,
// formatos de fecha en FECHA y VENCE, conteo de filas con fecha vacía
// o no estándar, y cruce con n_sistema de las filas que sabemos
// quedaron con fecha NULL en la DB.
//
// Uso: node scripts/diagnose-csv-formats.mjs

import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(resolve(process.cwd(), ".env.local"), "utf8").split("\n")
    .filter((l) => l.trim() && !l.startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const DIR = "/tmp/cxc-samples";
const files = readdirSync(DIR).filter((f) => f.endsWith(".csv"));

// 1. Bajar de DB los n_sistema con fecha NULL para cruzarlos con CSVs.
const { data: nullRows } = await sb
  .from("cxc_rows")
  .select("company_key, n_sistema, comprobante, cliente_codigo, n_fiscal, fecha, fecha_vencimiento, dias_vencidos")
  .is("fecha", null);
const nullByNSistema = new Map();
for (const r of nullRows ?? []) nullByNSistema.set(`${r.company_key}|${r.n_sistema}`, r);
console.log(`Filas en DB con fecha NULL: ${nullRows?.length ?? 0}`);

// Helper: decode CSV con misma lógica que el endpoint
function decodeBuffer(buf) {
  let text = new TextDecoder("latin1").decode(buf);
  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(buf);
  if (!utf8.includes("�") && /[áéíóúñÑÁÉÍÓÚ]/.test(utf8) && !/[áéíóúñÑÁÉÍÓÚ]/.test(text)) {
    text = utf8;
  }
  return text;
}

// Classifier de formatos de fecha
function classifyDate(raw) {
  const s = (raw ?? "").trim();
  if (s === "") return "EMPTY";
  if (/^\d{2}-\d{2}-\d{4}$/.test(s)) return "DD-MM-YYYY";
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) return "DD/MM/YYYY";
  if (/^\d{1,2}-\d{1,2}-\d{4}$/.test(s)) return "D-M-YYYY (sin padding)";
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) return "D/M/YYYY (sin padding)";
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return "YYYY-MM-DD (ISO)";
  if (/^\d{4}\/\d{2}\/\d{2}$/.test(s)) return "YYYY/MM/DD";
  if (/\s/.test(s)) return `WHITESPACE INSIDE ("${s}")`;
  return `OTRO ("${s}")`;
}

let totalCsvRows = 0;
let totalEmptyFechaInCsv = 0;
let totalEmptyVenceInCsv = 0;
const fechaFormatCounts = new Map();
const venceFormatCounts = new Map();
const fechaEmptyByComprobante = new Map();
const venceEmptyByComprobante = new Map();
const matchedNullRows = [];

for (const fname of files) {
  const buf = readFileSync(`${DIR}/${fname}`);
  const text = decodeBuffer(buf);
  // Detectar separador: contar ; vs , en primera línea
  const firstLine = text.split(/\r?\n/, 1)[0];
  const semi = (firstLine.match(/;/g) ?? []).length;
  const comma = (firstLine.match(/,/g) ?? []).length;
  const sep = semi >= comma ? ";" : ",";

  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const rawHeaders = lines[0].split(sep).map((h) => h.trim().replace(/\s+/g, " ").toUpperCase());

  const idx = (key) => {
    const i = rawHeaders.indexOf(key);
    if (i >= 0) return i;
    if (key === "N. SISTEMA") return rawHeaders.indexOf("N. INTERNO");
    return -1;
  };

  const iFecha = idx("FECHA");
  const iCodigo = idx("CODIGO");
  const iCompro = idx("COMPROBANTE");
  const iNSist = idx("N. SISTEMA");
  const iVence = idx("VENCE");

  // Identificar empresa por nombre de archivo
  const empMatch = fname.match(/^([a-z_]+)__/);
  const empresa = empMatch ? empMatch[1] : "(unknown)";

  // Conteos por archivo
  let fileRows = 0;
  let fileFechaEmpty = 0;
  let fileVenceEmpty = 0;
  let fileMatchedNull = 0;

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(sep);
    const fecha = (cols[iFecha] ?? "").trim();
    const vence = iVence >= 0 ? (cols[iVence] ?? "").trim() : "";
    const compro = (cols[iCompro] ?? "").trim().replace(/\s+/g, " ");
    const nSistRaw = iNSist >= 0 ? (cols[iNSist] ?? "").trim() : "";
    const nSist = nSistRaw.replace(/\s+/g, " ");
    const codigo = (cols[iCodigo] ?? "").trim();

    if (!codigo || !compro) continue; // mismo skip que el parser real
    fileRows++; totalCsvRows++;

    const fClass = classifyDate(fecha);
    const vClass = classifyDate(vence);
    fechaFormatCounts.set(fClass, (fechaFormatCounts.get(fClass) ?? 0) + 1);
    venceFormatCounts.set(vClass, (venceFormatCounts.get(vClass) ?? 0) + 1);

    if (fClass === "EMPTY") {
      fileFechaEmpty++; totalEmptyFechaInCsv++;
      const k = compro;
      fechaEmptyByComprobante.set(k, (fechaEmptyByComprobante.get(k) ?? 0) + 1);
    }
    if (vClass === "EMPTY") {
      fileVenceEmpty++; totalEmptyVenceInCsv++;
      const k = compro;
      venceEmptyByComprobante.set(k, (venceEmptyByComprobante.get(k) ?? 0) + 1);
    }

    // Cruzar con DB null rows
    const key = `${empresa}|${nSist}`;
    if (nullByNSistema.has(key)) {
      fileMatchedNull++;
      if (matchedNullRows.length < 30) {
        matchedNullRows.push({ empresa, n_sistema: nSist, codigo, compro, fecha_csv: fecha, fecha_class: fClass, vence_csv: vence, vence_class: vClass });
      }
    }
  }

  console.log(`\n[${fname}]`);
  console.log(`  rows=${fileRows}  fecha vacía=${fileFechaEmpty}  vence vacía=${fileVenceEmpty}  match con DB-null=${fileMatchedNull}`);
}

console.log("\n=== GLOBAL ===");
console.log(`Filas CSV totales: ${totalCsvRows}`);
console.log(`Fecha vacía:  ${totalEmptyFechaInCsv} (${((totalEmptyFechaInCsv / totalCsvRows) * 100).toFixed(2)}%)`);
console.log(`Vence vacía:  ${totalEmptyVenceInCsv} (${((totalEmptyVenceInCsv / totalCsvRows) * 100).toFixed(2)}%)`);

console.log("\nFormatos columna FECHA:");
for (const [k, v] of [...fechaFormatCounts.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${String(k).padEnd(35)} ${v}`);

console.log("\nFormatos columna VENCE:");
for (const [k, v] of [...venceFormatCounts.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${String(k).padEnd(35)} ${v}`);

console.log("\nFECHA vacía por comprobante:");
for (const [k, v] of [...fechaEmptyByComprobante.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${String(k).padEnd(35)} ${v}`);

console.log("\nVENCE vacía por comprobante:");
for (const [k, v] of [...venceEmptyByComprobante.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${String(k).padEnd(35)} ${v}`);

console.log("\nSample de filas en CSV que aparecen como fecha NULL en DB:");
console.log("empresa         | n_sistema       | codigo  | compro              | fecha_csv     | clase fecha           | vence_csv     | clase vence");
for (const r of matchedNullRows) {
  console.log(`${r.empresa.padEnd(15)} | ${String(r.n_sistema).padEnd(15)} | ${r.codigo.padEnd(7)} | ${r.compro.padEnd(20)} | ${String(r.fecha_csv).padEnd(13)} | ${String(r.fecha_class).padEnd(20)} | ${String(r.vence_csv).padEnd(13)} | ${r.vence_class}`);
}

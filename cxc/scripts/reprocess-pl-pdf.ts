/**
 * Re-parsea un PDF con el parser actual y diffea contra lo guardado en DB.
 *
 * SOLO-LECTURA. No escribe en Supabase. Produce un diff legible por PL con
 * los campos que cambiarían si el usuario aceptase sobreescribir.
 *
 * Uso típico (batch 42328):
 *   npx tsx scripts/reprocess-pl-pdf.ts --pdf=tests/fixtures/packing-lists/42328_PList.pdf
 *
 * Salida:
 *   - stdout: diff por PL
 *   - scripts/output/reprocess-<label>-<timestamp>.txt (mismo diff archivado)
 *
 * Requiere .env.local con NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { extractPdfFromFile } from "./lib/extract-pdf-node";
import {
  parseMultiplePackingLists,
  buildIndex,
  PARSER_VERSION,
  type ParsedPackingList,
  type PLIndexRow,
} from "../src/lib/parse-packing-list";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, "..");

const envPath = resolve(repoRoot, ".env.local");
if (existsSync(envPath)) {
  const env = readFileSync(envPath, "utf-8");
  for (const line of env.split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

interface DBItem {
  estilo: string;
  producto: string;
  total_pcs: number;
  bultos: Record<string, number> | null;
  bulto_muestra: string | null;
  is_os: boolean | null;
}

interface DBRow {
  id: string;
  numero_pl: string;
  empresa: string;
  fecha_entrega: string | null;
  total_bultos: number;
  total_piezas: number;
  total_estilos: number;
  parser_metadata: { bulto_order?: { id: string; label: string }[]; parser_version?: string } | null;
  items: DBItem[];
}

function parseArgs() {
  const args = process.argv.slice(2);
  let pdf = "";
  let label = "";
  for (const a of args) {
    const m1 = a.match(/^--pdf=(.+)$/);
    if (m1) pdf = m1[1];
    const m2 = a.match(/^--label=(.+)$/);
    if (m2) label = m2[1];
  }
  if (!pdf) {
    console.error("Falta --pdf=ruta/al/archivo.pdf");
    process.exit(1);
  }
  if (!label) label = basename(pdf).replace(/\.pdf$/i, "");
  return { pdf: resolve(process.cwd(), pdf), label };
}

function timestamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

async function fetchDBByNumero(numeros: string[]): Promise<Map<string, DBRow>> {
  if (numeros.length === 0) return new Map();
  const { data: pls, error } = await supabase
    .from("packing_lists")
    .select("id, numero_pl, empresa, fecha_entrega, total_bultos, total_piezas, total_estilos, parser_metadata")
    .in("numero_pl", numeros);
  if (error) throw error;
  const byNumero = new Map<string, DBRow>();
  for (const pl of pls ?? []) byNumero.set(pl.numero_pl, { ...(pl as DBRow), items: [] });
  const ids = [...byNumero.values()].map(p => p.id);
  if (ids.length > 0) {
    const { data: items, error: itemsErr } = await supabase
      .from("pl_items")
      .select("pl_id, estilo, producto, total_pcs, bultos, bulto_muestra, is_os")
      .in("pl_id", ids);
    if (itemsErr) throw itemsErr;
    const itemsByPlId = new Map<string, DBItem[]>();
    for (const it of items ?? []) {
      const list = itemsByPlId.get(it.pl_id) ?? [];
      list.push(it as DBItem);
      itemsByPlId.set(it.pl_id, list);
    }
    for (const pl of byNumero.values()) pl.items = itemsByPlId.get(pl.id) ?? [];
  }
  return byNumero;
}

interface Diff { field: string; db: string; parser: string }

function diffHeader(db: DBRow, parsed: ParsedPackingList): Diff[] {
  const diffs: Diff[] = [];
  if ((db.empresa || "") !== (parsed.empresa || "")) {
    diffs.push({ field: "empresa", db: db.empresa || "", parser: parsed.empresa || "" });
  }
  if ((db.fecha_entrega || "") !== (parsed.fechaEntrega || "")) {
    diffs.push({ field: "fecha_entrega", db: db.fecha_entrega || "", parser: parsed.fechaEntrega || "" });
  }
  if (db.total_bultos !== parsed.totalBultos) {
    diffs.push({ field: "total_bultos", db: String(db.total_bultos), parser: String(parsed.totalBultos) });
  }
  if (db.total_piezas !== parsed.totalPiezas) {
    diffs.push({ field: "total_piezas", db: String(db.total_piezas), parser: String(parsed.totalPiezas) });
  }
  // bulto_order
  const dbOrder = (db.parser_metadata?.bulto_order || []).map(e => `${e.id}:${e.label}`).join(",");
  const parsedOrder = parsed.bultos.map(b => `${b.id}:${b.rawId}`).join(",");
  if (dbOrder !== parsedOrder) {
    diffs.push({ field: "bulto_order", db: dbOrder || "(vacío)", parser: parsedOrder });
  }
  const dbVersion = db.parser_metadata?.parser_version || "(legacy)";
  if (dbVersion !== PARSER_VERSION) {
    diffs.push({ field: "parser_version", db: dbVersion, parser: PARSER_VERSION });
  }
  return diffs;
}

interface ItemDiff {
  estilo: string;
  changes: Diff[];
}

function diffItems(db: DBRow, index: PLIndexRow[]): { added: string[]; removed: string[]; changed: ItemDiff[] } {
  const dbByEstilo = new Map(db.items.map(it => [it.estilo, it]));
  const newByEstilo = new Map(index.map(it => [it.estilo, it]));
  const added = [...newByEstilo.keys()].filter(k => !dbByEstilo.has(k));
  const removed = [...dbByEstilo.keys()].filter(k => !newByEstilo.has(k));
  const changed: ItemDiff[] = [];
  for (const [estilo, dbIt] of dbByEstilo) {
    const nu = newByEstilo.get(estilo);
    if (!nu) continue;
    const d: Diff[] = [];
    if (dbIt.total_pcs !== nu.totalPcs) {
      d.push({ field: "total_pcs", db: String(dbIt.total_pcs), parser: String(nu.totalPcs) });
    }
    if ((dbIt.producto || "") !== (nu.producto || "")) {
      d.push({ field: "producto", db: dbIt.producto || "", parser: nu.producto || "" });
    }
    if ((dbIt.bulto_muestra || "") !== (nu.bultoMuestra || "")) {
      d.push({ field: "bulto_muestra", db: dbIt.bulto_muestra || "", parser: nu.bultoMuestra || "" });
    }
    if ((dbIt.is_os || false) !== (nu.isOS || false)) {
      d.push({ field: "is_os", db: String(dbIt.is_os || false), parser: String(nu.isOS || false) });
    }
    // distribution
    const dbDist = dbIt.bultos || {};
    const nuDist = nu.distribution || {};
    const allKeys = new Set([...Object.keys(dbDist), ...Object.keys(nuDist)]);
    for (const k of [...allKeys].sort()) {
      const a = dbDist[k] || 0;
      const b = nuDist[k] || 0;
      if (a !== b) d.push({ field: `distribución[${k}]`, db: String(a), parser: String(b) });
    }
    if (d.length > 0) changed.push({ estilo, changes: d });
  }
  return { added, removed, changed };
}

async function main() {
  const { pdf, label } = parseArgs();
  console.log(`[reprocess] parser version: ${PARSER_VERSION}`);
  console.log(`[reprocess] PDF: ${pdf}`);

  const { text, rawLines } = await extractPdfFromFile(pdf);
  const parsedList = parseMultiplePackingLists(text, rawLines);
  console.log(`[reprocess] PLs en PDF: ${parsedList.length}`);

  const numeros = parsedList.map(p => p.numeroPL).filter(Boolean);
  const dbByNumero = await fetchDBByNumero(numeros);
  console.log(`[reprocess] PLs encontrados en DB: ${dbByNumero.size}/${numeros.length}`);
  console.log("");

  const outLines: string[] = [];
  const write = (s = "") => { outLines.push(s); console.log(s); };

  let plsWithChanges = 0;
  let totalFieldChanges = 0;

  for (const parsed of parsedList) {
    const db = dbByNumero.get(parsed.numeroPL);
    write(`─── PL #${parsed.numeroPL} ${db ? `(${db.empresa}, ${db.fecha_entrega ?? "sin fecha"})` : "(NO ESTÁ EN DB)"} ───`);
    if (!db) {
      write(`  · no existe en DB → sería INSERT completo`);
      plsWithChanges++;
      write("");
      continue;
    }

    const index = buildIndex(parsed);
    const headerDiffs = diffHeader(db, parsed);
    const { added, removed, changed } = diffItems(db, index);
    const changeCount = headerDiffs.length + added.length + removed.length + changed.length;
    totalFieldChanges += changeCount;
    if (changeCount === 0) {
      write(`  ✓ sin cambios`);
      write("");
      continue;
    }
    plsWithChanges++;

    for (const d of headerDiffs) {
      write(`  · ${d.field}: "${d.db}" → "${d.parser}"`);
    }
    if (added.length) write(`  · SKUs nuevos: ${added.join(", ")}`);
    if (removed.length) write(`  · SKUs que desaparecen: ${removed.join(", ")}`);
    for (const ch of changed) {
      write(`  · SKU ${ch.estilo}:`);
      for (const c of ch.changes) {
        write(`      ${c.field}: "${c.db}" → "${c.parser}"`);
      }
    }
    write("");
  }

  write(`== Resumen reprocess ${label} ==`);
  write(`PLs en PDF:                ${parsedList.length}`);
  write(`PLs en DB:                 ${dbByNumero.size}`);
  write(`PLs con cambios:           ${plsWithChanges}`);
  write(`Total diferencias campos:  ${totalFieldChanges}`);
  write("");
  write(`NOTA: NO se ha escrito en DB. Revisar el diff antes de decidir si aplicar.`);

  const outDir = resolve(repoRoot, "scripts", "output");
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  const outPath = resolve(outDir, `reprocess-${label}-${timestamp()}.txt`);
  writeFileSync(outPath, outLines.join("\n") + "\n", "utf-8");
  console.log(`[reprocess] diff archivado → ${outPath}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

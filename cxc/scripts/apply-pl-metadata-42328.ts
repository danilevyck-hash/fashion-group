/**
 * Aplica parser_metadata (parser_version 2.1.0 + bulto_order) a los 20 PLs
 * del batch 42328. SOLO escribe el campo parser_metadata en packing_lists;
 * no toca pl_items, totales, ni cualquier otro campo.
 *
 * Pasos:
 *   1. Backup: exporta parser_metadata + numero_pl + id actuales a
 *      scripts/output/backup-42328-metadata-<ts>.json
 *   2. Update: merge del bulto_order nuevo + parser_version + needs_review.
 *      Preserva cualquier otro campo que ya existiese en parser_metadata.
 *   3. Verify: re-lee los 20 PLs y confirma parser_version === 2.1.0 y
 *      bulto_order === expected.pls[i].bulto_order.
 *   4. Si verify falla: rollback via el backup.
 *
 * Uso:
 *   npx tsx scripts/apply-pl-metadata-42328.ts           # dry-run
 *   npx tsx scripts/apply-pl-metadata-42328.ts --apply   # escribe en DB
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { extractPdfFromFile } from "./lib/extract-pdf-node";
import {
  parseMultiplePackingLists,
  buildIndex,
  checkSaveTimeInvariants,
  PARSER_VERSION,
  type ParsedPackingList,
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

const PDF_PATH = resolve(repoRoot, "tests/fixtures/packing-lists/42328_PList.pdf");
const OUTPUT_DIR = resolve(repoRoot, "scripts/output");

function timestamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

interface BackupEntry {
  id: string;
  numero_pl: string;
  parser_metadata: Record<string, unknown>;
}

function buildNewMetadata(parsed: ParsedPackingList, existing: Record<string, unknown>): Record<string, unknown> {
  const index = buildIndex(parsed);
  const flags = checkSaveTimeInvariants(parsed, index);
  const bultoOrder = parsed.bultos.map(b => ({ id: b.id, label: b.rawId }));
  // Merge con existing para no pisar campos que alguien hubiese seteado
  // (ajustado_manualmente, bultos_fallback, etc.). Los nuevos ganan en caso
  // de colisión con parser_version / bulto_order / needs_review.
  return {
    ...existing,
    parser_version: PARSER_VERSION,
    bulto_order: bultoOrder,
    needs_review: flags.length > 0,
    needs_review_flags: flags,
  };
}

async function main() {
  const apply = process.argv.includes("--apply");
  console.log(`[apply-42328] parser version: ${PARSER_VERSION}`);
  console.log(`[apply-42328] modo: ${apply ? "APPLY (escribe en DB)" : "DRY-RUN (no escribe)"}`);

  if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });

  // 1. Parse PDF
  const { text, rawLines } = await extractPdfFromFile(PDF_PATH);
  const parsedList = parseMultiplePackingLists(text, rawLines);
  const numeros = parsedList.map(p => p.numeroPL).filter(Boolean);
  console.log(`[apply-42328] PLs en PDF: ${parsedList.length}`);

  // 2. Fetch estado actual de DB (para backup + diff)
  const { data: dbRows, error: dbErr } = await supabase
    .from("packing_lists")
    .select("id, numero_pl, parser_metadata")
    .in("numero_pl", numeros);
  if (dbErr) throw dbErr;
  const dbByNumero = new Map((dbRows ?? []).map(r => [r.numero_pl as string, r]));
  console.log(`[apply-42328] PLs en DB: ${dbByNumero.size}/${numeros.length}`);
  if (dbByNumero.size !== numeros.length) {
    const missing = numeros.filter(n => !dbByNumero.has(n));
    console.error(`[apply-42328] FALTAN en DB: ${missing.join(", ")}`);
    process.exit(1);
  }

  // 3. Backup parser_metadata actual
  const backup: BackupEntry[] = [...dbByNumero.values()].map(r => ({
    id: r.id as string,
    numero_pl: r.numero_pl as string,
    parser_metadata: (r.parser_metadata ?? {}) as Record<string, unknown>,
  }));
  const ts = timestamp();
  const backupPath = resolve(OUTPUT_DIR, `backup-42328-metadata-${ts}.json`);
  writeFileSync(backupPath, JSON.stringify(backup, null, 2) + "\n", "utf-8");
  console.log(`[apply-42328] backup → ${backupPath}`);

  // 4. Compute updates
  interface Update { id: string; numero_pl: string; new_metadata: Record<string, unknown>; old_metadata: Record<string, unknown> }
  const updates: Update[] = [];
  for (const parsed of parsedList) {
    const db = dbByNumero.get(parsed.numeroPL)!;
    const existing = (db.parser_metadata ?? {}) as Record<string, unknown>;
    const next = buildNewMetadata(parsed, existing);
    updates.push({
      id: db.id as string,
      numero_pl: parsed.numeroPL,
      new_metadata: next,
      old_metadata: existing,
    });
  }

  // 5. Dry-run preview
  console.log(`\n[apply-42328] updates preparados: ${updates.length}`);
  for (const u of updates) {
    const oldV = (u.old_metadata.parser_version as string) || "(legacy)";
    const bo = (u.new_metadata.bulto_order as { id: string }[]).length;
    const nr = u.new_metadata.needs_review ? " needs_review=YES" : "";
    console.log(`  PL ${u.numero_pl}: ${oldV} → ${PARSER_VERSION}, bulto_order=${bo} bultos${nr}`);
  }

  if (!apply) {
    console.log(`\n[apply-42328] DRY-RUN — para aplicar: re-corré con --apply`);
    return;
  }

  // 6. Apply
  console.log(`\n[apply-42328] aplicando UPDATES en DB…`);
  const errors: { numero_pl: string; msg: string }[] = [];
  for (const u of updates) {
    const { error } = await supabase
      .from("packing_lists")
      .update({ parser_metadata: u.new_metadata })
      .eq("id", u.id);
    if (error) {
      errors.push({ numero_pl: u.numero_pl, msg: error.message });
      console.error(`  ✗ PL ${u.numero_pl}: ${error.message}`);
    } else {
      console.log(`  ✓ PL ${u.numero_pl}`);
    }
  }
  if (errors.length > 0) {
    console.error(`\n[apply-42328] ${errors.length} updates fallaron — iniciando ROLLBACK`);
    await rollback(backup);
    process.exit(1);
  }

  // 7. Verify
  console.log(`\n[apply-42328] verify…`);
  const verifyFails = await verify(parsedList);
  if (verifyFails.length > 0) {
    console.error(`[apply-42328] verify falló en ${verifyFails.length} PLs:`);
    for (const f of verifyFails) console.error(`  ✗ ${f}`);
    console.error(`\n[apply-42328] ROLLBACK automático desde backup…`);
    await rollback(backup);
    process.exit(1);
  }
  console.log(`[apply-42328] ✓ verify OK — los 20 PLs tienen parser_version=${PARSER_VERSION} y bulto_order correcto`);
  console.log(`[apply-42328] backup disponible si hace falta rollback manual: ${backupPath}`);
}

async function verify(parsedList: ParsedPackingList[]): Promise<string[]> {
  const numeros = parsedList.map(p => p.numeroPL);
  const { data, error } = await supabase
    .from("packing_lists")
    .select("numero_pl, parser_metadata")
    .in("numero_pl", numeros);
  if (error) return [`SELECT verify falló: ${error.message}`];
  const byNumero = new Map((data ?? []).map(r => [r.numero_pl as string, r.parser_metadata as Record<string, unknown>]));
  const fails: string[] = [];
  for (const parsed of parsedList) {
    const meta = byNumero.get(parsed.numeroPL);
    if (!meta) {
      fails.push(`${parsed.numeroPL}: no encontrado en re-SELECT`);
      continue;
    }
    if (meta.parser_version !== PARSER_VERSION) {
      fails.push(`${parsed.numeroPL}: parser_version=${meta.parser_version} (esperado ${PARSER_VERSION})`);
      continue;
    }
    const expectedOrder = parsed.bultos.map(b => `${b.id}:${b.rawId}`).join(",");
    const gotOrderArr = (meta.bulto_order as { id: string; label: string }[] | undefined) || [];
    const gotOrder = gotOrderArr.map(e => `${e.id}:${e.label}`).join(",");
    if (gotOrder !== expectedOrder) {
      fails.push(`${parsed.numeroPL}: bulto_order mismatch\n     got:      ${gotOrder}\n     expected: ${expectedOrder}`);
    }
  }
  return fails;
}

async function rollback(backup: BackupEntry[]) {
  for (const b of backup) {
    const { error } = await supabase
      .from("packing_lists")
      .update({ parser_metadata: b.parser_metadata })
      .eq("id", b.id);
    if (error) console.error(`  rollback PL ${b.numero_pl} FALLÓ: ${error.message}`);
    else console.error(`  rollback PL ${b.numero_pl} OK`);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

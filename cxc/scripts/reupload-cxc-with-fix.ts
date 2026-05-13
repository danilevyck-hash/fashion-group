/**
 * Re-upload programático de las 6 empresas con CSV en backups/cxc-uploads/.
 *
 * Estrategia: usa el parser robusto v2 (src/lib/cxc-fecha.ts) para
 * re-procesar los CSVs originales archivados en el bucket de storage.
 * Cada empresa: DELETE cxc_uploads (CASCADE limpia cxc_rows) → INSERT
 * header con parser_version='v2' → INSERT rows.
 *
 * Modos:
 *   --dry-run        no escribe en DB; reporta cambios esperados
 *   --dry-run-sample sólo procesa active_shoes (47 filas) con diff completo
 *   (sin flag)       escribe en DB; orden fashion_wear → joystep
 *
 * Idempotente: skipea uploads ya marcados parser_version='v2'.
 *
 * Uso:
 *   npx tsx scripts/reupload-cxc-with-fix.ts --dry-run-sample
 *   npx tsx scripts/reupload-cxc-with-fix.ts --dry-run
 *   npx tsx scripts/reupload-cxc-with-fix.ts
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
  parseFechaFromCSVOrNFiscal,
  parseFechaFlexible,
  isLegitFechaNull,
  isLegitFechaVencimientoNull,
} from "../src/lib/cxc-fecha";

// ─── env + supabase ──────────────────────────────────────────────────────────

const env = Object.fromEntries(
  readFileSync(resolve(process.cwd(), ".env.local"), "utf8").split("\n")
    .filter((l) => l.trim() && !l.startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// ─── modos ───────────────────────────────────────────────────────────────────

const MODE: "real" | "dry-run" | "dry-run-sample" =
  process.argv.includes("--dry-run-sample") ? "dry-run-sample" :
  process.argv.includes("--dry-run") ? "dry-run" :
  "real";

const ORDER = ["fashion_wear", "vistana", "fashion_shoes", "active_shoes", "active_wear", "joystep"];
const SAMPLE = ["active_shoes"];
const TARGETS = MODE === "dry-run-sample" ? SAMPLE : ORDER;

// ─── parse helpers (mismo formato que endpoint) ──────────────────────────────

function toNum(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0;
  if (typeof v === "number") return isNaN(v) ? 0 : v;
  const s = String(v).trim().replace(/,/g, "");
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function toIntOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const s = String(v).trim();
  if (!s) return null;
  const n = parseInt(s, 10);
  return isNaN(n) ? null : n;
}

function cleanText(s: string | null | undefined): string {
  return (s ?? "").trim().replace(/\s+/g, " ");
}

const REQUIRED_HEADERS = ["FECHA", "CODIGO", "COMPROBANTE", "DEBITOS", "CREDITOS", "SALDO"];

interface ParsedRow {
  cliente_codigo: string;
  fecha: string | null;
  comprobante: string;
  n_sistema: string;
  n_fiscal: string;
  debito: number;
  credito: number;
  saldo: number;
  fecha_vencimiento: string | null;
  dias_vencidos: number | null;
}

function parseCsv(text: string): { rows: ParsedRow[]; filtered: { sinCodigo: number; sinComprobante: number } } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) throw new Error("CSV vacío");

  const rawHeaders = lines[0].split(";").map((h) => h.trim().replace(/\s+/g, " ").toUpperCase());
  const idx = (key: string): number => {
    const i = rawHeaders.indexOf(key);
    if (i >= 0) return i;
    if (key === "N. SISTEMA") return rawHeaders.indexOf("N. INTERNO");
    return -1;
  };

  const missing = REQUIRED_HEADERS.filter((h) => idx(h) < 0);
  if (missing.length > 0) throw new Error(`Headers faltantes: ${missing.join(", ")}`);

  const iFecha = idx("FECHA");
  const iCodigo = idx("CODIGO");
  const iCompro = idx("COMPROBANTE");
  const iNSist = idx("N. SISTEMA");
  const iNFiscal = idx("N. FISCAL");
  const iDeb = idx("DEBITOS");
  const iCre = idx("CREDITOS");
  const iSal = idx("SALDO");
  const iVence = idx("VENCE");
  const iDias = idx("DIAS");

  const rows: ParsedRow[] = [];
  const filtered = { sinCodigo: 0, sinComprobante: 0 };

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(";");
    const get = (j: number) => (j >= 0 ? (cols[j]?.trim() ?? "") : "");

    const cliente_codigo = get(iCodigo);
    if (!cliente_codigo) { filtered.sinCodigo++; continue; }
    const comprobante = cleanText(get(iCompro));
    if (!comprobante) { filtered.sinComprobante++; continue; }

    const n_fiscal = cleanText(get(iNFiscal));
    rows.push({
      cliente_codigo,
      fecha: parseFechaFromCSVOrNFiscal(get(iFecha), n_fiscal),
      comprobante,
      n_sistema: cleanText(get(iNSist)),
      n_fiscal,
      debito: toNum(get(iDeb)),
      credito: toNum(get(iCre)),
      saldo: toNum(get(iSal)),
      fecha_vencimiento: parseFechaFlexible(get(iVence)),
      dias_vencidos: iDias >= 0 ? toIntOrNull(get(iDias)) : null,
    });
  }

  return { rows, filtered };
}

function decodeBuffer(buf: Buffer): string {
  let text = new TextDecoder("latin1").decode(buf);
  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(buf);
  if (!utf8.includes("�") && /[áéíóúñÑÁÉÍÓÚ]/.test(utf8) && !/[áéíóúñÑÁÉÍÓÚ]/.test(text)) {
    text = utf8;
  }
  return text;
}

// ─── storage: traer el CSV más reciente por empresa ──────────────────────────

async function getLatestCsv(empresa: string): Promise<{ filename: string; buffer: Buffer } | null> {
  const { data, error } = await sb.storage.from("backups").list(`cxc-uploads/${empresa}`, {
    limit: 100,
    sortBy: { column: "name", order: "desc" },
  });
  if (error) throw new Error(`storage list ${empresa}: ${error.message}`);
  const csvs = (data ?? []).filter((f) => /\.csv$/i.test(f.name));
  if (csvs.length === 0) return null;
  const latest = csvs[0]; // ordenado desc por nombre (nombres tienen timestamp prefix)
  const { data: dl, error: dlErr } = await sb.storage.from("backups").download(`cxc-uploads/${empresa}/${latest.name}`);
  if (dlErr) throw new Error(`storage download ${empresa}/${latest.name}: ${dlErr.message}`);
  return { filename: latest.name, buffer: Buffer.from(await dl.arrayBuffer()) };
}

// ─── snapshot baseline para validación ───────────────────────────────────────

async function getBaselineSaldo(empresa: string): Promise<number> {
  // Sum debito - credito de las filas actuales de esa empresa
  const PAGE = 1000;
  let total = 0;
  let from = 0;
  while (true) {
    const { data, error } = await sb.from("cxc_rows").select("debito, credito").eq("company_key", empresa).range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const r of data) total += Number(r.debito ?? 0) - Number(r.credito ?? 0);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return Math.round(total * 100) / 100;
}

// ─── procesar una empresa ────────────────────────────────────────────────────

async function processEmpresa(empresa: string): Promise<{ ok: boolean; reason?: string; details?: Record<string, unknown> }> {
  console.log(`\n━━━ ${empresa} ━━━`);

  // Idempotencia: skip si ya está en v2.
  const { data: existingUploads } = await sb.from("cxc_uploads").select("id, parser_version").eq("company_key", empresa);
  const alreadyV2 = (existingUploads ?? []).some((u) => u.parser_version === "v2");
  if (alreadyV2 && MODE === "real") {
    console.log(`  [SKIP] ya migrada a parser_version='v2'`);
    return { ok: true, reason: "already_v2" };
  }

  // Baseline pre-cambio
  const baselineSaldo = await getBaselineSaldo(empresa);
  const { count: baselineCount } = await sb.from("cxc_rows").select("id", { count: "exact", head: true }).eq("company_key", empresa);
  const { count: baselineNullFecha } = await sb.from("cxc_rows").select("id", { count: "exact", head: true }).eq("company_key", empresa).is("fecha", null);
  const { count: baselineNullVence } = await sb.from("cxc_rows").select("id", { count: "exact", head: true }).eq("company_key", empresa).is("fecha_vencimiento", null);
  console.log(`  baseline: rows=${baselineCount}  saldo=$${baselineSaldo.toFixed(2)}  fecha NULL=${baselineNullFecha}  vence NULL=${baselineNullVence}`);

  // CSV
  const csv = await getLatestCsv(empresa);
  if (!csv) return { ok: false, reason: "no_csv_in_storage" };
  console.log(`  CSV: ${csv.filename}  (${(csv.buffer.length / 1024).toFixed(1)} KB)`);

  // Parse
  const text = decodeBuffer(csv.buffer);
  const { rows, filtered } = parseCsv(text);
  const parsedCount = rows.length;
  const parsedSaldo = Math.round(rows.reduce((s, r) => s + r.debito - r.credito, 0) * 100) / 100;
  const parsedNullFecha = rows.filter((r) => r.fecha === null).length;
  const parsedNullVence = rows.filter((r) => r.fecha_vencimiento === null).length;
  const parsedNullFechaIlegit = rows.filter((r) => r.fecha === null && !isLegitFechaNull(r.comprobante)).length;

  console.log(`  parsed:   rows=${parsedCount}  saldo=$${parsedSaldo.toFixed(2)}  fecha NULL=${parsedNullFecha} (ilegítimas=${parsedNullFechaIlegit})  vence NULL=${parsedNullVence}`);
  console.log(`  filtered: sinCodigo=${filtered.sinCodigo}  sinComprobante=${filtered.sinComprobante}`);

  // Validaciones de seguridad
  const saldoDiff = Math.abs(parsedSaldo - baselineSaldo);
  if (saldoDiff > 0.01) {
    return {
      ok: false, reason: "saldo_mismatch",
      details: { baselineSaldo, parsedSaldo, diff: saldoDiff },
    };
  }
  if (parsedNullFechaIlegit > 0) {
    return {
      ok: false, reason: "still_has_illegit_null_fecha",
      details: { parsedNullFechaIlegit, parsedCount },
    };
  }

  // En dry-run-sample: diff fila por fila contra DB actual
  if (MODE === "dry-run-sample") {
    console.log(`\n  DIFF DRY-RUN (active_shoes):`);
    const { data: dbRows } = await sb.from("cxc_rows").select("n_sistema, fecha, fecha_vencimiento, comprobante, debito, credito").eq("company_key", empresa);
    const dbByNSist = new Map<string, { fecha: string | null; fecha_vencimiento: string | null }>();
    for (const r of dbRows ?? []) dbByNSist.set(r.n_sistema, { fecha: r.fecha, fecha_vencimiento: r.fecha_vencimiento });

    let changedFecha = 0, changedVence = 0, unchangedRows = 0, newRows = 0;
    const sampleDiff: Array<{ n_sistema: string; fecha_before: string | null; fecha_after: string | null; vence_before: string | null; vence_after: string | null; compro: string }> = [];

    for (const r of rows) {
      const dbR = dbByNSist.get(r.n_sistema);
      if (!dbR) { newRows++; continue; }
      const fb = dbR.fecha, fa = r.fecha;
      const vb = dbR.fecha_vencimiento, va = r.fecha_vencimiento;
      const fechaChanged = fb !== fa;
      const venceChanged = vb !== va;
      if (fechaChanged) changedFecha++;
      if (venceChanged) changedVence++;
      if (!fechaChanged && !venceChanged) { unchangedRows++; continue; }
      if (sampleDiff.length < 20) sampleDiff.push({ n_sistema: r.n_sistema, fecha_before: fb, fecha_after: fa, vence_before: vb, vence_after: va, compro: r.comprobante });
    }

    console.log(`  fecha cambia:           ${changedFecha} filas`);
    console.log(`  fecha_vencimiento camb: ${changedVence} filas`);
    console.log(`  sin cambios:            ${unchangedRows}`);
    console.log(`  nuevas (en CSV, no DB): ${newRows}`);
    console.log(`\n  Sample diff (20 primeros con cambios):`);
    console.log(`  n_sistema       | compro              | fecha_before  → fecha_after   | vence_before  → vence_after`);
    for (const d of sampleDiff) {
      const fb = String(d.fecha_before ?? "NULL").padEnd(13);
      const fa = String(d.fecha_after ?? "NULL").padEnd(13);
      const vb = String(d.vence_before ?? "NULL").padEnd(13);
      const va = String(d.vence_after ?? "NULL").padEnd(13);
      console.log(`  ${d.n_sistema.padEnd(15)} | ${d.compro.padEnd(20)} | ${fb} → ${fa} | ${vb} → ${va}`);
    }

    // Distribución por año-mes
    const byMonth = new Map<string, number>();
    for (const r of rows) if (r.fecha) {
      const k = r.fecha.slice(0, 7);
      byMonth.set(k, (byMonth.get(k) ?? 0) + 1);
    }
    console.log(`\n  Distribución de fecha decodificada por año-mes:`);
    for (const [k, v] of [...byMonth.entries()].sort()) console.log(`    ${k}  ${"█".repeat(Math.min(50, v))} ${v}`);
  }

  // En dry-run / dry-run-sample: NO escribir
  if (MODE !== "real") {
    return { ok: true, reason: "dry_run", details: { parsedCount, parsedSaldo, parsedNullFecha, baselineNullFecha } };
  }

  // ESCRITURA REAL
  console.log(`  escribiendo...`);

  // 1. Lookup cliente_id
  const codigos = [...new Set(rows.map((r) => r.cliente_codigo))];
  const codigoToId = new Map<string, string>();
  for (let i = 0; i < codigos.length; i += 100) {
    const slice = codigos.slice(i, i + 100);
    const { data: clientes, error } = await sb.from("clientes_master").select("id, codigo").in("codigo", slice).eq("deleted", false);
    if (error) return { ok: false, reason: "clientes_master_lookup", details: { error: error.message } };
    for (const c of clientes ?? []) if (c.codigo) codigoToId.set(c.codigo, c.id);
  }

  // 2. DELETE viejos uploads (CASCADE limpia cxc_rows)
  const { error: delErr } = await sb.from("cxc_uploads").delete().eq("company_key", empresa);
  if (delErr) return { ok: false, reason: "delete_old_uploads", details: { error: delErr.message } };

  // 3. INSERT header con parser_version
  const { data: header, error: hdrErr } = await sb.from("cxc_uploads")
    .insert({ company_key: empresa, filename: csv.filename, row_count: rows.length, parser_version: "v2" })
    .select("id")
    .single();
  if (hdrErr || !header) return { ok: false, reason: "insert_header", details: { error: hdrErr?.message } };
  const uploadId = header.id;

  // 4. INSERT rows en batches
  const payload = rows.map((r) => ({
    upload_id: uploadId,
    company_key: empresa,
    cliente_codigo: r.cliente_codigo,
    cliente_id: codigoToId.get(r.cliente_codigo) ?? null,
    fecha: r.fecha,
    comprobante: r.comprobante,
    n_sistema: r.n_sistema,
    n_fiscal: r.n_fiscal,
    debito: r.debito,
    credito: r.credito,
    saldo: r.saldo,
    fecha_vencimiento: r.fecha_vencimiento,
    dias_vencidos: r.dias_vencidos,
  }));

  const BATCH = 2000;
  let inserted = 0;
  for (let i = 0; i < payload.length; i += BATCH) {
    const slice = payload.slice(i, i + BATCH);
    const { error: insErr } = await sb.from("cxc_rows").insert(slice);
    if (insErr) return { ok: false, reason: "insert_rows", details: { error: insErr.message, after: inserted } };
    inserted += slice.length;
  }

  // 5. Re-leer y validar
  const finalSaldo = await getBaselineSaldo(empresa);
  if (Math.abs(finalSaldo - baselineSaldo) > 0.01) {
    return { ok: false, reason: "post_insert_saldo_mismatch", details: { baselineSaldo, finalSaldo } };
  }

  const { count: finalCount } = await sb.from("cxc_rows").select("id", { count: "exact", head: true }).eq("company_key", empresa);
  const { count: finalNullFecha } = await sb.from("cxc_rows").select("id", { count: "exact", head: true }).eq("company_key", empresa).is("fecha", null);
  const { count: finalNullVence } = await sb.from("cxc_rows").select("id", { count: "exact", head: true }).eq("company_key", empresa).is("fecha_vencimiento", null);

  console.log(`  post-insert: rows=${finalCount}  saldo=$${finalSaldo.toFixed(2)}  fecha NULL=${finalNullFecha}  vence NULL=${finalNullVence}`);

  return { ok: true, reason: "migrated", details: { inserted, finalSaldo, finalCount, finalNullFecha, finalNullVence } };
}

// ─── main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`=== RE-UPLOAD CXC con parser v2 ===`);
  console.log(`Modo: ${MODE}`);
  console.log(`Empresas: ${TARGETS.join(", ")}\n`);

  const results: Record<string, { ok: boolean; reason?: string; details?: Record<string, unknown> }> = {};

  for (const emp of TARGETS) {
    try {
      results[emp] = await processEmpresa(emp);
      if (!results[emp].ok && MODE === "real") {
        console.error(`\nDETENIDO: ${emp} falló: ${results[emp].reason}`);
        console.error(JSON.stringify(results[emp].details, null, 2));
        break;
      }
    } catch (err) {
      results[emp] = { ok: false, reason: "exception", details: { error: err instanceof Error ? err.message : String(err) } };
      console.error(`\nEXCEPTION en ${emp}:`, err);
      if (MODE === "real") break;
    }
  }

  console.log(`\n━━━ RESUMEN ━━━`);
  for (const [emp, r] of Object.entries(results)) {
    console.log(`  ${emp.padEnd(15)}  ${r.ok ? "OK" : "FAIL"}  ${r.reason ?? ""}`);
  }
  const allOk = Object.values(results).every((r) => r.ok);
  process.exit(allOk ? 0 : 1);
}

main().catch((err) => { console.error(err); process.exit(1); });

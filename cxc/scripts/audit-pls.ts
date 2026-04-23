/**
 * Auditoría retroactiva de Packing Lists.
 *
 * Lee TODOS los PLs de la tabla packing_lists. Para cada PL compara el
 * total_piezas del header contra la suma de pl_items.total_pcs. Emite CSV
 * con diferencias + resumen por empresa si hay >50 PLs con mismatch.
 *
 * Solo lectura — no muta nada.
 *
 * Uso:
 *   npx tsx scripts/audit-pls.ts
 *   npx tsx scripts/audit-pls.ts --label=baseline
 *   npx tsx scripts/audit-pls.ts --label=post-fix
 *
 * Output:
 *   scripts/output/pl-audit-<label>-<timestamp>.csv
 *   scripts/output/pl-audit-summary-<label>-<timestamp>.txt  (solo si >50 mismatch)
 *
 * Requiere en .env.local:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, "..");

// Load .env.local manually (no dotenv dep needed)
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

interface BultoOrderEntry { id: string; label: string }

interface ParserMetadata {
  parser_version?: string;
  bulto_order?: BultoOrderEntry[];
  needs_review?: boolean;
  needs_review_flags?: { code: string; bultoId?: string; estilo?: string; detail: string }[];
  fallback_claude_usado?: boolean;
  [k: string]: unknown;
}

interface PLRow {
  id: string;
  numero_pl: string;
  empresa: string;
  fecha_entrega: string | null;
  total_bultos: number;
  total_piezas: number;
  total_estilos: number;
  parser_metadata: ParserMetadata | null;
  created_at: string;
}

interface PLItem {
  pl_id: string;
  estilo: string;
  producto: string;
  total_pcs: number;
  bultos: Record<string, number> | null;
  bulto_muestra: string | null;
  is_os: boolean | null;
}

interface AuditRow {
  pl_id: string;
  numero_pl: string;
  fecha: string;
  empresa: string;
  departamento: string; // no existe en DB, se deja vacío por compat con el formato pedido
  total_pdf: number;
  total_calculado: number;
  diferencia: number;
  bultos_sospechosos: string; // lista de bulto IDs cuyo total por item no cuadra
  parser_version: string;
  needs_review: string;     // "yes" | "no" | "" (no metadata)
  review_flags: string;     // codes agregados, pipe-separated
  invariantes_post: string; // chequeos post-facto que corremos sobre DB
  created_at: string;
}

function parseArgs() {
  const args = process.argv.slice(2);
  let label = "audit";
  for (const a of args) {
    const m = a.match(/^--label=(.+)$/);
    if (m) label = m[1];
  }
  return { label };
}

function timestamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function escapeCsv(v: string | number): string {
  const s = String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

async function fetchAllPLs(): Promise<PLRow[]> {
  const pageSize = 1000;
  let from = 0;
  const rows: PLRow[] = [];
  while (true) {
    const { data, error } = await supabase
      .from("packing_lists")
      .select("id, numero_pl, empresa, fecha_entrega, total_bultos, total_piezas, total_estilos, parser_metadata, created_at")
      .order("created_at", { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    rows.push(...(data as PLRow[]));
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

async function fetchItemsByPl(plIds: string[]): Promise<Map<string, PLItem[]>> {
  const chunkSize = 500;
  const byPl = new Map<string, PLItem[]>();
  for (let i = 0; i < plIds.length; i += chunkSize) {
    const chunk = plIds.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from("pl_items")
      .select("pl_id, estilo, producto, total_pcs, bultos, bulto_muestra, is_os")
      .in("pl_id", chunk);
    if (error) throw error;
    for (const item of data ?? []) {
      const list = byPl.get(item.pl_id) ?? [];
      list.push(item as PLItem);
      byPl.set(item.pl_id, list);
    }
  }
  return byPl;
}

function computeAuditForPl(pl: PLRow, items: PLItem[]): AuditRow {
  const totalCalculado = items.reduce((s, it) => s + (it.total_pcs || 0), 0);
  const diferencia = pl.total_piezas - totalCalculado;

  const bultoIds = new Set<string>();
  for (const it of items) {
    if (it.bultos && typeof it.bultos === "object") {
      for (const bid of Object.keys(it.bultos)) bultoIds.add(bid);
    }
  }
  const bultos_sospechosos = diferencia !== 0
    ? Array.from(bultoIds).sort().join(";")
    : "";

  // ── Metadata escrita por el parser al guardar ────────────────────────
  const meta = pl.parser_metadata ?? {};
  const parser_version = (meta.parser_version as string) || "(legacy)";
  const saveTimeReview = meta.needs_review === true;
  const saveFlagCodes = Array.isArray(meta.needs_review_flags)
    ? [...new Set(meta.needs_review_flags.map(f => f.code))].join("|")
    : "";

  // ── Invariantes post-facto sobre DB (sin necesidad del PDF) ──────────
  // Reproducen lo que checkSaveTimeInvariants valida al guardar, con la
  // información disponible post-hoc. PLs guardados pre-2.1.0 no tienen
  // parser_metadata.bulto_order ni needs_review, así que estos chequeos
  // son la única señal retroactiva.
  const postChecks: string[] = [];
  // a) Suma distribución por SKU === total_pcs (ya se trackea via diferencia
  //    global, pero lo hacemos granular por SKU).
  for (const it of items) {
    if (!it.bultos) continue;
    const distSum = Object.values(it.bultos).reduce((s, n) => s + (n || 0), 0);
    if (distSum !== (it.total_pcs || 0)) {
      postChecks.push(`sku_dist(${it.estilo})`);
      break; // 1 ejemplo basta para flaguear el PL
    }
  }
  // c) Muestra consistente: si hay bulto_muestra != null y no is_os, ese
  //    bulto debe aparecer en pl_items.bultos del mismo SKU (el SKU tiene
  //    que estar ahí). No podemos validar M>0/32>0 retro sin el PDF.
  for (const it of items) {
    if (!it.bulto_muestra) continue;
    if (it.is_os) continue;
    if (!it.bultos || !(it.bulto_muestra in it.bultos)) {
      postChecks.push(`muestra_orfana(${it.estilo})`);
      break;
    }
  }
  // d) Orden: si hay parser_metadata.bulto_order, debe cubrir todos los
  //    bulto IDs que aparecen en la distribución.
  if (Array.isArray(meta.bulto_order)) {
    const orderIds = new Set(meta.bulto_order.map(e => e.id));
    for (const bid of bultoIds) {
      if (!orderIds.has(bid)) {
        postChecks.push(`order_gap(${bid})`);
        break;
      }
    }
  } else if (parser_version !== "(legacy)" && parser_version >= "2.1.0") {
    // Post-2.1.0 SIN bulto_order: anomalía.
    postChecks.push("order_missing");
  }

  const hasPostFail = postChecks.length > 0;
  const needsReview = saveTimeReview || hasPostFail || diferencia !== 0;

  return {
    pl_id: pl.id,
    numero_pl: pl.numero_pl,
    fecha: pl.fecha_entrega ?? "",
    empresa: pl.empresa ?? "",
    departamento: "",
    total_pdf: pl.total_piezas,
    total_calculado: totalCalculado,
    diferencia,
    bultos_sospechosos,
    parser_version,
    needs_review: needsReview ? "yes" : "no",
    review_flags: saveFlagCodes,
    invariantes_post: postChecks.join(";"),
    created_at: pl.created_at,
  };
}

function writeCsv(rows: AuditRow[], path: string) {
  const header = [
    "pl_id",
    "numero_pl",
    "fecha",
    "empresa",
    "departamento",
    "total_pdf",
    "total_calculado",
    "diferencia",
    "bultos_sospechosos",
    "parser_version",
    "needs_review",
    "review_flags",
    "invariantes_post",
    "created_at",
  ].join(",");
  const body = rows.map(r => [
    r.pl_id, r.numero_pl, r.fecha, r.empresa, r.departamento,
    r.total_pdf, r.total_calculado, r.diferencia, r.bultos_sospechosos,
    r.parser_version, r.needs_review, r.review_flags, r.invariantes_post,
    r.created_at,
  ].map(escapeCsv).join(",")).join("\n");
  writeFileSync(path, header + "\n" + body + "\n", "utf-8");
}

function writeSummary(mismatches: AuditRow[], allCount: number, path: string) {
  const byEmpresa = new Map<string, AuditRow[]>();
  const byMonth = new Map<string, AuditRow[]>();
  for (const r of mismatches) {
    const em = r.empresa || "(sin empresa)";
    const list = byEmpresa.get(em) ?? [];
    list.push(r);
    byEmpresa.set(em, list);

    const month = (r.fecha || r.created_at).slice(0, 7) || "(sin fecha)";
    const list2 = byMonth.get(month) ?? [];
    list2.push(r);
    byMonth.set(month, list2);
  }

  const lines: string[] = [];
  lines.push(`Auditoría Packing Lists — Resumen`);
  lines.push(`Total PLs: ${allCount}`);
  lines.push(`PLs con diferencia: ${mismatches.length}`);
  const totalDiff = mismatches.reduce((s, r) => s + Math.abs(r.diferencia), 0);
  const avgDiff = mismatches.length > 0 ? (totalDiff / mismatches.length) : 0;
  lines.push(`Diferencia promedio (absoluta): ${avgDiff.toFixed(2)} piezas`);
  lines.push("");
  lines.push("Por empresa:");
  for (const [em, list] of [...byEmpresa.entries()].sort((a, b) => b[1].length - a[1].length)) {
    const sum = list.reduce((s, r) => s + Math.abs(r.diferencia), 0);
    lines.push(`  ${em}: ${list.length} PLs | ${sum} piezas netas de diferencia`);
  }
  lines.push("");
  lines.push("Por mes (fecha de entrega o creación):");
  for (const [m, list] of [...byMonth.entries()].sort()) {
    const sum = list.reduce((s, r) => s + Math.abs(r.diferencia), 0);
    lines.push(`  ${m}: ${list.length} PLs | ${sum} piezas`);
  }
  lines.push("");
  lines.push("Peores 10 casos (por magnitud de diferencia):");
  const worst = [...mismatches].sort((a, b) => Math.abs(b.diferencia) - Math.abs(a.diferencia)).slice(0, 10);
  for (const r of worst) {
    lines.push(`  PL ${r.numero_pl} (${r.empresa}, fecha ${r.fecha}): PDF=${r.total_pdf}, calc=${r.total_calculado}, dif=${r.diferencia}`);
  }
  writeFileSync(path, lines.join("\n") + "\n", "utf-8");
}

async function main() {
  const { label } = parseArgs();
  const outDir = resolve(repoRoot, "scripts", "output");
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  const ts = timestamp();
  const csvPath = resolve(outDir, `pl-audit-${label}-${ts}.csv`);
  const summaryPath = resolve(outDir, `pl-audit-summary-${label}-${ts}.txt`);

  console.log(`[audit] fetching packing_lists…`);
  const pls = await fetchAllPLs();
  console.log(`[audit] ${pls.length} PLs en total`);

  console.log(`[audit] fetching pl_items…`);
  const itemsByPl = await fetchItemsByPl(pls.map(p => p.id));

  const rows: AuditRow[] = [];
  for (const pl of pls) {
    const items = itemsByPl.get(pl.id) ?? [];
    rows.push(computeAuditForPl(pl, items));
  }

  const mismatches = rows.filter(r => r.diferencia !== 0);
  const needsReview = rows.filter(r => r.needs_review === "yes");
  rows.sort((a, b) => Math.abs(b.diferencia) - Math.abs(a.diferencia));
  writeCsv(rows, csvPath);
  console.log(`[audit] CSV → ${csvPath}`);

  if (mismatches.length > 50) {
    writeSummary(mismatches, pls.length, summaryPath);
    console.log(`[audit] Summary → ${summaryPath}`);
  } else if (mismatches.length > 0) {
    writeSummary(mismatches, pls.length, summaryPath);
    console.log(`[audit] Summary (opcional, escrito igual) → ${summaryPath}`);
  }

  // Stats verbales
  const totalDiff = mismatches.reduce((s, r) => s + Math.abs(r.diferencia), 0);
  const avg = mismatches.length > 0 ? (totalDiff / mismatches.length).toFixed(2) : "0";
  console.log("");
  console.log(`== Resumen ${label} ==`);
  console.log(`Total PLs:          ${pls.length}`);
  console.log(`Con diferencia:     ${mismatches.length}`);
  console.log(`Necesitan revisión: ${needsReview.length} (flags al guardar o invariantes post)`);
  console.log(`Magnitud promedio:  ${avg} piezas (|dif|)`);
  console.log(`Magnitud total:     ${totalDiff} piezas (|dif| sumadas)`);
  console.log("");
  // Distribución por versión de parser
  const byVersion = new Map<string, number>();
  for (const r of rows) byVersion.set(r.parser_version, (byVersion.get(r.parser_version) || 0) + 1);
  console.log(`Por parser_version:`);
  for (const [v, n] of [...byVersion.entries()].sort()) console.log(`  ${v}: ${n} PLs`);
  console.log("");
  if (needsReview.length > 0) {
    console.log(`PLs flagged (primeros 10):`);
    for (const r of needsReview.slice(0, 10)) {
      const reasons = [r.review_flags, r.invariantes_post].filter(Boolean).join(" + ");
      console.log(`  ${r.numero_pl} (${r.empresa}, ${r.fecha}): ${reasons || "dif=" + r.diferencia}`);
    }
    console.log("");
  }
  console.log(`Peores 3 por diferencia:`);
  const worst3 = [...mismatches].sort((a, b) => Math.abs(b.diferencia) - Math.abs(a.diferencia)).slice(0, 3);
  for (const r of worst3) {
    console.log(`  ${r.numero_pl} (${r.empresa}, ${r.fecha}): PDF=${r.total_pdf}, calc=${r.total_calculado}, dif=${r.diferencia}`);
  }
}

main().catch(err => {
  console.error("[audit] error:", err);
  process.exit(1);
});

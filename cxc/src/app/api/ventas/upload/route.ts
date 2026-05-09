import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireAuth, getSession } from "@/lib/require-auth";
import { logActivity } from "@/lib/log-activity";
import { normalizeName } from "@/lib/normalize";
import * as XLSX from "xlsx-js-style";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ─── Types ────────────────────────────────────────────────────────────────────

interface RawRow {
  empresa: string;
  fecha: string;
  anio: number;
  mes: number;
  quarter: number;
  tipo: string;
  n_sistema: string;
  n_fiscal: string;
  vendedor: string;
  cliente: string;
  cliente_codigo: string | null;
  costo: number;
  descuento: number;
  subtotal: number;
  itbms: number;
  total: number;
  utilidad: number;
  pct_utilidad: number | null;
}

interface FilteredCounts {
  invalidTipo: number;   // no está en canonicalTipo() (excluye PEDIDO, COTIZACION, etc.)
  invalidDate: number;   // fecha no parseable
}

interface ParseResult {
  rows: RawRow[];
  filtered: FilteredCounts;
  warnings: string[];
  detectedFormat: "us_thousands" | "no_thousands";
}

// ─── Validation helpers ───────────────────────────────────────────────────────

const REQUIRED_HEADERS = ["FECHA", "TIPO", "VENDEDOR", "CLIENTE", "SUBTOTAL", "TOTAL"];

function validateHeaders(headers: string[]): void {
  const missing = REQUIRED_HEADERS.filter((h) => !headers.includes(h));
  // N.SISTEMA o N.INTERNO (cualquiera de los dos)
  if (!headers.includes("N.SISTEMA") && !headers.includes("N.INTERNO")) {
    missing.push("N.SISTEMA");
  }
  if (missing.length > 0) {
    throw new Error(
      `El archivo no tiene los encabezados requeridos. Faltan: ${missing.join(", ")}. Verifica que descargaste el reporte correcto en Switch Soft.`
    );
  }
  // Detectar formato reporte_v / Descargar Detalle (rechazar)
  const reporteVHeaders = ["CODIGO", "FACTURADO POR", "MODULO", "SALDO"];
  const matchedReporteV = reporteVHeaders.filter((h) => headers.includes(h));
  if (matchedReporteV.length === reporteVHeaders.length) {
    throw new Error(
      "Este archivo está en formato 'Descargar Detalle' o reporte_v. El sistema solo acepta el formato 'Descargar' / comprobantes (con columnas COSTO y UTILIDAD). Vuelve a descargar el reporte en Switch Soft con el botón correcto."
    );
  }
}

function buildHeaderWarnings(headers: string[]): string[] {
  const warnings: string[] = [];
  if (!headers.includes("COSTO") || !headers.includes("UTILIDAD")) {
    warnings.push("El archivo no contiene la columna COSTO/UTILIDAD. Esos campos quedarán en 0 para las filas insertadas.");
  }
  return warnings;
}

function detectThousandsFormat(samples: string[]): "us_thousands" | "no_thousands" {
  // Sample numeric cells; if >50% match /\d,\d{3}/ then us_thousands
  let total = 0;
  let withThousands = 0;
  for (const s of samples) {
    if (!s || s === "0") continue;
    const trimmed = s.trim();
    if (!/\d/.test(trimmed)) continue;
    total++;
    if (/\d,\d{3}/.test(trimmed)) withThousands++;
  }
  if (total === 0) return "no_thousands";
  return withThousands / total > 0.5 ? "us_thousands" : "no_thousands";
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Parse "DD-MM-YYYY HH:MM:SS" → ISO string.
 * Returns null if unparseable.
 */
function parseFecha(raw: string): string | null {
  const s = (raw ?? "").trim();
  // Expected: "DD-MM-YYYY HH:MM:SS"  or "DD-MM-YYYY"
  const match = s.match(/^(\d{2})-(\d{2})-(\d{4})(?:\s+(\d{2}):(\d{2}):(\d{2}))?/);
  if (!match) return null;
  const [, dd, mm, yyyy, hh = "00", mi = "00", ss = "00"] = match;
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}`;
}

function toNum(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0;
  if (typeof v === "number") return isNaN(v) ? 0 : v;
  const s = String(v).trim().replace(/,/g, "");
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

// Normaliza el tipo a su forma canónica para queries / dashboard.
// El nuevo `listacomprobantes` viene en MAYÚSCULAS sin diacríticos
// (FACTURA, TRANSACCION, TIQUETE, NOTA DE DEBITO, NOTA DE CREDITO).
// El viejo `comprobantes` venía con casing mixto (Factura, Transacción, etc.).
// Devuelve null si el tipo no está permitido (ej. PEDIDO, COTIZACION).
function canonicalTipo(raw: string): string | null {
  const t = (raw ?? "").trim().replace(/\s+/g, " ").toUpperCase();
  switch (t) {
    case "FACTURA":            return "Factura";
    case "TRANSACCION":
    case "TRANSACCIÓN":        return "Transacción";
    case "TIQUETE":            return "Tiquete";
    case "NOTA DE DEBITO":
    case "NOTA DE DÉBITO":     return "Nota de Débito";
    case "NOTA DE CREDITO":
    case "NOTA DE CRÉDITO":    return "Nota de Crédito";
    default:                   return null;
  }
}

// ─── CSV parser ───────────────────────────────────────────────────────────────

function parseCSV(text: string, empresa: string): ParseResult {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    throw new Error("No se encontraron filas válidas. Verifica que el archivo tenga datos.");
  }

  // Check if any line contains FECHA at all (regardless of delimiter)
  const hasFechaAnywhere = lines.some((l) => l.toUpperCase().includes("FECHA"));

  // Find the header line (must have FECHA and semicolon delimiter)
  const headerIdx = lines.findIndex((l) => l.toUpperCase().includes("FECHA") && l.includes(";"));
  if (headerIdx === -1) {
    if (hasFechaAnywhere) {
      // Has FECHA but no semicolons → wrong delimiter
      throw new Error("El archivo no tiene el formato esperado. Usa punto y coma (;) como separador.");
    }
    throw new Error("No se encontró la columna FECHA en el archivo. Verifica que el formato sea correcto.");
  }

  const headers = lines[headerIdx].split(";").map((h) => h.trim().replace(/\s+/g, " ").toUpperCase());
  validateHeaders(headers);
  const warnings = buildHeaderWarnings(headers);

  // Sample primeras 10 filas para detectar formato de número
  const subIdx = headers.indexOf("SUBTOTAL");
  const totIdx = headers.indexOf("TOTAL");
  const numSamples: string[] = [];
  for (let i = headerIdx + 1; i < Math.min(headerIdx + 11, lines.length); i++) {
    const cols = lines[i].split(";");
    if (subIdx >= 0 && cols[subIdx]) numSamples.push(cols[subIdx].trim());
    if (totIdx >= 0 && cols[totIdx]) numSamples.push(cols[totIdx].trim());
  }
  const detectedFormat = detectThousandsFormat(numSamples);

  const rows: RawRow[] = [];
  const filtered: FilteredCounts = { invalidTipo: 0, invalidDate: 0 };

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cols = lines[i].split(";");
    const get = (key: string) => cols[headers.indexOf(key)]?.trim() ?? "";

    // Filtrar SOLO por tipo y fecha (Sprint 1 Fase 3: sin filtro de subtotal).
    const tipo = canonicalTipo(get("TIPO"));
    if (!tipo) { filtered.invalidTipo++; continue; }

    const fechaRaw = get("FECHA");
    const fechaISO = parseFecha(fechaRaw);
    if (!fechaISO) { filtered.invalidDate++; continue; }

    const dateObj = new Date(fechaISO);
    const mes = dateObj.getMonth() + 1;
    const año = dateObj.getFullYear();
    const quarter = Math.ceil(mes / 3);

    // NOTA DE CREDITO: subtotal, total y costo siempre negativos.
    // (utilidad la mandamos como viene — el CSV de Switch ya la trae en negativo).
    const isNC = tipo === "Nota de Crédito";
    const subtotal = isNC ? -Math.abs(toNum(get("SUBTOTAL"))) : toNum(get("SUBTOTAL"));
    const total    = isNC ? -Math.abs(toNum(get("TOTAL")))    : toNum(get("TOTAL"));
    const costo    = isNC ? -Math.abs(toNum(get("COSTO")))    : toNum(get("COSTO"));

    // CODIGO viene en `listacomprobantes`. En el formato viejo no existe → null.
    const cliente_codigo = (() => { const v = get("CODIGO"); return v === "" ? null : v; })();

    // IMPUESTO en formato nuevo, ITBMS en formato viejo.
    const itbms = toNum(get("IMPUESTO") || get("ITBMS"));

    rows.push({
      empresa,
      fecha: fechaISO,
      anio: año,
      mes,
      quarter,
      tipo,
      n_sistema: get("N.SISTEMA") || get("N.INTERNO"),
      n_fiscal: get("N.FISCAL"),
      vendedor: get("VENDEDOR"),
      cliente: normalizeName(get("CLIENTE") || ""),
      cliente_codigo,
      costo,
      descuento: toNum(get("DESCUENTO")),
      subtotal,
      itbms,
      total,
      utilidad: toNum(get("UTILIDAD")),
      pct_utilidad: (() => { const v = Math.abs(toNum(get("% UTILIDAD") || get("%  UTILIDAD"))); return v > 999.99 ? null : v; })(),
    });
  }

  return { rows, filtered, warnings, detectedFormat };
}

// ─── Excel parser ─────────────────────────────────────────────────────────────

function parseExcel(buffer: ArrayBuffer, empresa: string): ParseResult {
  const wb = XLSX.read(buffer, { type: "array", cellDates: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  // Use raw: false so numbers are formatted strings; header:1 gives array-of-arrays
  const raw: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: "" });

  if (raw.length < 2) {
    throw new Error("No se encontraron filas válidas. Verifica que el archivo tenga datos.");
  }

  // Find header row
  const headerIdx = raw.findIndex(
    (row) => Array.isArray(row) && row.some((c) => String(c).toUpperCase() === "FECHA")
  );
  if (headerIdx === -1) {
    throw new Error("No se encontró la columna FECHA en el archivo. Verifica que el formato sea correcto.");
  }

  const headers = (raw[headerIdx] as string[]).map((h) => String(h).trim().replace(/\s+/g, " ").toUpperCase());
  validateHeaders(headers);
  const warnings = buildHeaderWarnings(headers);

  // Sample primeras 10 filas para detectar formato de número
  const subIdxX = headers.indexOf("SUBTOTAL");
  const totIdxX = headers.indexOf("TOTAL");
  const numSamples: string[] = [];
  for (let i = headerIdx + 1; i < Math.min(headerIdx + 11, raw.length); i++) {
    const cols = raw[i] as unknown[];
    if (subIdxX >= 0 && cols[subIdxX] !== undefined) numSamples.push(String(cols[subIdxX]).trim());
    if (totIdxX >= 0 && cols[totIdxX] !== undefined) numSamples.push(String(cols[totIdxX]).trim());
  }
  const detectedFormat = detectThousandsFormat(numSamples);

  const rows: RawRow[] = [];
  const filtered: FilteredCounts = { invalidTipo: 0, invalidDate: 0 };

  for (let i = headerIdx + 1; i < raw.length; i++) {
    const cols = raw[i] as unknown[];
    const get = (key: string): string => String(cols[headers.indexOf(key)] ?? "").trim();
    const getNum = (key: string): number => toNum(cols[headers.indexOf(key)]);

    const tipo = canonicalTipo(get("TIPO"));
    if (!tipo) { filtered.invalidTipo++; continue; }

    const fechaRaw = get("FECHA");
    const fechaISO = parseFecha(fechaRaw);
    if (!fechaISO) { filtered.invalidDate++; continue; }

    const dateObj = new Date(fechaISO);
    const mes = dateObj.getMonth() + 1;
    const año = dateObj.getFullYear();
    const quarter = Math.ceil(mes / 3);

    const pctKey = headers.find((h) => h.includes("UTILIDAD") && h.includes("%")) ?? "";
    const pctRaw = pctKey ? toNum(cols[headers.indexOf(pctKey)]) : 0;
    const pct_utilidad = Math.abs(pctRaw) > 999.99 ? null : Math.abs(pctRaw);

    // NOTA DE CREDITO: subtotal, total y costo siempre negativos.
    // (utilidad la mandamos como viene — el CSV de Switch ya la trae en negativo).
    const isNC = tipo === "Nota de Crédito";
    const subtotal = isNC ? -Math.abs(getNum("SUBTOTAL")) : getNum("SUBTOTAL");
    const total    = isNC ? -Math.abs(getNum("TOTAL"))    : getNum("TOTAL");
    const costo    = isNC ? -Math.abs(getNum("COSTO"))    : getNum("COSTO");

    const codigoRaw = get("CODIGO");
    const cliente_codigo = codigoRaw === "" ? null : codigoRaw;

    // IMPUESTO formato nuevo, ITBMS formato viejo
    const itbmsKey = headers.includes("IMPUESTO") ? "IMPUESTO" : "ITBMS";

    rows.push({
      empresa,
      fecha: fechaISO,
      anio: año,
      mes,
      quarter,
      tipo,
      n_sistema: get("N.SISTEMA") || get("N.INTERNO"),
      n_fiscal: get("N.FISCAL"),
      vendedor: get("VENDEDOR"),
      cliente: normalizeName(get("CLIENTE") || ""),
      cliente_codigo,
      costo,
      descuento: getNum("DESCUENTO"),
      subtotal,
      itbms: getNum(itbmsKey),
      total,
      utilidad: getNum("UTILIDAD"),
      pct_utilidad,
    });
  }

  return { rows, filtered, warnings, detectedFormat };
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const authError = requireAuth(req, ["admin", "secretaria"]);
  if (authError) return authError;

  const session = getSession(req);
  const uploadedBy = session?.userId || null;

  let empresa: string;
  let rows: RawRow[];
  let filtered: FilteredCounts;
  let warnings: string[] = [];
  let detectedFormat: "us_thousands" | "no_thousands" = "no_thousands";

  try {
    const form = await req.formData();
    empresa = (form.get("empresa") as string | null)?.trim() ?? "";
    const file = form.get("file") as File | null;

    if (!empresa) return NextResponse.json({ error: "empresa requerido" }, { status: 400 });
    if (!file) return NextResponse.json({ error: "file requerido" }, { status: 400 });

    // Security: limit file size to 10MB
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "Archivo demasiado grande (máx 10MB)" }, { status: 400 });
    }

    // Archive original file to Storage para audit trail (mismo patrón que CxC).
    // No bloqueante: si falla, log warning y seguimos procesando.
    // Path con timestamp HH-MM-SS para evitar pisar archivos previos del mismo día.
    try {
      const now = new Date();
      const today = now.toISOString().slice(0, 10);
      const time = now.toISOString().slice(11, 19).replace(/:/g, "-");
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const archivePath = `ventas-uploads/${empresa}/${today}_${time}_${safeName}`;
      const { error: archErr } = await supabaseServer.storage
        .from("backups")
        .upload(archivePath, file, { upsert: false });
      if (archErr) {
        console.warn("[ventas/upload] archive failed (non-blocking):", archErr.message);
      }
    } catch (archEx) {
      console.warn("[ventas/upload] archive exception (non-blocking):", archEx);
    }

    const fileName = file.name.toLowerCase();
    const isExcel = fileName.endsWith(".xlsx") || fileName.endsWith(".xls");

    if (isExcel) {
      const buffer = await file.arrayBuffer();
      ({ rows, filtered, warnings, detectedFormat } = parseExcel(buffer, empresa));
    } else {
      // Decode CSV: try UTF-8 first, fall back to latin-1 if replacement chars found
      const buffer = await file.arrayBuffer();
      let text = new TextDecoder("utf-8").decode(buffer);
      const hadEncodingIssue = text.includes("\uFFFD");
      if (hadEncodingIssue) {
        text = new TextDecoder("latin1").decode(buffer);
      }
      // If latin-1 fallback still has replacement chars, encoding is broken
      if (hadEncodingIssue && text.includes("\uFFFD")) {
        throw new Error("El archivo tiene caracteres especiales. Guárdalo como UTF-8 e intenta de nuevo.");
      }
      ({ rows, filtered, warnings, detectedFormat } = parseCSV(text, empresa));
    }
  } catch (err) {
    console.error("[ventas/upload] parse error", err);
    const message = err instanceof Error ? err.message : "Error al parsear el archivo. Verifica que el formato sea correcto.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  if (rows.length === 0) {
    return NextResponse.json({ error: "No se encontraron filas válidas en el archivo" }, { status: 400 });
  }

  // Dedup por (empresa, tipo, n_sistema, fecha) — last-write-wins.
  // Switch reusa N.INTERNO entre comprobantes de años distintos y entre tipos
  // distintos, así que la clave necesita tipo + fecha además de empresa+n_sistema.
  // Postgres rechaza ON CONFLICT con duplicados en el mismo statement (PG 21000).
  const dedupMap = new Map<string, RawRow>();
  for (const r of rows) {
    dedupMap.set(`${r.empresa}|${r.tipo}|${r.n_sistema}|${r.fecha}`, r);
  }
  const duplicatesRemoved = rows.length - dedupMap.size;
  rows = [...dedupMap.values()];

  // Match cliente_id por codigo contra clientes_master (Sprint 1 Fase 3).
  // Solo match exacto por codigo. Sin matching por nombre, sin transformaciones.
  const codigoToId = new Map<string, string>();
  {
    const { data: clientes, error: cErr } = await supabaseServer
      .from("clientes_master")
      .select("id, codigo")
      .eq("deleted", false);
    if (cErr) {
      console.error("[ventas/upload] error cargando clientes_master:", cErr.message);
      return NextResponse.json({ error: `No se pudo cargar clientes_master: ${cErr.message}` }, { status: 500 });
    }
    for (const c of clientes ?? []) {
      if (c.codigo) codigoToId.set(c.codigo, c.id);
    }
  }

  let matchedCount = 0;
  const unmatchedCodigos = new Map<string, number>();   // codigo → veces sin match
  let nullCodigoCount = 0;                              // filas sin CODIGO en CSV
  const rowsWithMatch = rows.map(r => {
    let cliente_id: string | null = null;
    if (!r.cliente_codigo) {
      nullCodigoCount++;
    } else {
      const id = codigoToId.get(r.cliente_codigo);
      if (id) {
        cliente_id = id;
        matchedCount++;
      } else {
        unmatchedCodigos.set(r.cliente_codigo, (unmatchedCodigos.get(r.cliente_codigo) ?? 0) + 1);
      }
    }
    return { ...r, cliente_id };
  });

  // Upsert en batches grandes — ON CONFLICT (n_sistema, empresa) DO UPDATE all fields
  const BATCH = 2000;
  let inserted = 0;
  let totalNeto = 0;
  for (let i = 0; i < rowsWithMatch.length; i += BATCH) {
    const batch = rowsWithMatch.slice(i, i + BATCH).map(r => ({ ...r, uploaded_by: uploadedBy }));
    for (const r of batch) totalNeto += r.total;
    const { error: upsErr } = await supabaseServer
      .from("ventas_raw")
      .upsert(batch, { onConflict: "empresa,tipo,n_sistema,fecha" });
    if (upsErr) {
      console.error("[ventas/upload] upsert FULL ERROR:", JSON.stringify(upsErr));
      return NextResponse.json({ error: `Error: ${upsErr.code} — ${upsErr.message}` }, { status: 500 });
    }
    inserted += batch.length;
  }

  // Top 20 codigos que no matchearon (para que Daniel valide)
  const unmatchedTop = [...unmatchedCodigos.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([codigo, count]) => ({ codigo, count }));

  await logActivity(session?.role || "unknown", "ventas_upload", "ventas", {
    empresa, rowCount: inserted, duplicatesRemoved, filtered, detectedFormat, warnings,
    matched: matchedCount, unmatched: rowsWithMatch.length - matchedCount - nullCodigoCount, nullCodigo: nullCodigoCount,
  }, session?.userName);

  return NextResponse.json({
    ok: true,
    count: inserted,
    duplicatesRemoved,
    filtered,
    warnings,
    detectedFormat,
    total_neto: Math.round(totalNeto * 100) / 100,
    matched: matchedCount,
    unmatched: rowsWithMatch.length - matchedCount - nullCodigoCount,
    null_codigo: nullCodigoCount,
    pct_unmatched: rowsWithMatch.length > 0
      ? Math.round(((rowsWithMatch.length - matchedCount) / rowsWithMatch.length) * 1000) / 10
      : 0,
    unmatched_codigos: unmatchedTop,
  });
}

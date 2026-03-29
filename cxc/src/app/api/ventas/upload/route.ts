import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireAuth } from "@/lib/require-auth";
import * as XLSX from "xlsx-js-style";

// ─── Types ────────────────────────────────────────────────────────────────────

interface RawRow {
  empresa: string;
  fecha: string; // ISO date string
  anio: number;
  mes: number;
  trimestre: number;
  tipo: string;
  sucursal: string;
  n_sistema: string;
  n_fiscal: string;
  vendedor: string;
  cliente: string;
  costo: number;
  descuento: number;
  subtotal: number;
  itbms: number;
  total: number;
  utilidad: number;
  pct_utilidad: number;
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
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(",", "."));
  return isNaN(n) ? 0 : n;
}

function normTipo(raw: string): string {
  return (raw ?? "").trim().replace(/\s+/g, " ");
}

const VALID_TIPOS = new Set(["Factura", "Nota de Crédito", "Nota de Débito"]);

// ─── CSV parser ───────────────────────────────────────────────────────────────

function parseCSV(text: string, empresa: string): RawRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  // Find the header line
  const headerIdx = lines.findIndex((l) => l.toUpperCase().includes("FECHA") && l.includes(";"));
  if (headerIdx === -1) return [];

  const headers = lines[headerIdx].split(";").map((h) => h.trim().toUpperCase());
  const rows: RawRow[] = [];

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cols = lines[i].split(";");
    const get = (key: string) => cols[headers.indexOf(key)]?.trim() ?? "";

    const subtotal = toNum(get("SUBTOTAL"));
    const utilidad = toNum(get("UTILIDAD"));
    if (subtotal === 0 && utilidad === 0) continue;

    const tipo = normTipo(get("TIPO"));
    if (!VALID_TIPOS.has(tipo)) continue;

    const fechaRaw = get("FECHA");
    const fechaISO = parseFecha(fechaRaw);
    if (!fechaISO) continue;

    const dateObj = new Date(fechaISO);
    const mes = dateObj.getMonth() + 1;
    const año = dateObj.getFullYear();
    const trimestre = Math.ceil(mes / 3);

    rows.push({
      empresa,
      fecha: fechaISO,
      anio: año,
      mes,
      trimestre,
      tipo,
      sucursal: get("SUCURSAL"),
      n_sistema: get("N.SISTEMA"),
      n_fiscal: get("N.FISCAL"),
      vendedor: get("VENDEDOR"),
      cliente: (get("CLIENTE") || "").replace(/\s+/g, " ").trim(),
      costo: toNum(get("COSTO")),
      descuento: toNum(get("DESCUENTO")),
      subtotal,
      itbms: toNum(get("ITBMS")),
      total: toNum(get("TOTAL")),
      utilidad,
      pct_utilidad: toNum(get("% UTILIDAD") || get("%  UTILIDAD") || get("% UTILIDAD")),
    });
  }

  return rows;
}

// ─── Excel parser ─────────────────────────────────────────────────────────────

function parseExcel(buffer: ArrayBuffer, empresa: string): RawRow[] {
  const wb = XLSX.read(buffer, { type: "array", cellDates: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  // Use raw: false so numbers are formatted strings; header:1 gives array-of-arrays
  const raw: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: "" });

  if (raw.length < 2) return [];

  // Find header row
  const headerIdx = raw.findIndex(
    (row) => Array.isArray(row) && row.some((c) => String(c).toUpperCase() === "FECHA")
  );
  if (headerIdx === -1) return [];

  const headers = (raw[headerIdx] as string[]).map((h) => String(h).trim().toUpperCase());
  const rows: RawRow[] = [];

  for (let i = headerIdx + 1; i < raw.length; i++) {
    const cols = raw[i] as unknown[];
    const get = (key: string): string => String(cols[headers.indexOf(key)] ?? "").trim();
    const getNum = (key: string): number => toNum(cols[headers.indexOf(key)]);

    const subtotal = getNum("SUBTOTAL");
    const utilidad = getNum("UTILIDAD");
    if (subtotal === 0 && utilidad === 0) continue;

    const tipo = normTipo(get("TIPO"));
    if (!VALID_TIPOS.has(tipo)) continue;

    const fechaRaw = get("FECHA");
    const fechaISO = parseFecha(fechaRaw);
    if (!fechaISO) continue;

    const dateObj = new Date(fechaISO);
    const mes = dateObj.getMonth() + 1;
    const año = dateObj.getFullYear();
    const trimestre = Math.ceil(mes / 3);

    // Try both possible column name variants for % UTILIDAD
    const pctKey = headers.find((h) => h.includes("UTILIDAD") && h.includes("%")) ?? "";
    const pct_utilidad = pctKey ? toNum(cols[headers.indexOf(pctKey)]) : 0;

    rows.push({
      empresa,
      fecha: fechaISO,
      anio: año,
      mes,
      trimestre,
      tipo,
      sucursal: get("SUCURSAL"),
      n_sistema: get("N.SISTEMA"),
      n_fiscal: get("N.FISCAL"),
      vendedor: get("VENDEDOR"),
      cliente: (get("CLIENTE") || "").replace(/\s+/g, " ").trim(),
      costo: getNum("COSTO"),
      descuento: getNum("DESCUENTO"),
      subtotal,
      itbms: getNum("ITBMS"),
      total: getNum("TOTAL"),
      utilidad,
      pct_utilidad,
    });
  }

  return rows;
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const authError = requireAuth(req, ["admin", "upload", "secretaria"]);
  if (authError) return authError;

  let empresa: string;
  let rows: RawRow[];

  try {
    const form = await req.formData();
    empresa = (form.get("empresa") as string | null)?.trim() ?? "";
    const file = form.get("file") as File | null;

    if (!empresa) return NextResponse.json({ error: "empresa requerido" }, { status: 400 });
    if (!file) return NextResponse.json({ error: "file requerido" }, { status: 400 });

    const fileName = file.name.toLowerCase();
    const isExcel = fileName.endsWith(".xlsx") || fileName.endsWith(".xls");

    if (isExcel) {
      const buffer = await file.arrayBuffer();
      rows = parseExcel(buffer, empresa);
    } else {
      // Assume CSV / text
      const text = await file.text();
      rows = parseCSV(text, empresa);
    }
  } catch (err) {
    console.error("[ventas/upload] parse error", err);
    return NextResponse.json({ error: "Error al parsear el archivo" }, { status: 400 });
  }

  if (rows.length === 0) {
    return NextResponse.json({ error: "No se encontraron filas válidas en el archivo" }, { status: 400 });
  }

  // Upsert in batches of 500 — duplicates (same n_sistema + empresa) are silently ignored
  const BATCH = 500;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const { error: upsErr } = await supabaseServer
      .from("ventas_raw")
      .upsert(batch, { onConflict: "n_sistema,empresa", ignoreDuplicates: true });
    if (upsErr) {
      console.error("[ventas/upload] upsert error", upsErr);
      return NextResponse.json({ error: "Error interno" }, { status: 500 });
    }
    inserted += batch.length;
  }

  return NextResponse.json({ ok: true, count: inserted });
}

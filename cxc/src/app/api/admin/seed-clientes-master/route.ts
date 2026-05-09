// ─────────────────────────────────────────────────────────────────────────────
// POST /api/admin/seed-clientes-master
//
// Endpoint TEMPORAL (Sprint 1) para repoblar clientes_master desde un export
// de Switch Soft (`listaclientes_*.csv`). Asume que la tabla está vacía
// (TRUNCATE corrido previamente, ver supabase/backups/sprint1-20260509/).
//
// Acepta UN CSV. Las 6 listas por compañía son idénticas en clientes; sólo
// se sube una (Vistana sirve de referencia).
//
// Mapping CSV → tabla:
//   CODIGO          → codigo            (NOT NULL UNIQUE; TCKCTA permitido)
//   NOMBRE          → nombre            (TCKCTA → "VENTAS LOCAL")
//   RAZON SOCIAL    → razon_social
//   IDENTIFICACION  → identificacion
//   DV              → dv
//   PROVINCIA       → provincia
//   CORREO          → email
//   TELEFONO        → telefono
//   CELULAR         → celular
//   (computado)     → nombre_normalized = N2(nombre)
//   (computado)     → last_synced_at    = now()
//
// Después del seed, correr el PASO 4 de migration.sql (re-link camisetas)
// — actualizado en sprint plan: ya no se ejecuta porque las FK de camisetas
//   resultaron ser huérfanas legacy.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireAuth } from "@/lib/require-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// N2: UPPER + remove [.,] + collapse whitespace (mismo algoritmo que cxc / ventas)
const N2 = (s: string | null | undefined): string =>
  (s ?? "").trim().toUpperCase().replace(/[.,]/g, "").replace(/\s+/g, " ").trim();

const cleanText = (s: string | null | undefined): string | null => {
  const v = (s ?? "").trim();
  return v === "" ? null : v;
};

interface ParsedCsv {
  headers: string[];
  rows: Record<string, string>[];
}

function parseCsv(text: string): ParsedCsv {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { headers: [], rows: [] };
  const headers = lines[0].split(";").map((h) => h.trim());
  const rows = lines.slice(1).map((line) => {
    const cols = line.split(";");
    const obj: Record<string, string> = {};
    for (let i = 0; i < headers.length; i++) obj[headers[i]] = (cols[i] ?? "").trim();
    return obj;
  });
  return { headers, rows };
}

interface SeedRow {
  codigo: string;
  nombre: string;
  nombre_normalized: string;
  razon_social: string | null;
  identificacion: string | null;
  dv: string | null;
  provincia: string | null;
  email: string | null;
  telefono: string | null;
  celular: string | null;
  notas: null;
  last_synced_at: string;
}

interface DupeWarning {
  codigo: string;
  nombre: string;
  reason: "codigo_repetido" | "nombre_repetido";
  primary_codigo?: string;
}

export async function POST(req: NextRequest) {
  const authError = requireAuth(req, ["admin"]);
  if (authError) return authError;

  // ── 1. Read multipart file ─────────────────────────────────────────────────
  let file: File | null = null;
  try {
    const form = await req.formData();
    file = form.get("file") as File | null;
  } catch {
    return NextResponse.json({ error: "No se pudo leer el formulario" }, { status: 400 });
  }
  if (!file) return NextResponse.json({ error: "Falta el archivo (campo 'file')" }, { status: 400 });
  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: "Archivo demasiado grande (máx 10MB)" }, { status: 400 });
  }

  // ── 2. Decode (latin1 con fallback UTF-8) ──────────────────────────────────
  const buffer = await file.arrayBuffer();
  let text = new TextDecoder("latin1").decode(buffer);
  // Si el archivo es UTF-8 puro, latin1 lo "lee" sin romperse pero los acentos
  // se ven mal. Detectar bytes UTF-8 multibyte: si encontramos secuencias UTF-8
  // válidas y al re-decode con utf-8 NO hay reemplazos, preferir utf-8.
  const utf8Try = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
  if (!utf8Try.includes("�") && /[áéíóúñÑÁÉÍÓÚ]/.test(utf8Try) && !/[áéíóúñÑÁÉÍÓÚ]/.test(text)) {
    text = utf8Try;
  }

  // ── 3. Parse CSV ───────────────────────────────────────────────────────────
  const { headers, rows } = parseCsv(text);
  const required = ["CODIGO", "NOMBRE"];
  const missing = required.filter((h) => !headers.includes(h));
  if (missing.length > 0) {
    return NextResponse.json(
      { error: `Headers faltantes: ${missing.join(", ")}`, headers_recibidos: headers },
      { status: 400 },
    );
  }

  // ── 4. Build payload ───────────────────────────────────────────────────────
  const payload: SeedRow[] = [];
  const dupes: DupeWarning[] = [];
  const seenCodigo = new Set<string>();
  const seenNorm = new Map<string, string>();
  const skippedSinCodigo: number[] = [];
  const now = new Date().toISOString();

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const codigo = cleanText(r["CODIGO"]);
    if (!codigo) { skippedSinCodigo.push(i + 2); continue; }

    if (seenCodigo.has(codigo)) {
      dupes.push({ codigo, nombre: r["NOMBRE"] ?? "", reason: "codigo_repetido" });
      continue;
    }
    seenCodigo.add(codigo);

    let nombre = cleanText(r["NOMBRE"]);
    if (codigo === "TCKCTA") nombre = "VENTAS LOCAL";
    if (!nombre) continue;

    const norm = N2(nombre);
    if (seenNorm.has(norm)) {
      dupes.push({ codigo, nombre, reason: "nombre_repetido", primary_codigo: seenNorm.get(norm) });
    } else {
      seenNorm.set(norm, codigo);
    }

    payload.push({
      codigo,
      nombre,
      nombre_normalized: norm,
      razon_social: cleanText(r["RAZON SOCIAL"]),
      identificacion: cleanText(r["IDENTIFICACION"]),
      dv: cleanText(r["DV"]),
      provincia: cleanText(r["PROVINCIA"]),
      email: cleanText(r["CORREO"]),
      telefono: cleanText(r["TELEFONO"]),
      celular: cleanText(r["CELULAR"]),
      notas: null,
      last_synced_at: now,
    });
  }

  if (payload.length === 0) {
    return NextResponse.json(
      { error: "El CSV no contiene filas válidas", rows_in_csv: rows.length, skippedSinCodigo },
      { status: 400 },
    );
  }

  // ── 5. Insert en batches de 500 ────────────────────────────────────────────
  const BATCH = 500;
  let inserted = 0;
  for (let i = 0; i < payload.length; i += BATCH) {
    const slice = payload.slice(i, i + BATCH);
    const { data, error } = await supabaseServer
      .from("clientes_master")
      .insert(slice)
      .select("id");
    if (error) {
      return NextResponse.json(
        {
          error: `Insert falló en batch [${i}..${i + slice.length}): ${error.message}`,
          inserted_before_error: inserted,
          hint: error.code === "23505" ? "Conflicto de UNIQUE — clientes_master no estaba vacía o el CSV tiene un codigo duplicado no detectado" : undefined,
        },
        { status: 500 },
      );
    }
    inserted += data?.length ?? 0;
  }

  // ── 6. Verificación final ──────────────────────────────────────────────────
  const { count } = await supabaseServer
    .from("clientes_master")
    .select("*", { count: "exact", head: true });

  return NextResponse.json({
    ok: true,
    inserted,
    total_in_db: count,
    rows_in_csv: rows.length,
    skipped_sin_codigo: skippedSinCodigo.length,
    dupes_count: dupes.length,
    dupes: dupes.slice(0, 20),
    sample: payload.slice(0, 3),
  });
}

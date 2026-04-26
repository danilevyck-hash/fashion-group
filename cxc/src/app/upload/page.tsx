"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import { supabase } from "@/lib/supabase";
import { ALL_COMPANIES } from "@/lib/companies";
import { normalizeName } from "@/lib/normalize";
import { resolveAlias } from "@/lib/aliases";
import Papa from "papaparse";
import * as XLSX from "xlsx-js-style";
import { useAuth } from "@/lib/hooks/useAuth";
import { logActivityClient } from "@/lib/logActivityClient";

// ── Empresas for the upload grid ──────────────────────────────────────────────

const UPLOAD_EMPRESAS = [
  { key: "vistana", name: "Vistana International", brand: "Calvin Klein" },
  { key: "fashion_wear", name: "Fashion Wear", brand: "Tommy Hilfiger Apparel" },
  { key: "fashion_shoes", name: "Fashion Shoes", brand: "Tommy Hilfiger Shoes" },
  { key: "active_shoes", name: "Active Shoes", brand: "Reebok Shoes" },
  { key: "active_wear", name: "Active Wear", brand: "Reebok Apparel" },
  { key: "joystep", name: "Joystep", brand: "Joystep" },
  { key: "confecciones_boston", name: "Confecciones Boston", brand: "Boston" },
  { key: "american_classic", name: "Multifashion", brand: "American Classics" },
] as const;

// ── Types ─────────────────────────────────────────────────────────────────────

interface UploadStatus { company_key: string; uploaded_at: string; row_count: number; }
interface VentasStatus { date: string; label: string; count?: number; }

interface CxcPreviewRow { values: string[]; errors: string[]; }
interface CxcPreview {
  companyKey: string; headers: string[]; rows: CxcPreviewRow[];
  validCount: number; errorCount: number; duplicateNames: Set<string>;
  bucketExceedsTotal: number;
  formatError: string; delimiter: string;
}

interface VentasPreviewRow {
  fecha: string; tipo: string; nSistema: string; nFiscal: string;
  cliente: string; subtotal: number; total: number; vendedor: string;
  errors: string[]; isDuplicate: boolean;
}
interface VentasPreview {
  empresaKey: string; empresaName: string; rows: VentasPreviewRow[];
  validCount: number; errorCount: number; duplicateCount: number;
  formatError: string; file: File;
}

const VALID_TIPOS = new Set(["Factura", "Nota de Crédito", "Nota de Débito"]);

// ── Inner component ─────────────────────────────────────────────────────────

function UploadPageInner() {
  const { authChecked, role } = useAuth({ moduleKey: "upload", allowedRoles: ["admin", "secretaria"] });
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get("tab") === "ventas" ? "ventas" : "cxc") as "cxc" | "ventas";

  const fromVentas = searchParams.get("from") === "ventas";
  const [activeTab, setActiveTab] = useState<"cxc" | "ventas">(initialTab);
  const [dragOver, setDragOver] = useState<string | null>(null);

  // CXC state
  const [cxcUploads, setCxcUploads] = useState<Record<string, UploadStatus>>({});
  const [uploading, setUploading] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; type: "ok" | "err" } | null>(null);
  const [cxcPreview, setCxcPreview] = useState<CxcPreview | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);

  // Ventas state
  const [ventasUploads, setVentasUploads] = useState<Record<string, VentasStatus>>({});
  const [ventasUploading, setVentasUploading] = useState<string | null>(null);
  const [ventasPreview, setVentasPreview] = useState<VentasPreview | null>(null);
  const [ventasPreviewLoading, setVentasPreviewLoading] = useState(false);

  // CXC verification summary
  const [cxcSummary, setCxcSummary] = useState<{ key: string; top5: { nombre: string; total: number }[]; totalCartera: number } | null>(null);
  const [cxcSummaryLoading, setCxcSummaryLoading] = useState<string | null>(null);

  const cxcFileRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const ventasFileRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const cxcCompanies = ALL_COMPANIES;

  useEffect(() => { if (authChecked) { loadCxcUploads(); loadVentasStatus(); } }, [authChecked]);

  if (!authChecked) return null;

  // ── Shared helpers ──────────────────────────────────────────────────────────

  function parseNum(val: string | undefined): number {
    if (!val) return 0;
    const cleaned = val.replace(/,/g, "").replace(/\s/g, "");
    const n = parseFloat(cleaned);
    return isNaN(n) ? 0 : n;
  }

  async function readFileAsText(file: File): Promise<string> {
    if (file.name.endsWith(".xlsx") || file.name.endsWith(".xls")) {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      return XLSX.utils.sheet_to_csv(sheet, { FS: ";" });
    }
    // Try UTF-8 first, fall back to latin-1 if replacement chars found
    const buffer = await file.arrayBuffer();
    let text = new TextDecoder("utf-8").decode(buffer);
    if (text.includes("\uFFFD")) {
      text = new TextDecoder("latin1").decode(buffer);
    }
    return text;
  }

  function detectDelimiter(text: string): string {
    const firstLine = text.split("\n")[0] || "";
    const semicolons = (firstLine.match(/;/g) || []).length;
    const commas = (firstLine.match(/,/g) || []).length;
    return semicolons >= commas ? ";" : ",";
  }

  // ── CXC logic ─────────────────────────────────────────────────────────────

  async function loadCxcUploads() {
    const { data } = await supabase.from("cxc_uploads").select("*").order("uploaded_at", { ascending: false });
    if (data) {
      const latest: Record<string, UploadStatus> = {};
      for (const row of data) {
        if (!latest[row.company_key]) {
          latest[row.company_key] = { company_key: row.company_key, uploaded_at: row.uploaded_at, row_count: row.row_count };
        }
      }
      setCxcUploads(latest);
    }
  }

  async function loadCxcSummary(companyKey: string) {
    if (cxcSummary?.key === companyKey) { setCxcSummary(null); return; }
    setCxcSummaryLoading(companyKey);
    try {
      const { data: top5 } = await supabase.from("cxc_rows").select("nombre, total").eq("company_key", companyKey).order("total", { ascending: false }).limit(5);
      const { data: totalData } = await supabase.from("cxc_rows").select("total").eq("company_key", companyKey);
      const totalCartera = (totalData || []).reduce((s, r) => s + (Number(r.total) || 0), 0);
      setCxcSummary({ key: companyKey, top5: (top5 || []).map(r => ({ nombre: r.nombre, total: Number(r.total) || 0 })), totalCartera });
    } catch { setCxcSummary(null); }
    setCxcSummaryLoading(null);
  }

  function buildCxcPreview(text: string, companyKey: string): CxcPreview {
    const lines = text.split("\n").filter((l) => l.trim());
    if (lines.length < 2) {
      return { companyKey, headers: [], rows: [], validCount: 0, errorCount: 0, duplicateNames: new Set(), bucketExceedsTotal: 0, formatError: "El archivo esta vacio.", delimiter: ";" };
    }

    const delimiter = detectDelimiter(text);
    const headers = lines[0].split(delimiter).map((h) => h.trim());
    const required = ["CODIGO", "NOMBRE", "TOTAL"];
    const missing = required.filter((r) => !headers.some((h) => h.toUpperCase().includes(r)));
    if (missing.length > 0) {
      return { companyKey, headers, rows: [], validCount: 0, errorCount: 0, duplicateNames: new Set(), bucketExceedsTotal: 0, formatError: `Faltan columnas: ${missing.join(", ")}. Verifica que sea el reporte CxC separado por '${delimiter}'.`, delimiter };
    }

    const nombreIdx = headers.findIndex((h) => h.toUpperCase().includes("NOMBRE"));
    const totalIdx = headers.findIndex((h) => h.toUpperCase().includes("TOTAL"));
    const codigoIdx = headers.findIndex((h) => h.toUpperCase().includes("CODIGO"));

    // Bucket column indices for sum validation
    const bucketPatterns = ["0-30", "31-60", "61-90", "91-120", "121-180", "181-270", "271-365", "Mas de 365"];
    const bucketIdxs = bucketPatterns.map((p) => headers.findIndex((h) => h.trim() === p || h.trim().toUpperCase() === p.toUpperCase())).filter((i) => i >= 0);

    // Count name occurrences for duplicate detection
    const nameCounts: Record<string, number> = {};
    const dataLines = lines.slice(1);
    for (const line of dataLines) {
      const vals = line.split(delimiter).map((v) => v.trim());
      const nombre = (vals[nombreIdx] || "").trim();
      if (nombre && !/^\d[\d.,\s-]*$/.test(nombre) && !/^\d+-\d+$/.test(nombre) && !/^Mas\s+de/i.test(nombre) && !/^Total$/i.test(nombre)) {
        const norm = nombre.toUpperCase();
        nameCounts[norm] = (nameCounts[norm] || 0) + 1;
      }
    }
    const duplicateNames = new Set(Object.entries(nameCounts).filter(([, c]) => c > 1).map(([n]) => n));

    let validCount = 0;
    let errorCount = 0;
    let bucketExceedsTotal = 0;
    const rows: CxcPreviewRow[] = [];

    for (const line of dataLines) {
      const values = line.split(delimiter).map((v) => v.trim());
      const nombre = (values[nombreIdx] || "").trim();

      // Skip junk rows
      if (!nombre) continue;
      if (/^\d[\d.,\s-]*$/.test(nombre)) continue;
      if (/^\d+-\d+$/.test(nombre)) continue;
      if (/^Mas\s+de/i.test(nombre)) continue;
      if (/^Total$/i.test(nombre)) continue;

      const errors: string[] = [];
      if (codigoIdx >= 0 && !(values[codigoIdx] || "").trim()) errors.push("CODIGO vacio");
      const totalVal = parseNum(values[totalIdx]);
      if (totalIdx >= 0 && totalVal < 0) errors.push("TOTAL negativo");
      if (totalIdx >= 0 && totalVal === 0 && !(values[totalIdx] || "").trim()) errors.push("TOTAL vacio");
      if (duplicateNames.has(nombre.toUpperCase())) errors.push("Nombre duplicado");

      // Check if sum of aging buckets exceeds TOTAL
      if (totalIdx >= 0 && bucketIdxs.length > 0) {
        const bucketSum = bucketIdxs.reduce((sum, idx) => sum + parseNum(values[idx]), 0);
        if (bucketSum > totalVal + 0.01) {
          errors.push("Suma de buckets excede TOTAL");
          bucketExceedsTotal++;
        }
      }

      if (errors.length > 0) errorCount++;
      else validCount++;

      rows.push({ values, errors });
    }

    return { companyKey, headers, rows, validCount, errorCount, duplicateNames, bucketExceedsTotal, formatError: "", delimiter };
  }

  async function openCxcPreview(companyKey: string, file: File) {
    const text = await readFileAsText(file);
    const preview = buildCxcPreview(text, companyKey);
    setCxcPreview(preview);
    setPendingFile(file);
  }

  async function handleCxcUpload() {
    if (!cxcPreview || !pendingFile) return;
    const companyKey = cxcPreview.companyKey;
    const theFile = pendingFile;
    setCxcPreview(null);
    setPendingFile(null);
    setUploading(companyKey);
    setMessage(null);

    try {
      // Lock check
      const twoMinAgo = new Date(Date.now() - 120_000).toISOString();
      const { data: recentUploads } = await supabase.from("cxc_uploads").select("id").eq("company_key", companyKey).gte("uploaded_at", twoMinAgo).limit(1);
      if (recentUploads && recentUploads.length > 0) {
        throw new Error("Ya hay un upload reciente para esta empresa. Espera 2 minutos e intenta de nuevo.");
      }

      // Archive original file in Supabase Storage for audit trail
      const today = new Date().toISOString().slice(0, 10);
      const safeName = theFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const archivePath = `cxc-uploads/${companyKey}/${today}_${safeName}`;
      await supabase.storage.from("backups").upload(archivePath, theFile, { upsert: true });

      const text = await readFileAsText(theFile);
      const delimiter = detectDelimiter(text);
      const parsed = Papa.parse(text, { delimiter, header: true, skipEmptyLines: true });

      if (parsed.errors.length > 0 && parsed.data.length === 0) {
        throw new Error("Error al parsear CSV: " + parsed.errors[0].message);
      }

      const rows = (parsed.data as Record<string, string>[])
        .map((row) => {
          const clean: Record<string, string> = {};
          for (const [key, val] of Object.entries(row)) {
            clean[key.trim().replace(/\s+/g, " ")] = (val || "").trim();
          }
          return clean;
        })
        .filter((r) => {
          const nombre = (r["NOMBRE"] || "").trim();
          if (!nombre) return false;
          if (/^\d[\d.,\s-]*$/.test(nombre)) return false;
          if (/^\d+-\d+$/.test(nombre)) return false;
          if (/^Mas\s+de/i.test(nombre)) return false;
          if (/^Total$/i.test(nombre)) return false;
          return true;
        })
        .map((r) => ({
          codigo: r["CODIGO"] || "",
          nombre: r["NOMBRE"] || "",
          nombre_normalized: resolveAlias(normalizeName(r["NOMBRE"] || "")),
          correo: r["CORREO"] || "",
          telefono: r["TELEFONO"] || "",
          celular: r["CELULAR"] || "",
          contacto: r["CONTACTO"] || "",
          pais: r["PAIS"] || "",
          provincia: r["PROVINCIA"] || "",
          distrito: r["DISTRITO"] || "",
          corregimiento: r["CORREGIMIENTO"] || "",
          limite_credito: parseNum(r["LIMITE CREDITO"]),
          limite_morosidad: parseNum(r["LIMITE MOROSIDAD"]),
          d0_30: parseNum(r["0-30"]),
          d31_60: parseNum(r["31-60"]),
          d61_90: parseNum(r["61-90"]),
          d91_120: parseNum(r["91-120"]),
          d121_180: parseNum(r["121-180"]),
          d181_270: parseNum(r["181-270"]),
          d271_365: parseNum(r["271-365"]),
          mas_365: parseNum(r["Mas de 365"]),
          total: parseNum(r["TOTAL"]),
        }));

      setUploadProgress(`Subiendo ${rows.length.toLocaleString()} registros...`);
      const res = await fetch("/api/cxc/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyKey, filename: theFile.name, rows }),
      });
      setUploadProgress(null);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error al cargar");

      const insertedCount: number = json.count ?? 0;
      const prevCount = cxcUploads[companyKey]?.row_count;
      const companyName = cxcCompanies.find(c => c.key === companyKey)?.name || companyKey;
      const diff = prevCount != null ? (insertedCount - prevCount) : null;
      const diffText = diff != null && diff !== 0 ? ` (${diff > 0 ? "+" : ""}${diff} vs. carga anterior)` : "";
      setMessage({ text: `${companyName}: ${insertedCount.toLocaleString()} registros cargados correctamente${diffText}`, type: "ok" });
      loadCxcUploads();
    } catch (err: unknown) {
      setMessage({ text: err instanceof Error ? err.message : "Error desconocido", type: "err" });
    } finally {
      setUploading(null);
    }
  }

  // ── Ventas logic ──────────────────────────────────────────────────────────

  async function loadVentasStatus() {
    try {
      const res = await fetch("/api/ventas/v2/status");
      if (res.ok) setVentasUploads(await res.json());
    } catch { console.error('Failed to load ventas status'); }
  }

  function parseVentasFecha(raw: string): { valid: boolean; error: string } {
    const s = (raw ?? "").trim();
    const match = s.match(/^(\d{2})-(\d{2})-(\d{4})(?:\s+(\d{2}):(\d{2}):(\d{2}))?/);
    if (!match) return { valid: false, error: "Formato invalido" };
    const [, dd, mm, yyyy] = match;
    const day = parseInt(dd), month = parseInt(mm), year = parseInt(yyyy);
    if (month < 1 || month > 12) return { valid: false, error: `Mes ${mm} invalido` };
    const maxDay = new Date(year, month, 0).getDate();
    if (day < 1 || day > maxDay) return { valid: false, error: `Dia ${dd} invalido` };
    if (year < 2000 || year > 2099) return { valid: false, error: `Ano ${yyyy} fuera de rango` };
    return { valid: true, error: "" };
  }

  function toNum(v: unknown): number {
    if (v === null || v === undefined || v === "") return 0;
    const n = typeof v === "number" ? v : parseFloat(String(v).replace(",", "."));
    return isNaN(n) ? 0 : n;
  }

  async function openVentasPreview(empresaKey: string, empresaName: string, file: File) {
    setVentasPreviewLoading(true);
    try {
      const text = await readFileAsText(file);
      const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
      if (lines.length < 2) {
        setVentasPreview({ empresaKey, empresaName, rows: [], validCount: 0, errorCount: 0, duplicateCount: 0, formatError: "El archivo esta vacio.", file });
        return;
      }

      const delimiter = detectDelimiter(text);
      const headerIdx = lines.findIndex((l) => l.toUpperCase().includes("FECHA") && l.includes(delimiter));
      if (headerIdx === -1) {
        setVentasPreview({ empresaKey, empresaName, rows: [], validCount: 0, errorCount: 0, duplicateCount: 0, formatError: "No se encontro la fila de encabezados (debe contener FECHA).", file });
        return;
      }

      const headers = lines[headerIdx].split(delimiter).map((h) => h.trim().toUpperCase());
      const getIdx = (key: string) => headers.indexOf(key);

      const parsedRows: VentasPreviewRow[] = [];
      const nSistemas: string[] = [];

      for (let i = headerIdx + 1; i < lines.length; i++) {
        const cols = lines[i].split(delimiter);
        const get = (key: string) => (cols[getIdx(key)] ?? "").trim();

        const subtotal = toNum(get("SUBTOTAL"));
        const utilidad = toNum(get("UTILIDAD"));
        if (subtotal === 0 && utilidad === 0) continue;
        if (Math.abs(subtotal) < 1.00) continue;

        const tipo = (get("TIPO") || "").trim().replace(/\s+/g, " ");
        if (!VALID_TIPOS.has(tipo)) continue;

        const fechaRaw = get("FECHA");
        const fechaResult = parseVentasFecha(fechaRaw);
        const nSistema = get("N.SISTEMA");
        const errors: string[] = [];

        if (!fechaResult.valid) errors.push(fechaResult.error);
        if (!nSistema) errors.push("N.SISTEMA vacio");
        if (!get("CLIENTE")) errors.push("CLIENTE vacio");

        nSistemas.push(nSistema);
        parsedRows.push({
          fecha: fechaRaw, tipo, nSistema, nFiscal: get("N.FISCAL"),
          cliente: get("CLIENTE"), subtotal, total: toNum(get("TOTAL")),
          vendedor: get("VENDEDOR"), errors, isDuplicate: false,
        });
      }

      if (parsedRows.length === 0) {
        setVentasPreview({ empresaKey, empresaName, rows: [], validCount: 0, errorCount: 0, duplicateCount: 0, formatError: "No se encontraron filas validas (Factura, Nota de Crédito o Nota de Débito con subtotal mayor a $1).", file });
        return;
      }

      // Check duplicates against DB
      let existingSet = new Set<string>();
      try {
        const res = await fetch("/api/ventas/check-duplicates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ empresa: empresaKey, n_sistemas: nSistemas.filter(Boolean) }),
        });
        if (res.ok) {
          const { existing } = await res.json();
          existingSet = new Set(existing);
        }
      } catch { console.error('Duplicate check failed'); }

      let validCount = 0, errorCount = 0, duplicateCount = 0;
      for (const row of parsedRows) {
        if (row.nSistema && existingSet.has(row.nSistema)) {
          row.isDuplicate = true;
          duplicateCount++;
        }
        if (row.errors.length > 0) errorCount++;
        else if (!row.isDuplicate) validCount++;
      }

      setVentasPreview({ empresaKey, empresaName, rows: parsedRows, validCount, errorCount, duplicateCount, formatError: "", file });
    } catch (err) {
      setVentasPreview({ empresaKey, empresaName, rows: [], validCount: 0, errorCount: 0, duplicateCount: 0, formatError: err instanceof Error ? err.message : "Error al parsear", file });
    } finally {
      setVentasPreviewLoading(false);
    }
  }

  async function handleVentasUpload() {
    if (!ventasPreview) return;
    const { empresaKey, empresaName, file } = ventasPreview;
    setVentasPreview(null);
    setVentasUploading(empresaName);
    setMessage(null);
    try {
      const form = new FormData();
      form.append("empresa", empresaKey);
      form.append("file", file);
      const res = await fetch("/api/ventas/upload", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error al cargar");
      const filtered = json.filtered as { zeroSubtotal: number; subtotalLow: number; invalidTipo: number; invalidDate: number } | undefined;
      const totalDescartadas = filtered ? filtered.zeroSubtotal + filtered.subtotalLow + filtered.invalidTipo + filtered.invalidDate : 0;
      let mensaje = `${file.name}: ${json.count} registros cargados para ${empresaName}`;
      if (totalDescartadas > 0 && filtered) {
        const breakdown: string[] = [];
        if (filtered.subtotalLow > 0) breakdown.push(`${filtered.subtotalLow} subtotal bajo`);
        if (filtered.zeroSubtotal > 0) breakdown.push(`${filtered.zeroSubtotal} en cero`);
        if (filtered.invalidTipo > 0) breakdown.push(`${filtered.invalidTipo} tipo inválido`);
        if (filtered.invalidDate > 0) breakdown.push(`${filtered.invalidDate} fecha inválida`);
        mensaje += `, ${totalDescartadas} descartadas (${breakdown.join(", ")})`;
      }
      setMessage({ text: mensaje, type: "ok" });
      await loadVentasStatus();
    } catch (err: unknown) {
      setMessage({ text: err instanceof Error ? err.message : "Error desconocido", type: "err" });
    } finally {
      setVentasUploading(null);
    }
  }

  // ── Status indicator ──────────────────────────────────────────────────────

  // Formatea timestamp ISO a "DD-mmm-YYYY" en TZ Panama (sin shifts UTC)
  function fmtFechaCorta(iso: string | null | undefined): string {
    if (!iso) return "Sin datos";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "Sin datos";
    const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
    // en-CA con TZ Panama da "YYYY-MM-DD"
    const ymd = new Intl.DateTimeFormat("en-CA", {
      year: "numeric", month: "2-digit", day: "2-digit", timeZone: "America/Panama",
    }).format(d);
    const [yyyy, mm, dd] = ymd.split("-");
    const idx = parseInt(mm, 10) - 1;
    if (!yyyy || !dd || idx < 0 || idx > 11) return "Sin datos";
    return `${dd}-${MESES[idx]}-${yyyy}`;
  }

  function getStatusIndicator(key: string, type: "cxc" | "ventas") {
    if (type === "cxc") {
      const up = cxcUploads[key];
      if (!up) return <div className="flex items-center gap-1.5 text-xs text-gray-400"><span className="opacity-50">&#9898;</span> Sin datos</div>;
      const days = (Date.now() - new Date(up.uploaded_at).getTime()) / 86400000;
      const detail = fmtFechaCorta(up.uploaded_at);
      if (days > 14) return <div className="flex items-center gap-1.5 text-xs text-red-600"><span>&#128308;</span> Atrasado &middot; {detail}</div>;
      if (days > 7) return <div className="flex items-center gap-1.5 text-xs text-amber-600"><span>&#9888;&#65039;</span> Pendiente &middot; {detail}</div>;
      return <div className="flex items-center gap-1.5 text-xs text-green-600"><span>&#9989;</span> Al dia &middot; {detail}</div>;
    } else {
      const up = ventasUploads[key] ?? ventasUploads[UPLOAD_EMPRESAS.find(e => e.key === key)?.name ?? ""];
      if (!up) return <div className="flex items-center gap-1.5 text-xs text-gray-400"><span className="opacity-50">&#9898;</span> Sin datos</div>;
      const days = (Date.now() - new Date(up.date).getTime()) / 86400000;
      const thresholds = { warn: 30, alert: 60 };
      const detail = `${up.label}${up.count ? ` · ${up.count.toLocaleString()} reg.` : ""}`;
      if (days > thresholds.alert) return <div className="flex items-center gap-1.5 text-xs text-red-600"><span>&#128308;</span> Atrasado &middot; {detail}</div>;
      if (days > thresholds.warn) return <div className="flex items-center gap-1.5 text-xs text-amber-600"><span>&#9888;&#65039;</span> Pendiente &middot; {detail}</div>;
      return <div className="flex items-center gap-1.5 text-xs text-green-600"><span>&#9989;</span> Al dia &middot; {detail}</div>;
    }
  }

  // ── Preview Modal (shared) ────────────────────────────────────────────────

  function PreviewOverlay({ title, subtitle, badge, formatError, summary, headerRow, bodyRows, onConfirm, onCancel, confirmDisabled, confirmLabel, warning }: {
    title: string; subtitle: string; badge: { ok: boolean; label: string };
    formatError: string; summary: React.ReactNode;
    headerRow: string[]; bodyRows: { cells: string[]; hasError: boolean; tooltip: string }[];
    onConfirm: () => void; onCancel: () => void; confirmDisabled: boolean; confirmLabel: string;
    warning?: React.ReactNode;
  }) {
    const displayRows = bodyRows.slice(0, 100);
    const hasMore = bodyRows.length > 100;
    return (
      <div className="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-2 sm:p-4">
        <div className="bg-white rounded-lg w-full max-w-full sm:max-w-[950px] max-h-[90vh] sm:max-h-[85vh] flex flex-col">
          {/* Header */}
          <div className="px-4 sm:px-6 pt-4 sm:pt-5 pb-3 sm:pb-4 border-b border-gray-200 flex-shrink-0">
            <div className="hidden sm:flex items-center gap-2 mb-3 text-xs text-gray-400">
              <span className="w-5 h-5 rounded-full bg-gray-200 text-gray-500 flex items-center justify-center text-[10px] font-medium"><svg width="10" height="10" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg></span>
              <span>Archivo seleccionado</span>
              <div className="w-4 h-px bg-gray-300" />
              <span className="w-5 h-5 rounded-full bg-black text-white flex items-center justify-center text-[10px] font-bold">2</span>
              <span className="text-black font-medium">Revisa los datos</span>
              <div className="w-4 h-px bg-gray-200" />
              <span className="w-5 h-5 rounded-full bg-gray-100 text-gray-400 flex items-center justify-center text-[10px] font-medium">3</span>
              <span>Confirmar</span>
            </div>
            {/* Mobile: stepper compacto */}
            <p className="sm:hidden text-[10px] uppercase tracking-wider text-gray-400 mb-2">Paso 2 de 3 · Revisa los datos</p>
            <div className="flex justify-between items-start">
              <div>
                <p className="font-semibold text-[15px]">{title}</p>
                <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>
              </div>
              <span className={`px-3 py-1 rounded-full text-xs font-medium flex-shrink-0 ${badge.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
                {badge.label}
              </span>
            </div>
            {formatError && (
              <div className="mt-3 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">{formatError}</div>
            )}
            {!formatError && summary && <div className="mt-3">{summary}</div>}
          </div>

          {/* Scrollable data — tabla en desktop, cards en mobile */}
          {bodyRows.length > 0 && (
            <div className="flex-1 overflow-auto min-h-0">
              {/* Mobile: lista de cards por fila */}
              <div className="sm:hidden divide-y divide-gray-100">
                {displayRows.map((row, ri) => (
                  <div
                    key={ri}
                    className={`px-3 py-2.5 ${row.hasError ? "bg-red-50/60" : ri % 2 === 0 ? "bg-white" : "bg-gray-50/30"}`}
                    title={row.tooltip}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-[10px] text-gray-300 tabular-nums">#{ri + 1}</span>
                      <span className={`text-xs font-semibold truncate ${row.hasError ? "text-red-700" : "text-gray-800"}`}>
                        {row.cells[0] || "—"}
                      </span>
                    </div>
                    {row.cells.slice(1).map((c, ci) => {
                      if (!c) return null;
                      const label = headerRow[ci + 1] || "";
                      return (
                        <div key={ci} className="flex items-start justify-between gap-2 text-[11px]">
                          <span className="text-gray-400 uppercase tracking-wider text-[9px] shrink-0 mt-0.5">{label}</span>
                          <span className={`text-right break-words ${row.hasError ? "text-red-700" : "text-gray-700"}`}>{c}</span>
                        </div>
                      );
                    })}
                  </div>
                ))}
                {hasMore && (
                  <div className="py-3 text-center text-xs text-gray-500 bg-amber-50">
                    Mostrando 100 de {bodyRows.length} filas. Las demás se procesarán al confirmar.
                  </div>
                )}
              </div>

              {/* Desktop: tabla */}
              <table className="hidden sm:table w-full text-xs sm:text-[11px] border-collapse">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left px-2 py-2 text-gray-400 font-semibold text-[10px] uppercase tracking-wider w-8">#</th>
                    {headerRow.map((h, i) => (
                      <th key={i} className="text-left px-2 py-2 text-gray-400 font-semibold text-[10px] uppercase tracking-wider whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {displayRows.map((row, ri) => (
                    <tr key={ri} className={`border-b border-gray-50 ${row.hasError ? "bg-red-50/60" : ri % 2 === 0 ? "bg-white" : "bg-gray-50/30"}`} title={row.tooltip}>
                      <td className="px-2 py-1.5 text-gray-300 tabular-nums">{ri + 1}</td>
                      {row.cells.map((c, ci) => (
                        <td key={ci} className={`px-2 py-1.5 max-w-[180px] truncate ${row.hasError ? "text-red-700" : "text-gray-700"}`}>{c}</td>
                      ))}
                    </tr>
                  ))}
                  {hasMore && (
                    <tr>
                      <td colSpan={headerRow.length + 1} className="py-3 text-center text-xs text-gray-500 bg-amber-50">
                        Mostrando 100 de {bodyRows.length} filas. Las demas se procesaran al confirmar.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Actions */}
          <div className="px-4 sm:px-6 py-3 sm:py-4 border-t border-gray-200 flex-shrink-0">
            {warning && <div className="mb-3">{warning}</div>}
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 sm:items-center">
            <button onClick={onConfirm} disabled={confirmDisabled}
              className="bg-black text-white px-6 sm:px-8 py-3 rounded-md text-sm font-semibold hover:bg-gray-800 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 min-h-[44px]">
              <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
              {confirmLabel}
            </button>
            <button onClick={onCancel}
              className="border border-gray-300 px-5 py-3 rounded-md text-sm text-gray-600 hover:bg-gray-50 transition min-h-[44px]">
              Cancelar
            </button>
            {!confirmDisabled && <span className="hidden sm:inline text-xs text-gray-400 ml-2">Paso 3: Confirma para completar la carga</span>}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div>
      <AppHeader module="Carga de Archivos" />
      <div className="max-w-6xl mx-auto px-6 py-6">

        {fromVentas && (
          <a href="/ventas" className="text-sm text-gray-400 hover:text-black transition mb-4 block">← Volver a Ventas</a>
        )}

        {/* Tab bar */}
        <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5 mb-6 max-w-xs">
          <button onClick={() => setActiveTab("cxc")} className={`flex-1 py-2.5 sm:py-2 px-4 text-sm rounded-md transition ${activeTab === "cxc" ? "bg-white text-black font-medium shadow-sm" : "text-gray-500"}`}>CxC</button>
          <button onClick={() => setActiveTab("ventas")} className={`flex-1 py-2.5 sm:py-2 px-4 text-sm rounded-md transition ${activeTab === "ventas" ? "bg-white text-black font-medium shadow-sm" : "text-gray-500"}`}>Ventas</button>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-0 mb-6">
          {[
            { num: 1, label: "Selecciona el archivo", active: !cxcPreview && !ventasPreview && !message, done: !!cxcPreview || !!ventasPreview || !!message },
            { num: 2, label: "Revisa los datos", active: !!cxcPreview || !!ventasPreview, done: !!message },
            { num: 3, label: "Confirmar carga", active: false, done: message?.type === "ok" },
          ].map((step, i) => (
            <div key={step.num} className="flex items-center">
              {i > 0 && <div className={`w-8 sm:w-12 h-px ${step.done || step.active ? "bg-black" : "bg-gray-200"} mx-1`} />}
              <div className="flex items-center gap-2">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0 ${step.done ? "bg-black text-white" : step.active ? "bg-black text-white" : "bg-gray-100 text-gray-400"}`}>
                  {step.done ? <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg> : step.num}
                </div>
                <span className={`text-xs whitespace-nowrap ${step.done || step.active ? "text-black font-medium" : "text-gray-400"}`}>{step.label}</span>
              </div>
            </div>
          ))}
        </div>

        {message && (
          <div className={`mb-6 px-4 py-3 rounded-lg text-sm ${message.type === "ok" ? "bg-green-50 text-green-800 border border-green-200" : "bg-red-50 text-red-800 border border-red-200"}`}>
            {message.type === "ok" && <span className="font-medium block mb-0.5">Carga completada</span>}
            {message.text}
          </div>
        )}

        {/* ── CXC Tab ──────────────────────────────────────────────────────── */}
        {activeTab === "cxc" && (
          <>
            <details className="mb-6 bg-blue-50 border border-blue-200 rounded-lg overflow-hidden">
              <summary className="px-4 py-3 text-xs text-blue-700 cursor-pointer hover:bg-blue-100 transition flex items-center gap-2">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                <span className="font-medium">Como sacar el reporte en Switch</span>
              </summary>
              <div className="px-4 pb-3 text-xs text-blue-600 leading-relaxed">
                <ol className="list-decimal list-inside space-y-1 mt-1">
                  <li><strong>Reporte</strong> &rarr; Estado de cuenta cliente</li>
                  <li><strong>Generar</strong> &rarr; Antiguedad de deuda</li>
                  <li><strong>Descargar</strong> el archivo CSV</li>
                  <li>Seleccionar la empresa correspondiente abajo y subir el archivo</li>
                </ol>
              </div>
            </details>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
              {cxcCompanies.map((co) => (
                <div key={co.key}
                  className={`border rounded-lg p-4 transition cursor-pointer relative ${dragOver === co.key ? "border-blue-400 bg-blue-50" : "border-gray-200 hover:border-gray-300"} ${uploading === co.key ? "opacity-60 pointer-events-none" : ""}`}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(co.key); }}
                  onDragLeave={() => setDragOver(null)}
                  onDrop={async (e) => { e.preventDefault(); setDragOver(null); const f = e.dataTransfer.files[0]; if (f) openCxcPreview(co.key, f); }}
                  onClick={() => cxcFileRefs.current[co.key]?.click()}>
                  {uploading === co.key && <span className="text-[9px] bg-black text-white px-2 py-0.5 rounded-full font-medium absolute top-3 right-3">{uploadProgress || "Subiendo..."}</span>}
                  <div className="text-sm font-medium mb-0.5">{co.name}</div>
                  <div className="text-xs text-gray-400 mb-3">{co.brand}</div>
                  {getStatusIndicator(co.key, "cxc")}
                  {cxcUploads[co.key] && (
                    <button
                      onClick={(e) => { e.stopPropagation(); loadCxcSummary(co.key); }}
                      className="text-[10px] text-blue-600 hover:text-blue-800 transition mt-2 block"
                    >
                      {cxcSummaryLoading === co.key ? "Cargando..." : cxcSummary?.key === co.key ? "Ocultar resumen" : "Ver resumen"}
                    </button>
                  )}
                  {cxcSummary?.key === co.key && (
                    <div className="mt-2 bg-gray-50 rounded-lg p-3 text-xs" onClick={(e) => e.stopPropagation()}>
                      <div className="font-medium text-gray-700 mb-2">Top 5 clientes</div>
                      {cxcSummary.top5.map((r, i) => (
                        <div key={i} className="flex justify-between py-0.5 text-gray-600">
                          <span className="truncate mr-2">{r.nombre}</span>
                          <span className="tabular-nums font-medium flex-shrink-0">${r.total.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                      ))}
                      <div className="border-t border-gray-200 mt-2 pt-2 flex justify-between font-medium text-gray-800">
                        <span>Total cartera</span>
                        <span className="tabular-nums">${cxcSummary.totalCartera.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                    </div>
                  )}
                  <div className="text-[10px] text-gray-300 mt-3"><span className="sm:hidden">Toca para seleccionar</span><span className="hidden sm:inline">Arrastra el CSV aqui o haz click</span></div>
                  <input ref={(el) => { cxcFileRefs.current[co.key] = el; }} type="file" accept=".csv,.txt,.xlsx,.xls" className="hidden"
                    onClick={(e) => e.stopPropagation()}
                    onChange={async (e) => { const f = e.target.files?.[0]; if (f) openCxcPreview(co.key, f); e.target.value = ""; }} />
                </div>
              ))}
            </div>
          </>
        )}

        {/* ── Ventas Tab ───────────────────────────────────────────────────── */}
        {activeTab === "ventas" && (
          <>
            <details className="mb-6 bg-blue-50 border border-blue-200 rounded-lg overflow-hidden">
              <summary className="px-4 py-3 text-xs text-blue-700 cursor-pointer hover:bg-blue-100 transition flex items-center gap-2">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                <span className="font-medium">Como sacar el reporte en Switch</span>
              </summary>
              <div className="px-4 pb-3 text-xs text-blue-600 leading-relaxed">
                <ol className="list-decimal list-inside space-y-1 mt-1">
                  <li><strong>Reporte</strong> &rarr; Listado de comprobantes</li>
                  <li><strong>Filtrar</strong> por fecha (mes completo)</li>
                  <li><strong>Descargar</strong> el archivo CSV o Excel</li>
                  <li>Arrastra o selecciona la empresa correspondiente abajo</li>
                </ol>
                <p className="mt-2 text-blue-500">Nota: Multifashion se carga semanalmente. Las demas empresas se cargan mensualmente.</p>
              </div>
            </details>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
              {UPLOAD_EMPRESAS.map((co) => (
                <div key={co.key}
                  className={`border rounded-lg p-4 transition cursor-pointer relative ${dragOver === co.key ? "border-blue-400 bg-blue-50" : "border-gray-200 hover:border-gray-300"} ${ventasUploading === co.name ? "opacity-60 pointer-events-none" : ""}`}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(co.key); }}
                  onDragLeave={() => setDragOver(null)}
                  onDrop={(e) => { e.preventDefault(); setDragOver(null); const f = e.dataTransfer.files[0]; if (f) openVentasPreview(co.key, co.name, f); }}
                  onClick={() => ventasFileRefs.current[co.key]?.click()}>
                  {ventasUploading === co.name && <span className="text-[9px] bg-black text-white px-2 py-0.5 rounded-full font-medium absolute top-3 right-3">Subiendo...</span>}
                  <div className="text-sm font-medium mb-0.5">{co.name}</div>
                  <div className="text-xs text-gray-400 mb-3">{co.brand}</div>
                  {getStatusIndicator(co.key, "ventas")}
                  <div className="text-[10px] text-gray-300 mt-3">{ventasPreviewLoading ? "Analizando..." : <><span className="sm:hidden">Toca para seleccionar</span><span className="hidden sm:inline">Arrastra el CSV aqui o haz click</span></>}</div>
                  <input ref={(el) => { ventasFileRefs.current[co.key] = el; }} type="file" accept=".csv,.txt,.xlsx,.xls" className="hidden"
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) openVentasPreview(co.key, co.name, f); e.target.value = ""; }} />
                </div>
              ))}
            </div>
          </>
        )}

        {/* ── CXC Preview Modal ───────────────────────────────────────────── */}
        {cxcPreview && (
          <PreviewOverlay
            title={cxcCompanies.find((c) => c.key === cxcPreview.companyKey)?.name || cxcPreview.companyKey}
            subtitle={`${cxcPreview.rows.length} registros · delimitador: "${cxcPreview.delimiter}"`}
            badge={cxcPreview.formatError ? { ok: false, label: "Error de formato" } : { ok: true, label: "Formato valido" }}
            formatError={cxcPreview.formatError}
            summary={
              <div>
                <div className="flex gap-3 text-xs flex-wrap">
                  <span className="text-green-700 bg-green-50 px-2.5 py-1 rounded-full">{cxcPreview.validCount} validos</span>
                  {cxcPreview.errorCount > 0 && <span className="text-amber-700 bg-amber-50 px-2.5 py-1 rounded-full">{cxcPreview.errorCount} con advertencias</span>}
                  {cxcPreview.duplicateNames.size > 0 && <span className="text-blue-700 bg-blue-50 px-2.5 py-1 rounded-full">{cxcPreview.duplicateNames.size} nombres duplicados</span>}
                  {cxcPreview.bucketExceedsTotal > 0 && <span className="text-orange-700 bg-orange-50 px-2.5 py-1 rounded-full">{cxcPreview.bucketExceedsTotal} filas donde la suma de rangos excede el total</span>}
                </div>
                {/* Specific error details per row */}
                {cxcPreview.errorCount > 0 && (() => {
                  const nombreIdx = cxcPreview.headers.findIndex(h => h.toUpperCase().includes("NOMBRE"));
                  const errorRows = cxcPreview.rows
                    .map((r, i) => ({ row: i + 2, nombre: nombreIdx >= 0 ? r.values[nombreIdx] : "", errors: r.errors }))
                    .filter(r => r.errors.length > 0);
                  const shown = errorRows.slice(0, 10);
                  const remaining = errorRows.length - shown.length;
                  return (
                    <div className="mt-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                      <p className="text-[11px] font-medium text-amber-800 mb-1">Detalle de advertencias:</p>
                      <ul className="space-y-0.5">
                        {shown.map((r, i) => (
                          <li key={i} className="text-[11px] text-amber-700">
                            <span className="font-medium">Fila {r.row}{r.nombre ? ` (${r.nombre})` : ""}:</span> {r.errors.join(", ")}
                          </li>
                        ))}
                      </ul>
                      {remaining > 0 && <p className="text-[11px] text-amber-600 mt-1">y {remaining} más...</p>}
                    </div>
                  );
                })()}
              </div>
            }
            headerRow={cxcPreview.headers}
            bodyRows={cxcPreview.rows.map((r) => ({
              cells: r.values.slice(0, cxcPreview.headers.length),
              hasError: r.errors.length > 0,
              tooltip: r.errors.length > 0 ? r.errors.join(", ") : "",
            }))}
            onConfirm={handleCxcUpload}
            onCancel={() => { setCxcPreview(null); setPendingFile(null); }}
            confirmDisabled={!!cxcPreview.formatError || cxcPreview.rows.length === 0}
            confirmLabel={`Confirmar subida (${cxcPreview.rows.length} registros)`}
            warning={cxcUploads[cxcPreview.companyKey] ? (
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700">
                {"\u26A0"} Esto reemplazara los {cxcUploads[cxcPreview.companyKey].row_count} registros actuales de {cxcCompanies.find((c) => c.key === cxcPreview.companyKey)?.name || cxcPreview.companyKey}.
              </div>
            ) : undefined}
          />
        )}

        {/* ── Ventas Preview Modal ────────────────────────────────────────── */}
        {ventasPreview && (
          <PreviewOverlay
            title={ventasPreview.empresaName}
            subtitle={`${ventasPreview.rows.length} facturas parseadas`}
            badge={ventasPreview.formatError ? { ok: false, label: "Error de formato" } : { ok: true, label: "Formato valido" }}
            formatError={ventasPreview.formatError}
            summary={
              <div className="flex gap-3 text-xs flex-wrap">
                <span className="text-green-700 bg-green-50 px-2.5 py-1 rounded-full">{ventasPreview.validCount} nuevas</span>
                {ventasPreview.duplicateCount > 0 && <span className="text-blue-700 bg-blue-50 px-2.5 py-1 rounded-full">{ventasPreview.duplicateCount} existentes (se actualizaran)</span>}
                {ventasPreview.errorCount > 0 && <span className="text-red-700 bg-red-50 px-2.5 py-1 rounded-full">{ventasPreview.errorCount} con errores</span>}
                {ventasPreview.errorCount > 0 && (() => { const dateErrors = ventasPreview.rows.filter(r => r.errors.some(e => e.includes("invalido") || e.includes("fuera de rango") || e.includes("Formato invalido"))).length; return dateErrors > 0 ? <span className="text-amber-700 bg-amber-50 px-2.5 py-1 rounded-full">{dateErrors} filas con fecha invalida</span> : null; })()}
              </div>
            }
            headerRow={["Fecha", "Tipo", "N.Sistema", "N.Fiscal", "Cliente", "Vendedor", "Subtotal", "Total"]}
            bodyRows={ventasPreview.rows.map((r) => ({
              cells: [r.fecha, r.tipo, r.nSistema, r.nFiscal, r.cliente, r.vendedor, `$${r.subtotal.toFixed(2)}`, `$${r.total.toFixed(2)}`],
              hasError: r.errors.length > 0,
              tooltip: r.errors.length > 0 ? r.errors.join(", ") : r.isDuplicate ? "Ya existe — se actualizara" : "",
            }))}
            onConfirm={handleVentasUpload}
            onCancel={() => setVentasPreview(null)}
            confirmDisabled={!!ventasPreview.formatError || (ventasPreview.validCount === 0 && ventasPreview.duplicateCount === 0)}
            confirmLabel={`Confirmar subida (${ventasPreview.rows.length} registros)`}
          />
        )}
      </div>
    </div>
  );
}

export default function UploadPage() {
  return (
    <Suspense fallback={null}>
      <UploadPageInner />
    </Suspense>
  );
}

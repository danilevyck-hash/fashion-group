"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { CloudUpload, AlertCircle, Download, HelpCircle, ChevronRight } from "lucide-react";
import AppHeader from "@/components/AppHeader";
import { AccordionContent } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { ALL_COMPANIES } from "@/lib/companies";
import { useAuth } from "@/lib/hooks/useAuth";
import { logActivityClient } from "@/lib/logActivityClient";
import {
  ALL_EMPRESA_KEYS,
  B2B_EMPRESA_KEYS,
  EMPRESA_KEY_TO_NAME,
} from "@/lib/empresa-mapping";

// ── Empresas — single source of truth en lib/empresa-mapping.ts ──────────────
// Ventas usa las 8; CXC sólo las 6 B2B.

interface UploadEmpresa { key: string; name: string; brand: string; }

function buildEmpresas(keys: readonly string[]): UploadEmpresa[] {
  return keys.map((k) => ({
    key: k,
    name: EMPRESA_KEY_TO_NAME[k] ?? k,
    brand: ALL_COMPANIES.find((c) => c.key === k)?.brand ?? "",
  }));
}

const VENTAS_EMPRESAS: UploadEmpresa[] = buildEmpresas(ALL_EMPRESA_KEYS);
const CXC_EMPRESAS:    UploadEmpresa[] = buildEmpresas(B2B_EMPRESA_KEYS);

// ── Estado de cada card por upload ────────────────────────────────────────────
// Umbrales: ≤7 días al día / 8-10 vence pronto / >10 vencido. Sin uploads = none.

type CardState = "fresh" | "warn" | "overdue" | "none";

interface CardStatus {
  state: CardState;
  days: number | null;
  label: string;
}

function computeStatus(iso: string | null | undefined): CardStatus {
  if (!iso) return { state: "none", days: null, label: "Sin uploads" };
  const t = new Date(iso).getTime();
  if (isNaN(t)) return { state: "none", days: null, label: "Sin uploads" };
  const days = Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
  if (days === 0) return { state: "fresh", days, label: "Hoy" };
  if (days === 1) return { state: "fresh", days, label: "Hace 1 día" };
  if (days <= 7)  return { state: "fresh", days, label: `Hace ${days} días` };
  if (days <= 10) {
    const left = 10 - days;
    return { state: "warn", days, label: left <= 0 ? "Vence hoy" : `Vence en ${left} día${left === 1 ? "" : "s"}` };
  }
  return { state: "overdue", days, label: `Hace ${days} días` };
}

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

// Acepta el formato `listacomprobantes` (mayúsculas sin diacríticos) y el viejo
// `comprobantes` (mixto). Cualquier otro tipo (PEDIDO, COTIZACION, ...) se ignora.
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

// ── Card sub-components ──────────────────────────────────────────────────────

function HowToCollapsible({ tab }: { tab: "ventas" | "cxc" }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mb-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between rounded-lg bg-transparent border border-stone-300/70 hover:bg-stone-100/60 transition px-3.5 py-2.5"
      >
        <span className="flex items-center gap-2">
          <HelpCircle size={16} className="text-stone-500" />
          <span className="text-[13px] font-medium text-stone-700">Cómo descargar de Switch</span>
        </span>
        <ChevronRight size={16} className={`text-stone-500 transition-transform duration-200 ${open ? "rotate-90" : ""}`} />
      </button>
      <AccordionContent open={open}>
        <div className="mt-2 px-3.5 py-3.5 bg-white border border-stone-200 rounded-lg">
          {tab === "ventas" ? (
            <>
              <ol className="list-decimal list-inside space-y-1.5 text-[12px] text-stone-700">
                <li>Módulo <span className="font-medium">Reportes</span></li>
                <li><span className="font-medium">Listado de comprobantes</span></li>
                <li>Filtrar fecha (o usar <span className="font-medium">&ldquo;Últimos 30 días&rdquo;</span>) → click <span className="font-medium">Generar</span></li>
                <li>Click <span className="font-medium">Descargar Todos</span></li>
              </ol>
              <p className="text-[11px] text-stone-600 mt-3">
                Repetir para cada una de las 8 empresas. Genera 8 archivos CSV.
              </p>
            </>
          ) : (
            <>
              <ol className="list-decimal list-inside space-y-1.5 text-[12px] text-stone-700">
                <li>Módulo <span className="font-medium">Reportes</span></li>
                <li><span className="font-medium">Estado de cuenta Cliente</span></li>
                <li>Click <span className="font-medium">Generar</span> → cambiar a la pestaña <span className="font-medium">Antigüedad de deuda</span></li>
                <li>Click <span className="font-medium">Descargar</span> → seleccionar <span className="font-medium">Descargar Saldos</span></li>
              </ol>
              <p className="text-[11px] text-stone-600 mt-3">
                Repetir para las 6 empresas B2B. Boston y American Classic no entran en CXC. Genera 6 archivos CSV.
              </p>
            </>
          )}
        </div>
      </AccordionContent>
    </div>
  );
}

function StatusBanner({ statusList }: { statusList: CardStatus[] }) {
  const total = statusList.length;
  const atDia = statusList.filter((s) => s.state === "fresh").length;
  const vencidas = statusList.filter((s) => s.state === "overdue").length;
  const vencenPronto = statusList.filter((s) => s.state === "warn").length;

  return (
    <div className="bg-white border border-stone-200 rounded-xl px-4 py-3 mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between md:gap-0">
      <div>
        <div className="text-[11px] uppercase tracking-[0.05em] text-stone-600">Empresas al día</div>
        <div className="mt-1 flex items-baseline">
          <span
            className="text-[22px] font-medium tabular-nums leading-none"
            style={{ fontFamily: "var(--font-geist-mono), ui-monospace, SFMono-Regular, Menlo, monospace" }}
          >
            {atDia}
          </span>
          <span className="text-sm text-stone-600 ml-1 tabular-nums">/{total}</span>
        </div>
      </div>
      <div className="md:text-right space-y-1">
        {vencidas > 0 && (
          <div className="flex items-center gap-1.5 md:justify-end">
            <span className="rounded-full" style={{ width: 7, height: 7, background: "#B91C1C" }} />
            <span className="text-xs font-medium" style={{ color: "#B91C1C" }}>
              {vencidas} {vencidas === 1 ? "vencida" : "vencidas"}
            </span>
          </div>
        )}
        {vencenPronto > 0 && (
          <div className="flex items-center gap-1.5 md:justify-end">
            <span className="rounded-full" style={{ width: 7, height: 7, background: "#F59E0B" }} />
            <span className="text-xs font-medium" style={{ color: "#B45309" }}>
              {vencenPronto} {vencenPronto === 1 ? "vence pronto" : "vencen pronto"}
            </span>
          </div>
        )}
        <div className="text-[11px] text-stone-600">Actualizar cada 7-10 días</div>
      </div>
    </div>
  );
}

interface EmpresaCardProps {
  name: string;
  status: CardStatus;
  isDragOver: boolean;
  isUploading: boolean;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
  onClick: () => void;
  children?: React.ReactNode;
}

function EmpresaCard({ name, status, isDragOver, isUploading, onDragOver, onDragLeave, onDrop, onClick, children }: EmpresaCardProps) {
  const dotColor =
    status.state === "fresh"   ? "#16A34A" :
    status.state === "warn"    ? "#F59E0B" :
    status.state === "overdue" ? "#DC2626" :
                                 "#A8A29E";  // stone-400
  const labelColor =
    status.state === "fresh"   ? "#15803D" : // green-700
    status.state === "warn"    ? "#B45309" :
    status.state === "overdue" ? "#B91C1C" :
                                 "#78716C";  // stone-500

  // Layout base
  let containerStyle: React.CSSProperties = {
    background: "white",
    borderRadius: 8,
    border: "1px dashed #D6D3D1",
    minHeight: 110,
    padding: "16px 12px",
  };
  let icon = <CloudUpload size={24} className="text-stone-400" />;

  if (status.state === "overdue" && !isDragOver) {
    containerStyle = { ...containerStyle, background: "#FFFBEB", border: "1px dashed #F59E0B" };
    icon = <AlertCircle size={24} style={{ color: "#D97706" }} />;
  }
  if (isDragOver) {
    containerStyle = { ...containerStyle, background: "#F0FDFA", border: "2px dashed #0F766E" };
    icon = <Download size={24} style={{ color: "#0F766E" }} />;
  }

  return (
    <div
      style={containerStyle}
      className={`relative cursor-pointer transition flex flex-col items-center justify-center gap-2 text-center ${isUploading ? "opacity-60 pointer-events-none" : ""}`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onClick={onClick}
    >
      {isUploading && <span className="text-[9px] bg-black text-white px-2 py-0.5 rounded-full font-medium absolute top-2 right-2">Subiendo...</span>}
      {icon}
      {isDragOver ? (
        <>
          <div className="text-[13px] font-medium" style={{ color: "#0F766E" }}>Soltá aquí</div>
          <div className="text-[11px]" style={{ color: "#0F766E" }}>{name}</div>
        </>
      ) : (
        <>
          <div className="text-[13px] font-medium leading-tight">{name}</div>
          <div className="flex items-center gap-1.5">
            <span className="rounded-full inline-block" style={{ width: 6, height: 6, background: dotColor }} />
            <span className="text-[11px] font-medium" style={{ color: labelColor }}>{status.label}</span>
          </div>
        </>
      )}
      {children}
    </div>
  );
}

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
  // CXC tab muestra las 6 B2B (Boston y American Classic son retail sin
  // detallessaldos). Ventas muestra las 8.
  const cxcCompanies = CXC_EMPRESAS;

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
      const XLSX = await import("xlsx-js-style");
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
      // 🟡-12: lee switch_estadocuenta_aging (API diario, misma fuente que el
      // panel CXC) en vez de cxc_aging (CSV viejo), para que el resumen post-upload
      // coincida con el panel. Mismas columnas (view drop-in).
      const { data: top5 } = await supabase.from("switch_estadocuenta_aging").select("nombre, total").eq("company_key", companyKey).order("total", { ascending: false }).limit(5);
      const { data: totalData } = await supabase.from("switch_estadocuenta_aging").select("total").eq("company_key", companyKey);
      const totalCartera = (totalData || []).reduce((s, r) => s + (Number(r.total) || 0), 0);
      setCxcSummary({ key: companyKey, top5: (top5 || []).map(r => ({ nombre: r.nombre, total: Number(r.total) || 0 })), totalCartera });
    } catch { setCxcSummary(null); }
    setCxcSummaryLoading(null);
  }

  // Sprint 1 Fase 4C: el formato detallessaldos es per-document. El parsing,
  // matching de cliente_id y archive a Storage los hace el server. La UI
  // sube el archivo directo y muestra los stats que devuelve el endpoint.
  function buildCxcPreview(_text: string, companyKey: string): CxcPreview {
    return { companyKey, headers: [], rows: [], validCount: 0, errorCount: 0, duplicateNames: new Set(), bucketExceedsTotal: 0, formatError: "", delimiter: ";" };
  }

  async function openCxcPreview(companyKey: string, file: File) {
    setPendingFile(file);
    setCxcPreview(buildCxcPreview("", companyKey));
    // Subida automática inmediata; el server valida headers y devuelve stats.
    await handleCxcUpload(file, companyKey);
  }

  async function handleCxcUpload(fileArg?: File, companyKeyArg?: string) {
    const theFile = fileArg ?? pendingFile;
    const companyKey = companyKeyArg ?? cxcPreview?.companyKey;
    if (!theFile || !companyKey) return;

    setCxcPreview(null);
    setPendingFile(null);
    setUploading(companyKey);
    setMessage(null);
    setUploadProgress(`Procesando ${theFile.name}...`);

    try {
      const form = new FormData();
      form.append("empresa", companyKey);
      form.append("file", theFile);
      const res = await fetch("/api/cxc/upload", { method: "POST", body: form });
      const json = await res.json();
      setUploadProgress(null);
      if (!res.ok) throw new Error(json.error || "Error al cargar");

      const insertedCount: number = json.count ?? 0;
      const totalNeto: number = json.total_neto ?? 0;
      const matched: number = json.matched ?? 0;
      const unmatched: number = json.unmatched ?? 0;
      const pct: number = json.pct_unmatched ?? 0;
      const companyName = cxcCompanies.find(c => c.key === companyKey)?.name || companyKey;
      let mensaje = `${companyName}: ${insertedCount.toLocaleString()} documentos · saldo neto $${totalNeto.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      if (matched + unmatched > 0) {
        mensaje += ` · ${matched} con cliente, ${unmatched} sin match (${pct}%)`;
      }
      setMessage({ text: mensaje, type: "ok" });
      await loadCxcUploads();
    } catch (err: unknown) {
      setUploadProgress(null);
      setMessage({ text: err instanceof Error ? err.message : "Error desconocido", type: "err" });
    } finally {
      setUploading(null);
    }
  }

  // ── Ventas logic ──────────────────────────────────────────────────────────

  async function loadVentasStatus() {
    try {
      const res = await fetch(`/api/ventas/v2/status?_=${Date.now()}`, { cache: "no-store" });
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
    if (typeof v === "number") return isNaN(v) ? 0 : v;
    const s = String(v).trim().replace(/,/g, "");
    const n = parseFloat(s);
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

      const headers = lines[headerIdx].split(delimiter).map((h) => h.trim().replace(/\s+/g, " ").toUpperCase());

      // A) Validar headers requeridos
      const requiredHeaders = ["FECHA", "TIPO", "VENDEDOR", "CLIENTE", "SUBTOTAL", "TOTAL"];
      const missing = requiredHeaders.filter((h) => !headers.includes(h));
      if (!headers.includes("N.SISTEMA") && !headers.includes("N.INTERNO")) missing.push("N.SISTEMA");
      if (missing.length > 0) {
        setVentasPreview({ empresaKey, empresaName, rows: [], validCount: 0, errorCount: 0, duplicateCount: 0, formatError: `El archivo no tiene los encabezados requeridos. Faltan: ${missing.join(", ")}. Verifica que descargaste el reporte correcto en Switch Soft.`, file });
        return;
      }
      // C) Rechazar formato reporte_v / Descargar Detalle
      const reporteVHeaders = ["CODIGO", "FACTURADO POR", "MODULO", "SALDO"];
      if (reporteVHeaders.every((h) => headers.includes(h))) {
        setVentasPreview({ empresaKey, empresaName, rows: [], validCount: 0, errorCount: 0, duplicateCount: 0, formatError: "Este archivo está en formato 'Descargar Detalle' o reporte_v. El sistema solo acepta el formato 'Descargar' / comprobantes (con columnas COSTO y UTILIDAD). Vuelve a descargar el reporte en Switch Soft con el botón correcto.", file });
        return;
      }

      const getIdx = (key: string) => headers.indexOf(key);

      const parsedRows: VentasPreviewRow[] = [];
      const nSistemas: string[] = [];

      for (let i = headerIdx + 1; i < lines.length; i++) {
        const cols = lines[i].split(delimiter);
        const get = (key: string) => (cols[getIdx(key)] ?? "").trim();

        // Sprint 1 Fase 3: filtrar SOLO por tipo. Sin filtro de subtotal.
        const tipo = canonicalTipo(get("TIPO"));
        if (!tipo) continue;

        const isNC = tipo === "Nota de Crédito";
        const subtotal = isNC ? -Math.abs(toNum(get("SUBTOTAL"))) : toNum(get("SUBTOTAL"));
        const total    = isNC ? -Math.abs(toNum(get("TOTAL")))    : toNum(get("TOTAL"));

        const fechaRaw = get("FECHA");
        const fechaResult = parseVentasFecha(fechaRaw);
        const nSistema = get("N.SISTEMA") || get("N.INTERNO");
        const errors: string[] = [];

        if (!fechaResult.valid) errors.push(fechaResult.error);
        if (!nSistema) errors.push("N.SISTEMA / N.INTERNO vacio");
        if (!get("CLIENTE")) errors.push("CLIENTE vacio");

        nSistemas.push(nSistema);
        parsedRows.push({
          fecha: fechaRaw, tipo, nSistema, nFiscal: get("N.FISCAL"),
          cliente: get("CLIENTE"), subtotal, total,
          vendedor: get("VENDEDOR"), errors, isDuplicate: false,
        });
      }

      if (parsedRows.length === 0) {
        setVentasPreview({ empresaKey, empresaName, rows: [], validCount: 0, errorCount: 0, duplicateCount: 0, formatError: "No se encontraron filas válidas (Factura, Transacción, Tiquete, Nota de Crédito o Nota de Débito).", file });
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
    await uploadVentasFile(empresaKey, empresaName, file);
  }

  // Direct path para el flujo card-based (Sprint 1 Fase 4): drop/click en
  // una card de empresa salta el preview y manda el archivo directo al server.
  async function uploadVentasFile(empresaKey: string, empresaName: string, file: File) {
    setVentasUploading(empresaName);
    setMessage(null);
    try {
      const form = new FormData();
      form.append("empresa", empresaKey);
      form.append("file", file);
      const res = await fetch("/api/ventas/upload", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error al cargar");
      const filtered = json.filtered as { invalidTipo: number; invalidDate: number } | undefined;
      const totalDescartadas = filtered ? filtered.invalidTipo + filtered.invalidDate : 0;
      let mensaje = `${file.name}: ${json.count} registros cargados para ${empresaName}`;
      if (totalDescartadas > 0 && filtered) {
        const breakdown: string[] = [];
        if (filtered.invalidTipo > 0) breakdown.push(`${filtered.invalidTipo} tipo inválido`);
        if (filtered.invalidDate > 0) breakdown.push(`${filtered.invalidDate} fecha inválida`);
        mensaje += `, ${totalDescartadas} descartadas (${breakdown.join(", ")})`;
      }
      if (typeof json.matched === "number" && typeof json.unmatched === "number") {
        mensaje += ` · ${json.matched} con código matcheado, ${json.unmatched} sin match (${json.pct_unmatched ?? 0}%)`;
      }
      setMessage({ text: mensaje, type: "ok" });
      await loadVentasStatus();
    } catch (err: unknown) {
      setMessage({ text: err instanceof Error ? err.message : "Error desconocido", type: "err" });
    } finally {
      setVentasUploading(null);
    }
  }

  // El status indicator viejo (badges de "Al dia / Pendiente / Atrasado" con
  // formato verbose) se reemplazó por EmpresaCard + StatusBanner de Sprint 1
  // Fase 4 (UX card-based con dot+texto y banner global). computeStatus() en
  // top-level del archivo es la fuente única de los estados.


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
    <div className="min-h-screen" style={{ background: "#FAFAF9" }}>
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

        {message && (
          <div className={`mb-4 px-4 py-3 rounded-lg text-sm ${message.type === "ok" ? "bg-green-50 text-green-800 border border-green-200" : "bg-red-50 text-red-800 border border-red-200"}`}>
            {message.type === "ok" && <span className="font-medium block mb-0.5">Carga completada</span>}
            {message.text}
          </div>
        )}

        {/* ── CXC Tab ──────────────────────────────────────────────────────── */}
        {activeTab === "cxc" && (() => {
          const empresas = cxcCompanies;
          const statuses: Record<string, CardStatus> = {};
          for (const e of empresas) {
            statuses[e.key] = computeStatus(cxcUploads[e.key]?.uploaded_at);
          }
          const statusList = Object.values(statuses);
          return (
            <>
              <HowToCollapsible tab="cxc" />

              <StatusBanner statusList={statusList} />

              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 sm:gap-3">
                {empresas.map((co) => (
                  <EmpresaCard
                    key={co.key}
                    name={co.name}
                    status={statuses[co.key]}
                    isDragOver={dragOver === co.key}
                    isUploading={uploading === co.key}
                    onDragOver={(e) => { e.preventDefault(); setDragOver(co.key); }}
                    onDragLeave={() => setDragOver(null)}
                    onDrop={async (e) => { e.preventDefault(); setDragOver(null); const f = e.dataTransfer.files[0]; if (f) await openCxcPreview(co.key, f); }}
                    onClick={() => cxcFileRefs.current[co.key]?.click()}
                  >
                    <input ref={(el) => { cxcFileRefs.current[co.key] = el; }} type="file" accept=".csv,.txt,.xlsx,.xls" className="hidden"
                      onClick={(e) => e.stopPropagation()}
                      onChange={async (e) => { const f = e.target.files?.[0]; if (f) await openCxcPreview(co.key, f); e.target.value = ""; }} />
                  </EmpresaCard>
                ))}
              </div>

              <p className="text-[11px] text-stone-600 text-center mt-4">
                <span className="md:hidden">Tocá una empresa para subir el archivo CSV.</span>
                <span className="hidden md:inline">Arrastrá el archivo CSV sobre la empresa correspondiente, o hacé click para seleccionar.</span>
              </p>
            </>
          );
        })()}

        {/* ── Ventas Tab ───────────────────────────────────────────────────── */}
        {activeTab === "ventas" && (() => {
          const empresas = VENTAS_EMPRESAS;
          const statuses: Record<string, CardStatus> = {};
          for (const e of empresas) {
            statuses[e.key] = computeStatus(ventasUploads[e.key]?.date);
          }
          const statusList = Object.values(statuses);
          return (
            <>
              <HowToCollapsible tab="ventas" />

              <StatusBanner statusList={statusList} />

              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3">
                {empresas.map((co) => (
                  <EmpresaCard
                    key={co.key}
                    name={co.name}
                    status={statuses[co.key]}
                    isDragOver={dragOver === co.key}
                    isUploading={ventasUploading === co.name}
                    onDragOver={(e) => { e.preventDefault(); setDragOver(co.key); }}
                    onDragLeave={() => setDragOver(null)}
                    onDrop={async (e) => { e.preventDefault(); setDragOver(null); const f = e.dataTransfer.files[0]; if (f) await uploadVentasFile(co.key, co.name, f); }}
                    onClick={() => ventasFileRefs.current[co.key]?.click()}
                  >
                    <input ref={(el) => { ventasFileRefs.current[co.key] = el; }} type="file" accept=".csv,.txt,.xlsx,.xls" className="hidden"
                      onClick={(e) => e.stopPropagation()}
                      onChange={async (e) => { const f = e.target.files?.[0]; if (f) await uploadVentasFile(co.key, co.name, f); e.target.value = ""; }} />
                  </EmpresaCard>
                ))}
              </div>

              <p className="text-[11px] text-stone-600 text-center mt-4">
                <span className="md:hidden">Tocá una empresa para subir el archivo CSV.</span>
                <span className="hidden md:inline">Arrastrá el archivo CSV sobre la empresa correspondiente, o hacé click para seleccionar.</span>
              </p>
            </>
          );
        })()}

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

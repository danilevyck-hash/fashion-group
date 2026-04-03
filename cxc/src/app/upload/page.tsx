"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import { supabase } from "@/lib/supabase";
import { ALL_COMPANIES } from "@/lib/companies";
import { normalizeName } from "@/lib/normalize";
import { resolveAlias } from "@/lib/aliases";
import { ConfirmModal } from "@/components/ui";
import Papa from "papaparse";
import * as XLSX from "xlsx-js-style";
import { useAuth } from "@/lib/hooks/useAuth";

// ── Empresas for the upload grid ──────────────────────────────────────────────

const UPLOAD_EMPRESAS = [
  { key: "multifashion", name: "Multifashion", brand: "Multi-marca", weekly: true },
  { key: "vistana_international", name: "Vistana International", brand: "Calvin Klein" },
  { key: "fashion_wear", name: "Fashion Wear", brand: "Tommy Hilfiger Apparel" },
  { key: "fashion_shoes", name: "Fashion Shoes", brand: "Tommy Hilfiger Shoes" },
  { key: "active_shoes", name: "Active Shoes", brand: "Reebok Shoes" },
  { key: "active_wear", name: "Active Wear", brand: "Reebok Apparel" },
  { key: "joystep", name: "Joystep", brand: "Joystep" },
  { key: "confecciones_boston", name: "Confecciones Boston", brand: "Boston" },
] as const;

// ── Types ─────────────────────────────────────────────────────────────────────

interface UploadStatus {
  company_key: string;
  uploaded_at: string;
  row_count: number;
}

interface VentasStatus {
  date: string;
  label: string;
  count?: number;
}

// ── Inner component (needs useSearchParams inside Suspense) ───────────────────

function UploadPageInner() {
  const { authChecked, role } = useAuth({ moduleKey: "upload", allowedRoles: ["admin", "secretaria"] });
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get("tab") === "ventas" ? "ventas" : "cxc") as "cxc" | "ventas";

  // ── State ──
  const [activeTab, setActiveTab] = useState<"cxc" | "ventas">(initialTab);
  const [dragOver, setDragOver] = useState<string | null>(null);

  // CXC state
  const [cxcUploads, setCxcUploads] = useState<Record<string, UploadStatus>>({});
  const [uploading, setUploading] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; type: "ok" | "err" } | null>(null);
  const [csvPreview, setCsvPreview] = useState<{ headers: string[]; rows: string[][]; totalRows: number; companyKey: string; valid: boolean; error: string } | null>(null);
  const [pendingText, setPendingText] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  // Ventas state
  const [ventasUploads, setVentasUploads] = useState<Record<string, VentasStatus>>({});
  const [ventasUploading, setVentasUploading] = useState<string | null>(null);
  const [confirmUpload, setConfirmUpload] = useState<{ key: string; name: string; file: File } | null>(null);

  // Refs for file inputs (one per card)
  const cxcFileRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const ventasFileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // CXC uses ALL_COMPANIES keys
  const cxcCompanies = ALL_COMPANIES;

  // ── Effects ──
  useEffect(() => { if (authChecked) { loadCxcUploads(); loadVentasStatus(); } }, [authChecked]);

  if (!authChecked) return null;

  // ── CXC upload logic (preserved exactly) ──────────────────────────────────

  async function loadCxcUploads() {
    const { data } = await supabase
      .from("cxc_uploads")
      .select("*")
      .order("uploaded_at", { ascending: false });

    if (data) {
      const latest: Record<string, UploadStatus> = {};
      for (const row of data) {
        if (!latest[row.company_key]) {
          latest[row.company_key] = {
            company_key: row.company_key,
            uploaded_at: row.uploaded_at,
            row_count: row.row_count,
          };
        }
      }
      setCxcUploads(latest);
    }
  }

  async function handleUpload(companyKey: string, file: File) {
    setUploading(companyKey);
    setMessage(null);

    try {
      // ── Lock: reject if another upload for this company started < 2 min ago ──
      const twoMinAgo = new Date(Date.now() - 120_000).toISOString();
      const { data: recentUploads } = await supabase
        .from("cxc_uploads")
        .select("id")
        .eq("company_key", companyKey)
        .gte("uploaded_at", twoMinAgo)
        .limit(1);
      if (recentUploads && recentUploads.length > 0) {
        throw new Error("Ya hay un upload reciente para esta empresa. Espera 2 minutos e intenta de nuevo.");
      }

      const text = await readFileAsText(file);
      const parsed = Papa.parse(text, {
        delimiter: ";",
        header: true,
        skipEmptyLines: true,
      });

      if (parsed.errors.length > 0 && parsed.data.length === 0) {
        throw new Error("Error al parsear CSV: " + parsed.errors[0].message);
      }

      // Normalize CSV headers: trim and collapse spaces
      const rows = (parsed.data as Record<string, string>[])
        .map((row) => {
          const clean: Record<string, string> = {};
          for (const [key, val] of Object.entries(row)) {
            const normalizedKey = key.trim().replace(/\s+/g, " ");
            clean[normalizedKey] = (val || "").trim();
          }
          return clean;
        })
        // Filter out rows without a valid NOMBRE (junk rows, totals, empty)
        .filter((r) => {
          const nombre = (r["NOMBRE"] || "").trim();
          if (!nombre) return false;
          if (/^\d[\d.,\s-]*$/.test(nombre)) return false;
          if (/^\d+-\d+$/.test(nombre)) return false;
          if (/^Mas\s+de/i.test(nombre)) return false;
          if (/^Total$/i.test(nombre)) return false;
          return true;
        });

      // ── Step 1: Create upload record (acts as batch_id) ──
      const { data: upload, error: uploadErr } = await supabase
        .from("cxc_uploads")
        .insert({ company_key: companyKey, filename: file.name, row_count: rows.length })
        .select()
        .single();

      if (uploadErr) throw uploadErr;
      const newUploadId = upload.id;

      // ── Step 2: INSERT new rows with the new upload_id (old data untouched) ──
      const batchSize = 500;
      let insertedCount = 0;
      try {
        for (let i = 0; i < rows.length; i += batchSize) {
          const batch = rows.slice(i, i + batchSize).map((r) => ({
            upload_id: newUploadId,
            company_key: companyKey,
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

          const { error: insertErr } = await supabase.from("cxc_rows").insert(batch);
          if (insertErr) throw insertErr;
          insertedCount += batch.length;
        }
      } catch (insertError) {
        // ── Rollback: clean up partial new rows, keep old data intact ──
        await supabase.from("cxc_rows").delete().eq("upload_id", newUploadId);
        await supabase.from("cxc_uploads").delete().eq("id", newUploadId);
        throw new Error(`Insert falló en fila ${insertedCount + 1}. Datos anteriores preservados. ${insertError instanceof Error ? insertError.message : ""}`);
      }

      // ── Step 3: Verify count ──
      const { count } = await supabase
        .from("cxc_rows")
        .select("id", { count: "exact", head: true })
        .eq("upload_id", newUploadId);

      if (count !== rows.length) {
        // Count mismatch — rollback new rows
        await supabase.from("cxc_rows").delete().eq("upload_id", newUploadId);
        await supabase.from("cxc_uploads").delete().eq("id", newUploadId);
        throw new Error(`Verificación falló: esperaba ${rows.length} filas, encontró ${count}. Datos anteriores preservados.`);
      }

      // ── Step 4: Safe swap — delete OLD rows (different upload_id) ──
      await supabase
        .from("cxc_rows")
        .delete()
        .eq("company_key", companyKey)
        .neq("upload_id", newUploadId);

      setMessage({ text: `${file.name}: ${rows.length} registros cargados`, type: "ok" });
      loadCxcUploads();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error desconocido";
      setMessage({ text: msg, type: "err" });
    } finally {
      setUploading(null);
    }
  }

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
    return file.text();
  }

  function parseCSVPreview(text: string, companyKey: string) {
    const lines = text.split("\n").filter((l) => l.trim());
    if (lines.length < 2) return { valid: false, error: "El archivo esta vacio.", headers: [] as string[], rows: [] as string[][], totalRows: 0, companyKey };
    const sep = lines[0].includes(";") ? ";" : ",";
    const headers = lines[0].split(sep).map((h) => h.trim());
    const required = ["CODIGO", "NOMBRE", "TOTAL"];
    const missing = required.filter((r) => !headers.some((h) => h.toUpperCase().includes(r)));
    if (missing.length > 0) return { valid: false, error: `Faltan columnas: ${missing.join(", ")}. Verifica que sea el reporte CxC separado por '${sep}'.`, headers, rows: [] as string[][], totalRows: lines.length - 1, companyKey };
    return { valid: true, error: "", headers, rows: lines.slice(1, 11).map((l) => l.split(sep).map((v) => v.trim())), totalRows: lines.length - 1, companyKey };
  }

  // ── Ventas upload logic ───────────────────────────────────────────────────

  async function loadVentasStatus() {
    try {
      const res = await fetch("/api/ventas/v2/status");
      if (res.ok) {
        const data = await res.json();
        setVentasUploads(data);
      } else {
        console.error("[upload] ventas status failed:", res.status, await res.text().catch(() => ""));
      }
    } catch (err) {
      console.error("[upload] ventas status error:", err);
    }
  }

  async function handleVentasUpload(empresaName: string, file: File) {
    setVentasUploading(empresaName);
    setMessage(null);
    try {
      const form = new FormData();
      form.append("empresa", empresaName);
      form.append("file", file);
      const res = await fetch("/api/ventas/upload", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error al cargar");
      setMessage({ text: `${file.name}: ${json.count} registros cargados para ${empresaName}`, type: "ok" });
      await loadVentasStatus();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error desconocido";
      setMessage({ text: msg, type: "err" });
    } finally {
      setVentasUploading(null);
    }
  }

  function handleVentasFileSelect(key: string, name: string, file: File) {
    setConfirmUpload({ key, name, file });
  }

  // ── Status indicator ──────────────────────────────────────────────────────

  function formatPeriod(dateStr: string, count?: number) {
    const d = new Date(dateStr);
    // Period label
    const mes = d.toLocaleDateString("es-PA", { month: "short", timeZone: "America/Panama" });
    const año = d.getFullYear();
    // Exact time in Panama
    const dia = d.toLocaleDateString("es-PA", { day: "numeric", month: "short", timeZone: "America/Panama" });
    const hora = d.toLocaleTimeString("es-PA", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "America/Panama" }).toLowerCase();
    const parts = [`${mes} ${año}`];
    if (count) parts.push(`${count.toLocaleString()} reg.`);
    parts.push(`${dia} ${hora}`);
    return parts.join(" · ");
  }

  function getStatusIndicator(key: string, type: "cxc" | "ventas") {
    if (type === "cxc") {
      const up = cxcUploads[key];
      if (!up) return <div className="flex items-center gap-1.5 text-xs text-gray-400"><span className="opacity-50">&#9898;</span> Sin datos</div>;
      const days = (Date.now() - new Date(up.uploaded_at).getTime()) / 86400000;
      const detail = formatPeriod(up.uploaded_at, up.row_count);
      if (days > 14) return <div className="flex items-center gap-1.5 text-xs text-red-600"><span>&#128308;</span> Atrasado &middot; {detail}</div>;
      if (days > 7) return <div className="flex items-center gap-1.5 text-xs text-amber-600"><span>&#9888;&#65039;</span> Pendiente &middot; {detail}</div>;
      return <div className="flex items-center gap-1.5 text-xs text-green-600"><span>&#9989;</span> Al dia &middot; {detail}</div>;
    } else {
      const up = ventasUploads[key] ?? ventasUploads[UPLOAD_EMPRESAS.find(e => e.key === key)?.name ?? ""];
      if (!up) return <div className="flex items-center gap-1.5 text-xs text-gray-400"><span className="opacity-50">&#9898;</span> Sin datos</div>;
      const days = (Date.now() - new Date(up.date).getTime()) / 86400000;
      const thresholds = key === "multifashion" ? { warn: 7, alert: 14 } : { warn: 30, alert: 60 };
      const detail = `${up.label}${up.count ? ` · ${up.count.toLocaleString()} reg.` : ""}`;
      if (days > thresholds.alert) return <div className="flex items-center gap-1.5 text-xs text-red-600"><span>&#128308;</span> Atrasado &middot; {detail}</div>;
      if (days > thresholds.warn) return <div className="flex items-center gap-1.5 text-xs text-amber-600"><span>&#9888;&#65039;</span> Pendiente &middot; {detail}</div>;
      return <div className="flex items-center gap-1.5 text-xs text-green-600"><span>&#9989;</span> Al dia &middot; {detail}</div>;
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div>
      <AppHeader module="Carga de Archivos" />
      <div className="max-w-6xl mx-auto px-6 py-8">

        {/* Tab bar */}
        <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5 mb-6 max-w-xs">
          <button onClick={() => setActiveTab("cxc")} className={`flex-1 py-2 px-4 text-sm rounded-full transition ${activeTab === "cxc" ? "bg-white text-black font-medium shadow-sm" : "text-gray-500"}`}>CxC</button>
          <button onClick={() => setActiveTab("ventas")} className={`flex-1 py-2 px-4 text-sm rounded-full transition ${activeTab === "ventas" ? "bg-white text-black font-medium shadow-sm" : "text-gray-500"}`}>Ventas</button>
        </div>

        {/* Message banner */}
        {message && (
          <div className={`mb-6 px-4 py-3 rounded-lg text-sm ${message.type === "ok" ? "bg-green-50 text-green-800 border border-green-200" : "bg-red-50 text-red-800 border border-red-200"}`}>
            {message.text}
          </div>
        )}

        {/* ── CXC Tab ──────────────────────────────────────────────────────── */}
        {activeTab === "cxc" && (
          <>
            {/* Instructions */}
            <details className="mb-6 bg-blue-50 border border-blue-200 rounded-xl overflow-hidden">
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

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {cxcCompanies.map((co) => (
                <div
                  key={co.key}
                  className={`border rounded-xl p-4 transition cursor-pointer relative ${
                    dragOver === co.key ? "border-blue-400 bg-blue-50" : "border-gray-200 hover:border-gray-300"
                  }`}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(co.key); }}
                  onDragLeave={() => setDragOver(null)}
                  onDrop={async (e) => {
                    e.preventDefault();
                    setDragOver(null);
                    const f = e.dataTransfer.files[0];
                    if (f) {
                      const text = await readFileAsText(f);
                      const preview = parseCSVPreview(text, co.key);
                      setCsvPreview(preview);
                      setPendingText(text);
                      setPendingFile(f);
                    }
                  }}
                  onClick={() => cxcFileRefs.current[co.key]?.click()}
                >
                  <div className="text-sm font-medium mb-0.5">{co.name}</div>
                  <div className="text-xs text-gray-400 mb-3">{co.brand}</div>
                  {getStatusIndicator(co.key, "cxc")}
                  <div className="text-[10px] text-gray-300 mt-3">Arrastra el CSV aqui o haz click</div>
                  <input
                    ref={(el) => { cxcFileRefs.current[co.key] = el; }}
                    type="file"
                    accept=".csv,.txt,.xlsx,.xls"
                    className="hidden"
                    onClick={(e) => e.stopPropagation()}
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      const text = await readFileAsText(f);
                      const preview = parseCSVPreview(text, co.key);
                      setCsvPreview(preview);
                      setPendingText(text);
                      setPendingFile(f);
                      e.target.value = "";
                    }}
                  />
                </div>
              ))}
            </div>
          </>
        )}

        {/* ── Ventas Tab ───────────────────────────────────────────────────── */}
        {activeTab === "ventas" && (
          <>
            {/* Instructions */}
            <details className="mb-6 bg-blue-50 border border-blue-200 rounded-xl overflow-hidden">
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

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {UPLOAD_EMPRESAS.map((co) => (
                <div
                  key={co.key}
                  className={`border rounded-xl p-4 transition cursor-pointer relative ${
                    dragOver === co.key ? "border-blue-400 bg-blue-50" : "border-gray-200 hover:border-gray-300"
                  } ${co.key === "multifashion" ? "bg-amber-50/30" : ""}`}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(co.key); }}
                  onDragLeave={() => setDragOver(null)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOver(null);
                    const f = e.dataTransfer.files[0];
                    if (f) handleVentasFileSelect(co.key, co.name, f);
                  }}
                  onClick={() => ventasFileRefs.current[co.key]?.click()}
                >
                  {"weekly" in co && <span className="text-[9px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-medium absolute top-3 right-3">Semanal</span>}
                  <div className="text-sm font-medium mb-0.5">{co.name}</div>
                  <div className="text-xs text-gray-400 mb-3">{co.brand}</div>
                  {getStatusIndicator(co.key, "ventas")}
                  <div className="text-[10px] text-gray-300 mt-3">
                    {ventasUploading === co.name ? "Cargando..." : "Arrastra el CSV aqui o haz click"}
                  </div>
                  <input
                    ref={(el) => { ventasFileRefs.current[co.key] = el; }}
                    type="file"
                    accept=".csv,.txt,.xlsx,.xls"
                    className="hidden"
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      handleVentasFileSelect(co.key, co.name, f);
                      e.target.value = "";
                    }}
                  />
                </div>
              ))}
            </div>
          </>
        )}

        {/* ── CXC CSV Preview Overlay ──────────────────────────────────────── */}
        {csvPreview && (
          <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}>
            <div style={{ background: "white", borderRadius: "12px", padding: "24px", maxWidth: "900px", width: "100%", maxHeight: "85vh", overflowY: "auto" }}>
              {/* Header */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
                <div>
                  <p style={{ fontWeight: 600, fontSize: "15px", marginBottom: "4px" }}>{cxcCompanies.find((c) => c.key === csvPreview.companyKey)?.name}</p>
                  <p style={{ color: "#6b7280", fontSize: "12px" }}>
                    {csvPreview.totalRows} filas detectadas, {csvPreview.headers.length} columnas
                    {csvPreview.valid && csvPreview.rows.length > 0 && (
                      <span style={{ marginLeft: "8px", color: "#9ca3af" }}>&mdash; mostrando primeras {csvPreview.rows.length} filas</span>
                    )}
                  </p>
                </div>
                {csvPreview.valid
                  ? <span style={{ background: "#f0fdf4", color: "#16a34a", padding: "4px 12px", borderRadius: "99px", fontSize: "12px", whiteSpace: "nowrap", flexShrink: 0 }}>&#10003; Formato valido</span>
                  : <span style={{ background: "#fef2f2", color: "#dc2626", padding: "4px 12px", borderRadius: "99px", fontSize: "12px", whiteSpace: "nowrap", flexShrink: 0 }}>&#10007; Error de formato</span>
                }
              </div>

              {/* Error message */}
              {csvPreview.error && (
                <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "8px", padding: "10px 14px", color: "#dc2626", fontSize: "13px", marginBottom: "16px" }}>
                  {csvPreview.error}
                </div>
              )}

              {/* Preview table */}
              {csvPreview.valid && csvPreview.rows.length > 0 && (
                <div style={{ overflowX: "auto", marginBottom: "20px", border: "1px solid #e5e7eb", borderRadius: "8px" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px" }}>
                    <thead>
                      <tr style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
                        {csvPreview.headers.map((h, i) => (
                          <th key={i} style={{ textAlign: "left", padding: "8px 10px", color: "#6b7280", fontWeight: 600, whiteSpace: "nowrap", textTransform: "uppercase", letterSpacing: "0.04em", fontSize: "10px" }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {csvPreview.rows.map((row, ri) => (
                        <tr key={ri} style={{ borderBottom: "1px solid #f3f4f6" }}>
                          {csvPreview.headers.map((_, ci) => (
                            <td key={ci} style={{ padding: "7px 10px", color: "#374151", whiteSpace: "nowrap", maxWidth: "180px", overflow: "hidden", textOverflow: "ellipsis" }}>
                              {row[ci] ?? ""}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Action buttons */}
              <div style={{ display: "flex", gap: "10px" }}>
                {csvPreview.valid && pendingFile && (
                  <button
                    onClick={async () => { await handleUpload(csvPreview.companyKey, pendingFile); setCsvPreview(null); setPendingText(""); setPendingFile(null); }}
                    style={{ background: "#111827", color: "white", border: "none", padding: "10px 24px", borderRadius: "99px", cursor: "pointer", fontSize: "14px", fontWeight: 500 }}
                  >
                    Confirmar subida
                  </button>
                )}
                <button
                  onClick={() => { setCsvPreview(null); setPendingText(""); setPendingFile(null); }}
                  style={{ background: "white", border: "1px solid #d1d5db", padding: "10px 18px", borderRadius: "99px", cursor: "pointer", fontSize: "14px", color: "#6b7280" }}
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Ventas Confirm Modal ─────────────────────────────────────────── */}
        <ConfirmModal
          open={!!confirmUpload}
          onClose={() => setConfirmUpload(null)}
          onConfirm={async () => {
            if (!confirmUpload) return;
            const { name, file } = confirmUpload;
            setConfirmUpload(null);
            await handleVentasUpload(name, file);
          }}
          title="Confirmar carga de ventas"
          message={confirmUpload ? `Estas cargando datos de ${confirmUpload.name}?` : ""}
          confirmLabel="Cargar"
          loading={!!ventasUploading}
        />
      </div>
    </div>
  );
}

// ── Default export with Suspense boundary ─────────────────────────────────────

export default function UploadPage() {
  return (
    <Suspense fallback={null}>
      <UploadPageInner />
    </Suspense>
  );
}

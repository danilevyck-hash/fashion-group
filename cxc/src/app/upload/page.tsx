"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import { supabase } from "@/lib/supabase";
import { ALL_COMPANIES, getCompaniesForRole } from "@/lib/companies";
import { normalizeName } from "@/lib/normalize";
import { resolveAlias } from "@/lib/aliases";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { hasModuleAccess } from "@/lib/auth-check";

interface UploadStatus {
  company_key: string;
  uploaded_at: string;
  row_count: number;
}

export default function UploadPage() {
  const router = useRouter();
  const [uploads, setUploads] = useState<Record<string, UploadStatus>>({});
  const [uploading, setUploading] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; type: "ok" | "err" } | null>(null);

  const [userRole, setUserRole] = useState<string>("");
  const [csvPreview, setCsvPreview] = useState<{ headers: string[]; rows: string[][]; totalRows: number; companyKey: string; valid: boolean; error: string } | null>(null);
  const [pendingText, setPendingText] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  // David sees only Boston, admin/upload see all 7
  const uploadCompanies = userRole === "david"
    ? getCompaniesForRole("david")
    : ALL_COMPANIES;

  useEffect(() => {
    const role = sessionStorage.getItem("cxc_role");
    if (!hasModuleAccess("upload", ["admin","upload","secretaria"])) {
      router.push("/");
      return;
    }
    setUserRole(role || "");
    loadUploads();
  }, [router]);

  async function loadUploads() {
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
      setUploads(latest);
    }
  }

  async function handleUpload(companyKey: string, file: File) {
    setUploading(companyKey);
    setMessage(null);

    try {
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
          // Skip rows where NOMBRE looks like a number or bucket header
          if (/^\d[\d.,\s-]*$/.test(nombre)) return false;
          if (/^\d+-\d+$/.test(nombre)) return false;
          if (/^Mas\s+de/i.test(nombre)) return false;
          if (/^Total$/i.test(nombre)) return false;
          return true;
        });

      // Create upload record
      const { data: upload, error: uploadErr } = await supabase
        .from("cxc_uploads")
        .insert({ company_key: companyKey, filename: file.name, row_count: rows.length })
        .select()
        .single();

      if (uploadErr) throw uploadErr;

      // Delete previous rows for this company
      await supabase.from("cxc_rows").delete().eq("company_key", companyKey);

      // Insert rows in batches of 500
      const batchSize = 500;
      for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize).map((r) => ({
          upload_id: upload.id,
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
      }

      setMessage({
        text: `${file.name}: ${rows.length} registros cargados`,
        type: "ok",
      });
      loadUploads();
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

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleString("es-PA", {
      dateStyle: "short",
      timeStyle: "short",
    });
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
    if (lines.length < 2) return { valid: false, error: "El archivo está vacío.", headers: [] as string[], rows: [] as string[][], totalRows: 0, companyKey };
    const sep = lines[0].includes(";") ? ";" : ",";
    const headers = lines[0].split(sep).map((h) => h.trim());
    const required = ["CODIGO", "NOMBRE", "TOTAL"];
    const missing = required.filter((r) => !headers.some((h) => h.toUpperCase().includes(r)));
    if (missing.length > 0) return { valid: false, error: `Faltan columnas: ${missing.join(", ")}. Verifica que sea el reporte CxC separado por '${sep}'.`, headers, rows: [] as string[][], totalRows: lines.length - 1, companyKey };
    return { valid: true, error: "", headers, rows: lines.slice(1, 6).map((l) => l.split(sep).map((v) => v.trim())), totalRows: lines.length - 1, companyKey };
  }

  function uploadAge(dateStr: string): "fresh" | "warning" | "stale" {
    const days = (Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24);
    if (days > 15) return "stale";
    if (days > 7) return "warning";
    return "fresh";
  }

  const ageDot: Record<string, string> = {
    fresh: "bg-green-500",
    warning: "bg-yellow-500",
    stale: "bg-red-500",
  };

  return (
    <div>
      <AppHeader module="Carga de Archivos" />
      <div className="max-w-2xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-xl font-semibold tracking-tight">Carga de Archivos CXC</h1>
        <div className="flex items-center gap-4">
        </div>
      </div>

      {/* Upload guide */}
      <details className="mb-6 bg-blue-50 border border-blue-200 rounded-xl overflow-hidden">
        <summary className="px-4 py-3 text-xs text-blue-700 cursor-pointer hover:bg-blue-100 transition flex items-center gap-2">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          <span className="font-medium">Cómo sacar el reporte en Switch</span>
        </summary>
        <div className="px-4 pb-3 text-xs text-blue-600 leading-relaxed">
          <ol className="list-decimal list-inside space-y-1 mt-1">
            <li><strong>Reporte</strong> → Estado de cuenta cliente</li>
            <li><strong>Generar</strong> → Antigüedad de deuda</li>
            <li><strong>Descargar</strong> el archivo CSV</li>
            <li>Seleccionar la empresa correspondiente abajo y subir el archivo</li>
          </ol>
        </div>
      </details>

      {message && (
        <div
          className={`mb-6 px-4 py-3 rounded text-sm ${
            message.type === "ok"
              ? "bg-green-50 text-green-800 border border-green-200"
              : "bg-red-50 text-red-800 border border-red-200"
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="space-y-3">
        {uploadCompanies.map((co) => {
          const up = uploads[co.key];
          const age = up ? uploadAge(up.uploaded_at) : null;

          return (
            <div
              key={co.key}
              className="flex items-center justify-between border border-gray-200 rounded px-4 py-3"
            >
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm">{co.name}</div>
                <div className="text-xs text-gray-400">{co.brand}</div>
                {up && (
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`w-2 h-2 rounded-full inline-block ${ageDot[age!]}`} />
                    <span className="text-xs text-gray-500">
                      {formatDate(up.uploaded_at)} &middot; {up.row_count} registros
                    </span>
                  </div>
                )}
              </div>

              <div>
                <label style={{fontSize:'14px',padding:'8px 16px',borderRadius:'4px',border:'1px solid black',cursor:'pointer',display:'inline-block'}}>
                  {uploading === co.key ? "Cargando..." : "Cargar CSV"}
                  <input
                    type="file"
                    accept=".csv,.txt,.xlsx,.xls"
                    style={{display:'none'}}
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      const text = await readFileAsText(f);
                      const preview = parseCSVPreview(text, co.key);
                      setCsvPreview(preview);
                      setPendingText(text);
                      setPendingFile(f);
                    }}
                  />
                </label>
              </div>
            </div>
          );
        })}
      </div>

      {/* CSV Preview Overlay */}
      {csvPreview && (
        <div style={{position:'fixed',top:0,left:0,right:0,bottom:0,background:'rgba(0,0,0,0.5)',zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center'}}>
          <div style={{background:'white',borderRadius:'12px',padding:'24px',maxWidth:'600px',width:'90%',maxHeight:'80vh',overflowY:'auto'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'16px'}}>
              <div>
                <p style={{fontWeight:600,fontSize:'14px'}}>{uploadCompanies.find((c) => c.key === csvPreview.companyKey)?.name}</p>
                <p style={{color:'#888',fontSize:'12px'}}>{csvPreview.totalRows} registros detectados</p>
              </div>
              {csvPreview.valid
                ? <span style={{background:'#f0fdf4',color:'#16a34a',padding:'4px 12px',borderRadius:'99px',fontSize:'12px'}}>✓ Formato válido</span>
                : <span style={{background:'#fef2f2',color:'#dc2626',padding:'4px 12px',borderRadius:'99px',fontSize:'12px'}}>✗ Error</span>
              }
            </div>
            {csvPreview.error && <p style={{color:'red',fontSize:'13px',marginBottom:'12px'}}>{csvPreview.error}</p>}
            <div style={{display:'flex',gap:'12px',marginTop:'16px'}}>
              {csvPreview.valid && pendingFile && (
                <button onClick={async () => { await handleUpload(csvPreview.companyKey, pendingFile); setCsvPreview(null); setPendingText(""); setPendingFile(null); }} style={{background:'black',color:'white',border:'none',padding:'10px 24px',borderRadius:'99px',cursor:'pointer',fontSize:'14px'}}>
                  Confirmar y subir
                </button>
              )}
              <button onClick={() => { setCsvPreview(null); setPendingText(""); setPendingFile(null); }} style={{background:'white',border:'1px solid #ddd',padding:'10px 16px',borderRadius:'99px',cursor:'pointer',fontSize:'14px',color:'#666'}}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </div>
  );
}

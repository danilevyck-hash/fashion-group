"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import { supabase } from "@/lib/supabase";
import { ALL_COMPANIES, getCompaniesForRole } from "@/lib/companies";
import { normalizeName } from "@/lib/normalize";
import { resolveAlias } from "@/lib/aliases";
import Papa from "papaparse";

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
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});
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
    if (!role) {
      router.push("/");
      return;
    }
    setUserRole(role);
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
      const text = await file.text();
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
      console.error("Upload error:", err);
      const msg = err instanceof Error ? err.message : JSON.stringify(err);
      setMessage({ text: `Error: ${msg}`, type: "err" });
    } finally {
      setUploading(null);
      const ref = fileRefs.current[companyKey];
      if (ref) ref.value = "";
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
                <input
                  id={`file-${co.key}`}
                  type="file"
                  accept=".csv,.txt"
                  className="hidden"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    try {
                      const text = await f.text();
                      const preview = parseCSVPreview(text, co.key);
                      setCsvPreview(preview);
                      setPendingText(text);
                      setPendingFile(f);
                    } catch (err) {
                      console.error("CSV parse error:", err);
                      setMessage({ text: `Error al leer archivo: ${err}`, type: "err" });
                    }
                    e.target.value = "";
                  }}
                />
                <button
                  onClick={() => {
                    const input = document.getElementById(`file-${co.key}`) as HTMLInputElement;
                    input?.click();
                  }}
                  disabled={uploading !== null}
                  className={`text-sm px-4 py-2 rounded border transition ${
                    uploading === co.key
                      ? "border-gray-200 text-gray-400 cursor-wait"
                      : "border-black text-black hover:bg-black hover:text-white"
                  }`}
                >
                  {uploading === co.key ? "Cargando..." : "Cargar CSV"}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* CSV Preview */}
      {csvPreview && (
        <div className="mt-6 border border-gray-100 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div><p className="text-sm font-medium">{uploadCompanies.find((c) => c.key === csvPreview.companyKey)?.name || csvPreview.companyKey}</p><p className="text-xs text-gray-400 mt-0.5">{csvPreview.totalRows.toLocaleString()} registros detectados</p></div>
            {csvPreview.valid ? <span className="text-xs bg-green-50 text-green-600 px-3 py-1 rounded-full font-medium">✓ Formato válido</span> : <span className="text-xs bg-red-50 text-red-600 px-3 py-1 rounded-full font-medium">✗ Error de formato</span>}
          </div>
          {csvPreview.error && <p className="text-sm text-red-500 mb-4 bg-red-50 rounded-lg p-3">{csvPreview.error}</p>}
          {csvPreview.valid && csvPreview.rows.length > 0 && (
            <div className="overflow-x-auto mb-4">
              <p className="text-[11px] uppercase tracking-[0.05em] text-gray-400 mb-2">Primeras {csvPreview.rows.length} filas</p>
              <table className="w-full text-xs"><thead><tr className="border-b border-gray-100">{csvPreview.headers.slice(0, 6).map((h, i) => <th key={i} className="text-left pb-2 pr-4 font-medium text-gray-400 whitespace-nowrap">{h}</th>)}{csvPreview.headers.length > 6 && <th className="text-left pb-2 text-gray-300">+{csvPreview.headers.length - 6} más</th>}</tr></thead>
              <tbody>{csvPreview.rows.map((row, i) => <tr key={i} className="border-b border-gray-50">{row.slice(0, 6).map((cell, j) => <td key={j} className="py-1.5 pr-4 text-gray-600 whitespace-nowrap max-w-[120px] truncate">{cell}</td>)}</tr>)}</tbody></table>
            </div>
          )}
          <div className="flex gap-3">
            {csvPreview.valid && pendingFile && <button disabled={uploading !== null} onClick={async () => { await handleUpload(csvPreview.companyKey, pendingFile); setCsvPreview(null); setPendingText(""); setPendingFile(null); }} className="bg-black text-white px-6 py-2.5 rounded-full text-sm font-medium hover:bg-gray-800 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2">{uploading ? (<><svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Subiendo...</>) : "Confirmar y subir"}</button>}
            <button onClick={() => { setCsvPreview(null); setPendingText(""); setPendingFile(null); }} className="text-sm text-gray-400 hover:text-black transition border border-gray-200 px-4 py-2 rounded-full">Cancelar</button>
          </div>
        </div>
      )}
    </div>
    </div>
  );
}

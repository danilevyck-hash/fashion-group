"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
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
      const msg = err instanceof Error ? err.message : "Error desconocido";
      setMessage({ text: msg, type: "err" });
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
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <img src="/logo.jpeg" alt="FG" className="w-10 h-10 rounded" />
          <div>
            <h1 className="text-xl font-bold">Carga de Archivos CXC</h1>
            <p className="text-sm text-gray-500">Seleccione un CSV por empresa</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button onClick={() => router.push("/guias")} className="text-sm text-gray-500 hover:text-black">
            Guías
          </button>
          <button onClick={() => router.push("/caja")} className="text-sm text-gray-500 hover:text-black">
            Caja
          </button>
          <button
            onClick={() => {
              sessionStorage.removeItem("cxc_role");
              router.push("/");
            }}
            className="text-sm text-gray-500 hover:text-black"
          >
            Salir
          </button>
        </div>
      </div>

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
                  ref={(el) => { fileRefs.current[co.key] = el; }}
                  type="file"
                  accept=".csv,.txt"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleUpload(co.key, f);
                  }}
                />
                <button
                  onClick={() => fileRefs.current[co.key]?.click()}
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
    </div>
  );
}

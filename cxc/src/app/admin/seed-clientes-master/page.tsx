"use client";

// ─────────────────────────────────────────────────────────────────────────────
// /admin/seed-clientes-master — Página TEMPORAL (Sprint 1)
//
// Sube UN CSV de Switch (`listaclientes_*.csv`) y repuebla clientes_master.
// La tabla debe estar vacía (TRUNCATE corrido en Fase 1). Se retira en Fase 4.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from "react";
import AppHeader from "@/components/AppHeader";
import { useAuth } from "@/lib/hooks/useAuth";
import { Toast } from "@/components/ui";

interface SeedResult {
  ok: boolean;
  inserted: number;
  total_in_db: number;
  rows_in_csv: number;
  skipped_sin_codigo: number;
  dupes_count: number;
  dupes: { codigo: string; nombre: string; reason: string; primary_codigo?: string }[];
  sample: { codigo: string; nombre: string; identificacion: string | null; dv: string | null }[];
}

export default function SeedClientesMasterPage() {
  const { authChecked } = useAuth({ moduleKey: "admin", allowedRoles: ["admin"] });
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<SeedResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  if (!authChecked) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) { setError("Seleccioná un archivo"); return; }
    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/admin/seed-clientes-master", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error || `HTTP ${res.status}`);
      } else {
        setResult(json);
        setToast(`Insertados ${json.inserted} clientes`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de red");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-white">
      <AppHeader module="Sistema" breadcrumbs={[{ label: "Seed clientes_master" }]} />
      <main className="max-w-3xl mx-auto px-4 py-6">
        <h1 className="text-xl font-semibold mb-1">Seed clientes_master</h1>
        <p className="text-sm text-gray-500 mb-6">
          Página temporal de Sprint 1. Subí UN <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">listaclientes_*.csv</code> de Switch
          (las 6 listas son idénticas — alcanza con Vistana). La tabla debe estar vacía antes de subir.
        </p>

        <form onSubmit={handleSubmit} className="border border-gray-200 rounded-lg p-4 mb-6">
          <label className="block text-[11px] uppercase tracking-[0.05em] text-gray-400 mb-2">Archivo CSV</label>
          <input
            type="file"
            accept=".csv"
            onChange={(e) => { setFile(e.target.files?.[0] ?? null); setError(null); setResult(null); }}
            className="block w-full text-sm mb-4"
          />
          <button
            type="submit"
            disabled={!file || submitting}
            className="bg-black text-white text-sm rounded-md px-4 py-2 active:scale-[0.97] transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? "Subiendo..." : "Subir y poblar"}
          </button>
          {file && <span className="ml-3 text-xs text-gray-500">{file.name} · {(file.size / 1024).toFixed(1)} KB</span>}
        </form>

        {error && (
          <div className="border border-red-200 bg-red-50 text-red-700 rounded-lg p-3 text-sm mb-6 whitespace-pre-wrap">
            {error}
          </div>
        )}

        {result && (
          <div className="border border-emerald-200 bg-emerald-50 rounded-lg p-4 text-sm">
            <div className="font-medium text-emerald-800 mb-2">Listo</div>
            <div className="grid grid-cols-2 gap-y-1 text-xs text-gray-700 mb-4">
              <div>Filas en CSV:</div><div className="tabular-nums">{result.rows_in_csv}</div>
              <div>Insertadas:</div><div className="tabular-nums font-medium">{result.inserted}</div>
              <div>Total en DB:</div><div className="tabular-nums font-medium">{result.total_in_db}</div>
              <div>Saltadas sin código:</div><div className="tabular-nums">{result.skipped_sin_codigo}</div>
              <div>Duplicados (warnings):</div><div className="tabular-nums">{result.dupes_count}</div>
            </div>
            {result.dupes.length > 0 && (
              <details className="mb-3">
                <summary className="text-xs cursor-pointer text-gray-600 hover:text-black">Ver duplicados ({result.dupes.length})</summary>
                <table className="text-xs w-full mt-2 border border-gray-200">
                  <thead className="bg-gray-50">
                    <tr><th className="text-left px-2 py-1">Código</th><th className="text-left px-2 py-1">Nombre</th><th className="text-left px-2 py-1">Razón</th></tr>
                  </thead>
                  <tbody>
                    {result.dupes.map((d, i) => (
                      <tr key={i} className="border-t border-gray-100">
                        <td className="px-2 py-1 tabular-nums">{d.codigo}</td>
                        <td className="px-2 py-1">{d.nombre}</td>
                        <td className="px-2 py-1 text-gray-500">{d.reason}{d.primary_codigo ? ` (primary: ${d.primary_codigo})` : ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            )}
            {result.sample.length > 0 && (
              <details>
                <summary className="text-xs cursor-pointer text-gray-600 hover:text-black">Ver primeras 3 filas insertadas</summary>
                <pre className="text-xs bg-white border border-gray-200 rounded p-2 mt-2 overflow-x-auto">{JSON.stringify(result.sample, null, 2)}</pre>
              </details>
            )}
          </div>
        )}
      </main>
      <Toast message={toast} type="success" onDismiss={() => setToast(null)} />
    </div>
  );
}

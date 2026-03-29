"use client";

import { useState } from "react";
import { useAuth } from "@/lib/hooks/useAuth";
import AppHeader from "@/components/AppHeader";

const EMPRESAS = [
  "Vistana International",
  "Fashion Wear",
  "Fashion Shoes",
  "Active Shoes",
  "Active Wear",
  "Joystep",
  "Confecciones Boston",
  "Multifashion",
];

export default function VentasCargaPage() {
  const { authChecked, role } = useAuth({ moduleKey: "ventas", allowedRoles: ["admin", "upload", "secretaria"] });
  const [empresa, setEmpresa] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  if (!authChecked) return null;

  async function handleUpload() {
    if (!empresa || !file) return;
    setUploading(true);
    setResult(null);
    try {
      const formData = new FormData();
      formData.append("empresa", empresa);
      formData.append("file", file);
      const res = await fetch("/api/ventas/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (res.ok) {
        setResult({ ok: true, message: `✓ Archivo cargado correctamente — ${data.count} registros` });
        setFile(null);
        // Clear file input
        const input = document.querySelector('input[type="file"]') as HTMLInputElement;
        if (input) input.value = "";
      } else {
        setResult({ ok: false, message: data.error || "✗ Error al cargar — verificar formato del archivo" });
      }
    } catch {
      setResult({ ok: false, message: "✗ Error de conexión" });
    }
    setUploading(false);
  }

  return (
    <div className="min-h-screen bg-white">
      <AppHeader module="Ventas" />
      <div className="max-w-md mx-auto px-4 py-16">
        <h1 className="text-xl font-light tracking-tight mb-1">Cargar archivo</h1>
        <p className="text-sm text-gray-400 mb-8">CSV o Excel de ventas — formato Switch Soft</p>

        <div className="space-y-5">
          <div>
            <label className="text-[11px] uppercase tracking-widest text-gray-400 block mb-2">Empresa</label>
            <select value={empresa} onChange={e => setEmpresa(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-white outline-none focus:border-black transition">
              <option value="">Seleccionar empresa...</option>
              {EMPRESAS.map(e => <option key={e} value={e}>{e}</option>)}
            </select>
          </div>

          {empresa && (
            <div className="bg-gray-50 rounded-xl p-4 text-sm text-gray-600">
              <p className="text-[11px] uppercase tracking-widest text-gray-400 mb-2">Instrucciones</p>
              <ol className="list-decimal list-inside space-y-1 text-xs">
                <li>Entrar a Switch Soft de {empresa}</li>
                <li>Ir a Reportes → Listado de comprobantes</li>
                <li>En filtro de fecha seleccionar "{empresa === "Multifashion" ? "Últimos 30 días" : "Mes pasado"}"</li>
                <li>Presionar "Generar"</li>
                <li>Presionar "Descargar"</li>
              </ol>
            </div>
          )}

          <div>
            <label className="text-[11px] uppercase tracking-widest text-gray-400 block mb-2">Archivo</label>
            <input type="file" accept=".csv,.xlsx,.xls"
              onChange={e => { setFile(e.target.files?.[0] || null); setResult(null); }}
              className="w-full text-sm text-gray-500 file:mr-3 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200 file:cursor-pointer file:transition" />
          </div>

          <button onClick={handleUpload} disabled={!empresa || !file || uploading}
            className="w-full bg-black text-white py-3 rounded-full text-sm font-medium hover:bg-gray-800 transition disabled:opacity-40 disabled:cursor-not-allowed min-h-[44px]">
            {uploading ? "Subiendo..." : "Subir"}
          </button>

          {result && (
            <div className={`text-sm px-4 py-3 rounded-xl ${result.ok ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
              {result.message}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";

interface CargaRow {
  id: string;
  usuario: string;
  empresa: string;
  marca: string;
  cantidad_estilos: number;
  total_unidades: number;
  total_costo: number;
  created_at: string;
}

function fmtFecha(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("es-PA", {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function fmtMoney(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

interface HistorialViewProps {
  /** Cambia para forzar un refetch (ej. tras una descarga). */
  refreshKey?: number;
}

export default function HistorialView({ refreshKey = 0 }: HistorialViewProps) {
  const [rows, setRows] = useState<CargaRow[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    setError("");
    fetch("/api/productos/cargar/historial")
      .then((r) => r.ok ? r.json() : Promise.reject(new Error("fetch")))
      .then((d) => { if (alive) setRows(d.rows ?? []); })
      .catch(() => { if (alive) { setRows([]); setError("No se pudo cargar el historial."); } });
    return () => { alive = false; };
  }, [refreshKey]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <div className="mb-5 border-b-2 border-stone-900 pb-4">
        <p className="text-sm text-stone-500">
          Cada plantilla descargada queda registrada aquí, de la más reciente a la más antigua.
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {rows === null ? (
        <div className="py-16 text-center text-stone-500">Cargando…</div>
      ) : rows.length === 0 ? (
        <div className="py-16 text-center text-stone-500">Todavía no hay cargas registradas.</div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
          <div className="max-h-[560px] overflow-auto">
            <table className="w-full border-collapse whitespace-nowrap text-[13px] tabular-nums">
              <thead>
                <tr>
                  {["Fecha", "Usuario", "Empresa", "Marca", "Estilos", "Unidades", "Total costo"].map((h, i) => (
                    <th
                      key={h}
                      className={`sticky top-0 border-b-[1.5px] border-stone-300 bg-stone-100 px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-stone-600 ${
                        i >= 4 ? "text-right" : "text-left"
                      }`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-teal-50">
                    <td className="border-b border-stone-100 px-3 py-2 text-stone-700">{fmtFecha(r.created_at)}</td>
                    <td className="border-b border-stone-100 px-3 py-2 text-stone-900">{r.usuario}</td>
                    <td className="border-b border-stone-100 px-3 py-2 text-stone-900">{r.empresa || "—"}</td>
                    <td className="border-b border-stone-100 px-3 py-2 text-stone-900">{r.marca || "—"}</td>
                    <td className="border-b border-stone-100 px-3 py-2 text-right text-stone-700">{r.cantidad_estilos.toLocaleString()}</td>
                    <td className="border-b border-stone-100 px-3 py-2 text-right text-stone-700">{r.total_unidades.toLocaleString()}</td>
                    <td className="border-b border-stone-100 px-3 py-2 text-right font-medium text-stone-900">${fmtMoney(r.total_costo)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

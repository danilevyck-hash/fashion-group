"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import { useAuth } from "@/lib/hooks/useAuth";
import { Toast } from "@/components/ui";

// ── Constants ──────────────────────────────────────────────────────────────────

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

const MES_NAMES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

const SUGGESTED_METAS: Record<string, number> = {
  "Vistana International": 2_900_000,
  "Fashion Wear": 4_200_000,
  "Fashion Shoes": 2_700_000,
  "Active Shoes": 500_000,
  "Active Wear": 220_000,
  "Joystep": 250_000,
  "Confecciones Boston": 720_000,
  "Multifashion": 800_000,
};

// ── Types ──────────────────────────────────────────────────────────────────────

interface MetaResponse {
  empresa: string;
  meta_anual: number;
  distribucion: number[];
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtK(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1000) return `$${(n / 1000).toFixed(0)}k`;
  return `$${n.toFixed(0)}`;
}

function fmtCurrency(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function VentasMetasPage() {
  const router = useRouter();
  const { authChecked, role } = useAuth({ moduleKey: "ventas", allowedRoles: ["admin"] });

  const [anio, setAnio] = useState(2026);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [distribucion, setDistribucion] = useState<Record<string, number[]>>({});

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const fetchMetas = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/ventas/metas?anio=${anio}`);
      if (!res.ok) throw new Error("Error");
      const data = await res.json();
      const metas: MetaResponse[] = data.metas ?? [];

      const newDraft: Record<string, string> = {};
      const newDist: Record<string, number[]> = {};

      for (const m of metas) {
        newDraft[m.empresa] = m.meta_anual > 0 ? String(m.meta_anual) : "";
        newDist[m.empresa] = m.distribucion;
      }

      // Ensure all empresas are in the draft
      for (const emp of EMPRESAS) {
        if (!(emp in newDraft)) newDraft[emp] = "";
        if (!(emp in newDist)) newDist[emp] = Array(12).fill(1 / 12);
      }

      setDraft(newDraft);
      setDistribucion(newDist);
    } catch {
      showToast("Error al cargar metas");
    }
    setLoading(false);
  }, [anio]);

  useEffect(() => {
    if (authChecked) fetchMetas();
  }, [authChecked, fetchMetas]);

  const loadSuggested = () => {
    const newDraft = { ...draft };
    for (const [empresa, meta] of Object.entries(SUGGESTED_METAS)) {
      newDraft[empresa] = String(meta);
    }
    setDraft(newDraft);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const metas = EMPRESAS.filter(emp => {
        const val = parseFloat(draft[emp] ?? "");
        return !isNaN(val) && val > 0;
      }).map(emp => ({
        empresa: emp,
        anio,
        meta: parseFloat(draft[emp]),
      }));

      if (metas.length === 0) {
        showToast("Ingresa al menos una meta");
        setSaving(false);
        return;
      }

      const res = await fetch("/api/ventas/metas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metas }),
      });

      if (res.ok) {
        showToast("Metas guardadas");
        fetchMetas();
      } else {
        showToast("Error al guardar. Intenta de nuevo.");
      }
    } catch {
      showToast("Error de conexion. Verifica tu internet.");
    }
    setSaving(false);
  };

  const updateDraft = (empresa: string, value: string) => {
    setDraft(prev => ({ ...prev, [empresa]: value }));
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  if (!authChecked) return null;

  return (
    <>
      <AppHeader module="Ventas" breadcrumbs={[{ label: "Ventas", onClick: () => router.push("/ventas") }, { label: "Metas" }]} />
      <div className="max-w-7xl mx-auto px-3 sm:px-4 md:px-6 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold">Metas de Ventas</h1>
            <p className="text-xs text-gray-500 mt-1">Define la meta anual por empresa. La distribucion mensual se calcula automaticamente.</p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={anio}
              onChange={e => setAnio(Number(e.target.value))}
              className="text-xs border border-gray-200 rounded-md px-3 py-2 min-h-[44px] bg-white font-medium"
            >
              {[2027, 2026, 2025, 2024].map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2 mb-6">
          <button
            onClick={loadSuggested}
            className="text-xs border border-gray-200 rounded-md px-4 py-2 hover:bg-gray-50 active:bg-gray-100 transition-all min-h-[44px]"
          >
            Cargar metas sugeridas
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="text-xs bg-black text-white rounded-md px-4 py-2 hover:bg-gray-800 active:scale-[0.97] transition-all min-h-[44px] disabled:opacity-50"
          >
            {saving ? "Guardando..." : "Guardar"}
          </button>
        </div>

        {/* Table */}
        {loading ? (
          <div className="animate-pulse space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-10 bg-gray-100 rounded" />
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto border border-gray-200 rounded-lg">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-white z-10">
                <tr className="border-b border-gray-200">
                  <th className="text-left px-3 py-2 font-medium text-gray-500 sticky left-0 bg-white z-20 min-w-[140px]">
                    Empresa
                  </th>
                  <th className="text-right px-3 py-2 font-medium text-gray-500 min-w-[120px]">
                    Meta Anual
                  </th>
                  {MES_NAMES.map(m => (
                    <th key={m} className="text-right px-1.5 py-2 font-medium text-gray-500 whitespace-nowrap min-w-[55px]">
                      {m}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {EMPRESAS.map(empresa => {
                  const rawVal = draft[empresa] ?? "";
                  const metaAnual = parseFloat(rawVal) || 0;
                  const dist = distribucion[empresa] ?? Array(12).fill(1 / 12);

                  return (
                    <tr key={empresa} className="border-b border-gray-50 hover:bg-gray-50/50">
                      <td className="px-3 py-2 font-medium text-gray-700 sticky left-0 bg-white whitespace-nowrap z-10">
                        {empresa}
                      </td>
                      <td className="px-3 py-2">
                        <div className="relative">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">$</span>
                          <input
                            type="text"
                            inputMode="numeric"
                            value={rawVal}
                            onChange={e => {
                              const v = e.target.value.replace(/[^0-9]/g, "");
                              updateDraft(empresa, v);
                            }}
                            placeholder="0"
                            className="w-full text-right text-xs border border-gray-200 rounded px-2 py-1.5 pl-5 tabular-nums min-h-[36px]"
                          />
                        </div>
                        {metaAnual > 0 && (
                          <p className="text-[10px] text-gray-400 text-right mt-0.5">{fmtCurrency(metaAnual)}</p>
                        )}
                      </td>
                      {dist.map((w, i) => {
                        const monthMeta = metaAnual * w;
                        return (
                          <td key={i} className="text-right px-1.5 py-2 tabular-nums text-gray-500">
                            {metaAnual > 0 ? fmtK(monthMeta) : <span className="text-gray-300">—</span>}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}

                {/* Total row */}
                <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold">
                  <td className="px-3 py-2 sticky left-0 bg-gray-50 z-10">TOTAL</td>
                  <td className="text-right px-3 py-2 tabular-nums">
                    {fmtCurrency(
                      EMPRESAS.reduce((s, emp) => s + (parseFloat(draft[emp] ?? "") || 0), 0)
                    )}
                  </td>
                  {MES_NAMES.map((_, i) => {
                    const monthTotal = EMPRESAS.reduce((s, emp) => {
                      const meta = parseFloat(draft[emp] ?? "") || 0;
                      const w = (distribucion[emp] ?? Array(12).fill(1 / 12))[i];
                      return s + meta * w;
                    }, 0);
                    return (
                      <td key={i} className="text-right px-1.5 py-2 tabular-nums text-gray-600">
                        {monthTotal > 0 ? fmtK(monthTotal) : "—"}
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {/* Info */}
        <div className="mt-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
          <p className="text-xs text-gray-500">
            La distribucion mensual se calcula con base en las ventas reales de 2025.
            Si una empresa no tiene datos para todos los meses, los meses faltantes reciben un peso promedio.
          </p>
        </div>
      </div>

      <Toast message={toast} />
    </>
  );
}

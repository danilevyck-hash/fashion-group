"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import { useAuth } from "@/lib/hooks/useAuth";
import { Toast } from "@/components/ui";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

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

// ── Types ──────────────────────────────────────────────────────────────────────

interface MetaResponse {
  empresa: string;
  meta_anual: number;
  distribucion: number[];
}

interface MetaSugeridaRow {
  empresa: string;             // key snake_case
  nombre: string;              // display name
  ventas_prev_year: number;
  ritmo_historico: number | null;
  historia_disponible: number;
  factor_final: number | null;
  meta_sugerida: number | null;
  meta_manual_actual: number | null;
}

interface ProyeccionRow {
  empresa: string;
  nombre: string;
  ritmo_actual: number | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtK(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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

  const [anio, setAnio] = useState(new Date().getFullYear());
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [distribucion, setDistribucion] = useState<Record<string, number[]>>({});
  // Sugerencias auto-calculadas + zona crítica desde RPCs nuevas.
  const [sugeridas, setSugeridas] = useState<Record<string, MetaSugeridaRow>>({});
  const [ritmosActuales, setRitmosActuales] = useState<Record<string, number | null>>({});
  // Distribución mensual oculta por default. Toggle global expande las 12
  // columnas de meses (mucho ruido visual cuando el foco está en configurar
  // la meta anual). En vista compacta cada empresa = una sola fila.
  const [showMonthly, setShowMonthly] = useState(false);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const fetchMetas = useCallback(async () => {
    setLoading(true);
    try {
      // Paralelizar: metas guardadas, sugeridas (RPC ventas_meta_sugerida_v1)
      // y proyección (para ritmo_actual → flag zona crítica).
      const [metasRes, sugRes, proyRes] = await Promise.all([
        fetch(`/api/ventas/metas?anio=${anio}`),
        fetch(`/api/ventas/metas-sugeridas?anio=${anio}`),
        fetch(`/api/ventas/proyeccion-cierre?anio=${anio}`),
      ]);
      if (!metasRes.ok) throw new Error("Error metas");
      const data = await metasRes.json();
      const metas: MetaResponse[] = data.metas ?? [];

      const newDraft: Record<string, string> = {};
      const newDist: Record<string, number[]> = {};
      for (const m of metas) {
        newDraft[m.empresa] = m.meta_anual > 0 ? String(m.meta_anual) : "";
        newDist[m.empresa] = m.distribucion;
      }
      for (const emp of EMPRESAS) {
        if (!(emp in newDraft)) newDraft[emp] = "";
        if (!(emp in newDist)) newDist[emp] = Array(12).fill(1 / 12);
      }
      setDraft(newDraft);
      setDistribucion(newDist);

      // Sugeridas — keyeadas por display name para matchear con EMPRESAS[]
      if (sugRes.ok) {
        const sug = await sugRes.json();
        const map: Record<string, MetaSugeridaRow> = {};
        for (const r of (sug.empresas ?? []) as MetaSugeridaRow[]) map[r.nombre] = r;
        setSugeridas(map);
      } else {
        // Migration aún no aplicada — graceful degrade, sin sugerencias.
        setSugeridas({});
      }

      // Proyección — extraer ritmo_actual por empresa display name.
      if (proyRes.ok) {
        const proy = await proyRes.json();
        const rmap: Record<string, number | null> = {};
        for (const e of (proy.empresas ?? []) as ProyeccionRow[]) rmap[e.nombre] = e.ritmo_actual;
        setRitmosActuales(rmap);
      } else {
        setRitmosActuales({});
      }
    } catch {
      showToast("Error al cargar metas");
    }
    setLoading(false);
  }, [anio]);

  useEffect(() => {
    if (authChecked) fetchMetas();
  }, [authChecked, fetchMetas]);

  // Cargar lista de años dinámica desde ventas_raw + currentYear + 1 (para
  // poder definir meta del año siguiente sin tocar SQL). El endpoint
  // /api/ventas/años ya devuelve min..max de ventas_raw + año actual.
  useEffect(() => {
    if (!authChecked) return;
    fetch("/api/ventas/años")
      .then(r => r.ok ? r.json() : [])
      .then((years: number[]) => {
        const currentYear = new Date().getFullYear();
        const set = new Set<number>(years);
        set.add(currentYear);
        set.add(currentYear + 1); // permitir definir meta del año próximo
        setAvailableYears([...set].sort((a, b) => b - a));
      })
      .catch(() => {
        // Fallback: año actual + próximo
        const cy = new Date().getFullYear();
        setAvailableYears([cy + 1, cy, cy - 1, cy - 2]);
      });
  }, [authChecked]);

  const loadSuggested = () => {
    const newDraft = { ...draft };
    for (const emp of EMPRESAS) {
      const sug = sugeridas[emp];
      if (sug?.meta_sugerida != null && sug.meta_sugerida > 0) {
        newDraft[emp] = String(Math.round(sug.meta_sugerida));
      }
    }
    setDraft(newDraft);
  };

  const applyOne = (empresa: string) => {
    const sug = sugeridas[empresa];
    if (sug?.meta_sugerida == null) return;
    setDraft(prev => ({ ...prev, [empresa]: String(Math.round(sug.meta_sugerida!)) }));
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
              {(availableYears.length > 0 ? availableYears : [anio]).map(y => (
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
            Aplicar todas las sugerencias
          </button>
          <button
            onClick={() => setShowMonthly(v => !v)}
            className="text-xs border border-gray-200 rounded-md px-4 py-2 hover:bg-gray-50 active:bg-gray-100 transition-all min-h-[44px]"
          >
            {showMonthly ? "Ocultar distribución mensual" : "Ver distribución mensual"}
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
                  <th className="text-left px-3 py-2 font-medium text-gray-500 sticky left-0 bg-white z-20 min-w-[180px]">
                    Empresa
                  </th>
                  <th className="text-right px-3 py-2 font-medium text-gray-500 min-w-[420px]">
                    Meta anual
                  </th>
                  {showMonthly && MES_NAMES.map(m => (
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
                  const sug = sugeridas[empresa];
                  const sugMeta = sug?.meta_sugerida ?? null;
                  // Badge "✓ Aplicada" cuando la meta actual coincide con la
                  // sugerida (tolerancia ±$1 para round-trip).
                  const aplicada = sugMeta != null && metaAnual > 0
                    && Math.abs(metaAnual - sugMeta) < 1;
                  // Zona crítica = ritmo actual cayó >15% YTD.
                  const ritmoActual = ritmosActuales[empresa];
                  const zonaCritica = ritmoActual != null && ritmoActual < 0.85;
                  const zonaTooltipMsg = zonaCritica && ritmoActual != null
                    ? `Ritmo real ${(ritmoActual * 100 - 100).toFixed(0)}% YTD. Sugerencia conservadora, considerá ajustar manual.`
                    : "";

                  return (
                    <tr key={empresa} className={cn(
                      "border-b border-gray-50 hover:bg-gray-50/50",
                      zonaCritica && "bg-amber-50/60 hover:bg-amber-50/80",
                    )}>
                      <td className={cn(
                        "px-3 py-2 font-medium text-gray-700 sticky left-0 whitespace-nowrap z-10",
                        zonaCritica ? "bg-amber-50" : "bg-white",
                      )}>
                        <span className="inline-flex items-center gap-1.5">
                          {empresa}
                          {zonaCritica && (
                            <TooltipProvider delayDuration={120}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="inline-flex cursor-help items-center gap-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-widest text-amber-800">
                                    zona crítica
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent side="right" align="start" className="max-w-[260px] text-xs">
                                  {zonaTooltipMsg}
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                        </span>
                      </td>
                      {/* Línea horizontal compacta: input + meta formatted +
                          · Sugerida $X [Aplicar | ✓ Aplicada] */}
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap items-center justify-end gap-x-2 gap-y-1 text-[11px]">
                          <span className="text-gray-500">Meta:</span>
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
                              className="w-32 text-right text-xs border border-gray-200 rounded px-2 py-1.5 pl-5 tabular-nums min-h-[36px]"
                            />
                          </div>
                          {metaAnual > 0 && (
                            <span className="font-mono tabular-nums text-gray-700">{fmtCurrency(metaAnual)}</span>
                          )}
                          {sugMeta != null && (
                            <>
                              <span className="text-gray-300">·</span>
                              <span className="text-gray-500">Sugerida</span>
                              <span className="font-mono tabular-nums text-gray-700">{fmtCurrency(sugMeta)}</span>
                              {aplicada ? (
                                <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
                                  ✓ Aplicada
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => applyOne(empresa)}
                                  className="rounded-md border border-gray-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-gray-700 hover:bg-gray-50 active:scale-[0.97]"
                                >
                                  Aplicar
                                </button>
                              )}
                            </>
                          )}
                          {sug && sugMeta == null && sug.historia_disponible === 0 && (
                            <span className="text-gray-400">· requiere meta manual</span>
                          )}
                        </div>
                      </td>
                      {showMonthly && dist.map((w, i) => {
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
                  {showMonthly && MES_NAMES.map((_, i) => {
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

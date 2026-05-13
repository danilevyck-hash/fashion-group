"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import { useAuth } from "@/lib/hooks/useAuth";
import { Toast } from "@/components/ui";
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

// ── Component ──────────────────────────────────────────────────────────────────

export default function VentasMetasPage() {
  const router = useRouter();
  const { authChecked } = useAuth({ moduleKey: "ventas", allowedRoles: ["admin"] });

  const [anio, setAnio] = useState(new Date().getFullYear());
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  // distribucion se preserva en state para que la API GET la siga populando
  // (se calcula del histórico de ventas_raw y se usa para auditoría server-side
  // al guardar overrides). La UI actual no la renderiza — el cálculo mensual
  // ahora vive sólo en la matriz mes-a-mes del Resumen.
  const [, setDistribucion] = useState<Record<string, number[]>>({});
  // Sugerencias auto-calculadas desde RPC ventas_meta_sugerida_v2.
  const [sugeridas, setSugeridas] = useState<Record<string, MetaSugeridaRow>>({});

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const fetchMetas = useCallback(async () => {
    setLoading(true);
    try {
      // Paralelizar: metas guardadas + sugeridas (RPC ventas_meta_sugerida_v2).
      // La proyección/ritmo_actual ya no se consume acá — la UI de metas se
      // enfoca exclusivamente en el comparativo vs cierre del año anterior.
      const [metasRes, sugRes] = await Promise.all([
        fetch(`/api/ventas/metas?anio=${anio}`),
        fetch(`/api/ventas/metas-sugeridas?anio=${anio}`),
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

      if (sugRes.ok) {
        const sug = await sugRes.json();
        const map: Record<string, MetaSugeridaRow> = {};
        for (const r of (sug.empresas ?? []) as MetaSugeridaRow[]) map[r.nombre] = r;
        setSugeridas(map);
      } else {
        setSugeridas({});
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

  // Guarda overrides + elimina los que el user dejó vacíos. Para cada
  // empresa:
  //   - input > 0  → upsert en ventas_metas (override manual)
  //   - input vacío y existía override antes → DELETE (vuelve a sugerida)
  //   - input vacío y no había override → no-op
  const handleSave = async () => {
    setSaving(true);
    try {
      const toUpsert: { empresa: string; anio: number; meta: number }[] = [];
      const toDelete: string[] = [];
      for (const emp of EMPRESAS) {
        const val = parseFloat(draft[emp] ?? "");
        const hadOverride = (sugeridas[emp]?.meta_manual_actual ?? 0) > 0;
        if (!isNaN(val) && val > 0) {
          toUpsert.push({ empresa: emp, anio, meta: val });
        } else if (hadOverride) {
          toDelete.push(emp);
        }
      }

      if (toUpsert.length === 0 && toDelete.length === 0) {
        showToast("Sin cambios para guardar");
        setSaving(false);
        return;
      }

      // Ejecutar primero deletes (paralelos) y después el upsert batch.
      // Si alguno de los deletes falla, igual procedemos con los upserts
      // pero reportamos en el toast.
      let deleteErrors = 0;
      if (toDelete.length > 0) {
        const results = await Promise.all(toDelete.map(emp =>
          fetch(`/api/ventas/metas?empresa=${encodeURIComponent(emp)}&anio=${anio}`, { method: "DELETE" })
            .then(r => r.ok).catch(() => false)
        ));
        deleteErrors = results.filter(ok => !ok).length;
      }

      let upsertOk = true;
      if (toUpsert.length > 0) {
        const res = await fetch("/api/ventas/metas", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ metas: toUpsert }),
        });
        upsertOk = res.ok;
      }

      if (upsertOk && deleteErrors === 0) {
        showToast("Metas guardadas");
      } else if (!upsertOk) {
        showToast("Error al guardar overrides");
      } else {
        showToast(`Guardado con ${deleteErrors} error(es) al borrar overrides`);
      }
      fetchMetas();
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

  // Cálculos para el hero card del grupo:
  //   metaTotal       = suma de meta efectiva (override > 0 si existe, sino sugerida)
  //   cierreTotalPrev = suma de cierre real del año anterior por empresa
  //   deltaPct        = (metaTotal - cierreTotalPrev) / cierreTotalPrev
  const { metaTotal, cierreTotalPrev, deltaPct } = (() => {
    let meta = 0, cierre = 0;
    for (const emp of EMPRESAS) {
      const sug = sugeridas[emp];
      const sugMeta = sug?.meta_sugerida ?? 0;
      const override = parseFloat(draft[emp] ?? "") || 0;
      meta += override > 0 ? override : sugMeta;
      cierre += sug?.ventas_prev_year ?? 0;
    }
    const dPct = cierre > 0 ? (meta - cierre) / cierre : null;
    return { metaTotal: meta, cierreTotalPrev: cierre, deltaPct: dPct };
  })();

  const prevYear = anio - 1;

  // Joystep y otras empresas sin histórico van al final.
  const empresasOrdenadas = (() => {
    const conHist: string[] = [];
    const sinHist: string[] = [];
    for (const emp of EMPRESAS) {
      const sug = sugeridas[emp];
      const tieneHist = (sug?.ventas_prev_year ?? 0) > 0 && sug?.meta_sugerida != null;
      (tieneHist ? conHist : sinHist).push(emp);
    }
    return [...conHist, ...sinHist];
  })();

  return (
    <>
      <AppHeader module="Ventas" breadcrumbs={[{ label: "Ventas", onClick: () => router.push("/ventas") }, { label: "Metas" }]} />
      <div className="max-w-4xl mx-auto px-3 sm:px-4 md:px-6 py-6 md:py-10">
        {/* Header — Playfair grande + subtítulo */}
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-semibold tracking-tight text-stone-950 md:text-4xl">
              Metas
            </h1>
            <p className="mt-2 text-sm text-stone-500">
              ¿Cuánto le pedís al negocio este año? El sistema sugiere un objetivo por empresa basado en tu histórico.
            </p>
          </div>
          <select
            value={anio}
            onChange={e => setAnio(Number(e.target.value))}
            className="text-xs border border-stone-200 rounded-md px-3 py-2 min-h-[40px] bg-white font-mono tabular-nums font-medium"
          >
            {(availableYears.length > 0 ? availableYears : [anio]).map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>

        {/* Hero card grupo — total agregado vs cierre prev year */}
        {!loading && (
          <section className="mb-8 rounded-lg bg-stone-50 p-6">
            <p className="text-[11px] font-medium uppercase tracking-widest text-stone-500">
              Total del grupo {anio}
            </p>
            <p className="mt-2 font-mono text-4xl font-medium leading-none tabular-nums text-stone-950 md:text-[40px]">
              {fmtCurrencyCompact(metaTotal)}
            </p>
            <p className="mt-3 text-sm text-stone-500">
              {deltaPct != null ? (
                <>
                  <span className={cn(
                    "font-medium",
                    Math.abs(deltaPct) < 0.005 ? "text-stone-700"
                      : deltaPct > 0 ? "text-emerald-700" : "text-red-700",
                  )}>
                    {deltaPct >= 0 ? "+" : ""}{(deltaPct * 100).toFixed(1)}%
                  </span>
                  <span> vs {prevYear} cierre </span>
                  <span className="font-mono tabular-nums text-stone-700">({fmtCurrencyCompact(cierreTotalPrev)})</span>
                </>
              ) : (
                <span>Sin cierre {prevYear} para comparar</span>
              )}
            </p>
          </section>
        )}

        {/* Lista por empresa */}
        {loading ? (
          <div className="animate-pulse space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-16 bg-stone-100 rounded-lg" />
            ))}
          </div>
        ) : (
          <ul className="divide-y divide-stone-100 rounded-lg border border-stone-200 bg-white">
            {empresasOrdenadas.map(empresa => {
              const sug = sugeridas[empresa];
              const sugMeta = sug?.meta_sugerida ?? null;
              const cierrePrev = sug?.ventas_prev_year ?? 0;
              const tieneHist = cierrePrev > 0 && sugMeta != null;
              const rawVal = draft[empresa] ?? "";
              const override = parseFloat(rawVal) || 0;
              // Meta efectiva en este draft (lo que se va a guardar al click Save).
              const metaEfectiva = override > 0 ? override : (sugMeta ?? 0);
              // % vs cierre del año anterior. Si hay override, se recalcula.
              const deltaPctEmpresa = cierrePrev > 0 && metaEfectiva > 0
                ? (metaEfectiva - cierrePrev) / cierrePrev : null;

              return (
                <li key={empresa} className="grid grid-cols-1 items-center gap-3 px-5 py-4 md:grid-cols-[1.2fr_200px_1fr] md:gap-4">
                  {/* Col 1: nombre + cerró 2025 */}
                  <div>
                    <p className="text-sm font-medium text-stone-950">{empresa}</p>
                    <p className="mt-0.5 text-[11px] text-stone-400">
                      {tieneHist
                        ? <>cerró {prevYear} en <span className="font-mono tabular-nums">{fmtCurrencyCompact(cierrePrev)}</span></>
                        : "sin histórico comparable"}
                    </p>
                  </div>
                  {/* Col 2: input */}
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 text-xs">$</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={rawVal}
                      onChange={e => {
                        const v = e.target.value.replace(/[^0-9]/g, "");
                        updateDraft(empresa, v);
                      }}
                      placeholder={sugMeta != null ? Math.round(sugMeta).toLocaleString() : ""}
                      className="w-full text-right text-sm border border-stone-200 rounded-md px-3 py-2 pl-6 tabular-nums font-mono min-h-[40px] focus:border-stone-400 focus:outline-none placeholder:text-stone-400"
                    />
                  </div>
                  {/* Col 3: sugiere +Y% (o requiere manual) */}
                  <div className="text-right">
                    {tieneHist && deltaPctEmpresa != null ? (
                      <p className={cn(
                        "font-mono text-sm tabular-nums",
                        Math.abs(deltaPctEmpresa) < 0.005 ? "text-stone-700"
                          : deltaPctEmpresa > 0 ? "text-emerald-700" : "text-red-700",
                      )}>
                        sugiere {deltaPctEmpresa >= 0 ? "+" : ""}{(deltaPctEmpresa * 100).toFixed(1)}%
                      </p>
                    ) : (
                      <p className="text-xs text-stone-400">requiere manual</p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {/* Botón Guardar */}
        <div className="mt-6 flex items-center justify-end gap-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="text-sm bg-black text-white rounded-md px-5 py-2.5 hover:bg-stone-800 active:scale-[0.97] transition-all min-h-[40px] disabled:opacity-50"
          >
            {saving ? "Guardando..." : "Guardar metas"}
          </button>
        </div>

        {/* Footer informativo */}
        <p className="mt-8 text-[11px] text-stone-400 leading-relaxed max-w-2xl">
          Para sobrescribir una sugerencia, escribí encima. Para volver a la sugerencia, borrá el input.
          Las distribuciones mensuales se calculan automáticamente del histórico de ventas_raw.
        </p>
      </div>

      <Toast message={toast} />
    </>
  );
}

// Versión compacta del formato moneda para el hero ($12.7M en lugar de $12,734,567).
function fmtCurrencyCompact(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(1)}K`;
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

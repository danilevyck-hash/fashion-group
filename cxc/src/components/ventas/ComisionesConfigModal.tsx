"use client";

// Modal de configuración de tasas de comisión GLOBALES por vendedor.
// Tabla: Vendedor | Tasa (% humano) | Origen | Toggle activo.
// El input muestra % humano (0.50) y guarda decimal (0.0050). Nuevos vendedores
// entran con 0.50% (server). Solo admin/director llega acá (gateado en el padre).

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useBodyScrollLock } from "@/lib/hooks/useBodyScrollLock";

interface ConfigRow {
  vendedor_nombre: string;
  tasa_venta: number; // decimal (0.0050 = 0.5%)
  activo: boolean;
  origen: string[];
}

interface ComisionesConfigModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: (msg: string) => void;
}

// decimal ↔ % humano
const toPct = (dec: number): string => (dec * 100).toFixed(2);
// % humano → decimal. parseFloat(pct)/100 evita la pérdida de precisión del
// Math.round previo (que mal-redondeaba tasas con >2 decimales).
const fromPct = (pct: string): number => (parseFloat(pct) || 0) / 100;

export function ComisionesConfigModal({ open, onClose, onSaved }: ComisionesConfigModalProps) {
  const [mounted, setMounted] = useState(false);
  const [rows, setRows] = useState<ConfigRow[]>([]);
  const [pctInputs, setPctInputs] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setMounted(true), []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ventas/comisiones/config", { cache: "no-store" });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { vendedores: ConfigRow[] };
      setRows(data.vendedores);
      setPctInputs(
        Object.fromEntries(data.vendedores.map((r) => [r.vendedor_nombre, toPct(r.tasa_venta)])),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar la configuración.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  // Bloquea scroll del body mientras está abierto (hook compartido con ref-count).
  useBodyScrollLock(open);

  // Escape para cerrar.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !saving) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, saving, onClose]);

  if (!open || !mounted) return null;

  const setPct = (nombre: string, value: string) =>
    setPctInputs((prev) => ({ ...prev, [nombre]: value }));

  const toggleActivo = (nombre: string) =>
    setRows((prev) => prev.map((r) => (r.vendedor_nombre === nombre ? { ...r, activo: !r.activo } : r)));

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const updates = rows.map((r) => {
        const raw = pctInputs[r.vendedor_nombre] ?? toPct(r.tasa_venta);
        const tasa = fromPct(raw);
        if (!Number.isFinite(tasa) || tasa < 0 || tasa > 0.2) {
          throw new Error(`Tasa inválida para ${r.vendedor_nombre} (0% a 20%)`);
        }
        return { vendedor_nombre: r.vendedor_nombre, tasa_venta: tasa, activo: r.activo };
      });
      const res = await fetch("/api/ventas/comisiones/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error ?? `HTTP ${res.status}`);
      }
      onSaved("Tasas guardadas");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar. Intenta de nuevo.");
    } finally {
      setSaving(false);
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
      onClick={() => { if (!saving) onClose(); }}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-gray-200 bg-white"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <h2 className="text-base font-medium">Configurar comisiones</h2>
          <button
            onClick={() => { if (!saving) onClose(); }}
            className="text-2xl leading-none text-gray-400 hover:text-black"
          >
            ×
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="py-12 text-center text-sm text-gray-500">Cargando…</div>
          ) : rows.length === 0 ? (
            <div className="py-12 text-center text-sm text-gray-500">
              Aún no hay vendedores. Aparecerán tras el próximo sync de Switch.
            </div>
          ) : (
            <table className="w-full text-sm [&_th]:px-3.5 [&_td]:px-3.5 [&_th:first-child]:pl-0 [&_td:first-child]:pl-0 [&_th:last-child]:pr-0 [&_td:last-child]:pr-0">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
                  <th className="px-2 py-2 font-medium">Vendedor</th>
                  <th className="px-2 py-2 text-right font-medium">Tasa</th>
                  <th className="px-2 py-2 font-medium">Origen</th>
                  <th className="px-2 py-2 text-right font-medium">Activo</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.vendedor_nombre} className="border-b border-gray-100 last:border-0">
                    <td className="px-2 py-2.5 text-gray-900">{r.vendedor_nombre}</td>
                    <td className="px-2 py-2.5 text-right">
                      <div className="inline-flex items-center gap-1">
                        <input
                          type="number"
                          inputMode="decimal"
                          step="0.05"
                          min="0"
                          max="20"
                          value={pctInputs[r.vendedor_nombre] ?? ""}
                          onChange={(e) => setPct(r.vendedor_nombre, e.target.value)}
                          className="w-20 rounded-md border border-gray-200 px-2 py-1.5 text-right text-sm tabular-nums outline-none transition focus:border-black"
                        />
                        <span className="text-gray-400">%</span>
                      </div>
                    </td>
                    <td className="px-2 py-2.5 text-xs text-gray-500">
                      {r.origen.length > 0 ? r.origen.join(", ") : "—"}
                    </td>
                    <td className="px-2 py-2.5 text-right">
                      <button
                        type="button"
                        onClick={() => toggleActivo(r.vendedor_nombre)}
                        aria-pressed={r.activo}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                          r.activo ? "bg-teal-600" : "bg-gray-300"
                        }`}
                      >
                        <span
                          className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                            r.activo ? "translate-x-5" : "translate-x-0.5"
                          }`}
                        />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {error && <p className="mt-3 text-xs text-rose-600">{error}</p>}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-gray-100 px-5 py-4">
          <p className="text-xs text-gray-400">Los vendedores nuevos entran con 0.50%.</p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { if (!saving) onClose(); }}
              disabled={saving}
              className="rounded-md px-4 py-2 text-sm text-gray-500 transition hover:text-black disabled:opacity-40"
            >
              Cancelar
            </button>
            <button
              onClick={save}
              disabled={saving || loading || rows.length === 0}
              className="rounded-md bg-black px-5 py-2 text-sm font-medium text-white transition-all hover:bg-gray-800 active:scale-[0.97] disabled:opacity-50"
            >
              {saving ? "Guardando…" : "Guardar cambios"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

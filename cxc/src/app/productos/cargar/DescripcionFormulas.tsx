"use client";

import { useEffect, useMemo, useState } from "react";
import {
  MARCA_CATALOGO,
  descripcionesDeMarca,
  marcaRubroKey,
  type Redondeo,
  type MarcaRubroFormula,
} from "@/lib/depurador/logic";

interface Edit { divisor: number; extra: number; redondeo: Redondeo; dirty: boolean }

function compactFormula(d: { divisor: number; extra: number; redondeo: Redondeo }): string {
  const ex = d.extra > 0 ? ` + ${d.extra}` : "";
  const r = d.redondeo === "half" ? " → .50" : " → entero";
  return `TECHO(CIF ÷ ${d.divisor || "—"})${ex}${r}`;
}

const selCls = "h-8 rounded-md border border-stone-300 bg-stone-50 px-2 text-[13px] focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20";
const numCls = "h-8 w-20 rounded-md border border-stone-300 bg-stone-50 px-2 text-right font-mono text-[13px] focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20";

export default function DescripcionFormulas({ refreshKey = 0 }: { refreshKey?: number }) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [saved, setSaved] = useState<MarcaRubroFormula[]>([]);
  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [flashKey, setFlashKey] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = () => {
    fetch("/api/productos/cargar/rubro-formulas")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("fetch"))))
      .then((d: { rows: MarcaRubroFormula[] }) => setSaved(d.rows ?? []))
      .catch(() => setError("No se pudieron cargar las fórmulas por descripción."));
  };
  useEffect(() => { load(); }, [refreshKey]);

  const savedByKey = useMemo(() => {
    const m = new Map<string, MarcaRubroFormula>();
    for (const f of saved) m.set(marcaRubroKey(f.marca, f.rubro), f);
    return m;
  }, [saved]);

  const toggle = (marca: string) =>
    setOpen((prev) => { const n = new Set(prev); if (n.has(marca)) n.delete(marca); else n.add(marca); return n; });

  const rowFor = (marca: string, desc: string) => {
    const key = marcaRubroKey(marca, desc);
    const e = edits[key];
    const s = savedByKey.get(key);
    return {
      key,
      divisor: e ? e.divisor : (s?.divisor ?? 0),
      extra: e ? e.extra : (s?.extra ?? 0),
      redondeo: e ? e.redondeo : (s?.redondeo ?? "int"),
      savedRow: s,
      saved: !!s && !!s.divisor,
      dirty: !!e?.dirty,
    };
  };

  const patch = (marca: string, desc: string, p: Partial<Pick<Edit, "divisor" | "extra" | "redondeo">>) => {
    const r = rowFor(marca, desc);
    setEdits((prev) => ({ ...prev, [r.key]: { divisor: r.divisor, extra: r.extra, redondeo: r.redondeo, ...p, dirty: true } }));
  };

  const save = async (marca: string, desc: string) => {
    const r = rowFor(marca, desc);
    if (busyKey) return;
    setError(""); setBusyKey(r.key);
    try {
      // En blanco (divisor 0) = usa la fórmula de la marca → borra la excepción si existía.
      if (!r.divisor) {
        if (r.savedRow?.id) {
          const res = await fetch(`/api/productos/cargar/rubro-formulas?id=${encodeURIComponent(r.savedRow.id)}`, { method: "DELETE" });
          if (!res.ok) throw new Error("No se pudo guardar.");
          load();
        }
      } else {
        const res = await fetch("/api/productos/cargar/rubro-formulas", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ marca, rubro: desc, divisor: r.divisor, extra: r.extra, redondeo: r.redondeo }),
        });
        if (!res.ok) { const d = await res.json().catch(() => null); throw new Error(d?.error || "No se pudo guardar."); }
        load();
      }
      setEdits((prev) => { const n = { ...prev }; delete n[r.key]; return n; });
      setFlashKey(r.key);
      setTimeout(() => setFlashKey((f) => (f === r.key ? null : f)), 1500);
    } catch (e) { setError(e instanceof Error ? e.message : "Error al guardar."); }
    finally { setBusyKey(null); }
  };

  return (
    <div>
      <p className="mb-3 max-w-2xl text-[13px] text-stone-600">
        Una descripción puede tener su propia fórmula. Si existe, se usa esa en vez de la fórmula de la marca.
        Déjala en blanco para usar la fórmula de la marca. Abre solo las marcas que vas a editar.
      </p>

      {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-800">{error}</div>}

      {MARCA_CATALOGO.map((c) => {
        const descs = descripcionesDeMarca(c.marca);
        const isOpen = open.has(c.marca);
        const conFormula = descs.filter((d) => (savedByKey.get(marcaRubroKey(c.marca, d))?.divisor || 0) > 0).length;
        return (
          <div key={c.marca} className="mb-2 overflow-hidden rounded-lg border border-stone-200 bg-white">
            <button
              type="button"
              onClick={() => toggle(c.marca)}
              className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left transition hover:bg-stone-50"
            >
              <span className="font-semibold text-stone-900">
                <span className="mr-1.5 text-stone-400">{isOpen ? "▾" : "▸"}</span>{c.marca}
              </span>
              <span className="text-[12px] text-stone-500">
                {descs.length} descripciones
                {conFormula > 0 && <> · <b className="text-emerald-700">{conFormula} con fórmula propia</b></>}
              </span>
            </button>

            {isOpen && (
              <div className="overflow-x-auto border-t border-stone-200 px-3 py-2">
                <table className="w-full border-collapse text-[13.5px]">
                  <thead>
                    <tr>
                      {["Descripción", "Divisor", "Extra $", "Redondeo", "Fórmula resultante", ""].map((h, i) => (
                        <th key={i} className="border-b-[1.5px] border-stone-300 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-stone-500">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {descs.map((desc) => {
                      const r = rowFor(c.marca, desc);
                      return (
                        <tr key={desc} className="hover:bg-teal-50">
                          <td className="border-b border-stone-100 px-3 py-2">
                            <span className="font-medium text-stone-900">{desc}</span>
                            {r.saved && !r.dirty && <span className="ml-2 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">Excepción</span>}
                          </td>
                          <td className="border-b border-stone-100 px-3 py-2">
                            <input type="number" step="0.01" value={r.divisor || ""} placeholder="—"
                              onChange={(e) => patch(c.marca, desc, { divisor: Number(e.target.value) || 0 })} className={numCls} />
                          </td>
                          <td className="border-b border-stone-100 px-3 py-2">
                            <select value={r.extra} onChange={(e) => patch(c.marca, desc, { extra: parseInt(e.target.value) })} className={selCls}>
                              {[0, 1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                            </select>
                          </td>
                          <td className="border-b border-stone-100 px-3 py-2">
                            <select value={r.redondeo} onChange={(e) => patch(c.marca, desc, { redondeo: e.target.value as Redondeo })} className={selCls}>
                              <option value="int">Entero</option>
                              <option value="half">.50</option>
                            </select>
                          </td>
                          <td className="border-b border-stone-100 px-3 py-2 font-mono text-[12px] text-stone-500">
                            {r.divisor ? compactFormula(r) : <span className="text-stone-400">usa la de la marca</span>}
                          </td>
                          <td className="border-b border-stone-100 px-3 py-2 whitespace-nowrap">
                            <button type="button" onClick={() => save(c.marca, desc)} disabled={busyKey === r.key}
                              className={`rounded-md px-2 py-1 text-[12px] font-semibold transition disabled:opacity-50 ${r.dirty ? "bg-amber-500 text-white hover:bg-amber-600" : "text-teal-700 hover:bg-teal-50"}`}>
                              {busyKey === r.key ? "…" : r.dirty ? "Guardar" : "Guardado"}
                            </button>
                            {flashKey === r.key && <span className="ml-2 text-[11px] font-semibold text-emerald-600">✓</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

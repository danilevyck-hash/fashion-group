"use client";

import { useEffect, useRef, useState } from "react";
import { MARCA_CATALOGO, type Redondeo, type MarcaRubroFormula } from "@/lib/depurador/logic";

interface ExcRow extends MarcaRubroFormula {
  dirty?: boolean;
}
interface DraftRow {
  id: string;
  marca: string;
  rubro: string;
  divisor: number;
  extra: number;
  redondeo: Redondeo;
}

function compactFormula(d: { divisor: number; extra: number; redondeo: Redondeo }): string {
  const ex = d.extra > 0 ? ` + ${d.extra}` : "";
  const r = d.redondeo === "half" ? " → .50" : " → entero";
  return `TECHO(CIF ÷ ${d.divisor || "—"})${ex}${r}`;
}

const selCls = "rounded-md border border-stone-300 bg-stone-50 px-2 py-1 text-[13px] focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20";
const numCls = "w-20 rounded-md border border-stone-300 bg-stone-50 px-2 py-1 text-right font-mono text-[13px] focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20";
const rubroInputCls = "w-44 rounded-md border border-stone-300 bg-stone-50 px-2 py-1 text-[13px] uppercase focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20";

export default function RubroExcepciones() {
  const [saved, setSaved] = useState<ExcRow[]>([]);
  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [flashId, setFlashId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const ctr = useRef(0);

  const load = () => {
    fetch("/api/productos/cargar/rubro-formulas")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("fetch"))))
      .then((d: { rows: MarcaRubroFormula[] }) => setSaved((d.rows ?? []).map((r) => ({ ...r, dirty: false }))))
      .catch(() => setError("No se pudieron cargar las excepciones."));
  };
  useEffect(() => { load(); }, []);

  const addDraft = () => {
    ctr.current += 1;
    setDrafts((prev) => [
      { id: `d-${ctr.current}`, marca: MARCA_CATALOGO[0].marca, rubro: "", divisor: 0, extra: 0, redondeo: "int" },
      ...prev,
    ]);
  };

  const put = async (body: { marca: string; rubro: string; divisor: number; extra: number; redondeo: Redondeo }) => {
    const res = await fetch("/api/productos/cargar/rubro-formulas", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => null);
      throw new Error(d?.error || "No se pudo guardar la excepción.");
    }
  };

  const saveDraft = async (id: string) => {
    const d = drafts.find((x) => x.id === id);
    if (!d || busyId) return;
    if (!d.rubro.trim()) { setError("Escribe el rubro de la excepción."); return; }
    setError(""); setBusyId(id);
    try {
      await put({ marca: d.marca, rubro: d.rubro.trim(), divisor: d.divisor, extra: d.extra, redondeo: d.redondeo });
      setDrafts((prev) => prev.filter((x) => x.id !== id));
      load();
    } catch (e) { setError(e instanceof Error ? e.message : "Error al guardar."); }
    finally { setBusyId(null); }
  };

  const saveRow = async (row: ExcRow) => {
    if (busyId) return;
    setError(""); setBusyId(row.id!);
    try {
      await put({ marca: row.marca, rubro: row.rubro, divisor: row.divisor, extra: row.extra, redondeo: row.redondeo });
      setSaved((prev) => prev.map((r) => (r.id === row.id ? { ...r, dirty: false } : r)));
      setFlashId(row.id!);
      setTimeout(() => setFlashId((f) => (f === row.id ? null : f)), 1500);
    } catch (e) { setError(e instanceof Error ? e.message : "Error al guardar."); }
    finally { setBusyId(null); }
  };

  const deleteRow = async (row: ExcRow) => {
    if (busyId) return;
    setError(""); setBusyId(row.id!);
    try {
      const res = await fetch(`/api/productos/cargar/rubro-formulas?id=${encodeURIComponent(row.id!)}`, { method: "DELETE" });
      if (!res.ok) throw new Error("No se pudo borrar.");
      load();
    } catch (e) { setError(e instanceof Error ? e.message : "Error al borrar."); }
    finally { setBusyId(null); }
  };

  const patchDraft = (id: string, patch: Partial<DraftRow>) =>
    setDrafts((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const patchRow = (id: string, patch: Partial<ExcRow>) =>
    setSaved((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch, dirty: true } : x)));

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="max-w-xl text-[13px] text-stone-600">
          Una descripción puede tener su propia fórmula. Si existe, se usa esa en vez de la fórmula de la marca.
        </p>
        <button
          type="button"
          onClick={addDraft}
          className="whitespace-nowrap rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-700 active:scale-[0.97]"
        >
          + Agregar
        </button>
      </div>

      {error && <div className="my-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-800">{error}</div>}

      {(drafts.length > 0 || saved.length > 0) ? (
        <table className="mt-3 w-full border-collapse text-[13.5px]">
          <thead>
            <tr>
              {["Marca", "Descripción", "Divisor", "Extra $", "Redondeo", "Fórmula resultante", ""].map((h, i) => (
                <th key={i} className="border-b-[1.5px] border-stone-300 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-stone-500">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* Borradores (nuevas, aún sin guardar) */}
            {drafts.map((d) => (
              <tr key={d.id} className="bg-amber-50/40 hover:bg-amber-50">
                <td className="border-b border-stone-100 px-3 py-2">
                  <select value={d.marca} onChange={(e) => patchDraft(d.id, { marca: e.target.value })} className={selCls}>
                    {MARCA_CATALOGO.map((c) => <option key={c.marca} value={c.marca}>{c.marca}</option>)}
                  </select>
                </td>
                <td className="border-b border-stone-100 px-3 py-2">
                  <input value={d.rubro} onChange={(e) => patchDraft(d.id, { rubro: e.target.value })} placeholder="Ej. BOXER BRIEF" className={rubroInputCls} />
                </td>
                <td className="border-b border-stone-100 px-3 py-2">
                  <input type="number" step="0.01" value={d.divisor || ""} onChange={(e) => patchDraft(d.id, { divisor: Number(e.target.value) || 0 })} className={numCls} />
                </td>
                <td className="border-b border-stone-100 px-3 py-2">
                  <select value={d.extra} onChange={(e) => patchDraft(d.id, { extra: parseInt(e.target.value) })} className={selCls}>
                    {[0, 1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </td>
                <td className="border-b border-stone-100 px-3 py-2">
                  <select value={d.redondeo} onChange={(e) => patchDraft(d.id, { redondeo: e.target.value as Redondeo })} className={selCls}>
                    <option value="int">Entero</option>
                    <option value="half">.50</option>
                  </select>
                </td>
                <td className="border-b border-stone-100 px-3 py-2 font-mono text-[12px] text-stone-500">{compactFormula(d)}</td>
                <td className="border-b border-stone-100 px-3 py-2 whitespace-nowrap">
                  <button type="button" onClick={() => saveDraft(d.id)} disabled={busyId === d.id} className="rounded-md bg-amber-500 px-2 py-1 text-[12px] font-semibold text-white transition hover:bg-amber-600 disabled:opacity-50">
                    {busyId === d.id ? "Guardando…" : "Guardar"}
                  </button>
                  <button type="button" onClick={() => setDrafts((prev) => prev.filter((x) => x.id !== d.id))} className="ml-1 px-1.5 py-1 text-[12px] font-medium text-stone-500 hover:text-stone-800">
                    Quitar
                  </button>
                </td>
              </tr>
            ))}
            {/* Guardadas */}
            {saved.map((row) => (
              <tr key={row.id} className="hover:bg-teal-50">
                <td className="border-b border-stone-100 px-3 py-2 font-semibold text-stone-900">{row.marca}</td>
                <td className="border-b border-stone-100 px-3 py-2 font-medium text-stone-700">{row.rubro}</td>
                <td className="border-b border-stone-100 px-3 py-2">
                  <input type="number" step="0.01" value={row.divisor || ""} onChange={(e) => patchRow(row.id!, { divisor: Number(e.target.value) || 0 })} className={numCls} />
                </td>
                <td className="border-b border-stone-100 px-3 py-2">
                  <select value={row.extra} onChange={(e) => patchRow(row.id!, { extra: parseInt(e.target.value) })} className={selCls}>
                    {[0, 1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </td>
                <td className="border-b border-stone-100 px-3 py-2">
                  <select value={row.redondeo} onChange={(e) => patchRow(row.id!, { redondeo: e.target.value as Redondeo })} className={selCls}>
                    <option value="int">Entero</option>
                    <option value="half">.50</option>
                  </select>
                </td>
                <td className="border-b border-stone-100 px-3 py-2 font-mono text-[12px] text-stone-500">{compactFormula(row)}</td>
                <td className="border-b border-stone-100 px-3 py-2 whitespace-nowrap">
                  <button type="button" onClick={() => saveRow(row)} disabled={busyId === row.id}
                    className={`rounded-md px-2 py-1 text-[12px] font-semibold transition disabled:opacity-50 ${row.dirty ? "bg-amber-500 text-white hover:bg-amber-600" : "text-teal-700 hover:bg-teal-50"}`}>
                    {busyId === row.id ? "…" : row.dirty ? "Guardar" : "Guardado"}
                  </button>
                  <button type="button" onClick={() => deleteRow(row)} disabled={busyId === row.id} className="ml-1 px-1.5 py-1 text-[12px] font-medium text-red-600 hover:text-red-800 disabled:opacity-50">
                    Borrar
                  </button>
                  {flashId === row.id && <span className="ml-2 text-[11px] font-semibold text-emerald-600">✓</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="py-6 text-center text-[13px] text-stone-400">
          Ninguna descripción tiene fórmula propia todavía. Usa &quot;Agregar&quot; para crear una.
        </p>
      )}
    </div>
  );
}

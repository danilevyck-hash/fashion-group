"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { EMPRESAS_DESTINO, MARCA_CATALOGO, norm, marcaKey, type Redondeo, type MarcaFormula } from "@/lib/depurador/logic";

interface EditRow {
  id: string;
  marca: string;
  empresa: string | null;
  divisor: number;
  extra: number;
  redondeo: Redondeo;
  saved: boolean;   // tiene fórmula persistida en marca_formulas
  isNew: boolean;   // fila agregada a mano, aún sin guardar
  dirty: boolean;   // editada desde la última carga/guardado
}

// Grupos por empresa (las 3 fijas) + un grupo "Otras" para el resto / sin empresa.
const EMPRESA_GROUPS = [
  ...EMPRESAS_DESTINO.map((e) => ({ label: e.label, marca: e.marca })),
  { label: "", marca: "" }, // "Otras"
];

const CATALOG_KEYS = new Set(MARCA_CATALOGO.map((c) => marcaKey(c.marca)));

function compactFormula(d: { divisor: number; extra: number; redondeo: Redondeo }): string {
  const ex = d.extra > 0 ? ` + ${d.extra}` : "";
  const r = d.redondeo === "half" ? " → .50" : " → entero";
  return `TECHO(CIF ÷ ${d.divisor || "—"})${ex}${r}`;
}

function mkRow(marca: string, empresa: string | null, saved?: MarcaFormula): EditRow {
  return {
    id: `m-${marcaKey(marca)}`,
    marca,
    empresa,
    divisor: saved?.divisor ?? 0,
    extra: saved?.extra ?? 0,
    redondeo: saved?.redondeo ?? "int",
    saved: !!saved,
    isNew: false,
    dirty: false,
  };
}

export default function FormulasConfig() {
  const [rows, setRows] = useState<EditRow[]>(() =>
    MARCA_CATALOGO.map((c) => mkRow(c.marca, c.empresa)) // catálogo visible de entrada
  );
  const [search, setSearch] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [flashId, setFlashId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const newCounter = useRef(0);

  useEffect(() => {
    let alive = true;
    fetch("/api/productos/cargar/formulas")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("fetch"))))
      .then((d: { rows: MarcaFormula[] }) => {
        if (!alive) return;
        const saved = d.rows ?? [];
        const byKey = new Map(saved.map((f) => [marcaKey(f.marca), f] as const));
        // Catálogo fijo (mergeado con lo guardado) + fórmulas guardadas fuera del catálogo.
        const catalogRows = MARCA_CATALOGO.map((c) => mkRow(c.marca, c.empresa, byKey.get(marcaKey(c.marca))));
        const extraRows = saved
          .filter((f) => !CATALOG_KEYS.has(marcaKey(f.marca)))
          .map((f) => mkRow(f.marca, f.empresa ?? null, f));
        setRows([...catalogRows, ...extraRows]);
      })
      .catch(() => { if (alive) setError("No se pudieron cargar las fórmulas guardadas (el catálogo igual está editable)."); });
    return () => { alive = false; };
  }, []);

  const patchRow = (id: string, patch: Partial<EditRow>) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch, dirty: true } : r)));

  const addRow = () => {
    newCounter.current += 1;
    setRows((prev) => [
      { id: `new-${newCounter.current}`, marca: "", empresa: EMPRESAS_DESTINO[0].label, divisor: 0, extra: 0, redondeo: "int", saved: false, isNew: true, dirty: true },
      ...prev,
    ]);
  };

  const saveRow = async (id: string) => {
    const row = rows.find((r) => r.id === id);
    if (!row || savingId) return;
    if (!row.marca.trim()) { setError("Escribe el nombre de la marca antes de guardar."); return; }
    setError("");
    setSavingId(id);
    try {
      const res = await fetch("/api/productos/cargar/formulas", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          marca: row.marca.trim(),
          empresa: row.empresa || null,
          divisor: row.divisor,
          extra: row.extra,
          redondeo: row.redondeo,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        setError(d?.error || "No se pudo guardar la fórmula.");
        return;
      }
      // Guardada: marca saved, limpia dirty/isNew y descarta duplicados por marca.
      setRows((prev) => {
        const key = marcaKey(row.marca);
        return prev
          .filter((r) => r.id === id || marcaKey(r.marca) !== key)
          .map((r) => (r.id === id ? { ...r, saved: true, isNew: false, dirty: false, marca: row.marca.trim() } : r));
      });
      setFlashId(id);
      setTimeout(() => setFlashId((f) => (f === id ? null : f)), 1500);
    } finally {
      setSavingId(null);
    }
  };

  const filtered = useMemo(() => {
    const q = norm(search);
    return q ? rows.filter((r) => norm(r.marca).includes(q)) : rows;
  }, [rows, search]);

  const nuevas = filtered.filter((r) => r.isNew);

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <div className="mb-5 border-b-2 border-stone-900 pb-4">
        <h2 className="font-serif text-2xl font-semibold tracking-tight text-stone-900">
          Configuración de fórmulas por marca
        </h2>
      </div>

      <div className="mb-4 rounded-lg border border-stone-200 bg-white px-3.5 py-2.5 text-[13px] text-stone-600">
        <b className="text-teal-800">Fórmula:</b> precio = TECHO(Costo CIF ÷ divisor) + extra, redondeado
        hacia arriba (al entero o a .50). El Costo CIF ya es costo × 1.1.
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      )}

      <div className="mb-4 flex items-center justify-between gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar marca…"
          className="w-full max-w-xs rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
        />
        <button
          type="button"
          onClick={addRow}
          className="whitespace-nowrap rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-700 active:scale-[0.97]"
        >
          + Agregar marca
        </button>
      </div>

      {/* Nuevas marcas (aún sin guardar) */}
      {nuevas.length > 0 && (
        <div className="mb-6">
          <div className="mb-1 border-b border-stone-200 py-2 text-[13px] font-bold uppercase tracking-wide text-teal-800">
            Nuevas marcas
          </div>
          <table className="w-full border-collapse text-[13.5px]">
            <thead>
              <tr>
                {["Marca", "Empresa", "Divisor", "Extra $", "Redondeo", "Fórmula", ""].map((h, i) => (
                  <th key={i} className="border-b-[1.5px] border-stone-300 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-stone-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {nuevas.map((row) => (
                <tr key={row.id} className="hover:bg-teal-50">
                  <td className="border-b border-stone-100 px-3 py-2">
                    <input
                      value={row.marca}
                      onChange={(e) => patchRow(row.id, { marca: e.target.value })}
                      placeholder="Nombre de la marca"
                      className="w-40 rounded-md border border-stone-300 bg-stone-50 px-2 py-1 text-[13px] focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
                    />
                  </td>
                  <td className="border-b border-stone-100 px-3 py-2">
                    <select value={row.empresa ?? ""} onChange={(e) => patchRow(row.id, { empresa: e.target.value || null })} className={selCls}>
                      {EMPRESAS_DESTINO.map((e) => <option key={e.key} value={e.label}>{e.label}</option>)}
                      <option value="">Otras</option>
                    </select>
                  </td>
                  <FormulaCells row={row} patchRow={patchRow} />
                  <SaveCell row={row} savingId={savingId} flashId={flashId} onSave={saveRow} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Grupos por empresa (catálogo fijo + guardadas) */}
      {EMPRESA_GROUPS.map((g) => {
        const groupRows = filtered.filter(
          (r) => !r.isNew && (g.label ? r.empresa === g.label : !EMPRESAS_DESTINO.some((e) => e.label === r.empresa))
        );
        if (groupRows.length === 0) return null;
        return (
          <div key={g.label || "otras"} className="mb-7">
            <div className="mb-1 border-b border-stone-200 py-2 text-[13px] font-bold uppercase tracking-wide text-teal-800">
              {g.label || "Otras"}
              {g.marca && <span className="ml-2 text-[12px] font-normal normal-case tracking-normal text-stone-500">· {g.marca}</span>}
            </div>
            <table className="w-full border-collapse text-[13.5px]">
              <thead>
                <tr>
                  {["Marca", "Divisor", "Extra $", "Redondeo", "Fórmula resultante", ""].map((h, i) => (
                    <th key={i} className="border-b-[1.5px] border-stone-300 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-stone-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {groupRows.map((row) => (
                  <tr key={row.id} className="hover:bg-teal-50">
                    <td className="border-b border-stone-100 px-3 py-2">
                      <span className="font-semibold text-stone-900">{row.marca}</span>
                      {row.saved && !row.dirty
                        ? <span className="ml-2 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">Guardada</span>
                        : <span className="ml-2 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">Sin guardar</span>}
                    </td>
                    <FormulaCells row={row} patchRow={patchRow} />
                    <SaveCell row={row} savingId={savingId} flashId={flashId} onSave={saveRow} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}

// ── Celdas reutilizables ────────────────────────────────────────────────────
const selCls = "rounded-md border border-stone-300 bg-stone-50 px-2 py-1 text-[13px] focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20";

function FormulaCells({ row, patchRow }: { row: EditRow; patchRow: (id: string, p: Partial<EditRow>) => void }) {
  return (
    <>
      <td className="border-b border-stone-100 px-3 py-2">
        <input
          type="number" step="0.01" value={row.divisor || ""}
          onChange={(e) => patchRow(row.id, { divisor: Number(e.target.value) || 0 })}
          className="w-20 rounded-md border border-stone-300 bg-stone-50 px-2 py-1 text-right font-mono text-[13px] focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
        />
      </td>
      <td className="border-b border-stone-100 px-3 py-2">
        <select value={row.extra} onChange={(e) => patchRow(row.id, { extra: parseInt(e.target.value) })} className={selCls}>
          {[0, 1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </td>
      <td className="border-b border-stone-100 px-3 py-2">
        <select value={row.redondeo} onChange={(e) => patchRow(row.id, { redondeo: e.target.value as Redondeo })} className={selCls}>
          <option value="int">Entero</option>
          <option value="half">.50</option>
        </select>
      </td>
      <td className="border-b border-stone-100 px-3 py-2 font-mono text-[12px] text-stone-500">{compactFormula(row)}</td>
    </>
  );
}

function SaveCell({ row, savingId, flashId, onSave }: { row: EditRow; savingId: string | null; flashId: string | null; onSave: (id: string) => void }) {
  const saving = savingId === row.id;
  const flashed = flashId === row.id;
  const label = saving ? "Guardando…" : row.dirty ? "Guardar" : row.saved ? "Guardado" : "Guardar";
  return (
    <td className="border-b border-stone-100 px-3 py-2 whitespace-nowrap">
      <button
        type="button"
        onClick={() => onSave(row.id)}
        disabled={saving}
        className={`rounded-md px-2 py-1 text-[12px] font-semibold transition disabled:opacity-50 ${
          row.dirty ? "bg-amber-500 text-white hover:bg-amber-600" : "text-teal-700 hover:bg-teal-50"
        }`}
      >
        {label}
      </button>
      {flashed && <span className="ml-2 text-[11px] font-semibold text-emerald-600">✓ guardado</span>}
    </td>
  );
}

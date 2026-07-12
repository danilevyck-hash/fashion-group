"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  EMPRESAS_DESTINO, MARCA_CATALOGO, descripcionesDeMarca, norm, marcaKey, marcaRubroKey,
  type Redondeo, type MarcaFormula, type MarcaRubroFormula,
} from "@/lib/depurador/logic";
import { TIENDA_MARCA_CATALOGO } from "@/lib/depurador/tienda";
import BulkExcel from "./BulkExcel";

// ── Modelos ──────────────────────────────────────────────────────────────────
interface MarcaRow {
  id: string;
  marca: string;
  empresa: string | null;
  divisor: number;
  extra: number;
  redondeo: Redondeo;
  saved: boolean;   // tiene fórmula persistida en marca_formulas
  isNew: boolean;   // fila agregada a mano, aún sin guardar
  dirty: boolean;
}
type DescModo = "formula" | "fijo";
interface DescEdit { divisor: number; extra: number; redondeo: Redondeo; precioFijo: number | null; modo: DescModo; dirty: boolean }
interface DescRowState {
  key: string; divisor: number; extra: number; redondeo: Redondeo;
  precioFijo: number | null; modo: DescModo;
  savedRow?: MarcaRubroFormula;
  propia: boolean;  // tiene precio propio (fórmula propia o precio fijo)
  fija: boolean;    // tiene precio fijo activo
  dirty: boolean;
}

// Empresas (4 destinos) + "Otras" para lo que quede fuera.
const EMPRESA_GROUPS = [
  ...EMPRESAS_DESTINO.map((e) => ({ label: e.label, marca: e.marca })),
  { label: "", marca: "" },
];

// Set de fórmulas: "depurador" (importación de proveedores, tablas marca_formulas)
// o "tienda" (Facturas Tienda → Multifashion/ACS, tablas tienda_*). MISMA UI,
// endpoints y catálogo distintos. Default depurador = comportamiento original.
export type FormulasScope = "depurador" | "tienda";

const SCOPE_CONFIG: Record<FormulasScope, {
  formulasApi: string;
  rubroApi: string;
  catalogo: { marca: string; empresa: string }[];
  grupos: { label: string; marca: string }[];
}> = {
  depurador: {
    formulasApi: "/api/productos/cargar/formulas",
    rubroApi: "/api/productos/cargar/rubro-formulas",
    catalogo: MARCA_CATALOGO,
    grupos: EMPRESA_GROUPS,
  },
  tienda: {
    formulasApi: "/api/productos/cargar/tienda-formulas",
    rubroApi: "/api/productos/cargar/tienda-rubro-formulas",
    catalogo: TIENDA_MARCA_CATALOGO,
    grupos: [
      ...EMPRESAS_DESTINO.map((e) => ({ label: e.label, marca: e.marca })),
      { label: "Active Shoes", marca: "Reebok" },
      { label: "Joystep", marca: "Joybees" },
      { label: "", marca: "" },
    ],
  },
};

function compactFormula(d: { divisor: number; extra: number; redondeo: Redondeo }): string {
  const r = d.redondeo === "half" ? ".50" : d.redondeo === "par" ? "par" : "entero";
  return `TECHO(CIF ÷ ${d.divisor || "—"})${d.extra > 0 ? ` + ${d.extra}` : ""} → ${r}`;
}
function mkRow(marca: string, empresa: string | null, saved?: MarcaFormula): MarcaRow {
  return {
    id: `m-${marcaKey(marca)}`, marca, empresa,
    divisor: saved?.divisor ?? 0, extra: saved?.extra ?? 0, redondeo: saved?.redondeo ?? "int",
    saved: !!saved, isNew: false, dirty: false,
  };
}

// ── Estilos ──────────────────────────────────────────────────────────────────
const selCls = "h-7 rounded-md border border-stone-300 bg-stone-50 px-1.5 text-[13px] focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20";
// [appearance:textfield] + sin spin-buttons → el divisor de 2 decimales se ve completo (no lo tapan las flechitas).
const numCls = "h-7 rounded-md border border-stone-300 bg-stone-50 px-2 text-right font-mono text-[13px] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20";

export default function FormulasConfig({ scope = "depurador" }: { scope?: FormulasScope }) {
  // Si el scope cambia, el padre debe remontar con key={scope} (el estado inicial
  // del catálogo se siembra una sola vez).
  const cfg = SCOPE_CONFIG[scope];
  const catalogKeys = useMemo(() => new Set(cfg.catalogo.map((c) => marcaKey(c.marca))), [cfg]);
  const [rows, setRows] = useState<MarcaRow[]>(() => cfg.catalogo.map((c) => mkRow(c.marca, c.empresa)));
  const [descSaved, setDescSaved] = useState<MarcaRubroFormula[]>([]);
  const [descEdits, setDescEdits] = useState<Record<string, DescEdit>>({});
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [flashId, setFlashId] = useState<string | null>(null);
  const [busyDesc, setBusyDesc] = useState<string | null>(null);
  const [flashDesc, setFlashDesc] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const newCounter = useRef(0);

  // Carga fórmulas de marca + de descripción.
  useEffect(() => {
    let alive = true;
    fetch(cfg.formulasApi)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("fetch"))))
      .then((d: { rows: MarcaFormula[] }) => {
        if (!alive) return;
        const saved = d.rows ?? [];
        const byKey = new Map(saved.map((f) => [marcaKey(f.marca), f] as const));
        const catalogRows = cfg.catalogo.map((c) => mkRow(c.marca, c.empresa, byKey.get(marcaKey(c.marca))));
        const extraRows = saved.filter((f) => !catalogKeys.has(marcaKey(f.marca))).map((f) => mkRow(f.marca, f.empresa ?? null, f));
        setRows([...catalogRows, ...extraRows]);
      })
      .catch(() => { if (alive) setError("No se pudieron cargar las fórmulas guardadas (el catálogo igual está editable)."); });
    fetch(cfg.rubroApi)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("fetch"))))
      .then((d: { rows: MarcaRubroFormula[] }) => { if (alive) setDescSaved(d.rows ?? []); })
      .catch(() => {});
    return () => { alive = false; };
  }, [reloadKey, cfg, catalogKeys]);

  const reloadDesc = () =>
    fetch(cfg.rubroApi).then((r) => r.json()).then((d) => setDescSaved(d.rows ?? [])).catch(() => {});

  const descByKey = useMemo(() => {
    const m = new Map<string, MarcaRubroFormula>();
    for (const f of descSaved) m.set(marcaRubroKey(f.marca, f.rubro), f);
    return m;
  }, [descSaved]);

  // ── Marca-level ──
  const patchMarca = (id: string, patch: Partial<MarcaRow>) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch, dirty: true } : r)));
  const addMarca = () => {
    newCounter.current += 1;
    setRows((prev) => [
      { id: `new-${newCounter.current}`, marca: "", empresa: EMPRESAS_DESTINO[0].label, divisor: 0, extra: 0, redondeo: "int", saved: false, isNew: true, dirty: true },
      ...prev,
    ]);
  };
  const saveMarca = async (id: string) => {
    const row = rows.find((r) => r.id === id);
    if (!row || savingId) return;
    if (!row.marca.trim()) { setError("Escribe el nombre de la marca antes de guardar."); return; }
    setError(""); setSavingId(id);
    try {
      const res = await fetch(cfg.formulasApi, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ marca: row.marca.trim(), empresa: row.empresa || null, divisor: row.divisor, extra: row.extra, redondeo: row.redondeo }),
      });
      if (!res.ok) { const d = await res.json().catch(() => null); setError(d?.error || "No se pudo guardar la fórmula."); return; }
      setRows((prev) => {
        const k = marcaKey(row.marca);
        return prev.filter((r) => r.id === id || marcaKey(r.marca) !== k)
          .map((r) => (r.id === id ? { ...r, saved: true, isNew: false, dirty: false, marca: row.marca.trim() } : r));
      });
      setFlashId(id); setTimeout(() => setFlashId((f) => (f === id ? null : f)), 1500);
    } finally { setSavingId(null); }
  };

  // ── Descripción-level ──
  const descRowFor = (marca: string, desc: string): DescRowState => {
    const key = marcaRubroKey(marca, desc);
    const e = descEdits[key];
    const s = descByKey.get(key);
    const savedFijo = s?.precio_fijo ?? null;
    const savedModo: DescModo = savedFijo != null && savedFijo > 0 ? "fijo" : "formula";
    const divisor = e ? e.divisor : (s?.divisor ?? 0);
    const precioFijo = e ? e.precioFijo : savedFijo;
    const modo = e ? e.modo : savedModo;
    return {
      key,
      divisor,
      extra: e ? e.extra : (s?.extra ?? 0),
      redondeo: e ? e.redondeo : (s?.redondeo ?? "int"),
      precioFijo,
      modo,
      savedRow: s,
      fija: modo === "fijo" && precioFijo != null && precioFijo > 0,
      propia: modo === "fijo" ? precioFijo != null && precioFijo > 0 : divisor > 0,
      dirty: !!e?.dirty,
    };
  };
  const patchDesc = (marca: string, desc: string, p: Partial<Pick<DescEdit, "divisor" | "extra" | "redondeo" | "precioFijo" | "modo">>) => {
    const r = descRowFor(marca, desc);
    setDescEdits((prev) => ({ ...prev, [r.key]: { divisor: r.divisor, extra: r.extra, redondeo: r.redondeo, precioFijo: r.precioFijo, modo: r.modo, ...p, dirty: true } }));
  };
  const saveDesc = async (marca: string, desc: string) => {
    const r = descRowFor(marca, desc);
    if (busyDesc) return;
    setError(""); setBusyDesc(r.key);
    try {
      const tieneFijo = r.modo === "fijo" && r.precioFijo != null && r.precioFijo > 0;
      const tieneFormula = r.modo === "formula" && !!r.divisor;
      if (!tieneFijo && !tieneFormula) { // vacío = hereda → borra la excepción si existía
        if (r.savedRow?.id) {
          const res = await fetch(`${cfg.rubroApi}?id=${encodeURIComponent(r.savedRow.id)}`, { method: "DELETE" });
          if (!res.ok) throw new Error("No se pudo guardar."); await reloadDesc();
        }
      } else {
        const payload = tieneFijo
          ? { marca, rubro: desc, divisor: 0, extra: 0, redondeo: "int", precio_fijo: r.precioFijo }
          : { marca, rubro: desc, divisor: r.divisor, extra: r.extra, redondeo: r.redondeo, precio_fijo: null };
        const res = await fetch(cfg.rubroApi, {
          method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) { const d = await res.json().catch(() => null); throw new Error(d?.error || "No se pudo guardar."); }
        await reloadDesc();
      }
      setDescEdits((prev) => { const n = { ...prev }; delete n[r.key]; return n; });
      setFlashDesc(r.key); setTimeout(() => setFlashDesc((f) => (f === r.key ? null : f)), 1500);
    } catch (e) { setError(e instanceof Error ? e.message : "Error al guardar."); }
    finally { setBusyDesc(null); }
  };

  // ── Búsqueda (marca o descripción; si matchea desc, abre la tarjeta) ──
  const q = norm(search);
  const descMatch = (marca: string) => !!q && descripcionesDeMarca(marca).some((d) => norm(d).includes(q));
  const rowMatch = (row: MarcaRow) => !q || norm(row.marca).includes(q) || descMatch(row.marca);
  const toggle = (id: string) => setOpen((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const nuevas = rows.filter((r) => r.isNew && rowMatch(r));

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <div className="mb-5 border-b-2 border-stone-900 pb-4">
        <h2 className="font-serif text-2xl font-semibold tracking-tight text-stone-900">Configuración de fórmulas</h2>
      </div>

      {scope === "tienda" ? (
        <div className="mb-4 rounded-lg border border-stone-200 bg-white px-3.5 py-2.5 text-[13px] text-stone-600">
          <b className="text-teal-800">Fórmulas de TIENDA (Facturas Tienda):</b> precio = TECHO(Costo ÷ divisor) + extra,
          redondeado hacia arriba. El costo es el PRECIO de la factura (lo que la empresa le cobra a la tienda).
          Este set es SEPARADO de las fórmulas del Depurador.
        </div>
      ) : (
        <div className="mb-4 rounded-lg border border-stone-200 bg-white px-3.5 py-2.5 text-[13px] text-stone-600">
          <b className="text-teal-800">Fórmula:</b> precio = TECHO(Costo CIF ÷ divisor) + extra, redondeado
          hacia arriba (al entero o a .50). El Costo CIF ya es costo × 1.1.
        </div>
      )}

      {scope === "depurador" && <BulkExcel onDone={() => setReloadKey((k) => k + 1)} />}

      <p className="mb-4 text-[13px] text-stone-500">
        Cada marca tiene su fórmula (siempre visible). Ábrela para dar fórmula propia a una descripción;
        vacía = hereda la de la marca. Una descripción también puede tener <b className="text-amber-700">precio fijo</b>
        {" "}(un monto en dólares directo) que gana a cualquier fórmula.
      </p>

      {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}

      <div className="mb-5 flex items-center justify-between gap-3">
        <input
          value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar marca o descripción…"
          className="w-full max-w-xs rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
        />
        <button type="button" onClick={addMarca}
          className="whitespace-nowrap rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-700 active:scale-[0.97]">
          + Agregar marca
        </button>
      </div>

      {/* Nuevas marcas (aún sin guardar) */}
      {nuevas.length > 0 && (
        <div className="mb-6">
          <div className="mb-2 text-[12px] font-bold uppercase tracking-wide text-teal-800">Nuevas marcas</div>
          {nuevas.map((row) => (
            <div key={row.id} className="mb-2 flex flex-wrap items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 px-4 py-3">
              <input value={row.marca} onChange={(e) => patchMarca(row.id, { marca: e.target.value })} placeholder="Nombre de la marca"
                className="w-40 rounded-md border border-stone-300 bg-white px-2 py-1 text-[13px] focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20" />
              <select value={row.empresa ?? ""} onChange={(e) => patchMarca(row.id, { empresa: e.target.value || null })} className={selCls}>
                {cfg.grupos.filter((g) => g.label).map((g) => <option key={g.label} value={g.label}>{g.label}</option>)}
                <option value="">Otras</option>
              </select>
              <MarcaInputs row={row} onPatch={patchMarca} />
              <SaveBtn label={savingId === row.id ? "Guardando…" : "Guardar"} dirty onClick={() => saveMarca(row.id)} disabled={savingId === row.id} flashed={flashId === row.id} />
            </div>
          ))}
        </div>
      )}

      {/* Grupos por compañía → tarjetas de marca */}
      {cfg.grupos.map((g) => {
        const groupRows = rows.filter(
          (r) => !r.isNew && rowMatch(r) && (g.label ? r.empresa === g.label : !cfg.grupos.some((x) => x.label && x.label === r.empresa))
        );
        if (groupRows.length === 0) return null;
        return (
          <div key={g.label || "otras"} className="mb-7">
            <div className="mb-2 border-b border-stone-200 py-1.5 text-[13px] font-bold uppercase tracking-wide text-teal-800">
              {g.label || "Otras"}
              {g.marca && <span className="ml-2 text-[12px] font-normal normal-case tracking-normal text-stone-500">· {g.marca}</span>}
            </div>
            {groupRows.map((row) => (
              <MarcaCard
                key={row.id} row={row}
                isOpen={open.has(row.id) || descMatch(row.marca)}
                onToggle={() => toggle(row.id)}
                onPatchMarca={patchMarca} onSaveMarca={saveMarca}
                savingMarca={savingId === row.id} flashMarca={flashId === row.id}
                descRowFor={descRowFor} onPatchDesc={patchDesc} onSaveDesc={saveDesc}
                busyDesc={busyDesc} flashDesc={flashDesc} searchQ={q}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}

// ── Tarjeta de marca ─────────────────────────────────────────────────────────
function MarcaCard({
  row, isOpen, onToggle, onPatchMarca, onSaveMarca, savingMarca, flashMarca,
  descRowFor, onPatchDesc, onSaveDesc, busyDesc, flashDesc, searchQ,
}: {
  row: MarcaRow; isOpen: boolean; onToggle: () => void;
  onPatchMarca: (id: string, p: Partial<MarcaRow>) => void; onSaveMarca: (id: string) => void;
  savingMarca: boolean; flashMarca: boolean;
  descRowFor: (m: string, d: string) => DescRowState;
  onPatchDesc: (m: string, d: string, p: Partial<DescEdit>) => void; onSaveDesc: (m: string, d: string) => void;
  busyDesc: string | null; flashDesc: string | null; searchQ: string;
}) {
  const descs = descripcionesDeMarca(row.marca);
  const conFormula = descs.filter((d) => descRowFor(row.marca, d).propia).length;
  const heredan = descs.length - conFormula;
  const marcaLabel = savingMarca ? "Guardando…" : row.dirty ? "Guardar" : row.saved ? "Guardado" : "Guardar";

  return (
    <div className="mb-1.5 overflow-hidden rounded-xl border border-stone-200 bg-stone-50">
      {/* Header — toda el área expande/colapsa (salvo los inputs de fórmula de marca).
          Misma grilla que las filas de descripción → todo alineado en columnas. */}
      <div onClick={onToggle} title={compactFormula(row)} className="cursor-pointer select-none">
        <div className="grid grid-cols-[minmax(0,1fr)_64px_50px_90px_96px] items-center gap-2 px-3.5 py-2">
          <div className="flex min-w-0 items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-2">
              <span className="text-stone-400">{isOpen ? "▾" : "▸"}</span>
              <span className="truncate text-[14px] font-bold text-stone-900">{row.marca}</span>
              {descs.length > 0 && (
                conFormula > 0
                  ? <span className="shrink-0 rounded bg-teal-50 px-1.5 py-0.5 text-[10px] font-semibold text-teal-700">{conFormula} propia · {heredan} heredan</span>
                  : <span className="shrink-0 text-[11px] text-stone-500">{descs.length} desc · todas heredan</span>
              )}
            </span>
            <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-stone-400">Marca:</span>
          </div>
          <input type="number" step="0.01" inputMode="decimal" value={row.divisor || ""} placeholder="—" onClick={(e) => e.stopPropagation()}
            onChange={(e) => onPatchMarca(row.id, { divisor: Number(e.target.value) || 0 })} className={`${numCls} w-full`} aria-label={`Divisor ${row.marca}`} />
          <select value={row.extra} onClick={(e) => e.stopPropagation()} onChange={(e) => onPatchMarca(row.id, { extra: parseInt(e.target.value) })} className={`${selCls} w-full`} aria-label="Extra">
            {[0, 1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <select value={row.redondeo} onClick={(e) => e.stopPropagation()} onChange={(e) => onPatchMarca(row.id, { redondeo: e.target.value as Redondeo })} className={`${selCls} w-full`} aria-label="Redondeo">
            <option value="int">Entero</option>
            <option value="half">.50</option>
            <option value="par">Par</option>
          </select>
          <SaveBtn label={marcaLabel} dirty={row.dirty || !row.saved} onClick={() => onSaveMarca(row.id)} disabled={savingMarca} flashed={flashMarca} />
        </div>
      </div>

      {/* Cuerpo — al expandir (misma grilla y px que el header → columnas alineadas) */}
      {isOpen && descs.length > 0 && (
        <div className="border-t border-stone-200 py-1.5">
          <div className="grid grid-cols-[minmax(0,1fr)_64px_50px_90px_96px] items-center gap-2 px-3.5 pb-0.5 text-[10px] font-semibold uppercase tracking-wide text-stone-400">
            <span>Descripción</span><span className="text-right">Divisor</span><span className="text-right">Extra</span><span>Redondeo</span><span></span>
          </div>
          {descs.map((desc) => {
            const r = descRowFor(row.marca, desc);
            const hl = searchQ && norm(desc).includes(searchQ);
            return (
              <div key={desc} className={`grid grid-cols-[minmax(0,1fr)_64px_50px_90px_96px] items-center gap-2 px-3.5 py-0.5 ${hl ? "bg-teal-50" : "hover:bg-white"}`}>
                <div className="flex min-w-0 items-center justify-between gap-2">
                  <span className={`flex min-w-0 items-center gap-1.5 truncate text-[13px] ${r.fija ? "font-semibold text-amber-700" : r.propia ? "font-medium text-teal-700" : "text-stone-500"}`}>
                    <span className="truncate">{desc}</span>
                    {r.fija
                      ? <span className="shrink-0 rounded bg-amber-100 px-1 py-0.5 text-[9px] font-semibold text-amber-800">precio fijo</span>
                      : r.propia && <span className="shrink-0 rounded bg-teal-50 px-1 py-0.5 text-[9px] font-semibold text-teal-700">propia</span>}
                  </span>
                  <select value={r.modo} onChange={(e) => onPatchDesc(row.marca, desc, { modo: e.target.value as DescModo })}
                    className={`${selCls} shrink-0 w-[92px] ${r.modo === "fijo" ? "border-amber-300 text-amber-800" : ""}`} aria-label="Modo de precio">
                    <option value="formula">Fórmula</option>
                    <option value="fijo">Precio fijo</option>
                  </select>
                </div>
                {r.modo === "fijo" ? (
                  <div className="col-span-3 flex items-center gap-1">
                    <span className="text-[13px] font-semibold text-amber-700">$</span>
                    <input type="number" step="0.01" inputMode="decimal" value={r.precioFijo ?? ""} placeholder="precio fijo"
                      onChange={(e) => onPatchDesc(row.marca, desc, { precioFijo: e.target.value === "" ? null : Number(e.target.value) })}
                      className={`${numCls} w-full border-amber-300 text-left`} aria-label={`Precio fijo ${desc}`} />
                  </div>
                ) : (
                  <>
                    <input type="number" step="0.01" value={r.divisor || ""} placeholder="—"
                      onChange={(e) => onPatchDesc(row.marca, desc, { divisor: Number(e.target.value) || 0 })} className={`${numCls} w-full`} />
                    <select value={r.extra} onChange={(e) => onPatchDesc(row.marca, desc, { extra: parseInt(e.target.value) })} className={`${selCls} w-full`}>
                      {[0, 1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                    <select value={r.redondeo} onChange={(e) => onPatchDesc(row.marca, desc, { redondeo: e.target.value as Redondeo })} className={`${selCls} w-full`}>
                      <option value="int">Entero</option>
                      <option value="half">.50</option>
                      <option value="par">Par</option>
                    </select>
                  </>
                )}
                <SaveBtn label={busyDesc === r.key ? "…" : r.dirty ? "Guardar" : "✓"} dirty={r.dirty} onClick={() => onSaveDesc(row.marca, desc)} disabled={busyDesc === r.key} flashed={flashDesc === r.key} compact />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MarcaInputs({ row, onPatch }: { row: MarcaRow; onPatch: (id: string, p: Partial<MarcaRow>) => void }) {
  return (
    <>
      <input type="number" step="0.01" value={row.divisor || ""} placeholder="div"
        onChange={(e) => onPatch(row.id, { divisor: Number(e.target.value) || 0 })} className={`${numCls} w-[56px]`} aria-label="Divisor" />
      <select value={row.extra} onChange={(e) => onPatch(row.id, { extra: parseInt(e.target.value) })} className={`${selCls} w-[44px]`} aria-label="Extra">
        {[0, 1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
      </select>
      <select value={row.redondeo} onChange={(e) => onPatch(row.id, { redondeo: e.target.value as Redondeo })} className={`${selCls} w-[90px]`} aria-label="Redondeo">
        <option value="int">Entero</option>
        <option value="half">.50</option>
        <option value="par">Par</option>
      </select>
    </>
  );
}

function SaveBtn({ label, dirty, onClick, disabled, flashed, compact }: { label: string; dirty: boolean; onClick: () => void; disabled: boolean; flashed: boolean; compact?: boolean }) {
  return (
    <span className="whitespace-nowrap">
      <button type="button" onClick={(e) => { e.stopPropagation(); onClick(); }} disabled={disabled}
        className={`rounded-md ${compact ? "px-1.5" : "px-2.5"} py-1 text-[12px] font-semibold transition disabled:opacity-50 ${dirty ? "bg-amber-500 text-white hover:bg-amber-600" : "text-teal-700 hover:bg-teal-50"}`}>
        {label}
      </button>
      {flashed && <span className="ml-1 text-[11px] font-semibold text-emerald-600">✓</span>}
    </span>
  );
}

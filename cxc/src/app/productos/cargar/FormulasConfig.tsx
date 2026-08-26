"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  EMPRESAS_DESTINO, MARCA_CATALOGO, descripcionesDeMarca, norm, marcaKey, marcaRubroKey,
  type CatalogoDescripciones, type Redondeo, type MarcaFormula, type MarcaRubroFormula,
} from "@/lib/depurador/logic";
import { TIENDA_MARCA_CATALOGO } from "@/lib/depurador/tienda";
import { useCatalogoDescripciones } from "@/lib/hooks/useCatalogoDescripciones";
import BulkExcel from "./BulkExcel";

// Catálogo vacío estable mientras carga el real (evita reindexar por render).
const CATALOGO_VACIO: CatalogoDescripciones = {};

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
//
// 🩸 `min-h-[44px]` y no `h-7`: esta pestaña era la PEOR del sistema en área
// táctil — 37 controles bajo 44px a 390 y 36 a 834 (censo 30-jul-2026), casi
// todos estos dos campos repetidos por marca y por descripción. 28px de alto es
// menos de dos tercios del mínimo de Apple y son campos que se editan a dedo.
//
// Solo cambia el ALTO. El ancho de cada columna lo fija la grilla
// (`grid-cols-[…_64px_50px_90px_96px]`, todas ya ≥44px), así que subir la
// altura no mueve una sola columna ni agrega un píxel de arrastre horizontal.
const selCls = "min-h-[44px] rounded-md border border-stone-300 bg-stone-50 px-1.5 text-[13px] focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20";
// [appearance:textfield] + sin spin-buttons → el divisor de 2 decimales se ve completo (no lo tapan las flechitas).
const numCls = "min-h-[44px] rounded-md border border-stone-300 bg-stone-50 px-2 text-right font-mono text-[13px] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20";

export default function FormulasConfig({ scope = "depurador" }: { scope?: FormulasScope }) {
  // Si el scope cambia, el padre debe remontar con key={scope} (el estado inicial
  // del catálogo se siembra una sola vez).
  const cfg = SCOPE_CONFIG[scope];
  // Catálogo de descripciones por marca (tabla depurador_descripciones).
  const { catalogo: catalogoDescs, cargando: descsCargando, fallo: descsFallo, reintentar: reintentarDescs } = useCatalogoDescripciones();
  const descsCatalogo = catalogoDescs ?? CATALOGO_VACIO;
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
  const descMatch = (marca: string) => !!q && descripcionesDeMarca(descsCatalogo, marca).some((d) => norm(d).includes(q));
  const rowMatch = (row: MarcaRow) => !q || norm(row.marca).includes(q) || descMatch(row.marca);
  const toggle = (id: string) => setOpen((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const nuevas = rows.filter((r) => r.isNew && rowMatch(r));

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <FormulasAyuda scope={scope} />

      {scope === "depurador" && <BulkExcel catalogo={catalogoDescs} onDone={() => setReloadKey((k) => k + 1)} />}

      {descsCargando && (
        <div className="mb-4 rounded-lg border border-stone-200 bg-white px-3.5 py-2.5 text-[13px] text-stone-600">
          Cargando catálogo de descripciones…
        </div>
      )}
      {descsFallo && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-[13px] text-red-800">
          <span>No se pudo cargar el catálogo de descripciones. Intenta de nuevo.</span>
          <button
            type="button"
            onClick={reintentarDescs}
            className="inline-flex min-h-[44px] items-center justify-center rounded-md border border-red-300 bg-white px-2.5 text-[12px] font-semibold text-red-700 transition hover:bg-red-100 active:scale-[0.97]"
          >
            Reintentar
          </button>
        </div>
      )}

      {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}

      <div className="mb-5 flex items-center justify-between gap-3">
        <input
          value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar marca o descripción…"
          className="min-h-[44px] w-full max-w-xs rounded-lg border border-stone-300 bg-white px-3 text-sm focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
        />
        <button type="button" onClick={addMarca}
          className="inline-flex min-h-[44px] items-center justify-center whitespace-nowrap rounded-lg bg-teal-600 px-4 text-sm font-semibold text-white transition hover:bg-teal-700 active:scale-[0.97]">
          + Agregar marca
        </button>
      </div>

      {/* Nuevas marcas (aún sin guardar) */}
      {nuevas.length > 0 && (
        <div className="mb-6">
          <div className="mb-2 text-[12px] font-bold uppercase tracking-wide text-teal-800">Nuevas marcas</div>
          {nuevas.map((row) => (
            <NuevaMarcaRow
              key={row.id} row={row} grupos={cfg.grupos} onPatch={patchMarca} onSave={saveMarca}
              saving={savingId === row.id} flashed={flashId === row.id}
            />
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
                key={row.id} row={row} catalogo={descsCatalogo}
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

// ── Campos de una fórmula ────────────────────────────────────────────────────
//
// Divisor, extra y redondeo se dibujan en CUATRO lugares (la grilla de
// escritorio, la tarjeta de móvil, la marca nueva y cada descripción). Van una
// sola vez acá y cada lugar les pasa el ancho.
const noPropagar = (e: { stopPropagation: () => void }) => e.stopPropagation();

function DivisorInput({ value, onChange, cls, aria }: { value: number; onChange: (n: number) => void; cls: string; aria?: string }) {
  return (
    <input type="number" step="0.01" inputMode="decimal" value={value || ""} placeholder="—" onClick={noPropagar}
      onChange={(e) => onChange(Number(e.target.value) || 0)} className={`${numCls} ${cls}`} aria-label={aria} />
  );
}
function ExtraSelect({ value, onChange, cls, aria = "Extra" }: { value: number; onChange: (n: number) => void; cls: string; aria?: string }) {
  return (
    <select value={value} onClick={noPropagar} onChange={(e) => onChange(parseInt(e.target.value))} className={`${selCls} ${cls}`} aria-label={aria}>
      {[0, 1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
    </select>
  );
}
function RedondeoSelect({ value, onChange, cls, aria = "Redondeo" }: { value: Redondeo; onChange: (r: Redondeo) => void; cls: string; aria?: string }) {
  return (
    <select value={value} onClick={noPropagar} onChange={(e) => onChange(e.target.value as Redondeo)} className={`${selCls} ${cls}`} aria-label={aria}>
      <option value="int">Entero</option>
      <option value="half">.50</option>
      <option value="par">Par</option>
    </select>
  );
}

// Etiqueta arriba, dato abajo. Solo en las tarjetas (<lg): en la grilla de
// escritorio los rótulos son el encabezado de columnas.
function Campo({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block min-w-0" onClick={noPropagar}>
      <span className="mb-0.5 block text-[12px] font-medium uppercase tracking-wide text-stone-500">{label}</span>
      {children}
    </label>
  );
}

// ── Marca nueva (aún sin guardar) ────────────────────────────────────────────
function NuevaMarcaRow({ row, grupos, onPatch, onSave, saving, flashed }: {
  row: MarcaRow; grupos: { label: string; marca: string }[];
  onPatch: (id: string, p: Partial<MarcaRow>) => void; onSave: (id: string) => void;
  saving: boolean; flashed: boolean;
}) {
  const nombre = (cls: string) => (
    <input value={row.marca} onChange={(e) => onPatch(row.id, { marca: e.target.value })} placeholder="Nombre de la marca"
      aria-label="Nombre de la marca"
      className={`min-h-[44px] rounded-md border border-stone-300 bg-white px-2 text-[13px] focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20 ${cls}`} />
  );
  const empresa = (cls: string) => (
    <select value={row.empresa ?? ""} onChange={(e) => onPatch(row.id, { empresa: e.target.value || null })} className={`${selCls} ${cls}`} aria-label="Empresa">
      {grupos.filter((g) => g.label).map((g) => <option key={g.label} value={g.label}>{g.label}</option>)}
      <option value="">Otras</option>
    </select>
  );
  const divisor = (cls: string) => <DivisorInput value={row.divisor} onChange={(n) => onPatch(row.id, { divisor: n })} cls={cls} aria="Divisor" />;
  const extra = (cls: string) => <ExtraSelect value={row.extra} onChange={(n) => onPatch(row.id, { extra: n })} cls={cls} />;
  const redondeo = (cls: string) => <RedondeoSelect value={row.redondeo} onChange={(r) => onPatch(row.id, { redondeo: r })} cls={cls} />;
  const guardar = <SaveBtn label={saving ? "Guardando…" : "Guardar"} dirty onClick={() => onSave(row.id)} disabled={saving} flashed={flashed} />;

  return (
    <div className="mb-2 rounded-xl border border-stone-200 bg-stone-50 px-4 py-3">
      {/* ── Móvil e iPad vertical (<lg): cada campo con su etiqueta ── */}
      <div data-layout="tarjetas" className="space-y-2 lg:hidden">
        <Campo label="Marca">{nombre("w-full")}</Campo>
        <Campo label="Empresa">{empresa("w-full")}</Campo>
        <div className="grid grid-cols-3 gap-2">
          <Campo label="Divisor">{divisor("w-full")}</Campo>
          <Campo label="Extra">{extra("w-full")}</Campo>
          <Campo label="Redondeo">{redondeo("w-full")}</Campo>
        </div>
        <div className="flex justify-end">{guardar}</div>
      </div>
      {/* ── Escritorio (lg+): la fila de siempre ── */}
      <div data-layout="fila" className="hidden flex-wrap items-center gap-2 lg:flex">
        {nombre("w-40")}
        {empresa("")}
        {divisor("w-[56px]")}
        {extra("w-[44px]")}
        {redondeo("w-[90px]")}
        {guardar}
      </div>
    </div>
  );
}

// ── Tarjeta de marca ─────────────────────────────────────────────────────────
//
// 🩸 A 390 px la grilla de escritorio dejaba ~30 px para el nombre de la marca y
// Reebok se leía «▸R». Las cuatro columnas fijas de
// `grid-cols-[minmax(0,1fr)_64px_50px_90px_96px]` son 300 px, más 32 de gaps y
// 28 de relleno = 360 de los 390 — y el `truncate` del nombre se comía el resto
// sin pedir una sola fila de arrastre, así que ningún censo de arrastre lo veía.
// Desde acá el corte es el mismo que en Guías: tarjeta hasta `lg`, la grilla de
// siempre desde `lg` (a 834 la barra lateral deja ~562 px útiles: tampoco entra).
function MarcaCard({
  row, catalogo, isOpen, onToggle, onPatchMarca, onSaveMarca, savingMarca, flashMarca,
  descRowFor, onPatchDesc, onSaveDesc, busyDesc, flashDesc, searchQ,
}: {
  row: MarcaRow; catalogo: CatalogoDescripciones; isOpen: boolean; onToggle: () => void;
  onPatchMarca: (id: string, p: Partial<MarcaRow>) => void; onSaveMarca: (id: string) => void;
  savingMarca: boolean; flashMarca: boolean;
  descRowFor: (m: string, d: string) => DescRowState;
  onPatchDesc: (m: string, d: string, p: Partial<DescEdit>) => void; onSaveDesc: (m: string, d: string) => void;
  busyDesc: string | null; flashDesc: string | null; searchQ: string;
}) {
  const descs = descripcionesDeMarca(catalogo, row.marca);
  const conFormula = descs.filter((d) => descRowFor(row.marca, d).propia).length;
  const heredan = descs.length - conFormula;
  const marcaLabel = savingMarca ? "Guardando…" : row.dirty ? "Guardar" : row.saved ? "Guardado" : "Guardar";

  const badge = descs.length === 0 ? null : conFormula > 0
    ? <span className="shrink-0 rounded bg-teal-50 px-1.5 py-0.5 text-[12px] font-semibold text-teal-700 lg:text-[10px]">{conFormula} propia · {heredan} heredan</span>
    : <span className="shrink-0 text-[12px] text-stone-500 lg:text-[11px]">{descs.length} desc · todas heredan</span>;
  const divisor = (cls: string) => <DivisorInput value={row.divisor} onChange={(n) => onPatchMarca(row.id, { divisor: n })} cls={cls} aria={`Divisor ${row.marca}`} />;
  const extra = (cls: string) => <ExtraSelect value={row.extra} onChange={(n) => onPatchMarca(row.id, { extra: n })} cls={cls} />;
  const redondeo = (cls: string) => <RedondeoSelect value={row.redondeo} onChange={(r) => onPatchMarca(row.id, { redondeo: r })} cls={cls} />;
  const guardar = <SaveBtn label={marcaLabel} dirty={row.dirty || !row.saved} onClick={() => onSaveMarca(row.id)} disabled={savingMarca} flashed={flashMarca} />;

  return (
    <div className="mb-1.5 overflow-hidden rounded-xl border border-stone-200 bg-stone-50">
      {/* Header — toda el área expande/colapsa (salvo los campos de la fórmula). */}
      <div onClick={onToggle} title={compactFormula(row)} className="cursor-pointer select-none">
        {/* ── Móvil e iPad vertical (<lg): el nombre COMPLETO arriba, los campos con su etiqueta ── */}
        <div data-layout="tarjetas" className="px-3.5 py-3 lg:hidden">
          <div className="flex items-start justify-between gap-2">
            <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <span aria-hidden className="text-stone-400">{isOpen ? "▾" : "▸"}</span>
              <span className="break-words text-[15px] font-bold text-stone-900">{row.marca}</span>
              {badge}
            </span>
            {guardar}
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2">
            <Campo label="Divisor">{divisor("w-full")}</Campo>
            <Campo label="Extra">{extra("w-full")}</Campo>
            <Campo label="Redondeo">{redondeo("w-full")}</Campo>
          </div>
        </div>
        {/* ── Escritorio (lg+): la misma grilla que las filas de descripción ── */}
        <div data-layout="fila" className="hidden grid-cols-[minmax(0,1fr)_64px_50px_90px_96px] items-center gap-2 px-3.5 py-2 lg:grid">
          <div className="flex min-w-0 items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-2">
              <span aria-hidden className="text-stone-400">{isOpen ? "▾" : "▸"}</span>
              <span className="truncate text-[14px] font-bold text-stone-900">{row.marca}</span>
              {badge}
            </span>
            <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-stone-400">Marca:</span>
          </div>
          {divisor("w-full")}
          {extra("w-full")}
          {redondeo("w-full")}
          {guardar}
        </div>
      </div>

      {/* Cuerpo — al expandir. */}
      {isOpen && descs.length > 0 && (
        <div className="border-t border-stone-200 py-1.5">
          <div className="hidden grid-cols-[minmax(0,1fr)_64px_50px_90px_96px] items-center gap-2 px-3.5 pb-0.5 text-[10px] font-semibold uppercase tracking-wide text-stone-400 lg:grid">
            <span>Descripción</span><span className="text-right">Divisor</span><span className="text-right">Extra</span><span>Redondeo</span><span></span>
          </div>
          {descs.map((desc) => (
            <DescFila
              key={desc} marca={row.marca} desc={desc} r={descRowFor(row.marca, desc)}
              hl={!!searchQ && norm(desc).includes(searchQ)}
              onPatch={onPatchDesc} onSave={onSaveDesc} busy={busyDesc} flash={flashDesc}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Fila / tarjeta de una descripción ────────────────────────────────────────
function DescFila({ marca, desc, r, hl, onPatch, onSave, busy, flash }: {
  marca: string; desc: string; r: DescRowState; hl: boolean;
  onPatch: (m: string, d: string, p: Partial<DescEdit>) => void;
  onSave: (m: string, d: string) => void;
  busy: string | null; flash: string | null;
}) {
  const chip = r.fija
    ? <span className="shrink-0 rounded bg-amber-100 px-1 py-0.5 text-[12px] font-semibold text-amber-800 lg:text-[9px]">precio fijo</span>
    : r.propia
      ? <span className="shrink-0 rounded bg-teal-50 px-1 py-0.5 text-[12px] font-semibold text-teal-700 lg:text-[9px]">propia</span>
      : null;
  const color = r.fija ? "font-semibold text-amber-700" : r.propia ? "font-medium text-teal-700" : "text-stone-500";
  const modo = (cls: string) => (
    <select value={r.modo} onChange={(e) => onPatch(marca, desc, { modo: e.target.value as DescModo })}
      className={`${selCls} ${cls} ${r.modo === "fijo" ? "border-amber-300 text-amber-800" : ""}`} aria-label={`Modo de precio ${desc}`}>
      <option value="formula">Fórmula</option>
      <option value="fijo">Precio fijo</option>
    </select>
  );
  const precioFijo = (cls: string) => (
    <input type="number" step="0.01" inputMode="decimal" value={r.precioFijo ?? ""} placeholder="precio fijo"
      onChange={(e) => onPatch(marca, desc, { precioFijo: e.target.value === "" ? null : Number(e.target.value) })}
      className={`${numCls} ${cls} border-amber-300 text-left`} aria-label={`Precio fijo ${desc}`} />
  );
  const divisor = (cls: string) => <DivisorInput value={r.divisor} onChange={(n) => onPatch(marca, desc, { divisor: n })} cls={cls} aria={`Divisor ${desc}`} />;
  const extra = (cls: string) => <ExtraSelect value={r.extra} onChange={(n) => onPatch(marca, desc, { extra: n })} cls={cls} aria={`Extra ${desc}`} />;
  const redondeo = (cls: string) => <RedondeoSelect value={r.redondeo} onChange={(x) => onPatch(marca, desc, { redondeo: x })} cls={cls} aria={`Redondeo ${desc}`} />;
  const guardar = <SaveBtn label={busy === r.key ? "…" : r.dirty ? "Guardar" : "✓"} dirty={r.dirty} onClick={() => onSave(marca, desc)} disabled={busy === r.key} flashed={flash === r.key} compact />;

  return (
    <>
      {/* ── Móvil e iPad vertical (<lg): una tarjeta por descripción ── */}
      <div data-layout="tarjetas" className={`border-t border-stone-200 px-3.5 py-2.5 lg:hidden ${hl ? "bg-teal-50" : ""}`}>
        <div className="flex items-start justify-between gap-2">
          <span className={`flex min-w-0 flex-wrap items-center gap-1.5 text-[14px] ${color}`}>
            <span className="break-words">{desc}</span>
            {chip}
          </span>
          {guardar}
        </div>
        <div className="mt-2 space-y-2">
          {modo("w-full")}
          {r.modo === "fijo" ? (
            <Campo label="Precio fijo">
              <div className="flex items-center gap-1">
                <span className="text-[14px] font-semibold text-amber-700">$</span>
                {precioFijo("w-full")}
              </div>
            </Campo>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              <Campo label="Divisor">{divisor("w-full")}</Campo>
              <Campo label="Extra">{extra("w-full")}</Campo>
              <Campo label="Redondeo">{redondeo("w-full")}</Campo>
            </div>
          )}
        </div>
      </div>

      {/* ── Escritorio (lg+): la fila de siempre ── */}
      <div data-layout="fila" className={`hidden grid-cols-[minmax(0,1fr)_64px_50px_90px_96px] items-center gap-2 px-3.5 py-0.5 lg:grid ${hl ? "bg-teal-50" : "hover:bg-white"}`}>
        <div className="flex min-w-0 items-center justify-between gap-2">
          <span className={`flex min-w-0 items-center gap-1.5 truncate text-[13px] ${color}`}>
            <span className="truncate">{desc}</span>
            {chip}
          </span>
          {modo("w-[92px] shrink-0")}
        </div>
        {r.modo === "fijo" ? (
          <div className="col-span-3 flex items-center gap-1">
            <span className="text-[13px] font-semibold text-amber-700">$</span>
            {precioFijo("w-full")}
          </div>
        ) : (
          <>
            {divisor("w-full")}
            {extra("w-full")}
            {redondeo("w-full")}
          </>
        )}
        {guardar}
      </div>
    </>
  );
}

function SaveBtn({ label, dirty, onClick, disabled, flashed, compact }: { label: string; dirty: boolean; onClick: () => void; disabled: boolean; flashed: boolean; compact?: boolean }) {
  return (
    <span className="whitespace-nowrap">
      <button type="button" onClick={(e) => { e.stopPropagation(); onClick(); }} disabled={disabled}
        className={`inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md ${compact ? "px-1.5" : "px-2.5"} text-[12px] font-semibold transition disabled:opacity-50 ${dirty ? "bg-amber-500 text-white hover:bg-amber-600" : "text-teal-700 hover:bg-teal-50"}`}>
        {label}
      </button>
      {flashed && <span className="ml-1 text-[11px] font-semibold text-emerald-600">✓</span>}
    </span>
  );
}

// ── Ayuda de fórmulas ────────────────────────────────────────────────────────
// Los tres bloques de texto que antes vivían siempre abiertos arriba de la
// tabla ahora van dentro de un disclosure, mismo patrón que ComisionesCriterios.
function FormulasAyuda({ scope }: { scope: FormulasScope }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mb-4 rounded-lg border border-stone-200 bg-stone-50 text-[13px] text-stone-600">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-[44px] w-full items-center gap-2 px-3 text-left transition hover:bg-stone-100 active:scale-[0.99]"
        aria-expanded={open}
      >
        <span aria-hidden className="shrink-0 text-stone-400">ⓘ</span>
        <span className="font-medium text-stone-700">Cómo funcionan las fórmulas</span>
        <span className={`ml-auto shrink-0 text-stone-400 transition-transform ${open ? "rotate-180" : ""}`}>▾</span>
      </button>
      {open && (
        <div className="space-y-2 border-t border-stone-200 px-3 py-2.5">
          {scope === "tienda" ? (
            <p>
              <b className="text-teal-800">Fórmulas de TIENDA (Facturas Tienda):</b> precio = TECHO(Costo ÷ divisor) + extra,
              redondeado hacia arriba. El costo es el PRECIO de la factura (lo que la empresa le cobra a la tienda).
            </p>
          ) : (
            <p>
              <b className="text-teal-800">Fórmula:</b> precio = TECHO(Costo CIF ÷ divisor) + extra, redondeado
              hacia arriba (al entero o a .50). El Costo CIF ya es costo × 1.1.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

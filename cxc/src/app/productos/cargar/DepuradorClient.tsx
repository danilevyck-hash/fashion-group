"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { UploadCloud } from "lucide-react";
import {
  MESES,
  EMPRESAS_DESTINO,
  pickBestSheet,
  processRows,
  setRowTalla,
  buildAoa,
  outColsForEmpresa,
  outputFilename,
  matchEmpresaFromDestino,
  proveedorParaEmpresa,
  computeTotales,
  calcPrecio,
  precioDescripcion,
  formulaText,
  marginPct,
  norm,
  marcaKey,
  marcaRubroKey,
  esDescripcionCatalogada,
  descripcionesDeMarca,
  TEXT_COLS,
  type ProcessedRow,
  type NamedSheet,
  type Redondeo,
  type MarcaFormula,
  type MarcaRubroFormula,
} from "@/lib/depurador/logic";
import { useCatalogoDescripciones } from "@/lib/hooks/useCatalogoDescripciones";
import AlarmaDescripcionesNuevas from "./AlarmaDescripcionesNuevas";

const DIVISOR_HINTS = [0.70, 0.73, 0.75, 0.63];
const BLANK_FORMULA: MarcaFormula = { marca: "", divisor: 0, extra: 0, redondeo: "int" };

// Orden de columnas de la vista previa (la talla y el checkbox van aparte).
// rubro/subrubro NO se muestran pero siguen yendo en el Excel (OUT_COLS).
// Precio queda entre C. CIF y Stock (A4).
const PREVIEW_COLS_RENDER = [
  "Código *", "Código Barra *", "Descripción *", "__calc",
  "Costo FOB *", "Costo CIF *", "Precio *", "Stock Ideal", "Marca *",
];

// Encabezados abreviados para que la tabla quepa sin scroll lateral (A3).
const COL_HEAD: Record<string, string> = {
  "__calc": "Cálculo",
  "Código *": "Código",
  "Código Barra *": "Código Barra",
  "Descripción *": "Descripción",
  "Costo FOB *": "C. FOB",
  "Costo CIF *": "C. CIF",
  "Precio *": "Precio",
  "Stock Ideal": "Stock",
  "Marca *": "Marca",
};

// Columnas numéricas estrechas (ancho mínimo al contenido).
const NARROW_COLS = new Set(["__calc", "Costo FOB *", "Costo CIF *", "Precio *", "Stock Ideal"]);

interface DepuradorClientProps {
  /** Callback al descargar — registra el historial liviano en el server (Tarea 4). */
  onDownloaded?: (payload: {
    empresa: string;
    marca: string;
    cantidad_estilos: number;
    total_unidades: number;
    total_costo: number;
  }) => void;
  /** Archivo inyectado por el dispatcher (mismo tab). Si viene, se oculta la dropzone
   *  propia y se procesa automáticamente. La lógica CK/TH no cambia. */
  injectedFile?: File | null;
  /** Volver a la dropzone del dispatcher. */
  onReset?: () => void;
}

export default function DepuradorClient({ onDownloaded, injectedFile, onReset }: DepuradorClientProps) {
  const now = new Date();
  const embedded = injectedFile !== undefined;
  const fileRef = useRef<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [fileName, setFileName] = useState("");
  const [dragging, setDragging] = useState(false);
  const [processed, setProcessed] = useState<ProcessedRow[] | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  // Artículos que el proveedor no pidió (cantidad 0) y por eso no van al Excel.
  const [omitidosSinCantidad, setOmitidosSinCantidad] = useState(0);
  const [error, setError] = useState("");
  const [empresa, setEmpresa] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [orphanSeen, setOrphanSeen] = useState(false); // alarma de descripción nueva (Tarea 8)

  // Config (mismos defaults del HTML: mes/año actual, tasa 7, factor 1.1)
  const [mesIdx, setMesIdx] = useState(now.getMonth());
  const [anio, setAnio] = useState(String(now.getFullYear()));
  const [tasa, setTasa] = useState("7");
  const [factor, setFactor] = useState("1.1");

  // Catálogo de descripciones (tabla depurador_descripciones — fuente de verdad).
  // Sin catálogo NO se procesa ni se descarga nada (sin fallback al archivo TS).
  const {
    catalogo,
    cargando: catalogoCargando,
    fallo: catalogoFallo,
    reintentar: reintentarCatalogo,
    agregarDescripcion,
  } = useCatalogoDescripciones();

  // ── Precio (Tarea 2) ───────────────────────────────────────────────────────
  // Default: cada marca toma su fórmula guardada. "global" sigue disponible.
  const [priceMode, setPriceMode] = useState<"global" | "marca">("marca");
  // Fórmula global: "draft" se edita en vivo; "applied" maneja el cálculo de las
  // filas (se confirma con "Aplicar a todo"). Defaults del mockup: 0.73 / 2 / int.
  const [draftDivisor, setDraftDivisor] = useState("0.73");
  const [draftExtra, setDraftExtra] = useState(2);
  const [draftRedondeo, setDraftRedondeo] = useState<Redondeo>("int");
  const [applied, setApplied] = useState<{ divisor: number; extra: number; redondeo: Redondeo }>(
    { divisor: 0.73, extra: 2, redondeo: "int" }
  );
  // Precios editados a mano (por índice de fila). No se sobrescriben al recalcular.
  const [priceEdits, setPriceEdits] = useState<Record<number, string>>({});
  // Fórmulas guardadas (tabla marca_formulas) + fórmulas editables por marca presente.
  const [savedFormulas, setSavedFormulas] = useState<MarcaFormula[]>([]);
  const [marcaForms, setMarcaForms] = useState<Record<string, MarcaFormula>>({});
  const [savingMarca, setSavingMarca] = useState<string | null>(null);
  // Excepciones por marca+rubro (tienen prioridad sobre la fórmula de la marca).
  const [rubroFormulas, setRubroFormulas] = useState<MarcaRubroFormula[]>([]);

  // ── Selección masiva + filtro por descripción (Tareas 3 y 4) ────────────────
  const [descFilter, setDescFilter] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [massPrice, setMassPrice] = useState("");

  const runFile = useCallback(
    async (file: File, cfg: { mesIdx: number; anio: string; tasa: string; factor: string }) => {
      setFileName(file.name);
      try {
        const buf = await file.arrayBuffer();
        const XLSX = (await import("xlsx-js-style")).default;
        const wb = XLSX.read(buf, { type: "array" });
        const sheets: NamedSheet[] = wb.SheetNames.map((name: string) => ({
          name,
          rows: XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: null }) as NamedSheet["rows"],
        }));
        const best = pickBestSheet(sheets);
        if (!best) throw new Error("No encontré ninguna hoja con datos de productos.");
        const { rows, warnings: w, omitidosSinCantidad } = processRows(best, cfg);
        setProcessed(rows);
        setWarnings(w);
        setOmitidosSinCantidad(omitidosSinCantidad);
        setOrphanSeen(false); // re-evaluar alarma de descripción nueva con el archivo nuevo
        setPriceEdits({}); // el CIF pudo cambiar → recalcular precios desde cero
        setSelected(new Set());
        setDescFilter("");
        setMassPrice("");
        setError("");
        // Empresa destino: preselección del dropdown desde el archivo (Tarea 3)
        const dest = rows.find((r) => r.destino)?.destino || "";
        const match = matchEmpresaFromDestino(dest);
        if (match) setEmpresa(match);
      } catch (err) {
        setProcessed(null);
        setWarnings([]);
        setOmitidosSinCantidad(0);
        setError(err instanceof Error ? err.message : "Error inesperado al leer el archivo.");
      }
    },
    []
  );

  const handleFile = useCallback(
    (file: File) => {
      if (!catalogo) return; // sin catálogo no se procesa (cargando o falló)
      fileRef.current = file;
      runFile(file, { mesIdx, anio, tasa, factor });
    },
    [runFile, mesIdx, anio, tasa, factor, catalogo]
  );

  // Modo dispatcher: procesar el archivo inyectado automáticamente (mismo tab).
  // Espera a que el catálogo esté cargado; fileRef evita reprocesar cuando el
  // catálogo cambia (p.ej. al aprobar una descripción).
  useEffect(() => {
    if (injectedFile && catalogo && fileRef.current !== injectedFile) handleFile(injectedFile);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [injectedFile, catalogo]);

  // Reprocesar al cambiar un parámetro si ya hay archivo cargado
  const reprocess = useCallback(
    (patch: Partial<{ mesIdx: number; anio: string; tasa: string; factor: string }>) => {
      const cfg = { mesIdx, anio, tasa, factor, ...patch };
      if (fileRef.current) runFile(fileRef.current, cfg);
    },
    [runFile, mesIdx, anio, tasa, factor]
  );

  const reset = () => {
    fileRef.current = null;
    setProcessed(null);
    setWarnings([]);
    setError("");
    setFileName("");
    setEmpresa("");
    setPriceEdits({});
    setSelected(new Set());
    setDescFilter("");
    setMassPrice("");
    if (inputRef.current) inputRef.current.value = "";
    onReset?.(); // en modo dispatcher, volver a la dropzone compartida
  };

  const onTallaChange = (rowIdx: number, nuevaTalla: string) => {
    setProcessed((prev) =>
      prev ? prev.map((r, i) => (i === rowIdx ? setRowTalla(r, nuevaTalla) : r)) : prev
    );
  };

  // ── Fórmulas guardadas + marcas presentes ──────────────────────────────────
  useEffect(() => {
    let alive = true;
    fetch("/api/productos/cargar/formulas")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("fetch"))))
      .then((d) => { if (alive) setSavedFormulas(d.rows ?? []); })
      .catch(() => {});
    fetch("/api/productos/cargar/rubro-formulas")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("fetch"))))
      .then((d) => { if (alive) setRubroFormulas(d.rows ?? []); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  // Excepciones por marca+rubro indexadas por clave canónica.
  const rubroByKey = useMemo(() => {
    const m = new Map<string, MarcaRubroFormula>();
    for (const f of rubroFormulas) m.set(marcaRubroKey(f.marca, f.rubro), f);
    return m;
  }, [rubroFormulas]);

  // Marcas únicas presentes en el Excel (key normalizada + etiqueta original).
  const marcasPresentes = useMemo(() => {
    if (!processed) return [] as { key: string; label: string }[];
    const seen = new Map<string, string>();
    for (const r of processed) {
      const label = String(r.cols["Marca *"] || "");
      const key = marcaKey(label);
      if (key && !seen.has(key)) seen.set(key, label);
    }
    return [...seen.entries()].map(([key, label]) => ({ key, label }));
  }, [processed]);

  const savedByNorm = useMemo(() => {
    const m = new Map<string, MarcaFormula>();
    for (const f of savedFormulas) m.set(marcaKey(f.marca), f);
    return m;
  }, [savedFormulas]);

  // Siembra/refresca las fórmulas editables de las marcas presentes desde lo guardado.
  useEffect(() => {
    const next: Record<string, MarcaFormula> = {};
    for (const { key, label } of marcasPresentes) {
      const saved = savedByNorm.get(key);
      next[key] = saved
        ? { marca: saved.marca, empresa: saved.empresa, divisor: saved.divisor, extra: saved.extra, redondeo: saved.redondeo }
        : { ...BLANK_FORMULA, marca: label };
    }
    setMarcaForms(next);
  }, [marcasPresentes, savedByNorm]);

  // ── Cálculo de precio por fila ──────────────────────────────────────────────
  const formulaForRow = useCallback(
    (row: ProcessedRow): { divisor: number; extra: number; redondeo: Redondeo } | null => {
      if (priceMode === "global") return applied;
      // PRIORIDAD: excepción por marca+DESCRIPCIÓN gana; si no, la fórmula de la marca.
      const exc = rubroByKey.get(marcaRubroKey(row.cols["Marca *"], row.cols["Descripción *"]));
      if (exc && exc.divisor) return { divisor: exc.divisor, extra: exc.extra, redondeo: exc.redondeo };
      return marcaForms[marcaKey(row.cols["Marca *"])] ?? null;
    },
    [priceMode, applied, marcaForms, rubroByKey]
  );

  const cifOf = (row: ProcessedRow): number | null => {
    const v = row.cols["Costo CIF *"];
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  // Excepción por marca+descripción de la fila (solo en modo "por marca").
  const excForRow = (row: ProcessedRow): MarcaRubroFormula | null =>
    priceMode === "global" ? null : (rubroByKey.get(marcaRubroKey(row.cols["Marca *"], row.cols["Descripción *"])) ?? null);

  // Precio automático: jerarquía precio fijo > fórmula propia > fórmula de la marca.
  const autoPrice = (row: ProcessedRow): number | null => {
    if (priceMode === "global") return calcPrecio(cifOf(row), applied);
    return precioDescripcion(cifOf(row), excForRow(row), marcaForms[marcaKey(row.cols["Marca *"])] ?? null);
  };

  // Precio final de una fila: editado a mano si lo hay, si no el calculado.
  const finalPrice = (i: number, row: ProcessedRow): number | null => {
    const raw = priceEdits[i];
    if (raw !== undefined) {
      const t = raw.trim();
      if (t === "") return null;
      const n = Number(t);
      return Number.isFinite(n) ? n : null;
    }
    return autoPrice(row);
  };

  const displayPrice = (i: number, row: ProcessedRow): string => {
    const raw = priceEdits[i];
    if (raw !== undefined) return raw;
    const a = autoPrice(row);
    return a === null ? "" : String(a);
  };

  // Texto de la columna "Cálculo": divisor (+extra) y margen REAL post-redondeo (A6).
  // Si el precio fue editado a mano, solo el margen (la fórmula ya no aplica).
  const calcCell = (i: number, row: ProcessedRow): string => {
    const cif = cifOf(row);
    const fp = finalPrice(i, row);
    const m = marginPct(cif, fp);
    const mTxt = m === null ? "" : `${m}%`;
    if (priceEdits[i] !== undefined) return mTxt ? `· ${mTxt}` : "—"; // editado a mano
    const exc = excForRow(row);
    if (exc?.precio_fijo) return mTxt ? `fijo · ${mTxt}` : "fijo"; // precio fijo gana
    const f = formulaForRow(row);
    if (!f || !f.divisor) return "—";
    const ex = f.extra > 0 ? `+${f.extra}` : "";
    return mTxt ? `÷${f.divisor}${ex} · ${mTxt}` : `÷${f.divisor}${ex}`;
  };

  const onPriceEdit = (i: number, value: string) =>
    setPriceEdits((prev) => ({ ...prev, [i]: value }));

  const applyGlobal = () =>
    setApplied({ divisor: Number(draftDivisor) || 0, extra: draftExtra, redondeo: draftRedondeo });

  const onMarcaFormChange = (key: string, patch: Partial<MarcaFormula>) =>
    setMarcaForms((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));

  const saveMarca = async (key: string) => {
    const f = marcaForms[key];
    if (!f || savingMarca) return;
    setSavingMarca(key);
    try {
      const empresaLabel = EMPRESAS_DESTINO.find((e) => e.key === empresa)?.label || null;
      const res = await fetch("/api/productos/cargar/formulas", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          marca: f.marca,
          empresa: f.empresa ?? empresaLabel,
          divisor: f.divisor,
          extra: f.extra,
          redondeo: f.redondeo,
        }),
      });
      if (res.ok) {
        const d = await fetch("/api/productos/cargar/formulas").then((r) => r.json()).catch(() => null);
        if (d?.rows) setSavedFormulas(d.rows);
      }
    } finally {
      setSavingMarca(null);
    }
  };

  const draftFormulaTxt = formulaText({ divisor: Number(draftDivisor) || 0, extra: draftExtra, redondeo: draftRedondeo });

  // ── Filtro por descripción (visual) + selección masiva de precio ────────────
  const visibleRows = useMemo(() => {
    if (!processed) return [] as { d: ProcessedRow; ri: number }[];
    const q = norm(descFilter);
    return processed
      .map((d, ri) => ({ d, ri }))
      // Filtro por descripción exacta (dropdown). "" = todas.
      .filter(({ d }) => !q || norm(d.cols["Descripción *"]) === q)
      // Orden alfabético por Descripción por default (A5). Solo la vista; el
      // índice ri original se mantiene para selección/edición/descarga.
      .sort((a, b) => String(a.d.cols["Descripción *"] || "").localeCompare(String(b.d.cols["Descripción *"] || ""), "es"));
  }, [processed, descFilter]);

  // Descripciones distintas presentes en el Excel cargado, orden alfabético (para
  // el dropdown de filtro). Se regenera al cargar otro archivo (depende de processed).
  const descripciones = useMemo(() => {
    if (!processed) return [] as string[];
    const set = new Set<string>();
    for (const r of processed) {
      const d = String(r.cols["Descripción *"] || "");
      if (d) set.add(d);
    }
    return [...set].sort((a, b) => a.localeCompare(b, "es"));
  }, [processed]);

  const visibleIdx = useMemo(() => visibleRows.map((r) => r.ri), [visibleRows]);
  const allVisibleSelected = visibleIdx.length > 0 && visibleIdx.every((i) => selected.has(i));
  const someVisibleSelected = visibleIdx.some((i) => selected.has(i));

  const onFilterChange = (v: string) => { setDescFilter(v); setSelected(new Set()); };

  const toggleRow = (i: number) =>
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(i)) n.delete(i); else n.add(i);
      return n;
    });

  const toggleAllVisible = () =>
    setSelected((prev) => {
      const n = new Set(prev);
      if (visibleIdx.every((i) => prev.has(i))) visibleIdx.forEach((i) => n.delete(i));
      else visibleIdx.forEach((i) => n.add(i));
      return n;
    });

  // Aplica un precio a las filas seleccionadas (marca cada una como editada a mano).
  const applyMassPrice = () => {
    if (selected.size === 0) return;
    setPriceEdits((prev) => {
      const n = { ...prev };
      selected.forEach((i) => { n[i] = massPrice; });
      return n;
    });
    setSelected(new Set());
  };

  const download = async () => {
    if (!processed || downloading || !catalogo) return;
    if (descsNuevas.length > 0) return; // bloqueado: descripciones nuevas sin aprobar (Tarea 2)
    setDownloading(true);
    try {
      const XLSX = (await import("xlsx-js-style")).default;
      // El precio final (calculado o editado) va a la columna "Precio *".
      // Proveedor fijo según la empresa destino (CAMBIO 2); otras empresas dejan el del archivo.
      const provFijo = proveedorParaEmpresa(empresa);
      const finalRows = processed.map((r, i) => {
        const cols: Record<string, string | number | null> = { ...r.cols, "Precio *": finalPrice(i, r) };
        if (provFijo) cols["Proveedor *"] = provFijo;
        return { ...r, cols };
      });
      // Plantilla según la empresa destino (Fashion Shoes = 1 columna de costo) (Tarea 5).
      const aoa = buildAoa(finalRows, outColsForEmpresa(empresa));
      const ws = XLSX.utils.aoa_to_sheet(aoa);

      // Forzar formato texto en Código(0), Referencia(1), Código Barra(2)
      const range = XLSX.utils.decode_range(ws["!ref"] as string);
      for (let R = 1; R <= range.e.r; R++) {
        for (const C of TEXT_COLS) {
          const addr = XLSX.utils.encode_cell({ r: R, c: C });
          if (ws[addr]) {
            ws[addr].t = "s";
            ws[addr].v = String(ws[addr].v);
            ws[addr].z = "@";
          }
        }
      }
      // anchos cómodos
      ws["!cols"] = aoa[0].map((_c, i) => ({ wch: i === 3 ? 26 : i < 3 ? 16 : 13 }));

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "upload");
      XLSX.writeFile(wb, outputFilename(processed));

      // Historial liviano (Tarea 4) — lo único que toca el server
      if (onDownloaded) {
        const t = computeTotales(processed);
        const empresaLabel = EMPRESAS_DESTINO.find((e) => e.key === empresa)?.label || "";
        onDownloaded({
          empresa: empresaLabel,
          marca: t.marca,
          cantidad_estilos: t.cantidad_estilos,
          total_unidades: t.total_unidades,
          total_costo: t.total_costo,
        });
      }
    } finally {
      setDownloading(false);
    }
  };

  const totalUnits = processed?.reduce((s, d) => s + (Number(d.cols["Stock Ideal"]) || 0), 0) ?? 0;
  const marcas = processed ? [...new Set(processed.map((d) => d.cols["Marca *"]).filter(Boolean))] : [];
  const revisar = processed?.filter((d) => d.fallback).length ?? 0;

  // Descripciones huérfanas: bajo una marca CK/TH conocida pero NO en su catálogo,
  // tras aplicar normalización (Tarea 8). Las de marca "Otros"/desconocida NO cuentan
  // (son basura intencional). No rompen: se procesan con su marca, solo se alarma.
  // Depende del catálogo en memoria → al aprobar una descripción se re-evalúa en vivo.
  const descsNuevas = useMemo(() => {
    if (!processed || !catalogo) return [] as { marca: string; desc: string }[];
    const seen = new Set<string>();
    const out: { marca: string; desc: string }[] = [];
    for (const r of processed) {
      const marca = String(r.cols["Marca *"] || "");
      const desc = String(r.cols["Descripción *"] || "");
      if (!desc) continue;
      if (descripcionesDeMarca(catalogo, marca).length === 0) continue; // marca no catalogada (Otros) → ignorar
      const k = `${marcaKey(marca)}|||${marcaKey(desc)}`;
      if (seen.has(k)) continue;
      seen.add(k);
      if (!esDescripcionCatalogada(catalogo, marca, desc)) out.push({ marca, desc });
    }
    return out;
  }, [processed, catalogo]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      {/* Alarma de descripción NUEVA no catalogada (Tarea 8) — BLOQUEA la descarga.
          Admin/secretaria pueden aprobarlas ahí mismo; al aprobar, el catálogo en
          memoria se actualiza y la alarma se re-evalúa en vivo. */}
      {processed && descsNuevas.length > 0 && !orphanSeen && (
        <AlarmaDescripcionesNuevas
          items={descsNuevas}
          onAprobada={(marca, desc) => { agregarDescripcion(marca, desc); }}
          onClose={() => setOrphanSeen(true)}
        />
      )}

      {/* Masthead compacto */}
      <div className="mb-4 border-b border-stone-300 pb-2.5">
        <h1 className="font-serif text-xl font-semibold tracking-tight text-stone-900">
          Depurador de Productos
        </h1>
      </div>

      {/* Estado del catálogo de descripciones (bloquea procesar/descargar) */}
      {catalogoCargando && (
        <div className="mb-4 rounded-lg border border-stone-200 bg-white px-4 py-3 text-sm text-stone-600">
          Cargando catálogo de descripciones…
        </div>
      )}
      {catalogoFallo && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <span>No se pudo cargar el catálogo de descripciones. Intenta de nuevo.</span>
          <button
            type="button"
            onClick={reintentarCatalogo}
            className="rounded-md border border-red-300 bg-white px-3 py-1 text-[13px] font-semibold text-red-700 transition hover:bg-red-100 active:scale-[0.97]"
          >
            Reintentar
          </button>
        </div>
      )}

      {/* Drop zone propia (oculta en modo dispatcher: el padre tiene la dropzone) */}
      {!embedded && (
        <label
          onDragEnter={(e) => { e.preventDefault(); setDragging(true); }}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={(e) => { e.preventDefault(); setDragging(false); }}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
          }}
          className={`mb-4 flex flex-col items-center rounded-xl border-2 border-dashed px-6 py-6 text-center transition ${
            !catalogo
              ? "cursor-not-allowed border-stone-200 bg-stone-100 opacity-60"
              : dragging ? "cursor-pointer border-teal-600 bg-teal-50" : "cursor-pointer border-stone-300 bg-white hover:border-teal-600 hover:bg-teal-50"
          }`}
        >
          <UploadCloud className="mb-2 h-7 w-7 text-teal-800" strokeWidth={1.6} />
          <div className="text-base font-semibold text-stone-900">
            {!catalogo
              ? "Espera a que cargue el catálogo de descripciones…"
              : fileName || "Suelta el archivo aquí o haz clic para buscar"}
          </div>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            disabled={!catalogo}
            onChange={(e) => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }}
          />
        </label>
      )}

      {/* Config (colapsable — casi nunca cambia: factor 1.1, tasa 7) */}
      <details className="mb-4 rounded-xl border border-stone-200 bg-white">
        <summary className="cursor-pointer list-none px-4 py-2 text-[12px] font-medium text-stone-500 [&::-webkit-details-marker]:hidden">
          <span className="text-stone-400">▸</span> Editar temporada y costos
        </summary>
        <div className="grid grid-cols-2 gap-3.5 border-t border-stone-200 p-4 sm:grid-cols-4">
        <Field label="Mes de entrada (temporada)" note="Se graba como fecha de ingreso del producto.">
          <select
            value={mesIdx}
            onChange={(e) => { const v = parseInt(e.target.value); setMesIdx(v); reprocess({ mesIdx: v }); }}
            className={selectCls}
          >
            {MESES.map((m, i) => <option key={m} value={i}>{m}</option>)}
          </select>
        </Field>
        <Field label="Año">
          <input
            type="number" min={2020} max={2099} value={anio}
            onChange={(e) => { setAnio(e.target.value); reprocess({ anio: e.target.value }); }}
            className={inputCls}
          />
        </Field>
        <Field label="Tasa de impuesto">
          <input
            type="text" value={tasa}
            onChange={(e) => { setTasa(e.target.value); reprocess({ tasa: e.target.value }); }}
            className={inputCls}
          />
        </Field>
        <Field label="Factor costo CIF" note="Costo FOB × este factor = CIF.">
          <input
            type="number" step="0.01" value={factor}
            onChange={(e) => { setFactor(e.target.value); reprocess({ factor: e.target.value }); }}
            className={inputCls}
          />
        </Field>
        </div>
      </details>

      {/* Error */}
      {error && (
        <div className="mb-5 flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <span aria-hidden>✕</span>
          <div><b className="font-semibold">No se pudo procesar.</b> {error}</div>
        </div>
      )}

      {processed && processed.length > 0 && (
        <>
          {/* Avisos */}
          {warnings.length > 0 && (
            <div className="mb-5 flex items-start gap-2.5 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <span aria-hidden>!</span>
              <div>
                <b className="font-semibold">{warnings.length} aviso(s)</b> de datos faltantes
                (puedes corregirlos en el Excel antes de subir):
                <ul className="ml-4 mt-1.5 list-disc">
                  {warnings.slice(0, 8).map((x, i) => <li key={i}>{x}</li>)}
                </ul>
                {warnings.length > 8 && <div className="mt-1">…y {warnings.length - 8} más.</div>}
              </div>
            </div>
          )}
          {revisar > 0 && (
            <div className="mb-5 flex items-start gap-2.5 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <span aria-hidden>!</span>
              <div>
                <b className="font-semibold">{revisar} estilo(s) en ámbar</b>: la regla no encontró
                la talla esperada y usó la más chica. Revísalos en la tabla y ajusta la talla si hace falta.
              </div>
            </div>
          )}

          {/* Barra compacta: empresa destino + acciones (Tarea 3 / A2) */}
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-stone-200 bg-white px-3 py-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">Destino</span>
            <select value={empresa} onChange={(e) => setEmpresa(e.target.value)} className="min-w-[200px] flex-1 rounded-md border border-stone-300 bg-stone-50 px-2.5 py-1.5 text-sm text-stone-900 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20">
              <option value="">Selecciona una empresa…</option>
              {EMPRESAS_DESTINO.map((e) => (
                <option key={e.key} value={e.key}>{e.label} ({e.marca})</option>
              ))}
            </select>
            <button
              onClick={download}
              disabled={downloading || descsNuevas.length > 0 || !catalogo}
              className="rounded-md bg-teal-600 px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-teal-700 active:scale-[0.97] disabled:cursor-not-allowed disabled:bg-stone-300"
            >
              {downloading ? "Generando…" : "Descargar plantilla"}
            </button>
            <button
              onClick={reset}
              className="rounded-md border border-stone-300 bg-white px-3 py-1.5 text-sm font-semibold text-stone-900 transition hover:border-teal-600 hover:text-teal-800 active:scale-[0.97]"
            >
              Otro archivo
            </button>
          </div>

          {/* Bloqueo de descarga por descripciones nuevas sin aprobar (Tarea 2) */}
          {descsNuevas.length > 0 && (
            <p className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[13px] font-semibold text-red-700">
              <span>🔒 Bloqueado: hay {descsNuevas.length} descripción(es) nueva(s) sin aprobar.</span>
              <button
                type="button"
                onClick={() => setOrphanSeen(false)}
                className="rounded-md border border-red-300 bg-white px-2 py-0.5 text-[12px] font-semibold text-red-700 transition hover:bg-red-100 active:scale-[0.97]"
              >
                Ver y aprobar
              </button>
            </p>
          )}

          {/* Stats slim — línea única fusionada (A1) */}
          <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-stone-200 bg-white px-4 py-2 text-[13px] text-stone-600">
            <span><b className="font-semibold text-stone-900">{processed.length}</b> estilos</span>
            <span className="text-stone-300">·</span>
            <span><b className="font-semibold text-stone-900">{totalUnits.toLocaleString()}</b> unidades</span>
            <span className="text-stone-300">·</span>
            <span><b className="font-semibold text-stone-900">{marcas.length}</b> marca(s)</span>
            <span className="text-stone-300">·</span>
            <span className="font-semibold text-stone-900">{String(processed[0].cols["Temporada"])}</span>
            <span className="text-stone-300">·</span>
            <span>tasa {tasa}</span>
            <span className="text-stone-300">·</span>
            <span>factor {factor}</span>
          </div>

          {/* Aviso discreto: no se perdió nada, el proveedor no pidió esos artículos */}
          {omitidosSinCantidad > 0 && (
            <div className="mb-4 px-1 text-[12px] text-stone-500">
              {omitidosSinCantidad.toLocaleString()} artículo{omitidosSinCantidad === 1 ? "" : "s"} sin
              cantidad en el archivo no se {omitidosSinCantidad === 1 ? "incluyó" : "incluyeron"}.
              Los servicios (ajustes, retenciones) sí se incluyen aunque vayan en 0.
            </div>
          )}

          {/* Cálculo de precio (Tarea 2 / A2) */}
          <div className="mb-4 rounded-xl border border-stone-200 bg-white p-3.5">
            <div className="mb-2.5 text-[11px] font-semibold uppercase tracking-wide text-stone-500">
              ¿Cómo calcular los precios?
            </div>
            <div className="mb-3 flex overflow-hidden rounded-lg border border-stone-300">
              <ModeBtn
                active={priceMode === "global"}
                onClick={() => setPriceMode("global")}
                title="Una fórmula para todo"
                desc="Un divisor + extra para todas las filas."
              />
              <ModeBtn
                active={priceMode === "marca"}
                onClick={() => setPriceMode("marca")}
                title="Fórmula guardada por marca"
                desc="Cada marca usa su fórmula guardada."
                last
              />
            </div>

            {priceMode === "global" ? (
              <>
                {/* Controles en una sola fila, alineados por la base, misma altura */}
                <div className="flex flex-wrap items-end gap-3">
                  <div className="w-36">
                    <label className={priceLabelCls}>Divisor</label>
                    <input
                      type="number" step="0.01" value={draftDivisor}
                      onChange={(e) => setDraftDivisor(e.target.value)} className={priceFieldCls}
                    />
                  </div>
                  <div className="w-28">
                    <label className={priceLabelCls}>Extra $</label>
                    <select value={draftExtra} onChange={(e) => setDraftExtra(parseInt(e.target.value))} className={priceFieldCls}>
                      {[0, 1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </div>
                  <div className="w-48">
                    <label className={priceLabelCls}>Redondeo</label>
                    <select value={draftRedondeo} onChange={(e) => setDraftRedondeo(e.target.value as Redondeo)} className={priceFieldCls}>
                      <option value="int">Entero hacia arriba</option>
                      <option value="half">A .50 hacia arriba</option>
                    </select>
                  </div>
                  <button
                    type="button" onClick={applyGlobal}
                    className="h-9 rounded-md bg-teal-600 px-5 text-sm font-semibold text-white transition hover:bg-teal-700 active:scale-[0.97]"
                  >
                    Aplicar a todo
                  </button>
                </div>
                {/* Atajos de divisor, alineados a la izquierda bajo el campo Divisor */}
                <div className="mt-2 flex gap-1.5">
                  {DIVISOR_HINTS.map((h) => (
                    <button
                      key={h} type="button" onClick={() => setDraftDivisor(String(h))}
                      className={`rounded-md border px-2 py-0.5 text-[11px] transition ${
                        Number(draftDivisor) === h
                          ? "border-teal-600 bg-teal-600 text-white"
                          : "border-stone-300 bg-white text-stone-500 hover:border-teal-600 hover:bg-teal-50 hover:text-teal-800"
                      }`}
                    >
                      {h.toFixed(2)}
                    </button>
                  ))}
                </div>
                <div className="mt-2.5 rounded-md border border-stone-200 bg-stone-50 px-3 py-1.5 text-[12px] text-stone-600">
                  precio = <b className="font-mono text-stone-800">{draftFormulaTxt}</b>
                </div>
              </>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-[13px]">
                    <thead>
                      <tr>
                        {["Marca en este Excel", "Estado", "Divisor", "Extra $", "Redondeo", ""].map((h, i) => (
                          <th key={i} className="border-b-[1.5px] border-stone-300 px-2.5 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-stone-500">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {marcasPresentes.map(({ key, label }) => {
                        const f = marcaForms[key] ?? { ...BLANK_FORMULA, marca: label };
                        const saved = savedByNorm.has(key);
                        return (
                          <tr key={key}>
                            <td className="border-b border-stone-100 px-2.5 py-2 font-semibold text-stone-900">{label}</td>
                            <td className="border-b border-stone-100 px-2.5 py-2">
                              {saved
                                ? <span className="rounded bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">Guardada</span>
                                : <span className="rounded bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">Sin guardar</span>}
                            </td>
                            <td className="border-b border-stone-100 px-2.5 py-2">
                              <input
                                type="number" step="0.01" value={f.divisor || ""}
                                onChange={(e) => onMarcaFormChange(key, { divisor: Number(e.target.value) || 0 })}
                                className={miniInputCls}
                              />
                            </td>
                            <td className="border-b border-stone-100 px-2.5 py-2">
                              <select value={f.extra} onChange={(e) => onMarcaFormChange(key, { extra: parseInt(e.target.value) })} className={miniSelectCls}>
                                {[0, 1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                              </select>
                            </td>
                            <td className="border-b border-stone-100 px-2.5 py-2">
                              <select value={f.redondeo} onChange={(e) => onMarcaFormChange(key, { redondeo: e.target.value as Redondeo })} className={miniSelectCls}>
                                <option value="int">Entero</option>
                                <option value="half">.50</option>
                              </select>
                            </td>
                            <td className="border-b border-stone-100 px-2.5 py-2">
                              <button
                                type="button" onClick={() => saveMarca(key)} disabled={savingMarca === key}
                                className="text-[12px] font-semibold text-teal-700 transition hover:text-teal-900 disabled:opacity-50"
                              >
                                {savingMarca === key ? "Guardando…" : saved ? "Guardar cambios" : "Guardar fórmula"}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {descsNuevas.length > 0 && (
                  <p className="mt-2.5 text-[12px] font-semibold text-red-600">
                    🔒 {descsNuevas.length} descripción(es) nueva(s) no están en el catálogo: la descarga está
                    bloqueada hasta aprobarlas al catálogo.
                  </p>
                )}
              </>
            )}
          </div>

          {/* Preview */}
          <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 px-4 py-2.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                Vista previa · talla y precio editables
              </span>
              <div className="flex items-center gap-2">
                <select
                  value={descFilter}
                  onChange={(e) => onFilterChange(e.target.value)}
                  className="max-w-[280px] rounded-md border border-stone-300 bg-white px-2.5 py-1.5 text-[13px] focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
                >
                  <option value="">Todas las descripciones</option>
                  {descripciones.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
                <span className="whitespace-nowrap text-[12px] text-stone-500">
                  {descFilter ? `${visibleRows.length} de ${processed.length}` : `${processed.length} filas`}
                </span>
              </div>
            </div>
            {selected.size > 0 && (
              <div className="flex flex-wrap items-center gap-2 border-b border-stone-200 bg-teal-50 px-4 py-2.5">
                <span className="text-[13px] font-medium text-teal-900">{selected.size} seleccionada(s)</span>
                <input
                  value={massPrice}
                  onChange={(e) => setMassPrice(e.target.value)}
                  placeholder="Precio"
                  className="w-24 rounded-md border border-stone-300 bg-white px-2 py-1 text-right font-mono text-[13px] focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
                />
                <button
                  type="button"
                  onClick={applyMassPrice}
                  className="rounded-md bg-teal-600 px-3 py-1.5 text-[13px] font-semibold text-white transition hover:bg-teal-700 active:scale-[0.97]"
                >
                  Poner precio a seleccionadas
                </button>
                <button type="button" onClick={() => setSelected(new Set())} className="text-[12px] font-medium text-stone-500 transition hover:text-stone-800">
                  Limpiar
                </button>
              </div>
            )}
            <div className="max-h-[440px] overflow-auto">
              <table className="w-full table-auto border-collapse text-[12px] tabular-nums">
                <thead>
                  <tr>
                    <th className="sticky top-0 border-b-[1.5px] border-stone-300 bg-stone-100 px-2 py-2.5">
                      <input
                        type="checkbox"
                        ref={(el) => { if (el) el.indeterminate = someVisibleSelected && !allVisibleSelected; }}
                        checked={allVisibleSelected}
                        onChange={toggleAllVisible}
                        className="h-3.5 w-3.5 accent-teal-600"
                        aria-label="Seleccionar todo lo visible"
                      />
                    </th>
                    <Th>Talla</Th>
                    {PREVIEW_COLS_RENDER.map((c) => <Th key={c} narrow={NARROW_COLS.has(c)} tight={c === "__calc"}>{COL_HEAD[c] ?? c}</Th>)}
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.length === 0 ? (
                    <tr>
                      <td colSpan={PREVIEW_COLS_RENDER.length + 2} className="px-4 py-8 text-center text-stone-400">
                        Ninguna fila coincide con &quot;{descFilter}&quot;.
                      </td>
                    </tr>
                  ) : visibleRows.map(({ d, ri }) => {
                    const tallas = Object.keys(d.tallaMap || {});
                    const edited = d.talla !== d.tallaAuto || d.fallback;
                    return (
                      <tr key={ri} className="hover:bg-teal-50">
                        <td className="border-b border-stone-100 px-2 py-2">
                          <input
                            type="checkbox"
                            checked={selected.has(ri)}
                            onChange={() => toggleRow(ri)}
                            className="h-3.5 w-3.5 accent-teal-600"
                            aria-label={`Seleccionar fila ${ri + 1}`}
                          />
                        </td>
                        <td className="border-b border-stone-100 px-2 py-2">
                          {tallas.length > 1 ? (
                            <select
                              value={d.talla}
                              onChange={(e) => onTallaChange(ri, e.target.value)}
                              title={d.fallback ? "La regla no encontró la talla esperada. Revisa." : undefined}
                              className={`rounded-md border px-1 py-0.5 text-xs ${
                                edited
                                  ? "border-amber-600 bg-amber-50 font-semibold text-amber-800"
                                  : "border-stone-300 bg-white text-stone-900"
                              } focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20`}
                            >
                              {tallas.map((t) => <option key={t} value={t}>{t}</option>)}
                            </select>
                          ) : (
                            <span className="inline-block rounded bg-teal-50 px-1.5 py-0.5 text-[11px] font-semibold text-teal-800">
                              {d.talla || "—"}
                            </span>
                          )}
                        </td>
                        {PREVIEW_COLS_RENDER.map((c) => {
                          if (c === "__calc") {
                            return (
                              <td key="__calc" className="w-px whitespace-nowrap border-b border-stone-100 px-2 py-2 text-right font-mono text-[11px] text-stone-400">
                                {calcCell(ri, d)}
                              </td>
                            );
                          }
                          if (c === "Precio *") {
                            const priceEdited = priceEdits[ri] !== undefined;
                            return (
                              <td key={c} className="border-b border-stone-100 px-2 py-2 text-right">
                                <input
                                  value={displayPrice(ri, d)}
                                  onChange={(e) => onPriceEdit(ri, e.target.value)}
                                  className={`w-14 rounded-md border px-1 py-0.5 text-right font-mono text-xs ${
                                    priceEdited
                                      ? "border-amber-600 bg-amber-50 font-semibold text-amber-800"
                                      : "border-stone-300 bg-white text-stone-900"
                                  } focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20`}
                                />
                              </td>
                            );
                          }
                          const v = d.cols[c];
                          const empty = v === null || v === undefined || v === "";
                          const narrow = NARROW_COLS.has(c);
                          const isBarcode = c === "Código Barra *";
                          const isCodigo = c === "Código *";
                          const cls = isBarcode
                            ? "font-mono text-[11px] break-all"
                            : isCodigo
                              ? "font-mono text-[11px]"
                              : narrow
                                ? "whitespace-nowrap text-right"
                                : "";
                          return (
                            <td key={c} className={`border-b border-stone-100 px-2 py-2 ${cls}`}>
                              {empty ? <span className="text-stone-300">—</span> : v}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {!processed && !error && (
        <div className="py-16 text-center text-stone-500">
          <p>Aún no has cargado ningún archivo.</p>
        </div>
      )}
    </div>
  );
}

// ── Subcomponentes / estilos ────────────────────────────────────────────────
const inputCls =
  "w-full rounded-lg border border-stone-300 bg-stone-50 px-3 py-2 text-sm text-stone-900 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20";
const selectCls = inputCls;
const priceLabelCls = "mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-stone-500";
// Campo alineado del modo global (input/select misma altura).
const priceFieldCls =
  "h-9 w-full rounded-md border border-stone-300 bg-stone-50 px-3 text-sm text-stone-900 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20";
const miniInputCls =
  "h-8 w-20 rounded-md border border-stone-300 bg-stone-50 px-2 text-right font-mono text-[13px] text-stone-900 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20";
const miniSelectCls =
  "h-8 rounded-md border border-stone-300 bg-stone-50 px-2 text-[13px] text-stone-900 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20";

function ModeBtn({ active, onClick, title, desc, last }: { active: boolean; onClick: () => void; title: string; desc: string; last?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 px-3 py-2 text-left transition ${last ? "" : "border-r border-stone-200"} ${active ? "bg-teal-50" : "bg-white hover:bg-stone-50"}`}
    >
      <div className="flex items-center gap-2">
        <span className={`h-3.5 w-3.5 flex-shrink-0 rounded-full border-2 ${active ? "border-teal-600 bg-teal-600 ring-2 ring-inset ring-white" : "border-stone-300"}`} />
        <span className={`text-[13px] font-semibold ${active ? "text-teal-800" : "text-stone-900"}`}>{title}</span>
      </div>
      <div className="mt-0.5 pl-[22px] text-[11px] text-stone-500">{desc}</div>
    </button>
  );
}

function Field({ label, note, children }: { label: string; note?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-stone-500">{label}</label>
      {children}
      {note && <div className="mt-1 text-[11px] text-stone-500">{note}</div>}
    </div>
  );
}

function Th({ children, narrow, tight }: { children: React.ReactNode; narrow?: boolean; tight?: boolean }) {
  return (
    <th className={`sticky top-0 border-b-[1.5px] border-stone-300 bg-stone-100 px-2 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-stone-600 ${narrow ? "whitespace-nowrap text-right" : "text-left"} ${tight ? "w-px" : ""}`}>
      {children}
    </th>
  );
}

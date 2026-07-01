"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { UploadCloud } from "lucide-react";
import {
  parseReebok,
  detectMonthCol,
  monthOptions,
  buildCatalogo,
  buildCatalogoAoa,
  buildSwitchRows,
  buildSwitchAoa,
  TEXT_COLS,
  REEBOK_MARCA_A,
  REEBOK_MARCA_B,
  REEBOK_EMPRESA,
  REEBOK_FORMULA_A_DEFAULT,
  REEBOK_FORMULA_B_DEFAULT,
  type ReebokItem,
  type CatalogoRow,
  type SwitchRow,
  type MonthOption,
  type PrecioAB,
  type PriceFormula,
} from "@/lib/depurador/reebok";
import { marcaKey, type Redondeo, type MarcaFormula } from "@/lib/depurador/logic";
import type { SheetRow } from "@/lib/depurador/logic";

type Salida = "catalogo" | "switch";

interface ReebokClientProps {
  /** Archivo inyectado por el dispatcher (mismo tab CK/TH). Si viene, se oculta la
   *  dropzone propia y se procesa automáticamente. */
  injectedFile?: File | null;
  /** Volver a la dropzone del dispatcher. */
  onReset?: () => void;
}

export default function ReebokClient({ injectedFile, onReset }: ReebokClientProps = {}) {
  const fileRef = useRef<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const embedded = injectedFile !== undefined;

  const [fileName, setFileName] = useState("");
  const [dragging, setDragging] = useState(false);
  const [rawRows, setRawRows] = useState<SheetRow[] | null>(null);
  const [items, setItems] = useState<ReebokItem[] | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState<"" | "catalogo" | "switch">("");

  // Config de salida
  const [months, setMonths] = useState<MonthOption[]>([]);
  const [monthColIdx, setMonthColIdx] = useState<number>(-1);
  const [salida, setSalida] = useState<Salida>("catalogo");
  const [precioAB, setPrecioAB] = useState<PrecioAB>("A");
  const [tasa] = useState("7");

  // Fórmulas editables Reebok (Precio A / Precio B), guardadas en marca_formulas.
  const [formulaA, setFormulaA] = useState<PriceFormula>(REEBOK_FORMULA_A_DEFAULT);
  const [formulaB, setFormulaB] = useState<PriceFormula>(REEBOK_FORMULA_B_DEFAULT);
  const [savingF, setSavingF] = useState<PrecioAB | null>(null);
  const [flashF, setFlashF] = useState<PrecioAB | null>(null);

  // Temporada automática: fecha actual, día 1 del mes en curso, formato AAAA-MM
  // (idéntico a CK/TH → logic.ts). Sin campo manual.
  const temporada = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  }, []);

  // Cargar fórmulas guardadas de Reebok (si existen). Default = equivalente histórico.
  useEffect(() => {
    let alive = true;
    fetch("/api/productos/cargar/formulas")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("fetch"))))
      .then((d: { rows: MarcaFormula[] }) => {
        if (!alive) return;
        const byKey = new Map((d.rows ?? []).map((f) => [marcaKey(f.marca), f] as const));
        const a = byKey.get(marcaKey(REEBOK_MARCA_A));
        const b = byKey.get(marcaKey(REEBOK_MARCA_B));
        if (a) setFormulaA({ divisor: a.divisor, extra: a.extra, redondeo: a.redondeo });
        if (b) setFormulaB({ divisor: b.divisor, extra: b.extra, redondeo: b.redondeo });
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const runFile = useCallback(async (file: File, monthIdx?: number) => {
    setFileName(file.name);
    try {
      const buf = await file.arrayBuffer();
      const XLSX = (await import("xlsx-js-style")).default;
      const wb = XLSX.read(buf, { type: "array" });
      // El Book4 trae los datos en la primera hoja.
      const sheetName = wb.SheetNames[0];
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, raw: true, defval: null }) as SheetRow[];

      // Detectar headers para poblar el dropdown de "columna de piezas".
      const { findHeaderRow } = await import("@/lib/depurador/reebok");
      const hr = findHeaderRow(rows);
      const headers = hr === -1 ? [] : rows[hr];
      const opts = monthOptions(headers);
      const detected = monthIdx !== undefined ? monthIdx : detectMonthCol(headers);

      const { items: parsed, warnings: w } = parseReebok(rows, detected);
      setRawRows(rows);
      setItems(parsed);
      setMonths(opts);
      setMonthColIdx(detected);
      setWarnings(w);
      setError("");
    } catch (err) {
      setRawRows(null);
      setItems(null);
      setMonths([]);
      setError(err instanceof Error ? err.message : "Error inesperado al leer el archivo.");
    }
  }, []);

  const handleFile = useCallback((file: File) => {
    fileRef.current = file;
    runFile(file);
  }, [runFile]);

  // Modo dispatcher: procesar el archivo inyectado automáticamente.
  useEffect(() => {
    if (injectedFile) { fileRef.current = injectedFile; runFile(injectedFile); }
  }, [injectedFile, runFile]);

  // Cambiar la columna de piezas re-parsea desde las filas ya cargadas (sin releer el archivo).
  const onMonthChange = (idx: number) => {
    setMonthColIdx(idx);
    if (!rawRows) return;
    try {
      const { items: parsed, warnings: w } = parseReebok(rawRows, idx);
      setItems(parsed);
      setWarnings(w);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al reprocesar.");
    }
  };

  const reset = () => {
    fileRef.current = null;
    setRawRows(null);
    setItems(null);
    setMonths([]);
    setMonthColIdx(-1);
    setWarnings([]);
    setError("");
    setFileName("");
    if (inputRef.current) inputRef.current.value = "";
    onReset?.(); // en modo dispatcher, volver a la dropzone compartida
  };

  const monthLabel = useMemo(
    () => months.find((m) => m.idx === monthColIdx)?.label ?? "",
    [months, monthColIdx],
  );

  const catalogo: CatalogoRow[] = useMemo(
    () => (items ? buildCatalogo(items, { formulaA, formulaB }) : []),
    [items, formulaA, formulaB],
  );
  const totalPiezas = useMemo(() => catalogo.reduce((s, r) => s + r.piezas, 0), [catalogo]);
  // Filas Switch (una por artículo) para preview y descarga.
  const switchRows: SwitchRow[] = useMemo(
    () => (items ? buildSwitchRows(items, { formula: precioAB === "A" ? formulaA : formulaB, temporada, tasa }) : []),
    [items, precioAB, formulaA, formulaB, temporada, tasa],
  );
  const revisar = useMemo(() => switchRows.filter((r) => r.fallback).length, [switchRows]);

  // Guardar una fórmula Reebok en el sistema de fórmulas por marca.
  const saveFormula = async (which: PrecioAB) => {
    if (savingF) return;
    const marca = which === "A" ? REEBOK_MARCA_A : REEBOK_MARCA_B;
    const f = which === "A" ? formulaA : formulaB;
    setSavingF(which);
    try {
      const res = await fetch("/api/productos/cargar/formulas", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ marca, empresa: REEBOK_EMPRESA, divisor: f.divisor, extra: f.extra, redondeo: f.redondeo }),
      });
      if (res.ok) { setFlashF(which); setTimeout(() => setFlashF((x) => (x === which ? null : x)), 1500); }
    } finally {
      setSavingF(null);
    }
  };

  // Fuerza a texto las columnas dadas (evita notación científica en códigos numéricos).
  const forceTextCols = (
    XLSX: { utils: { decode_range: (r: string) => { e: { r: number } }; encode_cell: (a: { r: number; c: number }) => string } },
    ws: Record<string, { t?: string; v?: unknown; z?: string }>,
    textCols: number[],
  ) => {
    const range = XLSX.utils.decode_range((ws as unknown as { "!ref": string })["!ref"]);
    for (let R = 1; R <= range.e.r; R++) {
      for (const C of textCols) {
        const addr = XLSX.utils.encode_cell({ r: R, c: C });
        if (ws[addr]) {
          ws[addr].t = "s";
          ws[addr].v = String(ws[addr].v);
          ws[addr].z = "@";
        }
      }
    }
  };

  // Salida A — Catálogo de clientes (pedido).
  const downloadCatalogo = async () => {
    if (!items || downloading) return;
    setDownloading("catalogo");
    try {
      const XLSX = (await import("xlsx-js-style")).default;
      const aoa = buildCatalogoAoa(catalogo, monthLabel);
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      // Código de artículo como texto (New Article numérico → evita notación científica).
      forceTextCols(XLSX, ws as never, [1]);
      ws["!cols"] = aoa[0].map((_c, i) => ({ wch: i === 2 ? 26 : i === 1 ? 14 : 13 }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Pedido");
      XLSX.writeFile(wb, `Pedido_ActiveShoes_${monthLabel || temporada}.xlsx`);
    } finally {
      setDownloading("");
    }
  };

  // Salida B — Plantilla Switch (una fila por artículo).
  const downloadSwitch = async () => {
    if (!items || downloading) return;
    setDownloading("switch");
    try {
      const XLSX = (await import("xlsx-js-style")).default;
      const aoa = buildSwitchAoa(switchRows);
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      // Código(0), Referencia(1), Código Barra(2) forzados a texto (igual que el Depurador).
      forceTextCols(XLSX, ws as never, TEXT_COLS);
      ws["!cols"] = aoa[0].map((_c, i) => ({ wch: i === 3 ? 26 : i < 3 ? 16 : 13 }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "upload");
      XLSX.writeFile(wb, `Plantilla_Switch_ActiveShoes_${temporada}.xlsx`);
    } finally {
      setDownloading("");
    }
  };

  const fmt = (v: number | null): string => (v === null ? "—" : String(v));
  const num = (v: string | number | null | undefined): string =>
    v === null || v === undefined || v === "" ? "—" : String(v);

  const handleDownload = () => (salida === "catalogo" ? downloadCatalogo() : downloadSwitch());

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      {/* Masthead */}
      <div className="mb-4 border-b border-stone-300 pb-2.5">
        <h1 className="font-serif text-xl font-semibold tracking-tight text-stone-900">
          Reebok · Active Shoes
        </h1>
        {!embedded && (
          <p className="mt-1 text-[13px] text-stone-500">
            Sube el Excel del proveedor Reebok. Genera dos archivos: pedido para clientes y plantilla de Switch.
          </p>
        )}
      </div>

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
          className={`mb-4 flex cursor-pointer flex-col items-center rounded-xl border-2 border-dashed px-6 py-6 text-center transition ${
            dragging ? "border-red-600 bg-red-50" : "border-stone-300 bg-white hover:border-red-600 hover:bg-red-50"
          }`}
        >
          <UploadCloud className="mb-2 h-7 w-7 text-red-700" strokeWidth={1.6} />
          <div className="text-base font-semibold text-stone-900">
            {fileName || "Suelta el archivo Reebok aquí o haz clic para buscar"}
          </div>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }}
          />
        </label>
      )}

      {/* Banner Reebok detectado (modo dispatcher) */}
      {embedded && items && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-800">
          <span className="rounded bg-red-600 px-1.5 py-0.5 text-[11px] font-bold text-white">REEBOK</span>
          <span>Detecté el formato Reebok · Active Shoes. <b>{fileName}</b></span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mb-5 flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <span aria-hidden>✕</span>
          <div><b className="font-semibold">No se pudo procesar.</b> {error}</div>
        </div>
      )}

      {items && items.length > 0 && (
        <>
          {/* Avisos */}
          {warnings.length > 0 && (
            <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <span aria-hidden>!</span>
              <div>
                <b className="font-semibold">{warnings.length} aviso(s)</b> de datos faltantes:
                <ul className="ml-4 mt-1.5 list-disc">
                  {warnings.slice(0, 8).map((x, i) => <li key={i}>{x}</li>)}
                </ul>
                {warnings.length > 8 && <div className="mt-1">…y {warnings.length - 8} más.</div>}
              </div>
            </div>
          )}

          {/* Config de salida */}
          <div className="mb-4 grid grid-cols-1 gap-3 rounded-xl border border-stone-200 bg-white p-4 sm:grid-cols-3">
            <Field label="¿Qué quieres generar?" note="Pedido = catálogo · Switch = plantilla por artículo.">
              <div className="flex overflow-hidden rounded-lg border border-stone-300">
                <PriceBtn active={salida === "catalogo"} onClick={() => setSalida("catalogo")} label="Pedido para cliente" />
                <PriceBtn active={salida === "switch"} onClick={() => setSalida("switch")} label="Plantilla Switch" last />
              </div>
            </Field>
            <Field label="Columna de piezas (mes)" note="Autodetectada; corrige si hace falta.">
              <select
                value={monthColIdx}
                onChange={(e) => onMonthChange(parseInt(e.target.value))}
                className={selectCls}
              >
                <option value={-1}>— Sin piezas —</option>
                {months.map((m) => (
                  <option key={m.idx} value={m.idx}>{m.label}{m.isMonth ? " (mes)" : ""}</option>
                ))}
              </select>
            </Field>
            {salida === "switch" && (
              <Field label="Precio de venta (Switch)" note="Usa la fórmula A o B (editables abajo).">
                <div className="flex overflow-hidden rounded-lg border border-stone-300">
                  <PriceBtn active={precioAB === "A"} onClick={() => setPrecioAB("A")} label="Precio A" />
                  <PriceBtn active={precioAB === "B"} onClick={() => setPrecioAB("B")} label="Precio B" last />
                </div>
              </Field>
            )}
          </div>

          {/* Fórmulas de precio Reebok (editables, guardadas por marca) */}
          <div className="mb-4 rounded-xl border border-stone-200 bg-white p-3.5">
            <div className="mb-2.5 text-[11px] font-semibold uppercase tracking-wide text-stone-500">
              Fórmulas de precio (se guardan y se reusan)
            </div>
            <FormulaRow label="Precio A" f={formulaA} onChange={setFormulaA} onSave={() => saveFormula("A")} saving={savingF === "A"} flashed={flashF === "A"} />
            <FormulaRow label="Precio B" f={formulaB} onChange={setFormulaB} onSave={() => saveFormula("B")} saving={savingF === "B"} flashed={flashF === "B"} />
          </div>

          {monthColIdx === -1 && (
            <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-[13px] font-medium text-amber-800">
              No detecté una columna de mes. Elige cuál tiene las piezas por artículo o las piezas saldrán en 0.
            </div>
          )}
          {salida === "switch" && revisar > 0 && (
            <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-[13px] font-medium text-amber-800">
              {revisar} artículo(s) en ámbar: no se halló la talla-muestra exacta (9/7) y se usó la más cercana. Revísalos.
            </div>
          )}

          {/* Stats + acción */}
          <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-stone-200 bg-white px-4 py-2.5 text-[13px] text-stone-600">
            <span><b className="font-semibold text-stone-900">{catalogo.length}</b> artículos</span>
            <span className="text-stone-300">·</span>
            <span><b className="font-semibold text-stone-900">{items.length}</b> tallas/SKUs</span>
            <span className="text-stone-300">·</span>
            <span><b className="font-semibold text-stone-900">{totalPiezas.toLocaleString()}</b> piezas{monthLabel ? ` (${monthLabel})` : ""}</span>
            <div className="ml-auto flex flex-wrap gap-2">
              <button
                onClick={handleDownload}
                disabled={!!downloading}
                className="rounded-md bg-red-600 px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-red-700 active:scale-[0.97] disabled:cursor-not-allowed disabled:bg-stone-300"
              >
                {downloading ? "Generando…" : salida === "catalogo" ? "Descargar pedido" : "Descargar plantilla Switch"}
              </button>
              <button
                onClick={reset}
                className="rounded-md border border-stone-300 bg-white px-3 py-1.5 text-sm font-semibold text-stone-900 transition hover:border-red-600 hover:text-red-700 active:scale-[0.97]"
              >
                Otro archivo
              </button>
            </div>
          </div>

          {/* Preview según la salida elegida */}
          {salida === "catalogo" ? (
            <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
              <div className="border-b border-stone-200 px-4 py-2.5">
                <span className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                  Vista previa · pedido para cliente ({catalogo.length} artículos)
                </span>
              </div>
              <div className="max-h-[440px] overflow-auto">
                <table className="w-full table-auto border-collapse text-[12px] tabular-nums">
                  <thead>
                    <tr>
                      {["PO", "New Article", "Name", "Depto", "Género", "WP", "Costo", "Precio A", "Precio B", "Piezas"].map((h, i) => (
                        <Th key={i} narrow={i >= 5}>{h}</Th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {catalogo.map((r, i) => (
                      <tr key={i} className="hover:bg-red-50">
                        <td className="border-b border-stone-100 px-2 py-2 font-mono text-[11px]">{r.po || "—"}</td>
                        <td className="border-b border-stone-100 px-2 py-2 font-mono text-[11px]">{r.newArticle}</td>
                        <td className="border-b border-stone-100 px-2 py-2">{r.name}</td>
                        <td className="border-b border-stone-100 px-2 py-2 text-[11px]">{r.department}</td>
                        <td className="border-b border-stone-100 px-2 py-2 text-[11px]">{r.gender}</td>
                        <td className="border-b border-stone-100 px-2 py-2 text-right">{fmt(r.wholesale)}</td>
                        <td className="border-b border-stone-100 px-2 py-2 text-right">{fmt(r.costo)}</td>
                        <td className="border-b border-stone-100 px-2 py-2 text-right font-semibold text-stone-900">{fmt(r.precioA)}</td>
                        <td className="border-b border-stone-100 px-2 py-2 text-right font-semibold text-stone-900">{fmt(r.precioB)}</td>
                        <td className="border-b border-stone-100 px-2 py-2 text-right">{r.piezas}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-200 px-4 py-2.5">
                <span className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                  Vista previa · plantilla Switch ({switchRows.length} artículos)
                </span>
                <span className="text-[11px] text-stone-500">Temporada {temporada} · Precio {precioAB}</span>
              </div>
              <div className="max-h-[440px] overflow-auto">
                <table className="w-full table-auto border-collapse text-[12px] tabular-nums">
                  <thead>
                    <tr>
                      {["Código", "Talla", "Código Barra", "Descripción", "Marca", "Rubro", "Subrubro", "FOB", "CIF", "Precio", "Unidad", "Stock"].map((h, i) => (
                        <Th key={i} narrow={i >= 7 && i <= 9}>{h}</Th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {switchRows.map((r, i) => (
                      <tr key={i} className="hover:bg-red-50">
                        <td className="border-b border-stone-100 px-2 py-2 font-mono text-[11px]">{num(r.cols["Código *"])}</td>
                        <td className={`border-b border-stone-100 px-2 py-2 text-center text-[11px] ${r.fallback ? "bg-amber-50 font-semibold text-amber-800" : ""}`} title={r.fallback ? "No se halló la talla exacta; se usó la más cercana. Revisa." : undefined}>
                          {r.talla || "—"}
                        </td>
                        <td className="border-b border-stone-100 px-2 py-2 font-mono text-[11px] break-all">{num(r.cols["Código Barra *"])}</td>
                        <td className="border-b border-stone-100 px-2 py-2">{num(r.cols["Descripción *"])}</td>
                        <td className="border-b border-stone-100 px-2 py-2 text-[11px]">{num(r.cols["Marca *"])}</td>
                        <td className="border-b border-stone-100 px-2 py-2 text-[11px]">{num(r.cols["rubro *"])}</td>
                        <td className="border-b border-stone-100 px-2 py-2 text-[11px]">{num(r.cols["subrubro"])}</td>
                        <td className="border-b border-stone-100 px-2 py-2 text-right">{num(r.cols["Costo FOB *"])}</td>
                        <td className="border-b border-stone-100 px-2 py-2 text-right">{num(r.cols["Costo CIF *"])}</td>
                        <td className="border-b border-stone-100 px-2 py-2 text-right font-semibold text-stone-900">{num(r.cols["Precio *"])}</td>
                        <td className="border-b border-stone-100 px-2 py-2 text-[11px]">{num(r.cols["Unidad de medida *"])}</td>
                        <td className="border-b border-stone-100 px-2 py-2 text-right">{num(r.cols["Stock Ideal"])}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {!items && !error && !embedded && (
        <div className="py-16 text-center text-stone-500">
          <p>Aún no has cargado ningún archivo.</p>
        </div>
      )}
    </div>
  );
}

// ── Subcomponentes / estilos ────────────────────────────────────────────────
const inputCls =
  "w-full rounded-lg border border-stone-300 bg-stone-50 px-3 py-2 text-sm text-stone-900 focus:border-red-600 focus:outline-none focus:ring-2 focus:ring-red-600/20";
const selectCls = inputCls;
const miniInputCls =
  "h-8 w-20 rounded-md border border-stone-300 bg-stone-50 px-2 text-right font-mono text-[13px] text-stone-900 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none focus:border-red-600 focus:outline-none focus:ring-2 focus:ring-red-600/20";
const miniSelectCls =
  "h-8 rounded-md border border-stone-300 bg-stone-50 px-2 text-[13px] text-stone-900 focus:border-red-600 focus:outline-none focus:ring-2 focus:ring-red-600/20";

function FormulaRow({ label, f, onChange, onSave, saving, flashed }: {
  label: string; f: PriceFormula; onChange: (f: PriceFormula) => void;
  onSave: () => void; saving: boolean; flashed: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 py-1.5">
      <span className="w-20 text-[13px] font-semibold text-stone-900">{label}</span>
      <label className="text-[11px] text-stone-500">÷</label>
      <input
        type="number" step="0.01" value={f.divisor || ""}
        onChange={(e) => onChange({ ...f, divisor: Number(e.target.value) || 0 })}
        className={miniInputCls} aria-label={`Divisor ${label}`}
      />
      <label className="ml-1 text-[11px] text-stone-500">+$</label>
      <select value={f.extra} onChange={(e) => onChange({ ...f, extra: parseInt(e.target.value) })} className={miniSelectCls} aria-label={`Extra ${label}`}>
        {[0, 1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
      </select>
      <select value={f.redondeo} onChange={(e) => onChange({ ...f, redondeo: e.target.value as Redondeo })} className={miniSelectCls} aria-label={`Redondeo ${label}`}>
        <option value="int">Entero</option>
        <option value="half">.50</option>
        <option value="par">Par</option>
      </select>
      <button
        type="button" onClick={onSave} disabled={saving}
        className="rounded-md px-2.5 py-1 text-[12px] font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-50"
      >
        {saving ? "Guardando…" : "Guardar"}
      </button>
      {flashed && <span className="text-[11px] font-semibold text-emerald-600">✓</span>}
    </div>
  );
}

function PriceBtn({ active, onClick, label, last }: { active: boolean; onClick: () => void; label: string; last?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 px-3 py-2 text-sm font-semibold transition ${last ? "" : "border-r border-stone-300"} ${
        active ? "bg-red-600 text-white" : "bg-white text-stone-700 hover:bg-stone-50"
      }`}
    >
      {label}
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

function Th({ children, narrow }: { children: React.ReactNode; narrow?: boolean }) {
  return (
    <th className={`sticky top-0 border-b-[1.5px] border-stone-300 bg-stone-100 px-2 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-stone-600 ${narrow ? "whitespace-nowrap text-right" : "text-left"}`}>
      {children}
    </th>
  );
}

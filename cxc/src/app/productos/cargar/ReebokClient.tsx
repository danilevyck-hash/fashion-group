"use client";

import { useCallback, useMemo, useRef, useState } from "react";
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
  type ReebokItem,
  type CatalogoRow,
  type MonthOption,
  type PrecioAB,
} from "@/lib/depurador/reebok";
import type { SheetRow } from "@/lib/depurador/logic";

type Salida = "catalogo" | "switch";

export default function ReebokClient() {
  const fileRef = useRef<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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

  // Temporada automática: fecha actual, día 1 del mes en curso, formato AAAA-MM
  // (idéntico a CK/TH → logic.ts). Sin campo manual.
  const temporada = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
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
  };

  const monthLabel = useMemo(
    () => months.find((m) => m.idx === monthColIdx)?.label ?? "",
    [months, monthColIdx],
  );

  const catalogo: CatalogoRow[] = useMemo(() => (items ? buildCatalogo(items) : []), [items]);
  const totalPiezas = useMemo(() => catalogo.reduce((s, r) => s + r.piezas, 0), [catalogo]);
  // Filas Switch (para preview y descarga de la Salida B).
  const switchRows = useMemo(
    () => (items ? buildSwitchRows(items, { precioAB, temporada, tasa }) : []),
    [items, precioAB, temporada, tasa],
  );

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

  // Salida A — Catálogo de clientes.
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
      XLSX.utils.book_append_sheet(wb, ws, "Catalogo");
      XLSX.writeFile(wb, `Catalogo_ActiveShoes_${monthLabel || temporada}.xlsx`);
    } finally {
      setDownloading("");
    }
  };

  // Salida B — Plantilla Switch (una fila por SKU).
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
        <p className="mt-1 text-[13px] text-stone-500">
          Sube el Excel del proveedor Reebok. Genera dos archivos: catálogo para clientes y plantilla de Switch.
        </p>
      </div>

      {/* Drop zone */}
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
            <Field label="¿Qué quieres generar?" note="Pedido = catálogo · Switch = plantilla por SKU.">
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
              <Field label="Precio de venta (Switch)" note="A = ÷0.75 · B = ÷0.80.">
                <div className="flex overflow-hidden rounded-lg border border-stone-300">
                  <PriceBtn active={precioAB === "A"} onClick={() => setPrecioAB("A")} label="Precio A" />
                  <PriceBtn active={precioAB === "B"} onClick={() => setPrecioAB("B")} label="Precio B" last />
                </div>
              </Field>
            )}
          </div>

          {monthColIdx === -1 && (
            <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-[13px] font-medium text-amber-800">
              No detecté una columna de mes. Elige cuál tiene las piezas por SKU o las piezas saldrán en 0.
            </div>
          )}

          {/* Stats + acción */}
          <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-stone-200 bg-white px-4 py-2.5 text-[13px] text-stone-600">
            <span><b className="font-semibold text-stone-900">{catalogo.length}</b> estilos</span>
            <span className="text-stone-300">·</span>
            <span><b className="font-semibold text-stone-900">{items.length}</b> SKUs</span>
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
                  Vista previa · pedido para cliente ({catalogo.length} estilos)
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
                  Vista previa · plantilla Switch ({switchRows.length} SKUs)
                </span>
                <span className="text-[11px] text-stone-500">Temporada {temporada} · Precio {precioAB}</span>
              </div>
              <div className="max-h-[440px] overflow-auto">
                <table className="w-full table-auto border-collapse text-[12px] tabular-nums">
                  <thead>
                    <tr>
                      {["Código", "Código Barra", "Descripción", "Marca", "Rubro", "Subrubro", "FOB", "CIF", "Precio", "Unidad", "Stock"].map((h, i) => (
                        <Th key={i} narrow={i >= 6 && i <= 8}>{h}</Th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {switchRows.map((r, i) => (
                      <tr key={i} className="hover:bg-red-50">
                        <td className="border-b border-stone-100 px-2 py-2 font-mono text-[11px]">{num(r["Código *"])}</td>
                        <td className="border-b border-stone-100 px-2 py-2 font-mono text-[11px] break-all">{num(r["Código Barra *"])}</td>
                        <td className="border-b border-stone-100 px-2 py-2">{num(r["Descripción *"])}</td>
                        <td className="border-b border-stone-100 px-2 py-2 text-[11px]">{num(r["Marca *"])}</td>
                        <td className="border-b border-stone-100 px-2 py-2 text-[11px]">{num(r["rubro *"])}</td>
                        <td className="border-b border-stone-100 px-2 py-2 text-[11px]">{num(r["subrubro"])}</td>
                        <td className="border-b border-stone-100 px-2 py-2 text-right">{num(r["Costo FOB *"])}</td>
                        <td className="border-b border-stone-100 px-2 py-2 text-right">{num(r["Costo CIF *"])}</td>
                        <td className="border-b border-stone-100 px-2 py-2 text-right font-semibold text-stone-900">{num(r["Precio *"])}</td>
                        <td className="border-b border-stone-100 px-2 py-2 text-[11px]">{num(r["Unidad de medida *"])}</td>
                        <td className="border-b border-stone-100 px-2 py-2 text-right">{num(r["Stock Ideal"])}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {!items && !error && (
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

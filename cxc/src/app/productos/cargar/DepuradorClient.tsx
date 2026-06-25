"use client";

import { useCallback, useRef, useState } from "react";
import { UploadCloud } from "lucide-react";
import {
  MESES,
  EMPRESAS_DESTINO,
  pickBestSheet,
  processRows,
  setRowTalla,
  buildAoa,
  outputFilename,
  matchEmpresaFromDestino,
  computeTotales,
  norm,
  TEXT_COLS,
  type ProcessedRow,
  type NamedSheet,
} from "@/lib/depurador/logic";

// Columnas clave que se muestran en la vista previa (la talla va aparte, editable).
const PREVIEW_COLS = [
  "Código *", "Código Barra *", "Descripción *", "rubro *", "subrubro",
  "Precio *", "Costo FOB *", "Costo CIF *", "Stock Ideal", "Marca *",
];

interface DepuradorClientProps {
  /** Callback al descargar — registra el historial liviano en el server (Tarea 4). */
  onDownloaded?: (payload: {
    empresa: string;
    marca: string;
    cantidad_estilos: number;
    total_unidades: number;
    total_costo: number;
  }) => void;
}

export default function DepuradorClient({ onDownloaded }: DepuradorClientProps) {
  const now = new Date();
  const fileRef = useRef<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [fileName, setFileName] = useState("");
  const [dragging, setDragging] = useState(false);
  const [processed, setProcessed] = useState<ProcessedRow[] | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [destino, setDestino] = useState("");
  const [empresa, setEmpresa] = useState("");
  const [downloading, setDownloading] = useState(false);

  // Config (mismos defaults del HTML: mes/año actual, tasa 7, factor 1.1)
  const [mesIdx, setMesIdx] = useState(now.getMonth());
  const [anio, setAnio] = useState(String(now.getFullYear()));
  const [tasa, setTasa] = useState("7");
  const [factor, setFactor] = useState("1.1");

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
        const { rows, warnings: w } = processRows(best, cfg);
        setProcessed(rows);
        setWarnings(w);
        setError("");
        // Empresa destino: aviso del archivo + preselección del dropdown (Tarea 3)
        const dest = rows.find((r) => r.destino)?.destino || "";
        setDestino(dest);
        const match = matchEmpresaFromDestino(dest);
        if (match) setEmpresa(match);
      } catch (err) {
        setProcessed(null);
        setWarnings([]);
        setError(err instanceof Error ? err.message : "Error inesperado al leer el archivo.");
      }
    },
    []
  );

  const handleFile = useCallback(
    (file: File) => {
      fileRef.current = file;
      runFile(file, { mesIdx, anio, tasa, factor });
    },
    [runFile, mesIdx, anio, tasa, factor]
  );

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
    setDestino("");
    setEmpresa("");
    if (inputRef.current) inputRef.current.value = "";
  };

  const onTallaChange = (rowIdx: number, nuevaTalla: string) => {
    setProcessed((prev) =>
      prev ? prev.map((r, i) => (i === rowIdx ? setRowTalla(r, nuevaTalla) : r)) : prev
    );
  };

  const download = async () => {
    if (!processed || downloading) return;
    setDownloading(true);
    try {
      const XLSX = (await import("xlsx-js-style")).default;
      const aoa = buildAoa(processed);
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

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      {/* Masthead */}
      <div className="mb-7 border-b-2 border-stone-900 pb-4">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-teal-700">
          Fashion Group · Carga a Switch
        </div>
        <h1 className="mt-1 font-serif text-3xl font-semibold tracking-tight text-stone-900">
          Depurador de Productos
        </h1>
        <p className="mt-1.5 max-w-xl text-sm text-stone-500">
          Arrastra el Excel del proveedor (Tommy / Calvin Klein). La herramienta colapsa las
          tallas a un estilo por fila y arma la plantilla lista para subir a Switch. Todo el
          proceso ocurre en tu navegador — el archivo no sale de tu computadora.
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
        className={`mb-6 flex cursor-pointer flex-col items-center rounded-xl border-2 border-dashed px-6 py-11 text-center transition ${
          dragging ? "border-teal-600 bg-teal-50" : "border-stone-300 bg-white hover:border-teal-600 hover:bg-teal-50"
        }`}
      >
        <UploadCloud className="mb-3 h-10 w-10 text-teal-800" strokeWidth={1.6} />
        <div className="text-base font-semibold text-stone-900">
          {fileName || "Suelta el archivo aquí o haz clic para buscar"}
        </div>
        <div className="mt-1.5 text-[13px] text-stone-500">Acepta .xlsx y .xls del proveedor</div>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={(e) => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }}
        />
      </label>

      {/* Config */}
      <div className="mb-6 grid grid-cols-2 gap-3.5 rounded-xl border border-stone-200 bg-white p-4 sm:grid-cols-4">
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

      {/* Error */}
      {error && (
        <div className="mb-5 flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <span aria-hidden>✕</span>
          <div><b className="font-semibold">No se pudo procesar.</b> {error}</div>
        </div>
      )}

      {processed && processed.length > 0 && (
        <>
          {/* Banners */}
          <div className="mb-5 flex items-start gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            <span aria-hidden>✓</span>
            <div>
              <b className="font-semibold">Listo.</b> {processed.length} estilos procesados.
              Revisa la vista previa y descarga la plantilla.
            </div>
          </div>
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

          {/* Empresa destino (Tarea 3) */}
          <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-stone-500">
                Empresa destino en Switch
              </label>
              <select value={empresa} onChange={(e) => setEmpresa(e.target.value)} className={selectCls}>
                <option value="">Selecciona una empresa…</option>
                {EMPRESAS_DESTINO.map((e) => (
                  <option key={e.key} value={e.key}>{e.label} ({e.marca})</option>
                ))}
              </select>
              {destino && (
                <p className="mt-1.5 rounded-md border border-stone-300 border-l-[3px] border-l-teal-600 bg-white px-3 py-2 text-[13px] text-stone-700">
                  <span className="text-stone-500">Destino del archivo:</span>{" "}
                  <b className="font-semibold uppercase tracking-wide text-teal-800">{destino}</b>{" "}
                  — verifica que estás subiendo a esta empresa en Switch.
                </p>
              )}
            </div>
          </div>

          {/* Resumen */}
          <div className="mb-4 flex overflow-hidden rounded-xl border border-stone-200 bg-white">
            <Stat n={String(processed.length)} l="Estilos" />
            <Stat n={totalUnits.toLocaleString()} l="Unidades totales" />
            <Stat n={String(marcas.length)} l="Marca(s)" />
            <Stat n={String(processed[0].cols["Temporada"])} l="Temporada" last />
          </div>

          {/* Acciones */}
          <div className="mb-6 flex flex-wrap gap-3">
            <button
              onClick={download}
              disabled={downloading}
              className="rounded-lg bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-700 active:scale-[0.97] disabled:cursor-not-allowed disabled:bg-stone-300"
            >
              {downloading ? "Generando…" : "Descargar plantilla para Switch"}
            </button>
            <button
              onClick={reset}
              className="rounded-lg border border-stone-300 bg-white px-5 py-2.5 text-sm font-semibold text-stone-900 transition hover:border-teal-600 hover:text-teal-800 active:scale-[0.97]"
            >
              Cargar otro archivo
            </button>
          </div>

          {/* Preview */}
          <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
            <div className="flex items-center justify-between border-b border-stone-200 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-stone-500">
              <span>Vista previa · un estilo por fila · la talla del EAN es editable</span>
              <span>{processed.length} filas</span>
            </div>
            <div className="max-h-[440px] overflow-auto">
              <table className="w-full border-collapse whitespace-nowrap text-[12.5px] tabular-nums">
                <thead>
                  <tr>
                    <Th>Talla EAN</Th>
                    {PREVIEW_COLS.map((c) => <Th key={c}>{c.replace(" *", "")}</Th>)}
                  </tr>
                </thead>
                <tbody>
                  {processed.map((d, ri) => {
                    const tallas = Object.keys(d.tallaMap || {});
                    const edited = d.talla !== d.tallaAuto || d.fallback;
                    return (
                      <tr key={ri} className="hover:bg-teal-50">
                        <td className="border-b border-stone-100 px-3 py-2">
                          {tallas.length > 1 ? (
                            <select
                              value={d.talla}
                              onChange={(e) => onTallaChange(ri, e.target.value)}
                              title={d.fallback ? "La regla no encontró la talla esperada. Revisa." : undefined}
                              className={`rounded-md border px-1.5 py-0.5 text-xs ${
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
                        {PREVIEW_COLS.map((c) => {
                          const v = d.cols[c];
                          const empty = v === null || v === undefined || v === "";
                          const mono = c === "Código Barra *";
                          return (
                            <td
                              key={c}
                              className={`border-b border-stone-100 px-3 py-2 ${mono ? "font-mono text-xs" : ""}`}
                            >
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

function Field({ label, note, children }: { label: string; note?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-stone-500">{label}</label>
      {children}
      {note && <div className="mt-1 text-[11px] text-stone-500">{note}</div>}
    </div>
  );
}

function Stat({ n, l, last }: { n: string; l: string; last?: boolean }) {
  return (
    <div className={`flex-1 px-4 py-4 ${last ? "" : "border-r border-stone-200"}`}>
      <div className="font-serif text-2xl font-semibold leading-none text-teal-800">{n}</div>
      <div className="mt-1.5 text-[11px] uppercase tracking-wide text-stone-500">{l}</div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="sticky top-0 border-b-[1.5px] border-stone-300 bg-stone-100 px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-stone-600">
      {children}
    </th>
  );
}

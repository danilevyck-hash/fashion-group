"use client";

// Facturas Tienda: convierte las facturas que las empresas del grupo le emiten
// a la tienda retail (Multifashion/ACS) en la plantilla de importación de
// Switch (las 25 columnas de la plantilla real). Acepta .xls (factura), .csv (';') y .xlsx del reporte.
// La lógica pura vive en src/lib/depurador/tienda.ts; las fórmulas de precio
// son el set SEPARADO de tienda (tienda_marca_formulas / tienda_rubro_formulas).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { UploadCloud } from "lucide-react";
import {
  MESES,
  TEXT_COLS,
  marcaKey,
  marcaRubroKey,
  precioDescripcion,
  marginPct,
  type CatalogoDescripciones,
  type SheetRow,
  type Redondeo,
  type MarcaFormula,
  type MarcaRubroFormula,
} from "@/lib/depurador/logic";
import { useCatalogoDescripciones } from "@/lib/hooks/useCatalogoDescripciones";
import { mensajeDivisorEnPantalla } from "@/lib/depurador/divisor";
import { saveAs } from "file-saver";
import AlarmaDescripcionesNuevas from "./AlarmaDescripcionesNuevas";
import {
  EMPRESAS_TIENDA,
  MAX_FILAS_SWITCH,
  parseCsvSemicolon,
  detectFactura,
  processFactura,
  setRowMarca,
  buildTiendaAoa,
  chunkRows,
  type FacturaRow,
  type FacturaProcessResult,
} from "@/lib/depurador/tienda";
import { Ayuda } from "@/components/shared/Ayuda";

const BLANK_FORMULA: MarcaFormula = { marca: "", divisor: 0, extra: 0, redondeo: "int" };

interface FacturasTiendaClientProps {
  /** Historial: `archivo` son los MISMOS bytes que bajaron (xlsx o zip). */
  onDownloaded?: (payload: {
    empresa: string;
    marca: string;
    cantidad_estilos: number;
    total_unidades: number;
    total_costo: number;
    archivo?: { blob: Blob; nombre: string };
  }) => void;
  /** Archivo inyectado por el dispatcher (la dropzone única de «Plantilla»).
   *  Si viene, se oculta la dropzone propia y se procesa automáticamente. */
  injectedFile?: File | null;
  /** Volver a la dropzone del dispatcher. */
  onReset?: () => void;
}

export default function FacturasTiendaClient({ onDownloaded, injectedFile, onReset }: FacturasTiendaClientProps) {
  const now = new Date();
  const embedded = injectedFile !== undefined;
  const inputRef = useRef<HTMLInputElement>(null);
  // Filas crudas del archivo, para reprocesar al cambiar mes/año (formato A).
  const rawRef = useRef<SheetRow[] | null>(null);
  // Último archivo inyectado ya procesado (evita reprocesar cuando el catálogo
  // cambia, p.ej. al aprobar una descripción).
  const injectedProcesado = useRef<File | null>(null);

  const [fileName, setFileName] = useState("");
  const [dragging, setDragging] = useState(false);
  const [result, setResult] = useState<FacturaProcessResult | null>(null);
  const [rows, setRows] = useState<FacturaRow[]>([]);
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [orphanSeen, setOrphanSeen] = useState(false);

  // Temporada manual (solo se usa cuando la factura no trae FECHA — el .xls).
  const [mesIdx, setMesIdx] = useState(now.getMonth());
  const [anio, setAnio] = useState(String(now.getFullYear()));

  // Catálogo de descripciones (tabla depurador_descripciones — fuente de verdad).
  // Sin catálogo NO se procesa ni se descarga nada (sin fallback al archivo TS).
  const {
    catalogo,
    cargando: catalogoCargando,
    fallo: catalogoFallo,
    reintentar: reintentarCatalogo,
    agregarDescripcion,
  } = useCatalogoDescripciones();

  // Fórmulas de TIENDA (set separado del Depurador).
  const [savedFormulas, setSavedFormulas] = useState<MarcaFormula[]>([]);
  const [marcaForms, setMarcaForms] = useState<Record<string, MarcaFormula>>({});
  const [savingMarca, setSavingMarca] = useState<string | null>(null);
  const [rubroFormulas, setRubroFormulas] = useState<MarcaRubroFormula[]>([]);
  // Precios editados a mano (por índice de fila).
  const [priceEdits, setPriceEdits] = useState<Record<number, string>>({});

  useEffect(() => {
    let alive = true;
    fetch("/api/productos/cargar/tienda-formulas")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("fetch"))))
      .then((d) => { if (alive) setSavedFormulas(d.rows ?? []); })
      .catch(() => {});
    fetch("/api/productos/cargar/tienda-rubro-formulas")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("fetch"))))
      .then((d) => { if (alive) setRubroFormulas(d.rows ?? []); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const temporadaFallback = `${anio}-${String(mesIdx + 1).padStart(2, "0")}`;

  const runRows = useCallback((raw: SheetRow[], temporada: string, cat: CatalogoDescripciones) => {
    try {
      const res = processFactura(raw, { temporadaFallback: temporada, catalogo: cat });
      setResult(res);
      setRows(res.rows);
      setPriceEdits({});
      setOrphanSeen(false);
      setError("");
    } catch (err) {
      setResult(null);
      setRows([]);
      setError(err instanceof Error ? err.message : "Error inesperado al leer el archivo.");
    }
  }, []);

  const handleFile = useCallback(
    async (file: File) => {
      if (!catalogo) return; // sin catálogo no se procesa (cargando o falló)
      setFileName(file.name);
      setError("");
      try {
        const buf = await file.arrayBuffer();
        let raw: SheetRow[] | null = null;
        if (/\.csv$/i.test(file.name)) {
          // CSV ';' — UTF-8 con BOM; si salen caracteres rotos, reintenta latin-1.
          let text = new TextDecoder("utf-8").decode(buf);
          if (text.includes("�")) text = new TextDecoder("windows-1252").decode(buf);
          raw = parseCsvSemicolon(text);
        } else {
          const XLSX = (await import("xlsx-js-style")).default;
          const wb = XLSX.read(buf, { type: "array" });
          for (const sn of wb.SheetNames) {
            const sheetRows = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, raw: true, defval: null }) as SheetRow[];
            if (detectFactura(sheetRows)) { raw = sheetRows; break; }
          }
          if (!raw && wb.SheetNames.length > 0) {
            raw = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: null }) as SheetRow[];
          }
        }
        if (!raw) throw new Error("No pude leer el archivo.");
        rawRef.current = raw;
        runRows(raw, temporadaFallback, catalogo);
      } catch (err) {
        rawRef.current = null;
        setResult(null);
        setRows([]);
        setError(err instanceof Error ? err.message : "Error inesperado al leer el archivo.");
      }
    },
    [runRows, temporadaFallback, catalogo]
  );

  // Modo dispatcher: procesar el archivo inyectado automáticamente. Espera a
  // que el catálogo esté cargado (mismo criterio que el Depurador CK/TH).
  useEffect(() => {
    if (injectedFile && catalogo && injectedProcesado.current !== injectedFile) {
      injectedProcesado.current = injectedFile;
      handleFile(injectedFile);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [injectedFile, catalogo]);

  // Reprocesar al cambiar mes/año (solo afecta facturas sin FECHA).
  const reprocess = (patch: Partial<{ mesIdx: number; anio: string }>) => {
    const m = patch.mesIdx ?? mesIdx;
    const a = patch.anio ?? anio;
    if (rawRef.current && catalogo) runRows(rawRef.current, `${a}-${String(m + 1).padStart(2, "0")}`, catalogo);
  };

  // Aprobación exitosa desde la alarma: actualiza el catálogo en memoria y
  // REPROCESA la factura con el catálogo nuevo (la marca derivada puede cambiar
  // de "Otros" a la marca aprobada) → la alarma se re-evalúa en vivo.
  const onDescripcionAprobada = (marca: string, desc: string) => {
    const next = agregarDescripcion(marca, desc);
    if (rawRef.current) runRows(rawRef.current, temporadaFallback, next);
  };

  const reset = () => {
    rawRef.current = null;
    injectedProcesado.current = null;
    setResult(null);
    setRows([]);
    setError("");
    setFileName("");
    setPriceEdits({});
    if (inputRef.current) inputRef.current.value = "";
    onReset?.(); // en modo dispatcher, volver a la dropzone compartida
  };

  const onMarcaChange = (idx: number, marca: string) =>
    setRows((prev) => prev.map((r, i) => (i === idx ? setRowMarca(r, marca) : r)));

  // ── Fórmulas de tienda por marcas presentes ─────────────────────────────────
  const marcasPresentes = useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of rows) {
      const label = String(r.cols["Marca *"] || "");
      const key = marcaKey(label);
      if (key && !seen.has(key)) seen.set(key, label);
    }
    return [...seen.entries()].map(([key, label]) => ({ key, label }));
  }, [rows]);

  const savedByNorm = useMemo(() => {
    const m = new Map<string, MarcaFormula>();
    for (const f of savedFormulas) m.set(marcaKey(f.marca), f);
    return m;
  }, [savedFormulas]);

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

  const rubroByKey = useMemo(() => {
    const m = new Map<string, MarcaRubroFormula>();
    for (const f of rubroFormulas) m.set(marcaRubroKey(f.marca, f.rubro), f);
    return m;
  }, [rubroFormulas]);

  const onMarcaFormChange = (key: string, patch: Partial<MarcaFormula>) =>
    setMarcaForms((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));

  // ── Validación del divisor EN LA PANTALLA (4-sep-2026) ─────────────────────
  // El MISMO guard de las rutas API (validarDivisor, vía
  // mensajeDivisorEnPantalla — cero copias), igual que en CK/TH: campo rojo,
  // mensaje y la DESCARGA apagada, nunca el tecleo. Las fórmulas por marca
  // alimentan el precio EN VIVO, así que cualquiera fuera de rango bloquea.
  const marcasDivisorMsg = useMemo(() => {
    const out: Record<string, string> = {};
    for (const { key } of marcasPresentes) {
      const f = marcaForms[key];
      if (!f) continue;
      const msg = mensajeDivisorEnPantalla(String(f.divisor));
      if (msg) out[key] = msg;
    }
    return out;
  }, [marcasPresentes, marcaForms]);
  const divisorBloqueaDescarga = Object.keys(marcasDivisorMsg).length > 0;

  const saveMarca = async (key: string) => {
    const f = marcaForms[key];
    if (!f || savingMarca) return;
    if (marcasDivisorMsg[key]) return; // un divisor fuera de rango no se guarda
    setSavingMarca(key);
    try {
      const res = await fetch("/api/productos/cargar/tienda-formulas", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          marca: f.marca,
          empresa: f.empresa ?? null,
          divisor: f.divisor,
          extra: f.extra,
          redondeo: f.redondeo,
        }),
      });
      if (res.ok) {
        const d = await fetch("/api/productos/cargar/tienda-formulas").then((r) => r.json()).catch(() => null);
        if (d?.rows) setSavedFormulas(d.rows);
      }
    } finally {
      setSavingMarca(null);
    }
  };

  // ── Precio por fila: precio fijo > fórmula de la descripción > fórmula de marca ──
  const costoOf = (row: FacturaRow): number | null => {
    const v = row.cols["Costo FOB *"]; // = Costo CIF * (mismo número en tienda)
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  const excForRow = (row: FacturaRow): MarcaRubroFormula | null =>
    rubroByKey.get(marcaRubroKey(row.cols["Marca *"], row.cols["Descripción *"])) ?? null;

  const autoPrice = (row: FacturaRow): number | null =>
    precioDescripcion(costoOf(row), excForRow(row), marcaForms[marcaKey(row.cols["Marca *"])] ?? null);

  const finalPrice = (i: number, row: FacturaRow): number | null => {
    const raw = priceEdits[i];
    if (raw !== undefined) {
      const t = raw.trim();
      if (t === "") return null;
      const n = Number(t);
      return Number.isFinite(n) ? n : null;
    }
    return autoPrice(row);
  };

  const displayPrice = (i: number, row: FacturaRow): string => {
    const raw = priceEdits[i];
    if (raw !== undefined) return raw;
    const a = autoPrice(row);
    return a === null ? "" : String(a);
  };

  const calcCell = (i: number, row: FacturaRow): string => {
    const costo = costoOf(row);
    const fp = finalPrice(i, row);
    const m = marginPct(costo, fp);
    const mTxt = m === null ? "" : `${m}%`;
    if (priceEdits[i] !== undefined) return mTxt ? `· ${mTxt}` : "—";
    const exc = excForRow(row);
    if (exc?.precio_fijo) return mTxt ? `fijo · ${mTxt}` : "fijo";
    const f = exc && exc.divisor ? exc : marcaForms[marcaKey(row.cols["Marca *"])];
    if (!f || !f.divisor) return "—";
    const ex = f.extra > 0 ? `+${f.extra}` : "";
    return mTxt ? `÷${f.divisor}${ex} · ${mTxt}` : `÷${f.divisor}${ex}`;
  };

  const onPriceEdit = (i: number, value: string) =>
    setPriceEdits((prev) => ({ ...prev, [i]: value }));

  // ── Descarga: máx 500 filas por archivo; ZIP si sale más de uno ─────────────
  const download = async () => {
    if (!result || rows.length === 0 || downloading || !catalogo) return;
    if (result.bloqueos.length > 0) return; // bloqueado hasta aprobar las descripciones nuevas
    if (divisorBloqueaDescarga) return; // 🔴 un divisor fuera de rango no baja un Excel 100× mal
    setDownloading(true);
    try {
      const XLSX = (await import("xlsx-js-style")).default;
      const finalRows: FacturaRow[] = rows.map((r, i) => ({
        ...r,
        cols: { ...r.cols, "Precio *": finalPrice(i, r) },
      }));
      const temporada = String(finalRows[0]?.cols["Temporada"] || "").trim() || "SIN-FECHA";
      const chunks = chunkRows(finalRows, MAX_FILAS_SWITCH);

      const buildWorkbook = (chunk: FacturaRow[]) => {
        const aoa = buildTiendaAoa(chunk);
        const ws = XLSX.utils.aoa_to_sheet(aoa);
        // Código(0), Referencia(1) y Código Barra(2) SIEMPRE como texto.
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
        ws["!cols"] = aoa[0].map((_c, i) => ({ wch: i === 3 ? 26 : i < 3 ? 16 : 13 }));
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "upload");
        return wb;
      };

      // 🔴 UNA sola escritura por archivo: lo que baja al disco y lo que guarda
      // el Historial son los MISMOS bytes (xlsx suelto o zip, según salga).
      let archivo: { blob: Blob; nombre: string };
      if (chunks.length === 1) {
        const data = XLSX.write(buildWorkbook(chunks[0]), { type: "array", bookType: "xlsx" }) as ArrayBuffer;
        const copia = new ArrayBuffer(data.byteLength);
        new Uint8Array(copia).set(new Uint8Array(data));
        archivo = {
          blob: new Blob([copia], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
          nombre: `PLANT_TIENDA_${temporada}.xlsx`,
        };
      } else {
        const JSZip = (await import("jszip")).default;
        const zip = new JSZip();
        chunks.forEach((chunk, i) => {
          const data = XLSX.write(buildWorkbook(chunk), { type: "array", bookType: "xlsx" }) as ArrayBuffer;
          zip.file(`PLANT_TIENDA_${temporada}_${i + 1}de${chunks.length}.xlsx`, data);
        });
        archivo = {
          blob: await zip.generateAsync({ type: "blob" }),
          nombre: `PLANT_TIENDA_${temporada}.zip`,
        };
      }
      saveAs(archivo.blob, archivo.nombre);

      if (onDownloaded) {
        const totalUnidades = finalRows.reduce((s, r) => s + (Number(r.cols["Stock Ideal"]) || 0), 0);
        const totalCosto = finalRows.reduce(
          (s, r) => s + (Number(r.cols["Costo FOB *"]) || 0) * (Number(r.cols["Stock Ideal"]) || 0),
          0
        );
        // «Multifashion» y no «Facturas Tienda»: la compañía real, para que el
        // filtro por compañía del Historial la encuentre (4-sep-2026).
        onDownloaded({
          empresa: "Multifashion",
          marca: marcasPresentes.map((m) => m.label).join(", ").slice(0, 120),
          cantidad_estilos: finalRows.length,
          total_unidades: totalUnidades,
          total_costo: Math.round(totalCosto * 100) / 100,
          archivo,
        });
      }
    } finally {
      setDownloading(false);
    }
  };

  // ── Derivados de la vista ───────────────────────────────────────────────────
  const totalUnits = rows.reduce((s, r) => s + (Number(r.cols["Stock Ideal"]) || 0), 0);
  const revisar = rows.filter((r) => r.revisar).length;
  const empresasDetectadas = useMemo(() => {
    const keys = new Set(rows.map((r) => r.empresaKey).filter(Boolean) as string[]);
    return EMPRESAS_TIENDA.filter((e) => keys.has(e.key)).map((e) => e.label);
  }, [rows]);
  const archivos = Math.ceil(rows.length / MAX_FILAS_SWITCH);
  const bloqueos = result?.bloqueos ?? [];
  const pasaronSolas = result?.pasaronSolas ?? 0;

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      {/* Alarma de descripción NUEVA no catalogada — BLOQUEA la descarga.
          Admin/secretaria pueden aprobarlas ahí mismo; al aprobar se reprocesa la
          factura con el catálogo nuevo y la alarma se re-evalúa en vivo. */}
      {result && bloqueos.length > 0 && !orphanSeen && (
        <AlarmaDescripcionesNuevas
          items={bloqueos}
          pasaronSolas={pasaronSolas}
          onAprobada={onDescripcionAprobada}
          onClose={() => setOrphanSeen(true)}
        />
      )}

      {/* Sin masthead: "Facturas Tienda" ya lo dice el selector de pestañas de
          arriba, que en los tres anchos muestra en cuál estás (desplegable
          hasta lg, fila desde lg), y el módulo lo dicen la barra sticky y el
          breadcrumb. Queda sr-only para no dejar la pantalla sin encabezado. */}
      <h1 className="sr-only">Facturas Tienda</h1>

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

      {/* Compañía reconocida por el formato (modo dispatcher): la factura de
          tienda siempre es Multifashion. */}
      {embedded && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-[13px] text-teal-900">
          <span className="rounded bg-teal-600 px-1.5 py-0.5 text-[12px] font-bold text-white">MULTIFASHION</span>
          <span>Detecté una factura de tienda. <b>{fileName}</b></span>
        </div>
      )}

      {/* Drop zone (oculta en modo dispatcher: el padre tiene la dropzone) */}
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
            : fileName || "Suelta la factura aquí (.xls, .csv o .xlsx) o haz clic para buscar"}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          disabled={!catalogo}
          onChange={(e) => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }}
        />
      </label>
      )}

      {/* Temporada manual (la usa la factura .xls, que no trae FECHA) */}
      {(!result || result.sinFecha) && (
        <div className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-stone-200 bg-white p-4">
          <div>
            <label className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wide text-stone-500">
              Mes de la factura (temporada)
            </label>
            <select
              value={mesIdx}
              onChange={(e) => { const v = parseInt(e.target.value); setMesIdx(v); reprocess({ mesIdx: v }); }}
              className={inputCls}
            >
              {MESES.map((m, i) => <option key={m} value={i}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wide text-stone-500">Año</label>
            <input
              type="number" min={2020} max={2099} value={anio}
              onChange={(e) => { setAnio(e.target.value); reprocess({ anio: e.target.value }); }}
              className={inputCls}
            />
          </div>
          {/* De dónde sale la temporada según el formato: se aprende una vez. */}
          <div className="pb-1">
            <Ayuda titulo="De dónde sale la temporada" etiqueta="De dónde sale la temporada">
              <p>
                La factura .xls no trae fecha — la temporada sale de aquí ({temporadaFallback}). El
                CSV/XLSX trae FECHA y la usa directo.
              </p>
            </Ayuda>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mb-5 flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <span aria-hidden>✕</span>
          <div><b className="font-semibold">No se pudo procesar.</b> {error}</div>
        </div>
      )}

      {result && rows.length > 0 && (
        <>
          {/* Avisos */}
          {result.warnings.length > 0 && (
            <div className="mb-5 flex items-start gap-2.5 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <span aria-hidden>!</span>
              <div>
                <b className="font-semibold">{result.warnings.length} aviso(s)</b>:
                <ul className="ml-4 mt-1.5 list-disc">
                  {result.warnings.slice(0, 8).map((x, i) => <li key={i}>{x}</li>)}
                </ul>
                {result.warnings.length > 8 && <div className="mt-1">…y {result.warnings.length - 8} más.</div>}
              </div>
            </div>
          )}
          {revisar > 0 && (
            <div className="mb-5 flex items-start gap-2.5 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <span aria-hidden>!</span>
              <div>
                <b className="font-semibold">{revisar} fila(s) en ámbar</b> para revisar (marca ambigua,
                código de barra ilegible o género no identificado). Revísalas en la tabla antes de descargar.
              </div>
            </div>
          )}

          {/* Barra de acciones */}
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-stone-200 bg-white px-3 py-2">
            <span className="text-[12px] font-semibold uppercase tracking-wide text-stone-500">Salida</span>
            <span className="flex-1 text-[13px] text-stone-600">
              {archivos === 1
                ? "1 archivo (hoja “upload”)"
                : `${archivos} archivos de máx. ${MAX_FILAS_SWITCH} filas → se descarga un ZIP`}
            </span>
            <button
              onClick={download}
              disabled={downloading || bloqueos.length > 0 || !catalogo || divisorBloqueaDescarga}
              className="rounded-md bg-teal-600 px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-teal-700 active:scale-[0.97] disabled:cursor-not-allowed disabled:bg-stone-300"
            >
              {downloading ? "Generando…" : archivos > 1 ? "Descargar ZIP" : "Descargar plantilla"}
            </button>
            <button
              onClick={reset}
              className="rounded-md border border-stone-300 bg-white px-3 py-1.5 text-sm font-semibold text-stone-900 transition hover:border-teal-600 hover:text-teal-800 active:scale-[0.97]"
            >
              Otro archivo
            </button>
          </div>

          {bloqueos.length > 0 && (
            <p className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[13px] font-semibold text-red-700">
              <span>🔒 Bloqueado: hay {bloqueos.length} descripción(es) nueva(s) sin aprobar.</span>
              <button
                type="button"
                onClick={() => setOrphanSeen(false)}
                className="rounded-md border border-red-300 bg-white px-2 py-0.5 text-[12px] font-semibold text-red-700 transition hover:bg-red-100 active:scale-[0.97]"
              >
                Ver y aprobar
              </button>
            </p>
          )}

          {/* Nada se descarta en silencio: las que no alertaron se dicen igual. */}
          {pasaronSolas > 0 && (
            <p className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
              {pasaronSolas} descripción(es) nueva(s) pasaron solas · las dos mitades ya existen
            </p>
          )}

          {/* Stats */}
          <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-stone-200 bg-white px-4 py-2 text-[13px] text-stone-600">
            <span><b className="font-semibold text-stone-900">{rows.length}</b> artículos</span>
            <span className="text-stone-300">·</span>
            <span><b className="font-semibold text-stone-900">{totalUnits.toLocaleString()}</b> unidades</span>
            <span className="text-stone-300">·</span>
            <span>Proveedor tienda: <b className="font-semibold text-stone-900">{empresasDetectadas.join(", ") || "—"}</b></span>
            {result.nInterno && (
              <>
                <span className="text-stone-300">·</span>
                <span>N. Interno <b className="font-semibold text-stone-900">{result.nInterno}</b></span>
              </>
            )}
            <span className="text-stone-300">·</span>
            <span>formato {result.formato === "A" ? ".xls factura" : "reporte CSV/XLSX"}</span>
          </div>

          {/* Fórmulas de tienda por marca presente */}
          <div className="mb-4 rounded-xl border border-stone-200 bg-white p-3.5">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[13px]">
                <thead>
                  <tr>
                    {["Marca en esta factura", "Estado", "Divisor", "Extra $", "Redondeo", ""].map((h, i) => (
                      <th key={i} className="border-b-[1.5px] border-stone-300 px-2.5 py-2 text-left text-[12px] font-semibold uppercase tracking-wide text-stone-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {marcasPresentes.map(({ key, label }) => {
                    const f = marcaForms[key] ?? { ...BLANK_FORMULA, marca: label };
                    const saved = savedByNorm.has(key);
                    const divisorMsg = marcasDivisorMsg[key] ?? null;
                    return (
                      <tr key={key}>
                        <td className="border-b border-stone-100 px-2.5 py-2 font-semibold text-stone-900">{label}</td>
                        <td className="border-b border-stone-100 px-2.5 py-2">
                          {saved
                            ? <span className="rounded bg-emerald-50 px-2 py-0.5 text-[12px] font-semibold text-emerald-700">Guardada</span>
                            : <span className="rounded bg-amber-50 px-2 py-0.5 text-[12px] font-semibold text-amber-700">Sin guardar</span>}
                        </td>
                        <td className="border-b border-stone-100 px-2.5 py-2 align-top">
                          <input
                            type="number" step="0.01" value={f.divisor || ""}
                            aria-label={`Divisor ${label}`}
                            aria-invalid={divisorMsg !== null}
                            onChange={(e) => onMarcaFormChange(key, { divisor: Number(e.target.value) || 0 })}
                            className={divisorMsg !== null
                              ? `${miniInputCls} border-red-400 bg-red-50 text-red-900 focus:border-red-500 focus:ring-red-500/20`
                              : miniInputCls}
                          />
                          {divisorMsg !== null && (
                            <div className="mt-1 max-w-[220px] text-[12px] font-semibold text-red-700">{divisorMsg}</div>
                          )}
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
                            <option value="par">Par</option>
                          </select>
                        </td>
                        <td className="border-b border-stone-100 px-2.5 py-2">
                          <button
                            type="button" onClick={() => saveMarca(key)} disabled={savingMarca === key || divisorMsg !== null}
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
            {/* Jerarquía de precios: se aprende una vez → ⓘ. */}
            <div className="mt-2 -ml-2">
              <Ayuda titulo="Qué precio gana" etiqueta="Qué precio gana">
                <p>
                  Jerarquía: precio fijo &gt; fórmula de la descripción &gt; fórmula de la marca (se
                  configuran en la pestaña &ldquo;Fórmulas por marca&rdquo; → Tienda).
                </p>
              </Ayuda>
            </div>
          </div>

          {/* Preview */}
          <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
            <div className="border-b border-stone-200 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-stone-500">
              Vista previa · marca y precio editables
            </div>
            <div className="max-h-[440px] overflow-auto">
              <table className="w-full table-auto border-collapse text-[12px] tabular-nums">
                <thead>
                  <tr>
                    <Th>Código</Th>
                    <Th>Código Barra</Th>
                    <Th>Descripción</Th>
                    <Th narrow>Cálculo</Th>
                    <Th narrow>Costo</Th>
                    <Th narrow>Precio</Th>
                    <Th narrow>Stock</Th>
                    <Th>Rubro</Th>
                    <Th>Marca</Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((d, ri) => {
                    const priceEdited = priceEdits[ri] !== undefined;
                    const amber = d.revisar !== null;
                    return (
                      <tr key={ri} className={amber ? "bg-amber-50/60 hover:bg-amber-50" : "hover:bg-teal-50"} title={d.revisar ?? undefined}>
                        <td className="border-b border-stone-100 px-2 py-2 font-mono text-[12px]">{String(d.cols["Código *"])}</td>
                        <td className="border-b border-stone-100 px-2 py-2 font-mono text-[12px] break-all">{String(d.cols["Código Barra *"])}</td>
                        <td className="border-b border-stone-100 px-2 py-2">
                          {String(d.cols["Descripción *"])}
                          {amber && <span className="ml-1.5 rounded bg-amber-100 px-1 py-0.5 text-[12px] font-semibold text-amber-800" title={d.revisar ?? ""}>revisar</span>}
                        </td>
                        <td className="w-px whitespace-nowrap border-b border-stone-100 px-2 py-2 text-right font-mono text-[12px] text-stone-400">
                          {calcCell(ri, d)}
                        </td>
                        <td className="whitespace-nowrap border-b border-stone-100 px-2 py-2 text-right">
                          {costoOf(d) === null ? <span className="text-stone-300">—</span> : costoOf(d)}
                        </td>
                        <td className="border-b border-stone-100 px-2 py-2 text-right">
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
                        <td className="whitespace-nowrap border-b border-stone-100 px-2 py-2 text-right">{String(d.cols["Stock Ideal"])}</td>
                        <td className="border-b border-stone-100 px-2 py-2">{String(d.cols["rubro *"])}</td>
                        <td className="border-b border-stone-100 px-2 py-2">
                          {d.marcaCandidatas.length > 1 ? (
                            <select
                              value={String(d.cols["Marca *"])}
                              onChange={(e) => onMarcaChange(ri, e.target.value)}
                              className="rounded-md border border-amber-600 bg-amber-50 px-1 py-0.5 text-xs font-semibold text-amber-800 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
                              title="Marca ambigua: elige la correcta"
                            >
                              {d.marcaCandidatas.map((m) => (
                                <option key={m} value={m.toUpperCase()}>{m.toUpperCase()}</option>
                              ))}
                            </select>
                          ) : (
                            String(d.cols["Marca *"])
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

    </div>
  );
}

// ── Estilos ──────────────────────────────────────────────────────────────────
const inputCls =
  "w-full min-h-[44px] rounded-lg border border-stone-300 bg-stone-50 px-3 py-2 text-sm text-stone-900 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20";
const miniInputCls =
  "h-8 w-20 rounded-md border border-stone-300 bg-stone-50 px-2 text-right font-mono text-[13px] text-stone-900 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20";
const miniSelectCls =
  "h-8 rounded-md border border-stone-300 bg-stone-50 px-2 text-[13px] text-stone-900 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20";

function Th({ children, narrow }: { children: React.ReactNode; narrow?: boolean }) {
  return (
    <th className={`sticky top-0 border-b-[1.5px] border-stone-300 bg-stone-100 px-2 py-2.5 text-[12px] font-semibold uppercase tracking-wide text-stone-600 ${narrow ? "whitespace-nowrap text-right" : "text-left"}`}>
      {children}
    </th>
  );
}

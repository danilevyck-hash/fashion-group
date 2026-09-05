"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { UploadCloud } from "lucide-react";
import { saveAs } from "file-saver";
import {
  COMPANIAS_DEPURADOR,
  companiaLabel,
  empresasReconocidas,
  pickBestSheet,
  processRows,
  setRowTalla,
  buildAoa,
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
import { veredictoDescripcion } from "@/lib/depurador/veredicto";
import { mensajeDivisorEnPantalla } from "@/lib/depurador/divisor";
import { hoyPanama } from "@/lib/fecha-panama";
import DesplegableFlotante from "@/components/ui/DesplegableFlotante";
import { useCatalogoDescripciones } from "@/lib/hooks/useCatalogoDescripciones";
import { useLastUsed } from "@/lib/hooks/useLastUsed";
import AlarmaDescripcionesNuevas, { type DescripcionNueva } from "./AlarmaDescripcionesNuevas";

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
  /** Callback al descargar — registra el historial en el server (Tarea 4).
   *  `archivo` son los MISMOS bytes que bajaron al disco (4-sep-2026). */
  onDownloaded?: (payload: {
    empresa: string;
    marca: string;
    cantidad_estilos: number;
    total_unidades: number;
    total_costo: number;
    archivo?: { blob: Blob; nombre: string };
  }) => void;
  /** Archivo inyectado por el dispatcher (mismo tab). Si viene, se oculta la dropzone
   *  propia y se procesa automáticamente. La lógica CK/TH no cambia. */
  injectedFile?: File | null;
  /** Volver a la dropzone del dispatcher. */
  onReset?: () => void;
}

export default function DepuradorClient({ onDownloaded, injectedFile, onReset }: DepuradorClientProps) {
  const embedded = injectedFile !== undefined;
  const fileRef = useRef<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [fileName, setFileName] = useState("");
  const [dragging, setDragging] = useState(false);
  const [processed, setProcessed] = useState<ProcessedRow[] | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  // Artículos que el proveedor no pidió (cantidad 0) y por eso no van al Excel.
  const [omitidosSinCantidad, setOmitidosSinCantidad] = useState(0);
  // Marcas del archivo que el catálogo NO conoce: caen a "Otros" y por eso el
  // producto sale SIN PRECIO. Antes se perdían en silencio. No frenan la carga.
  const [marcasDesconocidas, setMarcasDesconocidas] = useState<{ marca: string; productos: number }[]>([]);
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [orphanSeen, setOrphanSeen] = useState(false); // alarma de descripción nueva (Tarea 8)

  // ── Config RECORDADA entre corridas (4-sep-2026) ───────────────────────────
  // Tasa, factor y modo de precio se recuerdan con el patrón de la casa
  // (useLastUsed → fg_last_* en localStorage). El ARCHIVO no se recuerda.
  // 🔴 La TEMPORADA no se recuerda y la COMPAÑÍA ya no se elige (ver abajo).
  // «07» = el código de Switch para el 7% (texto) y «0» = exento. Daniel,
  // textual: «solo existen esas dos» — la pantalla ofrece un select de dos
  // opciones y nada más. tasaSwitch (que no se tocó) sigue traduciendo lo que
  // traiga una factura en otros caminos.
  const [tasaCruda, setTasaCruda] = useLastUsed("depurador_tasa", "07");
  const [factor, setFactor] = useLastUsed("depurador_factor", "1.1");
  const [modoStr, setModoStr] = useLastUsed("depurador_precio_modo", "marca");

  // Derivados saneados de lo recordado (un localStorage viejo o tocado a mano
  // no puede meter un valor que la pantalla no ofrece).
  const tasa = tasaCruda === "0" ? "0" : "07";
  const setTasa = (v: string) => setTasaCruda(v === "0" ? "0" : "07");

  // ── Temporada (4-sep-2026) ─────────────────────────────────────────────────
  // Ese dato NO es la fecha de la corrida: arma la columna «Temporada» del
  // Excel (AAAA-MM) y entra a Switch. 🔴 SIEMPRE arranca en el MES ACTUAL de
  // Panamá (Daniel: «la temporada es el mes que se hace el archivo») y NO se
  // recuerda de la corrida anterior — recordarla haría que el 1 de septiembre
  // siguiera diciendo agosto. Editable, un solo campo.
  const [temporada, setTemporada] = useState(() => hoyPanama().slice(0, 7));
  const { mesIdx, anio } = partesDeTemporada(temporada);

  // ── La compañía se RECONOCE, no se elige (4-sep-2026) ──────────────────────
  // Daniel: «¿para qué elegir la compañía si la puede detectar?». La marca del
  // archivo ya la dice (empresasReconocidas ← empresaDeMarcaCatalogo). Queda
  // «cambiar» por si la marca es nueva o el reconocimiento falla — y esa
  // elección a mano GANA hasta que se cargue otro archivo.
  const [empresaAuto, setEmpresaAuto] = useState("");
  const [empresaManual, setEmpresaManual] = useState("");
  // Compañías reconocidas en el archivo: con 2+ se DICE en pantalla y se elige
  // a mano — nunca se adivina (confirmado por Daniel: un archivo trae una sola
  // marca, así que una sola compañía; si llegara uno mixto, no se inventa).
  const [empresasArchivo, setEmpresasArchivo] = useState<string[]>([]);
  const empresa = empresaManual || empresaAuto;

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
  // El modo también se recuerda entre corridas (modoStr, arriba).
  const priceMode: "global" | "marca" = modoStr === "global" ? "global" : "marca";
  const setPriceMode = (m: "global" | "marca") => setModoStr(m);
  // Fórmula global: "draft" se edita en vivo; "applied" maneja el cálculo de las
  // filas (se confirma con "Aplicar a todo"). Defaults del mockup: 0.73 / 2 / int.
  const [draftDivisor, setDraftDivisor] = useState("0.73");
  const [draftExtra, setDraftExtra] = useState(2);
  const [draftRedondeo, setDraftRedondeo] = useState<Redondeo>("int");
  const [applied, setApplied] = useState<{ divisor: number; extra: number; redondeo: Redondeo }>(
    { divisor: 0.73, extra: 2, redondeo: "int" }
  );

  // La fórmula global se recuerda COMO QUEDÓ APLICADA (no cada tecla del draft):
  // lo que rige los precios de la última corrida es lo que la pantalla revive.
  // Un divisor guardado inválido no se revive (defensa contra localStorage viejo).
  const [formulaGlobalGuardada, setFormulaGlobalGuardada] = useLastUsed("depurador_formula_global", "");
  const hidratoFormulaGlobal = useRef(false);
  useEffect(() => {
    if (hidratoFormulaGlobal.current || !formulaGlobalGuardada) return;
    hidratoFormulaGlobal.current = true;
    try {
      const g = JSON.parse(formulaGlobalGuardada) as { divisor?: unknown; extra?: unknown; redondeo?: unknown };
      const divisorTxt = typeof g.divisor === "string" ? g.divisor.trim() : "";
      if (!divisorTxt || mensajeDivisorEnPantalla(divisorTxt) !== null) return;
      const extra = typeof g.extra === "number" && Number.isInteger(g.extra) && g.extra >= 0 && g.extra <= 5 ? g.extra : 2;
      const redondeo: Redondeo = g.redondeo === "half" ? "half" : "int";
      setDraftDivisor(divisorTxt);
      setDraftExtra(extra);
      setDraftRedondeo(redondeo);
      setApplied({ divisor: Number(divisorTxt) || 0, extra, redondeo });
    } catch {
      // JSON roto en localStorage: se quedan los defaults de siempre.
    }
  }, [formulaGlobalGuardada]);

  // 🔴 Precios editados a mano, guardados por REFERENCIA del artículo (la llave
  // estable de la fila: cols["Código *"]), NUNCA por índice: al re-procesar el
  // archivo siguen pegados al artículo correcto aunque las filas se muevan, y
  // un artículo que ya no está en el archivo nuevo conserva su precio por si
  // vuelve. Daniel, textual: «y también consérvalos» (4-sep-2026).
  const [priceEdits, setPriceEdits] = useState<Record<string, string>>({});
  // Espejo para leer los edits desde runFile (useCallback sin deps) sin cerrarse
  // sobre un estado viejo.
  const priceEditsRef = useRef<Record<string, string>>({});
  useEffect(() => { priceEditsRef.current = priceEdits; }, [priceEdits]);
  // Cuántos precios a mano siguieron aplicados tras el último re-proceso (para
  // decirlo en pantalla con la opción de borrarlos todos).
  const [editsConservados, setEditsConservados] = useState(0);
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
        const { rows, warnings: w, omitidosSinCantidad, marcasDesconocidas } = processRows(best, cfg);
        setProcessed(rows);
        setWarnings(w);
        setOmitidosSinCantidad(omitidosSinCantidad);
        setMarcasDesconocidas(marcasDesconocidas);
        setOrphanSeen(false); // re-evaluar alarma de descripción nueva con el archivo nuevo
        // 🔴 Los precios escritos a mano NO se borran al re-procesar. Están
        // guardados por referencia de artículo, así que se re-pegan solos a su
        // fila; acá solo se cuenta cuántos siguen aplicados para decirlo en
        // pantalla. Daniel, textual: «y también consérvalos».
        {
          const presentes = new Set(rows.map((r) => String(r.cols["Código *"] ?? "")));
          setEditsConservados(
            Object.keys(priceEditsRef.current).filter((k) => presentes.has(k)).length
          );
        }
        setSelected(new Set());
        setDescFilter("");
        setMassPrice("");
        setError("");
        // 🔴 La compañía se RECONOCE de las marcas del archivo (CK → Vistana,
        // TH FOOTWEAR → Fashion Shoes, resto TH → Fashion Wear, KL → Active
        // Wear). Si ninguna marca del catálogo opina, se cae al destinatario
        // del archivo (NOMBRE_DESTINATARIO_MERCANCIAS), como antes. Con 2+
        // compañías reconocidas NO se adivina: se dice en pantalla y se elige
        // con «cambiar». El re-proceso (mismo archivo) no toca la elección a
        // mano — esa solo se limpia al cargar OTRO archivo (handleFile).
        const reconocidas = empresasReconocidas(rows.map((r) => r.cols["Marca *"]));
        setEmpresasArchivo(reconocidas);
        if (reconocidas.length === 1) {
          setEmpresaAuto(reconocidas[0]);
        } else if (reconocidas.length === 0) {
          const dest = rows.find((r) => r.destino)?.destino || "";
          setEmpresaAuto(matchEmpresaFromDestino(dest) ?? "");
        } else {
          setEmpresaAuto("");
        }
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
      // Archivo NUEVO: la compañía elegida a mano se limpia — la del archivo
      // nuevo se reconoce sola en runFile.
      setEmpresaManual("");
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

  // ── Reprocesar al cambiar un parámetro si ya hay archivo cargado ──────────
  // Los campos TECLEADOS (año, factor) ya no re-leen el Excel en cada tecla:
  // esperan a que la persona termine de escribir (300 ms) o al blur. Los
  // selects (mes, tasa) reprocesan al momento, como siempre. El RESULTADO no
  // cambia en nada: es la misma corrida, disparada menos veces.
  type ConfigReproceso = { mesIdx: number; anio: string; tasa: string; factor: string };
  const REPROCESO_ESPERA_MS = 300;
  const reprocesoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reprocesoPendiente = useRef<ConfigReproceso | null>(null);

  const ejecutarReproceso = useCallback(
    (cfg: ConfigReproceso) => {
      reprocesoPendiente.current = null;
      if (reprocesoTimer.current) { clearTimeout(reprocesoTimer.current); reprocesoTimer.current = null; }
      if (fileRef.current) runFile(fileRef.current, cfg);
    },
    [runFile]
  );

  const cfgConParche = useCallback(
    (patch: Partial<ConfigReproceso>): ConfigReproceso =>
      ({ mesIdx, anio, tasa, factor, ...(reprocesoPendiente.current ?? {}), ...patch }),
    [mesIdx, anio, tasa, factor]
  );

  /** Reprocesa YA (selects: mes, tasa — un cambio discreto por interacción). */
  const reprocesarYa = useCallback(
    (patch: Partial<ConfigReproceso>) => { ejecutarReproceso(cfgConParche(patch)); },
    [ejecutarReproceso, cfgConParche]
  );

  /** Reprocesa cuando la persona deja de teclear (año, factor). */
  const reprocesarLuego = useCallback(
    (patch: Partial<ConfigReproceso>) => {
      const cfg = cfgConParche(patch);
      reprocesoPendiente.current = cfg;
      if (reprocesoTimer.current) clearTimeout(reprocesoTimer.current);
      reprocesoTimer.current = setTimeout(() => { ejecutarReproceso(cfg); }, REPROCESO_ESPERA_MS);
    },
    [cfgConParche, ejecutarReproceso]
  );

  /** Al salir del campo (blur) no se espera: lo pendiente corre de una. */
  const reprocesarAlSalir = useCallback(() => {
    if (reprocesoPendiente.current) ejecutarReproceso(reprocesoPendiente.current);
  }, [ejecutarReproceso]);

  useEffect(() => () => { if (reprocesoTimer.current) clearTimeout(reprocesoTimer.current); }, []);

  const reset = () => {
    fileRef.current = null;
    setProcessed(null);
    setWarnings([]);
    setError("");
    setFileName("");
    // Los precios a mano NO se limpian: van por referencia de artículo y se
    // conservan por si el artículo vuelve en el archivo siguiente. Para
    // borrarlos está el botón «Borrarlos todos». La compañía se reconoce del
    // próximo archivo (handleFile limpia la elegida a mano).
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

  // Marca para la línea «compañía · marca»: la primera real del archivo (el
  // cajón "Otros" no cuenta); con varias, «CK Footwear +2».
  const marcaLinea = useMemo(() => {
    const reales = marcasPresentes.map((m) => m.label).filter((l) => marcaKey(l) !== marcaKey("Otros"));
    if (reales.length === 0) return "";
    return reales.length === 1 ? reales[0] : `${reales[0]} +${reales.length - 1}`;
  }, [marcasPresentes]);

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

  /** Llave estable de una fila para los precios a mano: la referencia del
   *  artículo (cols["Código *"] = REFERENCIA del proveedor, una fila por
   *  referencia en processRows). */
  const refDe = (row: ProcessedRow): string => String(row.cols["Código *"] ?? "");

  // Precio final de una fila: editado a mano si lo hay, si no el calculado.
  const finalPrice = (row: ProcessedRow): number | null => {
    const raw = priceEdits[refDe(row)];
    if (raw !== undefined) {
      const t = raw.trim();
      if (t === "") return null;
      const n = Number(t);
      return Number.isFinite(n) ? n : null;
    }
    return autoPrice(row);
  };

  const displayPrice = (row: ProcessedRow): string => {
    const raw = priceEdits[refDe(row)];
    if (raw !== undefined) return raw;
    const a = autoPrice(row);
    return a === null ? "" : String(a);
  };

  // Texto de la columna "Cálculo": divisor (+extra) y margen REAL post-redondeo (A6).
  // Si el precio fue editado a mano, solo el margen (la fórmula ya no aplica).
  const calcCell = (row: ProcessedRow): string => {
    const cif = cifOf(row);
    const fp = finalPrice(row);
    const m = marginPct(cif, fp);
    const mTxt = m === null ? "" : `${m}%`;
    if (priceEdits[refDe(row)] !== undefined) return mTxt ? `· ${mTxt}` : "—"; // editado a mano
    const exc = excForRow(row);
    if (exc?.precio_fijo) return mTxt ? `fijo · ${mTxt}` : "fijo"; // precio fijo gana
    const f = formulaForRow(row);
    if (!f || !f.divisor) return "—";
    const ex = f.extra > 0 ? `+${f.extra}` : "";
    return mTxt ? `÷${f.divisor}${ex} · ${mTxt}` : `÷${f.divisor}${ex}`;
  };

  const onPriceEdit = (row: ProcessedRow, value: string) =>
    setPriceEdits((prev) => ({ ...prev, [refDe(row)]: value }));

  /** Borra TODOS los precios escritos a mano — un botón, nunca automático. */
  const borrarPreciosAMano = () => {
    setPriceEdits({});
    setEditsConservados(0);
  };

  // ── Validación del divisor EN LA PANTALLA (4-sep-2026) ────────────────────
  // El mismo guard de las 4 rutas API (validarDivisor, vía
  // mensajeDivisorEnPantalla), ahora también donde se teclea. Fuera de rango:
  // el campo se marca en rojo, se dice el mensaje y se apaga la DESCARGA —
  // nunca el tecleo, para poder borrar y corregir sin pelear con el campo.
  const draftDivisorMsg = mensajeDivisorEnPantalla(draftDivisor);
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
  // Solo bloquean los divisores que DE VERDAD alimentan el Excel según el modo.
  const divisorBloqueaDescarga =
    priceMode === "global"
      ? draftDivisorMsg !== null || mensajeDivisorEnPantalla(String(applied.divisor)) !== null
      : Object.keys(marcasDivisorMsg).length > 0;

  const applyGlobal = () => {
    if (draftDivisorMsg !== null) return; // un divisor fuera de rango no se aplica
    setApplied({ divisor: Number(draftDivisor) || 0, extra: draftExtra, redondeo: draftRedondeo });
    // Se recuerda la fórmula APLICADA para la próxima corrida.
    setFormulaGlobalGuardada(JSON.stringify({ divisor: draftDivisor, extra: draftExtra, redondeo: draftRedondeo }));
  };

  const onMarcaFormChange = (key: string, patch: Partial<MarcaFormula>) =>
    setMarcaForms((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));

  const saveMarca = async (key: string) => {
    const f = marcaForms[key];
    if (!f || savingMarca) return;
    setSavingMarca(key);
    try {
      const empresaLabel = companiaLabel(empresa) || null;
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

  // Aplica un precio a las filas seleccionadas (marca cada una como editada a
  // mano, por referencia de artículo).
  const applyMassPrice = () => {
    if (selected.size === 0) return;
    setPriceEdits((prev) => {
      const n = { ...prev };
      selected.forEach((i) => {
        const r = processed?.[i];
        if (r) n[refDe(r)] = massPrice;
      });
      return n;
    });
    setSelected(new Set());
  };

  const download = async () => {
    if (!processed || downloading || !catalogo) return;
    if (descsNuevas.length > 0) return; // bloqueado: descripciones nuevas sin aprobar (Tarea 2)
    if (divisorBloqueaDescarga) return; // 🔴 un divisor fuera de rango no baja un Excel 100× mal
    setDownloading(true);
    try {
      const XLSX = (await import("xlsx-js-style")).default;
      // El precio final (calculado o editado) va a la columna "Precio *".
      // Proveedor fijo según la empresa destino (CAMBIO 2); otras empresas dejan el del archivo.
      const provFijo = proveedorParaEmpresa(empresa);
      const finalRows = processed.map((r) => {
        const cols: Record<string, string | number | null> = { ...r.cols, "Precio *": finalPrice(r) };
        if (provFijo) cols["Proveedor *"] = provFijo;
        return { ...r, cols };
      });
      // Una sola plantilla de 25 columnas para las 4 empresas (la de Switch).
      const aoa = buildAoa(finalRows);
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
      // 🔴 Los bytes se generan UNA sola vez: lo que baja al disco y lo que se
      // guarda 90 días en el Historial es EL MISMO archivo, byte a byte —
      // escribir dos veces podría diferir (SheetJS estampa la hora de creación).
      const bytes = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
      const salida = new ArrayBuffer(bytes.byteLength);
      new Uint8Array(salida).set(new Uint8Array(bytes));
      const nombre = outputFilename(processed);
      const blob = new Blob([salida], { type: MIME_XLSX });
      saveAs(blob, nombre);

      // Historial (Tarea 4 + archivo 4-sep-2026) — lo único que toca el server
      if (onDownloaded) {
        const t = computeTotales(processed);
        onDownloaded({
          empresa: companiaLabel(empresa),
          marca: t.marca,
          cantidad_estilos: t.cantidad_estilos,
          total_unidades: t.total_unidades,
          total_costo: t.total_costo,
          archivo: { blob, nombre },
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
  //
  // De esas huérfanas, SOLO alertan las de veredicto "alerta" (casi-gemelas,
  // mitad nueva, formato raro). Las que tienen las dos mitades ya conocidas
  // pasan solas — se cuentan en `pasaronSolas` y se dicen en pantalla: nada se
  // descarta en silencio.
  const { descsNuevas, pasaronSolas } = useMemo(() => {
    if (!processed || !catalogo) return { descsNuevas: [] as DescripcionNueva[], pasaronSolas: 0 };
    const seen = new Set<string>();
    const out: DescripcionNueva[] = [];
    let solas = 0;
    for (const r of processed) {
      const marca = String(r.cols["Marca *"] || "");
      const desc = String(r.cols["Descripción *"] || "");
      if (!desc) continue;
      if (descripcionesDeMarca(catalogo, marca).length === 0) continue; // marca no catalogada (Otros) → ignorar
      const k = `${marcaKey(marca)}|||${marcaKey(desc)}`;
      if (seen.has(k)) continue;
      seen.add(k);
      if (esDescripcionCatalogada(catalogo, marca, desc)) continue;
      const v = veredictoDescripcion(desc, catalogo);
      if (v.veredicto !== "alerta") { solas++; continue; }
      out.push({ marca, desc, motivo: v.texto, gemela: v.gemela });
    }
    return { descsNuevas: out, pasaronSolas: solas };
  }, [processed, catalogo]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      {/* Alarma de descripción NUEVA no catalogada (Tarea 8) — BLOQUEA la descarga.
          Admin/secretaria pueden aprobarlas ahí mismo; al aprobar, el catálogo en
          memoria se actualiza y la alarma se re-evalúa en vivo. */}
      {processed && descsNuevas.length > 0 && !orphanSeen && (
        <AlarmaDescripcionesNuevas
          items={descsNuevas}
          pasaronSolas={pasaronSolas}
          onAprobada={(marca, desc) => { agregarDescripcion(marca, desc); }}
          onClose={() => setOrphanSeen(true)}
        />
      )}

      {/* Sin masthead: "Depurador" ya lo dicen la barra sticky (celular), el
          breadcrumb (escritorio) Y el selector de pestañas de arriba, que en
          los tres anchos muestra en cuál estás. Queda sr-only para no dejar la
          pantalla sin encabezado. La línea divisoria se fue con el título: era
          el subrayado del masthead, no una separación de contenido. */}
      <h1 className="sr-only">Depurador de Productos</h1>

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

      {/* Config (colapsable — casi nunca cambia: factor 1.1, tasa 07) */}
      <details className="mb-4 rounded-xl border border-stone-200 bg-white">
        <summary className="cursor-pointer list-none px-4 py-2 text-[12px] font-medium text-stone-500 [&::-webkit-details-marker]:hidden">
          <span className="text-stone-400">▸</span> Editar temporada y costos
        </summary>
        <div className="grid grid-cols-2 gap-3.5 border-t border-stone-200 p-4 sm:grid-cols-3">
        {/* 🔴 UN campo «Temporada» (era «Mes» + «Año», que parecían la fecha de
            la corrida). Arranca SIEMPRE en el mes actual de Panamá y no se
            recuerda: este dato entra a Switch. */}
        <Field label="Temporada" note={textoTemporada(temporada)}>
          <input
            type="month" value={temporada} aria-label="Temporada"
            onChange={(e) => {
              const v = /^\d{4}-\d{2}$/.test(e.target.value) ? e.target.value : hoyPanama().slice(0, 7);
              setTemporada(v);
              const p = partesDeTemporada(v);
              reprocesarYa({ mesIdx: p.mesIdx, anio: p.anio });
            }}
            className={inputCls}
          />
        </Field>
        {/* Daniel, textual: «solo existen esas dos» — 7% (código «07») y
            Exento («0»). Ya no es texto libre: «abc» no puede llegar al Excel. */}
        <Field label="Tasa de impuesto">
          <select
            value={tasa} aria-label="Tasa de impuesto"
            onChange={(e) => { setTasa(e.target.value); reprocesarYa({ tasa: e.target.value === "0" ? "0" : "07" }); }}
            className={selectCls}
          >
            <option value="07">7%</option>
            <option value="0">Exento (0%)</option>
          </select>
        </Field>
        <Field label="Factor costo CIF" note="Costo FOB × este factor = CIF.">
          <input
            type="number" step="0.01" value={factor} aria-label="Factor costo CIF"
            onChange={(e) => { setFactor(e.target.value); reprocesarLuego({ factor: e.target.value }); }}
            onBlur={reprocesarAlSalir}
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

          {/* El archivo trae marcas de DOS compañías: se dice y se elige a
              mano — nunca se adivina (Daniel confirmó que no debería pasar). */}
          {empresasArchivo.length > 1 && (
            <p className="mb-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
              El archivo trae marcas de {empresasArchivo.length} compañías
              ({empresasArchivo.map((k) => companiaLabel(k)).join(" y ")}). Toca «cambiar» y elige una.
            </p>
          )}

          {/* Barra compacta: compañía RECONOCIDA + acciones. La compañía ya no
              se elige: la dice la marca del archivo, con «cambiar» por si la
              marca es nueva o el reconocimiento falla (4-sep-2026). */}
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-stone-200 bg-white px-3 py-2">
            <CompaniaReconocida
              empresa={empresa}
              marca={marcaLinea}
              fileName={fileName}
              onCambiar={(key) => setEmpresaManual(key)}
            />
            <button
              onClick={download}
              disabled={downloading || descsNuevas.length > 0 || !catalogo || divisorBloqueaDescarga}
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

          {/* Marca que el catálogo no conoce: el producto sale igual, pero SIN
              PRECIO (la fórmula se elige por marca y "Otros" no tiene). Antes
              esto pasaba en silencio. Una línea por marca, con el conteo, y NO
              bloquea la descarga: se dice, no se esconde. */}
          {marcasDesconocidas.map((m) => (
            <p
              key={m.marca}
              data-marca-desconocida={m.marca}
              className="mb-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-[13px] text-amber-900"
            >
              Marca desconocida: <b className="font-semibold">«{m.marca}»</b> — {m.productos.toLocaleString()}{" "}
              producto{m.productos === 1 ? "" : "s"} {m.productos === 1 ? "va" : "van"} a salir sin precio
            </p>
          ))}

          {/* Nada se descarta en silencio: las que no alertaron se dicen igual. */}
          {pasaronSolas > 0 && (
            <p className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
              {pasaronSolas} descripción(es) nueva(s) pasaron solas · las dos mitades ya existen
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

          {/* Los precios a mano sobrevivieron al re-proceso: se dice, y borrarlos
              es un botón — nunca automático. Daniel: «y también consérvalos». */}
          {editsConservados > 0 && (
            <div className="mb-4 flex flex-wrap items-center gap-2 px-1 text-[12px] text-stone-500">
              <span>
                {editsConservados} precio{editsConservados === 1 ? "" : "s"} escrito{editsConservados === 1 ? "" : "s"} a
                mano se conserv{editsConservados === 1 ? "ó" : "aron"}.
              </span>
              <button
                type="button"
                onClick={borrarPreciosAMano}
                className="font-semibold text-stone-600 underline decoration-stone-300 underline-offset-2 transition hover:text-stone-900"
              >
                Borrarlos todos
              </button>
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
              />
              <ModeBtn
                active={priceMode === "marca"}
                onClick={() => setPriceMode("marca")}
                title="Fórmula guardada por marca"
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
                      type="number" step="0.01" value={draftDivisor} aria-label="Divisor"
                      aria-invalid={draftDivisorMsg !== null}
                      onChange={(e) => setDraftDivisor(e.target.value)}
                      className={draftDivisorMsg !== null
                        ? `${priceFieldCls} border-red-400 bg-red-50 text-red-900 focus:border-red-500 focus:ring-red-500/20`
                        : priceFieldCls}
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
                    type="button" onClick={applyGlobal} disabled={draftDivisorMsg !== null}
                    className="h-9 rounded-md bg-teal-600 px-5 text-sm font-semibold text-white transition hover:bg-teal-700 active:scale-[0.97] disabled:cursor-not-allowed disabled:bg-stone-300"
                  >
                    Aplicar a todo
                  </button>
                </div>
                {/* Fuera de rango: se dice y se apaga la descarga — el tecleo no
                    se traba, para borrar y corregir sin pelear con el campo. */}
                {draftDivisorMsg !== null && (
                  <p className="mt-1.5 text-[12px] font-semibold text-red-700">{draftDivisorMsg}</p>
                )}
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
                        const divisorMsg = marcasDivisorMsg[key] ?? null;
                        return (
                          <tr key={key}>
                            <td className="border-b border-stone-100 px-2.5 py-2 font-semibold text-stone-900">{label}</td>
                            <td className="border-b border-stone-100 px-2.5 py-2">
                              {saved
                                ? <span className="rounded bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">Guardada</span>
                                : <span className="rounded bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">Sin guardar</span>}
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
                                <div className="mt-1 max-w-[220px] text-[11px] font-semibold text-red-700">{divisorMsg}</div>
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
                {/* El mismo 🔒 vivía también acá abajo. El de arriba se queda
                    —es el único con el botón "Ver y aprobar"— y este se fue:
                    repetir el bloqueo dos veces en una pantalla no frenaba a
                    nadie dos veces. */}
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
                                {calcCell(d)}
                              </td>
                            );
                          }
                          if (c === "Precio *") {
                            const priceEdited = priceEdits[refDe(d)] !== undefined;
                            return (
                              <td key={c} className="border-b border-stone-100 px-2 py-2 text-right">
                                <input
                                  value={displayPrice(d)}
                                  aria-label={`Precio ${refDe(d)}`}
                                  onChange={(e) => onPriceEdit(d, e.target.value)}
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

    </div>
  );
}

// ── Temporada: helpers puros del campo único (4-sep-2026) ───────────────────
const MIME_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const MESES_LARGOS = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

/** "2026-09" → { mesIdx: 8, anio: "2026" }. Un valor raro cae al mes actual
 *  de Panamá (nunca a un mes viejo recordado). */
function partesDeTemporada(t: string): { mesIdx: number; anio: string } {
  const m = /^(\d{4})-(\d{2})$/.exec(t);
  if (m) {
    const idx = parseInt(m[2], 10) - 1;
    if (idx >= 0 && idx <= 11) return { mesIdx: idx, anio: m[1] };
  }
  const hoy = hoyPanama();
  return { mesIdx: parseInt(hoy.slice(5, 7), 10) - 1, anio: hoy.slice(0, 4) };
}

/** El valor real al lado del campo: "Septiembre 2026 → 2026-09". */
function textoTemporada(t: string): string {
  const { mesIdx, anio } = partesDeTemporada(t);
  return `${MESES_LARGOS[mesIdx]} ${anio} → ${anio}-${String(mesIdx + 1).padStart(2, "0")}`;
}

/** La línea «Vistana International · CK Footwear» + el archivo + «cambiar».
 *  «cambiar» abre la lista de las 6 compañías con el desplegable de la casa
 *  (DesplegableFlotante — candado `desplegables-flotan`). */
function CompaniaReconocida({ empresa, marca, fileName, onCambiar }: {
  empresa: string;
  marca: string;
  fileName: string;
  onCambiar: (key: string) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const anclaRef = useRef<HTMLButtonElement>(null);
  return (
    <div className="min-w-0 flex-1">
      <div className="flex items-center gap-2">
        <span className={`truncate text-sm font-semibold ${empresa ? "text-stone-900" : "text-amber-700"}`}>
          {empresa ? companiaLabel(empresa) : "Elige la compañía"}
          {marca && <span className="font-normal text-stone-500"> · {marca}</span>}
        </span>
        <button
          ref={anclaRef}
          type="button"
          onClick={() => setAbierto((a) => !a)}
          aria-haspopup="listbox"
          aria-expanded={abierto}
          aria-label="Cambiar compañía"
          className="shrink-0 text-[12px] font-semibold text-teal-700 underline decoration-teal-300 underline-offset-2 transition hover:text-teal-900"
        >
          cambiar
        </button>
      </div>
      {fileName && <div className="truncate text-[11px] text-stone-500">{fileName}</div>}
      <DesplegableFlotante
        abierto={abierto}
        anclaRef={anclaRef}
        onCerrar={() => setAbierto(false)}
        marca="depurador-compania"
        role="listbox"
        aria-label="Compañía"
        anchoMinimo={220}
        className="bg-white rounded-xl border border-black/10 shadow-lg py-1"
      >
        {COMPANIAS_DEPURADOR.map((c) => (
          <button
            key={c.key}
            type="button"
            role="option"
            aria-selected={c.key === empresa}
            onClick={() => { onCambiar(c.key); setAbierto(false); }}
            className={`w-full min-h-[44px] px-4 flex items-center justify-between gap-2 text-left text-sm transition hover:bg-black/5 ${
              c.key === empresa ? "font-semibold text-teal-700" : "text-stone-700"
            }`}
          >
            {c.label}
          </button>
        ))}
      </DesplegableFlotante>
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

function ModeBtn({ active, onClick, title, last }: { active: boolean; onClick: () => void; title: string; last?: boolean }) {
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

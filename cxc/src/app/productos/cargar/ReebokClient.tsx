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
  filtrarConPiezas,
  TEXT_COLS,
  REEBOK_MARCA_A,
  REEBOK_MARCA_B,
  REEBOK_MARCA_EXC,
  REEBOK_EMPRESA,
  REEBOK_EMPRESA_KEY,
  REEBOK_FORMULA_A_DEFAULT,
  REEBOK_FORMULA_B_DEFAULT,
  type ReebokItem,
  type CatalogoRow,
  type SwitchRow,
  type MonthOption,
  valoresInesperados,
  type PrecioAB,
  type PriceFormula,
} from "@/lib/depurador/reebok";
import {
  findHeaderRowDespacho,
  parseDespacho,
  type ColumnaAusente,
} from "@/lib/depurador/reebok-despacho";
import { marcaKey, computeTotales, type Redondeo, type MarcaFormula, type MarcaRubroFormula } from "@/lib/depurador/logic";
import type { SheetRow } from "@/lib/depurador/logic";
import { mensajeDivisorEnPantalla } from "@/lib/depurador/divisor";
import { FLETE_OPCIONES, FLETE_DEFAULT, etiquetaFlete, normalizarFlete } from "@/lib/depurador/flete";
import type { Flete } from "@/lib/depurador/flete";
import { hoyPanama } from "@/lib/fecha-panama";
import {
  indexarFotos,
  parearFotos,
  textoEmparejado,
  ANCHO_COL_FOTO_WCH,
  ALTO_FILA_PT,
} from "@/lib/depurador/fotos-excel";
import { prepararFotos } from "./fotos-carpeta";
import { saveAs } from "file-saver";
import { Ayuda } from "@/components/shared/Ayuda";
import { ROTULO_DESCARGAR_PLANTILLA, ROTULO_SUBIR_OTRO_ARCHIVO } from "@/lib/depurador/rotulos";
import {
  costoDelArchivo,
  costoDeArticulos,
  facturasDelArchivo,
  plural,
} from "@/lib/depurador/resumen-del-archivo";
import { categoriasQueFaltan, inesperadosQueSeRevisan, listaConY } from "@/lib/depurador/reebok-categorias";
import { useNuevosEnSwitch } from "@/lib/hooks/useNuevosEnSwitch";
import { CostoDelArchivo, FacturasDelArchivo, NuevosEnSwitch } from "./ResumenDelArchivo";
import { workbookBlob, workbookBytes, filtroDesdeA1, XLSX_MIME } from "@/lib/excel-export";

type NameMode = "formula" | "fijo";
interface NameEdit { divisor: number; extra: number; redondeo: Redondeo; precioFijo: number | null; modo: NameMode; dirty: boolean }

type Salida = "catalogo" | "switch";

/* ── 🔴 LAS DOS ENTRADAS DEL MISMO FLUJO (17-sep-2026) ──────────────────────
 * Reebok manda DOS Excel distintos y los dos entran por acá:
 *   · «confirmacion» — la confirmación de compra: lo que VA A LLEGAR. Sirve para
 *     cotizar antes de que la mercancía exista. Es la de siempre y no cambió.
 *   · «despacho» — lo que DE VERDAD LLEGÓ, con el costo real (el descuento se
 *     LEE del archivo), el código de barras (`UPC`) y la cantidad recibida.
 * La pantalla DICE cuál se subió: son dos documentos distintos del proveedor y
 * confundirlos es cotizar con números que no son.
 * ────────────────────────────────────────────────────────────────────────── */
type FormatoReebok = "confirmacion" | "despacho";

const ROTULO_FORMATO: Record<FormatoReebok, string> = {
  confirmacion: "Confirmación de compra · lo que va a llegar",
  despacho: "Despacho · lo que llegó",
};

interface ReebokClientProps {
  /** Archivo inyectado por el dispatcher (mismo tab CK/TH). Si viene, se oculta la
   *  dropzone propia y se procesa automáticamente. */
  injectedFile?: File | null;
  /** Volver a la dropzone del dispatcher. */
  onReset?: () => void;
  /** Historial (4-sep-2026): 🔴 SOLO lo llama la Plantilla Switch — el pedido
   *  para cliente NO se guarda (Daniel: «el historial solo quiero los excel
   *  para switch»). `archivo` son los mismos bytes que bajaron al disco. */
  onDownloaded?: (payload: {
    empresa: string;
    marca: string;
    cantidad_estilos: number;
    total_unidades: number;
    total_costo: number;
    archivo?: { blob: Blob; nombre: string };
  }) => void;
}

export default function ReebokClient({ injectedFile, onReset, onDownloaded }: ReebokClientProps = {}) {
  const fileRef = useRef<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const embedded = injectedFile !== undefined;

  const [fileName, setFileName] = useState("");
  const [dragging, setDragging] = useState(false);
  const [rawRows, setRawRows] = useState<SheetRow[] | null>(null);
  const [items, setItems] = useState<ReebokItem[] | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [formato, setFormato] = useState<FormatoReebok>("confirmacion");
  /** Columnas del despacho que NO vinieron, con la regla que las reemplaza. */
  const [ausentes, setAusentes] = useState<ColumnaAusente[]>([]);
  /** Segmentos de negocio que no dicen FTW/APP/HW: salen con la Marca vacía. */
  const [segmentosRaros, setSegmentosRaros] = useState<Array<{ valor: string; articulos: string[] }>>([]);
  const [downloading, setDownloading] = useState<"" | "catalogo" | "switch">("");

  // Config de salida
  const [months, setMonths] = useState<MonthOption[]>([]);
  const [monthColIdx, setMonthColIdx] = useState<number>(-1);
  // Plantilla Switch por defecto: es la que Daniel usa casi siempre (pedido suyo).
  const [salida, setSalida] = useState<Salida>("switch");
  const [precioAB, setPrecioAB] = useState<PrecioAB>("A");
  const [tasa] = useState("07"); // código de Switch para el 7% (texto)

  // ── El FLETE (Costo FOB × flete = Costo CIF) ───────────────────────────────
  // Daniel: «Costo CIF seria 1.1 o 1.15 (default 1.1)». Son DOS cosas distintas
  // y por eso hay dos estados: `flete` es el de ESTA corrida (arriba, junto a
  // qué se genera) y `fleteDefault` es el que viene puesto, guardado en la base
  // y compartido por todo el equipo (abajo, con las fórmulas que se reusan).
  const [flete, setFlete] = useState<Flete>(FLETE_DEFAULT);
  const [fleteDefault, setFleteDefault] = useState<Flete>(FLETE_DEFAULT);
  const [guardandoFlete, setGuardandoFlete] = useState(false);
  const [flashFlete, setFlashFlete] = useState(false);
  const [errorFlete, setErrorFlete] = useState("");

  // Fórmulas editables Reebok (Precio A / Precio B), guardadas en marca_formulas.
  const [formulaA, setFormulaA] = useState<PriceFormula>(REEBOK_FORMULA_A_DEFAULT);
  const [formulaB, setFormulaB] = useState<PriceFormula>(REEBOK_FORMULA_B_DEFAULT);
  const [savingF, setSavingF] = useState<PrecioAB | null>(null);
  const [flashF, setFlashF] = useState<PrecioAB | null>(null);

  // Excepciones por Name (modelo): fórmula propia o precio fijo. Ganan a la marca.
  const [nameExc, setNameExc] = useState<MarcaRubroFormula[]>([]);
  const [nameEdits, setNameEdits] = useState<Record<string, NameEdit>>({});
  const [savingName, setSavingName] = useState<string | null>(null);
  const [flashName, setFlashName] = useState<string | null>(null);
  const [excOpen, setExcOpen] = useState(false);
  const [excFilter, setExcFilter] = useState("");

  // ── Fotos del pedido (opcional) ─────────────────────────────────────────────
  // La carpeta se lee del disco de la persona y NO se sube a ningún lado: solo
  // se achican las fotos que emparejan con un código y se pegan dentro del .xlsx.
  const carpetaRef = useRef<HTMLInputElement>(null);
  const [fotosArchivos, setFotosArchivos] = useState<File[] | null>(null);
  const [fotoProgreso, setFotoProgreso] = useState<{ hechas: number; total: number } | null>(null);
  const [resumenFotos, setResumenFotos] = useState<string>("");

  // Temporada automática: el mes ACTUAL de Panamá (UTC−5, no el reloj del
  // navegador), formato AAAA-MM (idéntico a CK/TH). Sin campo manual.
  const temporada = useMemo(() => hoyPanama().slice(0, 7), []);

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

  // Flete por defecto (compartido). Falla ABIERTO: si no contesta, queda 1.10,
  // que es lo que el sistema hacía antes de que el flete se pudiera elegir.
  useEffect(() => {
    let alive = true;
    fetch("/api/productos/cargar/flete")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("fetch"))))
      .then((d: { flete: number }) => {
        if (!alive) return;
        const f = normalizarFlete(d.flete);
        setFleteDefault(f);
        setFlete(f); // la corrida arranca en el default; cambiarlo es un toque
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const guardarFleteDefault = async (f: Flete) => {
    if (guardandoFlete) return;
    setGuardandoFlete(true);
    setErrorFlete("");
    try {
      const res = await fetch("/api/productos/cargar/flete", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flete: f }),
      });
      if (!res.ok) {
        setErrorFlete("No se pudo guardar el flete por defecto. Intenta de nuevo en unos segundos.");
        return;
      }
      setFleteDefault(f);
      setFlashFlete(true);
      setTimeout(() => setFlashFlete(false), 1500);
    } catch {
      setErrorFlete("No se pudo guardar el flete por defecto. Intenta de nuevo en unos segundos.");
    } finally {
      setGuardandoFlete(false);
    }
  };

  // Cargar excepciones por Name (marca "Reebok") de la tabla de excepciones (reusa CK/TH).
  const reloadExc = useCallback(() => {
    fetch("/api/productos/cargar/rubro-formulas")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("fetch"))))
      .then((d: { rows: MarcaRubroFormula[] }) => {
        setNameExc((d.rows ?? []).filter((f) => marcaKey(f.marca) === marcaKey(REEBOK_MARCA_EXC)));
      })
      .catch(() => {});
  }, []);
  useEffect(() => { reloadExc(); }, [reloadExc]);

  const runFile = useCallback(async (file: File, monthIdx?: number) => {
    setFileName(file.name);
    try {
      const buf = await file.arrayBuffer();
      const XLSX = (await import("xlsx-js-style")).default;
      const wb = XLSX.read(buf, { type: "array" });
      // El Book4 trae los datos en la primera hoja.
      const sheetName = wb.SheetNames[0];
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, raw: true, defval: null }) as SheetRow[];

      // 🔴 EL DESPACHO PRIMERO. Son dos archivos distintos y se reconocen por
      // CONTENIDO, nunca por el nombre de la hoja ni del archivo: hoy el
      // despacho llega como `Sheet1` en ropa y `Despacho` en calzado, y eso
      // puede cambiar sin que nadie avise.
      if (findHeaderRowDespacho(rows) !== -1) {
        const d = parseDespacho(rows);
        setRawRows(rows);
        setItems(d.items);
        setFormato("despacho");
        // En el despacho las piezas son `Quantity`: no hay columna de mes que
        // elegir, y por eso el desplegable no se dibuja.
        setMonths([]);
        setMonthColIdx(-1);
        setWarnings(d.warnings);
        setAusentes(d.ausentes);
        setSegmentosRaros(d.segmentosDesconocidos);
        setError("");
        return;
      }

      // Detectar headers para poblar el dropdown de "columna de piezas".
      const { findHeaderRow } = await import("@/lib/depurador/reebok");
      const hr = findHeaderRow(rows);
      const headers = hr === -1 ? [] : rows[hr];
      const opts = monthOptions(headers);
      const detected = monthIdx !== undefined ? monthIdx : detectMonthCol(headers);

      const { items: parsed, warnings: w } = parseReebok(rows, detected);
      setRawRows(rows);
      setItems(parsed);
      setFormato("confirmacion");
      setMonths(opts);
      setMonthColIdx(detected);
      setWarnings(w);
      setAusentes([]);
      setSegmentosRaros([]);
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
    setAusentes([]);
    setSegmentosRaros([]);
    setFormato("confirmacion");
    setError("");
    setFileName("");
    if (inputRef.current) inputRef.current.value = "";
    onReset?.(); // en modo dispatcher, volver a la dropzone compartida
  };

  const monthLabel = useMemo(
    () => months.find((m) => m.idx === monthColIdx)?.label ?? "",
    [months, monthColIdx],
  );
  /** Cómo se llama la columna de piezas en pantalla y en el Excel del cliente:
   *  el mes elegido en la confirmación, «recibidas» en el despacho. */
  const piezasLabel = formato === "despacho" ? "recibidas" : monthLabel;

  // Excepciones por Name indexadas por clave canónica (= excByName de los builders).
  const excByName = useMemo(() => {
    const m = new Map<string, MarcaRubroFormula>();
    for (const f of nameExc) m.set(marcaKey(f.rubro), f);
    return m;
  }, [nameExc]);

  // Names (modelos) presentes en el Excel cargado, orden alfabético.
  const namesPresent = useMemo(() => {
    if (!items) return [] as string[];
    const set = new Set<string>();
    for (const it of items) { const n = it.name.trim(); if (n) set.add(n); }
    return [...set].sort((a, b) => a.localeCompare(b, "es"));
  }, [items]);

  // Los artículos sin piezas del mes NO van al Excel (pedido de Daniel). El filtro se
  // aplica SOLO si hay columna de mes de verdad: sin ella parseReebok deja todo en 0 y
  // filtrar entregaría un archivo vacío (el aviso ámbar de abajo cubre ese caso).
  // En el despacho SIEMPRE se filtra: un artículo con 0 recibidas no llegó.
  const filtrarSinPiezas = formato === "despacho" || monthColIdx !== -1;

  const catalogoTodo: CatalogoRow[] = useMemo(
    () => (items ? buildCatalogo(items, { formulaA, formulaB, excByName, flete }) : []),
    [items, formulaA, formulaB, excByName, flete],
  );
  const { rows: catalogo, omitidos: catalogoOmitidos } = useMemo(
    () => (filtrarSinPiezas ? filtrarConPiezas(catalogoTodo) : { rows: catalogoTodo, omitidos: 0 }),
    [catalogoTodo, filtrarSinPiezas],
  );
  // Filas Switch (una por artículo) para preview y descarga.
  const switchRowsTodo: SwitchRow[] = useMemo(
    () => (items ? buildSwitchRows(items, { formula: precioAB === "A" ? formulaA : formulaB, temporada, tasa, excByName, flete }) : []),
    [items, precioAB, formulaA, formulaB, temporada, tasa, excByName, flete],
  );
  const { rows: switchRows, omitidos: switchOmitidos } = useMemo(
    () => (filtrarSinPiezas ? filtrarConPiezas(switchRowsTodo) : { rows: switchRowsTodo, omitidos: 0 }),
    [switchRowsTodo, filtrarSinPiezas],
  );
  const revisar = useMemo(() => switchRows.filter((r) => r.fallback).length, [switchRows]);

  // Los Department/CATEGORY/GENDER que el catálogo no va a saber traducir (ver
  // los bloques más abajo). Se derivan de lo que ya está en memoria: sin releer
  // nada.
  const inesperados = useMemo(() => (items ? valoresInesperados(items) : []), [items]);
  // 🔴 SE PARTEN EN DOS PROBLEMAS DISTINTOS (`reebok-categorias.ts`): las
  // CATEGORY que faltan del lado del CATÁLOGO —no hay nada que revisar en el
  // archivo— y los Department/GENDER, donde el valor sí puede venir mal del
  // proveedor y ese aviso NO cambió.
  const faltanCategorias = useMemo(() => categoriasQueFaltan(inesperados), [inesperados]);
  const aRevisar = useMemo(() => inesperadosQueSeRevisan(inesperados), [inesperados]);

  // Contadores de la barra: SIEMPRE los de la salida elegida, para que lo que se lee en
  // pantalla sea exactamente lo que trae el Excel que se descarga (antes mostraba los
  // del pedido incluso en modo Switch, que agrupa distinto: 526 en pantalla vs 383 reales).
  const vista = useMemo(() => {
    const filas: { piezas: number; skus: number }[] = salida === "catalogo" ? catalogo : switchRows;
    return {
      articulos: filas.length,
      skus: filas.reduce((s, r) => s + r.skus, 0),
      piezas: filas.reduce((s, r) => s + r.piezas, 0),
      omitidos: salida === "catalogo" ? catalogoOmitidos : switchOmitidos,
    };
  }, [salida, catalogo, switchRows, catalogoOmitidos, switchOmitidos]);

  // 🔴 EL COSTO DEL ARCHIVO, sobre las MISMAS filas que se van a descargar (por
  // eso mira `salida`, igual que los contadores de al lado). No se recalcula
  // nada: se suma lo que `costoReebok` ya decidió.
  const costo = useMemo(
    () => (salida === "catalogo"
      ? costoDeArticulos(catalogo.map((r) => ({ fob: r.fob, cif: r.costo, unidades: r.piezas })))
      : costoDelArchivo(switchRows)),
    [salida, catalogo, switchRows],
  );
  // Las facturas del proveedor («Document Number» del despacho). La confirmación
  // de compra no las trae: entonces no se dicen, no se inventan.
  const facturas = useMemo(
    () => facturasDelArchivo((items ?? []).map((it) => it.documento)),
    [items],
  );
  // Qué es nuevo y qué ya está en Switch. Falla ABIERTA: `null` = no se dice.
  const codigosDelArchivo = useMemo(
    () => (salida === "catalogo" ? catalogo.map((r) => r.newArticle) : switchRows.map((r) => String(r.cols["Código *"] ?? ""))),
    [salida, catalogo, switchRows],
  );
  const nuevosEnSwitch = useNuevosEnSwitch(REEBOK_EMPRESA_KEY, codigosDelArchivo);

  // Se filtró y no quedó nada: entregar un Excel vacío en silencio sería lo peor.
  const quedoVacio = filtrarSinPiezas && vista.articulos === 0;

  // ── Validación del divisor EN LA PANTALLA (4-sep-2026) ─────────────────────
  // El MISMO guard de las rutas API (validarDivisor, vía
  // mensajeDivisorEnPantalla — cero copias), igual que en CK/TH: campo rojo,
  // mensaje y la DESCARGA apagada, nunca el tecleo. Las fórmulas A/B alimentan
  // el Excel EN VIVO (sin guardar), así que bloquean según la salida: el
  // pedido lleva Precio A y B (los dos); la plantilla Switch, solo el elegido.
  const msgFormulaA = mensajeDivisorEnPantalla(String(formulaA.divisor || ""));
  const msgFormulaB = mensajeDivisorEnPantalla(String(formulaB.divisor || ""));
  const divisorBloqueaDescarga =
    salida === "catalogo"
      ? msgFormulaA !== null || msgFormulaB !== null
      : (precioAB === "A" ? msgFormulaA : msgFormulaB) !== null;
  // El borrador de una excepción por Name no alimenta el Excel hasta GUARDARSE
  // (los builders leen solo las guardadas): su divisor malo apaga SU «Guardar».
  const msgDeName = (r: { modo: NameMode; divisor: number }): string | null =>
    r.modo === "formula" ? mensajeDivisorEnPantalla(String(r.divisor || "")) : null;

  // Índice de la carpeta: solo NOMBRES, no se lee el contenido de ningún archivo
  // (la carpeta real son 4.742 fotos y ~800 MB).
  const fotosIndice = useMemo(
    () => (fotosArchivos ? indexarFotos(fotosArchivos) : null),
    [fotosArchivos],
  );
  // Emparejado contra las filas que van al Excel, en el MISMO orden que el Excel.
  const emparejado = useMemo(
    () => (fotosIndice ? parearFotos(catalogo.map((r) => r.newArticle), fotosIndice.indice) : null),
    [fotosIndice, catalogo],
  );

  const quitarFotos = () => {
    setFotosArchivos(null);
    setResumenFotos("");
    if (carpetaRef.current) carpetaRef.current.value = "";
  };

  // ── Excepciones por Name: fila derivada, edición y guardado ──────────────────
  const nameRowFor = (name: string) => {
    const key = marcaKey(name);
    const e = nameEdits[name];
    const s = excByName.get(key);
    const savedFijo = s?.precio_fijo ?? null;
    const savedModo: NameMode = savedFijo != null && savedFijo > 0 ? "fijo" : "formula";
    const divisor = e ? e.divisor : (s?.divisor ?? 0);
    const precioFijo = e ? e.precioFijo : savedFijo;
    const modo = e ? e.modo : savedModo;
    return {
      key, name, divisor, extra: e ? e.extra : (s?.extra ?? 0),
      redondeo: e ? e.redondeo : (s?.redondeo ?? "par") as Redondeo,
      precioFijo, modo, savedRow: s,
      fija: modo === "fijo" && precioFijo != null && precioFijo > 0,
      propia: modo === "fijo" ? precioFijo != null && precioFijo > 0 : divisor > 0,
      dirty: !!e?.dirty,
    };
  };
  const patchName = (name: string, p: Partial<NameEdit>) => {
    const r = nameRowFor(name);
    setNameEdits((prev) => ({ ...prev, [name]: { divisor: r.divisor, extra: r.extra, redondeo: r.redondeo, precioFijo: r.precioFijo, modo: r.modo, ...p, dirty: true } }));
  };
  const saveName = async (name: string) => {
    if (savingName) return;
    const r = nameRowFor(name);
    if (msgDeName(r) !== null) return; // un divisor fuera de rango no se guarda
    setSavingName(name);
    try {
      const tieneFijo = r.modo === "fijo" && r.precioFijo != null && r.precioFijo > 0;
      const tieneFormula = r.modo === "formula" && !!r.divisor;
      if (!tieneFijo && !tieneFormula) {
        // Vacío = hereda la fórmula de marca → borra la excepción si existía.
        if (r.savedRow?.id) {
          const res = await fetch(`/api/productos/cargar/rubro-formulas?id=${encodeURIComponent(r.savedRow.id)}`, { method: "DELETE" });
          if (res.ok) reloadExc();
        }
      } else {
        const payload = tieneFijo
          ? { marca: REEBOK_MARCA_EXC, rubro: name, divisor: 0, extra: 0, redondeo: "int", precio_fijo: r.precioFijo }
          : { marca: REEBOK_MARCA_EXC, rubro: name, divisor: r.divisor, extra: r.extra, redondeo: r.redondeo, precio_fijo: null };
        const res = await fetch("/api/productos/cargar/rubro-formulas", {
          method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
        });
        if (res.ok) reloadExc();
      }
      setNameEdits((prev) => { const n = { ...prev }; delete n[name]; return n; });
      setFlashName(name); setTimeout(() => setFlashName((f) => (f === name ? null : f)), 1500);
    } finally {
      setSavingName(null);
    }
  };
  const namesFiltered = useMemo(() => {
    const q = excFilter.trim().toLowerCase();
    return q ? namesPresent.filter((n) => n.toLowerCase().includes(q)) : namesPresent;
  }, [namesPresent, excFilter]);
  const conExc = useMemo(() => namesPresent.filter((n) => nameRowFor(n).propia).length, [namesPresent, excByName, nameEdits]); // eslint-disable-line react-hooks/exhaustive-deps

  // Guardar una fórmula Reebok en el sistema de fórmulas por marca.
  const saveFormula = async (which: PrecioAB) => {
    if (savingF) return;
    if ((which === "A" ? msgFormulaA : msgFormulaB) !== null) return; // fuera de rango: no se guarda
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
  //
  // Dos caminos. SIN carpeta de fotos es EXACTAMENTE el de siempre (mismas
  // columnas, mismos anchos, mismo `writeFile`): lo de las fotos es opcional y
  // no puede cambiar el archivo que el Depurador ya entrega.
  const downloadCatalogo = async () => {
    if (!items || downloading || quedoVacio) return;
    if (divisorBloqueaDescarga) return; // 🔴 un divisor fuera de rango no baja un Excel 100× mal
    setDownloading("catalogo");
    const nombre = `Pedido_ActiveShoes_${monthLabel || temporada}.xlsx`;
    try {
      const XLSX = (await import("xlsx-js-style")).default;
      const wb = XLSX.utils.book_new();

      if (!emparejado) {
        const aoa = buildCatalogoAoa(catalogo, piezasLabel);
        const ws = XLSX.utils.aoa_to_sheet(aoa);
        // Código de artículo como texto (New Article numérico → evita notación científica).
        forceTextCols(XLSX, ws as never, [1]);
        ws["!cols"] = aoa[0].map((_c, i) => ({ wch: i === 2 ? 26 : i === 1 ? 14 : 13 }));
        // 🔴 FILTRO DESDE A1 + FILA DE ENCABEZADOS FIJA, como todo Excel del
        // sistema. Este archivo se escapaba de la regla: bajaba por
        // `XLSX.writeFile`, que es escribir a secas.
        ws["!autofilter"] = { ref: filtroDesdeA1(aoa) };
        XLSX.utils.book_append_sheet(wb, ws, "Pedido");
        saveAs(workbookBlob(wb), nombre);
        return;
      }

      // Con fotos: primero se achican (es lo que tarda), después se arma el Excel.
      setFotoProgreso({ hechas: 0, total: emparejado.conFoto });
      // 🔴 Cada foto viaja con el NOMBRE DEL ARTÍCULO como texto alternativo:
      // sin él, este archivo —que Daniel le manda a clientes— abría diciendo
      // «Accesibilidad: es necesario investigar». El nombre sale del propio
      // pedido, nunca se inventa; un código sin nombre va sin `descr`.
      const nombrePorCodigo = new Map(catalogo.map((r) => [r.newArticle, r.name]));
      const prep = await prepararFotos(
        emparejado.pares,
        (hechas, total) => setFotoProgreso({ hechas, total }),
        { descripcionDe: (i) => nombrePorCodigo.get(emparejado.pares[i].codigo) },
      );
      setFotoProgreso(null);

      const aoa = buildCatalogoAoa(catalogo, piezasLabel, (cod) => prep.conFoto.has(cod));
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      // ⚠️ Con la columna "Foto" adelante, New Article pasó del índice 1 al 2:
      // forzar el índice viejo dejaría los códigos en notación científica.
      forceTextCols(XLSX, ws as never, [2]);
      ws["!cols"] = aoa[0].map((_c, i) => ({
        wch: i === 0 ? ANCHO_COL_FOTO_WCH : i === 3 ? 26 : i === 2 ? 14 : 13,
      }));
      // Filas altas para que la foto entre; el encabezado queda como está.
      ws["!rows"] = aoa.map((_r, i) => (i === 0 ? {} : { hpt: ALTO_FILA_PT }));
      ws["!autofilter"] = { ref: filtroDesdeA1(aoa) };
      XLSX.utils.book_append_sheet(wb, ws, "Pedido");

      /* 🔴 EL ORDEN DE LOS DOS PARCHES DEL ZIP NO ES LIBRE: PRIMERO EL PANEL,
       * DESPUÉS LAS FOTOS.
       *
       * Los dos reescriben el ZIP, pero de formas incompatibles si se invierten:
       * `congelarEncabezadosXlsx` (dentro de `workbookBytes`) solo sabe tocar
       * entradas SIN COMPRIMIR —así las escribe SheetJS— y `incrustarFotosEnXlsx`
       * regenera el ZIP con JSZip en DEFLATE. Al revés, el panel se encontraría
       * con todo comprimido, fallaría ABIERTO y el archivo saldría sin fila fija
       * y sin que nadie se entere. En este orden, JSZip se limita a agregar las
       * partes del dibujo y el `<pane>` que ya está en la hoja viaja intacto. */
      const bytes = workbookBytes(wb);
      // Perezoso: `jszip` solo se descarga cuando de verdad hay fotos que pegar.
      const { incrustarFotosEnXlsx } = await import("@/lib/depurador/fotos-xlsx");
      const conFotos = await incrustarFotosEnXlsx(bytes, prep.fotos);
      // Se copia a un ArrayBuffer propio en vez de castear el Uint8Array: `Blob`
      // no acepta una vista sobre un buffer que TypeScript no puede probar que
      // sea `ArrayBuffer`, y un cast acá sería mentirle al compilador.
      const salida = new ArrayBuffer(conFotos.byteLength);
      new Uint8Array(salida).set(conFotos);
      saveAs(new Blob([salida], { type: XLSX_MIME }), nombre);

      const mb = salida.byteLength / 1048576;
      const falladas = prep.fallidas.length
        ? ` · ${prep.fallidas.length} foto(s) no se pudieron leer y quedaron en NO IMAGEN`
        : "";
      setResumenFotos(
        `Listo · ${textoEmparejado(prep.fotos.length, emparejado.pares.length)}${falladas} · el archivo pesa ${mb.toFixed(1)} MB`,
      );
    } finally {
      setFotoProgreso(null);
      setDownloading("");
    }
  };

  // Salida B — Plantilla Switch (una fila por artículo).
  const downloadSwitch = async () => {
    if (!items || downloading || quedoVacio) return;
    if (divisorBloqueaDescarga) return; // 🔴 un divisor fuera de rango no baja un Excel 100× mal
    setDownloading("switch");
    try {
      const XLSX = (await import("xlsx-js-style")).default;
      const aoa = buildSwitchAoa(switchRows);
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      // Código(0), Referencia(1), Código Barra(2) forzados a texto (igual que el Depurador).
      forceTextCols(XLSX, ws as never, TEXT_COLS);
      ws["!cols"] = aoa[0].map((_c, i) => ({ wch: i === 3 ? 26 : i < 3 ? 16 : 13 }));
      // 🔴 FILTRO DESDE A1 + FILA DE ENCABEZADOS FIJA (el contenido de las 25
      // columnas no se toca: lo único que se agrega es el `<autoFilter>`).
      ws["!autofilter"] = { ref: filtroDesdeA1(aoa) };
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "upload");
      // 🔴 UNA sola escritura: lo que baja al disco y lo que guarda el
      // Historial son los MISMOS bytes. Y salen por `workbookBlob`, el camino
      // común de todo export.
      const nombre = `Plantilla_Switch_ActiveShoes_${temporada}.xlsx`;
      const blob = workbookBlob(wb);
      saveAs(blob, nombre);
      // Historial: SOLO la plantilla Switch (el pedido para cliente no se guarda).
      if (onDownloaded) {
        const t = computeTotales(switchRows);
        onDownloaded({
          empresa: "Active Shoes",
          marca: t.marca || "Reebok",
          cantidad_estilos: t.cantidad_estilos,
          total_unidades: t.total_unidades,
          total_costo: t.total_costo,
          archivo: { blob, nombre },
        });
      }
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

      {/* 🔴 CUÁL DE LOS DOS ARCHIVOS SE SUBIÓ. Se dice SIEMPRE, no solo en modo
          dispatcher: son dos documentos distintos del proveedor y de cada uno
          sale un costo distinto. La confirmación es lo que va a llegar; el
          despacho, lo que llegó. */}
      {items && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-800">
          <span className="rounded bg-red-600 px-1.5 py-0.5 text-[11px] font-bold text-white">REEBOK</span>
          <span>
            <b>{ROTULO_FORMATO[formato]}</b>
            {fileName ? <> · {fileName}</> : null}
          </span>
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

          {/* 🩸 LAS CATEGORÍAS QUE LE FALTAN AL CATÁLOGO (17-sep-2026).
              Medido: este aviso marcaba 30 de 75 artículos —T-SHIRTS 22 · BRA 3
              · TOPS 3 · JACKETS 2— y pedía «revísalos». **No había nada que
              revisar**: esas categorías vienen BIEN en el archivo de Reebok y
              el que no las conoce es el catálogo de la web. Con el 40 % de la
              lista en ámbar y sin nada que hacer, la próxima vez nadie lo lee.
              Ahora dice lo que hay que hacer, una sola vez, y sin ámbar. */}
          {faltanCategorias && (
            <div
              className="mb-4 rounded-lg border border-stone-300 bg-stone-50 px-4 py-3 text-sm text-stone-700"
              data-categorias-que-faltan={faltanCategorias.categorias.join(",")}
            >
              <b className="font-semibold text-stone-900">
                {plural(faltanCategorias.categorias.length, "Falta", "Faltan")}{" "}
                {faltanCategorias.categorias.length}{" "}
                {plural(faltanCategorias.categorias.length, "categoría", "categorías")} en el catálogo.
              </b>{" "}
              {listaConY(faltanCategorias.categorias)}{" "}
              {plural(faltanCategorias.categorias.length, "viene", "vienen")} bien en el archivo, pero el
              catálogo todavía no {plural(faltanCategorias.categorias.length, "la", "las")} conoce: esos{" "}
              {faltanCategorias.productos} productos saldrían sin categoría, y sin categoría el bulto se
              cobra de 6 y no de 12.
              <CopiarCategorias categorias={faltanCategorias.categorias} />
            </div>
          )}

          {/* 🩸 Department y GENDER que el catálogo NO va a saber traducir.
              ⚠️ ESTE AVISO NO CAMBIÓ: aquí el valor SÍ puede venir mal del
              proveedor, así que sigue pidiendo que se revise antes de subir.
              AVISA, NO CORRIGE: el archivo sale con el valor del proveedor. */}
          {aRevisar.length > 0 && (
            <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <span aria-hidden>!</span>
              <div>
                <b className="font-semibold">
                  {aRevisar.length} valor(es) de Department/GENDER que el catálogo no conoce.
                </b>{" "}
                Estos artículos van a quedar sin categoría o sin género en el catálogo, y un producto
                sin categoría se cobra por bulto de 6 y no de 12. Revísalos antes de subir el archivo:
                <ul className="ml-4 mt-1.5 list-disc">
                  {aRevisar.slice(0, 8).map((v, i) => (
                    <li key={i}>
                      <b>{v.columna}</b> «{v.valor}» — {v.articulos.length} artículo(s):{" "}
                      {v.articulos.slice(0, 3).join(", ")}{v.articulos.length > 3 ? "…" : ""}
                    </li>
                  ))}
                </ul>
                {aRevisar.length > 8 && <div className="mt-1">…y {aRevisar.length - 8} más.</div>}
              </div>
            </div>
          )}

          {/* 🔴 LAS COLUMNAS QUE NO VINIERON, Y DE DÓNDE SALIÓ CADA COSA.
              Daniel: «que el sistema acepte este excel, y cuando llegue con lo
              otro ya sepa y me lo acepte también sin tener que estar
              reconfigurando». El archivo entra igual: esto NO es un error, es
              decir qué regla de respaldo se usó. */}
          {ausentes.length > 0 && (
            /* 🔑 ARRANCA PLEGADA. Es correcta y NO hay que actuar sobre ella:
               abierta ocupaba media pantalla arriba de los avisos que sí piden
               algo. El resumen dice todo lo que hace falta de un vistazo y el
               detalle se abre al tocarlo. */
            <details className="group mb-4 rounded-lg border border-stone-300 bg-stone-50 px-4 py-2.5 text-sm text-stone-700">
              <summary className="cursor-pointer list-none select-none">
                <b className="font-semibold text-stone-900">
                  Este despacho no trae {ausentes.length} {plural(ausentes.length, "columna", "columnas")}
                </b>
                {" · "}
                {listaConY(ausentes.map((c) => c.rotulo))}
                <span className="ml-1 text-stone-400 transition group-open:hidden" aria-hidden>⌄</span>
              </summary>
              <div className="mt-2">
                El archivo entra igual; esto es de dónde salió cada dato:
                <ul className="ml-4 mt-1.5 list-disc">
                  {ausentes.map((c) => (
                    <li key={c.rotulo}><b>{c.rotulo}</b> — {c.respaldo}</li>
                  ))}
                </ul>
              </div>
            </details>
          )}

          {/* El segmento de negocio es de donde sale la Marca de Switch. Si no
              dice FTW, APP ni ACC HW, NO se adivina: la fila sale con la Marca
              vacía y acá se dice con el valor crudo. */}
          {segmentosRaros.length > 0 && (
            <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <span aria-hidden>!</span>
              <div>
                <b className="font-semibold">
                  {segmentosRaros.length} «Segmento de negocio» que no dice FTW, APP ni ACC HW.
                </b>{" "}
                Esos artículos salen con la <b>Marca</b> vacía y hay que ponérsela en Switch:
                <ul className="ml-4 mt-1.5 list-disc">
                  {segmentosRaros.slice(0, 8).map((v) => (
                    <li key={v.valor}>
                      «{v.valor}» — {v.articulos.length} artículo(s):{" "}
                      {v.articulos.slice(0, 3).join(", ")}{v.articulos.length > 3 ? "…" : ""}
                    </li>
                  ))}
                </ul>
                {segmentosRaros.length > 8 && <div className="mt-1">…y {segmentosRaros.length - 8} más.</div>}
              </div>
            </div>
          )}

          {/* Config de salida */}
          <div className="mb-4 grid grid-cols-1 gap-3 rounded-xl border border-stone-200 bg-white p-4 sm:grid-cols-3">
            <Field label="¿Qué quieres generar?">
              <div className="flex overflow-hidden rounded-lg border border-stone-300">
                <PriceBtn active={salida === "catalogo"} onClick={() => setSalida("catalogo")} label="Pedido para cliente" />
                <PriceBtn active={salida === "switch"} onClick={() => setSalida("switch")} label="Plantilla Switch" last />
              </div>
            </Field>
            {formato === "confirmacion" ? (
              <Field label="Columna de piezas (mes)">
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
            ) : (
              /* En el despacho no hay nada que elegir: la cantidad es la que
                 llegó, y por eso se DICE en vez de preguntarse. */
              <Field label="Piezas" note="Es lo que llegó, no una proyección.">
                <div className="rounded-lg border border-stone-300 bg-stone-50 px-3 py-2 text-sm text-stone-900">
                  Quantity (del despacho)
                </div>
              </Field>
            )}
            {/* 🔴 EL FLETE MUEVE PLATA: Costo FOB × flete = Costo CIF, y del CIF
                sale el precio. Daniel: «tengo que pagar el flete que es 1.1 y
                1.15 en reebok». SON DOS BOTONES Y NO UN CAMPO: un «11» tecleado
                donde va «1.1» mandaría a Switch costos diez veces mal. */}
            <Field
              label="Flete (Costo CIF)"
              note={flete === fleteDefault ? "Costo FOB × flete = Costo CIF." : `Costo FOB × flete = Costo CIF. Por defecto es ${etiquetaFlete(fleteDefault)}.`}
            >
              <div className="flex overflow-hidden rounded-lg border border-stone-300">
                {FLETE_OPCIONES.map((f, i) => (
                  <PriceBtn
                    key={f}
                    active={flete === f}
                    onClick={() => setFlete(f)}
                    label={etiquetaFlete(f)}
                    last={i === FLETE_OPCIONES.length - 1}
                  />
                ))}
              </div>
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
            <FormulaRow label="Precio A" f={formulaA} onChange={setFormulaA} onSave={() => saveFormula("A")} saving={savingF === "A"} flashed={flashF === "A"} divisorMsg={msgFormulaA} />
            <FormulaRow label="Precio B" f={formulaB} onChange={setFormulaB} onSave={() => saveFormula("B")} saving={savingF === "B"} flashed={flashF === "B"} divisorMsg={msgFormulaB} />

            {/* El flete que viene PUESTO. Vive en la base, no en este navegador:
                lo que Daniel deje acá lo ve también la secretaria. */}
            <div className="mt-2.5 flex flex-wrap items-center gap-3 border-t border-stone-200 pt-2.5">
              <span className="text-[13px] font-semibold text-stone-700">Flete por defecto</span>
              <div className="flex overflow-hidden rounded-lg border border-stone-300">
                {FLETE_OPCIONES.map((f, i) => (
                  <PriceBtn
                    key={f}
                    active={fleteDefault === f}
                    onClick={() => guardarFleteDefault(f)}
                    label={etiquetaFlete(f)}
                    last={i === FLETE_OPCIONES.length - 1}
                  />
                ))}
              </div>
              <span className="text-[12px] text-stone-500">
                {guardandoFlete ? "Guardando…" : flashFlete ? "Listo, guardado" : "Es el que viene puesto arriba, para todo el equipo."}
              </span>
            </div>
            {errorFlete && <p className="mt-1 text-[12px] font-semibold text-red-700">{errorFlete}</p>}
          </div>

          {/* Excepciones por modelo (Name): fórmula propia o precio fijo (gana a la marca) */}
          <div className="mb-4 overflow-hidden rounded-xl border border-stone-200 bg-white">
            <button
              type="button" onClick={() => setExcOpen((o) => !o)}
              className="flex w-full items-center justify-between gap-2 px-3.5 py-2.5 text-left"
            >
              <span className="flex items-center gap-2">
                <span className="text-stone-400">{excOpen ? "▾" : "▸"}</span>
                <span className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">Precios por modelo (Name)</span>
              </span>
              <span className="text-[11px] text-stone-500">
                {conExc > 0 ? <span className="rounded bg-red-50 px-1.5 py-0.5 font-semibold text-red-700">{conExc} con precio propio</span> : `${namesPresent.length} modelos · todos heredan`}
              </span>
            </button>
            {excOpen && (
              <div className="border-t border-stone-200 p-3">
                {/* Jerarquía de precios: se aprende una vez → ⓘ. */}
                <div className="mb-2 -ml-2">
                  <Ayuda titulo="Qué gana a qué" etiqueta="Qué gana a qué">
                    <p>
                      Vacío = hereda la fórmula de marca. <b>Precio fijo</b> gana a todo. El precio del
                      modelo aplica a Precio A, Precio B y a la plantilla Switch.
                    </p>
                  </Ayuda>
                </div>
                <input
                  value={excFilter} onChange={(e) => setExcFilter(e.target.value)} placeholder="Buscar modelo…"
                  className="mb-2 w-full max-w-xs rounded-md border border-stone-300 bg-white px-2.5 py-1.5 text-[13px] focus:border-red-600 focus:outline-none focus:ring-2 focus:ring-red-600/20"
                />
                <div className="max-h-72 overflow-auto">
                  <div className="grid grid-cols-[minmax(0,1fr)_92px_70px_54px_86px_72px] items-center gap-2 px-1 pb-1 text-[10px] font-semibold uppercase tracking-wide text-stone-400">
                    <span>Modelo</span><span>Modo</span><span className="text-right">÷ / Fijo</span><span className="text-right">Extra</span><span>Redondeo</span><span></span>
                  </div>
                  {namesFiltered.map((name) => {
                    const r = nameRowFor(name);
                    const nameMsg = msgDeName(r);
                    return (
                      <div key={name} className={`grid grid-cols-[minmax(0,1fr)_92px_70px_54px_86px_72px] items-center gap-2 px-1 py-0.5 ${r.propia ? "bg-red-50/40" : "hover:bg-stone-50"}`}>
                        <span className={`truncate text-[13px] ${r.fija ? "font-semibold text-red-700" : r.propia ? "font-medium text-red-600" : "text-stone-700"}`} title={name}>
                          {name}
                          {r.fija && <span className="ml-1 rounded bg-red-100 px-1 py-0.5 text-[9px] font-semibold text-red-800">fijo</span>}
                        </span>
                        <select value={r.modo} onChange={(e) => patchName(name, { modo: e.target.value as NameMode })} className={miniSelectCls}>
                          <option value="formula">Fórmula</option>
                          <option value="fijo">Precio fijo</option>
                        </select>
                        {r.modo === "fijo" ? (
                          <input type="number" step="0.01" value={r.precioFijo ?? ""} placeholder="$" aria-label={`Precio fijo ${name}`}
                            onChange={(e) => patchName(name, { precioFijo: e.target.value === "" ? null : Number(e.target.value) })}
                            className={`${miniInputCls} w-full border-red-300 text-left`} />
                        ) : (
                          <div>
                            <input type="number" step="0.01" value={r.divisor || ""} placeholder="—" aria-label={`Divisor ${name}`}
                              aria-invalid={nameMsg !== null}
                              onChange={(e) => patchName(name, { divisor: Number(e.target.value) || 0 })}
                              className={nameMsg !== null
                                ? `${miniInputCls} w-full border-red-400 bg-red-50 text-red-900 focus:border-red-500 focus:ring-red-500/20`
                                : `${miniInputCls} w-full`} />
                            {nameMsg !== null && (
                              <div className="mt-0.5 text-[12px] font-semibold text-red-700">{nameMsg}</div>
                            )}
                          </div>
                        )}
                        {r.modo === "fijo" ? <span /> : (
                          <select value={r.extra} onChange={(e) => patchName(name, { extra: parseInt(e.target.value) })} className={`${miniSelectCls} w-full`} aria-label={`Extra ${name}`}>
                            {[0, 1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                          </select>
                        )}
                        {r.modo === "fijo" ? <span /> : (
                          <select value={r.redondeo} onChange={(e) => patchName(name, { redondeo: e.target.value as Redondeo })} className={`${miniSelectCls} w-full`} aria-label={`Redondeo ${name}`}>
                            <option value="int">Entero</option>
                            <option value="half">.50</option>
                            <option value="par">Par</option>
                          </select>
                        )}
                        <span className="whitespace-nowrap">
                          <button type="button" onClick={() => saveName(name)} disabled={savingName === name || nameMsg !== null}
                            className="rounded-md px-1.5 py-1 text-[12px] font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-50">
                            {savingName === name ? "…" : r.dirty ? "Guardar" : "✓"}
                          </button>
                          {flashName === name && <span className="ml-1 text-[11px] font-semibold text-emerald-600">✓</span>}
                        </span>
                      </div>
                    );
                  })}
                  {namesFiltered.length === 0 && <div className="px-1 py-3 text-center text-[12px] text-stone-400">Sin modelos que coincidan.</div>}
                </div>
              </div>
            )}
          </div>

          {/* Fotos del pedido — solo aplica al Excel para el cliente. La plantilla
              Switch no lleva fotos (se sube a Switch, no la mira nadie). */}
          {salida === "catalogo" && (
            <div className="mb-4 rounded-xl border border-stone-200 bg-white p-3.5">
              {/* 12 px y no los 11 de los rótulos vecinos: es texto NUEVO y la
                  regla de los 3 anchos es que nada nuevo baje de 12 px. */}
              <div className="mb-2.5 text-[12px] font-semibold uppercase tracking-wide text-stone-500">
                Fotos del pedido (opcional)
              </div>
              <input
                ref={carpetaRef}
                type="file"
                accept="image/jpeg"
                multiple
                className="hidden"
                aria-label="Carpeta de fotos"
                onChange={(e) => {
                  const lista = e.target.files ? Array.from(e.target.files) : [];
                  setResumenFotos("");
                  setFotosArchivos(lista.length ? lista : null);
                }}
                {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
              />
              {!emparejado ? (
                <>
                  <button
                    type="button"
                    onClick={() => carpetaRef.current?.click()}
                    className="min-h-[44px] rounded-md border border-stone-300 bg-white px-4 text-sm font-semibold text-stone-900 transition hover:border-red-600 hover:text-red-700 active:scale-[0.97]"
                  >
                    Elegir carpeta de fotos
                  </button>
                  <div className="mt-2 text-[12px] text-stone-500">
                    Cada foto tiene que llamarse igual que el código: <b>100262385.jpg</b>.
                    Si no eliges carpeta, el Excel sale como siempre.
                  </div>
                </>
              ) : (
                <>
                  <div className="text-[13px] text-stone-700">
                    <b className="font-semibold text-stone-900">
                      {fotosIndice!.indice.size.toLocaleString()} fotos
                    </b>{" "}
                    en la carpeta · {textoEmparejado(emparejado.conFoto, emparejado.pares.length)}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => carpetaRef.current?.click()}
                      className="min-h-[44px] rounded-md border border-stone-300 bg-white px-4 text-sm font-semibold text-stone-900 transition hover:border-red-600 hover:text-red-700 active:scale-[0.97]"
                    >
                      Cambiar carpeta
                    </button>
                    <button
                      type="button"
                      onClick={quitarFotos}
                      className="min-h-[44px] rounded-md border border-stone-300 bg-white px-4 text-sm font-semibold text-stone-600 transition hover:border-stone-400 active:scale-[0.97]"
                    >
                      Quitar fotos
                    </button>
                  </div>
                  <div className="mt-2 text-[12px] text-stone-500">
                    Las fotos se leen de tu computadora y <b>no se suben a ningún lado</b>: se
                    achican y se pegan dentro del Excel que descargas.
                  </div>
                </>
              )}
              {resumenFotos && (
                <div className="mt-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px] font-medium text-emerald-800">
                  {resumenFotos}
                </div>
              )}
            </div>
          )}

          {formato === "confirmacion" && monthColIdx === -1 && (
            <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-[13px] font-medium text-amber-800">
              No detecté una columna de mes. Elige arriba cuál tiene las piezas por artículo.
              Mientras tanto todo sale con 0 piezas y <b>se incluyen todos los artículos</b>,
              porque no hay forma de saber cuáles pidió el proveedor.
            </div>
          )}
          {quedoVacio && (
            <div className="mb-4 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-[13px] font-medium text-red-800">
              {formato === "despacho"
                ? "Ningún artículo del despacho trae piezas recibidas, así que el archivo saldría vacío y no se puede descargar. Revisa que el archivo sea el correcto."
                : `Ningún artículo tiene piezas en ${monthLabel || "el mes elegido"}, así que el archivo saldría vacío y no se puede descargar. Revisa arriba si la columna de piezas es la correcta.`}
            </div>
          )}
          {salida === "switch" && revisar > 0 && (
            <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-[13px] font-medium text-amber-800">
              {revisar} {plural(revisar, "artículo", "artículos")} en ámbar: no se halló la talla-muestra exacta (9/7) y se usó la más cercana. Revísalos.
            </div>
          )}

          {/* Stats + acción */}
          <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-stone-200 bg-white px-4 py-2.5 text-[13px] text-stone-600">
            <span><b className="font-semibold text-stone-900">{vista.articulos}</b> artículos</span>
            <span className="text-stone-300">·</span>
            <span><b className="font-semibold text-stone-900">{vista.skus.toLocaleString()}</b> tallas/SKUs</span>
            <span className="text-stone-300">·</span>
            <span><b className="font-semibold text-stone-900">{vista.piezas.toLocaleString()}</b> piezas{piezasLabel ? ` (${piezasLabel})` : ""}</span>
            {/* 🔴 El costo del archivo: es el número con el que se cuadra contra
                la factura del proveedor. Mismas filas que el Excel. */}
            <CostoDelArchivo costo={costo} />
            <FacturasDelArchivo facturas={facturas} />
            <div className="ml-auto flex flex-wrap gap-2">
              <button
                onClick={handleDownload}
                disabled={!!downloading || quedoVacio || divisorBloqueaDescarga}
                className="rounded-md bg-red-600 px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-red-700 active:scale-[0.97] disabled:cursor-not-allowed disabled:bg-stone-300"
              >
                {fotoProgreso
                  ? `Achicando fotos… ${fotoProgreso.hechas} de ${fotoProgreso.total}`
                  : downloading
                    ? "Generando…"
                    : salida === "catalogo"
                      ? emparejado ? "Descargar pedido con fotos" : "Descargar pedido"
                      : ROTULO_DESCARGAR_PLANTILLA}
              </button>
              <button
                onClick={reset}
                className="rounded-md border border-stone-300 bg-white px-3 py-1.5 text-sm font-semibold text-stone-900 transition hover:border-red-600 hover:text-red-700 active:scale-[0.97]"
              >
                {ROTULO_SUBIR_OTRO_ARCHIVO}
              </button>
            </div>
          </div>

          {/* Qué va a pasar al subir el archivo: lo nuevo se crea, lo que ya
              está se pisa. Falla ABIERTA: sin dato, no se dibuja nada. */}
          <NuevosEnSwitch contra={nuevosEnSwitch} />

          {/* Aviso discreto: no se perdió nada, simplemente no se pidieron esas piezas */}
          {vista.omitidos > 0 && (
            <div className="mb-3 px-1 text-[12px] text-stone-500">
              {vista.omitidos.toLocaleString()} artículo{vista.omitidos === 1 ? "" : "s"} sin piezas
              {formato === "despacho" ? " recibidas" : ` en ${monthLabel || "el mes elegido"}`} no se {vista.omitidos === 1 ? "incluyó" : "incluyeron"}.
            </div>
          )}

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

function FormulaRow({ label, f, onChange, onSave, saving, flashed, divisorMsg }: {
  label: string; f: PriceFormula; onChange: (f: PriceFormula) => void;
  onSave: () => void; saving: boolean; flashed: boolean;
  /** Mensaje del guard del divisor (mensajeDivisorEnPantalla). null = válido. */
  divisorMsg: string | null;
}) {
  return (
    <div className="py-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-20 text-[13px] font-semibold text-stone-900">{label}</span>
        <label className="text-[11px] text-stone-500">÷</label>
        <input
          type="number" step="0.01" value={f.divisor || ""}
          aria-invalid={divisorMsg !== null}
          onChange={(e) => onChange({ ...f, divisor: Number(e.target.value) || 0 })}
          className={divisorMsg !== null
            ? `${miniInputCls} border-red-400 bg-red-50 text-red-900 focus:border-red-500 focus:ring-red-500/20`
            : miniInputCls}
          aria-label={`Divisor ${label}`}
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
          type="button" onClick={onSave} disabled={saving || divisorMsg !== null}
          className="rounded-md px-2.5 py-1 text-[12px] font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-50"
        >
          {saving ? "Guardando…" : "Guardar"}
        </button>
        {flashed && <span className="text-[11px] font-semibold text-emerald-600">✓</span>}
      </div>
      {/* Fuera de rango: se dice y se apaga la descarga — el tecleo no se traba. */}
      {divisorMsg !== null && (
        <p className="mt-1 text-[12px] font-semibold text-red-700">{divisorMsg}</p>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 🔴 EL BOTÓN DICE LO QUE HACE, Y NO PUEDE DECIR «AGREGARLAS AL CATÁLOGO».
 *
 * Las categorías del catálogo Reebok NO viven en una tabla ni en una pantalla:
 * son un mapa del código —`CATEGORIA_POR_RUBRO` en
 * `src/lib/reebok-clasificacion.ts`, con su espejo `REEBOK_CATEGORY_ESPERADAS`
 * en `reebok.ts` y un candado que compara las dos listas—. No hay ninguna
 * pantalla a la que llevar a nadie, así que un botón «Agregarlas al catálogo»
 * sería un botón que promete algo que no pasa.
 *
 * Lo que sí sirve, y es verdad, es llevarse la lista exacta. El aviso ya dice
 * qué hay que hacer; esto es para pedirlo sin transcribir a mano.
 *
 * ⚠️ DECISIÓN PENDIENTE DE DANIEL: volver ese mapa una tabla administrable (y
 * entonces sí, un botón que agregue) o dejarlo en el código. Hasta que eso se
 * decida, el botón no miente.
 * ══════════════════════════════════════════════════════════════════════════ */
function CopiarCategorias({ categorias }: { categorias: readonly string[] }) {
  const [copiado, setCopiado] = useState(false);
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(categorias.join(", "));
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Sin portapapeles (navegador viejo o permiso negado) no pasa nada: la
      // lista está a la vista, arriba, en el mismo aviso.
    }
  };
  return (
    <button
      type="button"
      onClick={copiar}
      className="ml-2 rounded-md border border-stone-300 bg-white px-2 py-0.5 text-[12px] font-semibold text-stone-700 transition hover:border-stone-400 active:scale-[0.97]"
    >
      {copiado ? "Copiado" : `Copiar ${plural(categorias.length, "la categoría", "las categorías")}`}
    </button>
  );
}

function PriceBtn({ active, onClick, label, last }: { active: boolean; onClick: () => void; label: string; last?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-[44px] flex-1 px-3 py-2 text-sm font-semibold transition ${last ? "" : "border-r border-stone-300"} ${
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

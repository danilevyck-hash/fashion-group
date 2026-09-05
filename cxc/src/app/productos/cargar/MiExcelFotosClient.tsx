"use client";

// "Fotos a mi Excel" — el camino APARTE del Depurador.
//
// 🔴 NO REEMPLAZA AL PEDIDO DE REEBOK Y NO LO TOCA. Son dos caminos distintos:
// aquel arma el Excel (con su cálculo de precios) y le pega las fotos; éste NO
// calcula nada — toma el archivo que la persona sube y le escribe SOLO la
// columna A. Comparten el emparejador (`fotos-excel.ts`), el compresor
// (`prepararFotos` → `compressImage`) y el armador del zip (`fotos-xlsx.ts`):
// si se separaran, dos pantallas pegarían fotos distintas para el mismo código.

import { useMemo, useRef, useState } from "react";
import { UploadCloud } from "lucide-react";
import { saveAs } from "file-saver";
import { logActivityClient } from "@/lib/logActivityClient";
import {
  indexarFotos,
  parearFotos,
  textoEmparejado,
  TEXTO_SIN_FOTO,
} from "@/lib/depurador/fotos-excel";
import {
  extensionAceptada,
  filaAnclaDe,
  nombreDeSalida,
  planColumnaFoto,
} from "@/lib/depurador/excel-propio";
import { prepararFotos } from "./fotos-carpeta";
import { analizarLibro, armarLibroConFotos, celdaDeFilaExcel, type AnalisisLibro } from "./excel-propio-archivo";

const MIME_XLSM = "application/vnd.ms-excel.sheet.macroEnabled.12";
const MIME_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export default function MiExcelFotosClient() {
  const libroRef = useRef<HTMLInputElement>(null);
  const carpetaRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [leyendo, setLeyendo] = useState(false);
  const [analisis, setAnalisis] = useState<AnalisisLibro | null>(null);
  const [fotosArchivos, setFotosArchivos] = useState<File[] | null>(null);
  const [progreso, setProgreso] = useState<{ hechas: number; total: number } | null>(null);
  const [bajando, setBajando] = useState(false);
  const [resumen, setResumen] = useState("");
  const [error, setError] = useState("");

  // Índice de la carpeta: solo NOMBRES. No se lee el contenido de ningún archivo
  // que no termine emparejado con un código del Excel.
  const fotosIndice = useMemo(
    () => (fotosArchivos ? indexarFotos(fotosArchivos) : null),
    [fotosArchivos],
  );
  const emparejado = useMemo(
    () =>
      analisis && fotosIndice
        ? parearFotos(analisis.lectura.filas.map((f) => f.codigo), fotosIndice.indice)
        : null,
    [analisis, fotosIndice],
  );

  const cargarLibro = async (f: File) => {
    setError("");
    setResumen("");
    setFotosArchivos(null);
    if (carpetaRef.current) carpetaRef.current.value = "";
    if (!extensionAceptada(f.name)) {
      setAnalisis(null);
      setError("Ese archivo no es un Excel. Sube uno que termine en .xlsx o .xlsm.");
      return;
    }
    setLeyendo(true);
    try {
      const a = await analizarLibro(f);
      if (a.lectura.filas.length === 0) {
        setAnalisis(null);
        setError(
          "No encontré ningún código en la columna B. El código tiene que ir en la columna B, y la fila 1 es el encabezado.",
        );
        return;
      }
      setAnalisis(a);
    } catch (e) {
      setAnalisis(null);
      setError(e instanceof Error ? e.message : "No pude leer el archivo.");
    } finally {
      setLeyendo(false);
    }
  };

  const empezarDeNuevo = () => {
    setAnalisis(null);
    setFotosArchivos(null);
    setResumen("");
    setError("");
    if (libroRef.current) libroRef.current.value = "";
    if (carpetaRef.current) carpetaRef.current.value = "";
  };

  const descargar = async () => {
    if (!analisis || !emparejado || bajando) return;
    setBajando(true);
    setError("");
    setResumen("");
    const t0 = Date.now();
    try {
      const filas = analisis.lectura.filas;
      setProgreso({ hechas: 0, total: emparejado.conFoto });
      const prep = await prepararFotos(
        emparejado.pares,
        (hechas, total) => setProgreso({ hechas, total }),
        {
          // La fila REAL del archivo, 0-based (OOXML ancla así). El cálculo vive
          // en el módulo puro: hacerlo acá sería una segunda cuenta del mismo
          // número, y así es como la foto termina una fila más abajo.
          filaDe: (i) => filaAnclaDe(filas, i),
          // La celda es la del archivo de Daniel: su alto de fila y su ancho de
          // columna. Este camino no los cambia.
          celdaDe: (i) => {
            const c = celdaDeFilaExcel(analisis, filas[i].fila);
            return { caja: c.caja, ancho: c.ancho, alto: c.alto };
          },
        },
      );
      setProgreso(null);

      // Una foto que no se pudo leer sale de `conFoto`, así que su celda dice
      // NO IMAGEN — que es la verdad. Una celda vacía se vería igual que "se
      // pegó y no se nota".
      const plan = planColumnaFoto(filas, (codigo) => prep.conFoto.has(codigo));

      const bytes = await armarLibroConFotos(analisis, plan, prep.fotos);
      const salida = new ArrayBuffer(bytes.byteLength);
      new Uint8Array(salida).set(bytes);
      const nombre = nombreDeSalida(analisis.nombreArchivo, true);
      saveAs(new Blob([salida], { type: nombre.endsWith(".xlsm") ? MIME_XLSM : MIME_XLSX }), nombre);

      const mb = salida.byteLength / 1048576;
      const conFotoReal = filas.filter((f) => prep.conFoto.has(f.codigo)).length;
      const falladas = prep.fallidas.length
        ? ` · ${prep.fallidas.length} foto(s) no se pudieron leer y quedaron en ${TEXTO_SIN_FOTO}`
        : "";
      setResumen(
        `Listo · ${textoEmparejado(conFotoReal, filas.length)}${falladas} · el archivo pesa ${mb.toFixed(2)} MB · ${((Date.now() - t0) / 1000).toFixed(1)} s`,
      );

      // Rastro de USO (4-sep-2026): Daniel quiere saber en unas semanas si
      // este camino vale la pena. Solo cuenta — no sale en el Historial ni
      // guarda el archivo (las fotos nunca se suben; esto manda solo números).
      logActivityClient({
        action: "descarga_misfotos",
        module: "depurador",
        details: { filas: filas.length, con_foto: conFotoReal },
      });
    } catch (e) {
      setProgreso(null);
      setError(e instanceof Error ? e.message : "No se pudo armar el archivo.");
    } finally {
      setBajando(false);
    }
  };

  // ── pantalla ──────────────────────────────────────────────────────────────
  if (!analisis) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-6">
        <label
          onDragEnter={(e) => { e.preventDefault(); setDragging(true); }}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={(e) => { e.preventDefault(); setDragging(false); }}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (e.dataTransfer.files[0]) cargarLibro(e.dataTransfer.files[0]);
          }}
          className={`mb-3 flex cursor-pointer flex-col items-center rounded-xl border-2 border-dashed px-6 py-6 text-center transition ${
            dragging ? "border-teal-600 bg-teal-50" : "border-stone-300 bg-white hover:border-teal-600 hover:bg-teal-50"
          }`}
        >
          <UploadCloud className="mb-2 h-7 w-7 text-teal-800" strokeWidth={1.6} />
          <div className="text-base font-semibold text-stone-900">
            {leyendo ? "Leyendo archivo…" : "Suelta tu Excel aquí o haz clic para buscarlo"}
          </div>
          <input
            ref={libroRef}
            type="file"
            accept=".xlsx,.xlsm"
            className="hidden"
            onChange={(e) => { if (e.target.files?.[0]) cargarLibro(e.target.files[0]); }}
          />
        </label>
        <div className="rounded-xl border border-stone-200 bg-white p-3.5 text-[13px] leading-relaxed text-stone-700">
          <div className="mb-1.5 text-[12px] font-semibold uppercase tracking-wide text-stone-500">
            Cómo tiene que estar tu archivo
          </div>
          <ul className="list-disc space-y-1 pl-5">
            <li>Cada foto tiene que llamarse igual que el código: <b>100262385.jpg</b>.</li>
          </ul>
        </div>
        {error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
        )}
      </div>
    );
  }

  const { lectura, hojas, hoja } = analisis;
  const nombreSalida = nombreDeSalida(analisis.nombreArchivo, true);

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      {/* Qué se leyó del archivo */}
      <div className="mb-4 rounded-xl border border-stone-200 bg-white p-3.5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-[15px] font-semibold text-stone-900">{analisis.nombreArchivo}</div>
            <div className="mt-1 text-[13px] text-stone-700">
              Hoja <b>{hoja.nombre}</b> · <b>{lectura.filas.length.toLocaleString()}</b> códigos en la
              columna B{lectura.encabezadoCodigo ? ` (encabezado: «${lectura.encabezadoCodigo}»)` : ""}
            </div>
          </div>
          <button
            type="button"
            onClick={empezarDeNuevo}
            className="min-h-[44px] shrink-0 rounded-md border border-stone-300 bg-white px-4 text-sm font-semibold text-stone-600 transition hover:border-stone-400 active:scale-[0.97]"
          >
            Cambiar archivo
          </button>
        </div>
      </div>

      {/* Fotos */}
      <div className="mb-4 rounded-xl border border-stone-200 bg-white p-3.5">
        <div className="mb-2.5 text-[12px] font-semibold uppercase tracking-wide text-stone-500">
          Carpeta de fotos
        </div>
        <input
          ref={carpetaRef}
          type="file"
          accept="image/jpeg"
          multiple
          className="hidden"
          aria-label="Carpeta de fotos de mi Excel"
          onChange={(e) => {
            const lista = e.target.files ? Array.from(e.target.files) : [];
            setResumen("");
            setFotosArchivos(lista.length ? lista : null);
          }}
          {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
        />
        {!emparejado ? (
          <>
            <button
              type="button"
              onClick={() => carpetaRef.current?.click()}
              className="min-h-[44px] rounded-md border border-stone-300 bg-white px-4 text-sm font-semibold text-stone-900 transition hover:border-teal-600 hover:text-teal-700 active:scale-[0.97]"
            >
              Elegir carpeta de fotos
            </button>
            <div className="mt-2 text-[12px] text-stone-500">
              Cada foto tiene que llamarse igual que el código: <b>100262385.jpg</b>. Se comparan
              iguales, sin mayúsculas — nada de parecidos.
            </div>
          </>
        ) : (
          <>
            <div className="text-[13px] text-stone-700">
              <b className="font-semibold text-stone-900">{fotosIndice!.indice.size.toLocaleString()} fotos</b>{" "}
              en la carpeta · {textoEmparejado(emparejado.conFoto, emparejado.pares.length)}
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => carpetaRef.current?.click()}
                className="min-h-[44px] rounded-md border border-stone-300 bg-white px-4 text-sm font-semibold text-stone-900 transition hover:border-teal-600 hover:text-teal-700 active:scale-[0.97]"
              >
                Cambiar carpeta
              </button>
              <button
                type="button"
                onClick={() => { setFotosArchivos(null); setResumen(""); if (carpetaRef.current) carpetaRef.current.value = ""; }}
                className="min-h-[44px] rounded-md border border-stone-300 bg-white px-4 text-sm font-semibold text-stone-600 transition hover:border-stone-400 active:scale-[0.97]"
              >
                Quitar fotos
              </button>
            </div>
          </>
        )}
      </div>

      {/* 🔴 LO QUE VA A PASAR, ANTES DE DESCARGAR. Enterarse después no sirve. */}
      <div className="mb-4 rounded-xl border border-stone-200 bg-white p-3.5">
        <div className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-stone-500">
          Qué le va a pasar a tu archivo
        </div>
        <ul className="space-y-1.5 text-[13px] leading-relaxed text-stone-700">
          <li>
            {analisis.tieneMacro ? (
              <>
                Tu archivo <b>tiene macros y se conservan</b>: se descarga como{" "}
                <b>{nombreSalida.slice(nombreSalida.lastIndexOf("."))}</b>, igual que entró.
              </>
            ) : (
              <>
                Se descarga como <b>{nombreSalida.slice(nombreSalida.lastIndexOf("."))}</b>, igual que entró.
              </>
            )}
          </li>
        </ul>
      </div>

      {/* Avisos que dependen de ESTE archivo */}
      {hojas.length > 1 && (
        <Aviso>
          Tu archivo tiene <b>{hojas.length} hojas</b> y solo se toca la primera (<b>{hoja.nombre}</b>).
          Las demás salen igual que entraron.
        </Aviso>
      )}
      {analisis.yaTieneFotos && (
        <Aviso>
          Esta hoja <b>ya tiene fotos pegadas</b>. Se quitan las de antes y se pegan las de la carpeta
          que elijas.
        </Aviso>
      )}
      {lectura.filasConAOcupada.length > 0 && (
        <Aviso>
          <b>{lectura.filasConAOcupada.length}</b> celda(s) de la columna A tienen algo escrito y{" "}
          <b>se van a reemplazar</b> (es la columna de las fotos).
        </Aviso>
      )}
      {lectura.filasSinCodigo.length > 0 && (
        <Aviso>
          <b>{lectura.filasSinCodigo.length}</b> fila(s) no tienen código en la columna B: se dejan
          tal cual, sin foto y sin escribirles nada.
        </Aviso>
      )}

      {/* Descargar */}
      <div className="rounded-xl border border-stone-200 bg-white p-3.5">
        <button
          type="button"
          onClick={descargar}
          disabled={!emparejado || bajando}
          className="min-h-[44px] w-full rounded-md bg-teal-600 px-4 text-sm font-semibold text-white transition hover:bg-teal-700 active:scale-[0.99] disabled:opacity-50 sm:w-auto"
        >
          {bajando ? "Armando el archivo…" : "Descargar con las fotos pegadas"}
        </button>
        {!emparejado && (
          <div className="mt-2 text-[12px] text-stone-500">Falta: elegir la carpeta de fotos.</div>
        )}
        {progreso && (
          <div className="mt-2 text-[12px] text-stone-600">
            Achicando fotos… {progreso.hechas.toLocaleString()} de {progreso.total.toLocaleString()}
          </div>
        )}
        {resumen && (
          <div className="mt-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px] font-medium text-emerald-800">
            {resumen}
          </div>
        )}
        {error && (
          <div className="mt-2 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-[13px] font-medium text-red-800">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}

function Aviso({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-[13px] font-medium text-amber-800">
      {children}
    </div>
  );
}

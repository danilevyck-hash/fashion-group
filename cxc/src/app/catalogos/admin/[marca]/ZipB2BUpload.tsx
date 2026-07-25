"use client";

// "Subir ZIP del B2B" — Daniel arrastra el ZIP tal como lo baja del portal
// (27-78 MB, ~2,500 fotos).
//
// TODO el trabajo pesado pasa en el NAVEGADOR (ver zip-b2b-client.ts): el ZIP
// nunca se manda a un endpoint porque Vercel corta el body en ~4.5 MB. Aquí
// solo está la UI: zona de drop, progreso real ("120/250 procesadas") y el
// reporte final (asignadas · sin match · con foto elegida a mano).

import { useRef, useState } from "react";
import { getMarcaTheme, type AdminProducto, type MarcaUiKey } from "@/lib/catalogo/marcas-ui";
import type { ProgresoZip, ResultadoZip } from "@/lib/catalogos/zip-b2b-client";
import type { StorageMarcaKey } from "@/lib/catalogos/variantes-paths";

const FASE_LABEL: Record<ProgresoZip["fase"], string> = {
  leyendo: "Abriendo el ZIP…",
  procesando: "procesadas",
  subiendo: "subidas",
  guardando: "Guardando en el catálogo…",
  listo: "Listo",
};

export default function ZipB2BUpload({
  marca,
  products,
  onDone,
  showToast,
}: {
  marca: MarcaUiKey;
  /** Catálogo completo de la marca — de aquí salen los SKUs para el match. */
  products: AdminProducto[];
  onDone: () => Promise<void>;
  showToast: (msg: string) => void;
}) {
  const theme = getMarcaTheme(marca)!;
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [progreso, setProgreso] = useState<ProgresoZip | null>(null);
  const [resultado, setResultado] = useState<ResultadoZip | null>(null);
  const [error, setError] = useState<string | null>(null);
  const corriendo = progreso != null && progreso.fase !== "listo";

  async function procesar(file: File | null | undefined) {
    if (!file || corriendo) return;
    if (!/\.zip$/i.test(file.name)) {
      setError("Ese archivo no es un ZIP. Sube el ZIP tal como lo bajas del portal B2B.");
      return;
    }
    setError(null);
    setResultado(null);
    setProgreso({ fase: "leyendo", hechas: 0, total: 0 });
    try {
      // Import dinámico: JSZip y el pipeline de canvas no entran al bundle
      // inicial del admin (solo se cargan si de verdad se sube un ZIP).
      const { procesarZipB2B } = await import("@/lib/catalogos/zip-b2b-client");
      const res = await procesarZipB2B(file, {
        marca: marca as StorageMarcaKey,
        apiBase: theme.api,
        skusCatalogo: products.map((p) => p.sku || "").filter(Boolean),
        onProgreso: setProgreso,
      });
      setResultado(res);
      showToast(`${res.asignadas} fotos asignadas`);
      await onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo procesar el ZIP.");
      setProgreso(null);
    }
  }

  function reset() {
    setProgreso(null);
    setResultado(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  const pct =
    progreso && progreso.total > 0 ? Math.round((progreso.hechas / progreso.total) * 100) : null;

  return (
    <div className="mb-6 rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Subir ZIP del B2B</h3>
          <p className="text-xs text-gray-400">
            Arrastra el ZIP tal como lo bajas del portal. Se guardan todas las fotos de cada código y
            se elige la mejor automáticamente.
          </p>
        </div>
        {(resultado || error) && (
          <button onClick={reset} className="text-xs text-gray-400 hover:text-gray-700">
            Limpiar
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept=".zip,application/zip"
        className="hidden"
        onChange={(e) => procesar(e.target.files?.[0])}
      />

      {!corriendo && !resultado && (
        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); void procesar(e.dataTransfer.files?.[0]); }}
          className={`cursor-pointer rounded-lg border-2 border-dashed px-4 py-6 text-center transition ${
            dragOver ? "border-gray-500 bg-gray-50" : "border-gray-300 hover:border-gray-400"
          }`}
        >
          <svg className="w-7 h-7 mx-auto text-gray-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2h7M12 8h.01M12 12h.01M12 16h.01" />
          </svg>
          <p className="text-sm text-gray-600 font-medium">Arrastra el ZIP aquí o haz clic para seleccionarlo</p>
          <p className="text-xs text-gray-400 mt-0.5">Puede pesar 80 MB — se procesa en tu navegador, no se sube entero</p>
        </div>
      )}

      {progreso && progreso.fase !== "listo" && (
        <div className="rounded-lg border border-gray-200 px-4 py-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="w-4 h-4 border-2 border-gray-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm font-medium text-gray-700 tabular-nums">
              {progreso.fase === "procesando" || progreso.fase === "subiendo"
                ? `${progreso.hechas}/${progreso.total} ${FASE_LABEL[progreso.fase]}`
                : FASE_LABEL[progreso.fase]}
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
            <div
              className="h-full bg-gray-800 transition-all duration-200"
              style={{ width: `${pct ?? 4}%` }}
            />
          </div>
          <p className="text-xs text-gray-400 mt-2">No cierres esta pestaña hasta que termine.</p>
        </div>
      )}

      {error && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50/50 px-4 py-3">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {resultado && (
        <div className="rounded-lg border border-gray-200 divide-y divide-gray-100">
          <div className="px-4 py-3 flex flex-wrap gap-2 text-xs">
            <span className="px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 font-medium">
              {resultado.asignadas} fotos asignadas
            </span>
            {resultado.manuales > 0 && (
              <span className="px-2 py-1 rounded-full bg-blue-50 text-blue-700 font-medium">
                {resultado.manuales} ya tenían foto elegida a mano
              </span>
            )}
            {resultado.sinMatch.length > 0 && (
              <span className="px-2 py-1 rounded-full bg-amber-50 text-amber-700 font-medium">
                {resultado.sinMatch.length} códigos sin producto
              </span>
            )}
            <span className="px-2 py-1 rounded-full bg-gray-100 text-gray-600 font-medium">
              {resultado.variantesSubidas} fotos guardadas
            </span>
          </div>

          {resultado.sinMatch.length > 0 && (
            <div className="px-4 py-3">
              <p className="text-xs font-medium text-amber-700 mb-1">
                Códigos del ZIP que no existen en el catálogo:
              </p>
              <div className="max-h-32 overflow-y-auto text-[11px] font-mono text-gray-500 leading-relaxed">
                {resultado.sinMatch.join(" · ")}
              </div>
            </div>
          )}

          {resultado.errores.length > 0 && (
            <div className="px-4 py-3">
              <p className="text-xs font-medium text-red-600 mb-1">No se pudieron guardar:</p>
              <ul className="max-h-32 overflow-y-auto text-[11px] text-red-700 space-y-0.5">
                {resultado.errores.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            </div>
          )}

          <div className="px-4 py-3">
            <button onClick={reset} className="text-sm text-gray-500 hover:text-gray-800">
              Subir otro ZIP
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

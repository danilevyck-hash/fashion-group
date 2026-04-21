"use client";

// Fase 2: las marcas se asignan A NIVEL FACTURA (no proyecto).
// El form expone 2 modos:
//   - "Una sola marca al 100%"
//   - "Dividir entre varias marcas"
// Al guardar, el caller recibe marcasSeleccionadas: [{marcaId, porcentaje}] y
// debe invocar setMarcasDeFactura(facturaId, marcas) después de crear/editar
// la fila en mk_facturas.

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  MarcaPorcentajeInput,
  MkFactura,
  MkMarca,
  ProyectoConMarcas,
} from "@/lib/marketing/types";
import { useToast } from "@/components/ToastSystem";
import { AutocompleteInput } from "./AutocompleteInput";
import { PasoInstruccion } from "./PasoInstruccion";
import { PdfUploader, UploadResult } from "./PdfUploader";
import { formatearMonto } from "@/lib/marketing/normalizar";

export interface FacturaFormValues {
  numeroFactura: string;
  fechaFactura: string;
  proveedor: string;
  concepto: string;
  subtotal: number;
  itbms: number;
  marcasSeleccionadas: MarcaPorcentajeInput[];
}

interface FacturaFormProps {
  proyecto: ProyectoConMarcas;
  marcasCatalogo: MkMarca[];
  initial?: Partial<MkFactura>;
  initialMarcas?: MarcaPorcentajeInput[];
  onSubmit: (data: FacturaFormValues, pdfFile?: File) => Promise<void>;
  onCancel?: () => void;
  onUploadPdfForIA?: (file: File) => Promise<string | null>;
}

type ItbmsOption = "0" | "7";
type ModoMarca = "una" | "varias";

async function fetchProveedorSuggestions(_q: string): Promise<string[]> {
  return [];
}
async function fetchConceptoSuggestions(_q: string): Promise<string[]> {
  return [];
}

function isoHoy(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

interface RespuestaIA {
  numero_factura: string | null;
  fecha_factura: string | null;
  proveedor: string | null;
  concepto: string | null;
  subtotal: number | null;
  itbms_pct: 0 | 7 | null;
}

export function FacturaForm({
  proyecto,
  marcasCatalogo,
  initial,
  initialMarcas,
  onSubmit,
  onCancel,
  onUploadPdfForIA,
}: FacturaFormProps) {
  const { toast } = useToast();

  const [numeroFactura, setNumeroFactura] = useState<string>(
    initial?.numero_factura ?? "",
  );
  const [fechaFactura, setFechaFactura] = useState<string>(
    initial?.fecha_factura ?? isoHoy(),
  );
  const [proveedor, setProveedor] = useState<string>(initial?.proveedor ?? "");
  const [concepto, setConcepto] = useState<string>(initial?.concepto ?? "");
  const [subtotalStr, setSubtotalStr] = useState<string>(
    initial?.subtotal != null ? String(initial.subtotal) : "",
  );
  const [itbmsOption, setItbmsOption] = useState<ItbmsOption>(() => {
    if (initial?.subtotal && initial?.itbms) {
      const pct = (Number(initial.itbms) / Number(initial.subtotal)) * 100;
      if (pct > 3.5) return "7";
    }
    return "0";
  });
  const [pdfFile, setPdfFile] = useState<File | undefined>(undefined);
  const [pdfSubido, setPdfSubido] = useState(false);
  const [leyendoIA, setLeyendoIA] = useState(false);
  const [enviando, setEnviando] = useState(false);

  // ── Marcas ──
  // Decidir modo inicial según initialMarcas / legacy del proyecto
  const marcasBase: MarcaPorcentajeInput[] = useMemo(() => {
    if (initialMarcas && initialMarcas.length > 0) {
      return initialMarcas.map((m) => ({
        marcaId: m.marcaId,
        porcentaje: m.porcentaje,
      }));
    }
    // Proyectos viejos traen marcas en proyecto.marcas (legacy).
    if (proyecto.marcas && proyecto.marcas.length > 0) {
      return proyecto.marcas.map((m) => ({
        marcaId: m.marca.id,
        porcentaje: m.porcentaje,
      }));
    }
    return [];
  }, [initialMarcas, proyecto.marcas]);

  const modoInicial: ModoMarca =
    marcasBase.length === 1 && Math.abs(marcasBase[0].porcentaje - 100) < 0.01
      ? "una"
      : marcasBase.length > 1
        ? "varias"
        : "una";

  const [modoMarca, setModoMarca] = useState<ModoMarca>(modoInicial);
  // Una sola marca: sin preselección según decisión del producto.
  const [marcaUnica, setMarcaUnica] = useState<string>(
    marcasBase.length === 1 ? marcasBase[0].marcaId : "",
  );
  const [marcasMulti, setMarcasMulti] = useState<MarcaPorcentajeInput[]>(
    marcasBase.length > 1
      ? marcasBase
      : marcasBase.length === 1
        ? [marcasBase[0], { marcaId: "", porcentaje: 0 }]
        : [
            { marcaId: "", porcentaje: 50 },
            { marcaId: "", porcentaje: 50 },
          ],
  );

  const subtotal = Number(subtotalStr) || 0;
  const itbms = useMemo(
    () => (itbmsOption === "7" ? round2(subtotal * 0.07) : 0),
    [subtotal, itbmsOption],
  );
  const total = useMemo(() => round2(subtotal + itbms), [subtotal, itbms]);

  // Validación de marcas
  const marcasPayload: MarcaPorcentajeInput[] = useMemo(() => {
    if (modoMarca === "una") {
      if (!marcaUnica) return [];
      return [{ marcaId: marcaUnica, porcentaje: 100 }];
    }
    return marcasMulti.filter((m) => m.marcaId);
  }, [modoMarca, marcaUnica, marcasMulti]);

  const sumaPct = marcasPayload.reduce(
    (acc, m) => acc + (Number(m.porcentaje) || 0),
    0,
  );
  const sumaOk = Math.abs(sumaPct - 100) < 0.01;
  const marcasDuplicadas = useMemo(() => {
    const ids = marcasPayload.map((m) => m.marcaId);
    return new Set(ids).size !== ids.length;
  }, [marcasPayload]);

  const marcasValidas =
    marcasPayload.length > 0 && sumaOk && !marcasDuplicadas;

  const pasoDatos =
    numeroFactura.trim().length > 0 &&
    fechaFactura.trim().length > 0 &&
    proveedor.trim().length > 0 &&
    concepto.trim().length > 0 &&
    subtotal > 0;

  const puedeGuardar = pasoDatos && marcasValidas && !enviando;

  const aplicarRespuestaIA = useCallback((data: RespuestaIA) => {
    if (data.numero_factura) setNumeroFactura(data.numero_factura);
    if (data.fecha_factura) setFechaFactura(data.fecha_factura);
    if (data.proveedor) setProveedor(data.proveedor);
    if (data.concepto) setConcepto(data.concepto);
    if (data.subtotal !== null && Number.isFinite(data.subtotal)) {
      setSubtotalStr(String(data.subtotal));
    }
    if (data.itbms_pct === 7) setItbmsOption("7");
    else if (data.itbms_pct === 0) setItbmsOption("0");
  }, []);

  const handlePdfUpload = async (file: File): Promise<UploadResult> => {
    setPdfFile(file);
    setPdfSubido(true);

    if (onUploadPdfForIA) {
      setLeyendoIA(true);
      try {
        const path = await onUploadPdfForIA(file);
        if (path) {
          const res = await fetch("/api/marketing/ia/leer-factura", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ path }),
          });
          if (res.ok) {
            const data = (await res.json()) as RespuestaIA;
            aplicarRespuestaIA(data);
            toast("Datos pre-llenados con IA. Revísalos.", "success");
          } else {
            toast(
              "No se pudo leer la factura con IA. Llena los campos a mano.",
              "warning",
            );
          }
        }
      } catch {
        toast("Error leyendo con IA. Llena los campos a mano.", "warning");
      } finally {
        setLeyendoIA(false);
      }
    }

    return {
      url: "",
      nombreOriginal: file.name,
      sizeBytes: file.size,
    };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!puedeGuardar) return;
    try {
      setEnviando(true);
      await onSubmit(
        {
          numeroFactura,
          fechaFactura,
          proveedor,
          concepto,
          subtotal,
          itbms,
          marcasSeleccionadas: marcasPayload,
        },
        pdfFile,
      );
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "No se pudo guardar la factura. Intenta de nuevo.";
      toast(message, "error");
    } finally {
      setEnviando(false);
    }
  };

  // ── UI helpers para marcas ──
  const agregarMarcaMulti = () => {
    const usadas = new Set(marcasMulti.map((m) => m.marcaId).filter(Boolean));
    const disponible = marcasCatalogo.find((m) => !usadas.has(m.id));
    setMarcasMulti([
      ...marcasMulti,
      { marcaId: disponible?.id ?? "", porcentaje: 0 },
    ]);
  };
  const quitarMarcaMulti = (idx: number) => {
    if (marcasMulti.length <= 1) return;
    setMarcasMulti(marcasMulti.filter((_, i) => i !== idx));
  };
  const actualizarMarcaMulti = (
    idx: number,
    campo: keyof MarcaPorcentajeInput,
    valor: string,
  ) => {
    setMarcasMulti(
      marcasMulti.map((m, i) => {
        if (i !== idx) return m;
        if (campo === "porcentaje") {
          const n = Number(valor);
          return { ...m, porcentaje: Number.isFinite(n) ? n : 0 };
        }
        return { ...m, marcaId: valor };
      }),
    );
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PasoInstruccion
        numero={1}
        titulo="Sube el PDF de la factura"
        descripcion={
          leyendoIA
            ? "Leyendo factura con IA..."
            : "Aceptamos solo PDF, máximo 10MB. La IA pre-llenará los campos."
        }
        completado={pdfSubido}
      >
        <PdfUploader
          onUpload={handlePdfUpload}
          label="Sube el PDF de la factura"
          accept="application/pdf"
          maxSizeMb={10}
        />
        {leyendoIA && (
          <div className="mt-3 flex items-center gap-2 text-sm text-fuchsia-700">
            <svg
              className="animate-spin"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
            Leyendo factura con IA...
          </div>
        )}
      </PasoInstruccion>

      <PasoInstruccion
        numero={2}
        titulo="Revisa o llena los datos de la factura"
        descripcion="Edita lo que la IA no haya leído bien."
        completado={pasoDatos}
      >
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="factura-numero"
                className="block text-sm text-gray-600 mb-1"
              >
                Nº factura<span className="text-red-500 ml-0.5">*</span>
              </label>
              <input
                id="factura-numero"
                type="text"
                value={numeroFactura}
                onChange={(e) => setNumeroFactura(e.target.value)}
                required
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-black focus:outline-none"
              />
            </div>
            <div>
              <label
                htmlFor="factura-fecha"
                className="block text-sm text-gray-600 mb-1"
              >
                Fecha<span className="text-red-500 ml-0.5">*</span>
              </label>
              <input
                id="factura-fecha"
                type="date"
                value={fechaFactura}
                onChange={(e) => setFechaFactura(e.target.value)}
                required
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-black focus:outline-none"
              />
            </div>
          </div>

          <AutocompleteInput
            label="Proveedor"
            value={proveedor}
            onChange={setProveedor}
            fetchSuggestions={fetchProveedorSuggestions}
            required
          />

          <AutocompleteInput
            label="Concepto"
            value={concepto}
            onChange={setConcepto}
            fetchSuggestions={fetchConceptoSuggestions}
            required
          />

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label
                htmlFor="factura-subtotal"
                className="block text-sm text-gray-600 mb-1"
              >
                Subtotal<span className="text-red-500 ml-0.5">*</span>
              </label>
              <input
                id="factura-subtotal"
                type="number"
                min={0}
                step="0.01"
                value={subtotalStr}
                onChange={(e) => setSubtotalStr(e.target.value)}
                required
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm tabular-nums focus:border-black focus:outline-none"
              />
            </div>
            <div>
              <span
                id="factura-itbms-label"
                className="block text-sm text-gray-600 mb-1"
              >
                ITBMS
              </span>
              <div
                role="radiogroup"
                aria-labelledby="factura-itbms-label"
                className="flex rounded-md border border-gray-300 overflow-hidden"
              >
                <button
                  type="button"
                  role="radio"
                  aria-checked={itbmsOption === "0"}
                  onClick={() => setItbmsOption("0")}
                  className={`flex-1 px-3 py-2 text-sm transition ${
                    itbmsOption === "0"
                      ? "bg-black text-white"
                      : "bg-white text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  0%
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={itbmsOption === "7"}
                  onClick={() => setItbmsOption("7")}
                  className={`flex-1 px-3 py-2 text-sm transition border-l border-gray-300 ${
                    itbmsOption === "7"
                      ? "bg-black text-white"
                      : "bg-white text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  7%
                </button>
              </div>
              <div className="text-xs text-gray-500 mt-1 tabular-nums">
                {formatearMonto(itbms)}
              </div>
            </div>
            <div>
              <label
                htmlFor="factura-total"
                className="block text-sm text-gray-600 mb-1"
              >
                Total
              </label>
              <input
                id="factura-total"
                type="text"
                value={formatearMonto(total)}
                readOnly
                tabIndex={-1}
                className="w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm tabular-nums text-gray-700"
              />
              <div className="text-xs text-gray-400 mt-1">
                Subtotal + ITBMS
              </div>
            </div>
          </div>
        </div>
      </PasoInstruccion>

      <PasoInstruccion
        numero={3}
        titulo="¿A qué marca(s) aplica esta factura?"
        descripcion="La cobranza a cada marca se calcula sobre el total (subtotal + ITBMS)."
        completado={marcasValidas}
      >
        <div className="space-y-3">
          {/* Toggle modo */}
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="radio"
                name="mk-modo-marca"
                checked={modoMarca === "una"}
                onChange={() => setModoMarca("una")}
                className="accent-black"
              />
              Una sola marca al 100%
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="radio"
                name="mk-modo-marca"
                checked={modoMarca === "varias"}
                onChange={() => setModoMarca("varias")}
                className="accent-black"
              />
              Dividir entre varias marcas
            </label>
          </div>

          {modoMarca === "una" ? (
            <div>
              <label htmlFor="mk-una-marca" className="block text-xs text-gray-500 mb-1">
                Marca
              </label>
              <select
                id="mk-una-marca"
                value={marcaUnica}
                onChange={(e) => setMarcaUnica(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-black focus:outline-none bg-white"
              >
                <option value="">Elige una marca…</option>
                {marcasCatalogo.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nombre}
                  </option>
                ))}
              </select>
              {marcaUnica && total > 0 && (
                <div className="mt-2 text-xs text-gray-500">
                  Cobrable a {marcasCatalogo.find((m) => m.id === marcaUnica)?.nombre}: {" "}
                  <span className="font-mono tabular-nums text-gray-900">{formatearMonto(total)}</span>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {marcasMulti.map((m, idx) => {
                const cobrable = (total * Number(m.porcentaje || 0)) / 100;
                const nombreMarca = marcasCatalogo.find((c) => c.id === m.marcaId)?.nombre;
                return (
                  <div key={idx} className="flex items-end gap-2">
                    <div className="flex-1">
                      <label
                        htmlFor={`mk-multi-marca-${idx}`}
                        className="block text-xs text-gray-500 mb-1"
                      >
                        Marca
                      </label>
                      <select
                        id={`mk-multi-marca-${idx}`}
                        value={m.marcaId}
                        onChange={(e) => actualizarMarcaMulti(idx, "marcaId", e.target.value)}
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-black focus:outline-none bg-white"
                      >
                        <option value="">Elige una marca…</option>
                        {marcasCatalogo.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.nombre}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="w-20">
                      <label
                        htmlFor={`mk-multi-pct-${idx}`}
                        className="block text-xs text-gray-500 mb-1"
                      >
                        %
                      </label>
                      <input
                        id={`mk-multi-pct-${idx}`}
                        type="number"
                        min={0}
                        max={100}
                        step={1}
                        value={m.porcentaje}
                        onChange={(e) => actualizarMarcaMulti(idx, "porcentaje", e.target.value)}
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm tabular-nums focus:border-black focus:outline-none"
                      />
                    </div>
                    <div className="w-24 pb-2">
                      {nombreMarca && total > 0 ? (
                        <div className="text-xs text-gray-500 text-right font-mono tabular-nums">
                          {formatearMonto(cobrable)}
                        </div>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={() => quitarMarcaMulti(idx)}
                      disabled={marcasMulti.length <= 1}
                      aria-label="Quitar marca"
                      className="rounded-md border border-gray-300 bg-white text-gray-600 w-10 h-10 flex items-center justify-center hover:bg-gray-50 disabled:opacity-40"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <line x1="5" y1="12" x2="19" y2="12" />
                      </svg>
                    </button>
                  </div>
                );
              })}
              <button
                type="button"
                onClick={agregarMarcaMulti}
                disabled={marcasMulti.length >= marcasCatalogo.length}
                className="text-sm text-gray-600 hover:text-black transition disabled:opacity-40"
              >
                + Agregar marca
              </button>

              <div
                className={`text-xs font-medium tabular-nums mt-1 ${
                  marcasDuplicadas
                    ? "text-red-600"
                    : sumaOk
                      ? "text-emerald-700"
                      : "text-red-600"
                }`}
                aria-live="polite"
              >
                {marcasDuplicadas
                  ? "✗ Marca duplicada"
                  : sumaOk
                    ? `Total: ${sumaPct}% ✓`
                    : `Total: ${sumaPct}% ✗ ${
                        sumaPct < 100
                          ? `falta ${(100 - sumaPct).toFixed(0)}%`
                          : `sobra ${(sumaPct - 100).toFixed(0)}%`
                      }`}
              </div>
            </div>
          )}
        </div>
      </PasoInstruccion>

      <div className="flex gap-2 justify-end">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={enviando}
            className="rounded-md border border-gray-300 bg-white text-gray-700 px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
          >
            Cancelar
          </button>
        )}
        <button
          type="submit"
          disabled={!puedeGuardar}
          className="rounded-md bg-black text-white px-3 py-2 text-sm active:scale-[0.97] transition disabled:opacity-50"
        >
          {enviando ? "Guardando…" : "Guardar factura"}
        </button>
      </div>
    </form>
  );
}

export default FacturaForm;

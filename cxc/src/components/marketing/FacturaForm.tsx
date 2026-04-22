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
  // El usuario confirmó que aunque haya duplicado quiere guardar igual.
  // Se loguea en activity_logs para auditoría.
  permitirDuplicado?: boolean;
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

interface DuplicadoItem {
  id: string;
  numero_factura: string;
  proveedor: string;
  total: number;
  proyecto_id: string;
  proyecto_nombre: string;
  created_at: string | null;
  fecha_factura: string | null;
  es_mismo_proyecto: boolean;
}

function fmtFechaCorta(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  if (Number.isNaN(d.getTime())) return "";
  const dia = String(d.getDate()).padStart(2, "0");
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  return `${dia}/${mes}/${d.getFullYear()}`;
}

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

  // ── Detección de duplicados ──
  const [duplicados, setDuplicados] = useState<DuplicadoItem[]>([]);
  const [checkingDup, setCheckingDup] = useState(false);
  const [showConfirmDup, setShowConfirmDup] = useState(false);
  // ID de la factura que estamos editando — se excluye del match para no
  // auto-reportarse como duplicado de sí misma.
  const editandoId = initial?.id ?? null;

  // ── Marcas ──
  // Regla 50/50: cada marca asignada a la factura cubre 50% (fijo, no editable).
  // El usuario solo elige cuáles marcas aplican; el porcentaje se persiste como 50.
  const marcasInicialesIds: string[] = useMemo(() => {
    if (initialMarcas && initialMarcas.length > 0) {
      return initialMarcas.map((m) => m.marcaId);
    }
    if (proyecto.marcas && proyecto.marcas.length > 0) {
      return proyecto.marcas.map((m) => m.marca.id);
    }
    return [];
  }, [initialMarcas, proyecto.marcas]);

  const [marcasSel, setMarcasSel] = useState<Set<string>>(
    () => new Set(marcasInicialesIds),
  );

  const subtotal = Number(subtotalStr) || 0;
  const itbms = useMemo(
    () => (itbmsOption === "7" ? round2(subtotal * 0.07) : 0),
    [subtotal, itbmsOption],
  );
  const total = useMemo(() => round2(subtotal + itbms), [subtotal, itbms]);

  // Payload final: cada marca seleccionada con porcentaje fijo 50.
  const marcasPayload: MarcaPorcentajeInput[] = useMemo(
    () =>
      Array.from(marcasSel).map((marcaId) => ({
        marcaId,
        porcentaje: 50,
      })),
    [marcasSel],
  );

  const marcasValidas = marcasPayload.length > 0;

  function toggleMarca(marcaId: string) {
    setMarcasSel((prev) => {
      const next = new Set(prev);
      if (next.has(marcaId)) next.delete(marcaId);
      else next.add(marcaId);
      return next;
    });
  }

  const pasoDatos =
    numeroFactura.trim().length > 0 &&
    fechaFactura.trim().length > 0 &&
    proveedor.trim().length > 0 &&
    concepto.trim().length > 0 &&
    subtotal > 0;

  const puedeGuardar = pasoDatos && marcasValidas && !enviando;

  // Check de duplicados con debounce 500ms. Se activa cuando cambian
  // numero_factura o proveedor. Excluye la factura en edición actual.
  useEffect(() => {
    const num = numeroFactura.trim();
    const prov = proveedor.trim();
    if (!num || !prov) {
      setDuplicados([]);
      return;
    }
    const timer = setTimeout(async () => {
      setCheckingDup(true);
      try {
        const qs = new URLSearchParams({
          numero_factura: num,
          proveedor: prov,
          proyecto_id_actual: proyecto.id,
        });
        const res = await fetch(`/api/marketing/facturas/check-duplicate?${qs.toString()}`, {
          cache: "no-store",
        });
        if (!res.ok) {
          setDuplicados([]);
          return;
        }
        const data = (await res.json()) as {
          existe: boolean;
          facturas: DuplicadoItem[];
        };
        const lista = (data.facturas ?? []).filter((f) => f.id !== editandoId);
        setDuplicados(lista);
      } catch {
        setDuplicados([]);
      } finally {
        setCheckingDup(false);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [numeroFactura, proveedor, proyecto.id, editandoId]);

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

  const ejecutarGuardar = async (permitirDuplicado = false) => {
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
          permitirDuplicado,
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!puedeGuardar) return;
    if (duplicados.length > 0) {
      setShowConfirmDup(true);
      return;
    }
    await ejecutarGuardar();
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

      {duplicados.length > 0 && (
        <div className="rounded-lg border-2 border-amber-300 bg-amber-50 p-4">
          <div className="flex items-start gap-3">
            <div className="shrink-0 mt-0.5 text-amber-600">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-amber-900 mb-1">
                Esta factura ya existe en el sistema
              </div>
              <div className="text-xs text-amber-800 mb-2">
                {numeroFactura} de &ldquo;{proveedor}&rdquo; ya está en:
              </div>
              <ul className="space-y-1 mb-2">
                {duplicados.map((d) => (
                  <li key={d.id} className="text-xs text-amber-900 flex items-center gap-2">
                    <span className="text-amber-600">•</span>
                    <span>
                      Proyecto &ldquo;{d.proyecto_nombre}&rdquo;
                      {d.es_mismo_proyecto ? (
                        <span className="font-semibold"> (este mismo proyecto)</span>
                      ) : null}
                    </span>
                    <a
                      href={`/marketing?proyecto=${d.proyecto_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-amber-700 hover:text-amber-900 underline font-medium"
                    >
                      Ver →
                    </a>
                  </li>
                ))}
              </ul>
              <div className="text-xs text-amber-800">
                ¿Quieres continuar de todas formas? Puedes guardar igual.
              </div>
            </div>
          </div>
        </div>
      )}

      <PasoInstruccion
        numero={3}
        titulo="¿A qué marca(s) aplica esta factura?"
        descripcion="Cada marca seleccionada cubre 50% del total (regla fija). El resto lo asume Fashion Group."
        completado={marcasValidas}
      >
        <div className="space-y-2">
          {marcasCatalogo.map((m) => {
            const checked = marcasSel.has(m.id);
            const cobrable = total * 0.5;
            return (
              <label
                key={m.id}
                className={`flex items-center justify-between gap-3 px-3 py-2 rounded-md border cursor-pointer transition ${
                  checked
                    ? "border-black bg-gray-50"
                    : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleMarca(m.id)}
                    className="accent-black w-4 h-4"
                  />
                  <span className="text-sm text-gray-800">{m.nombre}</span>
                  <span className="text-[11px] text-gray-400">50%</span>
                </div>
                {checked && total > 0 && (
                  <span className="text-xs font-mono tabular-nums text-gray-700">
                    {formatearMonto(cobrable)}
                  </span>
                )}
              </label>
            );
          })}
          {marcasCatalogo.length === 0 && (
            <p className="text-xs text-gray-500">
              No hay marcas configuradas en el catálogo.
            </p>
          )}
          {marcasSel.size === 0 && (
            <p
              className="text-xs text-red-600 mt-1"
              aria-live="polite"
            >
              Selecciona al menos una marca.
            </p>
          )}
        </div>
      </PasoInstruccion>

      <div className="flex items-center gap-2 justify-end">
        {checkingDup && (
          <span className="text-xs text-gray-400 mr-auto">
            Verificando duplicados…
          </span>
        )}
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

      {showConfirmDup && (
        <div
          className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center"
          onClick={() => !enviando && setShowConfirmDup(false)}
        >
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="relative bg-white sm:rounded-lg rounded-t-2xl p-6 max-w-md w-full mx-0 sm:mx-4 border border-gray-200"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold mb-2 text-gray-900">
              ¿Guardar factura duplicada?
            </h3>
            <p className="text-sm text-gray-600 mb-3">
              Ya existe una factura con número{" "}
              <strong>{numeroFactura}</strong> del proveedor{" "}
              <strong>&ldquo;{proveedor}&rdquo;</strong>:
            </p>
            <ul className="space-y-1.5 mb-4 text-sm">
              {duplicados.map((d) => {
                const fecha = fmtFechaCorta(d.created_at);
                return (
                  <li
                    key={d.id}
                    className="rounded-md border border-amber-200 bg-amber-50/60 px-3 py-2 text-amber-900"
                  >
                    Proyecto &ldquo;{d.proyecto_nombre}&rdquo;
                    {d.es_mismo_proyecto && (
                      <span className="font-semibold"> (este mismo)</span>
                    )}
                    {fecha && (
                      <span className="text-amber-700">
                        {" "}
                        — creada el {fecha}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
            <p className="text-xs text-gray-500 mb-4">
              Esta acción quedará registrada en el log de actividad.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowConfirmDup(false)}
                disabled={enviando}
                className="flex-1 border border-gray-200 text-gray-600 px-4 py-2.5 rounded-md text-sm hover:bg-gray-50 transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={async () => {
                  setShowConfirmDup(false);
                  await ejecutarGuardar(true);
                }}
                disabled={enviando}
                className="flex-1 px-4 py-2.5 rounded-md text-sm font-medium bg-amber-600 text-white hover:bg-amber-700 active:scale-[0.97] disabled:opacity-50 transition"
              >
                {enviando ? "Guardando…" : "Continuar de todos modos"}
              </button>
            </div>
          </div>
        </div>
      )}
    </form>
  );
}

export default FacturaForm;

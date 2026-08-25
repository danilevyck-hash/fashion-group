"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/components/ToastSystem";
import { ConfirmDeleteModal } from "@/components/ui";
import {
  BorradorFacturaCard,
  FacturaCard,
  FacturaForm,
} from "@/components/marketing";
import type {
  EstadoPagoFactura,
  FacturaConAdjuntos,
  FacturaConAdjuntosYMarcas,
  MarcaConPorcentaje,
  MarcaPorcentajeInput,
  MkFactura,
  MkMarca,
  ProyectoConMarcas,
} from "@/lib/marketing/types";
import {
  pedirUploadUrl,
  subirArchivoAStorage,
} from "./uploadHelpers";
import { useBulkUploadFacturas } from "@/lib/marketing/useBulkUploadFacturas";
import {
  useBackdropDismiss,
  useEscapeClose,
  useFormModalDismiss,
} from "@/lib/hooks/useModalDismiss";

interface FacturasSectionProps {
  proyecto: ProyectoConMarcas;
  facturasIniciales?: FacturaConAdjuntosYMarcas[];
  onChange?: () => void;
  readonly?: boolean;
}

export default function FacturasSection({
  proyecto,
  facturasIniciales,
  onChange,
  readonly = false,
}: FacturasSectionProps) {
  const { toast } = useToast();
  const [facturas, setFacturas] = useState<FacturaConAdjuntosYMarcas[]>(
    facturasIniciales ?? [],
  );
  const [loading, setLoading] = useState(!facturasIniciales);
  const [showForm, setShowForm] = useState(false);
  const [anulando, setAnulando] = useState<FacturaConAdjuntos | null>(null);
  const [anulandoMotivo, setAnulandoMotivo] = useState("");
  const [anulandoLoading, setAnulandoLoading] = useState(false);
  // Path del PDF pre-subido para IA (antes de tener facturaId)
  const [pdfPathPreSubido, setPdfPathPreSubido] = useState<string | null>(null);

  // Fase 2: catálogo global de marcas para los selectores del form.
  // Las marcas POR factura ya vienen embebidas en cada factura (f.marcas),
  // así que NO se re-fetchean por factura (antes era un N+1).
  const [marcasCatalogo, setMarcasCatalogo] = useState<MkMarca[]>([]);
  // Edición de una factura específica
  const [editando, setEditando] = useState<FacturaConAdjuntos | null>(null);
  const [editandoMarcas, setEditandoMarcas] = useState<MarcaPorcentajeInput[] | null>(null);

  // Multi-upload (bulk)
  const bulk = useBulkUploadFacturas({ proyectoId: proyecto.id });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActivo, setDragActivo] = useState(false);
  // Confirmación global cuando hay borradores con duplicados sin aprobar
  const [confirmDup, setConfirmDup] = useState(false);
  // Eliminar definitivamente (solo admin)
  const [eliminando, setEliminando] = useState<FacturaConAdjuntos | null>(null);
  const [eliminandoLoading, setEliminandoLoading] = useState(false);
  const [role, setRole] = useState<string>("");
  useEffect(() => {
    setRole(sessionStorage.getItem("cxc_role") ?? "");
  }, []);
  const esAdmin = role === "admin";

  // ---- Cierre de modales con clic fuera + Escape ----
  // Anular lleva un motivo escrito: si el usuario ya tipeó algo, el clic fuera
  // y el Escape no cierran (se sale con Cancelar).
  const cerrarAnular = useCallback(() => setAnulando(null), []);
  const anularDismiss = useFormModalDismiss(
    anulando !== null,
    cerrarAnular,
    !anulandoLoading,
  );
  // El de duplicados es solo confirmación: no hay nada que perder.
  const cerrarConfirmDup = useCallback(() => setConfirmDup(false), []);
  const confirmDupBackdrop = useBackdropDismiss(cerrarConfirmDup);
  useEscapeClose(confirmDup, cerrarConfirmDup);

  // Sincroniza cuando el parent pasa nuevas facturas (después de un onChange).
  useEffect(() => {
    if (facturasIniciales) {
      setFacturas(facturasIniciales);
      setLoading(false);
    }
  }, [facturasIniciales]);

  const cargar = useCallback(async () => {
    // Si el parent maneja las facturas, solo delegamos el refresh.
    if (facturasIniciales !== undefined) {
      onChange?.();
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(
        `/api/marketing/proyectos/${proyecto.id}/facturas`,
        { cache: "no-store" },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? "No se pudieron cargar las facturas");
      }
      const data = (await res.json()) as FacturaConAdjuntos[];
      setFacturas(Array.isArray(data) ? data : []);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Error al cargar facturas";
      toast(msg, "error");
    } finally {
      setLoading(false);
    }
  }, [proyecto.id, toast, facturasIniciales, onChange]);

  useEffect(() => {
    // Solo hace fetch propio si no le pasaron facturasIniciales.
    if (facturasIniciales === undefined) {
      cargar();
    }
  }, [cargar, facturasIniciales]);

  // 🩸 LAS ANULADAS VIVEN ACÁ AHORA. La pantalla de "Anulados" se retiró
  // (ago-2026) y era la ÚNICA puerta para verlas y restaurarlas: el detalle del
  // proyecto nunca las recibió (`getFacturasByProyecto` filtra
  // `anulado_en IS NULL`), así que sin esto las 14 anuladas que viven dentro de
  // proyectos vivos ($12.004,20 medidos el 11-ago-2026) quedaban inalcanzables.
  //
  // 🔴 VAN EN SU PROPIO ESTADO, NO MEZCLADAS con `facturas`. Todo lo que suma
  // plata en el módulo lee las vigentes; meterlas en el mismo arreglo haría que
  // el primer total que se olvidara de filtrar contara una anulada como gasto.
  const [anuladas, setAnuladas] = useState<FacturaConAdjuntos[]>([]);
  const [verAnuladas, setVerAnuladas] = useState(false);
  const [restaurando, setRestaurando] = useState<string | null>(null);

  const cargarAnuladas = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/marketing/proyectos/${proyecto.id}/facturas-anuladas`,
        { cache: "no-store" },
      );
      if (!res.ok) return;
      const data = (await res.json()) as FacturaConAdjuntos[];
      setAnuladas(Array.isArray(data) ? data : []);
    } catch {
      // Silencioso: es un bloque secundario, no puede tumbar el detalle.
    }
  }, [proyecto.id]);

  useEffect(() => {
    cargarAnuladas();
  }, [cargarAnuladas]);

  const restaurarFactura = async (id: string, numero: string) => {
    if (restaurando) return;
    setRestaurando(id);
    try {
      const res = await fetch("/api/marketing/papelera/restaurar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo: "factura", id }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? "No se pudo restaurar la factura");
      }
      toast(`Factura ${numero} restaurada`, "success");
      await cargarAnuladas();
      await cargar();
      onChange?.();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error al restaurar", "error");
    } finally {
      setRestaurando(null);
    }
  };

  // Cargar catálogo global de marcas (Fase 2)
  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const res = await fetch("/api/marketing/marcas", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as MkMarca[];
        if (!cancelado) setMarcasCatalogo(Array.isArray(data) ? data : []);
      } catch { /* */ }
    })();
    return () => { cancelado = true; };
  }, []);

  // Cuando el usuario sube el PDF, lo subimos a Storage bajo el path del
  // proyecto (sin facturaId todavía) y devolvemos el path para que el form
  // llame a la IA. Luego, al guardar, registramos el adjunto con el path ya
  // conocido (evitamos doble upload).
  const handleUploadPdfForIA = useCallback(
    async (file: File): Promise<string | null> => {
      try {
        const { uploadUrl, path } = await pedirUploadUrl({
          file,
          proyectoId: proyecto.id,
        });
        await subirArchivoAStorage(uploadUrl, file);
        setPdfPathPreSubido(path);
        return path;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Error subiendo PDF";
        toast(msg, "warning");
        setPdfPathPreSubido(null);
        return null;
      }
    },
    [proyecto.id, toast],
  );

  const handleCrear = async (
    data: {
      numeroFactura: string;
      fechaFactura: string;
      proveedor: string;
      concepto: string;
      subtotal: number;
      itbms: number;
      tieneImportacion: boolean;
      estadoPago: EstadoPagoFactura;
      marcasSeleccionadas: MarcaPorcentajeInput[];
      permitirDuplicado?: boolean;
    },
    pdfFile?: File,
  ) => {
    const { marcasSeleccionadas, ...payload } = data;
    const res = await fetch("/api/marketing/facturas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ proyectoId: proyecto.id, ...payload }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      throw new Error(err?.error ?? "No se pudo guardar la factura");
    }
    const factura = (await res.json()) as MkFactura;

    // Asignar marcas a nivel factura (Fase 2). Si falla, eliminar la factura
    // recién creada para no dejar huérfana sin marcas.
    try {
      const mRes = await fetch(`/api/marketing/facturas/${factura.id}/marcas`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ marcas: marcasSeleccionadas }),
      });
      if (!mRes.ok) {
        const err = await mRes.json().catch(() => null);
        // Rollback best-effort
        await fetch(`/api/marketing/facturas/${factura.id}/anular`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ motivo: "Rollback: fallo al asignar marcas" }),
        }).catch(() => {});
        throw new Error(err?.error ?? "No se pudieron asignar las marcas");
      }
    } catch (err) {
      throw err;
    }

    // Si ya pre-subimos el PDF para IA, reusamos el path y solo registramos el adjunto.
    // Si no hay pre-subido pero hay pdfFile, subimos ahora.
    if (pdfPathPreSubido) {
      try {
        await fetch("/api/marketing/adjuntos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            facturaId: factura.id,
            tipo: "pdf_factura",
            url: pdfPathPreSubido,
            nombreOriginal: pdfFile?.name,
            sizeBytes: pdfFile?.size,
          }),
        });
      } catch {
        toast(
          "Factura guardada, pero no se registró el PDF. Súbelo de nuevo después.",
          "warning",
        );
      }
    } else if (pdfFile) {
      try {
        const { uploadUrl, path } = await pedirUploadUrl({
          file: pdfFile,
          facturaId: factura.id,
        });
        await subirArchivoAStorage(uploadUrl, pdfFile);
        await fetch("/api/marketing/adjuntos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            facturaId: factura.id,
            tipo: "pdf_factura",
            url: path,
            nombreOriginal: pdfFile.name,
            sizeBytes: pdfFile.size,
          }),
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Error subiendo PDF";
        toast(`Factura guardada, pero ${msg.toLowerCase()}`, "warning");
      }
    }

    toast("Factura guardada", "success");
    setPdfPathPreSubido(null);
    setShowForm(false);
    await cargar();
    onChange?.();
  };

  const handleAbrirEdicion = useCallback(
    async (factura: FacturaConAdjuntos) => {
      setEditando(factura);
      // Se limpia ANTES de pedir: si quedaran las marcas de la factura anterior,
      // el form se dibujaría por un instante con las marcas equivocadas.
      setEditandoMarcas(null);
      // Pre-cargar marcas actuales de esa factura
      try {
        const res = await fetch(`/api/marketing/facturas/${factura.id}/marcas`, {
          cache: "no-store",
        });
        if (res.ok) {
          const marcas = (await res.json()) as MarcaConPorcentaje[];
          setEditandoMarcas(
            marcas.map((m) => ({ marcaId: m.marca.id, porcentaje: m.porcentaje })),
          );
        } else {
          setEditandoMarcas([]);
        }
      } catch {
        setEditandoMarcas([]);
      }
    },
    [],
  );

  const handleEditar = async (
    data: {
      numeroFactura: string;
      fechaFactura: string;
      proveedor: string;
      concepto: string;
      subtotal: number;
      itbms: number;
      tieneImportacion: boolean;
      estadoPago: EstadoPagoFactura;
      marcasSeleccionadas: MarcaPorcentajeInput[];
    },
  ) => {
    if (!editando) return;
    const { marcasSeleccionadas, ...payload } = data;
    const res = await fetch(`/api/marketing/facturas/${editando.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      throw new Error(err?.error ?? "No se pudo actualizar la factura");
    }

    // Actualizar marcas de la factura
    const mRes = await fetch(
      `/api/marketing/facturas/${editando.id}/marcas`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ marcas: marcasSeleccionadas }),
      },
    );
    if (!mRes.ok) {
      const err = await mRes.json().catch(() => null);
      throw new Error(err?.error ?? "No se pudieron actualizar las marcas");
    }

    toast("Factura actualizada", "success");
    setEditando(null);
    setEditandoMarcas(null);
    await cargar();
    onChange?.();
  };

  const handleEliminarDefinitivo = async () => {
    if (!eliminando) return;
    setEliminandoLoading(true);
    try {
      const res = await fetch(`/api/marketing/facturas/${eliminando.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? "No se pudo eliminar la factura");
      }
      toast("Factura eliminada", "success");
      setEliminando(null);
      await cargar();
      onChange?.();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error al eliminar";
      toast(msg, "error");
    } finally {
      setEliminandoLoading(false);
    }
  };

  const handleAnular = async () => {
    if (!anulando || !anulandoMotivo.trim()) return;
    setAnulandoLoading(true);
    try {
      const res = await fetch(
        `/api/marketing/facturas/${anulando.id}/anular`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ motivo: anulandoMotivo.trim() }),
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? "No se pudo anular la factura");
      }
      toast("Factura anulada", "success");
      setAnulando(null);
      setAnulandoMotivo("");
      await cargar();
      await cargarAnuladas();
      onChange?.();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error al anular";
      toast(msg, "error");
    } finally {
      setAnulandoLoading(false);
    }
  };

  // ── Drop / file picker handlers para multi-upload ─────────────────────
  const aceptarArchivos = useCallback(
    async (files: FileList | File[] | null) => {
      if (!files) return;
      const arr = Array.from(files);
      if (arr.length === 0) return;
      await bulk.agregarArchivos(arr);
    },
    [bulk],
  );

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActivo(false);
    if (readonly) return;
    aceptarArchivos(e.dataTransfer?.files ?? null);
  };

  const ejecutarGuardarBulk = async () => {
    try {
      const r = await bulk.guardarTodas();
      if (r.exitosas > 0 && r.errores === 0) {
        toast(
          `${r.exitosas} factura${r.exitosas === 1 ? "" : "s"} guardada${
            r.exitosas === 1 ? "" : "s"
          }`,
          "success",
        );
      } else if (r.exitosas > 0 && r.errores > 0) {
        toast(
          `${r.exitosas} guardada${r.exitosas === 1 ? "" : "s"} · ${r.errores} con error`,
          "warning",
        );
      } else if (r.errores > 0) {
        toast(
          `${r.errores} factura${r.errores === 1 ? "" : "s"} con error — revisa los mensajes`,
          "error",
        );
      }
      if (r.exitosas > 0) {
        await cargar();
        onChange?.();
      }
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Error guardando facturas";
      toast(msg, "error");
    }
  };

  const handleGuardarBulk = async () => {
    // Si hay borradores con duplicado sin confirmar, abrir modal global.
    if (bulk.borradoresConDuplicadoSinConfirmar.length > 0) {
      setConfirmDup(true);
      return;
    }
    await ejecutarGuardarBulk();
  };

  const confirmarDuplicadosYGuardar = async () => {
    bulk.borradoresConDuplicadoSinConfirmar.forEach((b) => {
      bulk.setPermitirDuplicado(b.cardId, true);
    });
    setConfirmDup(false);
    // Pequeño delay para que el state propague antes de leer en guardarTodas
    await new Promise((r) => setTimeout(r, 0));
    await ejecutarGuardarBulk();
  };

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Facturas</h2>
          <p className="text-xs text-gray-500">
            {facturas.filter((f) => !f.anulado_en).length} vigentes
            {anuladas.length > 0 ? ` · ${anuladas.length} anuladas` : ""}
          </p>
        </div>
        {!showForm && !readonly && (
          <button
            type="button"
            onClick={() => {
              setShowForm(true);
              setPdfPathPreSubido(null);
            }}
            className="rounded-md bg-black text-white px-3 py-2 text-sm active:scale-[0.97] transition"
          >
            + Agregar factura
          </button>
        )}
      </div>

      {/* Drop zone multi-upload */}
      {!readonly && (
        <div>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragActivo(true);
            }}
            onDragLeave={() => setDragActivo(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                fileInputRef.current?.click();
              }
            }}
            className={`rounded-lg border-2 border-dashed p-4 text-center cursor-pointer transition ${
              dragActivo
                ? "border-black bg-gray-50"
                : "border-gray-300 hover:border-gray-400 hover:bg-gray-50"
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,.pdf"
              multiple
              onChange={(e) => {
                aceptarArchivos(e.target.files);
                e.target.value = "";
              }}
              className="hidden"
            />
            <div className="text-sm text-gray-700 font-medium">
              📤 Subir facturas (varias a la vez)
            </div>
            <div className="text-xs text-gray-500 mt-0.5">
              Arrastra PDFs aquí o haz clic para seleccionarlos. La IA leerá
              cada uno automáticamente.
            </div>
            {bulk.progress.enProceso && (
              <div className="text-xs text-gray-600 mt-2 inline-flex items-center gap-1.5">
                <svg className="animate-spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                  <path d="M12 2a10 10 0 0 1 10 10" />
                </svg>
                Procesando {bulk.progress.procesados} de{" "}
                {bulk.progress.totalArchivos}…
              </div>
            )}
          </div>
        </div>
      )}

      {/* Borradores en edición */}
      {bulk.borradores.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between sticky top-0 bg-white py-2 z-10 border-b border-gray-100">
            <div className="text-xs text-gray-600">
              <span className="font-semibold tabular-nums">
                {bulk.borradores.length}
              </span>{" "}
              factura{bulk.borradores.length === 1 ? "" : "s"} sin guardar
              {bulk.cardsIncompletas.length > 0 && (
                <span className="text-amber-700 ml-1">
                  · {bulk.cardsIncompletas.length} incompleta
                  {bulk.cardsIncompletas.length === 1 ? "" : "s"}
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={bulk.limpiarTodo}
                disabled={bulk.guardando}
                className="text-xs text-gray-500 hover:text-gray-800 underline disabled:opacity-40"
              >
                Descartar todas
              </button>
              <button
                type="button"
                onClick={handleGuardarBulk}
                disabled={!bulk.puedeGuardar}
                title={
                  bulk.cardsIncompletas.length > 0
                    ? `Revisa las ${bulk.cardsIncompletas.length} factura${
                        bulk.cardsIncompletas.length === 1 ? "" : "s"
                      } incompleta${bulk.cardsIncompletas.length === 1 ? "" : "s"}`
                    : undefined
                }
                className="rounded-md bg-black text-white px-3 py-1.5 text-xs font-medium active:scale-[0.97] transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {bulk.guardando
                  ? "Guardando…"
                  : `Guardar ${bulk.borradores.length} factura${
                      bulk.borradores.length === 1 ? "" : "s"
                    }`}
              </button>
            </div>
          </div>
          {bulk.borradores.map((b) => (
            <BorradorFacturaCard
              key={b.cardId}
              borrador={b}
              marcasCatalogo={marcasCatalogo}
              onChange={bulk.updateCard}
              onDescartar={bulk.descartar}
            />
          ))}
        </div>
      )}

      {showForm && (
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <FacturaForm
            proyecto={proyecto}
            marcasCatalogo={marcasCatalogo}
            onSubmit={handleCrear}
            onCancel={() => {
              setShowForm(false);
              setPdfPathPreSubido(null);
            }}
            onUploadPdfForIA={handleUploadPdfForIA}
          />
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <div
              key={i}
              className="h-20 rounded-lg bg-gray-100 animate-pulse"
            />
          ))}
        </div>
      ) : facturas.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center">
          {/* La segunda línea se fue: el botón de agregar factura está a la
              vista, arriba, y el vacío ya se explicó en la primera. */}
          <div className="text-sm text-gray-600">
            Todavía no hay facturas en este proyecto.
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2">
          {facturas.map((f) => {
            // Marcas embebidas en la factura (de GET /proyectos/[id]); fallback
            // a las marcas del proyecto si una factura aún no las trae.
            const marcasDeEsta =
              f.marcas && f.marcas.length > 0
                ? f.marcas
                : proyecto.marcas ?? [];

            // 🩸 El formulario de edición se dibuja EN EL LUGAR de la factura, no
            // arriba de la lista. Antes vivía antes del listado y "Editar" parecía
            // no hacer nada: la ficha del proyecto es un modal con scroll propio
            // (`max-h-[95vh] overflow-y-auto` en ProyectoOverlay), así que al
            // tocar Editar en una factura del medio o del final, el form se abría
            // fuera de la pantalla y no había ninguna señal de que algo pasó.
            // Acá el formulario aparece exactamente donde el usuario hizo clic.
            //
            // El `key` obliga a REMONTARLO al pasar de una factura a otra: los
            // campos del form son useState inicializados desde `initial`, que solo
            // corren al montar — sin key, abrir la factura B con la A abierta
            // mostraba los datos de A y se podía guardar el número equivocado.
            if (editando?.id === f.id && editandoMarcas !== null) {
              return (
                <div
                  key={f.id}
                  className="rounded-lg border-2 border-black bg-white p-4"
                >
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-gray-900">
                      Editar factura {editando.numero_factura}
                    </h3>
                    <button
                      type="button"
                      onClick={() => { setEditando(null); setEditandoMarcas(null); }}
                      className="text-xs text-gray-500 hover:text-black min-h-[44px] px-2"
                    >
                      Cancelar
                    </button>
                  </div>
                  <FacturaForm
                    key={editando.id}
                    proyecto={proyecto}
                    marcasCatalogo={marcasCatalogo}
                    initial={editando}
                    initialMarcas={editandoMarcas}
                    onSubmit={handleEditar}
                    onCancel={() => { setEditando(null); setEditandoMarcas(null); }}
                  />
                </div>
              );
            }

            return (
              <div key={f.id} className="space-y-1">
                <FacturaCard factura={f} porcentajesMarcas={marcasDeEsta} />
                {/* 🩸 Las tres acciones vivían FLOTANDO sobre la esquina de la
                    tarjeta, de ~24 px de alto y a 4 px una de otra. En el
                    iPhone el dedo caía en "Eliminar" (definitivo, se lleva la
                    factura para siempre) cuando iba a "Anular" (reversible: la
                    factura queda plegada abajo y se puede restaurar).

                    Ahora van en su propia FILA debajo de la tarjeta:
                      · cada botón mide 44 px de alto (mínimo táctil);
                      · no tapan los badges (Pagado / Zona libre / PDF) que
                        viven arriba a la derecha de la tarjeta — con 44 px de
                        alto, flotando, los habrían tapado;
                      · "Eliminar" se va al EXTREMO OPUESTO de la fila
                        (`ml-auto`), separado de lo reversible: el dedo no
                        puede resbalar de "Anular" a "Eliminar".
                    Se dejan siempre visibles (antes se revelaban por hover en
                    escritorio): en pantalla táctil el hover no existe y la
                    fila propia ya no compite con nada. */}
                {!f.anulado_en && !readonly && (
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAbrirEdicion(f);
                      }}
                      className="text-xs text-gray-700 hover:text-black hover:bg-gray-50 border border-gray-200 rounded-md px-3 min-h-[44px] inline-flex items-center transition"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setAnulando(f);
                        setAnulandoMotivo("");
                      }}
                      className="text-xs text-gray-700 hover:text-black hover:bg-gray-50 border border-gray-200 rounded-md px-3 min-h-[44px] inline-flex items-center transition"
                    >
                      Anular
                    </button>
                    {esAdmin && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEliminando(f);
                        }}
                        className="ml-auto text-xs text-red-700 hover:text-white hover:bg-red-600 border border-red-300 rounded-md px-3 min-h-[44px] inline-flex items-center font-medium transition"
                        title="Eliminar definitivamente (irreversible)"
                      >
                        Eliminar definitivamente
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Facturas anuladas — plegadas, tenues, y NO suman en ningún total.   */}
      {/* Es el único lugar donde se pueden ver y restaurar desde que la      */}
      {/* pantalla de "Anulados" se retiró.                                   */}
      {/* ------------------------------------------------------------------ */}
      {anuladas.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-gray-50">
          <button
            type="button"
            onClick={() => setVerAnuladas((v) => !v)}
            aria-expanded={verAnuladas}
            className="w-full flex items-center justify-between gap-3 px-4 min-h-[44px] py-2 text-left"
          >
            <span className="text-sm text-gray-600">
              {anuladas.length === 1
                ? "1 factura anulada"
                : `${anuladas.length} facturas anuladas`}
              <span className="text-gray-400"> · no cuentan como gasto</span>
            </span>
            <span className="text-xs text-gray-500 shrink-0">
              {verAnuladas ? "Ocultar" : "Ver"}
            </span>
          </button>

          {verAnuladas && (
            <div className="px-4 pb-4 space-y-2">
              {anuladas.map((f) => (
                <div key={f.id} className="relative">
                  <FacturaCard factura={f} porcentajesMarcas={[]} />
                  {f.anulado_motivo && (
                    <p className="text-xs text-gray-500 mt-1 px-1">
                      Motivo: {f.anulado_motivo}
                    </p>
                  )}
                  {!readonly && (
                    <div className="mt-1 px-1">
                      <button
                        type="button"
                        onClick={() => restaurarFactura(f.id, f.numero_factura)}
                        disabled={restaurando === f.id}
                        className="text-xs text-gray-700 hover:text-black underline underline-offset-2 min-h-[44px] inline-flex items-center disabled:opacity-50"
                      >
                        {restaurando === f.id
                          ? "Restaurando…"
                          : "Restaurar esta factura"}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {anulando && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/40" {...anularDismiss.backdrop} />
          <div
            ref={anularDismiss.panelRef}
            className="relative bg-white sm:rounded-lg rounded-t-2xl p-6 max-w-sm w-full mx-0 sm:mx-4 border border-gray-200"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold mb-1">
              Anular factura {anulando.numero_factura}
            </h3>
            <p className="text-sm text-gray-500 mb-4">
              Deja de contar como gasto. Queda guardada acá abajo, en
              &ldquo;Facturas anuladas&rdquo;, por si hay que restaurarla.
            </p>
            <label
              htmlFor="motivo-anular"
              className="block text-sm text-gray-600 mb-1"
            >
              Motivo<span className="text-red-500 ml-0.5">*</span>
            </label>
            <textarea
              id="motivo-anular"
              rows={3}
              value={anulandoMotivo}
              onChange={(e) => setAnulandoMotivo(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-black focus:outline-none mb-4"
              placeholder="Explica por qué se anula"
            />
            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleAnular}
                disabled={
                  anulandoLoading || anulandoMotivo.trim().length === 0
                }
                className="flex-1 px-4 py-2.5 rounded-md text-sm font-medium bg-red-600 text-white hover:bg-red-700 active:scale-[0.97] disabled:opacity-50 transition"
              >
                {anulandoLoading ? "Anulando…" : "Anular factura"}
              </button>
              <button
                type="button"
                onClick={() => setAnulando(null)}
                disabled={anulandoLoading}
                className="flex-1 border border-gray-200 text-gray-600 px-4 py-2.5 rounded-md text-sm hover:bg-gray-50 transition"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDeleteModal
        open={eliminando !== null}
        title={
          eliminando
            ? `Eliminar factura ${eliminando.numero_factura}`
            : "Eliminar factura"
        }
        description="Se borrarán la factura, sus marcas asignadas y el PDF en Storage. Esta acción NO se puede deshacer."
        onConfirm={handleEliminarDefinitivo}
        onCancel={() => setEliminando(null)}
        loading={eliminandoLoading}
      />

      {/* Modal de confirmación de duplicados (bulk) */}
      {confirmDup && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"
          {...confirmDupBackdrop}
        >
          <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-2xl">
            <h3 className="text-base font-semibold mb-1">
              ¿Guardar facturas duplicadas?
            </h3>
            <p className="text-sm text-gray-600 mb-3">
              {bulk.borradoresConDuplicadoSinConfirmar.length} factura
              {bulk.borradoresConDuplicadoSinConfirmar.length === 1 ? "" : "s"} ya
              {bulk.borradoresConDuplicadoSinConfirmar.length === 1 ? " existe" : " existen"} en
              el sistema. Si confirmas, se guardarán igual y quedarán en el log de auditoría.
            </p>
            <ul className="max-h-48 overflow-auto space-y-1 mb-4 text-xs text-gray-700">
              {bulk.borradoresConDuplicadoSinConfirmar.map((b) => (
                <li key={b.cardId} className="rounded border border-amber-200 bg-amber-50 px-2 py-1.5">
                  <span className="font-medium">{b.numeroFactura}</span> · {b.proveedor}
                  <span className="text-gray-500">
                    {" "}— ya existe en{" "}
                    {b.duplicados
                      .map((d) => `"${d.proyecto_nombre}"${d.es_mismo_proyecto ? " (este mismo)" : ""}`)
                      .join(", ")}
                  </span>
                </li>
              ))}
            </ul>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={confirmarDuplicadosYGuardar}
                className="flex-1 rounded-md bg-black text-white px-4 py-2.5 text-sm font-medium hover:bg-gray-800 active:scale-[0.97] transition"
              >
                Sí, guardar de todos modos
              </button>
              <button
                type="button"
                onClick={() => setConfirmDup(false)}
                className="flex-1 border border-gray-200 text-gray-600 px-4 py-2.5 rounded-md text-sm hover:bg-gray-50 transition"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

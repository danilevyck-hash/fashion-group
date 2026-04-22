"use client";

import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/ToastSystem";
import { FacturaCard, FacturaForm } from "@/components/marketing";
import type {
  FacturaConAdjuntos,
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

interface FacturasSectionProps {
  proyecto: ProyectoConMarcas;
  facturasIniciales?: FacturaConAdjuntos[];
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
  const [facturas, setFacturas] = useState<FacturaConAdjuntos[]>(
    facturasIniciales ?? [],
  );
  const [loading, setLoading] = useState(!facturasIniciales);
  const [showForm, setShowForm] = useState(false);
  const [anulando, setAnulando] = useState<FacturaConAdjuntos | null>(null);
  const [anulandoMotivo, setAnulandoMotivo] = useState("");
  const [anulandoLoading, setAnulandoLoading] = useState(false);
  // Path del PDF pre-subido para IA (antes de tener facturaId)
  const [pdfPathPreSubido, setPdfPathPreSubido] = useState<string | null>(null);

  // Fase 2: catálogo global de marcas + marcas-por-factura para cards
  const [marcasCatalogo, setMarcasCatalogo] = useState<MkMarca[]>([]);
  const [marcasByFactura, setMarcasByFactura] = useState<Record<string, MarcaConPorcentaje[]>>({});
  // Edición de una factura específica
  const [editando, setEditando] = useState<FacturaConAdjuntos | null>(null);
  const [editandoMarcas, setEditandoMarcas] = useState<MarcaPorcentajeInput[] | null>(null);

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

  // Cargar marcas por factura en batch cuando cambia la lista (Fase 2)
  const cargarMarcasPorFactura = useCallback(
    async (facturaIds: string[]) => {
      if (facturaIds.length === 0) return;
      const entries = await Promise.all(
        facturaIds.map(async (id) => {
          try {
            const res = await fetch(`/api/marketing/facturas/${id}/marcas`, {
              cache: "no-store",
            });
            if (!res.ok) return [id, [] as MarcaConPorcentaje[]] as const;
            const data = (await res.json()) as MarcaConPorcentaje[];
            return [id, Array.isArray(data) ? data : []] as const;
          } catch {
            return [id, [] as MarcaConPorcentaje[]] as const;
          }
        }),
      );
      setMarcasByFactura((prev) => {
        const next = { ...prev };
        for (const [id, arr] of entries) next[id] = arr;
        return next;
      });
    },
    [],
  );

  useEffect(() => {
    const vigentes = facturas.filter((f) => !f.anulado_en).map((f) => f.id);
    cargarMarcasPorFactura(vigentes);
  }, [facturas, cargarMarcasPorFactura]);

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
      onChange?.();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error al anular";
      toast(msg, "error");
    } finally {
      setAnulandoLoading(false);
    }
  };

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Facturas</h2>
          <p className="text-xs text-gray-500">
            {facturas.filter((f) => !f.anulado_en).length} vigentes
            {facturas.some((f) => f.anulado_en)
              ? ` · ${facturas.filter((f) => f.anulado_en).length} anuladas`
              : ""}
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

      {editando && editandoMarcas !== null && (
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-900">
              Editar factura {editando.numero_factura}
            </h3>
            <button
              type="button"
              onClick={() => { setEditando(null); setEditandoMarcas(null); }}
              className="text-xs text-gray-500 hover:text-black"
            >
              Cancelar
            </button>
          </div>
          <FacturaForm
            proyecto={proyecto}
            marcasCatalogo={marcasCatalogo}
            initial={editando}
            initialMarcas={editandoMarcas}
            onSubmit={handleEditar}
            onCancel={() => { setEditando(null); setEditandoMarcas(null); }}
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
          <div className="text-sm text-gray-600">
            Todavía no hay facturas en este proyecto.
          </div>
          <div className="text-xs text-gray-400 mt-1">
            Agrega la primera factura para empezar a repartir el gasto.
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2">
          {facturas.map((f) => {
            const marcasDeEsta = marcasByFactura[f.id] ?? proyecto.marcas ?? [];
            return (
              <div key={f.id} className="relative group">
                <FacturaCard factura={f} porcentajesMarcas={marcasDeEsta} />
                {!f.anulado_en && !readonly && (
                  <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition flex gap-1">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAbrirEdicion(f);
                      }}
                      className="text-[11px] text-gray-600 hover:text-black bg-white/80 backdrop-blur px-2 py-1 rounded"
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
                      className="text-[11px] text-red-600 hover:text-red-800 bg-white/80 backdrop-blur px-2 py-1 rounded"
                    >
                      Anular
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {anulando && (
        <div
          className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center"
          onClick={() => !anulandoLoading && setAnulando(null)}
        >
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="relative bg-white sm:rounded-lg rounded-t-2xl p-6 max-w-sm w-full mx-0 sm:mx-4 border border-gray-200"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold mb-1">
              Anular factura {anulando.numero_factura}
            </h3>
            <p className="text-sm text-gray-500 mb-4">
              Se marcará como anulada. Podrás restaurarla desde Anulados.
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
    </section>
  );
}

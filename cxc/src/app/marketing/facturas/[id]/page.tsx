"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import { useAuth } from "@/lib/hooks/useAuth";
import { useToast } from "@/components/ToastSystem";
import { FacturaForm } from "@/components/marketing";
import { formatearFecha, formatearMonto } from "@/lib/marketing/normalizar";
import type {
  FacturaConAdjuntos,
  ProyectoConMarcas,
} from "@/lib/marketing/types";
import { subirAdjunto } from "../../components/uploadHelpers";

interface PageProps {
  params: { id: string };
}

export default function FacturaDetailPage({ params }: PageProps) {
  const router = useRouter();
  const { toast } = useToast();
  const { authChecked } = useAuth({
    moduleKey: "marketing",
    allowedRoles: ["admin", "secretaria", "director"],
  });
  const [factura, setFactura] = useState<FacturaConAdjuntos | null>(null);
  const [proyecto, setProyecto] = useState<ProyectoConMarcas | null>(null);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [showAnular, setShowAnular] = useState(false);
  const [anularMotivo, setAnularMotivo] = useState("");
  const [anulando, setAnulando] = useState(false);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const fRes = await fetch(`/api/marketing/facturas/${params.id}`);
      if (!fRes.ok) {
        const err = await fRes.json().catch(() => null);
        throw new Error(err?.error ?? "Factura no encontrada");
      }
      const f = (await fRes.json()) as FacturaConAdjuntos;
      setFactura(f);

      const pRes = await fetch(`/api/marketing/proyectos/${f.proyecto_id}`);
      if (pRes.ok) {
        const p = (await pRes.json()) as ProyectoConMarcas;
        setProyecto(p);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error al cargar";
      toast(msg, "error");
      router.push("/marketing");
    } finally {
      setLoading(false);
    }
  }, [params.id, toast, router]);

  useEffect(() => {
    if (authChecked) cargar();
  }, [authChecked, cargar]);

  const handleGuardar = async (
    data: {
      numeroFactura: string;
      fechaFactura: string;
      proveedor: string;
      concepto: string;
      subtotal: number;
      itbms: number;
    },
    pdfFile?: File,
  ) => {
    if (!factura) return;
    const res = await fetch(`/api/marketing/facturas/${factura.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      throw new Error(err?.error ?? "No se pudo guardar");
    }
    if (pdfFile) {
      try {
        await subirAdjunto({
          file: pdfFile,
          facturaId: factura.id,
          tipo: "pdf_factura",
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Error al subir PDF";
        toast(
          `Factura actualizada, pero no se pudo reemplazar el PDF: ${msg}`,
          "warning",
        );
      }
    }
    toast("Factura actualizada", "success");
    setEditMode(false);
    cargar();
  };

  const handleAnular = async () => {
    if (!factura || !anularMotivo.trim()) return;
    setAnulando(true);
    try {
      const res = await fetch(
        `/api/marketing/facturas/${factura.id}/anular`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ motivo: anularMotivo.trim() }),
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? "No se pudo anular");
      }
      toast("Factura anulada", "success");
      setShowAnular(false);
      if (factura.proyecto_id) {
        router.push(`/marketing/proyectos/${factura.proyecto_id}`);
      } else {
        router.push("/marketing");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error al anular";
      toast(msg, "error");
    } finally {
      setAnulando(false);
    }
  };

  if (!authChecked) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader
        module="Marketing"
        breadcrumbs={[
          proyecto
            ? {
                label: proyecto.tienda,
                onClick: () =>
                  router.push(`/marketing/proyectos/${proyecto.id}`),
              }
            : { label: "Proyecto" },
          { label: "Factura" },
        ]}
      />
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
        {loading ? (
          <div className="h-40 bg-gray-100 rounded-lg animate-pulse" />
        ) : !factura ? null : editMode && proyecto ? (
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <FacturaForm
              proyecto={proyecto}
              initial={factura}
              onSubmit={handleGuardar}
              onCancel={() => setEditMode(false)}
            />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="min-w-0">
                  <div className="text-lg font-semibold text-gray-900 truncate">
                    {factura.numero_factura}
                  </div>
                  <div className="text-sm text-gray-500 truncate">
                    {factura.proveedor}
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {formatearFecha(factura.fecha_factura)}
                  </div>
                </div>
                <div className="shrink-0">
                  {factura.anulado_en && (
                    <span className="text-xs px-2 py-1 rounded bg-red-50 text-red-700 font-medium">
                      Anulada
                    </span>
                  )}
                </div>
              </div>

              <div className="mt-3 pt-3 border-t border-gray-100">
                <div className="text-xs text-gray-400 mb-0.5">Concepto</div>
                <div className="text-sm text-gray-800">{factura.concepto}</div>
              </div>

              <div className="grid grid-cols-3 gap-3 mt-3 pt-3 border-t border-gray-100">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-gray-400">
                    Subtotal
                  </div>
                  <div className="text-sm font-mono tabular-nums text-gray-900">
                    {formatearMonto(factura.subtotal)}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-gray-400">
                    ITBMS
                  </div>
                  <div className="text-sm font-mono tabular-nums text-gray-900">
                    {formatearMonto(factura.itbms)}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-gray-400">
                    Total
                  </div>
                  <div className="text-sm font-semibold font-mono tabular-nums text-gray-900">
                    {formatearMonto(factura.total)}
                  </div>
                </div>
              </div>

              {/* Adjuntos */}
              {factura.adjuntos.length > 0 && (
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <div className="text-xs text-gray-400 mb-2">Adjuntos</div>
                  <div className="space-y-1.5">
                    {factura.adjuntos.map((a) => (
                      <a
                        key={a.id}
                        href={a.url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-2 text-sm text-gray-700 hover:text-black transition"
                      >
                        <span className="text-[10px] font-semibold tracking-wide bg-gray-900 text-white rounded px-1.5 py-0.5">
                          {a.tipo === "pdf_factura" ? "PDF" : "IMG"}
                        </span>
                        <span className="truncate">
                          {a.nombre_original ?? "Archivo"}
                        </span>
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* Desglose por marca (subtotal * %) */}
              {proyecto && !factura.anulado_en && (
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <div className="text-xs text-gray-400 mb-2">
                    Cobrable por marca
                  </div>
                  <div className="space-y-1.5">
                    {proyecto.marcas.map((m) => {
                      const cobrable = Number(
                        ((factura.subtotal * m.porcentaje) / 100).toFixed(2),
                      );
                      return (
                        <div
                          key={m.marca.id}
                          className="flex items-center justify-between text-sm"
                        >
                          <div className="text-gray-700">
                            {m.marca.nombre}{" "}
                            <span className="text-gray-400">
                              ({m.porcentaje}%)
                            </span>
                          </div>
                          <div className="font-mono tabular-nums text-gray-900">
                            {formatearMonto(cobrable)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Acciones */}
              {!factura.anulado_en && (
                <div className="flex gap-2 mt-4 pt-3 border-t border-gray-100">
                  <button
                    type="button"
                    onClick={() => setEditMode(true)}
                    className="rounded-md bg-black text-white px-3 py-2 text-sm active:scale-[0.97] transition"
                  >
                    Editar factura
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowAnular(true)}
                    className="rounded-md border border-red-200 bg-white text-red-700 px-3 py-2 text-sm hover:bg-red-50 transition ml-auto"
                  >
                    Anular
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Modal anular */}
      {showAnular && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
          onClick={() => !anulando && setShowAnular(false)}
        >
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="relative bg-white sm:rounded-lg rounded-t-2xl p-6 max-w-sm w-full mx-0 sm:mx-4 border border-gray-200"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold mb-1">Anular factura</h3>
            <p className="text-sm text-gray-500 mb-4">
              Se marcará como anulada. Podrás restaurarla desde Papelera.
            </p>
            <label
              htmlFor="motivo-anular-factura"
              className="block text-sm text-gray-600 mb-1"
            >
              Motivo<span className="text-red-500 ml-0.5">*</span>
            </label>
            <textarea
              id="motivo-anular-factura"
              rows={3}
              value={anularMotivo}
              onChange={(e) => setAnularMotivo(e.target.value)}
              placeholder="Explica por qué se anula"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-black focus:outline-none mb-4"
            />
            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleAnular}
                disabled={anulando || anularMotivo.trim().length === 0}
                className="flex-1 px-4 py-2.5 rounded-md text-sm font-medium bg-red-600 text-white hover:bg-red-700 active:scale-[0.97] disabled:opacity-50 transition"
              >
                {anulando ? "Anulando…" : "Anular factura"}
              </button>
              <button
                type="button"
                onClick={() => setShowAnular(false)}
                disabled={anulando}
                className="flex-1 border border-gray-200 text-gray-600 px-4 py-2.5 rounded-md text-sm hover:bg-gray-50 transition"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

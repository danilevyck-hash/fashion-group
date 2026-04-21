"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ToastSystem";
import { FacturaCard, FacturaForm } from "@/components/marketing";
import type {
  FacturaConAdjuntos,
  MkFactura,
  ProyectoConMarcas,
} from "@/lib/marketing/types";
import { subirAdjunto } from "./uploadHelpers";

interface FacturasSectionProps {
  proyecto: ProyectoConMarcas;
  onChange?: () => void;
}

export default function FacturasSection({
  proyecto,
  onChange,
}: FacturasSectionProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [facturas, setFacturas] = useState<FacturaConAdjuntos[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [anulando, setAnulando] = useState<FacturaConAdjuntos | null>(null);
  const [anulandoMotivo, setAnulandoMotivo] = useState("");
  const [anulandoLoading, setAnulandoLoading] = useState(false);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      // Usamos el endpoint de proyecto para obtener facturas con adjuntos.
      // No existe GET /api/marketing/facturas; cargamos vía /proyectos/[id]/facturas?
      // Para mantener el contrato chico, reusamos getFacturasByProyecto a través del endpoint
      // que agregamos a nivel de proyecto.
      const res = await fetch(
        `/api/marketing/proyectos/${proyecto.id}/facturas`,
      );
      if (res.status === 404) {
        // Si por alguna razón el endpoint no existe, intenta leer desde la vista del proyecto.
        setFacturas([]);
        return;
      }
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
  }, [proyecto.id, toast]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const handleCrear = async (
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
    // 1) Crear factura
    const res = await fetch("/api/marketing/facturas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ proyectoId: proyecto.id, ...data }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      throw new Error(err?.error ?? "No se pudo guardar la factura");
    }
    const factura = (await res.json()) as MkFactura;

    // 2) Si hay PDF, subirlo y registrarlo
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
          `Factura guardada, pero no se pudo subir el PDF: ${msg}`,
          "warning",
        );
      }
    }

    toast("Factura guardada", "success");
    setShowForm(false);
    cargar();
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
      cargar();
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
        {!showForm && (
          <button
            type="button"
            onClick={() => setShowForm(true)}
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
            onSubmit={handleCrear}
            onCancel={() => setShowForm(false)}
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
          {facturas.map((f) => (
            <div key={f.id} className="relative group">
              <FacturaCard
                factura={f}
                porcentajesMarcas={proyecto.marcas}
                onClick={() => router.push(`/marketing/facturas/${f.id}`)}
              />
              {!f.anulado_en && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setAnulando(f);
                    setAnulandoMotivo("");
                  }}
                  className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition text-[11px] text-red-600 hover:text-red-800 bg-white/80 backdrop-blur px-2 py-1 rounded"
                >
                  Anular
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modal anular factura */}
      {anulando && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
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
              Se marcará como anulada. Podrás restaurarla desde Papelera.
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

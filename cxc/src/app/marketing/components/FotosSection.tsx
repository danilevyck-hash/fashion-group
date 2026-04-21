"use client";

import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/ToastSystem";
import { FotoUploader } from "@/components/marketing";
import type { MkAdjunto } from "@/lib/marketing/types";
import type { UploadResult } from "@/components/marketing";
import { FotoLightbox } from "@/components/ui";
import { subirAdjunto } from "./uploadHelpers";

interface FotosSectionProps {
  proyectoId: string;
}

export default function FotosSection({ proyectoId }: FotosSectionProps) {
  const { toast } = useToast();
  const [fotos, setFotos] = useState<MkAdjunto[]>([]);
  const [loading, setLoading] = useState(true);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [eliminando, setEliminando] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/marketing/proyectos/${proyectoId}/fotos`,
        { cache: "no-store" },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? "No se pudieron cargar las fotos");
      }
      const data = (await res.json()) as MkAdjunto[];
      setFotos(Array.isArray(data) ? data : []);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Error al cargar fotos";
      toast(msg, "error");
    } finally {
      setLoading(false);
    }
  }, [proyectoId, toast]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const handleUpload = async (file: File): Promise<UploadResult> => {
    const adj = await subirAdjunto({
      file,
      proyectoId,
      tipo: "foto_proyecto",
    });
    // Optimistic: agregar la foto al estado inmediatamente con URL firmada
    setFotos((prev) => [
      {
        id: adj.id,
        proyecto_id: proyectoId,
        factura_id: null,
        tipo: adj.tipo,
        url: adj.url,
        nombre_original: adj.nombre_original,
        size_bytes: adj.size_bytes,
        created_at: new Date().toISOString(),
      } as MkAdjunto,
      ...prev,
    ]);
    toast("Foto subida", "success");
    return {
      url: adj.url,
      nombreOriginal: adj.nombre_original ?? file.name,
      sizeBytes: adj.size_bytes ?? file.size,
    };
  };

  const eliminar = async (id: string) => {
    setEliminando(id);
    try {
      const res = await fetch(`/api/marketing/adjuntos/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? "No se pudo eliminar la foto");
      }
      setFotos((prev) => prev.filter((f) => f.id !== id));
      toast("Foto eliminada", "success");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error al eliminar";
      toast(msg, "error");
    } finally {
      setEliminando(null);
    }
  };

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-base font-semibold text-gray-900">Fotos del proyecto</h2>
        <p className="text-xs text-gray-500">
          Sube fotos de la obra o del local — sirven como respaldo para la cobranza a la marca.
        </p>
      </div>

      <FotoUploader
        onUpload={handleUpload}
        label="Sube fotos del proyecto"
        accept="image/*"
        maxSizeMb={10}
        multiple
      />

      {loading ? (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="aspect-square rounded-md bg-gray-100 animate-pulse"
            />
          ))}
        </div>
      ) : fotos.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-200 bg-white p-6 text-center text-sm text-gray-500">
          Todavía no hay fotos del proyecto.
        </div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
          {fotos.map((f) => (
            <div
              key={f.id}
              className="relative aspect-square rounded-md border border-gray-200 overflow-hidden bg-gray-50 group"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={f.url}
                alt={f.nombre_original ?? "Foto del proyecto"}
                className="w-full h-full object-cover cursor-zoom-in"
                onClick={() => setLightbox(f.url)}
              />
              <button
                type="button"
                onClick={() => eliminar(f.id)}
                disabled={eliminando === f.id}
                aria-label="Eliminar foto"
                className="absolute top-1 right-1 bg-white/90 rounded-full w-6 h-6 flex items-center justify-center text-red-600 opacity-0 group-hover:opacity-100 transition disabled:opacity-50"
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      <FotoLightbox src={lightbox} onClose={() => setLightbox(null)} />
    </section>
  );
}

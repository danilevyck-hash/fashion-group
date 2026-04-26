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
  readonly?: boolean;
}

export default function FotosSection({ proyectoId, readonly = false }: FotosSectionProps) {
  const { toast } = useToast();
  const [fotos, setFotos] = useState<MkAdjunto[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [fotosConError, setFotosConError] = useState<Set<string>>(new Set());
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [eliminando, setEliminando] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    setErrorCarga(null);
    try {
      const res = await fetch(
        `/api/marketing/proyectos/${proyectoId}/fotos`,
        { cache: "no-store" },
      );
      if (!res.ok) {
        const body = await res.text();
        throw new Error(
          `HTTP ${res.status}: ${body.slice(0, 120)}`,
        );
      }
      const raw = (await res.json()) as unknown;
      if (!Array.isArray(raw)) {
        throw new Error("Respuesta inesperada del servidor");
      }
      const data = raw as MkAdjunto[];
      console.log(
        `[fotos] proyecto=${proyectoId} recibidas=${data.length}`,
      );
      setFotos(data);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Error al cargar fotos";
      setErrorCarga(msg);
      toast(`No se pudieron cargar las fotos: ${msg}`, "error");
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
    // Re-fetch del servidor en lugar de optimistic state update.
    // La signed URL recién firmada puede no estar propagada en CDN — al
    // recargar lista, el endpoint vuelve a firmar con archivo ya disponible.
    await cargar();
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

  const hayFotos = fotos.length > 0;

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-base font-semibold text-gray-900">Fotos del proyecto</h2>
        <p className="text-xs text-gray-500">
          Respaldo visual que se adjunta a la cobranza a la marca.
        </p>
      </div>

      {errorCarga && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
          {errorCarga}
        </div>
      )}
      {loading ? (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="aspect-square rounded-md bg-gray-100 animate-pulse"
            />
          ))}
        </div>
      ) : hayFotos ? (
        <>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
            {fotos.map((f) => {
              const conError = fotosConError.has(f.id);
              const urlLower = (f.url ?? "").toLowerCase();
              const nombreLower = (f.nombre_original ?? "").toLowerCase();
              const esHeic =
                nombreLower.endsWith(".heic") ||
                urlLower.includes(".heic") ||
                urlLower.startsWith("data:image/heic");
              // Fotos legacy pueden venir como data URL (data:image/...).
              // El <img> las renderiza nativamente; solo cae al fallback si
              // el onError se dispara (data corrupta).
              return (
              <div
                key={f.id}
                className="relative aspect-square rounded-md border border-gray-200 overflow-hidden bg-gray-50 group"
              >
                {conError || esHeic ? (
                  <a
                    href={f.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full h-full flex flex-col items-center justify-center text-center p-2 text-[10px] text-gray-500 hover:bg-gray-100"
                    title={f.nombre_original ?? ""}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <rect x="3" y="3" width="18" height="18" rx="2" />
                      <circle cx="8.5" cy="8.5" r="1.5" />
                      <polyline points="21 15 16 10 5 21" />
                    </svg>
                    <span className="mt-1 truncate max-w-full">
                      {esHeic ? "HEIC" : "Ver"}
                    </span>
                    <span className="truncate max-w-full text-gray-400">
                      {(f.nombre_original ?? "").slice(0, 18)}
                    </span>
                  </a>
                ) : (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={f.url}
                    alt={f.nombre_original ?? "Foto del proyecto"}
                    className="w-full h-full object-cover cursor-zoom-in"
                    loading="lazy"
                    onClick={() => setLightbox(f.url)}
                    onError={() => {
                      console.warn(
                        `[fotos] no se pudo cargar: ${f.nombre_original} (${f.url.slice(0, 80)}…)`,
                      );
                      setFotosConError((prev) => {
                        const next = new Set(prev);
                        next.add(f.id);
                        return next;
                      });
                    }}
                  />
                )}
                {!readonly && (
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
                )}
              </div>
              );
            })}
          </div>
          {!readonly && (
            <FotoUploader
              onUpload={handleUpload}
              accept="image/*"
              maxSizeMb={10}
              multiple
              compact
            />
          )}
        </>
      ) : readonly ? (
        <div className="rounded-lg border border-dashed border-gray-200 bg-white p-6 text-center text-sm text-gray-500">
          Este proyecto no tiene fotos.
        </div>
      ) : (
        <FotoUploader
          onUpload={handleUpload}
          label="Sube fotos del proyecto"
          accept="image/*"
          maxSizeMb={10}
          multiple
        />
      )}

      <FotoLightbox src={lightbox} onClose={() => setLightbox(null)} />
    </section>
  );
}

"use client";

import { useState } from "react";
import type { MkAdjunto } from "@/lib/marketing/types";
import { FotoLightbox, PdfLightbox } from "@/components/ui";

// Muestra los adjuntos de una factura INLINE en la vista del proyecto:
//   - Imágenes (foto_factura): thumbnail clickable → lightbox full-screen.
//   - PDFs (pdf_factura): fila compacta (nombre + "Ver PDF") → overlay a demanda.
//     Ya NO se incrusta el PDF (antes mostraba "barras negras").
// Las URLs ya vienen firmadas desde /api/marketing/proyectos/[id] (signed URL).

function esPdf(a: MkAdjunto): boolean {
  const n = (a.nombre_original || a.url || "").toLowerCase();
  return a.tipo === "pdf_factura" || /\.pdf(\?|$)/.test(n);
}

function esHeic(a: MkAdjunto): boolean {
  const n = (a.nombre_original || "").toLowerCase();
  const u = (a.url || "").toLowerCase();
  return n.endsWith(".heic") || n.endsWith(".heif") || u.includes(".heic");
}

const IconoImg = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <polyline points="21 15 16 10 5 21" />
  </svg>
);

const IconoPdf = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
  </svg>
);

export default function AdjuntosFactura({ adjuntos }: { adjuntos: MkAdjunto[] }) {
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [pdfLightbox, setPdfLightbox] = useState<{ url: string; nombre: string } | null>(null);
  const [conError, setConError] = useState<Set<string>>(new Set());

  if (!adjuntos || adjuntos.length === 0) return null;

  const pdfs = adjuntos.filter(esPdf);
  const imagenes = adjuntos.filter((a) => !esPdf(a));

  return (
    <div className="border-t border-gray-100 pt-2 mt-2 flex flex-col gap-2">
      {imagenes.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
          {imagenes.map((a) => {
            const fallback = conError.has(a.id) || esHeic(a);
            return (
              <div
                key={a.id}
                className="relative aspect-square rounded-md border border-gray-200 overflow-hidden bg-gray-50"
              >
                {fallback ? (
                  <a
                    href={a.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full h-full flex flex-col items-center justify-center text-center p-2 text-xs text-gray-500 hover:bg-gray-100"
                    title={a.nombre_original ?? ""}
                  >
                    {IconoImg}
                    <span className="mt-1">{esHeic(a) ? "HEIC" : "Ver"}</span>
                  </a>
                ) : (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={a.url}
                    alt={a.nombre_original ?? "Foto de la factura"}
                    className="w-full h-full object-cover cursor-zoom-in"
                    loading="lazy"
                    onClick={() => setLightbox(a.url)}
                    onError={() =>
                      setConError((prev) => {
                        const next = new Set(prev);
                        next.add(a.id);
                        return next;
                      })
                    }
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      {pdfs.map((a) => {
        const nombre = a.nombre_original ?? "Factura.pdf";
        return (
          <div
            key={a.id}
            className="flex items-center justify-between gap-2 rounded-md border border-gray-200 bg-white px-2.5 py-2"
          >
            <span className="text-xs text-gray-600 truncate flex items-center gap-1.5 min-w-0">
              <span className="text-gray-400 shrink-0">{IconoPdf}</span>
              <span className="truncate">{nombre}</span>
            </span>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setPdfLightbox({ url: a.url, nombre })}
                className="text-xs font-medium text-gray-700 hover:text-black border border-gray-200 rounded px-2 py-1 active:scale-[0.97] transition"
              >
                Ver PDF
              </button>
              <a
                href={a.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-gray-500 hover:text-black"
              >
                Abrir ↗
              </a>
            </div>
          </div>
        );
      })}

      <FotoLightbox src={lightbox} onClose={() => setLightbox(null)} />
      <PdfLightbox
        src={pdfLightbox?.url ?? null}
        titulo={pdfLightbox?.nombre}
        onClose={() => setPdfLightbox(null)}
      />
    </div>
  );
}

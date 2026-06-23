"use client";

import { useState } from "react";
import { FotoLightbox } from "@/components/ui";

interface Foto {
  url: string;
  nombre: string;
}

export default function GaleriaView({
  nombre,
  fotos,
}: {
  nombre: string;
  fotos: Foto[];
}) {
  const [idx, setIdx] = useState<number | null>(null);
  const [conError, setConError] = useState<Set<number>>(new Set());

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <header className="mb-4">
        <h1 className="text-lg font-semibold text-gray-900">Fotos · {nombre}</h1>
        <p className="text-xs text-gray-500">
          {fotos.length} {fotos.length === 1 ? "foto" : "fotos"} · solo para ver
        </p>
      </header>

      {fotos.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
          Este cliente no tiene fotos.
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
          {fotos.map((f, i) => {
            const nombreLower = (f.nombre ?? "").toLowerCase();
            const esHeic = nombreLower.endsWith(".heic") || f.url.toLowerCase().includes(".heic");
            const roto = conError.has(i);
            return (
              <div
                key={i}
                className="relative aspect-square overflow-hidden rounded-md border border-gray-200 bg-gray-50"
              >
                {roto || esHeic ? (
                  <a
                    href={f.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex h-full w-full flex-col items-center justify-center p-2 text-center text-xs text-gray-500 hover:bg-gray-100"
                    title={f.nombre}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <rect x="3" y="3" width="18" height="18" rx="2" />
                      <circle cx="8.5" cy="8.5" r="1.5" />
                      <polyline points="21 15 16 10 5 21" />
                    </svg>
                    <span className="mt-1 truncate max-w-full">{esHeic ? "HEIC" : "Ver"}</span>
                  </a>
                ) : (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={f.url}
                    alt={f.nombre}
                    loading="lazy"
                    className="h-full w-full cursor-zoom-in object-cover"
                    onClick={() => setIdx(i)}
                    onError={() =>
                      setConError((prev) => {
                        const next = new Set(prev);
                        next.add(i);
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

      <FotoLightbox
        src={idx !== null ? fotos[idx]?.url ?? null : null}
        onClose={() => setIdx(null)}
        onPrev={
          fotos.length > 1
            ? () => setIdx((p) => (p === null ? p : (p - 1 + fotos.length) % fotos.length))
            : undefined
        }
        onNext={
          fotos.length > 1
            ? () => setIdx((p) => (p === null ? p : (p + 1) % fotos.length))
            : undefined
        }
      />
    </main>
  );
}

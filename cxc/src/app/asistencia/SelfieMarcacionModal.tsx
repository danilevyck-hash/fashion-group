"use client";

/* ─────────────────────────────────────────────────────────────────────────────
 * LA SELFIE Y EL MAPA DE UNA MARCA DEL TELÉFONO (14-sep-2026).
 *
 * Lo que Daniel pidió que viera la contadora: *«la selfie y el mapa»*.
 *
 * 🔴 LA FOTO SE PIDE AL ABRIR, NO AL CARGAR EL REPORTE. El bucket es privado y
 * cada URL se firma por una hora: firmarlas todas al dibujar el reporte serían
 * decenas de firmas que casi nadie va a mirar, y vencidas antes de que alguien
 * bajara hasta esa fila.
 *
 * 🔴 EL MAPA ES UN ENLACE Y UN MARCO DE GOOGLE MAPS SIN LLAVE DE API. No se
 * agrega una dependencia ni una cuenta nueva para mostrar un punto.
 *
 * ⚠️ A los 90 días la selfie ya no está y la fila sí: ahí se dice «La foto ya
 * se retiró» en vez de un cuadro roto.
 * ────────────────────────────────────────────────────────────────────────── */

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ModalOverlay } from "@/components/ui";
import { enlaceAlMapa, mapaEmbebido, RETENCION_SELFIE_DIAS } from "@/lib/marcacion/marcacion";
import type { MarcaTelefonoUI } from "@/lib/marcacion/en-el-reporte";

export interface SelfieParaVer extends MarcaTelefonoUI {
  persona: string;
  fecha: string;
  rotulo: string;
  /**
   * Renglones sueltos bajo el detalle: dónde estaba, con cuánta precisión, si la
   * mandó sin señal, cuánto tardó en llegar. Los usa la pestaña «Marcaciones»
   * (25-sep-2026), que muestra la MISMA hoja que el reporte y necesita decir
   * tres cosas más. 🔑 Lo que no se sabe no llega acá: quien la arma no manda
   * una raya.
   */
  lineas?: readonly string[];
}

export default function SelfieMarcacionModal({
  marca,
  onClose,
}: {
  marca: SelfieParaVer | null;
  onClose: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [estado, setEstado] = useState<"cargando" | "lista" | "sin-foto" | "error">("cargando");

  useEffect(() => {
    if (!marca) return;
    let vivo = true;
    setEstado("cargando");
    setUrl(null);
    (async () => {
      try {
        const res = await fetch(`/api/asistencia/marcacion-foto?id=${encodeURIComponent(marca.id)}`, {
          cache: "no-store",
        });
        const j = (await res.json()) as { url?: string | null };
        if (!vivo) return;
        if (!res.ok) {
          setEstado("error");
          return;
        }
        if (j.url) {
          setUrl(j.url);
          setEstado("lista");
        } else {
          setEstado("sin-foto");
        }
      } catch {
        if (vivo) setEstado("error");
      }
    })();
    return () => {
      vivo = false;
    };
  }, [marca]);

  if (!marca) return null;
  if (typeof document === "undefined") return null;

  return createPortal(
    <ModalOverlay onBackdropClick={onClose} align="center">
      <div className="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-4">
        <p className="text-sm text-gray-600">
          {marca.persona} · {marca.fecha}
        </p>
        <p className="mt-1 text-lg font-semibold">
          {marca.rotulo} {marca.horaLarga}
        </p>
        <p className="mt-0.5 text-sm text-gray-500">{marca.detalle}</p>
        {(marca.lineas ?? []).length > 0 && (
          <ul className="mt-1.5 space-y-0.5">
            {(marca.lineas ?? []).map((l) => (
              <li key={l} className="text-sm text-gray-600">{l}</li>
            ))}
          </ul>
        )}

        <div className="mt-3">
          {estado === "cargando" && <p className="text-sm text-gray-500">Abriendo la selfie…</p>}
          {estado === "sin-foto" && (
            <p className="rounded-md bg-gray-50 px-3 py-2.5 text-sm text-gray-600">
              La foto ya se retiró: las selfies se borran solas a los {RETENCION_SELFIE_DIAS} días.
              La hora y la ubicación se quedan.
            </p>
          )}
          {estado === "error" && (
            <p className="rounded-md bg-gray-50 px-3 py-2.5 text-sm text-gray-700">
              No se pudo abrir la selfie. Intenta de nuevo en unos segundos.
            </p>
          )}
          {estado === "lista" && url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt={`Selfie de ${marca.persona}`} className="w-full rounded-md border border-gray-200" />
          )}
        </div>

        {marca.lat !== null && marca.lng !== null ? (
          <div className="mt-3">
            <iframe
              title="Dónde estaba al marcar"
              src={mapaEmbebido(marca.lat, marca.lng)}
              className="h-44 w-full rounded-md border border-gray-200"
              loading="lazy"
            />
            <a
              href={enlaceAlMapa(marca.lat, marca.lng)}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-flex min-h-[44px] items-center text-sm text-gray-600 underline decoration-dotted underline-offset-2"
            >
              Abrir el mapa
            </a>
          </div>
        ) : (
          <p className="mt-3 text-sm text-gray-500">Esta marca no trae ubicación.</p>
        )}

        <button
          type="button"
          onClick={onClose}
          className="mt-4 min-h-[44px] w-full rounded-md border border-gray-200 px-4 py-2 text-sm font-medium"
        >
          Cerrar
        </button>
      </div>
    </ModalOverlay>,
    document.body,
  );
}

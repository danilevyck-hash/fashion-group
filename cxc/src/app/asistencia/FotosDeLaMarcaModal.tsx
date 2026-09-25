"use client";

/* ─────────────────────────────────────────────────────────────────────────────
 * LAS FOTOS DEL LUGAR Y EL MAPA DE UN DÍA (14-sep-2026; una hoja por DÍA desde
 * el 25-sep-2026).
 *
 * 🔴 SON FOTOS DEL LUGAR, NO SELFIES. Daniel, textual, el 24-sep-2026: *«sus
 * fotos son del lugar, no de su cara»* — por eso la cámara de marcar es la
 * normal (`capture="environment"`) y por eso el rótulo «selfie» se fue de toda
 * la pantalla. Este archivo se llamaba `SelfieMarcacionModal.tsx`.
 *
 * 🔴 UNA HOJA POR DÍA, NO POR MARCA (25-sep-2026). Daniel: *«¿estas
 * informaciones se pueden resumir? quitar lo obvio, para no ensuciar tanto la
 * pantalla»*. Debajo del día había una línea POR MARCA, cada una con su propio
 * «Ver la selfie y el mapa». Ahora el día lleva UN «ver fotos» y acá se ven las
 * marcas de ese día, una debajo de la otra, con su hora, su porqué y su mapa.
 *
 * 🔴 LA FOTO SE PIDE AL ABRIR, NO AL CARGAR EL REPORTE. El bucket es privado y
 * cada URL se firma por una hora: firmarlas todas al dibujar el reporte serían
 * decenas de firmas que casi nadie va a mirar, y vencidas antes de que alguien
 * bajara hasta esa fila.
 *
 * 🔴 EL MAPA ES UN ENLACE Y UN MARCO DE GOOGLE MAPS SIN LLAVE DE API. No se
 * agrega una dependencia ni una cuenta nueva para mostrar un punto.
 *
 * ⚠️ A los 90 días la foto ya no está y la fila sí: ahí se dice «La foto ya se
 * retiró» en vez de un cuadro roto.
 * ────────────────────────────────────────────────────────────────────────── */

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ModalOverlay } from "@/components/ui";
import { enlaceAlMapa, mapaEmbebido, RETENCION_SELFIE_DIAS } from "@/lib/marcacion/marcacion";
import type { MarcaTelefonoUI } from "@/lib/marcacion/en-el-reporte";

export interface FotoParaVer extends MarcaTelefonoUI {
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

export default function FotosDeLaMarcaModal({
  marcas,
  onClose,
}: {
  /** Las marcas del día. `null` o vacío = no hay hoja abierta. */
  marcas: readonly FotoParaVer[] | null;
  onClose: () => void;
}) {
  const abierta = marcas && marcas.length > 0 ? marcas : null;
  if (!abierta) return null;
  if (typeof document === "undefined") return null;

  const primera = abierta[0];
  return createPortal(
    <ModalOverlay onBackdropClick={onClose} align="center">
      <div className="max-h-[88vh] w-full max-w-sm overflow-y-auto rounded-lg border border-gray-200 bg-white p-4">
        <p className="text-sm text-gray-600">
          {primera.persona} · {primera.fecha}
        </p>

        {abierta.map((marca, i) => (
          <div key={marca.id} className={i === 0 ? "mt-1" : "mt-5 border-t border-gray-100 pt-4"}>
            <p className="text-lg font-semibold">
              {marca.rotulo} {marca.horaLarga}
            </p>
            <p className="mt-0.5 text-sm text-gray-500">{marca.detalle}</p>
            {marca.relojCorrido && (
              <p className="mt-0.5 text-sm text-amber-800">{marca.relojCorrido}</p>
            )}
            {(marca.lineas ?? []).length > 0 && (
              <ul className="mt-1.5 space-y-0.5">
                {(marca.lineas ?? []).map((l) => (
                  <li key={l} className="text-sm text-gray-600">{l}</li>
                ))}
              </ul>
            )}
            <FotoDeLaMarca id={marca.id} persona={marca.persona} />
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
          </div>
        ))}

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

/** La foto de UNA marca. Se firma al abrir; cada una pide la suya. */
function FotoDeLaMarca({ id, persona }: { id: string; persona: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [estado, setEstado] = useState<"cargando" | "lista" | "sin-foto" | "error">("cargando");

  useEffect(() => {
    let vivo = true;
    setEstado("cargando");
    setUrl(null);
    (async () => {
      try {
        const res = await fetch(`/api/asistencia/marcacion-foto?id=${encodeURIComponent(id)}`, {
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
  }, [id]);

  return (
    <div className="mt-3">
      {estado === "cargando" && <p className="text-sm text-gray-500">Abriendo la foto…</p>}
      {estado === "sin-foto" && (
        <p className="rounded-md bg-gray-50 px-3 py-2.5 text-sm text-gray-600">
          La foto ya se retiró: las fotos del lugar se borran solas a los {RETENCION_SELFIE_DIAS} días.
          La hora y la ubicación se quedan.
        </p>
      )}
      {estado === "error" && (
        <p className="rounded-md bg-gray-50 px-3 py-2.5 text-sm text-gray-700">
          No se pudo abrir la foto. Intenta de nuevo en unos segundos.
        </p>
      )}
      {estado === "lista" && url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={`Foto del lugar donde marcó ${persona}`} className="w-full rounded-md border border-gray-200" />
      )}
    </div>
  );
}

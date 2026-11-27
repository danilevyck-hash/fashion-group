"use client";

/* ─────────────────────────────────────────────────────────────────────────────
 * «Cómo se usa» — el panel de videos de un módulo (15-nov-2026, mockups
 * videos-01 y videos-02). En la computadora es un panel lateral; en el
 * celular, la `BottomSheet` de siempre. El video se reproduce ahí mismo.
 * Interruptor: `VIDEOS_AYUDA_2026_11`. Los videos: `lib/videos-ayuda/manifiesto.ts`.
 * ──────────────────────────────────────────────────────────────────────────── */

import { useEffect, useRef, useState } from "react";
import { BottomSheet, EnElCuerpo } from "@/components/ui";
import { Aviso } from "@/components/ui/Aviso";
import { useEscapeClose } from "@/lib/hooks/useModalDismiss";
import { duracion, tituloEnLista, type FormatoVideos } from "@/lib/videos-ayuda/manifiesto";
import { compartirArchivo, descargarArchivo } from "@/lib/compartir-archivo";
import { aparatoDeQuienMira } from "@/lib/aparato";
import { logActivityClient } from "@/lib/logActivityClient";
import type { PdfDeCurvas } from "@/lib/ui/curvas-tallas-2026-11";
import dynamic from "next/dynamic";

/** Las reglas de Asistencia (antes, un segundo «?» junto al del encabezado).
 *  Se cargan solo al abrir «Cómo se usa» en Asistencia. */
const ReglasDeAsistencia = dynamic(() => import("@/app/asistencia/ComoFuncionaTab"));

interface VideoFirmado {
  orden: number;
  titulo: string;
  segundos: number;
  url: string | null;
  miniatura: string | null;
  /** Serie de teléfono (9:16). */
  vertical?: boolean;
  /** El ARCHIVO que se comparte (el completo, en su versión liviana). */
  compartir?: string | null;
}
interface Respuesta {
  modulo: string;
  formato: FormatoVideos;
  /** Hay una versión de teléfono: se ofrece cambiar de formato. */
  conFormatoCelular: boolean;
  lista: VideoFirmado[];
  completo: VideoFirmado | null;
}

export const VELOCIDADES = [0.75, 1, 1.25, 1.5] as const;
const CLAVE_VELOCIDAD = "fg_videos_velocidad";

function claveVelocidad(): string {
  try {
    const id = sessionStorage.getItem("fg_user_id");
    return id ? `${CLAVE_VELOCIDAD}_${id}` : CLAVE_VELOCIDAD;
  } catch {
    return CLAVE_VELOCIDAD;
  }
}
function leerVelocidad(): number {
  try {
    const v = Number(localStorage.getItem(claveVelocidad()));
    return (VELOCIDADES as readonly number[]).includes(v) ? v : 1;
  } catch {
    return 1;
  }
}
function guardarVelocidad(v: number) {
  try {
    localStorage.setItem(claveVelocidad(), String(v));
  } catch {
    /* sin almacenamiento: vale solo mientras el panel está abierto */
  }
}

// El formato elegido, recordado por quien mira (la de computadora abre por defecto).
const CLAVE_FORMATO = "fg_videos_formato";
function leerFormato(): FormatoVideos {
  try {
    return localStorage.getItem(CLAVE_FORMATO) === "celular" ? "celular" : "computadora";
  } catch {
    return "computadora";
  }
}
function guardarFormato(f: FormatoVideos) {
  try {
    localStorage.setItem(CLAVE_FORMATO, f);
  } catch {
    /* sin almacenamiento: vale solo mientras el panel está abierto */
  }
}

const IconoPlay = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
    <polygon points="7 4 20 12 7 20 7 4" />
  </svg>
);
const IconoCerrar = () => (
  <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
    <line x1="6" y1="6" x2="18" y2="18" />
    <line x1="18" y1="6" x2="6" y2="18" />
  </svg>
);

/** «Caja menuda - Registrar un gasto.mp4», sin los signos que un sistema de archivos no acepta. */
export function nombreDelArchivo(modulo: string, titulo: string): string {
  return `${modulo} - ${titulo}`.replace(/[\\/:*?"<>|¿]/g, "").replace(/\s+/g, " ").trim() + ".mp4";
}

/**
 * 🔴 EL ARCHIVO SE ARMA ANTES DEL TOQUE (como el PDF de Despachos): iOS no abre
 * la hoja de compartir si el toque espera una descarga. Se baja al elegir el
 * video y el botón dice «Preparando…» hasta que está.
 */
function useArchivoParaCompartir(modulo: string | null, video: VideoFirmado | null) {
  const [estado, setEstado] = useState<{ para: VideoFirmado; archivo: File | null; fallo: boolean } | null>(null);
  const [intento, setIntento] = useState(0);
  useEffect(() => {
    const url = video?.compartir ?? video?.url;
    if (!modulo || !video || !url) return;
    const ctl = new AbortController();
    setEstado({ para: video, archivo: null, fallo: false });
    fetch(url, { signal: ctl.signal })
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.blob();
      })
      .then((b) => setEstado({ para: video, archivo: new File([b], nombreDelArchivo(modulo, video.titulo), { type: "video/mp4" }), fallo: false }))
      .catch(() => !ctl.signal.aborted && setEstado({ para: video, archivo: null, fallo: true }));
    return () => ctl.abort();
  }, [modulo, video, intento]);
  const actual = estado?.para === video ? estado : null;
  return { archivo: actual?.archivo ?? null, fallo: !!actual?.fallo, reintentar: () => setIntento((n) => n + 1) };
}

/**
 * «Curvas de tallas por caja ›». En el celular abre la hoja de compartir con el
 * PDF (bajado ANTES del toque, como en Despachos: iOS bloquea la hoja si el
 * toque espera una descarga); en la computadora, o si aún no está, es un enlace
 * que abre el PDF en otra pestaña.
 */
function RenglonCurvas({ pdf, modulo }: { pdf: PdfDeCurvas; modulo: string }) {
  const [archivo, setArchivo] = useState<File | null>(null);
  const enComputadora = aparatoDeQuienMira() === "computadora";
  useEffect(() => {
    if (enComputadora) return;
    const ctl = new AbortController();
    fetch(pdf.href, { signal: ctl.signal })
      .then((r) => (r.ok ? r.blob() : null))
      .then((b) => b && setArchivo(new File([b], pdf.nombre, { type: "application/pdf" })))
      .catch(() => {
        /* sin el archivo, el renglón sigue siendo un enlace */
      });
    return () => ctl.abort();
  }, [pdf, enComputadora]);

  const alTocar = async (e: React.MouseEvent) => {
    // 🩸 27-nov-2026: con el dedo el enlace NUNCA navega —en la app instalada
    // dejaba la pantalla atrapada en el PDF, sin «volver»—. Si el archivo no
    // llegó todavía, el toque espera al siguiente.
    if (!enComputadora) e.preventDefault();
    if (archivo) {
      e.preventDefault();
      const resultado = await compartirArchivo(archivo, { title: archivo.name });
      if (resultado !== "cancelado") logActivityClient({ action: "compartir_curvas", module: modulo, details: { archivo: pdf.href, resultado } });
    }
  };

  return (
    <a
      href={pdf.href}
      target="_blank"
      rel="noopener"
      data-curvas-tallas={pdf.href}
      onClick={alTocar}
      className="flex min-h-[44px] items-center justify-between rounded-lg border border-gray-200 px-3 text-sm text-gray-900 transition hover:border-gray-400 active:scale-[0.99]"
    >
      Curvas de tallas por caja
      <span aria-hidden="true" className="text-lg leading-none text-gray-400">›</span>
    </a>
  );
}

function useEsComputadora(): boolean {
  const [pc, setPc] = useState(false);
  useEffect(() => {
    // Sin matchMedia (navegador viejo, jsdom) se queda en celular: la hoja sirve en las dos.
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(min-width: 640px)");
    const cambio = () => setPc(mq.matches);
    cambio();
    mq.addEventListener("change", cambio);
    return () => mq.removeEventListener("change", cambio);
  }, []);
  return pc;
}

function Contenido({ modulo, curvas, onClose }: { modulo: string; curvas?: PdfDeCurvas | null; onClose: () => void }) {
  // `modulo` es la key (`guias`); el nombre del archivo lleva el rótulo («Despachos»).
  const [datos, setDatos] = useState<Respuesta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actual, setActual] = useState<VideoFirmado | null>(null);
  const [reproducir, setReproducir] = useState(false);
  const [velocidad, setVelocidad] = useState(1);
  const [formato, setFormato] = useState<FormatoVideos>(leerFormato);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => setVelocidad(leerVelocidad()), []);
  const { archivo, fallo, reintentar } = useArchivoParaCompartir(datos?.modulo ?? null, actual);
  const enComputadora = aparatoDeQuienMira() === "computadora";

  // En el celular, la hoja de compartir (WhatsApp); en la computadora, se descarga.
  const compartir = async () => {
    if (!archivo || !actual) return;
    const resultado = enComputadora ? (descargarArchivo(archivo), "descargado") : await compartirArchivo(archivo, { title: archivo.name });
    if (resultado !== "cancelado") {
      logActivityClient({ action: "compartir_video", module: modulo, details: { titulo: actual.titulo, resultado } });
    }
  };

  useEffect(() => {
    let vivo = true;
    fetch(`/api/videos-ayuda?modulo=${encodeURIComponent(modulo)}&formato=${formato}`)
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error || "No se pudieron cargar los videos. Vuelve a intentarlo en un momento.");
        return j as Respuesta;
      })
      .then((j) => {
        if (!vivo) return;
        setDatos(j);
        setActual(j.lista[0] ?? null);
        setReproducir(false);
      })
      .catch((e: Error) => vivo && setError(e.message));
    return () => {
      vivo = false;
    };
  }, [modulo, formato]);

  const cambiarFormato = () => {
    const otro: FormatoVideos = formato === "celular" ? "computadora" : "celular";
    setFormato(otro);
    guardarFormato(otro);
  };

  // iPhone Safari vuelve a 1× al cambiar de video: se aplica en cada carga.
  const aplicarVelocidad = () => {
    const v = videoRef.current;
    if (!v) return;
    v.defaultPlaybackRate = velocidad;
    v.playbackRate = velocidad;
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => aplicarVelocidad(), [velocidad, actual]);

  const elegir = (v: VideoFirmado) => {
    setActual(v);
    setReproducir(true);
  };
  const cambiarVelocidad = (v: number) => {
    setVelocidad(v);
    guardarVelocidad(v);
  };

  const total = datos?.lista.length ?? 0;
  const minutos = datos?.completo ? Math.round(datos.completo.segundos / 60) : 0;

  return (
    <div className="flex flex-col gap-3 pb-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-gray-900">Cómo se usa</h2>
          {datos && (
            <p className="text-sm text-gray-500">
              {datos.modulo} · {total} {total === 1 ? "video" : "videos"}
            </p>
          )}
        </div>
        <button
          onClick={onClose}
          aria-label="Cerrar"
          className="-mr-2 inline-flex h-11 w-11 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-900"
        >
          <IconoCerrar />
        </button>
      </div>

      {curvas && <RenglonCurvas pdf={curvas} modulo={modulo} />}

      {modulo === "asistencia" && (
        <details data-reglas-asistencia className="group rounded-lg border border-gray-200 bg-white">
          <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between px-3 text-sm font-medium text-gray-900">
            Reglas de asistencia
            <span aria-hidden className="text-gray-400 transition group-open:rotate-90">›</span>
          </summary>
          <div className="border-t border-gray-100 p-3">
            <ReglasDeAsistencia />
          </div>
        </details>
      )}

      {error && <Aviso tono="error">{error}</Aviso>}
      {!datos && !error && <p className="py-10 text-center text-sm text-gray-500">Cargando videos…</p>}

      {datos && actual && (
        <>
          <video
            key={actual.url ?? actual.titulo}
            ref={videoRef}
            src={actual.url ?? undefined}
            poster={actual.miniatura ?? undefined}
            controls
            playsInline
            preload="metadata"
            autoPlay={reproducir}
            onLoadedMetadata={aplicarVelocidad}
            onPlay={aplicarVelocidad}
            className={
              actual.vertical
                ? // 9:16 a lo alto que quepa, centrado: en 16:9 quedaba una tira angosta.
                  "mx-auto aspect-[9/16] h-[min(62vh,560px)] max-w-full rounded-lg border border-gray-200 bg-black"
                : "aspect-video w-full rounded-lg border border-gray-200 bg-black"
            }
          />
          <div className="flex items-center justify-between gap-2">
            <p className="min-w-0 text-sm text-gray-900">
              <span className="font-medium">{actual.titulo}</span>
              <span className="text-gray-500"> · {duracion(actual.segundos)}</span>
            </p>
            <button
              type="button"
              data-compartir-video
              onClick={fallo ? reintentar : compartir}
              disabled={!archivo && !fallo}
              className="inline-flex min-h-[44px] shrink-0 items-center rounded-md border border-gray-200 px-3 text-sm text-gray-900 transition hover:border-gray-400 active:scale-[0.97] disabled:text-gray-400"
            >
              {fallo ? "Reintentar" : !archivo ? "Preparando…" : enComputadora ? "Descargar" : "Compartir"}
            </button>
          </div>
          <div className="-my-1 flex items-center gap-0.5" role="group" aria-label="Velocidad">
            <span className="mr-1 text-xs text-gray-500">Velocidad</span>
            {VELOCIDADES.map((v) => (
              <button
                key={v}
                onClick={() => cambiarVelocidad(v)}
                aria-pressed={velocidad === v}
                className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center"
              >
                <span
                  className={`rounded-full border px-2.5 py-1 text-xs tabular-nums transition ${
                    velocidad === v
                      ? "border-gray-900 font-medium text-gray-900"
                      : "border-gray-200 text-gray-500 hover:border-gray-400"
                  }`}
                >
                  {String(v)}×
                </span>
              </button>
            ))}
          </div>
          {datos.completo && (
            <button
              onClick={() => elegir(datos.completo!)}
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-md bg-black px-4 text-sm font-medium text-white transition hover:bg-gray-800 active:scale-[0.97]"
            >
              <IconoPlay /> Ver todo ({minutos} min)
            </button>
          )}
          {datos.conFormatoCelular && (
            <button
              type="button"
              data-cambiar-formato
              onClick={cambiarFormato}
              className="-my-1 inline-flex min-h-[44px] items-center self-start text-sm text-blue-600 hover:underline"
            >
              {formato === "celular" ? "Ver en formato computadora" : "Ver en formato celular"}
            </button>
          )}
          <ul className="divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-200">
            {datos.lista.map((v) => {
              const activo = actual === v;
              return (
                <li key={v.orden}>
                  <button
                    onClick={() => elegir(v)}
                    aria-current={activo || undefined}
                    className={`flex w-full items-center gap-3 p-2.5 text-left transition hover:bg-gray-50 ${activo ? "bg-gray-50" : ""}`}
                  >
                    <span className="relative block aspect-video w-28 shrink-0 overflow-hidden rounded border border-gray-200 bg-gray-100">
                      {v.miniatura && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={v.miniatura} alt="" width={112} height={63} loading="lazy" className={`h-full w-full ${v.vertical ? "bg-black object-contain" : "object-cover"}`} />
                      )}
                      <span className="absolute inset-0 flex items-center justify-center">
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-gray-900">
                          <IconoPlay size={12} />
                        </span>
                      </span>
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm text-gray-900">{tituloEnLista(v)}</span>
                      <span className="block text-sm text-gray-500 tabular-nums">
                        {activo && reproducir ? "Reproduciendo · " : ""}
                        {duracion(v.segundos)}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}

export default function VideosAyuda({
  modulo,
  curvas,
  open,
  onClose,
}: {
  modulo: string;
  /** El PDF de curvas de tallas de esta dirección (`curvasDeLaRuta`). */
  curvas?: PdfDeCurvas | null;
  open: boolean;
  onClose: () => void;
}) {
  const pc = useEsComputadora();
  useEscapeClose(open && pc, onClose);

  if (!open) return null;
  if (!pc) {
    return (
      <BottomSheet open={open} onClose={onClose}>
        <Contenido modulo={modulo} curvas={curvas} onClose={onClose} />
      </BottomSheet>
    );
  }
  return (
    <EnElCuerpo>
      {/* modal-cabe: panel lateral de alto completo (inset-y-0) con su propio scroll; ya cabe en la ventana. */}
      <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Cómo se usa">
        <div className="absolute inset-0 bg-black/30" onClick={onClose} />
        <aside className="absolute inset-y-0 right-0 w-[420px] max-w-full overflow-y-auto border-l border-gray-200 bg-white px-5 pt-4">
          <Contenido modulo={modulo} curvas={curvas} onClose={onClose} />
        </aside>
      </div>
    </EnElCuerpo>
  );
}

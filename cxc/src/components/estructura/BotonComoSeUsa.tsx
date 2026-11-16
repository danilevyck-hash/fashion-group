"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 «CÓMO SE USA» ES UN «?» EN EL ENCABEZADO, junto al usuario (Daniel,
// 15-nov-2026: «Confío»). El MISMO lugar en todo módulo con videos, en el
// celular y en la computadora; ya no vive en ningún «···».
//
// El módulo sale de la DIRECCIÓN (`moduloDeRuta`), igual que las novedades:
// así ninguna pantalla tiene que acordarse de montarlo. `/home` es el Inicio.
// Quién puede ver los videos lo sigue decidiendo `/api/videos-ayuda`.
//
// `flotante`: en el celular va en un portal sobre `body`, a la izquierda del
// avatar flotante; la fila del título le deja sitio (`globals.css`).
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import VideosAyuda from "@/components/VideosAyuda";
import { ALL_MODULES } from "@/lib/modules";
import { moduloDeRuta } from "@/lib/novedades/seleccion";
import { VIDEOS_AYUDA_2026_11 } from "@/lib/ui/videos-ayuda-2026-11";
import { tieneVideos, VIDEOS_DEL_INICIO } from "@/lib/videos-ayuda/manifiesto";

/** La clase que avisa a la fila del título que el «?» también está arriba. */
export const CLASE_BODY_CON_AYUDA = "fg-con-ayuda";

/** La key de los videos de esta dirección, o null si no tiene. */
export function videosDeLaRuta(pathname: string | null): string | null {
  if (!VIDEOS_AYUDA_2026_11 || !pathname) return null;
  const key = pathname === "/home" ? VIDEOS_DEL_INICIO : moduloDeRuta(pathname, ALL_MODULES);
  return key && tieneVideos(key) ? key : null;
}

export default function BotonComoSeUsa({ flotante = false, className = "" }: { flotante?: boolean; className?: string }) {
  const modulo = videosDeLaRuta(usePathname());
  const [abierto, setAbierto] = useState(false);

  useEffect(() => {
    if (!flotante || !modulo) return;
    document.body.classList.add(CLASE_BODY_CON_AYUDA);
    return () => document.body.classList.remove(CLASE_BODY_CON_AYUDA);
  }, [flotante, modulo]);

  if (!modulo) return null;

  const boton = (
    <button
      type="button"
      data-como-se-usa
      onClick={() => setAbierto(true)}
      aria-label="Cómo se usa"
      title="Cómo se usa"
      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-gray-500 transition hover:bg-gray-100 hover:text-gray-900 active:scale-[0.97] ${flotante ? "absolute z-20 sm:hidden" : ""} ${className}`}
      style={flotante ? { top: "calc(env(safe-area-inset-top, 0px) + 4px)", right: 56 } : undefined}
    >
      <span aria-hidden="true" className="flex h-7 w-7 items-center justify-center rounded-full border border-gray-300 text-[15px] font-semibold leading-none">
        ?
      </span>
    </button>
  );

  return (
    <>
      {flotante ? (typeof document === "undefined" ? null : createPortal(boton, document.body)) : boton}
      <VideosAyuda modulo={modulo} open={abierto} onClose={() => setAbierto(false)} />
    </>
  );
}

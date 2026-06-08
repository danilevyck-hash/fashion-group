"use client";

// Modo viaje PR-4 — aviso discreto "Nueva versión disponible · Recargar".
//
// Cuando un deploy nuevo genera otro service worker, Serwist lo deja en estado
// "waiting" (el SW del proyecto usa skipWaiting=false: nunca toma control en
// silencio). Aquí escuchamos ese evento y mostramos un toast discreto. Al tocar
// "Recargar": messageSkipWaiting() → el SW nuevo activa → controllerchange →
// recargamos la página. NUNCA recargamos solos (decisión cerrada del plan).
//
// Este componente es además el ÚNICO registrador del SW: next.config tiene
// register:false para que @serwist/window controle el ciclo de vida.

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Serwist } from "@serwist/window";

const PUBLIC_PREFIXES = ["/catalogo-publico", "/pedido-reebok"];

export default function UpdatePrompt() {
  const pathname = usePathname() || "";
  const [show, setShow] = useState(false);
  const [reloading, setReloading] = useState(false);
  const serwistRef = useRef<Serwist | null>(null);
  // Solo recargamos si el usuario tocó "Recargar" en ESTA pestaña: evita que un
  // skipWaiting disparado en otra pestaña recargue esta de sorpresa.
  const clickedRef = useRef(false);

  useEffect(() => {
    // En dev el SW está deshabilitado (no se genera /sw.js); registrarlo daría 404.
    if (process.env.NODE_ENV !== "production") return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    const serwist = new Serwist("/sw.js", { scope: "/" });
    serwistRef.current = serwist;

    // Un SW nuevo quedó en espera → ofrecer recarga.
    const onWaiting = () => setShow(true);
    // El SW nuevo tomó control → recargar (solo si el usuario lo pidió aquí).
    const onControlling = () => {
      if (clickedRef.current) window.location.reload();
    };

    serwist.addEventListener("waiting", onWaiting);
    serwist.addEventListener("controlling", onControlling);
    void serwist.register();

    return () => {
      serwist.removeEventListener("waiting", onWaiting);
      serwist.removeEventListener("controlling", onControlling);
    };
  }, []);

  function reload() {
    clickedRef.current = true;
    setReloading(true);
    serwistRef.current?.messageSkipWaiting();
    // Red de seguridad: si controllerchange no llega (algunos navegadores con el
    // SW ya activo), recargamos igual tras un instante.
    window.setTimeout(() => window.location.reload(), 2000);
  }

  if (!show) return null;
  if (pathname === "/" || PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-[60] px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pointer-events-none">
      <div className="pointer-events-auto mx-auto flex max-w-sm items-center gap-3 rounded-lg bg-gray-900 px-4 py-2.5 text-white shadow-lg">
        <span className="min-w-0 flex-1 text-sm">Nueva versión disponible</span>
        <button
          onClick={reload}
          disabled={reloading}
          className="shrink-0 rounded-md bg-white px-3 py-1.5 text-sm font-medium text-gray-900 transition active:scale-[0.97] disabled:opacity-60"
        >
          {reloading ? "Actualizando…" : "Recargar"}
        </button>
        <button
          onClick={() => setShow(false)}
          aria-label="Cerrar"
          className="shrink-0 -mr-1 p-1.5 text-gray-400 transition hover:text-white"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>
  );
}

"use client";

// Modo viaje — registrador del service worker + actualización CONTROLADA.
//
// next.config tiene register:false para que @serwist/window controle el ciclo de
// vida; este componente es el ÚNICO que registra el SW, así que NO se puede borrar
// sin romper la lectura offline / Modo Viaje.
//
// Sin banner visible (suprimido en #129). El SW nuevo no toma control en silencio
// (sw.ts mantiene skipWaiting:false). En su lugar, cuando hay un build nuevo en
// espera, lo aplicamos en la PRÓXIMA NAVEGACIÓN NATURAL del usuario:
//   1. "waiting"          → marcamos updatePending.
//   2. cambia la URL      → messageSkipWaiting() (el usuario navegó a propósito).
//   3. controllerchange   → window.location.reload() una sola vez, ya en la URL
//                           destino, cargando el build fresco.
// Escribir en un formulario NO cambia la URL, así que el reload nunca cae a media
// tarea. Esto elimina el desfase build-viejo↔server-nuevo que producía un 404 al
// navegar tras un deploy.

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Serwist } from "@serwist/window";

export default function UpdatePrompt() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const serwistRef = useRef<Serwist | null>(null);
  const updatePending = useRef(false);
  const firstNav = useRef(true);

  // Registro del SW + listeners de ciclo de vida (una sola vez al montar).
  useEffect(() => {
    // En dev el SW está deshabilitado (no se genera /sw.js); registrarlo daría 404.
    if (process.env.NODE_ENV !== "production") return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    const serwist = new Serwist("/sw.js", { scope: "/" });
    serwistRef.current = serwist;

    // Build nuevo instalado y en espera → lo aplicamos en la próxima navegación.
    serwist.addEventListener("waiting", () => {
      updatePending.current = true;
    });

    // Si ya había un controller al cargar, un controllerchange = actualización real
    // (en la primera instalación no hay controller y NO debemos recargar).
    const hadController = !!navigator.serviceWorker.controller;
    let refreshing = false;
    const onControllerChange = () => {
      if (refreshing || !hadController) return;
      refreshing = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    // Detección rápida en sesiones largas: al volver a la app, verifica sw.js.
    // Las navegaciones SPA no disparan el byte-check del navegador por sí solas;
    // update() solo comprueba el SW, no recarga nada.
    const onVisible = () => {
      if (document.visibilityState === "visible") void serwist.update();
    };
    document.addEventListener("visibilitychange", onVisible);

    void serwist.register();

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  // En cada navegación natural (cambia pathname o search), si hay un build nuevo en
  // espera, lo activamos. messageSkipWaiting → el SW nuevo reclama la pestaña →
  // controllerchange → reload (arriba). El primer render no cuenta como navegación.
  useEffect(() => {
    if (firstNav.current) {
      firstNav.current = false;
      return;
    }
    if (updatePending.current && serwistRef.current) {
      updatePending.current = false;
      serwistRef.current.messageSkipWaiting();
    }
  }, [pathname, searchParams]);

  // Sin UI / sin banner: solo registra y orquesta la actualización.
  return null;
}

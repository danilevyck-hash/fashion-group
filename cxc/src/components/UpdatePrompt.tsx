"use client";

// Modo viaje — registrador del service worker.
//
// next.config tiene register:false para que @serwist/window controle el ciclo de
// vida; este componente es el ÚNICO que registra el SW, así que NO se puede borrar
// sin romper la lectura offline / Modo Viaje.
//
// El banner visible "Nueva versión disponible · Recargar" fue SUPRIMIDO (Daniel,
// jun 2026): los usuarios reciben la versión nueva al relanzar la app. skipWaiting
// sigue en false (sw.ts intacto) → el SW nuevo queda en "waiting" y toma control
// cuando se cierran todas las pestañas/se relanza la PWA. Conservamos el registro
// del SW para no romper el cacheo offline; solo dejamos de mostrar el toast.

import { useEffect } from "react";
import { Serwist } from "@serwist/window";

export default function UpdatePrompt() {
  useEffect(() => {
    // En dev el SW está deshabilitado (no se genera /sw.js); registrarlo daría 404.
    if (process.env.NODE_ENV !== "production") return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    const serwist = new Serwist("/sw.js", { scope: "/" });
    void serwist.register();
  }, []);

  // Sin banner: el SW se registra en el efecto de arriba, pero no se renderiza UI.
  return null;
}

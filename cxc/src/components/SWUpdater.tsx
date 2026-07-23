"use client";

// Registrador del service worker + actualización SILENCIOSA (PWA simplificada).
//
// next.config tiene register:false para que @serwist/window controle el ciclo
// de vida; este componente es el ÚNICO que registra el SW.
//
// Comportamiento (sin NINGUNA UI de versión — ni toast, ni banner, ni botón):
//   1. sw.ts trae skipWaiting:true + clientsClaim:true → el SW nuevo activa y
//      reclama la pestaña solo. Si aun así quedara un SW en "waiting" (carrera
//      entre versiones), aquí se le manda messageSkipWaiting() de inmediato.
//   2. controllerchange → window.location.reload() UNA vez, con dos guards:
//      - formulario sucio: si el usuario tiene foco en un input/textarea/select
//        con contenido, el reload se DIFIERE hasta blur/submit/ocultar la app
//        (motivo original del diseño viejo: nunca recargar a media escritura).
//      - anti-loop: sessionStorage con timestamp; si ya recargamos hace <1 min
//        por SW, no volvemos a recargar (evita ciclos si algo va mal).
//   3. Al volver a la app (visibilitychange) → serwist.update() re-chequea
//      /sw.js, así los cold-open y sesiones largas detectan el build nuevo.

import { useEffect, useRef } from "react";
import { Serwist } from "@serwist/window";
import { isChunkError, attemptChunkRecovery } from "@/lib/chunk-recovery";

const RELOAD_GUARD_KEY = "fg_sw_reloaded";
const RELOAD_GUARD_MS = 60_000;

/**
 * true si el usuario está a media escritura: un control editable con foco y
 * contenido. En ese caso el swap/reload se difiere para no perderle el trabajo
 * (los drafts de useDraftAutoSave cubren el resto como red de seguridad).
 */
function isFormDirty(): boolean {
  if (typeof document === "undefined") return false;
  const el = document.activeElement;
  if (!el) return false;
  if (el instanceof HTMLInputElement) {
    const nonText = ["button", "submit", "reset", "checkbox", "radio", "range", "file", "hidden"];
    if (nonText.includes(el.type)) return false;
    return el.value.length > 0;
  }
  if (el instanceof HTMLTextAreaElement) return el.value.length > 0;
  if (el instanceof HTMLSelectElement) return true; // select abierto/en foco = interacción a medias
  if (el instanceof HTMLElement && el.isContentEditable) return true;
  return false;
}

export default function SWUpdater() {
  const serwistRef = useRef<Serwist | null>(null);

  useEffect(() => {
    // En dev el SW está deshabilitado (no se genera /sw.js); registrarlo daría 404.
    if (process.env.NODE_ENV !== "production") return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    // Higiene: los snapshots del Modo Viaje eliminado quedaron en localStorage
    // de los dispositivos ya instalados — se limpian una vez aquí.
    try {
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith("fg_snap_") || key.startsWith("fg_cache_")) localStorage.removeItem(key);
      }
    } catch {
      /* localStorage no disponible — ignorar */
    }

    const serwist = new Serwist("/sw.js", { scope: "/" });
    serwistRef.current = serwist;

    // Acción pendiente diferida por formulario sucio: se reintenta al soltar
    // el foco (focusout), al ocultar la app o al enviar un formulario.
    let pendingAction: (() => void) | null = null;
    const runOrDefer = (action: () => void) => {
      if (!isFormDirty()) {
        pendingAction = null;
        action();
        return;
      }
      pendingAction = action;
    };
    const retryPending = () => {
      if (!pendingAction || isFormDirty()) return;
      const action = pendingAction;
      pendingAction = null;
      action();
    };
    window.addEventListener("focusout", retryPending);
    window.addEventListener("submit", retryPending, true);

    // Con skipWaiting:true en sw.ts esto casi nunca dispara, pero si un SW
    // queda en waiting (carrera de versiones), se activa de inmediato.
    serwist.addEventListener("waiting", () => {
      runOrDefer(() => serwist.messageSkipWaiting());
    });

    // Si ya había un controller al cargar, un controllerchange = actualización
    // real (en la primera instalación no hay controller y NO debemos recargar).
    const hadController = !!navigator.serviceWorker.controller;
    let refreshing = false;
    const doReload = () => {
      if (refreshing) return;
      // Anti-loop: si ya recargamos por SW hace <1 min, no ciclar.
      try {
        const last = Number(sessionStorage.getItem(RELOAD_GUARD_KEY) || 0);
        if (Date.now() - last < RELOAD_GUARD_MS) return;
        sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now()));
      } catch {
        /* sin sessionStorage: recargar igual, refreshing evita el doble en esta pestaña */
      }
      refreshing = true;
      window.location.reload();
    };
    const onControllerChange = () => {
      if (!hadController) return;
      runOrDefer(doReload);
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    // Al volver a la app: re-chequear /sw.js (las navegaciones SPA no disparan
    // el byte-check del navegador solas) y reintentar acciones diferidas.
    const onVisible = () => {
      if (document.visibilityState !== "visible") {
        // La app se ocultó: si había reload diferido por formulario sucio, es
        // el momento seguro de aplicarlo (el usuario ya no está escribiendo).
        retryPending();
        return;
      }
      void serwist.update();
    };
    document.addEventListener("visibilitychange", onVisible);

    // Red de seguridad residual: chunk 404 / import dinámico fallido tras un
    // deploy (buildId viejo purgado en Vercel) → recovery una-sola-vez.
    const onError = (e: ErrorEvent) => {
      if (e.message && isChunkError(e.message)) void attemptChunkRecovery();
    };
    const onRejection = (e: PromiseRejectionEvent) => {
      const reason = e.reason as { message?: string } | undefined;
      const msg = typeof reason?.message === "string" ? reason.message : String(e.reason ?? "");
      if (isChunkError(msg)) void attemptChunkRecovery();
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);

    void serwist.register();

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focusout", retryPending);
      window.removeEventListener("submit", retryPending, true);
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  // Sin UI: solo registra y orquesta la actualización.
  return null;
}

/// <reference lib="webworker" />
//
// Service worker base (Modo viaje — Fase 1, PR-1).
//
// Compilado por @serwist/next (NO por el tsc principal: este archivo está
// excluido en tsconfig.json porque usa tipos de WebWorker que el lib del
// proyecto no incluye). El resultado se emite a public/sw.js (gitignored).
//
// Alcance de ESTE PR: app shell precacheado + caching estático seguro +
// navegación NetworkFirst con fallback offline. Las APIs quedan Network-only
// a propósito: cachear datos financieros sin el banner "datos de hace X"
// (que llega en un PR posterior) mostraría cifras viejas como frescas.

import { CacheFirst, NetworkFirst, NetworkOnly, Serwist, StaleWhileRevalidate } from "serwist";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    // Inyectado por @serwist/next en build: el manifest de precache (app shell).
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  // skipWaiting / clientsClaim quedan en false a propósito: el SW nuevo ESPERA,
  // nunca toma control en silencio (decisión "nunca auto-reload"). El toast
  // "Nueva versión — toca para actualizar" + skipWaiting controlado llega en
  // un PR posterior.
  navigationPreload: false,
  runtimeCaching: [
    {
      // JS/CSS content-hashed de Next: inmutables → CacheFirst.
      matcher: /\/_next\/static\/.+/i,
      handler: new CacheFirst({ cacheName: "next-static" }),
    },
    {
      // Imágenes / fuentes: SWR (sirve cache, revalida en background).
      matcher: /\.(?:png|jpg|jpeg|gif|webp|avif|svg|ico|woff2?|ttf|otf)$/i,
      handler: new StaleWhileRevalidate({ cacheName: "static-assets" }),
    },
    {
      // Navegación (documentos HTML/RSC): NetworkFirst con timeout corto →
      // offline sirve la última página cacheada.
      matcher: ({ request }) => request.mode === "navigate",
      handler: new NetworkFirst({ cacheName: "pages", networkTimeoutSeconds: 3 }),
    },
    {
      // APIs: SIN cache en este PR (incluye /api/auth*). Los datos financieros
      // solo se cachearán junto con el banner "datos de hace X". Network-only
      // evita servir cifras viejas como frescas.
      matcher: /\/api\/.+/i,
      handler: new NetworkOnly(),
    },
  ],
});

serwist.addEventListeners();

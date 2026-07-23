/// <reference lib="webworker" />
//
// Service worker MÍNIMO (PWA simplificada, jul 2026).
//
// Compilado por @serwist/next (NO por el tsc principal: este archivo está
// excluido en tsconfig.json porque usa tipos de WebWorker que el lib del
// proyecto no incluye). El resultado se emite a public/sw.js (gitignored).
//
// Filosofía: la app es SIEMPRE online (el Modo Viaje / lectura offline se
// eliminó — nunca se usó). El SW solo hace dos cosas:
//   1. Cachear assets inmutables (/_next/static con hash de contenido) e
//      imágenes/fuentes — menos red en cada apertura, cero riesgo de staleness
//      porque el contenido de esas URLs nunca cambia.
//   2. Tomar control INMEDIATO al haber build nuevo (skipWaiting+clientsClaim)
//      y borrar todos los caches viejos en activate. El swap silencioso +
//      reload lo orquesta SWUpdater en el cliente.
//
// Navegación y APIs: SIN handler → van directo a la red (comportamiento
// nativo del navegador). Sin cache de páginas, sin fallback offline.

import { CacheFirst, ExpirationPlugin, Serwist, StaleWhileRevalidate } from "serwist";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    // Inyectado por @serwist/next en build. Ya NO se precachea (sin offline el
    // precache del app shell no aporta), pero el plugin exige que el punto de
    // inyección exista en el fuente — por eso se referencia y se descarta.
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

// Punto de inyección requerido por @serwist/next; el manifest se descarta a
// propósito (sin precache).
void self.__SW_MANIFEST;

// Caches vivos de ESTA versión. Cualquier cache con otro nombre (legacy:
// "pages", "next-static", "static-assets", precache de Serwist) se borra en
// activate — limpia los iPads/iPhones que ya tenían el SW viejo instalado.
const STATIC_CACHE = "fg-static-v2";
const ASSETS_CACHE = "fg-assets-v2";

const serwist = new Serwist({
  precacheEntries: [],
  // Control inmediato y silencioso: el SW nuevo no espera en "waiting" ni
  // necesita que el usuario navegue — activa, reclama los clients y el
  // cliente (SWUpdater) recarga una vez (con guard de formulario sucio).
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: false,
  runtimeCaching: [
    {
      // JS/CSS content-hashed de Next: inmutables → CacheFirst. El riesgo de
      // buildId muerto (chunk 404 tras deploy) lo cubre el swap inmediato +
      // recovery una-sola-vez (chunk-recovery.ts), no el cache.
      matcher: /\/_next\/static\/.+/i,
      handler: new CacheFirst({
        cacheName: STATIC_CACHE,
        plugins: [new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 30 * 24 * 60 * 60 })],
      }),
    },
    {
      // Imágenes / fuentes: SWR (sirve cache, revalida en background).
      matcher: /\.(?:png|jpg|jpeg|gif|webp|avif|svg|ico|woff2?|ttf|otf)$/i,
      handler: new StaleWhileRevalidate({
        cacheName: ASSETS_CACHE,
        plugins: [new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 30 * 24 * 60 * 60 })],
      }),
    },
    // Navegación y /api/*: sin entrada aquí = el SW no intercepta → red directa.
  ],
});

// Limpieza en activate: borrar TODO cache que no sea de esta versión.
// Cubre los legacy del Modo Viaje ("pages", "next-static", "static-assets")
// y cualquier precache viejo de Serwist en dispositivos ya instalados.
self.addEventListener("activate", (event) => {
  const keep = new Set([STATIC_CACHE, ASSETS_CACHE]);
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((n) => !keep.has(n)).map((n) => caches.delete(n))))
      .catch(() => undefined),
  );
});

serwist.addEventListeners();

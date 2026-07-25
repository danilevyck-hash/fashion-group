const { withSentryConfig } = require("@sentry/nextjs");

// Serwist (PWA / service worker). El plugin compila `swSrc` aparte y emite el
// SW a `public/sw.js` (gitignored). Deshabilitado en dev para no cachear assets
// de desarrollo. register:false → el SW lo registra el componente SWUpdater
// vía @serwist/window (actualización silenciosa: skipWaiting+clientsClaim en
// sw.ts + reload con guard de formulario sucio en el cliente).
// reloadOnOnline:false → el reload lo orquesta SWUpdater, no el plugin. Se compone con Sentry abajo.
const withSerwist = require("@serwist/next").default({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV !== "production",
  register: false,
  reloadOnOnline: false,
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
      },
    ],
  },
  compress: true,
  poweredByHeader: false,
  // Slugs de grupo viejos (6 grupos → 3). "ventas-clientes" y "operacion"
  // sobreviven con el mismo slug; "sistema" pasó a llamarse "administracion"
  // con los mismos módulos; "plata-entra", "plata-sale" y "productos" se
  // repartieron entre los grupos nuevos, así que van al home. Temporales
  // (307) para no quemar el redirect en el caché del navegador.
  async redirects() {
    return [
      { source: "/g/sistema", destination: "/g/administracion", permanent: false },
      { source: "/g/plata-entra", destination: "/home", permanent: false },
      { source: "/g/plata-sale", destination: "/home", permanent: false },
      { source: "/g/productos", destination: "/home", permanent: false },
    ];
  },
  experimental: {
    // sharp es un binario nativo: externalizarlo evita que webpack lo empaquete
    // (requerido para que funcione en las funciones serverless de Vercel).
    serverComponentsExternalPackages: ["sharp"],
    // Router Cache (client-side) de rutas dinámicas: al volver a un server
    // component (Ventas, Comisiones, el lado server de Cheques/Reclamos) dentro
    // de 30s, Next reusa el payload RSC cacheado en el cliente en vez de re-pedir
    // al server → navegación instantánea. Es solo caché de navegación: un reload
    // duro o pasados los 30s trae fresco. Complementa SWR (que cachea el fetch
    // del lado cliente); juntos cubren ambas arquitecturas. (SWR Fase 0.)
    staleTimes: {
      dynamic: 30,
    },
  },
};

module.exports = withSentryConfig(withSerwist(nextConfig), {
  silent: true,
  org: "fashion-group",
  project: "fashion-group",
  widenClientFileUpload: true,
  disableLogger: true,
});

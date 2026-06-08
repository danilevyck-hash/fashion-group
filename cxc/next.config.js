const { withSentryConfig } = require("@sentry/nextjs");

// Serwist (PWA / service worker). El plugin compila `swSrc` aparte y emite el
// SW a `public/sw.js` (gitignored). Deshabilitado en dev para no cachear assets
// de desarrollo. register:false → el SW lo registra el componente UpdatePrompt
// vía @serwist/window, para controlar el ciclo waiting→controlling y mostrar el
// toast "Nueva versión · Recargar" (Modo viaje PR-4).
// reloadOnOnline:false → nunca recargar la página por su cuenta. Se compone con Sentry abajo.
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
  experimental: {
    // sharp es un binario nativo: externalizarlo evita que webpack lo empaquete
    // (requerido para que funcione en las funciones serverless de Vercel).
    serverComponentsExternalPackages: ["sharp"],
  },
};

module.exports = withSentryConfig(withSerwist(nextConfig), {
  silent: true,
  org: "fashion-group",
  project: "fashion-group",
  widenClientFileUpload: true,
  disableLogger: true,
});

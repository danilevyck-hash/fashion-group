const { withSentryConfig } = require("@sentry/nextjs");

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

module.exports = withSentryConfig(nextConfig, {
  silent: true,
  org: "fashion-group",
  project: "fashion-group",
  widenClientFileUpload: true,
  disableLogger: true,
});

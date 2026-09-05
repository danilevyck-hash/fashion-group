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
  // Skew Protection (Vercel Pro). La ventana la fija el "Maximum Age" del
  // proyecto en el panel de Vercel: por defecto 1 día, y se puede subir hasta la
  // retención de deployments del plan. (El límite fijo de 12h dejó de existir en
  // nov-2025; no hay nada que configurar acá.) Next 14 no lo activa solo: hay
  // que pasarle el id del deployment para que estampe `?dpl=<id>` en cada
  // request de asset y de server action. Vercel enruta ese request al
  // deployment que sirvió el HTML → una pestaña vieja sigue encontrando sus
  // chunks aunque ya se haya promovido otro deploy. VERCEL_DEPLOYMENT_ID es
  // variable de sistema de Vercel (existe en build y en runtime); fuera de
  // Vercel queda undefined y Next se comporta como antes.
  deploymentId: process.env.VERCEL_DEPLOYMENT_ID,
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
      // Referencia dejó de ser la 5ª pestaña de Ventas (12-ago-2026): vive en su
      // propio módulo, /referencia, con la MISMA vista. Un enlace guardado de
      // `/ventas?tab=referencia` habría caído en una pestaña que ya no existe
      // (Radix no dibuja nada si el value no tiene trigger) → se manda a la
      // pantalla viva. `has` matchea SOLO ese valor de `tab`: /ventas y sus
      // otras cuatro pestañas siguen intactas.
      // (Next arrastra la query al destino — se llega a `/referencia?tab=
      // referencia` — y no hay forma de soltarla desde acá; probado con
      // `destination: "/referencia?"` y con grupo nombrado. Es INERTE: esa
      // pantalla no lee `tab`.)
      {
        source: "/ventas",
        has: [{ type: "query", key: "tab", value: "referencia" }],
        destination: "/referencia",
        permanent: false,
      },
      // Data Health dejó de ser un módulo suelto (13-ago-2026): vive como 2ª
      // PESTAÑA de Usuarios, con la MISMA pantalla. La dirección vieja la tienen
      // en marcadores y la escriben las alertas de integridad
      // (`integrity-check-run.ts` mandó ese link a Telegram durante meses), así
      // que tiene que seguir llegando — acá, y no con un `page.tsx` que
      // redirige, para que ni siquiera se descargue la pantalla equivocada.
      // Temporal (307) como los demás: no se quema en el caché del navegador.
      { source: "/admin/data-health", destination: "/admin/usuarios?tab=data-health", permanent: false },
      // Saldos de Banco dejó de ser un módulo suelto (13-ago-2026): vive como 2ª
      // PESTAÑA de Gastos, con la MISMA pantalla. Daniel: *"y debeeria estar en
      // un solo modulo"*. La dirección vieja la tiene la tarjeta
      // "Disponibilidad" de Vista General (y cualquier marcador), así que tiene
      // que seguir llegando — acá, y no con un `page.tsx` que redirige, para que
      // ni siquiera se descargue la pantalla equivocada. Temporal (307) como los
      // demás: no se quema en el caché del navegador.
      { source: "/saldos-banco", destination: "/gastos-contabilidad?tab=saldos-banco", permanent: false },
      // El módulo se llama **Recordatorios** desde agosto, pero la dirección
      // siguió siendo `/cheques` hasta el 5-sep-2026. Ahora la pantalla vive en
      // `/recordatorios` y la vieja tiene que seguir llegando: está en
      // marcadores, en la búsqueda global y en el atajo G+Q.
      //
      // ⚠️ La `key` del módulo **sigue siendo `cheques`** (vive en
      // `role_permissions` y en `fg_users.modulos_override`): lo que cambió es
      // la URL, no el permiso. Renombrar la key dejaría sin módulo a todo el
      // mundo.
      //
      // Temporal (307) como los demás: un 308 se quema en el caché del
      // navegador y ya no se puede volver atrás sin que la gente limpie datos.
      // Las pestañas viejas (`?filter=vencen_hoy`, `?filter=pendiente`…) ya no
      // existen — la lista es UNA sola — y Next arrastra la query al destino:
      // es INERTE, esa pantalla no lee `filter`.
      { source: "/cheques", destination: "/recordatorios", permanent: false },
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
  // Saca del bundle del navegador el código de mensajes de depuración del SDK
  // (`__SENTRY_DEBUG__ = false`). Es exactamente lo que pedía `disableLogger`,
  // con el nombre que el SDK v10 espera: `disableLogger` está deprecado y avisa
  // en CADA build. NO se activa la poda del tracing: eso apagaría el
  // muestreo de trazas, que sí se usa.
  webpack: { treeshake: { removeDebugLogging: true } },
});

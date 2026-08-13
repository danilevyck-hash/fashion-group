import * as Sentry from "@sentry/nextjs";

// ⚠️ EL REPORTE DE ERRORES NO SE TOCA. Lo único que se poda acá es lo que se
// mandaba en CADA carga de pantalla sin que nadie lo mirara.
//
// 🩸 MEDIDO (12-ago-2026), y NO era la grabación de sesión. La auditoría le
// atribuyó a esa función "3-4 paquetes por carga y ~55 KB fijos"; se abrieron
// los paquetes y los tres dicen `{"type":"session"}` (510 bytes cada uno): son
// el **Release Health** de la integración `BrowserSession`, que abre y cierra
// una sesión por navegación. La grabación no está corriendo ni entra al bundle
// — se verificó que `rrweb` aparece **0 veces** en los chunks del cliente,
// porque este SDK no la trae entre sus integraciones por defecto y nadie la
// agregó. Las dos opciones de muestreo de grabación que había acá eran
// **inertes** (el SDK solo las lee si la integración está puesta) y se quitaron
// para que nadie vuelva a leerlas como "está prendida". El candado
// `src/__tests__/lib/peso-muerto-js.test.ts` impide que vuelvan.
//
// Se apaga el Release Health porque nadie lo usa —no hay ningún flujo del
// negocio ni de las alertas que mire "crash-free sessions"— y costaba 3
// peticiones por pantalla abierta, en cada visita de cada persona.
// `captureException`, `captureMessage`, los breadcrumbs y los handlers globales
// quedan EXACTAMENTE igual: ninguno depende de esta integración.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  environment: process.env.NODE_ENV,
  integrations: (defaults) =>
    defaults.filter((i) => i.name !== "BrowserSession"),
});

// ─────────────────────────────────────────────────────────────────────────────
// Qué hacer cuando el registro o la re-revisión del service worker falla.
//
// 🩸 QUÉ PASABA (reporte semanal de Sentry, 19-sep-2026).
//   `SWUpdater.tsx` llamaba `void serwist.update()` y `void serwist.register()`
//   SIN `.catch()`. Cuando un teléfono pierde señal a media carga, esa promesa
//   se rechaza, nadie la atrapa y el rechazo sube a Sentry como error:
//   «Script https://www.fashiongr.com/sw.js load failed» y «Error: Rejected».
//   A nadie se le rompe la pantalla — sin service worker la app funciona igual,
//   porque es SIEMPRE online y el SW solo cachea assets inmutables.
//
// QUÉ CAMBIA.
//   Las dos llamadas llevan `.catch()`, y el catch NO se traga el dato:
//     · quedarse sin señal es lo ESPERADO → queda como breadcrumb, sin ruido.
//     · cualquier otro motivo (un /sw.js roto, un scope mal puesto, un error de
//       seguridad) SÍ se reporta: es lo que alguien tendría que ir a arreglar.
// ─────────────────────────────────────────────────────────────────────────────

import * as Sentry from "@sentry/nextjs";

/** El texto del fallo, venga como Error, como string o como lo que sea. */
export function textoDelFallo(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  const msg = (err as { message?: unknown } | null | undefined)?.message;
  return typeof msg === "string" ? msg : String(err);
}

/** Formas conocidas de «se cayó la red a media descarga». */
const SIN_SENAL_RE =
  /load failed|failed to fetch|networkerror|network error|net::err|the operation was aborted|aborted|rejected|offline/i;

/**
 * ¿El fallo es de señal (esperado) o algo que hay que mirar?
 *
 * `enLinea` es `navigator.onLine` en el momento del fallo: estar desconectado
 * explica cualquier mensaje, incluso uno que no esté en la lista.
 */
export function esFalloDeSenal(err: unknown, enLinea: boolean): boolean {
  if (!enLinea) return true;
  return SIN_SENAL_RE.test(textoDelFallo(err));
}

/**
 * Deja rastro del fallo del service worker. Nunca lanza: si esto fallara,
 * rompería justo el camino que estaba atrapando un error.
 */
export function reportarFalloSW(accion: "register" | "update", err: unknown): void {
  try {
    const enLinea = typeof navigator === "undefined" ? true : navigator.onLine !== false;
    if (esFalloDeSenal(err, enLinea)) {
      Sentry.addBreadcrumb({
        category: "sw",
        level: "info",
        message: `service worker: ${accion} no pudo completarse sin red`,
        data: { motivo: textoDelFallo(err), enLinea },
      });
      return;
    }
    Sentry.captureException(err, {
      tags: { area: "service-worker", accion },
      extra: { motivo: textoDelFallo(err), enLinea },
    });
  } catch {
    /* reportar nunca puede romper la pantalla */
  }
}

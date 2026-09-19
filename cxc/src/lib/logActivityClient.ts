// ─────────────────────────────────────────────────────────────────────────────
// EL CONTADOR DE DESCARGAS — POR QUÉ UN CERO NO PROBABA NADA (18-sep-2026).
//
// Desde el navegador se anota una acción en `activity_logs` mandándola a
// `POST /api/activity`. Lo usan CINCO botones: los tres «Descargar en Excel»
// de Ventas (`descarga_excel`, 11-sep-2026) y los dos de Plantilla Switch
// —Tallas por bulto (`descarga_tallas`) y Fotos a mi Excel
// (`descarga_misfotos`), 4-sep-2026—.
//
// 🩸 HASTA EL 4-sep-2026 EL SERVIDOR NO PODÍA ESCRIBIR NI UNA FILA: el insert
// nombraba columnas que `activity_logs` no tiene (`user_name`, `module`), así
// que contestaba 500. Se arregló ese mismo día (`/api/activity` escribe
// `entity_type` y mete el nombre adentro de `details`), pero el defecto pasó
// meses sin verse por culpa de ESTE archivo: mandaba el POST y se tragaba
// TODO en silencio —ni siquiera miraba si la respuesta era un error—. Un cero
// en la tabla se leía igual que «nadie lo usó», y son cosas distintas.
//
// 🔴 POR ESO AHORA UN FALLO SE DICE. Sigue sin frenar nada —la descarga ya
// ocurrió y anotarla es secundario—, pero si el servidor contesta mal o la red
// falla, queda escrito en la consola del navegador. Es la diferencia entre
// «nadie lo usó» y «el contador está roto», y de eso depende una decisión:
// Daniel mira estos números para saber si una pantalla se queda o se retira.
//
// ⚠️ `keepalive: true` porque estas anotaciones salen JUSTO DESPUÉS de una
// descarga: si la persona cierra la pestaña o navega en ese instante, el
// navegador igual termina de mandar el aviso (son unos pocos bytes, muy por
// debajo del tope de 64 KB que keepalive admite).
// ─────────────────────────────────────────────────────────────────────────────

/** El camino, UNO SOLO. Escrito acá para que el candado lo pueda mirar. */
export const RUTA_ACTIVIDAD = "/api/activity";

/**
 * Anota una acción del navegador. Nunca frena ni rompe lo que la llamó.
 */
export function logActivityClient(params: {
  action: string;
  module: string;
  details?: Record<string, unknown>;
}) {
  fetch(RUTA_ACTIVIDAD, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
    keepalive: true,
  })
    .then((res) => {
      // 🔴 No se traga el error: un 401/500 acá es un contador roto, y un
      // contador roto que calla se lee como «esto no se usa».
      if (!res.ok) {
        console.warn(
          `[actividad] no se pudo anotar «${params.action}» (${params.module}): el servidor contestó ${res.status}`,
        );
      }
    })
    .catch((err) => {
      console.warn(
        `[actividad] no se pudo anotar «${params.action}» (${params.module}):`,
        err,
      );
    });
}

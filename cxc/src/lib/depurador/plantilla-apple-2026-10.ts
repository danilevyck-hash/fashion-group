// ─────────────────────────────────────────────────────────────────────────────
// PLANTILLA SWITCH ESTILO APPLE (1-oct-2026, `PLANTILLA_APPLE_2026_10`).
// APAGADO hasta el «sí» de Daniel sobre el mockup; reglas en docs/diseno.md.
//
// Pregunta de la pantalla: «¿qué archivo convierto en plantilla de Switch?».
// Medido contra producción el 1-oct-2026 (solo lectura):
//   · 155 plantillas en 90 días (~12 por semana), todas desde computadora.
//   · «Tallas por bulto»: 0 descargas desde que el contador funciona (4-sep).
//   · Facturas de tienda: 0 descargas en toda la historia y 0 fórmulas de tienda.
//
// Lo que cambia (SOLO la pantalla):
//   1. Se van las dos filas de pestañas: la pantalla abre en la caja de soltar
//      el archivo, con «Configuración» como enlace arriba a la derecha.
//   2. Debajo de la caja, «Cargas recientes» (las 5 últimas, con Descargar) y
//      «Ver historial completo».
//   3. «Tallas por bulto» pasa a un enlace al pie.
//   4. Fórmulas abre en las de importación; las de tienda, detrás de un enlace.
//
// 🔴 El Excel de 25 columnas, las fórmulas, el registro del Historial y las
// direcciones (?tab= / ?vista=) NO cambian. `false` = la pantalla de hoy.
// ─────────────────────────────────────────────────────────────────────────────

import type { Tab, Vista } from "@/app/productos/cargar/pestanas";

/** `false` = la pantalla de hoy, exactamente. */
export const PLANTILLA_APPLE_2026_10 = false;

/** Cuántas cargas se ven debajo de la caja. */
export const CARGAS_RECIENTES = 5;

/** Qué navegación se dibuja. Puro, para que el candado lo fije. */
export function navegacion(apple: boolean, tab: Tab, vista: Vista, nVistas: number) {
  if (!apple) {
    return { pestanas: true, vistas: nVistas > 1, volver: false, enlaces: false };
  }
  const inicio = tab === "plantilla" && vista === "nuevo";
  return {
    pestanas: false,
    // Solo Configuración conserva su fila (Fórmulas · Descripciones · Reglas).
    vistas: tab === "config" && nVistas > 1,
    volver: !inicio,
    enlaces: inicio,
  };
}

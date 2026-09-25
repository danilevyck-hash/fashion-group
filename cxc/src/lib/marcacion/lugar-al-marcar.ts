// ─────────────────────────────────────────────────────────────────────────────
// EL LUGAR EN PALABRAS SE RESUELVE **AL MARCAR**, UNA SOLA VEZ, Y SE GUARDA CON
// LA MARCA (25-sep-2026).
//
// 🔴 PARA TODA MARCA DEL TELÉFONO, NO SOLO PARA LAS LEJANAS. Daniel: *«Todos
// salen de la tienda, para eso es la app»* — las cinco personas que marcan por
// teléfono trabajan fuera de un local propio, así que la pregunta útil no es
// «¿está en su tienda?» sino **en qué lugar estaba**.
//
// 🔴 POR QUÉ AL INSERTAR Y NO DESPUÉS, que era lo natural. `asistencia_marcaciones`
// es **append-only** y hay dos barridos que ponen el build ROJO ante un
// `.update()`, un `.delete()` o un `.upsert()` que pise una fila de esa tabla
// (`asistencia-correcciones.test.ts` y `asistencia-una-sola-entrada.test.ts`).
// Esa regla existe porque una hora del reloj no se toca nunca: la corrección va
// ENCIMA, en otra tabla. Rellenar `lugar_texto` con un UPDATE habría sido abrir
// la primera excepción a esa regla por un texto de pantalla.
//
// Así que el lugar viaja en el MISMO INSERT de la marca. Consecuencia dicha, no
// escondida: **las 37 marcas anteriores al 25-sep-2026 se quedan sin nombre de
// lugar** —la pantalla les muestra la distancia, si hay referencia, o «—»— y eso
// no se arregla hacia atrás. Es el mismo trato que el papel de la guía: hacia
// adelante.
//
// 🔴 Y NO CUESTA UN MILISEGUNDO SI NO HAY LLAVE. `hayLlaveDeMapas()` se pregunta
// PRIMERO, antes de tocar la red: hoy (25-sep-2026) `GOOGLE_MAPS_API_KEY` no
// existe, así que esta función contesta `null` de inmediato y la marca entra tan
// rápido como siempre.
//
// ⚠️ NUNCA LANZA Y NUNCA FRENA UNA MARCA. Todo camino de error sale como `null`.
// Que no se sepa el lugar jamás puede impedir que alguien fiche.
// ─────────────────────────────────────────────────────────────────────────────

import { direccionDeCoordenada, hayLlaveDeMapas } from "@/lib/mapas/geocoding";

/**
 * El nombre del lugar de esta marca, o `null` — que es lo que se guarda en
 * `asistencia_marcaciones.lugar_texto`.
 */
export async function lugarTextoDeLaMarca(
  lat: number | null,
  lng: number | null,
): Promise<string | null> {
  if (!hayLlaveDeMapas()) return null;
  if (typeof lat !== "number" || typeof lng !== "number") return null;
  try {
    return await direccionDeCoordenada(lat, lng);
  } catch {
    return null;
  }
}

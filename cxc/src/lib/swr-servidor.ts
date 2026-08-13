"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Lo que el servidor YA mandó no se vuelve a pedir.
//
// 🩸 POR QUÉ (12-ago-2026). Ventas, Clientes, Multifashion y Reclamos ya le
// pasaban al cliente los datos del server component como `fallbackData`, con
// comentarios que decían "sin re-fetch redundante". **Era falso**: `fallbackData`
// NO puebla la caché de SWR — SWR lo considera dato *stale*, y su default
// `revalidateIfStale: true` dispara el fetch igual al montar. Medido contra el
// build de producción, una sola visita a /ventas:
//
//     el servidor arma la pantalla ......... 1.070 ms
//     y apenas llega el HTML, el cliente pide OTRA VEZ lo mismo:
//       /api/ventas/resumen ................ 1.034 ms
//       /api/multifashion/overview .........   716 ms
//       /api/ventas/clientes-12m ...........   400 ms
//
// O sea: **cada visita costaba el doble de base de datos**. Con Supabase en
// compute Micro (4 caídas en una semana), bajar consultas importa tanto o más
// que bajar segundos.
//
// La palanca es `revalidateOnMount: false`, y NO se puede poner a ciegas: si la
// vista NO tiene datos del servidor (página 2 del directorio, una búsqueda, otro
// año), apagar la revalidación inicial deja la pantalla EN BLANCO para siempre.
// Por eso las dos cosas viajan JUNTAS en `opcionesDelServidor()`: o hay dato del
// servidor y entonces no se re-pide, o no lo hay y SWR pide como siempre. No
// existe la combinación peligrosa.
//
// ⚠️ LA FRESCURA NO SE PIERDE, y hay dos mecanismos distintos:
//   1. `revalidateOnFocus` NO se toca. Reclamos lo tiene en `true` a propósito
//      (lo editan varias personas y no hay realtime): volver a la pestaña sigue
//      trayendo lo de los demás. Lo único que se apaga es la petición inicial.
//   2. `useSembrarDelServidor()` — sin él SÍ se perdería frescura. Al volver a
//      un módulo por navegación del SPA, Next vuelve a correr el server
//      component (rutas `force-dynamic`) y manda datos NUEVOS, pero SWR seguiría
//      mostrando los de la caché porque `fallbackData` solo aplica con la caché
//      vacía. El hook escribe los datos del servidor en la caché **sin pedir
//      nada por red**: la pantalla queda tan fresca como el render del servidor.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect } from "react";
import type { KeyedMutator } from "swr";

/**
 * Opciones de `useSWR` para una vista que YA recibió sus datos del servidor.
 *
 * @param datos lo que trajo el server component, o `undefined` si esta vista no
 *   tiene datos del servidor (otra página, otro año, una búsqueda).
 */
export function opcionesDelServidor<T>(
  datos: T | undefined,
): { fallbackData?: T; revalidateOnMount?: false } {
  // Sin datos del servidor no se toca nada: SWR pide al montar, como siempre.
  if (datos === undefined) return {};
  return { fallbackData: datos, revalidateOnMount: false };
}

/**
 * Mete en la caché de SWR los datos que mandó el servidor, **sin red**.
 *
 * Se ejecuta cuando cambia la referencia de `datos` — o sea cuando el server
 * component volvió a renderizar con datos nuevos. Pasar un objeto recreado en
 * cada render lo haría correr en cada render: el llamador debe memoizarlo
 * (`useMemo`) o pasar directamente el prop que recibió.
 */
export function useSembrarDelServidor<T>(
  mutate: KeyedMutator<T>,
  datos: T | undefined,
): void {
  useEffect(() => {
    if (datos === undefined) return;
    // `revalidate: false` es lo que lo hace gratis: escribe y no pide nada.
    void mutate(datos, { revalidate: false });
  }, [mutate, datos]);
}

// ─────────────────────────────────────────────────────────────────────────────
// Cada cuánto se refresca `last_seen` de una sesión — lógica PURA, sin DB.
//
// 🩸 QUÉ PASABA (medido en el reporte semanal de Sentry, 19-sep-2026).
//   El middleware disparaba un PATCH a `user_sessions` para escribir `last_seen`
//   en CADA petición con sesión, de CADA persona, y se iba sin esperar la
//   respuesta (`.catch(() => {})`). La base contesta en ~200 ms, así que no era
//   una consulta lenta: eran miles de promesas abandonadas en el motor del
//   borde. Sentry las reportaba como el renglón más caro de la semana — p95 de
//   2 minutos y 2,3 días de duración total.
//
// QUÉ CAMBIA.
//   El PATCH sigue siendo fire-and-forget (esperar la respuesta le costaría
//   ~200 ms a cada navegación de cada persona), pero ahora ocurre COMO MUCHO
//   UNA VEZ CADA 5 MINUTOS por sesión. Lo que se recorta es la CANTIDAD de
//   peticiones, no el tiempo que toma cada una.
//
// CÓMO SE ACUERDA, SI EL BORDE NO TIENE MEMORIA.
//   El middleware corre en el borde y no puede dar por segura ninguna memoria
//   entre peticiones. Por eso la marca del último toque VIAJA CON LA PETICIÓN,
//   en su propia cookie (`cxc_ultimo_toque`): httpOnly, con el instante en
//   milisegundos y nada más adentro. No es una cookie de seguridad — no decide
//   quién entra ni quién se queda afuera, solo si esta petición vuelve a
//   escribir `last_seen`.
//
// ANTE LA DUDA, ESCRIBIR.
//   Sin cookie, con una marca ilegible, o con una marca del futuro (reloj
//   corrido o cookie tocada a mano), se escribe. El único efecto de forzar la
//   marca es que a esa sesión se le refresque MENOS el `last_seen`, o sea que
//   se revoque ANTES: nunca alarga la vida de una sesión.
//
// POR QUÉ 5 MINUTOS NO ROMPE LA RETENCIÓN.
//   `src/lib/session-retention.ts` revoca a los DIAS_INACTIVIDAD = 14 días sin
//   `last_seen`, y su comentario dice que esos 14 días son margen justamente
//   «por si el PATCH fire-and-forget falla». 5 minutos de retraso máximo contra
//   14 días de margen son 4 milésimas de la ventana: sobra de lejos. El candado
//   `last-seen-cada-cinco-minutos.test.ts` compara los dos números.
//
// ⚠️ Colateral visible: Admin › Usuarios muestra «última actividad» leyendo
//   `last_seen`, así que ahí el dato puede venir hasta 5 minutos atrasado.
// ─────────────────────────────────────────────────────────────────────────────

/** Cookie que lleva el instante del último PATCH de `last_seen`. */
export const COOKIE_ULTIMO_TOQUE = "cxc_ultimo_toque";

/** Como mucho un PATCH de `last_seen` por sesión cada 5 minutos. */
export const INTERVALO_TOQUE_MS = 5 * 60 * 1000;

/** El valor que se guarda en la cookie: el instante, en milisegundos. */
export function marcaDeToque(ahoraMs: number): string {
  return String(ahoraMs);
}

/**
 * ¿Esta petición tiene que volver a escribir `last_seen`?
 *
 * Falla hacia el lado seguro: todo lo que no sea una marca legible, del pasado
 * y de hace menos de 5 minutos, manda a escribir.
 */
export function debeTocarSesion(marca: string | undefined | null, ahoraMs: number): boolean {
  if (!marca) return true;
  if (!/^\d+$/.test(marca)) return true; // ilegible o tocada a mano
  const antes = Number(marca);
  if (!Number.isFinite(antes)) return true;
  if (antes > ahoraMs) return true; // marca del futuro: reloj corrido
  return ahoraMs - antes >= INTERVALO_TOQUE_MS;
}

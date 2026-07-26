// ─────────────────────────────────────────────────────────────────────────────
// Retención de sesiones (user_sessions) — lógica PURA, sin DB.
//
// Vive fuera del route para poder testear los cortes y la clasificación sin
// levantar Supabase. El route (/api/cron/cleanup-sessions) traduce estos cortes
// a tres queries de PostgREST; este archivo es la fuente única de los números.
//
// Por qué existe (hallazgo jul-2026):
//   La tabla `user_sessions` NO tiene columna `expires_at`, y la cookie firmada
//   (src/lib/session-cookie.ts) tampoco lleva claim de expiración. Es decir: del
//   lado del SERVIDOR una sesión no expiraba nunca. Lo único que la mataba era
//   el `maxAge` de 7 días de la cookie en el navegador — un control del cliente,
//   que quien tenga el valor de la cookie simplemente ignora.
//
// Los tres cortes:
//   1. DIAS_INACTIVIDAD (14)          — sin actividad → revocar.
//   2. DIAS_VIDA_MAXIMA (90)          — tope duro de vida → revocar.
//   3. DIAS_RETENCION_REVOCADAS (90)  — revocada y vieja → borrar.
// ─────────────────────────────────────────────────────────────────────────────

/** Sin `last_seen` en esta ventana, la sesión se revoca.
 *
 *  El middleware re-emite la cookie con `maxAge` de 7 días en CADA request
 *  (src/middleware.ts, COOKIE_MAX_AGE). Un usuario legítimo que no abre la app
 *  por más de 7 días YA perdió la cookie en su navegador, así que revocar a los
 *  14 (el doble de esa ventana) no desloguea a nadie que todavía pudiera estar
 *  usando la app, y deja margen por si el PATCH fire-and-forget de `last_seen`
 *  del middleware falla alguna vez. */
export const DIAS_INACTIVIDAD = 14;

/** Tope duro: una sesión no vive más de 3 meses aunque se la mantenga viva a
 *  pings. Sin esto, una cookie robada se renueva sola para siempre. */
export const DIAS_VIDA_MAXIMA = 90;

/** Cuánto se conserva una sesión ya revocada antes de borrarla: 3 meses de
 *  rastro de auditoría (quién, desde qué IP, cuándo) y luego fuera. */
export const DIAS_RETENCION_REVOCADAS = 90;

const MS_POR_DIA = 24 * 60 * 60 * 1000;

/** Las tres fechas de corte, en ISO UTC, calculadas contra un `now` explícito
 *  (parámetro, no `new Date()` adentro: así el test es determinista). */
export interface CortesDeLimpieza {
  /** `revoked=false AND last_seen < inactividad` → revocar. */
  inactividad: string;
  /** `revoked=false AND created_at < vidaMaxima` → revocar. */
  vidaMaxima: string;
  /** `revoked=true AND last_seen < retencionRevocadas` → borrar. */
  retencionRevocadas: string;
}

export function cortesDeLimpieza(now: Date): CortesDeLimpieza {
  const t = now.getTime();
  return {
    inactividad: new Date(t - DIAS_INACTIVIDAD * MS_POR_DIA).toISOString(),
    vidaMaxima: new Date(t - DIAS_VIDA_MAXIMA * MS_POR_DIA).toISOString(),
    retencionRevocadas: new Date(t - DIAS_RETENCION_REVOCADAS * MS_POR_DIA).toISOString(),
  };
}

/** Fila de `user_sessions`, con SOLO las columnas que deciden su destino.
 *  Columnas reales de la tabla: id, user_name, user_role, session_token,
 *  ip_address, last_seen, created_at, revoked. No hay `expires_at`. */
export interface FilaSesion {
  revoked: boolean;
  last_seen: string | null;
  created_at: string;
}

export type DestinoSesion =
  | "borrar"
  | "revocar-inactividad"
  | "revocar-antiguedad"
  | "conservar";

/** Espejo en TypeScript de lo que hacen las tres queries del cron.
 *
 *  Ojo con los NULL: en SQL `NULL < fecha` es NULL (falso), así que una fila con
 *  `last_seen` NULL NUNCA cae por inactividad ni se borra. Acá se replica igual
 *  a propósito — el clasificador tiene que describir lo que la DB realmente
 *  hace, no una versión idealizada. (Hoy son 0 filas, pero la regla importa.)
 *
 *  Orden de precedencia: primero el estado (revocada o no), y dentro de las
 *  activas la inactividad antes que la antigüedad — es el orden en que el cron
 *  aplica los updates, así que una fila que califica para ambas se cuenta como
 *  revocada por inactividad y no se cuenta dos veces. */
export function clasificarSesion(row: FilaSesion, cortes: CortesDeLimpieza): DestinoSesion {
  // Comparar por instante, no por string: PostgREST devuelve timestamptz como
  // "2026-07-25T12:00:00+00:00" y toISOString() produce "…T12:00:00.000Z". Son
  // el mismo momento pero NO ordenan igual lexicográficamente.
  const anterior = (a: string | null, corte: string) =>
    a !== null && Date.parse(a) < Date.parse(corte);

  if (row.revoked) {
    return anterior(row.last_seen, cortes.retencionRevocadas) ? "borrar" : "conservar";
  }
  if (anterior(row.last_seen, cortes.inactividad)) return "revocar-inactividad";
  if (anterior(row.created_at, cortes.vidaMaxima)) return "revocar-antiguedad";
  return "conservar";
}

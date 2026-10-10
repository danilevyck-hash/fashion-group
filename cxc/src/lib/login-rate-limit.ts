// Rate limit de login respaldado por Supabase (store COMPARTIDO entre instancias
// serverless). Reemplaza el Map en-memoria del route, que no funcionaba en
// serverless (cada lambda tenía su propio Map). Cuenta intentos FALLIDOS por IP;
// tras MAX_FAILS fallos en la ventana, bloquea la IP por LOCKOUT. Desde el
// 9-oct-2026 MAX_FAILS es 100: freno contra programas, no contra personas.
//
// Fail-OPEN ante error del store (tabla/RPC ausente o caída): preferimos permitir
// el intento antes que bloquear a todos los usuarios. El rate-limit es una capa
// de protección, no el auth en sí. Errores se loguean.

import { supabaseServer } from "@/lib/supabase-server";

// ─────────────────────────────────────────────────────────────────────────────
// EL ÚNICO NÚMERO DEL FRENO (9-oct-2026). Antes era 5: cinco contraseñas mal
// escritas en la oficina dejaban a TODA la oficina (misma IP) sin entrar 15 min.
// Daniel: «no permitas que se bloquee a todos por 15 minutos, no tiene sentido;
// que no haya ese bloqueo del todo».
//
// Queda en 100, que ninguna oficina alcanza por error: para las personas el
// bloqueo ya no existe. Lo que queda es solo un freno contra programas
// automáticos: se entra SOLO con contraseña (la contraseña identifica a la
// persona) y varias son nombres propios; sin ningún tope, un programa prueba
// miles por minuto desde internet y entra como cualquiera, incluido un
// administrador.
//
// Para quitarlo del todo, si Daniel lo decide: `Number.MAX_SAFE_INTEGER` no
// sirve (la función de la base recibe un entero de 32 bits); poner 2147483647.
// ─────────────────────────────────────────────────────────────────────────────
export const MAX_FAILS = 100;        // fallos antes de bloquear: el fallo n.º 100 bloquea, el intento 101 ya no entra
export const WINDOW_SECS = 15 * 60;  // ventana para acumular fallos (15 min)
export const LOCKOUT_SECS = 15 * 60; // duración del bloqueo (15 min)

export interface RateLimitState {
  locked: boolean;
  retryAfter: number; // segundos restantes del bloqueo
}

const OPEN: RateLimitState = { locked: false, retryAfter: 0 };

/**
 * Pre-check (lectura): ¿esta IP está bloqueada ahora mismo? Se llama ANTES de
 * validar la contraseña para no gastar bcrypt en una IP bloqueada.
 */
export async function getLoginLock(ip: string): Promise<RateLimitState> {
  try {
    const { data, error } = await supabaseServer
      .from("login_attempts")
      .select("locked_until")
      .eq("ip", ip)
      .maybeSingle();
    if (error || !data?.locked_until) return OPEN;
    const until = new Date(data.locked_until).getTime();
    const remaining = Math.ceil((until - Date.now()) / 1000);
    return remaining > 0 ? { locked: true, retryAfter: remaining } : OPEN;
  } catch {
    return OPEN; // fail-open
  }
}

/**
 * Registra un intento fallido (atómico en DB) y devuelve si la IP quedó
 * bloqueada con este fallo.
 */
export async function registerLoginFailure(ip: string): Promise<RateLimitState> {
  try {
    const { data, error } = await supabaseServer.rpc("register_login_failure", {
      p_ip: ip,
      p_max: MAX_FAILS,
      p_window_secs: WINDOW_SECS,
      p_lockout_secs: LOCKOUT_SECS,
    });
    if (error) return OPEN;
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return OPEN;
    return { locked: !!row.locked, retryAfter: Number(row.retry_after) || 0 };
  } catch {
    return OPEN; // fail-open
  }
}

/** Limpia el contador de la IP tras un login exitoso. */
export async function clearLoginAttempts(ip: string): Promise<void> {
  try {
    await supabaseServer.rpc("clear_login_attempts", { p_ip: ip });
  } catch {
    /* fail-open: no bloquear el login por un error de limpieza */
  }
}

// Rate limit de login respaldado por Supabase (store COMPARTIDO entre instancias
// serverless). Reemplaza el Map en-memoria del route, que no funcionaba en
// serverless (cada lambda tenía su propio Map). Cuenta intentos FALLIDOS por IP;
// tras MAX_FAILS fallos en la ventana, bloquea la IP por LOCKOUT.
//
// Fail-OPEN ante error del store (tabla/RPC ausente o caída): preferimos permitir
// el intento antes que bloquear a todos los usuarios. El rate-limit es una capa
// de protección, no el auth en sí. Errores se loguean.

import { supabaseServer } from "@/lib/supabase-server";

export const MAX_FAILS = 5;          // fallos antes de bloquear
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

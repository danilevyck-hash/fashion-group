// ─────────────────────────────────────────────────────────────────────────────
// ANOTAR UNA VISITA — el lado del navegador. Todo lo que puede fallar acá,
// falla en silencio: esto no puede romper una pantalla ni demorar una
// navegación.
//
// Las reglas (cada cuánto, qué módulo, qué aparato) viven en `registro.ts`, que
// es puro. Acá solo está la plomería: leer la memoria de la pestaña y mandar el
// aviso sin esperarlo.
// ─────────────────────────────────────────────────────────────────────────────

import {
  REGISTRO_DE_VISITAS,
  claveDeMemoria,
  debeRegistrar,
  esModuloConocido,
} from "./registro";
import type { Aparato } from "@/lib/aparato";

export const RUTA_VISITAS = "/api/visitas";

/** Lo que esta pestaña recuerda de ese módulo, o `null`. Nunca lanza. */
function ultimaVisita(clave: string): number | null {
  try {
    const crudo = window.sessionStorage.getItem(clave);
    if (!crudo) return null;
    const n = Number(crudo);
    return Number.isFinite(n) ? n : null;
  } catch {
    // Navegación privada, almacenamiento bloqueado: se anota igual.
    return null;
  }
}

function recordar(clave: string, ahora: number): void {
  try {
    window.sessionStorage.setItem(clave, String(ahora));
  } catch {
    /* si no se puede recordar, se anotará de nuevo: no es un problema */
  }
}

/** Manda el aviso SIN esperarlo. `sendBeacon` primero —el navegador lo entrega
 *  aunque la pestaña se esté cerrando—; si no existe, `fetch` con `keepalive`.
 *  Las dos formas viajan con la cookie de sesión (misma dirección). */
function mandar(cuerpo: string): void {
  try {
    const beacon = navigator.sendBeacon?.bind(navigator);
    if (beacon) {
      const ok = beacon(RUTA_VISITAS, new Blob([cuerpo], { type: "application/json" }));
      if (ok) return;
    }
  } catch {
    /* cae al fetch de abajo */
  }
  try {
    void fetch(RUTA_VISITAS, {
      method: "POST",
      keepalive: true,
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: cuerpo,
    }).catch(() => {});
  } catch {
    /* sin red, sin fetch, sin nada: no pasa nada */
  }
}

/**
 * Anota que esta persona abrió este módulo. Devuelve `true` solo si de verdad
 * mandó el aviso (lo usan los candados).
 *
 * No manda nada si: el interruptor está apagado · no hay navegador · el módulo
 * no existe · esta pestaña ya anotó ese módulo hace menos de 10 minutos.
 */
export function anotarVisita(
  modulo: string | null,
  aparato: Aparato,
  ahora: number = Date.now(),
): boolean {
  if (!REGISTRO_DE_VISITAS) return false;
  if (typeof window === "undefined") return false;
  if (!esModuloConocido(modulo) || !modulo) return false;

  const clave = claveDeMemoria(modulo, aparato);
  if (!debeRegistrar(ultimaVisita(clave), ahora)) return false;

  // Se recuerda ANTES de mandar: si el aviso se pierde, no se reintenta en
  // bucle. Una visita perdida no cambia nada; una tanda de avisos sí.
  recordar(clave, ahora);
  mandar(JSON.stringify({ modulo, aparato }));
  return true;
}

/* ─────────────────────────────────────────────────────────────────────────────
 * 🔴 SIN USO desde el 11-abr-2026 — en realidad, NUNCA corrió: ESTO NO CORRE.
 *
 * Nació el 5-abr-2026 (`d3a20ddd`). Su único consumidor fue
 * `src/components/SessionWarning.tsx`… que **nunca se montó en ninguna
 * pantalla**: no hay un solo `<SessionWarning` en toda la historia del
 * repo. El componente se borró el 11-abr-2026 (`69c989da`, «remove dead
 * components») y desde entonces este gancho no tiene ni un importador.
 *
 * QUÉ NO PASA POR ESTO: el chequeo de sesión cada 2 minutos contra
 * `/api/auth/check` **no se hace**, y no existe el aviso «tu sesión está
 * por vencer». La ruta del servidor sigue viva y sana; lo que falta es
 * quien la llame. En la práctica, la sesión se cae sin previo aviso.
 *
 * ── POR QUÉ SIGUE AQUÍ, EN VEZ DE BORRARSE ──────────────────────────────────
 *
 * Volver a enchufarlo es un cambio de conducta REAL, no una limpieza: empezaría a aparecerle a la gente un banner de sesión que hoy no ve, y
 * a hacerse una llamada al servidor cada 2 minutos por usuario abierto.
 * Esa decisión es de Daniel, y no está tomada. Borrar el archivo cerraría la
 * puerta; dejarlo mudo y rotulado la deja abierta sin mentir.
 *
 * ── SI VAS A EDITARLO, PARA ANTES ───────────────────────────────────────────
 *
 * Cambiar una línea aquí NO cambia nada en la app. Sea lo que sea que estés
 * arreglando, el arreglo está en otro lado.
 *
 * 🩸 Ya pasó: el **5-sep-2026** alguien editó `useKeyboardShortcuts.ts` y el
 * cambio entero fue `q: "/cheques"` → `q: "/recordatorios"`. Se arregló con
 * cuidado un atajo que no está conectado a nada, y nadie se enteró.
 *
 * Candado: `src/__tests__/lib/ganchos-sin-uso.test.ts` — cuenta los
 * importadores (hoy CERO) y exige que este encabezado siga aquí.
 * ────────────────────────────────────────────────────────────────────────── */

"use client";

import { useState, useEffect, useCallback, useRef } from "react";

export type SessionStatus = "valid" | "warning" | "expired";

const CHECK_INTERVAL = 2 * 60 * 1000; // 2 minutes
// After 3 consecutive failures we consider the session expired
const MAX_FAILURES = 2;

export function useSessionCheck() {
  const [status, setStatus] = useState<SessionStatus>("valid");
  const failCount = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const checkSession = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/check", {
        method: "GET",
        credentials: "same-origin",
      });

      if (res.ok) {
        failCount.current = 0;
        setStatus("valid");
      } else if (res.status === 401) {
        // Session is definitively expired
        setStatus("expired");
      } else {
        // Network or server error -- count as a warning
        failCount.current += 1;
        if (failCount.current >= MAX_FAILURES) {
          setStatus("warning");
        }
      }
    } catch {
      // Network error (offline, etc.)
      failCount.current += 1;
      if (failCount.current >= MAX_FAILURES) {
        setStatus("warning");
      }
    }
  }, []);

  const renewSession = useCallback(async () => {
    // Hit any authenticated endpoint to trigger the middleware cookie refresh
    try {
      const res = await fetch("/api/auth/check", {
        method: "GET",
        credentials: "same-origin",
      });
      if (res.ok) {
        failCount.current = 0;
        setStatus("valid");
      } else {
        setStatus("expired");
      }
    } catch {
      setStatus("expired");
    }
  }, []);

  useEffect(() => {
    // Initial check
    checkSession();

    intervalRef.current = setInterval(checkSession, CHECK_INTERVAL);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [checkSession]);

  return { status, renewSession };
}

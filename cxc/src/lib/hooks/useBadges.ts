/* ─────────────────────────────────────────────────────────────────────────────
 * 🔴 SIN USO desde el 29-abr-2026: ESTO NO CORRE.
 *
 * Nació el 3-abr-2026 (`8481ee17`) y **sí corrió**: lo usaba
 * `src/app/home/page.tsx` para los contadores de las fichas del inicio.
 * Se quedó sin importadores en el rediseño del home del 29-abr-2026
 * (`5691d24f`, «4 cards de grupos sin KPIs»), que se llevó los KPIs y,
 * de paso, la única llamada a este gancho.
 *
 * QUÉ NO PASA POR ESTO: los contadores del 🔔 (cheques, reclamos,
 * préstamos, guías, CXC) **no se cargan**. La ruta
 * `/api/notification-badges` sigue viva y contestando; nadie la llama.
 *
 * ── POR QUÉ SIGUE AQUÍ, EN VEZ DE BORRARSE ──────────────────────────────────
 *
 * Volver a enchufarlo es un cambio de conducta REAL, no una limpieza: volvería a aparecer un número rojo sobre módulos, y una consulta cada 60
 * segundos por usuario abierto.
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

export interface BadgeCounts {
  cheques: number;
  reclamos: number;
  prestamos: number;
  guias: number;
  cxc: number;
}

const EMPTY: BadgeCounts = { cheques: 0, reclamos: 0, prestamos: 0, guias: 0, cxc: 0 };
const POLL_INTERVAL = 60_000; // 60 seconds

export function useBadges(): BadgeCounts {
  const [badges, setBadges] = useState<BadgeCounts>(EMPTY);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/notification-badges");
      if (res.ok) setBadges(await res.json());
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    load();
    timer.current = setInterval(load, POLL_INTERVAL);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [load]);

  return badges;
}

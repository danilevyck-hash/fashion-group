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

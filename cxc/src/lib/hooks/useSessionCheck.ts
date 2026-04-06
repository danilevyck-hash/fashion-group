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

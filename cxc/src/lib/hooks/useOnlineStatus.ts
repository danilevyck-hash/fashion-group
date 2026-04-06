"use client";

import { useState, useEffect, useRef, useCallback } from "react";

interface OnlineStatus {
  isOnline: boolean;
  wasOffline: boolean;
}

export function useOnlineStatus(): OnlineStatus {
  const [isOnline, setIsOnline] = useState(true);
  const [wasOffline, setWasOffline] = useState(false);
  const wasOfflineTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const goOnline = useCallback(() => {
    setIsOnline(true);
    setWasOffline(true);
    // Clear "restored" message after 4 seconds
    if (wasOfflineTimer.current) clearTimeout(wasOfflineTimer.current);
    wasOfflineTimer.current = setTimeout(() => setWasOffline(false), 4000);
  }, []);

  const goOffline = useCallback(() => {
    setIsOnline(false);
    setWasOffline(false);
    if (wasOfflineTimer.current) clearTimeout(wasOfflineTimer.current);
  }, []);

  useEffect(() => {
    // Initialize from navigator
    if (typeof navigator !== "undefined") {
      setIsOnline(navigator.onLine);
    }

    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);

    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
      if (wasOfflineTimer.current) clearTimeout(wasOfflineTimer.current);
    };
  }, [goOnline, goOffline]);

  return { isOnline, wasOffline };
}

"use client";

import { useOnlineContext } from "@/lib/OnlineContext";

export default function OfflineBanner() {
  const { isOnline, wasOffline } = useOnlineContext();

  // Nothing to show
  if (isOnline && !wasOffline) return null;

  // Connection restored — brief green banner
  if (isOnline && wasOffline) {
    return (
      <div className="fixed top-0 left-0 right-0 z-40 bg-green-600 text-white text-center text-sm py-2 px-4 transition-all duration-300 animate-slideDown">
        <span className="inline-flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          Conexion restaurada
        </span>
      </div>
    );
  }

  // Offline — persistent amber/red banner
  return (
    <div className="fixed top-0 left-0 right-0 z-40 bg-amber-600 text-white text-center text-sm py-2 px-4 transition-all duration-300 animate-slideDown">
      <span className="inline-flex items-center gap-2">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="1" y1="1" x2="23" y2="23" />
          <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
          <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
          <path d="M10.71 5.05A16 16 0 0 1 22.56 9" />
          <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
          <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
          <line x1="12" y1="20" x2="12.01" y2="20" />
        </svg>
        Sin conexion — los datos mostrados pueden no estar actualizados
      </span>
    </div>
  );
}

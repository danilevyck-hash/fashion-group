"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useSessionCheck, SessionStatus } from "@/lib/hooks/useSessionCheck";

// Pages where we should NOT show the session warning
const PUBLIC_PATHS = ["/", "/catalogo/reebok/auth"];
const PUBLIC_PREFIXES = ["/reebok/"];

function isPublicPage(pathname: string): boolean {
  if (PUBLIC_PATHS.includes(pathname)) return true;
  for (const prefix of PUBLIC_PREFIXES) {
    if (pathname.startsWith(prefix)) return true;
  }
  return false;
}

export default function SessionWarning() {
  const pathname = usePathname();
  const { status, renewSession } = useSessionCheck();
  const [countdown, setCountdown] = useState(10);
  const [renewing, setRenewing] = useState(false);

  // Don't render on public pages
  const isPublic = isPublicPage(pathname);

  // Countdown for expired state
  useEffect(() => {
    if (status !== "expired" || isPublic) return;

    setCountdown(10);
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          window.location.href = "/?expired=1";
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [status, isPublic]);

  if (isPublic) return null;
  if (status === "valid") return null;

  async function handleRenew() {
    setRenewing(true);
    await renewSession();
    setRenewing(false);
  }

  // Warning banner (network issues / session about to expire)
  if (status === "warning") {
    return (
      <div className="fixed top-0 left-0 right-0 z-[9999] border-b-2 border-amber-500 bg-amber-50 px-4 py-3">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm text-amber-800">
            <svg
              className="h-5 w-5 flex-shrink-0 text-amber-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
              />
            </svg>
            <span>
              Tu sesion esta por expirar. Guarda tu trabajo.
            </span>
          </div>
          <button
            onClick={handleRenew}
            disabled={renewing}
            className="rounded-md border border-amber-600 bg-white px-3 py-1.5 text-sm font-medium text-amber-700 hover:bg-amber-50 disabled:opacity-50"
          >
            {renewing ? "Renovando..." : "Renovar sesion"}
          </button>
        </div>
      </div>
    );
  }

  // Expired modal overlay
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50">
      <div className="mx-4 w-full max-w-sm rounded-lg border-2 border-red-500 bg-white p-6 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border-2 border-red-200 bg-red-50">
          <svg
            className="h-6 w-6 text-red-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </div>
        <h2 className="mb-2 text-lg font-semibold text-gray-900">
          Sesion expirada
        </h2>
        <p className="mb-4 text-sm text-gray-600">
          Tu sesion expiro. Seras redirigido al login en{" "}
          <span className="font-semibold tabular-nums text-red-600">
            {countdown}
          </span>{" "}
          segundos.
        </p>
        <button
          onClick={() => (window.location.href = "/?expired=1")}
          className="w-full rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
        >
          Ir al login ahora
        </button>
      </div>
    </div>
  );
}

"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * Calculate a "depth" score from the pathname.
 * / = 0, /prestamos = 1, /prestamos/123 = 2, /catalogo/reebok/admin/productos = 4, etc.
 */
function getDepth(pathname: string): number {
  const segments = pathname.split("/").filter(Boolean);
  return segments.length;
}

/**
 * Determine the transition class based on depth change.
 * - Going deeper (list -> detail): slide from right
 * - Going shallower (detail -> list): slide from left
 * - Same depth (module -> module): crossfade
 */
function getTransitionClass(prevDepth: number | null, currentDepth: number): string {
  if (prevDepth === null) return "page-crossfade"; // first load
  if (currentDepth > prevDepth) return "page-slide-right";
  if (currentDepth < prevDepth) return "page-slide-left";
  return "page-crossfade";
}

const STORAGE_KEY = "fg-nav-depth";

export default function Template({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [transitionClass, setTransitionClass] = useState("page-crossfade");

  useEffect(() => {
    const currentDepth = getDepth(pathname);
    let prevDepth: number | null = null;

    try {
      const stored = sessionStorage.getItem(STORAGE_KEY);
      if (stored !== null) {
        prevDepth = parseInt(stored, 10);
        if (isNaN(prevDepth)) prevDepth = null;
      }
    } catch {
      // sessionStorage not available — fallback to crossfade
    }

    setTransitionClass(getTransitionClass(prevDepth, currentDepth));

    try {
      sessionStorage.setItem(STORAGE_KEY, String(currentDepth));
    } catch {
      // ignore
    }
  }, [pathname]);

  return (
    <div key={pathname} className={transitionClass}>
      {children}
    </div>
  );
}

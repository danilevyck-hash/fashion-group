"use client";

import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useRef } from "react";

// Transición de ruta SIN remontar el árbol. Reemplaza al antiguo template.tsx,
// que envolvía cada ruta en <div key={pathname}> y, por la semántica de
// `template` en App Router, recreaba TODO el árbol cliente en cada navegación
// (incl. back) → re-corrían effects/fetches y se sentía como carga fresca.
//
// Aquí el wrapper es estable (vive en el layout, que persiste): solo replaya un
// fade de opacidad sobre el contenido entrante en cada cambio de pathname, vía
// Web Animations API (no toca el className que controla React, sin reflow-hack).
// El back reusa el árbol del Router Cache y se siente instantáneo.

// useLayoutEffect en cliente (aplica el fade antes del paint → sin flash de
// 1 frame); useEffect en SSR para no emitir el warning de layout effect.
const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

export default function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const ref = useRef<HTMLDivElement>(null);
  const first = useRef(true);

  useIsoLayoutEffect(() => {
    // No animar en el primer render (carga inicial / hidratación).
    if (first.current) { first.current = false; return; }
    const el = ref.current;
    if (!el || typeof el.animate !== "function") return;
    // Respeta prefers-reduced-motion: sin animación.
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const anim = el.animate(
      [{ opacity: 0 }, { opacity: 1 }],
      { duration: 150, easing: "ease-out" },
    );
    return () => anim.cancel();
  }, [pathname]);

  return <div ref={ref}>{children}</div>;
}

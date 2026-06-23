"use client";

import { useEffect, useState } from "react";

// Retrasa el render del skeleton de un loading.tsx para evitar el parpadeo gris
// en cargas rápidas (la mayoría, dentro del Router Cache). Si la ruta resuelve
// antes del delay, el fallback de Suspense se desmonta y el skeleton NUNCA
// aparece. Solo en cargas lentas (>delay) se muestra el skeleton.
export default function DelayedSkeleton({
  children,
  delay = 300,
}: {
  children: React.ReactNode;
  delay?: number;
}) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setShow(true), delay);
    return () => clearTimeout(t);
  }, [delay]);
  return show ? <>{children}</> : null;
}

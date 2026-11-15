"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { anotarPantalla } from "@/lib/navegacion/pantalla-anterior";

/** Anota cada pantalla que se abre (ver `lib/navegacion/pantalla-anterior.ts`). */
export default function PantallaAnterior() {
  const pathname = usePathname();
  useEffect(() => {
    if (pathname) anotarPantalla(pathname);
  }, [pathname]);
  return null;
}

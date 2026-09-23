"use client";

// ============================================================================
// UN ENLACE VIEJO `?proyecto=<id>` LLEVA A LA FICHA DE SU TIENDA (23-sep-2026).
//
// El overlay del proyecto (`ProyectoOverlay`, `?proyecto=`) se retiró de la
// pantalla con Tiendas y Marcas: el proyecto dejó de ser el contenedor
// (Daniel: *«a) Basta la tienda»*). Un enlace guardado con `?proyecto=` no
// puede morir: se lee el proyecto y se reemplaza la dirección por la de la
// tienda que tenía (`destinoDelProyectoViejo`). Sin tienda, «General»;
// Multifashion por su texto, D-108.
//
// `replace`, no `push`: el enlace viejo no merece una entrada en el historial.
// Si la lectura se cae, se va a la portada — nunca a una pantalla en blanco.
// ============================================================================

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  MARKETING_TIENDAS_Y_MARCAS,
  destinoDelProyectoViejo,
} from "@/lib/marketing/tiendas-y-marcas";

export function useRedirigirProyectoViejo(proyectoId: string | null): boolean {
  const router = useRouter();
  const activo = MARKETING_TIENDAS_Y_MARCAS && !!proyectoId;
  useEffect(() => {
    if (!activo || !proyectoId) return;
    let cancelado = false;
    (async () => {
      let destino = "/marketing";
      try {
        const res = await fetch(`/api/marketing/proyectos/${encodeURIComponent(proyectoId)}`, {
          cache: "no-store",
        });
        if (res.ok) {
          const p = (await res.json()) as { tienda_codigo?: string | null; tienda?: string | null };
          destino = destinoDelProyectoViejo(p);
        }
      } catch {
        destino = "/marketing";
      }
      if (!cancelado) router.replace(destino);
    })();
    return () => {
      cancelado = true;
    };
  }, [activo, proyectoId, router]);
  return activo;
}

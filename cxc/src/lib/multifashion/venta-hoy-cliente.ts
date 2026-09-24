"use client";

// ─────────────────────────────────────────────────────────────────────────────
// La venta de HOY, del lado del navegador — UNA sola petición para las DOS
// pantallas que la dicen (24-sep-2026).
//
// En computadora es la banda «Hoy · jueves 24 sep · …» (`VentaHoyCard`); en el
// celular es la línea gris bajo el título del mes («23 días · hoy $1,234»). Son
// el MISMO dato, así que comparten la MISMA clave de SWR: el navegador pide
// `/api/multifashion/venta-hoy` una vez y las dos leen de ahí.
//
// 🔑 No hay cuenta acá: el monto lo calcula el servidor con `retail-dia.ts`, la
// única implementación de «la venta retail de un rango» del sistema.
// ─────────────────────────────────────────────────────────────────────────────

import useSWR from "swr";
import type { VentaHoy } from "@/lib/multifashion/venta-hoy";

/** La clave compartida. El `syncTick` la invalida tras un «Actualizar ahora». */
export const claveVentaHoy = (syncTick: number) => ["multifashion-venta-hoy", syncTick] as const;

async function pedir(): Promise<VentaHoy> {
  const res = await fetch("/api/multifashion/venta-hoy", { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as VentaHoy;
}

export function useVentaHoy(syncTick = 0, habilitado = true) {
  return useSWR<VentaHoy>(
    habilitado ? claveVentaHoy(syncTick) : null,
    pedir,
    { revalidateOnFocus: true, dedupingInterval: 60_000, keepPreviousData: true },
  );
}

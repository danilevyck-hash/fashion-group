// ─────────────────────────────────────────────────────────────────────────────
// Ventas › Resumen: la proyección de cierre, GUARDADA hasta la próxima carga de
// facturas (velocidad-2026-11; 0,6 s en la base cada vez que alguien abría).
//
// 🔴 Ningún número cambia: es la MISMA cadena de RPC (v8 → v7 → v6), solo que
// el resultado se guarda bajo una llave que cambia cuando el dato puede
// cambiar — el día de Panamá (la proyección cuenta días) y la última corrida
// buena del sync de facturas (cualquier empresa, cualquier camino: cron,
// «Actualizar», reconciliación). Un respaldo de 15 min cubre lo que no pase
// por ahí. Un error NUNCA se guarda.
// ─────────────────────────────────────────────────────────────────────────────

import { unstable_cache } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { withDbRetry } from "@/lib/supabase-retry";
import { rpcConFallbackDeVersion } from "@/lib/ventas/rpc-version";
import { hoyPanama } from "@/lib/fecha-panama";

export const PROYECCION_CACHE_SEGUNDOS = 900;

/** La lectura de siempre, sin caché. */
export function leerProyeccionCierre(year: number) {
  return rpcConFallbackDeVersion(
    () => withDbRetry(() => supabaseServer.rpc("ventas_proyeccion_cierre_v8", { p_anio: year }), { label: "ventas_proyeccion_cierre_v8" }),
    () => rpcConFallbackDeVersion(
      () => withDbRetry(() => supabaseServer.rpc("ventas_proyeccion_cierre_v7", { p_anio: year }), { label: "ventas_proyeccion_cierre_v7" }),
      () => withDbRetry(() => supabaseServer.rpc("ventas_proyeccion_cierre_v6", { p_anio: year }), { label: "ventas_proyeccion_cierre_v6" }),
      { label: "ventas_proyeccion_cierre_v7" },
    ),
    { label: "ventas_proyeccion_cierre_v8" },
  );
}

/** Cuándo terminó bien la última carga de facturas; `null` si no se pudo leer. */
async function ultimaCargaDeFacturas(): Promise<string | null> {
  const { data, error } = await supabaseServer
    .from("switch_sync_log")
    .select("finished_at")
    .eq("sync_type", "facturas")
    .eq("status", "success")
    .order("finished_at", { ascending: false })
    .limit(1);
  if (error) return null;
  return (data?.[0]?.finished_at as string | undefined) ?? null;
}

/** La llave: si cambia el día o entra una carga nueva, se recalcula. */
export function llaveProyeccion(year: number, hoy: string, ultimaCarga: string): string {
  return `${year}|${hoy}|${ultimaCarga}`;
}

class ErrorProyeccion extends Error {}

export async function leerProyeccionCierreCacheada(year: number) {
  const ultima = await ultimaCargaDeFacturas();
  // Sin saber cuándo fue la última carga no se arriesga un dato viejo.
  if (!ultima) return leerProyeccionCierre(year);
  try {
    const data = await unstable_cache(
      async (_llave: string) => {
        const r = await leerProyeccionCierre(year);
        if (r.error) throw new ErrorProyeccion(r.error.message);
        return r.data;
      },
      ["ventas-proyeccion-cierre"],
      { revalidate: PROYECCION_CACHE_SEGUNDOS },
    )(llaveProyeccion(year, hoyPanama(), ultima));
    return { data, error: null };
  } catch (e) {
    if (e instanceof ErrorProyeccion) return { data: null, error: { message: e.message } };
    // La caché misma falló (fuera de Next, por ejemplo): se lee directo.
    return leerProyeccionCierre(year);
  }
}

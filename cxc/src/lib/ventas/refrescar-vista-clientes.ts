// ─────────────────────────────────────────────────────────────────────────────
// LA VISTA DE VENTAS › CLIENTES SE REFRESCA CON CADA SYNC DE FACTURAS, Y DICE
// CUÁNDO (11-sep-2026).
//
// 🩸 QUÉ PASABA. `clientes_empresa_12m_vw` es una vista MATERIALIZADA (aunque
// termina en `_vw`) y se refrescaba UNA vez al día, a las 2:35 a.m. de Panamá
// (`refresh-clientes-views`). Las facturas, en cambio, entran cuatro veces al
// día. Medido el 11-sep-2026 al mediodía: City Mall Paso Canoa facturó $3.180
// a las 11:06 a.m.; Ventas › Clientes decía $1.256.838,89 y la ficha del mismo
// cliente $1.260.018,89 — dos pantallas del mismo módulo, dos números, y ningún
// rótulo decía que una iba nueve horas atrás.
//
// Daniel: refrescarla con cada sync (el cron que ya corre 4×/día) y mostrar la
// línea de frescura como la del Resumen. Cero crons nuevos: el refresco cuelga
// de `switch-sync tipo=facturas|all` (ver ese route), del botón «Actualizar
// ahora» (`refresh-vistas.ts`) y del cron de las 2:35 (`refresh-clientes-views`).
//
// 🔑 LA FRESCURA ES UNA MARCA DE AGUA, NO UN CRON. Postgres no guarda cuándo se
// refrescó una MV, así que quien la refresca deja una fila en `cron_heartbeats`
// con este nombre — que está en `HEARTBEATS_NO_CRON`: nadie la programa, no se
// vigila, y no puede quedar «huérfana». La escriben los TRES caminos por esta
// misma función, para que no haya un refresco sin marca ni una marca sin
// refresco.
// ─────────────────────────────────────────────────────────────────────────────

import { supabaseServer } from "@/lib/supabase-server";
import { recordCronHeartbeat } from "@/lib/cron-telemetry";

/** La marca de agua: cuándo se refrescó por última vez la vista de Clientes. */
export const HEARTBEAT_VISTA_CLIENTES = "clientes-vw-refrescada";

/** La RPC (SECURITY DEFINER) que hace el REFRESH … CONCURRENTLY. */
export const RPC_REFRESH_VISTA_CLIENTES = "refresh_clientes_empresa_12m_vw";

/** Deja la marca. Se llama DESPUÉS de que el refresh confirmó, nunca antes. */
export async function marcarVistaClientesRefrescada(): Promise<void> {
  await recordCronHeartbeat(HEARTBEAT_VISTA_CLIENTES);
}

/**
 * Refresca la vista y deja la marca. Tolerante: devuelve el error en vez de
 * lanzarlo, porque quien la llama (el sync de facturas) ya escribió bien y un
 * tropiezo acá no puede marcarlo como fallido.
 */
export async function refrescarVistaClientes(): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabaseServer.rpc(RPC_REFRESH_VISTA_CLIENTES);
  if (error) return { ok: false, error: error.message };
  await marcarVistaClientesRefrescada();
  return { ok: true };
}

/** Cuándo se refrescó por última vez (ISO), o null si todavía no hay marca. */
export async function leerFrescuraVistaClientes(): Promise<string | null> {
  const { data, error } = await supabaseServer
    .from("cron_heartbeats")
    .select("last_success_at")
    .eq("cron_name", HEARTBEAT_VISTA_CLIENTES)
    .maybeSingle();
  if (error || !data) return null;
  return (data as { last_success_at: string | null }).last_success_at ?? null;
}

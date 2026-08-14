import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { getMarcaConfig } from "@/lib/catalogo/marcas";

export const dynamic = "force-dynamic";

// ─────────────────────────────────────────────────────────────────────────────
// Indicador "Sincronizado con Switch hace X" del catálogo (admin y vista de
// vendedores, al lado del botón "Actualizar ahora"). Read-only.
//
// Devuelve la sincronización MÁS RECIENTE de este catálogo, la haya disparado
// el cron o una persona: el último `success` de switch_sync_log para el
// (empresa_key, sync_type) de la marca. La MISMA lib de sync escribe esa fila
// por los dos caminos —el cron y /api/admin/sync-now con triggered_by='manual'—
// así que es lo único que sabe cuándo se actualizó el catálogo de verdad.
//
// 🩸 Antes leía `cron_heartbeats`, que SOLO escribe el cron: apretar
// "Actualizar ahora" corría el sync de verdad pero el reloj se quedaba en la
// hora del último cron. Medido en producción el 14-ago-2026 a las 15:47 UTC:
// heartbeat tommy-catalogo 14:32:41 contra una corrida manual que había
// terminado 15:39:50 — el banner decía "hace una hora" seis minutos después de
// sincronizar. El sync no fallaba; lo único roto era el reloj.
//
// 🔴 EL ARREGLO ES DE LECTURA, NO DE ESCRITURA — y esto es lo que hay que
// resistir. El atajo tentador es hacer que el botón manual escriba también
// `cron_heartbeats`. NO SE HACE: esa tabla es la que vigilan el watchdog de
// Telegram (cronsStaleParaAlerta) y /api/health-crons para saber si el CRON
// corrió. Si un clic la refrescara, un cron caído quedaría TAPADO por una
// persona y el vigía diría que todo está bien. Son dos preguntas distintas:
// `cron_heartbeats` = "¿corrió el cron?" · `switch_sync_log` = "¿cuándo se
// actualizó este catálogo?". Esta ruta contesta la segunda.
//
// ⚠️ Degradación: si la lectura falla o el catálogo nunca se sincronizó,
// `lastSync` sale null y la pantalla no muestra ninguna hora. Preferible "no
// sé" a una hora inventada.
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest, { params }: { params: { marca: string } }) {
  const cfg = getMarcaConfig(params.marca);
  if (!cfg) return NextResponse.json({ error: "Marca desconocida" }, { status: 404 });

  const auth = requireRole(req, ["admin", "secretaria", "vendedor"]);
  if (auth instanceof NextResponse) return auth;

  const supabaseServer = await cfg.mainDb();
  // `nullsFirst: false` porque en DESC Postgres pone los NULL primero: una fila
  // success sin finished_at (no existe hoy, medido: 0 de 294) se llevaría el
  // primer puesto y taparía la corrida buena.
  const { data, error } = await supabaseServer
    .from("switch_sync_log")
    .select("finished_at")
    .eq("empresa_key", cfg.empresaKey)
    .eq("sync_type", cfg.syncType)
    .eq("status", "success")
    .order("finished_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error(
      `[catalogo/${cfg.marca}/sync-status] no pude leer switch_sync_log: ${error.message}`,
    );
    return NextResponse.json({ lastSync: null });
  }

  return NextResponse.json({
    lastSync: (data as { finished_at: string | null } | null)?.finished_at ?? null,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/sync-status?tabla=facturas|estadocuenta&empresas=a,b,c
//
// Devuelve el estado de frescura de un sync de Switch para una lista de
// empresas esperadas. El consumidor es el componente compartido <SyncStatus />,
// hoy renderizado en Ventas (facturas) y en el Panel CXC (estadocuenta).
//
// Fuentes (asimétricas por diseño de las dos tablas):
//
//   tabla=facturas:
//     MAX(finished_at) de switch_sync_log
//       WHERE sync_type='facturas' AND status='success'
//       GROUP BY empresa_key.
//     Por qué NO MAX(synced_at) de switch_facturas: el sync upsertea con
//     synced_at OMITIDO del payload (preserva el primer-sync de la fila),
//     así que synced_at del row más reciente refleja "cuándo se insertó
//     esa factura por primera vez", no "cuándo corrió el último sync".
//     switch_sync_log.finished_at es la verdad de "el cron corrió OK".
//
//   tabla=estadocuenta:
//     MAX(synced_at) de switch_estadocuenta. Esa tabla SÍ sella
//     synced_at = runStamp en cada upsert (es snapshot, no incremental),
//     así que la columna refleja correctamente "último sync que tocó esa
//     fila". Más barato que ir a switch_sync_log y equivalente.
//
// Una empresa se considera stale si su timestamp más reciente está
// hace más de STALE_HOURS (26 horas — el cron corre 1x/día, así que >26h
// significa que el cron no llegó a poblar esa empresa) o si no hay
// registro alguno.
// ─────────────────────────────────────────────────────────────────────────────
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireAuth } from "@/lib/require-auth";

export const dynamic = "force-dynamic";

const STALE_HOURS = 26;
const VALID_TABLAS = new Set(["facturas", "estadocuenta"] as const);
type Tabla = "facturas" | "estadocuenta";

interface StaleEntry {
  empresa: string;
  last_synced_at: string | null;
}

interface SyncStatusResponse {
  ok: true;
  tabla: Tabla;
  last_global: string | null;
  por_empresa: Record<string, string | null>;
  stale: StaleEntry[];
}

// Resuelve "cuándo se sincronizó por última vez" para una empresa esperada.
// Fuente depende de la tabla — ver header del archivo para por qué la
// asimetría es necesaria.
async function lastSyncForEmpresa(tabla: Tabla, empresa: string): Promise<string | null> {
  if (tabla === "facturas") {
    // switch_sync_log: última corrida exitosa del sync para esa empresa.
    const r = await supabaseServer
      .from("switch_sync_log")
      .select("finished_at")
      .eq("sync_type", "facturas")
      .eq("status", "success")
      .eq("empresa_key", empresa)
      .order("finished_at", { ascending: false })
      .limit(1);
    if (r.error) {
      console.error(`[sync-status] switch_sync_log ${empresa}:`, r.error.message);
      return null;
    }
    return (r.data?.[0]?.finished_at as string | undefined) ?? null;
  }
  // estadocuenta: synced_at de switch_estadocuenta sí refleja el último run.
  const r = await supabaseServer
    .from("switch_estadocuenta")
    .select("synced_at")
    .eq("empresa_key", empresa)
    .order("synced_at", { ascending: false })
    .limit(1);
  if (r.error) {
    console.error(`[sync-status] switch_estadocuenta ${empresa}:`, r.error.message);
    return null;
  }
  return (r.data?.[0]?.synced_at as string | undefined) ?? null;
}

export async function GET(req: NextRequest) {
  const authError = requireAuth(req);
  if (authError) return authError;

  const tablaParam = req.nextUrl.searchParams.get("tabla");
  if (!tablaParam || !VALID_TABLAS.has(tablaParam as Tabla)) {
    return NextResponse.json({ error: "tabla inválida" }, { status: 400 });
  }
  const tabla = tablaParam as Tabla;

  const empresasParam = req.nextUrl.searchParams.get("empresas") ?? "";
  const empresasEsperadas = empresasParam.split(",").map(s => s.trim()).filter(Boolean);
  if (empresasEsperadas.length === 0) {
    return NextResponse.json({ error: "empresas requeridas" }, { status: 400 });
  }

  const perEmpresa = await Promise.all(
    empresasEsperadas.map(async (empresa) => ({
      empresa,
      last_synced_at: await lastSyncForEmpresa(tabla, empresa),
    }))
  );

  const now = Date.now();
  const stale: StaleEntry[] = perEmpresa.filter((p) => {
    if (!p.last_synced_at) return true;
    const ageHours = (now - new Date(p.last_synced_at).getTime()) / (1000 * 60 * 60);
    return ageHours > STALE_HOURS;
  });

  const allTs = perEmpresa
    .map(p => p.last_synced_at)
    .filter((x): x is string => Boolean(x));
  const last_global = allTs.length > 0
    ? allTs.reduce((a, b) => (a > b ? a : b))
    : null;

  const response: SyncStatusResponse = {
    ok: true,
    tabla,
    last_global,
    por_empresa: Object.fromEntries(perEmpresa.map(p => [p.empresa, p.last_synced_at])),
    stale,
  };
  return NextResponse.json(response);
}

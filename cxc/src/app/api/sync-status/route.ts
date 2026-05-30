// ─────────────────────────────────────────────────────────────────────────────
// GET /api/sync-status?tabla=facturas|estadocuenta&empresas=a,b,c
//
// Devuelve el estado de frescura de un sync de Switch (switch_facturas o
// switch_estadocuenta) para una lista de empresas esperadas. El consumidor
// es el componente compartido <SyncStatus />, hoy renderizado en Ventas y
// en el Panel CXC.
//
// Para cada empresa esperada se reporta su MAX(synced_at). Una empresa se
// considera "stale" si su último sync fue hace más de STALE_HOURS (26 horas
// por defecto — el cron corre 1x/día, así que >26h significa que el cron
// no llegó a poblar esa empresa) o si no tiene ninguna fila en la tabla.
//
// El campo last_global = MAX(synced_at) sobre todas las empresas con datos,
// y se usa como timestamp principal del label "Actualizado: ...".
// ─────────────────────────────────────────────────────────────────────────────
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireAuth } from "@/lib/require-auth";

export const dynamic = "force-dynamic";

const STALE_HOURS = 26;
const VALID_TABLES = {
  facturas: "switch_facturas",
  estadocuenta: "switch_estadocuenta",
} as const;
type Tabla = keyof typeof VALID_TABLES;

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

export async function GET(req: NextRequest) {
  const authError = requireAuth(req);
  if (authError) return authError;

  const tablaParam = req.nextUrl.searchParams.get("tabla");
  if (!tablaParam || !(tablaParam in VALID_TABLES)) {
    return NextResponse.json({ error: "tabla inválida" }, { status: 400 });
  }
  const tabla = tablaParam as Tabla;
  const dbTable = VALID_TABLES[tabla];

  const empresasParam = req.nextUrl.searchParams.get("empresas") ?? "";
  const empresasEsperadas = empresasParam.split(",").map(s => s.trim()).filter(Boolean);
  if (empresasEsperadas.length === 0) {
    return NextResponse.json({ error: "empresas requeridas" }, { status: 400 });
  }

  // MAX(synced_at) por empresa. Supabase JS no expone GROUP BY directo,
  // así que disparamos N queries de limit 1 en paralelo — N siempre <10.
  const perEmpresa = await Promise.all(
    empresasEsperadas.map(async (empresa) => {
      const r = await supabaseServer
        .from(dbTable)
        .select("synced_at")
        .eq("empresa_key", empresa)
        .order("synced_at", { ascending: false })
        .limit(1);
      if (r.error) {
        console.error(`[sync-status] ${dbTable} ${empresa}:`, r.error.message);
        return { empresa, last_synced_at: null as string | null };
      }
      return { empresa, last_synced_at: (r.data?.[0]?.synced_at as string | undefined) ?? null };
    })
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

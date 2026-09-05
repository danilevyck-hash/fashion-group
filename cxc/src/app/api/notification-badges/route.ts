import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { CXC_GRUPO_EMPRESA_KEYS } from "@/lib/empresa-mapping";
import { requireRole } from "@/lib/requireRole";
import { getEndOfWeek } from "@/lib/cheques-dates";
import { leerTodoPaginado } from "@/lib/supabase-paginado";
import { ESTADO_PAGADO } from "@/lib/reclamos/pendientes";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = requireRole(req, ["admin", "secretaria", "contabilidad", "bodega", "vendedor"]);
  if (auth instanceof NextResponse) return auth;

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const endOfWeek = getEndOfWeek(today);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000).toISOString();
  // Reclamos "viejos": misma definición que home_dashboard_summary.reclamosViejos
  // (estado NO terminal + fecha_reclamo > 45 días). Antes el badge usaba un
  // whitelist [Borrador,Enviado] + 30d/created_at → subcontaba (p.ej. "Confirmado").
  const dias45 = new Date(now.getTime() - 45 * 86400000).toISOString().slice(0, 10);

  // All queries in parallel for speed
  const [chequesRes, reclamosRes, prestamosRes, guiasRes, cxcUploadsRes] = await Promise.all([
    // Cheques: pendiente + vencen esta semana calendario (today → domingo)
    supabaseServer
      .from("cheques")
      .select("id", { count: "exact", head: true })
      .eq("deleted", false)
      .eq("estado", "pendiente")
      .lte("fecha_deposito", endOfWeek)
      .gte("fecha_deposito", today),

    // Reclamos viejos: NO terminal + fecha_reclamo > 45 días (igual que el RPC del home).
    supabaseServer
      .from("reclamos")
      .select("id", { count: "exact", head: true })
      .eq("deleted", false)
      .not("estado", "in", `(Aplicado,Rechazado,Aplicada,${ESTADO_PAGADO})`)
      .lt("fecha_reclamo", dias45),

    // Préstamos: movimientos pendientes de aprobación
    supabaseServer
      .from("prestamos_movimientos")
      .select("id", { count: "exact", head: true })
      .eq("estado", "pendiente_aprobacion")
      .eq("deleted", false),

    // Guías: Pendiente Bodega
    supabaseServer
      .from("guia_transporte")
      .select("id", { count: "exact", head: true })
      .eq("estado", "Pendiente Bodega")
      .eq("deleted", false),

    // CXC: última sincronización del API por empresa (switch_estadocuenta).
    // ⚠️ PAGINADO (26-jul-2026): sin paginar traía 1.000 de 1.511 filas en
    // silencio y, como venían ordenadas por `synced_at` desc y todas las filas
    // de una corrida comparten el sello, esas 1.000 eran de UNA sola empresa →
    // el badge sólo podía contar como atrasada a esa. Se leen todas con orden
    // estable (`id`) y el máximo por empresa se calcula acá.
    leerTodoPaginado<{ empresa_key: string; synced_at: string }>(
      "switch_estadocuenta (badge cxcStale)",
      (pedirCount, desde, hasta) =>
        supabaseServer
          .from("switch_estadocuenta")
          .select("empresa_key, synced_at", pedirCount ? { count: "exact" } : {})
          // Solo el GRUPO: confecciones_boston también vive en esta tabla desde
          // el 27-jul-2026 y lleva cartera aparte. Sin el filtro, un atraso suyo
          // encendería el badge de CXC del grupo.
          .in("empresa_key", CXC_GRUPO_EMPRESA_KEYS)
          .order("id", { ascending: true })
          .range(desde, hasta),
    ),
  ]);

  // Count CXC stale companies (any company with last sync > 7 days ago)
  const ultimoPorEmpresa = new Map<string, string>();
  for (const row of cxcUploadsRes) {
    const prev = ultimoPorEmpresa.get(row.empresa_key);
    if (!prev || row.synced_at > prev) ultimoPorEmpresa.set(row.empresa_key, row.synced_at);
  }
  let cxcStale = 0;
  for (const synced of ultimoPorEmpresa.values()) if (synced < sevenDaysAgo) cxcStale++;

  return NextResponse.json({
    cheques: chequesRes.count || 0,
    reclamos: reclamosRes.count || 0,
    prestamos: prestamosRes.count || 0,
    guias: guiasRes.count || 0,
    cxc: cxcStale,
  });
}

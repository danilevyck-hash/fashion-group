import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireRole } from "@/lib/requireRole";
import { getEndOfWeek } from "@/lib/cheques-dates";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = requireRole(req, ["admin", "secretaria", "director", "contabilidad", "bodega", "vendedor"]);
  if (auth instanceof NextResponse) return auth;

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const endOfWeek = getEndOfWeek(today);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000).toISOString();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000).toISOString();

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

    // Reclamos: Borrador o Enviado con más de 30 días
    supabaseServer
      .from("reclamos")
      .select("id", { count: "exact", head: true })
      .eq("deleted", false)
      .in("estado", ["Borrador", "Enviado"])
      .lt("created_at", thirtyDaysAgo),

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

    // CXC: latest upload per company
    supabaseServer
      .from("cxc_uploads")
      .select("company_key, uploaded_at")
      .order("uploaded_at", { ascending: false }),
  ]);

  // Count CXC stale companies (any company with last upload > 7 days ago)
  let cxcStale = 0;
  if (cxcUploadsRes.data) {
    const seen = new Set<string>();
    for (const row of cxcUploadsRes.data) {
      if (seen.has(row.company_key)) continue;
      seen.add(row.company_key);
      if (row.uploaded_at < sevenDaysAgo) cxcStale++;
    }
  }

  return NextResponse.json({
    cheques: chequesRes.count || 0,
    reclamos: reclamosRes.count || 0,
    prestamos: prestamosRes.count || 0,
    guias: guiasRes.count || 0,
    cxc: cxcStale,
  });
}

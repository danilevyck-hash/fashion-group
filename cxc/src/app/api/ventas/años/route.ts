import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = requireRole(req, ["admin", "contabilidad"]); if (auth instanceof NextResponse) return auth;
  // Fetch distinct years efficiently using a simple query with ordering
  const years = new Set<number>();

  // Fuente única switch_facturas (rango de años desde fecha; historia backfilleada).
  const [{ data: minData }, { data: maxData }] = await Promise.all([
    supabaseServer.from("switch_facturas").select("fecha").order("fecha", { ascending: true }).limit(1),
    supabaseServer.from("switch_facturas").select("fecha").order("fecha", { ascending: false }).limit(1),
  ]);

  const minYear = minData?.[0]?.fecha ? new Date(minData[0].fecha).getFullYear() : undefined;
  const maxYear = maxData?.[0]?.fecha ? new Date(maxData[0].fecha).getFullYear() : undefined;

  if (minYear && maxYear) {
    for (let y = minYear; y <= maxYear; y++) {
      years.add(y);
    }
  }

  const currentYear = new Date().getFullYear();
  years.add(currentYear);

  return NextResponse.json([...years].sort((a, b) => b - a));
}

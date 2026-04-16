import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = requireRole(req, ["admin", "director", "contabilidad"]); if (auth instanceof NextResponse) return auth;
  // Fetch distinct years efficiently using a simple query with ordering
  const years = new Set<number>();

  // Get min and max year in one query each (uses index, instant)
  const [{ data: minData }, { data: maxData }] = await Promise.all([
    supabaseServer.from("ventas_raw").select("anio").order("anio", { ascending: true }).limit(1),
    supabaseServer.from("ventas_raw").select("anio").order("anio", { ascending: false }).limit(1),
  ]);

  const minYear = minData?.[0]?.anio;
  const maxYear = maxData?.[0]?.anio;

  if (minYear && maxYear) {
    for (let y = minYear; y <= maxYear; y++) {
      years.add(y);
    }
  }

  const currentYear = new Date().getFullYear();
  years.add(currentYear);

  return NextResponse.json([...years].sort((a, b) => b - a));
}

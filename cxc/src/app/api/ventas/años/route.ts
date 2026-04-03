import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { supabaseServer } from "@/lib/supabase-server";

export async function GET(req: NextRequest) {
  const auth = requireRole(req, ["admin", "director"]); if (auth instanceof NextResponse) return auth;
  // Fetch all distinct years from ventas_raw — paginate to get all rows
  const years = new Set<number>();
  let offset = 0;
  const PAGE = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from("ventas_raw")
      .select("anio")
      .range(offset, offset + PAGE - 1);

    if (error) {
      console.error("[ventas/años]", error.code, error.message);
      break;
    }

    for (const r of data ?? []) {
      years.add(r.anio);
    }

    if (!data || data.length < PAGE) break;
    offset += PAGE;
  }

  const currentYear = new Date().getFullYear();
  years.add(currentYear);

  return NextResponse.json([...years].sort((a, b) => b - a));
}

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireRole } from "@/lib/requireRole";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = requireRole(req, ["admin", "secretaria", "director"]);
  if (auth instanceof NextResponse) return auth;
  const name = req.nextUrl.searchParams.get("name");
  if (!name) return NextResponse.json([]);
  const { data } = await supabaseServer
    .from("cxc_rows")
    .select("company_key, codigo, nombre, d0_30, d31_60, d61_90, d91_120, d121_180, d181_270, d271_365, mas_365, total")
    .eq("nombre_normalized", name);
  return NextResponse.json(data || []);
}

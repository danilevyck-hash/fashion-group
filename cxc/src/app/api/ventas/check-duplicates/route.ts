import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireRole } from "@/lib/requireRole";

export async function POST(req: NextRequest) {
  const auth = requireRole(req, ["admin", "secretaria"]);
  if (auth instanceof NextResponse) return auth;

  const { empresa, n_sistemas } = await req.json();
  if (!empresa || !Array.isArray(n_sistemas) || n_sistemas.length === 0) {
    return NextResponse.json({ existing: [] });
  }

  // Check in batches of 500 (Supabase IN limit)
  const existing = new Set<string>();
  for (let i = 0; i < n_sistemas.length; i += 500) {
    const batch = n_sistemas.slice(i, i + 500);
    const { data } = await supabaseServer
      .from("ventas_raw")
      .select("n_sistema")
      .eq("empresa", empresa)
      .in("n_sistema", batch);
    if (data) {
      for (const r of data) existing.add(r.n_sistema);
    }
  }

  return NextResponse.json({ existing: [...existing] });
}

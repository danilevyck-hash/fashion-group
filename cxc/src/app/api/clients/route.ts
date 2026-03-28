import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export async function GET() {
  const { data, error } = await supabaseServer.from("cxc_rows").select("id, company_key, nombre_normalized, nombre_original, total, d0_30, d31_60, d61_90, d91_120, d121_180, d181_270, d271_365, mas_365");
  if (error) { console.error(error); return NextResponse.json({ error: "Error interno" }, { status: 500 }); }
  return NextResponse.json(data);
}

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export async function GET() {
  const { data, error } = await supabaseServer
    .from("reclamos")
    .select("id")
    .limit(1);

  return NextResponse.json({
    ok: !error,
    error: error?.message,
    code: error?.code,
    details: error,
    data,
  });
}

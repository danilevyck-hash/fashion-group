import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireAuth } from "@/lib/require-auth";

export async function GET(req: NextRequest) {
  const authError = requireAuth(req, ["admin"]);
  if (authError) return authError;

  const { data, error } = await supabaseServer.from("activity_logs").select("*").order("created_at", { ascending: false }).limit(50);
  if (error) return NextResponse.json({ error: "Error al cargar" }, { status: 500 });
  return NextResponse.json(data || []);
}

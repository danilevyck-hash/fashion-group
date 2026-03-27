import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q");
  if (!q || q.length < 2) return NextResponse.json([]);

  const { data, error } = await supabaseServer
    .from("directorio_clientes")
    .select("nombre, empresa, correo, whatsapp")
    .ilike("nombre", `%${q}%`)
    .limit(5);

  if (error) return NextResponse.json([]);
  return NextResponse.json(data || []);
}

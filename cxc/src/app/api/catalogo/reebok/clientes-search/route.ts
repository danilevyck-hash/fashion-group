import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q");
  if (!q || q.length < 2) return NextResponse.json([]);

  // Try with whatsapp column first, fall back without it
  let data = null;
  const { data: d1, error: e1 } = await supabaseServer
    .from("directorio_clientes")
    .select("nombre, empresa, correo, whatsapp, telefono, celular")
    .ilike("nombre", `%${q}%`)
    .limit(5);

  if (!e1) {
    data = d1;
  } else {
    // whatsapp column may not exist yet — query without it
    const { data: d2 } = await supabaseServer
      .from("directorio_clientes")
      .select("nombre, empresa, correo, telefono, celular")
      .ilike("nombre", `%${q}%`)
      .limit(5);
    data = (d2 || []).map((r: Record<string, string>) => ({ ...r, whatsapp: r.celular || r.telefono || "" }));
  }

  return NextResponse.json(data || []);
}

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireRole } from "@/lib/requireRole";

export const dynamic = "force-dynamic";

// Autocomplete del nombre de cliente sobre el directorio (compartido con Reebok:
// directorio_clientes no es específico de marca). Espejo de la ruta homónima de
// Reebok para paridad del detalle de pedido.
export async function GET(req: NextRequest) {
  const auth = requireRole(req, ["admin", "secretaria", "vendedor"]);
  if (auth instanceof NextResponse) return auth;
  const q = req.nextUrl.searchParams.get("q");
  if (!q || q.length < 2) return NextResponse.json([]);

  // Intenta con la columna whatsapp; si no existe, cae sin ella.
  let data = null;
  const { data: d1, error: e1 } = await supabaseServer
    .from("directorio_clientes")
    .select("nombre, empresa, correo, whatsapp, telefono, celular")
    .ilike("nombre", `%${q}%`)
    .limit(5);

  if (!e1) {
    data = d1;
  } else {
    const { data: d2 } = await supabaseServer
      .from("directorio_clientes")
      .select("nombre, empresa, correo, telefono, celular")
      .ilike("nombre", `%${q}%`)
      .limit(5);
    data = (d2 || []).map((r: Record<string, string>) => ({ ...r, whatsapp: r.celular || r.telefono || "" }));
  }

  return NextResponse.json(data || []);
}

// Autocomplete del nombre de cliente sobre el directorio (compartido entre
// marcas: directorio_clientes no es específico de marca). La marca del segmento
// solo valida la ruta — la búsqueda es idéntica para todas.

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { getMarcaConfig } from "@/lib/catalogo/marcas";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { marca: string } }) {
  const cfg = getMarcaConfig(params.marca);
  if (!cfg) return NextResponse.json({ error: "Marca desconocida" }, { status: 404 });

  const auth = requireRole(req, ["admin", "secretaria", "vendedor"]);
  if (auth instanceof NextResponse) return auth;
  const q = req.nextUrl.searchParams.get("q");
  if (!q || q.length < 2) return NextResponse.json([]);

  const supabaseServer = await cfg.mainDb();

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
    // La columna whatsapp puede no existir aún — query sin ella.
    const { data: d2 } = await supabaseServer
      .from("directorio_clientes")
      .select("nombre, empresa, correo, telefono, celular")
      .ilike("nombre", `%${q}%`)
      .limit(5);
    data = (d2 || []).map((r: Record<string, string>) => ({ ...r, whatsapp: r.celular || r.telefono || "" }));
  }

  return NextResponse.json(data || []);
}

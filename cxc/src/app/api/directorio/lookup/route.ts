import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export async function GET(req: NextRequest) {
  const nombres = req.nextUrl.searchParams.get("nombres");
  if (!nombres) return NextResponse.json([]);

  const nameList = nombres.split(",").map(n => n.trim()).filter(Boolean);
  if (nameList.length === 0) return NextResponse.json([]);

  const { data, error } = await supabaseServer
    .from("directorio_clientes")
    .select("nombre, whatsapp, telefono, celular");

  if (error) { console.error(error); return NextResponse.json({ error: "Error interno" }, { status: 500 }); }

  const results = nameList.map(cxcName => {
    const match = (data || []).find(d =>
      d.nombre && cxcName &&
      d.nombre.toLowerCase().includes(cxcName.toLowerCase().slice(0, 10))
    );
    return {
      nombre_cxc: cxcName,
      nombre_dir: match?.nombre || null,
      whatsapp: match?.whatsapp || match?.celular || match?.telefono || null,
    };
  });

  return NextResponse.json(results);
}

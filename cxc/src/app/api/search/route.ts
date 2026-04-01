import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q || q.length < 2) {
    return NextResponse.json({ cxc: [], reclamos: [], guias: [], directorio: [] });
  }

  const pattern = `%${q}%`;

  const [cxcRes, reclamosRes, guiasRes, dirRes] = await Promise.all([
    // CxC: buscar por nombre
    supabaseServer
      .from("cxc_rows")
      .select("id, nombre_normalized, total, company_key")
      .ilike("nombre_normalized", pattern)
      .order("total", { ascending: false })
      .limit(5),

    // Reclamos: buscar por nro_reclamo o nro_factura
    supabaseServer
      .from("reclamos")
      .select("id, nro_reclamo, nro_factura, empresa, estado, fecha_reclamo")
      .or(`nro_reclamo.ilike.${pattern},nro_factura.ilike.${pattern}`)
      .order("created_at", { ascending: false })
      .limit(5),

    // Guías: buscar por numero (text) o destinatario en guia_items
    supabaseServer
      .from("guia_transporte")
      .select("id, numero, fecha, transportista, estado")
      .or(`transportista.ilike.${pattern},observaciones.ilike.${pattern}`)
      .order("numero", { ascending: false })
      .limit(5),

    // Directorio: buscar por nombre o empresa
    supabaseServer
      .from("directorio_clientes")
      .select("id, nombre, empresa, correo, celular")
      .or(`nombre.ilike.${pattern},empresa.ilike.${pattern}`)
      .order("nombre")
      .limit(5),
  ]);

  // Also search guias by numero if q is numeric
  let guiasData = guiasRes.data || [];
  if (/^\d+$/.test(q)) {
    const numRes = await supabaseServer
      .from("guia_transporte")
      .select("id, numero, fecha, transportista, estado")
      .eq("numero", parseInt(q))
      .limit(5);
    if (numRes.data?.length) {
      const existingIds = new Set(guiasData.map((g) => g.id));
      for (const g of numRes.data) {
        if (!existingIds.has(g.id)) guiasData.push(g);
      }
      guiasData = guiasData.slice(0, 5);
    }
  }

  return NextResponse.json({
    cxc: cxcRes.data || [],
    reclamos: reclamosRes.data || [],
    guias: guiasData,
    directorio: dirRes.data || [],
  });
}

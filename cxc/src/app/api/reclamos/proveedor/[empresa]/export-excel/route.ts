import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireRole } from "@/lib/requireRole";
import { buildBulkReclamosExcel, fetchReclamosForEmpresa, BulkSelector } from "@/lib/reclamos/excel-bulk";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: { empresa: string } }) {
  const auth = requireRole(req, ["admin", "secretaria", "director"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const empresa = decodeURIComponent(params.empresa || "");
    if (!empresa) return NextResponse.json({ error: "Empresa requerida" }, { status: 400 });

    const body = (await req.json().catch(() => ({}))) as BulkSelector;
    const reclamos = await fetchReclamosForEmpresa(empresa, body);
    if (!reclamos.length) {
      return NextResponse.json({ error: "No hay reclamos para los criterios indicados." }, { status: 404 });
    }

    const { data: contactos } = await supabaseServer
      .from("reclamo_contactos")
      .select("*")
      .eq("empresa", empresa)
      .limit(1);
    const contacto = contactos?.[0] || null;

    const buf = await buildBulkReclamosExcel(reclamos, empresa, contacto);
    const safeName = empresa.replace(/[^A-Za-z0-9_-]+/g, "_");
    const filename = `Reclamos_${safeName}_${new Date().toISOString().slice(0, 10)}.xlsx`;

    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error interno";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { buildBulkReclamosPdf, type ReclamoFull } from "@/lib/reclamos/pdf-bulk";
import { fetchReclamosForEmpresa, type BulkSelector } from "@/lib/reclamos/fetch-empresa";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: { empresa: string } }) {
  const auth = requireRole(req, ["admin", "secretaria"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const empresa = decodeURIComponent(params.empresa || "");
    if (!empresa) return NextResponse.json({ error: "Empresa requerida" }, { status: 400 });

    const body = (await req.json().catch(() => ({}))) as BulkSelector;
    const reclamos = await fetchReclamosForEmpresa<ReclamoFull>(empresa, body);
    if (!reclamos.length) {
      return NextResponse.json({ error: "No hay reclamos para los criterios indicados." }, { status: 404 });
    }

    const doc = await buildBulkReclamosPdf(reclamos, empresa);
    const buf = doc.output("arraybuffer");
    const safeName = empresa.replace(/[^A-Za-z0-9_-]+/g, "_");
    const filename = `Reclamos_${safeName}_${new Date().toISOString().slice(0, 10)}.pdf`;

    return new NextResponse(Buffer.from(buf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error interno";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

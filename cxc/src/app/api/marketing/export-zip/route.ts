import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { buildMarketingZip } from "@/lib/marketing/zip-export";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // descargar fotos/PDFs + comprimir + zip

// POST /api/marketing/export-zip
//   body: { busqueda?: string, marca_id?: string | null }
// Respeta el filtro de pantalla (busqueda + marca). Excluye gastos/proyectos
// anulados. Devuelve un ZIP con carpeta por cliente (sin nivel de proyecto):
// fotos/ + subcarpeta por gasto con su factura.pdf, más resumen_gastos.xlsx.
export async function POST(req: NextRequest) {
  const auth = requireRole(req, ["admin", "secretaria"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = (await req.json().catch(() => ({}))) as {
      busqueda?: string;
      marca_id?: string | null;
    };

    const result = await buildMarketingZip({
      busqueda: body.busqueda,
      marcaId: body.marca_id ?? null,
    });

    const fecha = new Date().toISOString().slice(0, 10);
    const filename = `Gastos-Marketing-${fecha}.zip`;

    return new NextResponse(new Uint8Array(result.buffer), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "X-Gastos-Count": String(result.gastos),
        "X-Proyectos-Count": String(result.proyectos),
        "X-Fotos-Incluidas": String(result.fotosIncluidas),
        "X-Fotos-Omitidas": String(result.fotosOmitidas),
        "X-Pdfs-Incluidos": String(result.pdfsIncluidos),
        "X-Pdfs-Omitidos": String(result.pdfsOmitidos),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error interno";
    if (message === "SIN_RESULTADOS") {
      return NextResponse.json(
        { error: "No hay gastos para los criterios indicados." },
        { status: 404 },
      );
    }
    console.error("POST /api/marketing/export-zip:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

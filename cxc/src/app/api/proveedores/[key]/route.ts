import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { supabaseServer } from "@/lib/supabase-server";
import { fetchAllProveedorRows, buildFicha, normProvName } from "@/lib/proveedores";

export const dynamic = "force-dynamic";

// Ficha de un proveedor (agregado across-empresas) + reclamos vinculados.
export async function GET(
  req: NextRequest,
  { params }: { params: { key: string } },
): Promise<NextResponse> {
  const auth = requireRole(req, ["admin", "contabilidad"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const key = decodeURIComponent(params.key); // ya viene normalizado (UPPER, sin puntuación)
    const rows = await fetchAllProveedorRows();
    const ficha = buildFicha(rows, key);
    if (!ficha) {
      return NextResponse.json({ error: "Proveedor no encontrado" }, { status: 404 });
    }

    // Reclamos vinculados: por nombre de proveedor normalizado (mismo criterio de
    // identidad). reclamos.proveedor es texto libre; matcheamos por norma.
    const { data: recl, error: rErr } = await supabaseServer
      .from("reclamos")
      .select("id,nro_reclamo,proveedor,empresa,marca,nro_factura,nro_orden_compra,fecha_reclamo,estado")
      .eq("deleted", false)
      .order("fecha_reclamo", { ascending: false });
    if (rErr) console.error(`[proveedores ficha] reclamos: ${rErr.message}`);

    const reclamos = (recl ?? [])
      .filter((r) => normProvName(r.proveedor) === key)
      .map((r) => ({
        id: r.id,
        nro_reclamo: r.nro_reclamo,
        empresa: r.empresa,
        marca: r.marca,
        nro_factura: r.nro_factura,
        nro_orden_compra: r.nro_orden_compra,
        fecha_reclamo: r.fecha_reclamo,
        estado: r.estado,
      }));

    return NextResponse.json({ ...ficha, reclamos });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error interno" },
      { status: 500 },
    );
  }
}

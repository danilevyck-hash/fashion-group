import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { supabaseServer } from "@/lib/supabase-server";
import { fetchAllProveedorRows, buildFicha, normProvName } from "@/lib/proveedores";
import { paresDelProveedor, reclamosDelProveedor } from "@/lib/reclamos/proveedor-vinculo";

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

    // ── RECLAMOS VINCULADOS ─────────────────────────────────────────────────
    // 🔴 Se unen por el par (empresa, CÓDIGO del proveedor), nunca por el
    // nombre. `reclamos.proveedor` es texto libre y Switch escribe otra grafía:
    // medido el 4-sep-2026, 26 de los 34 reclamos vivos NO cruzaban por nombre
    // («American Fashion Wear» contra «American Fashion Wear, SA») y las fichas
    // de Fashion Wear y Fashion Shoes mostraban cero reclamos sin decir por qué.
    // El par viaja junto porque el código NO es único entre empresas: `122` es
    // American Fashion Wear en Fashion Wear y Latin Fitness Group en Active Shoes.
    const pares = paresDelProveedor(
      rows.filter((r) => normProvName(r.nombre) === key),
    );

    const { data: recl, error: rErr } = await supabaseServer
      .from("reclamos")
      .select("id,nro_reclamo,proveedor,proveedor_codigo,empresa,marca,nro_factura,nro_orden_compra,fecha_reclamo,estado")
      .eq("deleted", false)
      .order("fecha_reclamo", { ascending: false });
    // Si `proveedor_codigo` todavía no existe (la migración 20260922120000 no
    // corrió), esta lectura falla y la ficha se dibuja SIN reclamos vinculados.
    // El resto de la ficha —saldo, aging, empresas— no depende de esto.
    if (rErr) console.error(`[proveedores ficha] reclamos: ${rErr.message}`);

    const reclamos = reclamosDelProveedor(recl ?? [], pares)
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

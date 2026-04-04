import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireRole } from "@/lib/requireRole";

export async function GET(req: NextRequest) {
  const auth = requireRole(req, ["admin", "secretaria", "director"]);
  if (auth instanceof NextResponse) return auth;
  const empresa = req.nextUrl.searchParams.get("empresa");
  const estado = req.nextUrl.searchParams.get("estado");

  let query = supabaseServer.from("reclamos").select("*, reclamo_items(*)").order("created_at", { ascending: false });
  if (empresa) query = query.eq("empresa", empresa);
  if (estado) query = query.eq("estado", estado);

  const { data, error } = await query;
  if (error) { console.error(error); return NextResponse.json({ error: "Error interno" }, { status: 500 }); }

  const header = "N° Reclamo;Empresa;Proveedor;Marca;N° Factura;N° Orden Compra;Fecha Reclamo;Estado;Referencia;Descripción;Talla;Cantidad;Precio Unit.;Subtotal Item;Importación (10%);ITBMS (7%);Total Item;Motivo;Notas";
  const rows: string[] = [];

  for (const r of data || []) {
    const items = r.reclamo_items || [];
    if (items.length === 0) {
      rows.push([r.nro_reclamo, r.empresa, r.proveedor, r.marca, r.nro_factura, r.nro_orden_compra, r.fecha_reclamo, r.estado, "", "", "", "", "", "", "", "", "", "", r.notas].join(";"));
    } else {
      for (const item of items) {
        const sub = item.subtotal || 0;
        const imp = sub * 0.10;   // Tasa de importación 10%
        const itbms = sub * 0.077; // ITBMS 7.7%
        const tot = sub + imp + itbms;
        rows.push([r.nro_reclamo, r.empresa, r.proveedor, r.marca, r.nro_factura, r.nro_orden_compra, r.fecha_reclamo, r.estado, item.referencia, item.descripcion, item.talla, item.cantidad, item.precio_unitario, sub.toFixed(2), imp.toFixed(2), itbms.toFixed(2), tot.toFixed(2), item.motivo, r.notas].join(";"));
      }
    }
  }

  const csv = [header, ...rows].join("\n");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="reclamos_${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireRole } from "@/lib/requireRole";
import { csvWithBom, buildCsv, CSV_MIME } from "@/lib/csv-export";
import { reclamoTaxes, ocultaPedido } from "@/lib/reclamos/tax";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = requireRole(req, ["admin", "secretaria"]);
  if (auth instanceof NextResponse) return auth;
  const empresa = req.nextUrl.searchParams.get("empresa");
  const estado = req.nextUrl.searchParams.get("estado");

  let query = supabaseServer.from("reclamos").select("*, reclamo_items(*)").order("created_at", { ascending: false });
  if (empresa) query = query.eq("empresa", empresa);
  if (estado) query = query.eq("estado", estado);

  const { data, error } = await query;
  if (error) { console.error(error); return NextResponse.json({ error: "Error interno" }, { status: 500 }); }

  // Sin porcentaje en el encabezado: este CSV mezcla empresas con tasas
  // DISTINTAS (Active Shoes importación 15% sin ITBMS; el resto 10% + ITBMS 7%),
  // así que ningún número fijo acá sería cierto para todas las filas. El
  // rótulo con la tasa va en los papeles POR EMPRESA (PDF y Excel), que sí
  // la derivan de la constante — ver itbmsLabel/impLabel en lib/reclamos/tax.
  const header = ["N° Reclamo", "Empresa", "Proveedor", "Marca", "N° Factura", "N° Orden Compra", "Fecha Reclamo", "Estado", "Referencia", "Descripción", "Talla", "Cantidad", "Precio Unit.", "Subtotal Item", "Importación", "ITBMS", "Total Item", "Motivo", "Notas"];
  const rows: unknown[][] = [];

  for (const r of data || []) {
    const items = r.reclamo_items || [];
    // Active Shoes no usa N° de pedido → columna en blanco.
    const pedido = ocultaPedido(r.empresa) ? "" : r.nro_orden_compra;
    if (items.length === 0) {
      rows.push([r.nro_reclamo, r.empresa, r.proveedor, r.marca, r.nro_factura, pedido, r.fecha_reclamo, r.estado, "", "", "", "", "", "", "", "", "", "", r.notas]);
    } else {
      for (const item of items) {
        // subtotal no existe en la tabla — se deriva cantidad × precio.
        const sub = (Number(item.cantidad) || 0) * (Number(item.precio_unitario) || 0);
        // Impuestos por empresa (Active Shoes: importación 15%, sin ITBMS).
        const tx = reclamoTaxes(r.empresa, sub);
        rows.push([r.nro_reclamo, r.empresa, r.proveedor, r.marca, r.nro_factura, pedido, r.fecha_reclamo, r.estado, item.referencia, item.descripcion, item.talla, item.cantidad, item.precio_unitario, sub.toFixed(2), tx.importacion.toFixed(2), tx.itbms.toFixed(2), tx.total.toFixed(2), item.motivo, r.notas]);
      }
    }
  }

  const csv = buildCsv([header, ...rows], ",");
  return new NextResponse(csvWithBom(csv), {
    headers: {
      "Content-Type": CSV_MIME,
      "Content-Disposition": `attachment; filename="reclamos_${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}

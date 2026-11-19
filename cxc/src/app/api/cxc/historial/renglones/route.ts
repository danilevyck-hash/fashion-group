// ─────────────────────────────────────────────────────────────────────────────
// GET /api/cxc/historial/renglones?empresa=vistana&tipo=Factura&id=12345
//
// Los productos de UNA factura del historial: estilo, descripción, cantidad y
// precio, de `switch_factura_lineas`. Esa tabla cubre solo las 6 del grupo:
// Boston y Multifashion no tienen renglones (la pantalla lo dice sin llamar).
//
// 🔴 La empresa se valida contra lo que puede ver quien pide (6 del grupo, o la
// del vendedor): una empresa ajena contesta 404, nunca sus renglones.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireRole } from "@/lib/requireRole";
import { leerTodoPaginado } from "@/lib/supabase-paginado";
import { esTipoVentaConocido } from "@/lib/ventas/tipos-comprobante";
import { ROLES_HISTORIAL_GRUPO, empresasDeQuienPide } from "@/lib/cxc/historial-servidor";
import { HISTORIAL_CLIENTE_2026_11, type RenglonFactura } from "@/lib/cxc/historial-cliente";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function GET(req: NextRequest) {
  if (!HISTORIAL_CLIENTE_2026_11) return NextResponse.json({ error: "No disponible" }, { status: 404 });
  const auth = requireRole(req, ROLES_HISTORIAL_GRUPO);
  if (auth instanceof NextResponse) return auth;

  const sp = req.nextUrl.searchParams;
  const empresa = sp.get("empresa") ?? "";
  const tipo = sp.get("tipo") ?? "";
  const id = Number(sp.get("id"));
  if (!esTipoVentaConocido(tipo) || !Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Factura no válida" }, { status: 400 });
  }
  const empresas = await empresasDeQuienPide(auth.role, auth.userId);
  if (!empresas.includes(empresa)) return NextResponse.json({ error: "No encontrada" }, { status: 404 });

  try {
    const filas = await leerTodoPaginado<{ codigo: string | null; descripcion: string | null; cantidad: unknown; precio: unknown; subtotal_con_descuento: unknown }>(
      `switch_factura_lineas (${empresa} ${id})`,
      (pedirCount, desde, hasta) =>
        supabaseServer
          .from("switch_factura_lineas")
          .select("codigo,descripcion,cantidad,precio,subtotal_con_descuento", pedirCount ? { count: "exact" } : {})
          .eq("empresa_key", empresa)
          .eq("tipo_comprobante", tipo)
          .eq("switch_factura_id", id)
          .order("linea_orden", { ascending: true })
          .order("id", { ascending: true })
          .range(desde, hasta),
    );
    const renglones: RenglonFactura[] = filas.map((r) => ({
      codigo: r.codigo ?? "",
      descripcion: r.descripcion ?? "",
      cantidad: Number(r.cantidad) || 0,
      precio: Number(r.precio) || 0,
      subtotal: Number(r.subtotal_con_descuento) || 0,
    }));
    return NextResponse.json({ renglones });
  } catch (e) {
    console.error(`[cxc/historial/renglones] ${empresa} ${id}:`, e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "No se pudieron leer los productos" }, { status: 500 });
  }
}

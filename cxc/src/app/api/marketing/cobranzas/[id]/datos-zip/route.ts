import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireRole } from "@/lib/requireRole";
import {
  getCobranzaById,
  getProyectoById,
  getFacturasByProyecto,
  getAdjuntosByProyecto,
} from "@/lib/marketing/queries";
import { firmarAdjuntos } from "@/lib/marketing/storage";
import type { MkAdjunto, MkMarca, MkFactura } from "@/lib/marketing/types";

export const dynamic = "force-dynamic";

/**
 * GET /api/marketing/cobranzas/[id]/datos-zip
 * Devuelve todos los datos que el browser necesita para armar el ZIP con
 * generarZipCobranza (lado cliente). No genera el ZIP aquí.
 *
 * Respuesta: { cobranza, proyecto, marca, facturas, adjuntosFacturas, fotosProyecto }
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = requireRole(req, ["admin", "secretaria", "director"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const cobranza = await getCobranzaById(params.id);
    if (!cobranza) {
      return NextResponse.json({ error: "Cobranza no existe" }, { status: 404 });
    }

    const [proyecto, facturasConAdj, fotosProyecto, marcaData] = await Promise.all([
      getProyectoById(cobranza.proyecto_id),
      getFacturasByProyecto(cobranza.proyecto_id),
      getAdjuntosByProyecto(cobranza.proyecto_id),
      supabaseServer
        .from("mk_marcas")
        .select("*")
        .eq("id", cobranza.marca_id)
        .maybeSingle(),
    ]);

    if (!proyecto) {
      return NextResponse.json({ error: "Proyecto no existe" }, { status: 404 });
    }
    if (marcaData.error || !marcaData.data) {
      return NextResponse.json({ error: "Marca no existe" }, { status: 404 });
    }

    const marca = marcaData.data as unknown as MkMarca;

    // Facturas planas + adjuntos aplanados
    const facturas: MkFactura[] = facturasConAdj.map((f) => ({
      id: f.id,
      proyecto_id: f.proyecto_id,
      numero_factura: f.numero_factura,
      fecha_factura: f.fecha_factura,
      proveedor: f.proveedor,
      concepto: f.concepto,
      subtotal: f.subtotal,
      itbms: f.itbms,
      total: f.total,
      anulado_en: f.anulado_en,
      anulado_motivo: f.anulado_motivo,
      created_at: f.created_at,
      updated_at: f.updated_at,
    }));

    const adjuntosFacturasRaw: MkAdjunto[] = facturasConAdj.flatMap((f) => f.adjuntos);
    const [adjuntosFacturas, fotosFirmadas] = await Promise.all([
      firmarAdjuntos(adjuntosFacturasRaw),
      firmarAdjuntos(fotosProyecto),
    ]);

    return NextResponse.json({
      cobranza,
      proyecto,
      marca,
      facturas,
      adjuntosFacturas,
      fotosProyecto: fotosFirmadas,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error interno";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

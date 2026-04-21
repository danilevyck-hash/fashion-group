import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { supabaseServer } from "@/lib/supabase-server";
import {
  getProyectoById,
  getFacturasByProyecto,
  getAdjuntosByProyecto,
} from "@/lib/marketing/queries";
import { firmarAdjuntos } from "@/lib/marketing/storage";
import type {
  MarcaConPorcentaje,
  MkAdjunto,
  MkFactura,
  MkMarca,
} from "@/lib/marketing/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// GET /api/marketing/proyectos/[id]/datos-zip
// Devuelve todo lo necesario para armar el ZIP client-side:
//   { proyecto, facturas (con marcas por factura), adjuntos por factura,
//     fotos proyecto, catálogo de marcas involucradas }
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = requireRole(req, ["admin", "secretaria", "director"]);
  if (auth instanceof NextResponse) return auth;
  if (!uuidRegex.test(params.id)) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  try {
    const proyecto = await getProyectoById(params.id);
    if (!proyecto) {
      return NextResponse.json({ error: "Proyecto no existe" }, { status: 404 });
    }

    const [facturasConAdj, fotosProyecto] = await Promise.all([
      getFacturasByProyecto(params.id),
      getAdjuntosByProyecto(params.id),
    ]);

    const facturaIds = facturasConAdj.map((f) => f.id);
    const [fmRes, marcasRes] = await Promise.all([
      facturaIds.length > 0
        ? supabaseServer
            .from("mk_factura_marcas")
            .select("factura_id, marca_id, porcentaje")
            .in("factura_id", facturaIds)
        : Promise.resolve({ data: [], error: null }),
      supabaseServer.from("mk_marcas").select("*"),
    ]);

    if (fmRes.error) throw new Error(`fm: ${fmRes.error.message}`);
    if (marcasRes.error) throw new Error(`marcas: ${marcasRes.error.message}`);

    const marcas = (marcasRes.data ?? []) as MkMarca[];
    const marcaById = new Map(marcas.map((m) => [String(m.id), m]));

    // marcas por factura
    const marcasByFactura = new Map<string, MarcaConPorcentaje[]>();
    for (const r of (fmRes.data ?? []) as Array<{
      factura_id: string;
      marca_id: string;
      porcentaje: number;
    }>) {
      const marca = marcaById.get(String(r.marca_id));
      if (!marca) continue;
      const arr = marcasByFactura.get(String(r.factura_id)) ?? [];
      arr.push({ marca, porcentaje: Number(r.porcentaje ?? 0) });
      marcasByFactura.set(String(r.factura_id), arr);
    }

    // Aplanar facturas sin adjuntos para el payload JSON
    const facturas: Array<
      MkFactura & {
        marcas: MarcaConPorcentaje[];
      }
    > = facturasConAdj.map((f) => ({
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
      marcas: marcasByFactura.get(f.id) ?? [],
    }));

    // Adjuntos (PDFs de factura + fotos de proyecto) firmados
    const adjuntosFacturasRaw: MkAdjunto[] = facturasConAdj.flatMap(
      (f) => f.adjuntos,
    );
    const [adjuntosFacturas, fotosFirmadas] = await Promise.all([
      firmarAdjuntos(adjuntosFacturasRaw),
      firmarAdjuntos(fotosProyecto),
    ]);

    // Marcas involucradas (únicas, orden alfabético)
    const marcasInvolucradasSet = new Set<string>();
    for (const f of facturas) {
      for (const m of f.marcas) marcasInvolucradasSet.add(m.marca.id);
    }
    const marcasInvolucradas = Array.from(marcasInvolucradasSet)
      .map((id) => marcaById.get(id))
      .filter((x): x is MkMarca => !!x)
      .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

    return NextResponse.json({
      proyecto,
      facturas,
      adjuntosFacturas,
      fotosProyecto: fotosFirmadas,
      marcasInvolucradas,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error interno";
    console.error("GET /proyectos/[id]/datos-zip:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

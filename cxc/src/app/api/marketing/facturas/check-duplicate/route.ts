import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

// GET /api/marketing/facturas/check-duplicate
//   ?numero_factura=FE-0001&proveedor=Pintor%20XYZ&proyecto_id_actual=<uuid>
//
// Respuesta: { existe: boolean, facturas: [...] }
// Solo facturas vigentes (anulado_en IS NULL). Matching case-insensitive con
// trim en proveedor. numero_factura exacto.
export async function GET(req: NextRequest) {
  const auth = requireRole(req, ["admin", "secretaria", "director"]);
  if (auth instanceof NextResponse) return auth;

  const url = new URL(req.url);
  const numeroFactura = (url.searchParams.get("numero_factura") ?? "").trim();
  const proveedor = (url.searchParams.get("proveedor") ?? "").trim();
  const proyectoIdActual = url.searchParams.get("proyecto_id_actual");

  if (!numeroFactura || !proveedor) {
    return NextResponse.json({ existe: false, facturas: [] });
  }

  try {
    const { data, error } = await supabaseServer
      .from("mk_facturas")
      .select(
        "id, numero_factura, proveedor, total, proyecto_id, proyecto:mk_proyectos(id, nombre, tienda)",
      )
      .eq("numero_factura", numeroFactura)
      .ilike("proveedor", proveedor)
      .is("anulado_en", null);
    if (error) throw new Error(error.message);

    type Row = {
      id: string;
      numero_factura: string;
      proveedor: string;
      total: number;
      proyecto_id: string;
      proyecto:
        | { id: string; nombre: string | null; tienda: string | null }
        | Array<{ id: string; nombre: string | null; tienda: string | null }>
        | null;
    };

    const rows = (data ?? []) as unknown as Row[];
    const facturas = rows.map((r) => {
      const proy = Array.isArray(r.proyecto) ? r.proyecto[0] : r.proyecto;
      const proyectoNombre =
        proy?.nombre || proy?.tienda || "Proyecto sin nombre";
      return {
        id: String(r.id),
        numero_factura: String(r.numero_factura),
        proveedor: String(r.proveedor),
        total: Number(r.total ?? 0),
        proyecto_id: String(r.proyecto_id),
        proyecto_nombre: proyectoNombre,
        es_mismo_proyecto: proyectoIdActual
          ? String(r.proyecto_id) === proyectoIdActual
          : false,
      };
    });

    const res = NextResponse.json({
      existe: facturas.length > 0,
      facturas,
    });
    res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
    return res;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error interno";
    console.error("GET /api/marketing/facturas/check-duplicate:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
